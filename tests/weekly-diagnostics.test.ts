import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getWeeklyIntelligencePeriod } from "../lib/weekly-intelligence.ts";
import { createWeeklyExecutionId, deriveWeeklyExecutionMode, runAuthoritativeWeeklyGenerationForUser, WeeklyDiagnosticError } from "../lib/weekly-intelligence-service.ts";

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

test("provider outage uses trustworthy historical monitoring context without calling it fresh", async () => {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  let analyzeCalls = 0;
  const result = await runAuthoritativeWeeklyGenerationForUser({
    userId: "user-1",
    period,
    dependencies: deps({
      aggregate: async () => ({ items: [{ kind: "scan", source: "completed_scans", id: "old-scan", ownerId: "user-1", title: "Agency invoicing", summary: "Manual invoice workflows", occurredAt: "2026-07-01T00:00:00.000Z", metadata: { status: "completed" } }], sharedContext: [], bySource: {} }),
      collectExternal: async () => ({ status: "unavailable" as const, observations: [], metrics: { providerAttemptCount: 1, providerSuccessCount: 0, providerFailureCount: 1, providerNotConfiguredCount: 0, rawExternalResultCount: 0, normalizedExternalResultCount: 0, deduplicatedExternalCount: 0, sourceDegraded: true } }),
      analyze: async ({ userEvidence }: { userEvidence: Array<{ id: string; type: string }> }) => { analyzeCalls += 1; assert.equal(userEvidence[0]?.type, "historical_context"); assert.match(userEvidence[0]?.id || "", /^weekly_context_wmt_/); return { summary: "Based on your accumulated SaaSScout evidence, validate this recurring problem next.", problems: [] }; },
      log: (event: string, payload: Record<string, unknown>) => events.push({ event, payload }),
    }),
  });
  assert.equal(analyzeCalls, 1);
  assert.equal(result.executionMode, "data_moat_fallback");
  assert.equal(result.problems.length, 0);
  const diagnostic = events.find((entry) => entry.event === "monitoring_context_selected")?.payload;
  assert.equal(diagnostic?.currentPeriodEvidenceCount, 0);
  assert.equal(diagnostic?.monitoringTopicCount, 1);
  assert.equal(diagnostic?.historicalContextAvailable, true);
  assert.equal(JSON.stringify(diagnostic).includes("Manual invoice workflows"), false);
});

test("execution modes are deterministic and server owned", () => {
  assert.equal(deriveWeeklyExecutionMode({ usableFreshExternalCount: 2, currentInternalCount: 0, trustworthyHistoricalContextCount: 0 }), "fresh_market");
  assert.equal(deriveWeeklyExecutionMode({ usableFreshExternalCount: 2, currentInternalCount: 1, trustworthyHistoricalContextCount: 0 }), "mixed");
  assert.equal(deriveWeeklyExecutionMode({ usableFreshExternalCount: 0, currentInternalCount: 0, trustworthyHistoricalContextCount: 1 }), "data_moat_fallback");
  assert.equal(deriveWeeklyExecutionMode({ usableFreshExternalCount: 0, currentInternalCount: 0, trustworthyHistoricalContextCount: 0 }), "insufficient_context");
});

