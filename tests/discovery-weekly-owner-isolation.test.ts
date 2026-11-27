import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import { validationTestModule } from "./support/validation-module.ts";

const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const privateMarker = "BETA01_A_ONLY_72E7B1";
const legacyMarker = "BETA01_UNATTRIBUTED_LEGACY_WEEKLY";
const owners = [ownerA, ownerB];
const period = { period_start: "2026-11-09T00:00:00Z", period_end: "2026-11-16T00:00:00Z", timezone: "UTC", boundary: "[start,end)" } as const;
const runs = [
  ...owners.map((user_id, i) => ({ id: `run-${i}`, user_id, is_global: false, status: "completed", period_start: "2026-11-02T00:00:00Z", period_end: period.period_start, created_at: "2026-11-08T00:00:00Z", summary: `Private report ${i}` })),
  ...[ownerB, null].map((user_id, i) => ({ id: `legacy-${i}`, user_id, is_global: true, status: "completed", period_start: "2026-11-02T00:00:00Z", period_end: period.period_start, created_at: "2026-11-08T00:00:00Z", summary: legacyMarker })),
];
const problems = runs.map(({ id }, i) => ({
  run_id: id, problem_title: `PRIVATE_${i}_PROBLEM`,
  problem_summary: i === 0 ? `PRIVATE_0_SUMMARY ${privateMarker}` : i > 1 ? legacyMarker : `PRIVATE_${i}_SUMMARY`, source_evidence: `PRIVATE_${i}_EVIDENCE`, trend_score: 7,
}));
const sources = runs.map(({ id }, i) => ({
  run_id: id, source_title: `PRIVATE_${i}_SOURCE`,
  source_snippet: `PRIVATE_${i}_SNIPPET`, source_url: `https://example.test/private-${i}`, signal_score: 40,
}));

