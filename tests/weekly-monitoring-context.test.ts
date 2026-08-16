import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyMonitoringRecordsFromDataMoat, selectWeeklyMonitoringTopics, WEEKLY_MONITORING_MAX_TOPICS } from "../lib/weekly-monitoring-context.ts";

const user = "user-a";
const end = "2026-08-17T00:00:00.000Z";
const at = "2026-07-01T00:00:00.000Z";
const record = (overrides: Record<string, unknown> = {}) => ({ id: "scan-1", ownerId: user, kind: "completed_scan" as const, occurredAt: at, title: "Manual invoicing", problemSummary: "Freelancers create invoices manually", status: "completed", ...overrides });

test("completed scans are eligible while pending and failed scans are excluded", () => {
  const result = selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: [record(), record({ id: "pending", status: "pending", title: "Pending market" }), record({ id: "failed", status: "failed", title: "Failed market" })] });
  assert.deepEqual(result.topics.map((topic) => topic.title), ["Manual invoicing"]);
});

test("accepted Discover is eligible while rejected Discover is excluded", () => {
  const result = selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: [record({ id: "accepted", kind: "accepted_discover_problem", status: "accepted", conceptId: "problem-1" }), record({ id: "rejected", kind: "accepted_discover_problem", status: "rejected", title: "Rejected" })] });
  assert.equal(result.topics.length, 1);
  assert.deepEqual(result.topics[0].sourceKinds, ["accepted_discover_problem"]);
});

test("saved idea uses its linked underlying opportunity rather than the save action", () => {
  const rows = buildWeeklyMonitoringRecordsFromDataMoat({ items: [
    { id: "opp-1", ownerId: user, kind: "opportunity", title: "Invoice reconciliation", summary: "Teams reconcile billing manually", occurredAt: at },
    { id: "save-1", ownerId: user, kind: "saved_idea", title: "saved", summary: "saved", occurredAt: at, metadata: { opportunityId: "opp-1" } },
  ] }, user);
  const result = selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: rows });
  assert.equal(result.topics[0].title, "Invoice reconciliation");
  assert.equal(result.topics[0].relevanceSignals.savedIdeaCount, 1);
});

test("grounded prior Weekly problems are eligible and placeholders are not", () => {
  const result = selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: [
    record({ id: "weekly-valid", kind: "prior_weekly_problem", title: "Billing reconciliation delays", evidenceReferenceCount: 2, sourceCount: 3 }),
    record({ id: "weekly-placeholder", kind: "prior_weekly_problem", title: "Untitled weekly pattern", evidenceReferenceCount: 3, sourceCount: 3 }),
    record({ id: "weekly-ungrounded", kind: "prior_weekly_problem", title: "Ungrounded", evidenceReferenceCount: 0, sourceCount: 3 }),
  ] });
  assert.deepEqual(result.topics.map((topic) => topic.title), ["Billing reconciliation delays"]);
});

test("actions only raise relevance of a linked candidate and shared PI never creates one", () => {
  const candidate = record({ id: "problem-1", kind: "accepted_discover_problem", status: "accepted", conceptId: "problem-1" });
  const action = record({ id: "action-1", kind: "user_action", title: null, status: null, conceptId: "problem-1", actionType: "prepare_deep_scan" });
  const shared = record({ id: "pi-1", kind: "shared_problem_intelligence", ownerId: user, title: "Global popular problem" });
  const withAction = selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: [candidate, action, shared] });
  const withoutAction = selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: [candidate] });
  assert.equal(withAction.topics.length, 1);
  assert.equal(withAction.topics[0].relevanceSignals.userActionCount, 1);
  assert.ok(withAction.topics[0].monitoringPriority > withoutAction.topics[0].monitoringPriority);
  assert.equal(selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: [shared] }).topics.length, 0);
});

test("historical context is bounded, owner-scoped, deterministic, and conservatively deduplicated", () => {
  const records = [
    record({ id: "a", conceptId: "billing", kind: "accepted_discover_problem", status: "accepted" }),
    record({ id: "b", conceptId: "billing", kind: "saved_idea", title: "Spreadsheet invoicing", status: null }),
    record({ id: "other-owner", ownerId: "user-b", title: "Private payroll" }),
    ...Array.from({ length: 8 }, (_, index) => record({ id: `market-${index}`, title: `Distinct market ${index}`, market: `market-${index}` })),
  ];
  const first = selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records });
  const second = selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: records.slice().reverse() });
  assert.ok(first.topics.length <= WEEKLY_MONITORING_MAX_TOPICS);
  assert.deepEqual(first.topics, second.topics);
  assert.equal(first.topics.filter((topic) => topic.historicalSourceIds.includes("a") || topic.historicalSourceIds.includes("b")).length, 1);
  assert.equal(first.topics.some((topic) => topic.title === "Private payroll"), false);
  assert.deepEqual(first.topics.map((topic) => topic.fingerprint), second.topics.map((topic) => topic.fingerprint));
});

test("records beyond the bounded lookback and brand-new accounts produce no topics", () => {
  const old = record({ occurredAt: "2025-01-01T00:00:00.000Z" });
  assert.equal(selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: [old] }).topics.length, 0);
  assert.equal(selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: [] }).diagnostics.historicalContextAvailable, false);
});

test("diagnostics expose only aggregate values", () => {
  const diagnostics = selectWeeklyMonitoringTopics({ authenticatedUserId: user, periodEnd: end, records: [record({ problemSummary: "PRIVATE SECRET" })] }).diagnostics;
  const serialized = JSON.stringify(diagnostics);
  assert.equal(serialized.includes("PRIVATE SECRET"), false);
  assert.deepEqual(Object.keys(diagnostics).sort(), ["historicalContextAvailable", "monitoringSelectionVersion", "monitoringSourceKindCounts", "monitoringTopicCount"]);
});