test("fresh external evidence can generate without current activity and reports truthful counts", async () => {
  let persisted = 0; let analyzedIds: string[] = [];
  const result = await runAuthoritativeWeeklyGenerationForUser({ userId: "user-1", period, dependencies: deps({
    repository: repository({ async loadExternalHistory() { return []; }, async persistExternalSources({ sources }: { sources: unknown[] }) { persisted += sources.length; return sources.length; } }),
    aggregate: async () => ({ items: [{ kind: "scan", source: "completed_scans", id: "old", ownerId: "user-1", title: "Agency invoicing", summary: "Historical only", occurredAt: "2026-07-01T00:00:00.000Z", metadata: { status: "completed" } }], sharedContext: [], bySource: {} }),
    collectExternal: async ({ runId, period: currentPeriod, collectedAt }: { runId: string; period: typeof period; collectedAt: string }) => ({ status: "healthy" as const, observations: [{ evidenceId: "weekly_external_abc", runId, monitoringTopicFingerprint: "wmt_8bcf0b53f483032e", sourceProvider: "serpapi", sourceType: "google_search", url: "https://example.com/a", canonicalUrl: "https://example.com/a", title: "Invoice pain", snippet: "Manual errors", publishedAt: "2026-08-04T00:00:00.000Z", collectedAt, firstSeenAt: collectedAt, lastSeenAt: collectedAt, firstSeenPeriodStart: currentPeriod.period_start, contentFingerprint: "wec_1", freshness: "new" as const, originClass: "raw_external" as const, sourceRank: 1 }], metrics: { providerAttemptCount: 1, providerSuccessCount: 1, providerFailureCount: 0, providerNotConfiguredCount: 0, rawExternalResultCount: 1, normalizedExternalResultCount: 1, deduplicatedExternalCount: 1, sourceDegraded: false } }),
    analyze: async ({ userEvidence }: { userEvidence: Array<{ id: string }> }) => { analyzedIds = userEvidence.map((item) => item.id); return { summary: "Fresh evidence found", problems: [] }; },
  }) });
  assert.deepEqual(analyzedIds, ["weekly_external_abc"]); assert.equal(persisted, 1); assert.equal(result.sources_saved, 1);
  assert.equal(result.sourceCounts.externalSourcesPersisted, 1); assert.equal(result.sourceCounts.currentPeriodInternalEvidenceCount, 0); assert.equal(result.sourceCounts.totalEvidenceUsed, 1);
});

test("35 deduplicated observations classify and persist after an empty history lookup", async () => {
  const order: string[] = [];
  const observations = Array.from({ length: 35 }, (_, index) => ({ evidenceId: `weekly_external_${index}`, runId: "run-1", monitoringTopicFingerprint: "wmt_8bcf0b53f483032e", sourceProvider: "serpapi", sourceType: "google_search", url: `https://example.com/${index}`, canonicalUrl: `https://example.com/${index}`, title: `Invoice pain ${index}`, snippet: "Manual errors", publishedAt: index === 0 ? null : "2026-08-04T00:00:00.000Z", collectedAt: "2026-08-05T12:00:00.000Z", firstSeenAt: "2026-08-05T12:00:00.000Z", lastSeenAt: "2026-08-05T12:00:00.000Z", firstSeenPeriodStart: period.period_start, contentFingerprint: `wec_${index}`, freshness: "new" as const, originClass: "raw_external" as const, sourceRank: index + 1 }));
  const result = await runAuthoritativeWeeklyGenerationForUser({ userId: "user-1", period, dependencies: deps({
    repository: repository({ async loadExternalHistory() { order.push("history"); return []; }, async persistExternalSources({ sources }: { sources: unknown[] }) { order.push("persist"); return sources.length; } }),
    aggregate: async () => ({ items: [{ kind: "scan", source: "completed_scans", id: "old", ownerId: "user-1", title: "Agency invoicing", summary: "Historical only", occurredAt: "2026-07-01T00:00:00.000Z", metadata: { status: "completed" } }], sharedContext: [], bySource: {} }),
    collectExternal: async () => ({ status: "healthy" as const, observations, metrics: { providerAttemptCount: 12, providerSuccessCount: 9, providerFailureCount: 3, providerNotConfiguredCount: 0, rawExternalResultCount: 36, normalizedExternalResultCount: 36, deduplicatedExternalCount: 35, sourceDegraded: true } }),
    analyze: async () => ({ summary: "Fresh evidence found", problems: [] }),
  }) });
  assert.deepEqual(order, ["history", "persist"]);
  assert.equal(result.sourceCounts.externalSourcesNew, 35);
  assert.equal(result.sourceCounts.externalSourcesPersisted, 35);
});

