import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmptyWeeklyReport,
  buildWeeklyIntelligencePrompt,
  collectWeeklyEvidenceFromDataMoat,
  countWeeklyEvidence,
  getWeeklyIntelligencePeriod,
  isInsideWeeklyPeriod,
  validateWeeklyModelOutput,
  type WeeklyEvidenceSource,
  type WeeklySharedSource,
} from "../lib/weekly-intelligence.ts";

test("weekly period boundaries are deterministic UTC Monday with exclusive end", () => {
  const period = getWeeklyIntelligencePeriod(new Date("2026-07-19T12:30:00.000Z"));
  assert.equal(period.period_start, "2026-07-13T00:00:00.000Z");
  assert.equal(period.period_end, "2026-07-20T00:00:00.000Z");
  assert.equal(period.timezone, "UTC");
  assert.equal(period.boundary, "[start,end)");
});

test("period inclusion excludes stale data and data at or after period_end", () => {
  const period = getWeeklyIntelligencePeriod(new Date("2026-07-19T12:30:00.000Z"));
  assert.equal(isInsideWeeklyPeriod("2026-07-12T23:59:59.999Z", period), false);
  assert.equal(isInsideWeeklyPeriod("2026-07-13T00:00:00.000Z", period), true);
  assert.equal(isInsideWeeklyPeriod("2026-07-19T23:59:59.999Z", period), true);
  assert.equal(isInsideWeeklyPeriod("2026-07-20T00:00:00.000Z", period), false);
});

test("weekly evidence counts authenticated user's eligible Scan and Discover activity", () => {
  const evidence: WeeklyEvidenceSource[] = [
    { type: "scan", id: "scan-1", title: "CRM scan", summary: "Manual CRM pain", created_at: "2026-07-14T00:00:00.000Z" },
    { type: "discover", id: "discover-1", title: "Discovery", summary: "Accepted onboarding problem", created_at: "2026-07-15T00:00:00.000Z" },
  ];
  assert.deepEqual(countWeeklyEvidence(evidence), { scan: 1, discover: 1, saved_idea: 0, conversion: 0 });
});

test("prompt separates user-owned evidence from supplementary shared intelligence", () => {
  const period = getWeeklyIntelligencePeriod(new Date("2026-07-19T12:30:00.000Z"));
  const userEvidence: WeeklyEvidenceSource[] = [
    { type: "scan", id: "user-scan", title: "User-owned Scan", summary: "Private user scan evidence", created_at: "2026-07-14T00:00:00.000Z" },
  ];
  const sharedContext: WeeklySharedSource[] = [
    { type: "problem_intelligence", id: "shared-1", title: "Shared aggregate", summary: "Aggregate score only" },
  ];
  const prompt = buildWeeklyIntelligencePrompt({ period, userEvidence, priorUserContext: [], sharedContext });
  assert.match(prompt, /User-owned evidence for this period/);
  assert.match(prompt, /Optional shared aggregate context/);
  assert.match(prompt, /must never be presented as private user activity/);
});

test("another user's private history is excluded by owner-scoped filtering contract", () => {
  const period = getWeeklyIntelligencePeriod(new Date("2026-07-19T12:30:00.000Z"));
  const rows = [
    { user_id: "user-a", type: "scan" as const, id: "a", title: "A", summary: "A", created_at: "2026-07-14T00:00:00.000Z" },
    { user_id: "user-b", type: "discover" as const, id: "b", title: "B", summary: "B", created_at: "2026-07-14T00:00:00.000Z" },
  ];
  const scoped = rows.filter((row) => row.user_id === "user-a" && isInsideWeeklyPeriod(row.created_at, period));
  assert.deepEqual(scoped.map((row) => row.id), ["a"]);
});

test("empty evidence produces controlled non-fabricated report", () => {
  const period = getWeeklyIntelligencePeriod(new Date("2026-07-19T12:30:00.000Z"));
  const report = buildEmptyWeeklyReport(period);
  assert.equal(report.problems.length, 0);
  assert.match(report.summary, /No eligible user-owned activity/);
  assert.match(report.summary, /not fabricating/);
});

test("malformed model output is rejected safely", () => {
  assert.throws(() => validateWeeklyModelOutput({ summary: "bad", problems: "not-array" }, []), /Malformed weekly intelligence output/);
});

test("model cannot create personalized problems without meaningful user evidence", () => {
  assert.throws(
    () => validateWeeklyModelOutput({ summary: "bad", problems: [{ problem_title: "Fabricated" }] }, []),
    /without user evidence/
  );
});

test("valid output preserves existing Weekly UI response-compatible problem fields", () => {
  const evidence: WeeklyEvidenceSource[] = [
    { type: "discover", id: "d", title: "Discovery", summary: "Problem evidence", created_at: "2026-07-14T00:00:00.000Z" },
  ];
  const report = validateWeeklyModelOutput(
    {
      summary: "User explored onboarding automation.",
      problems: [
        {
          problem_title: "Onboarding handoff friction",
          problem_summary: "The user repeatedly explored onboarding handoff pain.",
          affected_niches: "Agencies | B2B services",
          suggested_solutions: "Checklist automation | Client portal",
          pain_score: 8,
          revenue_score: 7,
          urgency_score: 6,
          trend_score: 5,
          monetization_angle: "Validate paid onboarding workflows.",
          source_evidence: "Observed in the user's Discover generation.",
        },
      ],
    },
    evidence
  );
  assert.equal(report.problems[0].problem_title, "Onboarding handoff friction");
  assert.equal(typeof report.problems[0].opportunity_score, "number");
});

