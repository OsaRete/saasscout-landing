import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { collectExternalSources } from "../lib/evidence/sources/discovery-external-sources.ts";

const originalSerpApiKey = process.env.SERPAPI_API_KEY;
const originalXBearerToken = process.env.X_BEARER_TOKEN;

afterEach(() => {
  process.env.SERPAPI_API_KEY = originalSerpApiKey;
  process.env.X_BEARER_TOKEN = originalXBearerToken;
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

    const sources = await collectExternalSources(2);

    assert.equal(
      requestedUrls.filter((url) => url.startsWith("https://serpapi.com/search.json")).length,
      6
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

    const sources = await collectExternalSources(3);

    assert.equal(errorLog.mock.callCount(), 1);
    assert.equal(sources.some((source) => source.source_type === "x"), false);
    assert.equal(sources[0].source_type, "google_search");
  });
});
