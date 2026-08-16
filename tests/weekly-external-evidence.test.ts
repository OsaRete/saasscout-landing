import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyExternalQueries, canonicalizeWeeklyExternalUrl, classifyWeeklyExternalEvidence, collectWeeklyExternalEvidence, deduplicateWeeklyExternalEvidence, normalizeWeeklyExternalResult, WEEKLY_EXTERNAL_LIMITS, WEEKLY_CONTENT_FINGERPRINT_VERSION, WEEKLY_EXTERNAL_SOURCE_FINGERPRINT_VERSION } from "../lib/weekly-external-evidence.ts";
import type { WeeklyMonitoringTopic } from "../lib/weekly-monitoring-context.ts";

const period = { period_start: "2026-08-10T00:00:00.000Z", period_end: "2026-08-17T00:00:00.000Z", timezone: "UTC" as const, boundary: "[start,end)" as const };
const topic = (index = 1): WeeklyMonitoringTopic => ({ id: `wmt_${index}`, fingerprint: `wmt_${index}`, title: `Invoice automation ${index}`, market: "Freelancers", niche: "Bookkeeping", problemSummary: "PRIVATE RAW SUMMARY must never leave", sourceKinds: ["completed_scan"], historicalSourceIds: [`scan-${index}`], relevanceSignals: { scanCount: 1, discoverProblemCount: 0, savedIdeaCount: 0, priorWeeklyCount: 0, userActionCount: 0 }, latestObservedAt: "2026-08-01T00:00:00.000Z", monitoringPriority: 10 });
const raw = { provider: "serpapi", sourceType: "google_search", url: "https://Example.com/article/?utm_source=x&b=2&a=1#part", title: "  Manual   invoice pain ", snippet: "Freelancers report errors", publishedAt: "2026-08-12" };
const normalized = () => normalizeWeeklyExternalResult({ result: raw, runId: "run-1", topicFingerprint: "wmt_1", period, collectedAt: "2026-08-16T00:00:00.000Z" })!;

test("monitoring topics produce bounded deterministic public queries without private summaries", () => {
  assert.deepEqual(buildWeeklyExternalQueries([]), []);
  const first = buildWeeklyExternalQueries([topic()]);
  assert.equal(first.length, WEEKLY_EXTERNAL_LIMITS.queriesPerTopic);
  assert.deepEqual(first, buildWeeklyExternalQueries([topic()]));
  assert.equal(JSON.stringify(first).includes("PRIVATE RAW SUMMARY"), false);
  assert.equal(buildWeeklyExternalQueries(Array.from({ length: 5 }, (_, index) => topic(index))).length, WEEKLY_EXTERNAL_LIMITS.maxQueries);
});

test("canonical URLs accept http(s), reject unsafe schemes, and conservatively remove tracking", () => {
  assert.equal(canonicalizeWeeklyExternalUrl(raw.url), "https://example.com/article?a=1&b=2");
  assert.equal(canonicalizeWeeklyExternalUrl("http://example.com/a"), "http://example.com/a");
  assert.equal(canonicalizeWeeklyExternalUrl("file:///etc/passwd"), null);
  assert.notEqual(canonicalizeWeeklyExternalUrl("https://example.com/a"), canonicalizeWeeklyExternalUrl("https://example.com/b"));
});

test("normalization bounds fields, validates publication dates, and creates stable versioned identity", () => {
  const first = normalized(); const second = normalized();
  assert.equal(first.evidenceId, second.evidenceId);
  assert.equal(first.contentFingerprint, second.contentFingerprint);
  assert.match(first.evidenceId, /^weekly_external_/);
  assert.ok(first.title!.length <= 300 && first.snippet!.length <= 1_000);
  assert.equal(first.publishedAt, "2026-08-12T00:00:00.000Z");
  assert.equal(normalizeWeeklyExternalResult({ result: { ...raw, publishedAt: "not-a-date" }, runId: "r", topicFingerprint: "w", period, collectedAt: period.period_start })!.publishedAt, null);
  assert.equal(WEEKLY_EXTERNAL_SOURCE_FINGERPRINT_VERSION, "weekly-external-source@1");
  assert.equal(WEEKLY_CONTENT_FINGERPRINT_VERSION, "weekly-content-fingerprint@1");
});

