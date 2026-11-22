import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as nodeModule from "node:module";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

// Resolve the app's Next.js aliases and extensionless imports for the Node test runner.
// The test runner uses Node 24, while this project still has Node 20 types.
const { registerHooks } = nodeModule as typeof nodeModule & {
  registerHooks(hooks: { resolve: nodeModule.ResolveHook }): { deregister(): void };
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const path = specifier.startsWith("@/")
      ? new URL(specifier.slice(2), new URL("../", import.meta.url))
      : specifier.startsWith(".") && context.parentURL
        ? new URL(specifier, context.parentURL)
        : null;
    if (path) {
      for (const suffix of [".ts", "/index.ts"]) {
        if (existsSync(fileURLToPath(path) + suffix)) {
          return nextResolve(path.href + suffix, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { discoverOpportunitiesWorkflow } = await import("../lib/intelligence/discover-opportunities-workflow.ts");
const { withProviderBudget } = await import("../lib/spending/provider-budget.ts");
hooks.deregister();

const snippet = "Operators copy spreadsheet data every week.";
const privateOutput = "synthetic private model output";
const userId = "owner-fixture";

function fixture(t: TestContext, mode: "empty" | "missing" | "grounded" | "invalid") {
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "info", () => {});
  const log = t.mock.method(console, "error", () => {});
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-key";
  process.env.SERPAPI_API_KEY = "fixture-key";
  process.env.OPENROUTER_API_KEY = "fixture-key";
  delete process.env.X_BEARER_TOKEN;
  let modelCalls = 0;
  const writes: string[] = [];

  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    if (url.hostname === "serpapi.com") {
      return Response.json({ organic_results: mode === "empty" ? [] : [{
        title: "Reporting source",
        link: "https://example.test/reporting",
        snippet,
      }] });
    }
    if (url.hostname === "openrouter.ai") {
      modelCalls++;
      return Response.json({ choices: [{ message: { content: mode === "invalid" ? privateOutput : JSON.stringify({
        problems: [{
          problem_title: "Weekly reporting reconciliation",
          problem_summary: "Operators copy spreadsheet data when preparing recurring reports.",
          ...(mode === "grounded" ? { source_evidence: snippet } : {}),
        }],
      }) } }] });
    }
    assert.equal(url.origin, "https://db.example.test");
    const table = url.pathname.split("/").at(-1);
    if (init?.method === "POST") {
      writes.push(table!);
      switch (table) {
        case "problem_intelligence":
        case "operational_events": return new Response(null, { status: 201 });
        case "opportunity_discoveries": return Response.json({ id: "discovery-fixture", user_id: userId });
        case "discovered_problems": return Response.json(JSON.parse(String(init.body)));
        default: assert.fail(`Unexpected write to ${table}`);
      }
    }
    if (table === "user_profiles") return Response.json([{ external_sources_limit: 10 }]);
    return Response.json([]);
  });

  return {
    run: () => withProviderBudget({ userId, workflow: "discovery", requestId: "request-fixture" },
      () => discoverOpportunitiesWorkflow(userId), { rpc: async () => ({ data: true, error: null }) }),
    modelCalls: () => modelCalls,
    writes,
    log,
  };
}

test("empty accepted source sets return an explicit outcome without model dispatch or saved opportunities", async (t) => {
  const mock = fixture(t, "empty");
  assert.deepEqual(await mock.run(), {
    success: true, outcome: "insufficient_evidence", discovery: null, problems: [],
    external_sources_analyzed: 0, data_moat_sources_used: 0,
  });
  assert.equal(mock.modelCalls(), 0);
  assert.deepEqual(mock.writes, ["operational_events", "operational_events"]);
});

test("missing model source evidence persists an interpretation without promoting it into knowledge", async (t) => {
  const mock = fixture(t, "missing");
  const result = await mock.run();
  assert.equal(result.external_sources_analyzed, 1);
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].source_evidence, "");
  assert.equal(mock.modelCalls(), 2);
  assert.deepEqual(mock.writes, ["operational_events", "opportunity_discoveries", "discovered_problems", "operational_events"]);
});

test("matched source evidence is attributed and eligible for the existing intelligence write", async (t) => {
  const mock = fixture(t, "grounded");
  const result = await mock.run();
  assert.equal(result.problems[0].source_evidence, `External source: Reporting source (https://example.test/reporting)
“${snippet}”`);
  assert.ok(mock.writes.includes("problem_intelligence"));
});

test("Discovery logs only a fixed diagnostic for malformed model JSON", async (t) => {
  const mock = fixture(t, "invalid");
  await assert.rejects(mock.run(), { message: "AI response was not valid JSON." });
  assert.deepEqual(mock.log.mock.calls.map(({ arguments: args }) => args), [
    ["Discovery model response could not be parsed.", { event: "discovery_model_invalid_json" }],
  ]);
});