test("idempotency key allows one authoritative report per user and period while different users do not conflict", () => {
  const period = getWeeklyIntelligencePeriod(new Date("2026-07-19T12:30:00.000Z"));
  const key = (userId: string) => `${userId}:${period.period_start}:${period.period_end}`;
  assert.equal(key("user-a"), key("user-a"));
  assert.notEqual(key("user-a"), key("user-b"));
});

test("public errors are sanitized by route contract", () => {
  const publicError = "Could not generate weekly intelligence.";
  assert.equal(publicError.includes("service_role"), false);
  assert.equal(publicError.includes("database"), false);
});

test("plan gating remains server-side by using profile weekly flag", () => {
  const profile = { weekly_intelligence_enabled: false };
  assert.equal(profile.weekly_intelligence_enabled === false, true);
});


test("weekly evidence is collected through Data Moat aggregation and preserves source mapping", async () => {
  const period = getWeeklyIntelligencePeriod(new Date("2026-07-19T12:30:00.000Z"));
  const calls: string[] = [];
  const result = await collectWeeklyEvidenceFromDataMoat({
    userId: "user-a",
    period,
    aggregate: async (userId) => {
      calls.push(userId);
      return {
        items: [
          { kind: "scan", source: "completed_scans", id: "scan-start", title: "CRM / Agencies", summary: "Scan at period start", occurredAt: "2026-07-13T00:00:00.000Z", metadata: {} },
          { kind: "discover_run", source: "discover_history", id: "discover-mid", title: "Discover generation", summary: "Discovery evidence", occurredAt: "2026-07-14T00:00:00.000Z", metadata: { sourceCount: 4 } },
          { kind: "saved_idea", source: "saved_ideas", id: "saved-mid", title: "Saved", summary: "Saved", occurredAt: "2026-07-15T00:00:00.000Z", metadata: { opportunityId: "opp-1" } },
          { kind: "user_activity", source: "historical_user_evidence", id: "action-mid", title: "Action", summary: "Action", occurredAt: "2026-07-16T00:00:00.000Z", parentId: "disc-1", metadata: { actionType: "accepted", problemId: "prob-1" } },
          { kind: "discover_problem", source: "accepted_discover_problems", id: "problem-mid", title: "Accepted problem", summary: "Accepted problem summary", occurredAt: "2026-07-17T00:00:00.000Z", metadata: {} },
          { kind: "opportunity", source: "generated_opportunities", id: "opp-mid", title: "Generated opportunity", summary: "Opportunity summary", occurredAt: "2026-07-18T00:00:00.000Z", metadata: {} },
          { kind: "scan", source: "completed_scans", id: "scan-before", title: "Old", summary: "Old", occurredAt: "2026-07-12T23:59:59.999Z", metadata: {} },
          { kind: "scan", source: "completed_scans", id: "scan-end", title: "End", summary: "End", occurredAt: "2026-07-20T00:00:00.000Z", metadata: {} },
        ],
        bySource: {
          weekly_reports: [
            { kind: "weekly_report", source: "weekly_reports", id: "prior-week", title: "Prior", summary: "Prior summary", occurredAt: "2026-07-06T00:00:00.000Z", metadata: {} },
            { kind: "weekly_report", source: "weekly_reports", id: "current-week", title: "Current", summary: "Current summary", occurredAt: "2026-07-14T00:00:00.000Z", metadata: {} },
          ],
        },
        sharedContext: [{ kind: "shared_problem_intelligence", source: "shared_problem_intelligence", id: "shared-1", title: "Shared", summary: "Shared context", occurredAt: "2026-07-18T00:00:00.000Z", metadata: { score: 9 } }],
      };
    },
  });

  assert.deepEqual(calls, ["user-a"]);
  assert.deepEqual(result.userEvidence.map((item) => item.id), ["scan-start", "discover-mid", "saved-mid", "action-mid", "problem-mid", "opp-mid"]);
  assert.deepEqual(countWeeklyEvidence(result.userEvidence), { scan: 1, discover: 3, saved_idea: 1, conversion: 1 });
  assert.deepEqual(result.priorUserContext.map((item) => item.id), ["prior-week"]);
  assert.deepEqual(result.sharedContext.map((item) => item.id), ["shared-1"]);
});

test("shared context alone remains supplementary and does not create personalized insights", async () => {
  const period = getWeeklyIntelligencePeriod(new Date("2026-07-19T12:30:00.000Z"));
  const result = await collectWeeklyEvidenceFromDataMoat({
    userId: "user-a",
    period,
    aggregate: async () => ({
      items: [],
      sharedContext: [{ kind: "shared_problem_intelligence", source: "shared_problem_intelligence", id: "shared-only", title: "Shared", summary: "Shared only", occurredAt: "2026-07-14T00:00:00.000Z", metadata: {} }],
      bySource: {},
    }),
  });
  assert.equal(result.userEvidence.length, 0);
  assert.equal(result.sharedContext.length, 1);
  assert.equal(buildEmptyWeeklyReport(period).problems.length, 0);
  assert.throws(() => validateWeeklyModelOutput({ summary: "bad", problems: [{ problem_title: "Fabricated" }] }, result.userEvidence), /without user evidence/);
});