test("in-run canonical URL dedupe is deterministic and does not merge legitimate pages", () => {
  const one = normalized();
  const duplicate = { ...one, sourceProvider: "x", evidenceId: "weekly_external_z" };
  const other = normalizeWeeklyExternalResult({ result: { ...raw, url: "https://example.com/other" }, runId: "run-1", topicFingerprint: "wmt_1", period, collectedAt: one.collectedAt })!;
  assert.equal(deduplicateWeeklyExternalEvidence([duplicate, one]).length, 1);
  assert.equal(deduplicateWeeklyExternalEvidence([one, other]).length, 2);
});

test("cross-period freshness is deterministic and leaves history immutable", () => {
  const item = normalized();
  assert.equal(classifyWeeklyExternalEvidence([item], [], period)[0].freshness, "new");
  const history = [{ canonicalUrl: item.canonicalUrl, contentFingerprint: item.contentFingerprint, firstSeenAt: "2026-08-01T00:00:00.000Z", firstSeenPeriodStart: "2026-07-27T00:00:00.000Z", lastSeenAt: "2026-08-09T00:00:00.000Z", periodStart: "2026-08-03T00:00:00.000Z", monitoringTopicFingerprint: item.monitoringTopicFingerprint }];
  const snapshot = JSON.stringify(history);
  assert.equal(classifyWeeklyExternalEvidence([item], history, period)[0].freshness, "unchanged");
  assert.equal(classifyWeeklyExternalEvidence([{ ...item, contentFingerprint: "wec_changed" }], history, period)[0].freshness, "changed");
  assert.equal(classifyWeeklyExternalEvidence([item], [{ ...history[0], periodStart: "2026-07-20T00:00:00.000Z" }], period)[0].freshness, "resurfaced");
  assert.equal(classifyWeeklyExternalEvidence([{ ...item, publishedAt: null }], [], period)[0].freshness, "publication_unknown");
  assert.equal(JSON.stringify(history), snapshot);
});

test("collector distinguishes healthy, degraded, unavailable, missing configuration, and result caps", async () => {
  const success = { name: "ok", configured: () => true, search: async () => Array.from({ length: 10 }, (_, index) => ({ ...raw, url: `https://example.com/${index}` })) };
  const failure = { name: "bad", configured: () => true, search: async () => { throw new Error("secret provider response"); } };
  const missing = { name: "missing", configured: () => false, search: async () => [] };
  const healthy = await collectWeeklyExternalEvidence({ topics: [topic()], providers: [success], runId: "r", period, collectedAt: period.period_start });
  assert.equal(healthy.status, "healthy"); assert.ok(healthy.observations.length <= WEEKLY_EXTERNAL_LIMITS.maxResults);
  const degraded = await collectWeeklyExternalEvidence({ topics: [topic()], providers: [success, failure], runId: "r", period, collectedAt: period.period_start });
  assert.equal(degraded.status, "degraded"); assert.equal(degraded.metrics.sourceDegraded, true);
  assert.equal((await collectWeeklyExternalEvidence({ topics: [topic()], providers: [failure], runId: "r", period, collectedAt: period.period_start })).status, "unavailable");
  assert.equal((await collectWeeklyExternalEvidence({ topics: [topic()], providers: [missing], runId: "r", period, collectedAt: period.period_start })).status, "not_configured");
  assert.equal((await collectWeeklyExternalEvidence({ topics: [], providers: [success], runId: "r", period, collectedAt: period.period_start })).metrics.providerAttemptCount, 0);
});