test("history and persistence failures expose precise safe stages without leaking evidence", async () => {
  const base = { aggregate: async () => ({ items: [], sharedContext: [], bySource: {} }), collectExternal: async () => ({ status: "no_results" as const, observations: [], metrics: { providerAttemptCount: 0, providerSuccessCount: 0, providerFailureCount: 0, providerNotConfiguredCount: 0, rawExternalResultCount: 0, normalizedExternalResultCount: 0, deduplicatedExternalCount: 0, sourceDegraded: false } }) };
  await assert.rejects(runAuthoritativeWeeklyGenerationForUser({ userId: "user-1", period, dependencies: deps({ ...base, repository: repository({ async loadExternalHistory() { throw new Error("PRIVATE URL https://secret.example"); } }) }) }), (error) => error instanceof WeeklyDiagnosticError && error.code === "weekly_external_history_read_failed" && error.stage === "external_history_loading_started" && !error.message.includes("secret.example"));

  const observation = { evidenceId: "weekly_external_1", runId: "run-1", monitoringTopicFingerprint: "wmt_1", sourceProvider: "serpapi", sourceType: "google_search", url: "https://example.com/1", canonicalUrl: "https://example.com/1", title: "Pain", snippet: "Evidence", publishedAt: null, collectedAt: period.period_start, firstSeenAt: period.period_start, lastSeenAt: period.period_start, firstSeenPeriodStart: period.period_start, contentFingerprint: "wec_1", freshness: "new" as const, originClass: "raw_external" as const, sourceRank: 1 };
  await assert.rejects(runAuthoritativeWeeklyGenerationForUser({ userId: "user-1", period, dependencies: deps({ ...base, repository: repository({ async loadExternalHistory() { return []; }, async persistExternalSources() { throw new Error("PRIVATE snippet"); } }), collectExternal: async () => ({ status: "healthy" as const, observations: [observation], metrics: { providerAttemptCount: 1, providerSuccessCount: 1, providerFailureCount: 0, providerNotConfiguredCount: 0, rawExternalResultCount: 1, normalizedExternalResultCount: 1, deduplicatedExternalCount: 1, sourceDegraded: false } }) }) }), (error) => error instanceof WeeklyDiagnosticError && error.code === "weekly_source_persistence_failed" && error.stage === "sources_persisted" && !error.message.includes("PRIVATE"));
});

test("external persistence failure falls back without exposing unpersisted evidence to the model", async () => {
  const observation = { evidenceId: "weekly_external_unpersisted", runId: "run-1", monitoringTopicFingerprint: "wmt_1", sourceProvider: "serpapi", sourceType: "google_search", url: "https://example.com/1", canonicalUrl: "https://example.com/1", title: "Fresh pain", snippet: "Fresh evidence", publishedAt: null, collectedAt: period.period_start, firstSeenAt: period.period_start, lastSeenAt: period.period_start, firstSeenPeriodStart: period.period_start, contentFingerprint: "wec_1", freshness: "new" as const, originClass: "raw_external" as const, sourceRank: 1 };
  let analyzedIds: string[] = [];
  const result = await runAuthoritativeWeeklyGenerationForUser({ userId: "user-1", period, dependencies: deps({
    repository: repository({ async loadExternalHistory() { return []; }, async persistExternalSources() { throw new Error("42P10"); } }),
    aggregate: async () => ({ items: [{ kind: "scan", source: "scan", id: "scan-current", ownerId: "user-1", title: "Grounded scan", summary: "Current internal evidence", occurredAt: "2026-08-04T00:00:00.000Z", metadata: { status: "completed" } }], sharedContext: [], bySource: {} }),
    collectExternal: async () => ({ status: "healthy" as const, observations: [observation], metrics: { providerAttemptCount: 1, providerSuccessCount: 1, providerFailureCount: 0, providerNotConfiguredCount: 0, rawExternalResultCount: 1, normalizedExternalResultCount: 1, deduplicatedExternalCount: 1, sourceDegraded: false } }),
    analyze: async ({ userEvidence }: { userEvidence: Array<{ id: string }> }) => { analyzedIds = userEvidence.map((item) => item.id); return { summary: "Based on your accumulated SaaSScout evidence, validate the current problem.", problems: [] }; },
  }) });
  assert.equal(result.executionMode, "data_moat_fallback");
  assert.equal(result.sourceCounts.sourceDegraded, true);
  assert.deepEqual(analyzedIds, ["scan-current"]);
  assert.equal(analyzedIds.includes("weekly_external_unpersisted"), false);
});

test("completed reuse performs no collection, source persistence, or model work", async () => {
  let work = 0;
  await runAuthoritativeWeeklyGenerationForUser({ userId: "user-1", period, dependencies: deps({ repository: repository({ async claimRun() { return { status: "completed" as const, run: { id: "run-1", total_sources_analyzed: 2 } }; }, async loadExternalHistory() { work += 1; return []; }, async persistExternalSources() { work += 1; return 0; } }), collectExternal: async () => { work += 1; throw new Error("must not collect"); }, analyze: async () => { work += 1; return { summary: "bad", problems: [] }; } }) });
  assert.equal(work, 0);
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