function harness(t: TestContext, failedTable?: string) {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role",
    OPENROUTER_API_KEY: "synthetic-ai-key",
    KNOWLEDGE_EVOLUTION_DUAL_WRITE: "0", KNOWLEDGE_EVOLUTION_DIAGNOSTICS: "0",
    DISCOVERY_ORCHESTRATOR_DIAGNOSTICS: "0", DISCOVERY_ORCHESTRATOR_ASSISTED_PERSISTENCE: "0",
    SNAPSHOT_PERSISTENCE_ENABLED: "0", SNAPSHOT_RETRIEVAL_MODE: "off",
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }

  t.mock.method(console, "info", () => {});
  t.mock.method(console, "error", () => {});
  const prompts: string[] = [];
  const reads: { table: string; params: URLSearchParams }[] = [];
  const writes: { table: string; rows: Record<string, unknown>[] }[] = [];
  const snapshots: unknown[] = [];
  const generatedRuns = new Map<string, Record<string, unknown>>();
  let authCalls = 0;

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });

  // Real supabase-js constructs all URLs, embedded joins and bearer headers.
  // Only transport is replaced; unknown destinations/tables fail the test.
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://synthetic.supabase.test");
    const headers = new Headers(init?.headers);
    if (url.pathname === "/auth/v1/user") {
      authCalls += 1;
      const index = ["Bearer token-a", "Bearer token-b"].indexOf(headers.get("authorization") || "");
      return index < 0 ? json({ message: "Invalid synthetic token" }, 401)
        : json({ id: owners[index], aud: "authenticated", role: "authenticated" });
    }
    if (url.pathname === "/rest/v1/rpc/application_beta_access") {
      assert.ok(["Bearer token-a", "Bearer token-b"].includes(headers.get("authorization") || ""));
      return json(true);
    }
    assert.equal(headers.get("apikey"), "synthetic-service-role");
    const table = url.pathname.replace("/rest/v1/", "");
    if (table === "rpc/application_admit_discovery") return json("admitted");
    if (table === "rpc/application_beta_member") return json(true);
    if (table === "rpc/claim_weekly_intelligence_run") {
      const args = JSON.parse(String(init?.body));
      const id = `generated-${owners.indexOf(args.p_user_id)}`;
      const existing = generatedRuns.get(id);
      if (existing?.status === "completed") return json([{ claim_status: "completed", run: existing }]);
      const run = { ...period, id, user_id: args.p_user_id, is_global: false, status: "processing", spending_execution_attempts: 1 };
      generatedRuns.set(id, run);
      return json([{ claim_status: "claimed", run }]);
    }
    if (table === "application_discovery_admissions" && init?.method === "PATCH") return json(null);
    if (table === "weekly_intelligence_runs" && init?.method === "PATCH") {
      const id = url.searchParams.get("id")?.slice(3) || "";
      const run = generatedRuns.get(id);
      assert.ok(run);
      assert.equal(url.searchParams.get("user_id"), `eq.${run.user_id}`);
      assert.equal(url.searchParams.get("is_global"), "eq.false");
      const changed = { ...run, ...JSON.parse(String(init.body)) };
      generatedRuns.set(id, changed);
      writes.push({ table, rows: [changed] });
      return json(changed);
    }
    if (table === "weekly_detected_problems" && init?.method === "DELETE") return json(null);
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const rows = Array.isArray(body) ? body : [body];
      writes.push({ table, rows });
      if (table === "opportunity_discoveries") return json({ id: "discovery-a", created_at: "2026-11-13T00:00:00Z", ...rows[0] });
      assert.ok(["discovered_problems", "weekly_detected_problems", "operational_events"].includes(table), table);
      return json(rows);
    }
    reads.push({ table, params: url.searchParams });
    if (table === failedTable) return json({ code: "SYNTHETIC_FAILURE", message: "Synthetic query failure" }, 500);
    if (table === "user_profiles") return json({ user_id: url.searchParams.get("user_id")?.slice(3), plan: "free" });
    if (table === "discovered_problems") return json([]);
    if (table === "problem_intelligence") {
      return url.searchParams.has("problem_title") ? json(null)
        : json([{ id: "legacy-catalog-a", problem_title: privateMarker, intelligence_score: 91, prepared_count: 3, converted_count: 2 }]);
    }
    const owner = url.searchParams.get("user_id")?.slice(3);
    if (table === "scan") {
      return json(owners.filter((id) => id === owner).map((id) => ({
        id: `scan-${owners.indexOf(id)}`, user_id: id, market: `Founder ${owners.indexOf(id)} workflow`, status: "completed",
        evidence: id === ownerA ? `The owner found workflow evidence ${privateMarker}` : "Independent owner research about invoice handoffs.",
        created_at: "2026-11-13T00:00:00Z",
      })));
    }
    if (table === "weekly_intelligence_runs") {
      const select = url.searchParams.get("select");
      assert.equal(url.searchParams.get("is_global"), "eq.false");
      const rowId = url.searchParams.get("id")?.slice(3);
      let rows = [...runs, ...generatedRuns.values()].filter((run) => run.user_id === owner && run.is_global === false);
      if (rowId) rows = rows.filter((run) => run.id === rowId);
      const priorBound = url.searchParams.get("period_end")?.slice(3);
      if (priorBound) rows = rows.filter((run) => String(run.period_end) < priorBound);
      const historyBound = url.searchParams.get("period_start")?.slice(3);
      if (historyBound) rows = rows.filter((run) => String(run.period_start) < historyBound);
      return json(select === "status" ? rows[0] : rows);
    }
    if (["opportunities", "opportunity_discoveries", "saved_ideas", "snapshot_identities", "discovery_actions"].includes(table)) return json([]);
    assert.ok(["weekly_detected_problems", "weekly_sources"].includes(table), table);
    let rows: Record<string, unknown>[] = table === "weekly_sources" ? sources : problems;
    if (url.searchParams.get("select")?.includes("weekly_intelligence_runs!inner")) {
      const owner = url.searchParams.get("weekly_intelligence_runs.user_id")?.slice(3);
      rows = rows.flatMap((row) => {
        const excludeGlobal = url.searchParams.get("weekly_intelligence_runs.is_global") === "eq.false";
        const parent = runs.find((run) => run.id === row.run_id && run.user_id === owner && (!excludeGlobal || !run.is_global));
        return parent ? [{ ...row, weekly_intelligence_runs: parent }] : [];
      });
    } else if (url.searchParams.has("run_id")) {
      const filter = url.searchParams.get("run_id") || "";
      const runIds = filter.startsWith("eq.") ? [filter.slice(3)] : filter.slice(4, -1).split(",");
      const generatedProblems = writes.filter((write) => write.table === "weekly_detected_problems").flatMap((write) => write.rows);
      rows = [...rows, ...generatedProblems].filter((row) => runIds.includes(String(row.run_id)));
    }
    return json(rows);
  };

  function mockModule(specifier: string, importer: string): unknown {
    if (specifier === "@supabase/supabase-js") return {
      createClient(url: string, key: string, options?: SupabaseClientOptions<"public">) {
        return createClient(url, key, {
          ...options, auth: { persistSession: false, autoRefreshToken: false },
          global: { ...options?.global, fetch: transport },
        });
      },
    };
    if (specifier === "openai") return class MockOpenAI {
      chat = { completions: { create: async (request: { messages: { content: string }[] }) => {
        const prompt = request.messages.map((message) => message.content).join("\n");
        prompts.push(prompt);
        if (prompt.includes("Reporting period:")) {
          const evidence = JSON.parse(prompt.split("User-owned evidence for this period:\n")[1].split("\n")[0]);
          return { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ summary: evidence.excerpt, problems: [{
            problem_title: `Delayed traceability for ${evidence.title}`, problem_summary: evidence.excerpt, evidence_references: [evidence.evidenceId],
          }] }) } }] };
        }
        // Echo only the model's actual context, making any leak observable in
        // the persisted summary, generated problem and returned API response.
        const context = prompt.split("Internal data moat:\n")[1]?.split("\nReturn ")[0] || "";
        return { choices: [{ message: { content: JSON.stringify({ summary: context, problems: [{
          problem_title: "Agency reporting bottlenecks", problem_summary: "Agencies spend hours assembling recurring client reports from scattered dashboards.",
          affected_niches: "Agencies", suggested_solutions: "Reporting automation", problem_cluster: "Operations",
          source_evidence: context, pain_score: 8, revenue_score: 7, urgency_score: 7,
        }] }) } }] };
      } } };
    };
    if (specifier.endsWith("/discovery-external-sources")) return { collectExternalSources: async () => ({ sources: [], limitedSearchCoverage: true }) };
    if (specifier.endsWith("/weekly-external-evidence")) return {
      ...validationTestModule("lib/weekly-external-evidence.ts"),
      createWeeklySerpApiProvider: () => ({ collect: async () => { throw new Error("Real provider dispatch is forbidden"); } }),
      collectWeeklyExternalEvidence: async () => ({ status: "no_results", observations: [], metrics: { normalizedExternalResultCount: 0, sourceDegraded: false } }),
    };
    if (specifier.endsWith("/discover-opportunities-shadow-runner")) return { runDiscoverOpportunitiesSnapshotRetrievalShadow: async () => null };
    if (specifier.endsWith("/discover-opportunities-adapter")) return {
      buildDiscoverOpportunitiesSnapshotInput(input: unknown) { snapshots.push(input); return input; },
    };
    // The existing loader resolves files; resolve directory entrypoints here.
    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      const path = specifier.startsWith("@/") ? resolve(specifier.slice(2)) : resolve(dirname(importer), specifier);
      if (existsSync(path) && statSync(path).isDirectory()) return validationTestModule(`${path}/index.ts`, mockModule);
    }
    return undefined;
  }
  const route = validationTestModule("app/api/discover-opportunities/route.ts", mockModule);
  const weeklyRoute = validationTestModule("app/api/weekly-intelligence/route.ts", mockModule);

  return {
    post: route.POST as (req: Request) => Promise<Response>,
    generateWeekly: weeklyRoute.runWeeklyGenerationForUser as (ownerId: string, weeklyPeriod: typeof period) => Promise<{ run: Record<string, unknown>; problems: Record<string, unknown>[]; reused: boolean }>,
    getWeekly: weeklyRoute.GET as (req: Request) => Promise<Response>,
    prompts, reads, writes, snapshots, authCalls: () => authCalls,
  };
}

