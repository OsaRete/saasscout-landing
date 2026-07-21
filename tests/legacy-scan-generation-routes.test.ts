import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const legacyRoutes = [
  "app/api/analyze-evidence/route.ts",
  "app/api/generate-opportunities/route.ts",
  "app/api/solution-intelligence/route.ts",
] as const;

const forbiddenIndependentGeneration = /OpenAI|OPENROUTER_API_KEY|buildTrustedUserIntent|buildGenerateOpportunitiesPrompt|generateProblemIntelligence|generateSolutionIntelligence|chat\.completions|parseStrictModelJson|validateGenerateOpportunitiesOutput|validateSolutionIntelligenceModelOutput|scan-user-evidence/;
const forbiddenPersistence = /\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|persist|artifact/i;

test("legacy Scan routes cannot execute independent Scan generation or persistence", () => {
  for (const file of legacyRoutes) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /LEGACY_SCAN_ROUTE_STATUS = 410/);
    assert.match(source, /legacy_scan_generation_route_rejected/);
    assert.match(source, /replacement: "\/api\/scan\/workflow"/);
    assert.doesNotMatch(source, forbiddenIndependentGeneration);
    assert.doesNotMatch(source, forbiddenPersistence);
  }
});

test("product Scan UI uses only the authoritative Scan workflow", () => {
  const page = readFileSync("app/scan/page.tsx", "utf8");
  assert.match(page, /fetch\("\/api\/scan\/workflow"/);
  assert.doesNotMatch(page, /\/api\/(analyze-evidence|generate-opportunities|solution-intelligence)/);
});

test("authoritative Scan workflow remains the only route allowed to call Scan model services", () => {
  const workflowRoute = readFileSync("app/api/scan/workflow/route.ts", "utf8");
  const workflow = readFileSync("lib/scan/workflow.ts", "utf8");
  assert.match(workflowRoute, /runScanServerOrchestration/);
  assert.match(workflow, /generateProblemModelOutput/);
  assert.match(workflow, /generateSolutionModelOutput/);
});

test("legacy Scan route POSTs return 410 for unauthenticated and authenticated callers without reading payload", async () => {
  const routes = await Promise.all([
    import("../app/api/analyze-evidence/route.ts"),
    import("../app/api/generate-opportunities/route.ts"),
    import("../app/api/solution-intelligence/route.ts"),
  ]);

  for (const [index, route] of routes.entries()) {
    const pathname = ["analyze-evidence", "generate-opportunities", "solution-intelligence"][index];
    const unauthenticated = await route.POST(new Request(`https://example.test/api/${pathname}`, {
      method: "POST",
      body: JSON.stringify({ evidence: "untrusted", user_id: "attacker", status: "completed" }),
    }));
    assert.equal(unauthenticated.status, 410);
    assert.deepEqual(await unauthenticated.json(), {
      success: false,
      error: "legacy_scan_generation_route_gone",
      message: "This legacy Scan generation endpoint has been retired. Use /api/scan/workflow for authenticated Scan generation.",
      replacement: "/api/scan/workflow",
    });

    const authenticated = await route.POST(new Request(`https://example.test/api/${pathname}`, {
      method: "POST",
      headers: { authorization: "Bearer fake-token", "x-request-id": "request-1" },
      body: JSON.stringify({ derivedAnalysis: "untrusted", confidence: 10, opportunities: [{ title: "fake" }] }),
    }));
    assert.equal(authenticated.status, 410);
  }
});
