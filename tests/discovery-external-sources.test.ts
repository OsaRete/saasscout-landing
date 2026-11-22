import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { collectExternalSources } from "../lib/evidence/sources/discovery-external-sources.ts";

import { withProviderBudget } from "../lib/spending/provider-budget.ts";
const admittedSources = (limit: number) => withProviderBudget(
  { userId: "synthetic-user", workflow: "discovery", requestId: "synthetic-request" },
  () => collectExternalSources(limit),
  { rpc: async () => ({ data: true, error: null }) },
);

const originalSerpApiKey = process.env.SERPAPI_API_KEY;
const originalXBearerToken = process.env.X_BEARER_TOKEN;

afterEach(() => {
  if (originalSerpApiKey === undefined) delete process.env.SERPAPI_API_KEY;
  else process.env.SERPAPI_API_KEY = originalSerpApiKey;
  if (originalXBearerToken === undefined) delete process.env.X_BEARER_TOKEN;
  else process.env.X_BEARER_TOKEN = originalXBearerToken;
  mock.restoreAll();
});

describe("collectExternalSources", () => {
  it("preserves Google/X source shape, categorization, scoring, deduplication and final limit", async () => {
    process.env.SERPAPI_API_KEY = "serp-key";
    process.env.X_BEARER_TOKEN = "x-token";

    const requestedUrls: string[] = [];
    mock.method(globalThis, "fetch", async (url: string | URL) => {
      const urlValue = String(url);
      requestedUrls.push(urlValue);

      if (urlValue.startsWith("https://serpapi.com/search.json")) {
        return new Response(
          JSON.stringify({
            organic_results: [
              {
                title: "Manual workflow for agency clients",
                link: "https://example.com/manual-workflow",
                snippet: "Agencies wasting time in google sheets for client operations.",
                position: 3,
              },
              {
                title: "Duplicate manual workflow result",
                link: "https://example.com/manual-workflow",
                snippet: "Duplicate should be removed by URL.",
                position: 4,
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response(
        JSON.stringify({
          data: [
            {
              id: "tweet-1",
              text: "Our agency business is wasting time on manual workflow and client operations every day.",
              lang: "en",
              public_metrics: {
                like_count: 4,
                reply_count: 3,
                quote_count: 2,
                bookmark_count: 1,
                impression_count: 100,
              },
            },
            {
              id: "tweet-2",
              text: "RT @someone business workflow should not pass",
              lang: "en",
              public_metrics: { like_count: 1000 },
            },
          ],
        }),
        { status: 200 }
      );
    });

    const { sources } = await admittedSources(2);

    assert.equal(
      requestedUrls.filter((url) => url.startsWith("https://serpapi.com/search.json")).length,
      4
    );
    assert.equal(
      requestedUrls.some((url) => url.startsWith("https://api.x.com/2/tweets/search/recent")),
      true
    );
    assert.deepEqual(sources, [
      {
        title: "Manual workflow for agency clients",
        url: "https://example.com/manual-workflow",
        snippet: "Agencies wasting time in google sheets for client operations.",
        source_type: "google_search",
        source_rank: 3,
        signal_score: 0,
        category: "Sales",
      },
      {
        title: "X Signal: Our agency business is wasting time on manual workflow and client operations every day.",
        url: "https://x.com/i/web/status/tweet-1",
        snippet: "Our agency business is wasting time on manual workflow and client operations every day.",
        source_type: "x",
        source_rank: 1,
        signal_score: 17,
        category: "Sales",
      },
    ]);
  });

  it("preserves X API failure behavior by returning only non-X results", async () => {
    process.env.SERPAPI_API_KEY = "serp-key";
    process.env.X_BEARER_TOKEN = "x-token";

    mock.method(globalThis, "fetch", async (url: string | URL) => {
      const urlValue = String(url);

      if (urlValue.startsWith("https://serpapi.com/search.json")) {
        return new Response(
          JSON.stringify({
            organic_results: [
              {
                title: "Spreadsheet operations problem",
                link: "https://example.com/spreadsheet-operations",
                snippet: "Teams still using spreadsheets to manage operations.",
                position: 1,
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ error: "rate limited" }), { status: 429 });
    });

    const errorLog = mock.method(console, "error", () => {});

    const { sources } = await admittedSources(3);

    assert.equal(errorLog.mock.callCount(), 1);
    assert.equal(sources.some((source) => source.source_type === "x"), false);
    assert.equal(sources[0].source_type, "google_search");
  });
});

it("optional X budget denial never dispatches X and retains metered Google sources", async () => {
  process.env.SERPAPI_API_KEY = "mock";
  process.env.X_BEARER_TOKEN = "mock";
  let requests = 0;
  mock.method(globalThis, "fetch", async (url: string | URL) => {
    assert.ok(String(url).startsWith("https://serpapi.com/search.json"));
    requests++;
    return new Response(JSON.stringify({organic_results:[{title:"Manual workflow",link:"https://example.test/manual",snippet:"Synthetic source"}]}));
  });
  const { sources } = await withProviderBudget({userId:"synthetic",workflow:"discovery",requestId:"x-disabled"},
    () => collectExternalSources(2),
    {rpc:async (_name,args)=>({data:args.p_provider!=="x",error:null})});
  assert.equal(requests, 4);
  assert.equal(sources.length,1);
});

const prioritizedQueries = [
  '"too much manual work" business',
  '"using spreadsheets to manage" business',
  '"need a better way to manage clients"',
  '"no good tool for" business',
];

for (const allowance of [4, 2, 0]) {
  it(`uses prioritized sequential searches with ${allowance} available units`, async () => {
    process.env.SERPAPI_API_KEY = "mock";
    delete process.env.X_BEARER_TOKEN;

    const attemptedReservations: unknown[] = [];
    const queries: string[] = [];
    let activeRequest: unknown = null;

    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = new URL(input);
      assert.equal(url.origin, "https://serpapi.com");
      assert.notEqual(activeRequest, null);
      queries.push(url.searchParams.get("q")!);
      return Response.json({ organic_results: [{
        title: "Synthetic search result",
        link: `https://example.test/source/${queries.length}`,
      }] });
    });

    const result = await withProviderBudget(
      { userId: "synthetic-user", workflow: "discovery", requestId: "budget-test" },
      () => collectExternalSources(10),
      { rpc: async (name, args) => {
        assert.equal(args.p_provider, "serpapi");
        if (name === "application_reserve_provider") {
          assert.equal(activeRequest, null, "previous dispatch must finish before the next reservation");
          assert.equal(args.p_slots, 1);
          attemptedReservations.push(args.p_request_id);
          return { data: attemptedReservations.length <= allowance, error: null };
        }
        assert.equal(args.p_slot, 1);
        if (name === "application_dispatch_provider") {
          assert.equal(activeRequest, null);
          activeRequest = args.p_request_id;
        } else {
          assert.equal(name, "application_finish_provider");
          assert.equal(activeRequest, args.p_request_id);
          activeRequest = null;
        }
        return { data: true, error: null };
      } },
    );

    assert.equal(activeRequest, null);
    assert.deepEqual(attemptedReservations,
      prioritizedQueries.slice(0, allowance + 1).map((_, index) => `budget-test:${index + 1}`));
    assert.deepEqual(queries, prioritizedQueries.slice(0, allowance));
    assert.deepEqual(result.sources.map((source) => source.url),
      queries.map((_, index) => `https://example.test/source/${index + 1}`));
    assert.equal(result.limitedSearchCoverage, allowance < prioritizedQueries.length);
  });
}

it("stops after an unsuccessful SerpAPI dispatch and retains earlier evidence", async () => {
  process.env.SERPAPI_API_KEY = "mock";
  delete process.env.X_BEARER_TOKEN;

  const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL) => {
    const query = new URL(input).searchParams.get("q");
    if (query === prioritizedQueries[0]) {
      return Response.json({ organic_results: [{
        title: "Synthetic result",
        link: "https://example.test/source",
      }] });
    }
    return Response.json({ error: "Unavailable" }, { status: 503 });
  });

  const result = await admittedSources(10);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(result.limitedSearchCoverage, true);
  assert.deepEqual(result.sources.map((source) => source.url), ["https://example.test/source"]);
});

for (const failure of ["transport loss", "invalid JSON", "unsuccessful HTTP response"] as const) {
  it(`retains SerpAPI sources after optional X ${failure} without retrying X`, async () => {
    process.env.SERPAPI_API_KEY = "mock";
    process.env.X_BEARER_TOKEN = "mock";
    const origins: string[] = [];

    mock.method(globalThis, "fetch", async (input: string | URL) => {
      const { origin } = new URL(input);
      origins.push(origin);
      if (origin === "https://serpapi.com") {
        return Response.json({ organic_results: [{
          title: "Synthetic result",
          link: "https://example.test/source",
        }] });
      }
      if (failure === "transport loss") throw new TypeError("Synthetic transport loss");
      if (failure === "unsuccessful HTTP response") return Response.json({}, { status: 503 });
      return new Response("Invalid JSON");
    });
    mock.method(console, "error", () => {});

    const { sources, limitedSearchCoverage } = await admittedSources(10);

    assert.equal(limitedSearchCoverage, true);
    assert.deepEqual(sources.map((source) => source.url), ["https://example.test/source"]);
    assert.deepEqual(origins, [...Array(4).fill("https://serpapi.com"), "https://api.x.com"]);
  });
}