for (const [index, token] of ["token-a", "token-b"].entries()) {
  test(`authenticated owner ${index} receives only owned Weekly context through final model input and output`, async (t) => {
    const h = harness(t);
    const foreignIndex = 1 - index;
    const response = await h.post(new Request("https://app.test/api/discover-opportunities", {
      method: "POST", headers: { "Idempotency-Key": "00000000-0000-4000-8000-000000000099", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: owners[foreignIndex], ownerId: owners[foreignIndex] }),
    }));
    assert.equal(response.status, 200);
    const output = await response.json();
    assert.equal(output.success, true);
    assert.equal(output.discovery.user_id, owners[index]);
    assert.ok(output.problems.length > 0);
    assert.equal(h.authCalls(), 1);
    assert.equal(h.prompts.length, 2, "initial and bounded replacement model calls are both checked");
    const foreign = new RegExp(`PRIVATE_${foreignIndex}_|private-${foreignIndex}`);
    assert.deepEqual({
      modelInput: h.prompts.some((prompt) => foreign.test(prompt)),
      apiOutput: foreign.test(JSON.stringify(output)),
      persistedWrites: foreign.test(JSON.stringify(h.writes)),
      snapshotInput: foreign.test(JSON.stringify(h.snapshots)),
    }, { modelInput: false, apiOutput: false, persistedWrites: false, snapshotInput: false });
    for (const prompt of h.prompts) {
      assert.match(prompt, new RegExp(`PRIVATE_${index}_PROBLEM`));
      assert.match(prompt, new RegExp(`PRIVATE_${index}_SOURCE`));
      assert.doesNotMatch(prompt, new RegExp(`${foreign.source}|${legacyMarker}`));
      assert.equal(prompt.includes(privateMarker), index === 0);
    }
    for (const table of ["weekly_detected_problems", "weekly_sources"]) {
      const query = h.reads.find((read) => read.table === table)!.params;
      assert.equal(query.get("select"), "*,weekly_intelligence_runs!inner(id,user_id,is_global)");
      assert.equal(query.get("weekly_intelligence_runs.user_id"), `eq.${owners[index]}`);
      assert.equal(query.get("weekly_intelligence_runs.is_global"), "eq.false");
    }
    assert.match(JSON.stringify(output), new RegExp(`PRIVATE_${index}_EVIDENCE`));
    assert.doesNotMatch(JSON.stringify([output, h.writes, h.snapshots]), new RegExp(`PRIVATE_${foreignIndex}_|private-${foreignIndex}`));
    assert.equal(output.data_moat_sources_used, 2);
    assert.ok(h.reads.every((read) => read.table !== "problem_intelligence"));
    assert.ok(h.writes.every((write) => write.table !== "problem_intelligence"));
  });
}

