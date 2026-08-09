import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapAuthoritativeWeeklyToDashboard } from "../lib/weekly-intelligence.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("legacy generate-weekly-report route is a deprecated compatibility endpoint with no persistence path", () => {
  const route = read("app/api/generate-weekly-report/route.ts");
  assert.match(route, /deprecated/i);
  assert.match(route, /authoritative_endpoint/);
  assert.doesNotMatch(route, /weekly_reports/);
  assert.doesNotMatch(route, /weekly_niches/);
  assert.doesNotMatch(route, /\.from\("weekly_intelligence_runs"\)/);
  assert.doesNotMatch(route, /\.from\("weekly_detected_problems"\)/);
});

test("dashboard consumes authoritative Weekly tables and not legacy weekly tables", () => {
  const dashboard = read("app/dashboard/page.tsx");
  assert.match(dashboard, /weekly_intelligence_runs/);
  assert.match(dashboard, /weekly_detected_problems/);
  assert.doesNotMatch(dashboard, /weekly_reports/);
  assert.doesNotMatch(dashboard, /weekly_niches/);
});

test("authoritative weekly route uses Data Moat aggregation before persistence", () => {
  const route = read("app/api/weekly-intelligence/route.ts");
  const service = read("lib/weekly-intelligence-service.ts");
  assert.match(route, /aggregateUserDataMoat/);
  assert.match(service, /validateWeeklyModelOutput/);
  assert.match(route, /weekly_intelligence_runs/);
  assert.match(route, /weekly_detected_problems/);
});

test("authoritative weekly persistence uses idempotent run and problem conflict keys", () => {
  const route = read("app/api/weekly-intelligence/route.ts");
  assert.match(route, /claim_weekly_intelligence_run/);

  const consolidationMigration = read("supabase/migrations/20260721000000_consolidate_weekly_intelligence_pipeline.sql");
  const repairMigration = read("supabase/migrations/20260805000000_repair_weekly_run_claim_contract.sql");
  assert.match(repairMigration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(repairMigration, /on conflict \(user_id, period_start, period_end\)/);
  assert.match(repairMigration, /weekly_intelligence_runs_user_period_unique/);
  assert.match(consolidationMigration, /weekly_detected_problems_run_title_key_unique/);
  assert.match(consolidationMigration, /weekly_detected_problems\(run_id, problem_title_key\)/);
});

test("dashboard compatibility model is derived from authoritative run and problem rows", () => {
  const result = mapAuthoritativeWeeklyToDashboard(
    {
      id: "run-1",
      period_start: "2026-07-13T00:00:00.000Z",
      period_end: "2026-07-20T00:00:00.000Z",
      summary: "Weekly summary",
      total_sources_analyzed: 4,
    },
    [
      { id: "problem-b", run_id: "run-1", problem_title: "B", affected_niches: "B2B", pain_score: 8, trend_score: 7 },
      { id: "problem-a", run_id: "run-1", problem_title: "A", affected_niches: "Agencies", pain_score: 6, trend_score: 9 },
    ],
  );

  assert.equal(result.weeklyReport?.week_start, "2026-07-13T00:00:00.000Z");
  assert.equal(result.weeklyReport?.strongest_trend, "A");
  assert.equal(result.weeklyReport?.average_trend_score, 8);
  assert.deepEqual(result.weeklyNiches.map((niche) => niche.id), ["problem-a", "problem-b"]);
});

import { normalizeWeeklyProblemsForPersistence, runAuthoritativeWeeklyGenerationForUser, type AuthoritativeWeeklyGenerationRepository } from "../lib/weekly-intelligence-service.ts";

test("manual route and scheduler share the authoritative Weekly service", () => {
  const manualRoute = read("app/api/weekly-intelligence/route.ts");
  const scheduler = read("app/api/cron/route.ts");
  assert.match(manualRoute, /runAuthoritativeWeeklyGenerationForUser/);
  assert.match(scheduler, /runWeeklyGenerationForUser/);
  assert.doesNotMatch(scheduler, /generate-weekly-report/);
  assert.doesNotMatch(scheduler, /weekly_reports/);
  assert.doesNotMatch(scheduler, /weekly_niches/);
});

test("scheduler selects eligible users from server-owned profiles", () => {
  const scheduler = read("app/api/cron/route.ts");
  assert.match(scheduler, /from\("user_profiles"\)/);
  assert.match(scheduler, /weekly_intelligence_enabled/);
  assert.match(scheduler, /CRON_SECRET/);
  assert.doesNotMatch(scheduler, /auth\.getUser/);
});

test("title normalization collapses formatting-only duplicates", () => {
  const problems = normalizeWeeklyProblemsForPersistence([
    { problem_title: "Fitness Coaches", problem_summary: "A", affected_niches: "N", suggested_solutions: "S", pain_score: 8, revenue_score: 7, urgency_score: 6, trend_score: 5, monetization_angle: "M", source_evidence: "E", buying_signal_score: 1, frequency_score: 1, opportunity_score: 1, problem_cluster: "c", source_quality_score: 1 },
    { problem_title: "fitness   coaches ", problem_summary: "B", affected_niches: "N", suggested_solutions: "S", pain_score: 9, revenue_score: 7, urgency_score: 6, trend_score: 5, monetization_angle: "M", source_evidence: "E", buying_signal_score: 1, frequency_score: 1, opportunity_score: 1, problem_cluster: "c", source_quality_score: 1 },
  ]);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].problem_title, "Fitness Coaches");
});

