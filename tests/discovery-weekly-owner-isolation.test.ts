import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import { validationTestModule } from "./support/validation-module.ts";

const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const sharedTitle = "SHARED_AGGREGATE";
const owners = [ownerA, ownerB];
const runs = owners.map((user_id, i) => ({ id: `run-${i}`, user_id }));
const problems = owners.map((_, i) => ({
  run_id: `run-${i}`, problem_title: `PRIVATE_${i}_PROBLEM`,
  problem_summary: `PRIVATE_${i}_SUMMARY`, source_evidence: `PRIVATE_${i}_EVIDENCE`, trend_score: 7,
}));
const sources = owners.map((_, i) => ({
  run_id: `run-${i}`, source_title: `PRIVATE_${i}_SOURCE`,
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
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const rows = Array.isArray(body) ? body : [body];
      writes.push({ table, rows });
      if (table === "opportunity_discoveries") return json({ id: "discovery-a", created_at: "2026-11-13T00:00:00Z", ...rows[0] });
      assert.ok(["discovered_problems", "problem_intelligence", "operational_events"].includes(table), table);
      return json(rows);
    }
    reads.push({ table, params: url.searchParams });
    if (table === failedTable) return json({ code: "SYNTHETIC_FAILURE", message: "Synthetic query failure" }, 500);
    if (table === "user_profiles") return json({ user_id: url.searchParams.get("user_id")?.slice(3), plan: "free" });
    if (table === "discovered_problems") return json([]);
    if (table === "problem_intelligence") {
      return url.searchParams.has("problem_title") ? json(null)
        : json([{ problem_title: sharedTitle, intelligence_score: 91, prepared_count: 3, converted_count: 2 }]);
    }
    assert.ok(["weekly_detected_problems", "weekly_sources"].includes(table), table);
    let rows: Record<string, unknown>[] = table === "weekly_sources" ? sources : problems;
    if (url.searchParams.get("select")?.includes("weekly_intelligence_runs!inner")) {
      const owner = url.searchParams.get("weekly_intelligence_runs.user_id")?.slice(3);
      rows = rows.flatMap((row) => {
        const parent = runs.find((run) => run.id === row.run_id && run.user_id === owner);
        return parent ? [{ ...row, weekly_intelligence_runs: parent }] : [];
      });
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
    if (specifier.endsWith("/discovery-external-sources")) return { collectExternalSources: async () => [] };
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

  return {
    post: route.POST as (req: Request) => Promise<Response>,
    prompts, reads, writes, snapshots, authCalls: () => authCalls,
  };
}

for (const [index, token] of ["token-a", "token-b"].entries()) {
  test(`authenticated owner ${index} receives only owned Weekly context through final model input and output`, async (t) => {
    const h = harness(t);
    const foreignIndex = 1 - index;
    const response = await h.post(new Request("https://app.test/api/discover-opportunities", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
      assert.match(prompt, new RegExp(sharedTitle));
      assert.doesNotMatch(prompt, foreign);
    }
    for (const table of ["weekly_detected_problems", "weekly_sources"]) {
      const query = h.reads.find((read) => read.table === table)!.params;
      assert.equal(query.get("select"), "*,weekly_intelligence_runs!inner(id,user_id)");
      assert.equal(query.get("weekly_intelligence_runs.user_id"), `eq.${owners[index]}`);
    }
    assert.match(JSON.stringify(output), new RegExp(`PRIVATE_${index}_EVIDENCE`));
    assert.doesNotMatch(JSON.stringify([output, h.writes, h.snapshots]), new RegExp(`PRIVATE_${foreignIndex}_|private-${foreignIndex}`));
    assert.equal(output.data_moat_sources_used, 3);
  });
}

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
      method: "POST", headers: { Authorization: "Bearer token-a" },
    }));
    assert.equal(response.status, 500);
    assert.deepEqual(h.prompts, []);
    assert.ok(!h.writes.some((write) => write.table === "opportunity_discoveries"));
  });
}