test("Weekly generation and report routes isolate the same private marker across two founders", async (t) => {
  const h = harness(t);
  const a = await h.generateWeekly(ownerA, period);
  const b = await h.generateWeekly(ownerB, period);
  assert.equal(h.prompts.length, 2);
  assert.match(h.prompts[0], new RegExp(privateMarker));
  assert.match(h.prompts[1], /Independent owner research/);
  assert.doesNotMatch(h.prompts[1], new RegExp(`${privateMarker}|${legacyMarker}`));
  assert.match(JSON.stringify([a.run, a.problems]), new RegExp(privateMarker));
  assert.doesNotMatch(JSON.stringify([b.run, b.problems]), new RegExp(`${privateMarker}|${legacyMarker}`));
  assert.equal(a.problems[0].run_id, a.run.id);
  assert.equal(b.problems[0].run_id, b.run.id);
  assert.ok(h.reads.every((read) => read.table !== "problem_intelligence"));
  assert.ok(h.writes.every((write) => write.table !== "problem_intelligence"));
  const reused = await h.generateWeekly(ownerA, period);
  assert.equal(reused.reused, true);
  assert.match(JSON.stringify(reused.problems), new RegExp(privateMarker));
  assert.equal(h.prompts.length, 2, "reuse must not call the provider");

  const project = (token: string, id?: unknown) => h.getWeekly(new Request(`https://app.test/api/weekly-intelligence${id ? `?runId=${id}` : ""}`, { headers: { Authorization: `Bearer ${token}` } }));
  const ownHistory = await project("token-a", a.run.id);
  assert.equal(ownHistory.status, 200);
  assert.match(await ownHistory.text(), new RegExp(privateMarker));
  assert.equal((await project("token-b", a.run.id)).status, 404);
  assert.equal((await project("token-b", "legacy-0")).status, 404);
  const bHistory = await project("token-b");
  assert.equal(bHistory.status, 200);
  const history = await bHistory.text();
  assert.match(history, /Independent owner research/);
  assert.doesNotMatch(history, new RegExp(`${privateMarker}|${legacyMarker}`));
});

for (const authorization of [undefined, "Bearer ", "Bearer invalid-token"]) {
  test(`missing/invalid authentication fails before privileged reads: ${authorization ?? "missing"}`, async (t) => {
    const h = harness(t);
    const response = await h.post(new Request("https://app.test/api/discover-opportunities", {
      method: "POST", headers: authorization ? { Authorization: authorization } : {},
      body: JSON.stringify({ userId: ownerA }),
    }));
    assert.equal(response.status, 401);
    assert.deepEqual(h.reads, []);
    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.prompts, []);
  });
}

for (const table of ["weekly_detected_problems", "weekly_sources"]) {
  test(`${table} query failure cannot fall back to unscoped context or invoke AI`, async (t) => {
    const h = harness(t, table);
    const response = await h.post(new Request("https://app.test/api/discover-opportunities", {
      method: "POST", headers: { "Idempotency-Key": "00000000-0000-4000-8000-000000000099", Authorization: "Bearer token-a" },
    }));
    assert.equal(response.status, 500);
    assert.deepEqual(h.prompts, []);
    assert.ok(!h.writes.some((write) => write.table === "opportunity_discoveries"));
  });
}