function fakeRepository(claimStatus: "claimed" | "completed" | "processing" | "reclaimed") {
  const calls: string[] = [];
  const repo: AuthoritativeWeeklyGenerationRepository = {
    async claimRun() { calls.push("claim"); return { status: claimStatus, run: { id: "run-1", total_sources_analyzed: 2 } }; },
    async getProblemsForRun() { calls.push("getProblems"); return [{ id: "problem-1" }]; },
    async completeRun() { calls.push("complete"); return { id: "run-1", status: "completed", total_sources_analyzed: 1 }; },
    async replaceProblems() { calls.push("replaceProblems"); return [{ id: "new-problem" }]; },
    async markRunFailed() { calls.push("markFailed"); },
  };
  return { repo, calls };
}

test("duplicate concurrent request receiving processing does not invoke aggregation or model", async () => {
  const { repo, calls } = fakeRepository("processing");
  let modelCalls = 0;
  const result = await runAuthoritativeWeeklyGenerationForUser({
    userId: "user-1",
    period: { period_start: "2026-07-13T00:00:00.000Z", period_end: "2026-07-20T00:00:00.000Z", timezone: "UTC", boundary: "[start,end)" },
    dependencies: {
      repository: repo,
      aggregate: async () => { throw new Error("aggregate should not run"); },
      analyze: async () => { modelCalls += 1; return { summary: "bad", problems: [] }; },
    },
  });
  assert.equal(result.status, "processing");
  assert.equal(modelCalls, 0);
  assert.deepEqual(calls, ["claim"]);
});

