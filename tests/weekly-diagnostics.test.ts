import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getWeeklyIntelligencePeriod } from "../lib/weekly-intelligence.ts";
import { createWeeklyExecutionId, runAuthoritativeWeeklyGenerationForUser, WeeklyDiagnosticError } from "../lib/weekly-intelligence-service.ts";

const period = getWeeklyIntelligencePeriod(new Date("2026-08-05T12:00:00.000Z"));

function repository(overrides: Record<string, unknown> = {}) {
  return {
    async claimRun() { return { status: "claimed" as const, run: { id: "run-1", plan: "pro" } }; },
    async getProblemsForRun() { return []; },
    async completeRun() { return { id: "run-1", status: "completed", plan: "pro" }; },
    async replaceProblems() { return []; },
    async markRunFailed() {},
    ...overrides,
  };
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    repository: repository(),
    async aggregate() { return { items: [], sharedContext: [], bySource: {}, diagnostics: { countsBySource: {}, skippedSources: [] } }; },
    async analyze() { return { summary: "ok", problems: [] }; },
    log() {},
    now: new Date("2026-08-05T12:00:00.000Z"),
    weeklyExecutionId: "weekly_test",
    entryPath: "button" as const,
    ...overrides,
  };
}

test("weekly period resolves to Monday UTC boundaries", () => {
  assert.equal(period.period_start, "2026-08-03T00:00:00.000Z");
  assert.equal(period.period_end, "2026-08-10T00:00:00.000Z");
  assert.equal(period.timezone, "UTC");
});

test("current-period completed report is reused with safe diagnostic code", async () => {
  const result = await runAuthoritativeWeeklyGenerationForUser({
    userId: "user-1",
    period,
    dependencies: deps({ repository: repository({ async claimRun() { return { status: "completed" as const, run: { id: "run-1", total_sources_analyzed: 3, plan: "pro" } }; } }) }),
  });
  assert.equal(result.code, "weekly_current_period_reused");
  assert.equal(result.weeklyExecutionId, "weekly_test");
});

test("provider missing configuration is classified without exposing raw error", async () => {
  await assert.rejects(
    runAuthoritativeWeeklyGenerationForUser({
      userId: "user-1",
      period,
      dependencies: deps({
        aggregate: async () => ({ items: [{ kind: "scan", source: "scan", id: "scan-1", title: "Scan", summary: "Evidence", occurredAt: "2026-08-04T00:00:00.000Z" }], sharedContext: [], bySource: {} }),
        analyze: async () => { throw new Error("OPENROUTER_API_KEY is missing."); },
      }),
    }),
    (error) => error instanceof WeeklyDiagnosticError && error.code === "weekly_provider_not_configured" && error.stage === "model_generation_started",
  );
});

test("historical monitoring context is diagnosed but cannot bypass the no-current-evidence gate", async () => {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  let analyzeCalls = 0;
  const result = await runAuthoritativeWeeklyGenerationForUser({
    userId: "user-1",
    period,
    dependencies: deps({
      aggregate: async () => ({ items: [{ kind: "scan", source: "completed_scans", id: "old-scan", ownerId: "user-1", title: "Agency invoicing", summary: "Manual invoice workflows", occurredAt: "2026-07-01T00:00:00.000Z", metadata: { status: "completed" } }], sharedContext: [], bySource: {} }),
      analyze: async () => { analyzeCalls += 1; return { summary: "must not run", problems: [] }; },
      log: (event: string, payload: Record<string, unknown>) => events.push({ event, payload }),
    }),
  });
  assert.equal(analyzeCalls, 0);
  assert.equal(result.problems.length, 0);
  const diagnostic = events.find((entry) => entry.event === "monitoring_context_selected")?.payload;
  assert.equal(diagnostic?.currentPeriodEvidenceCount, 0);
  assert.equal(diagnostic?.monitoringTopicCount, 1);
  assert.equal(diagnostic?.historicalContextAvailable, true);
  assert.equal(JSON.stringify(diagnostic).includes("Manual invoice workflows"), false);
});

test("safe diagnostics contract is wired through button, cron, UI, and Vercel schedule", () => {
  const buttonRoute = readFileSync("app/api/weekly-intelligence/route.ts", "utf8");
  const cronRoute = readFileSync("app/api/cron/route.ts", "utf8");
  const weeklyPage = readFileSync("app/weekly/page.tsx", "utf8");
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));

  assert.match(buttonRoute, /runWeeklyGenerationForUser\(user\.id, period, \{ weeklyExecutionId, entryPath: "button" \}\)/);
  assert.match(cronRoute, /runWeeklyGenerationForUser\(user\.user_id, period, \{ weeklyExecutionId, entryPath: "cron" \}\)/);
  assert.match(weeklyPage, /getWeeklyRunMessage/);
  assert.equal(vercel.crons[0].path, "/api/cron");
  assert.equal(vercel.crons[0].schedule, "0 8 * * 1");
});

test("weekly execution ids are stable safe identifiers", () => {
  assert.match(createWeeklyExecutionId(), /^weekly_[0-9a-f-]{36}$/);
});