test("completed duplicate request returns existing report without model generation", async () => {
  const { repo, calls } = fakeRepository("completed");
  const result = await runAuthoritativeWeeklyGenerationForUser({
    userId: "user-1",
    period: { period_start: "2026-07-13T00:00:00.000Z", period_end: "2026-07-20T00:00:00.000Z", timezone: "UTC", boundary: "[start,end)" },
    dependencies: { repository: repo, aggregate: async () => { throw new Error("no"); }, analyze: async () => ({ summary: "bad", problems: [] }) },
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.problems, [{ id: "problem-1" }]);
  assert.deepEqual(calls, ["claim", "getProblems"]);
});

test("claimed generation replaces children exactly once", async () => {
  const { repo, calls } = fakeRepository("claimed");
  const result = await runAuthoritativeWeeklyGenerationForUser({
    userId: "user-1",
    period: { period_start: "2026-07-13T00:00:00.000Z", period_end: "2026-07-20T00:00:00.000Z", timezone: "UTC", boundary: "[start,end)" },
    dependencies: {
      repository: repo,
      aggregate: async () => ({ items: [{ kind: "scan", source: "completed_scans", id: "scan-1", title: "Scan", summary: "Evidence", occurredAt: "2026-07-14T00:00:00.000Z" }], sharedContext: [], bySource: {} }),
      analyze: async () => ({ summary: "ok", problems: [{ problem_title: "Problem", source_evidence: "scan", evidence_references: ["scan-1"] }] }),
    },
  });
  assert.equal(result.status, "claimed");
  assert.deepEqual(calls, ["claim", "replaceProblems", "complete"]);
});

test("migration cleans historical duplicates before unique title-key constraint", () => {
  const migration = read("supabase/migrations/20260721000000_consolidate_weekly_intelligence_pipeline.sql");
  assert.match(migration, /update public\.weekly_detected_problems/);
  assert.match(migration, /delete from public\.weekly_detected_problems duplicate/);
  assert.match(migration, /weekly_detected_problems_run_title_key_unique/);
  assert.match(migration, /claim_weekly_intelligence_run/);
});

test("weekly route protects completed reports from replacement or failed marking", () => {
  const route = read("app/api/weekly-intelligence/route.ts");
  assert.match(route, /runRow\?\.status === "completed"/);
  assert.match(route, /return getProblemsForRun\(runId\)/);
  assert.match(route, /\.neq\("status", "completed"\)/);
});

test("weekly diagnostics distinguish button and schedule entry paths without unsafe content", () => {
  const manualRoute = read("app/api/weekly-intelligence/route.ts");
  const scheduler = read("app/api/cron/route.ts");
  assert.match(manualRoute, /entryPath: "weekly_button"/);
  assert.match(scheduler, /entryPath: "weekly_schedule"/);
  assert.match(scheduler, /Could not generate weekly intelligence/);
  assert.doesNotMatch(scheduler, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(scheduler, /authorization: authHeader|CRON_SECRET[^;]+results/);
});

test("Vercel cron is documented as Monday UTC and points at authoritative scheduler", () => {
  const vercel = read("vercel.json");
  const docs = read("docs/ENTRY_PATH_COMPATIBILITY_REPAIR.md");
  assert.match(vercel, /"path": "\/api\/cron"/);
  assert.match(vercel, /"schedule": "0 8 \* \* 1"/);
  assert.match(docs, /every Monday at 08:00 UTC/);
  assert.match(docs, /same authoritative Weekly generation service/);
});

test("weekly generation replaces validated children before completing the run", () => {
  const service = read("lib/weekly-intelligence-service.ts");
  assert.ok(service.indexOf("repository.replaceProblems") < service.indexOf("repository.completeRun"));
});


test("weekly claim repair preflights duplicates and keeps RPC service-role only", () => {
  const migration = read("supabase/migrations/20260805000000_repair_weekly_run_claim_contract.sql");
  assert.match(migration, /contains duplicate user-period rows/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = public/);
  assert.match(migration, /revoke all on function public\.claim_weekly_intelligence_run/);
  assert.match(migration, /revoke execute on function public\.claim_weekly_intelligence_run[^;]+from anon/);
  assert.match(migration, /revoke execute on function public\.claim_weekly_intelligence_run[^;]+from authenticated/);
  assert.match(migration, /grant execute on function public\.claim_weekly_intelligence_run[^;]+to service_role/);
});

test("weekly route validates claim RPC statuses and logs safe database diagnostics", () => {
  const route = read("app/api/weekly-intelligence/route.ts");
  assert.match(route, /WEEKLY_CLAIM_STATUSES/);
  assert.match(route, /parseWeeklyClaimRpcResponse/);
  assert.match(route, /weekly_claim_rpc_failed/);
  assert.match(route, /postgresCode/);
  assert.match(route, /argumentPresence/);
  assert.doesNotMatch(route, /error\.message[^;]+throw new Response/);
});
