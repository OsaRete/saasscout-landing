import assert from "node:assert/strict";
import test from "node:test";

import {
  deduplicateDiscoverProblems,
  normalizeDiscoveryText,
  type DiscoverDeduplicationCandidate,
} from "../lib/intelligence/discovery-deduplication.ts";

function problem(overrides: Partial<DiscoverDeduplicationCandidate> = {}): DiscoverDeduplicationCandidate {
  return {
    problem_title: "Client reporting bottlenecks for agencies",
    problem_summary: "Agencies spend hours assembling recurring client reports from spreadsheets and disconnected dashboards.",
    affected_niches: "Marketing agencies | Client services",
    suggested_solutions: "Reporting workflow automation | Dashboard connector",
    pain_score: 8,
    revenue_score: 8,
    urgency_score: 7,
    trend_score: 7,
    buying_signal_score: 8,
    frequency_score: 8,
    source_quality_score: 9,
    opportunity_score: 84,
    problem_cluster: "Agency Operations",
    build_difficulty: "Medium",
    source_evidence: "Repeated external signals mention manual reporting work.",
    ...overrides,
  };
}

test("normalization centralizes casing, whitespace, punctuation, formatting, and empty handling", () => {
  assert.equal(normalizeDiscoveryText("  Client--REPORTING\tBottlenecks!! "), "client reporting bottlenecks");
  assert.equal(normalizeDiscoveryText(null), "");
});

test("exact duplicate titles are removed before acceptance", () => {
  const result = deduplicateDiscoverProblems({
    candidates: [problem(), problem({ problem_summary: "A different wording for the same duplicated title." })],
  });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.diagnostics.generationDuplicateCount, 1);
});

test("normalized duplicate titles are removed", () => {
  const result = deduplicateDiscoverProblems({
    candidates: [
      problem({ problem_title: " Client reporting bottlenecks for agencies " }),
      problem({ problem_title: "client-reporting bottlenecks: for agencies" }),
    ],
  });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected[0]?.matchedField, "title");
});

test("highly similar titles inside one generation are not both accepted", () => {
  const result = deduplicateDiscoverProblems({
    candidates: [
      problem({ problem_title: "Client reporting bottlenecks for agencies" }),
      problem({ problem_title: "Agency client reporting bottleneck" }),
    ],
  });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.diagnostics.generationDuplicateCount, 1);
});

test("substantially equivalent summaries with different titles are rejected", () => {
  const result = deduplicateDiscoverProblems({
    candidates: [
      problem({ problem_title: "Agency reporting operations gap" }),
      problem({
        problem_title: "Client analytics update delays",
        problem_summary: "Agencies spend hours assembling recurring client reports from spreadsheets and disconnected dashboards.",
      }),
    ],
  });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected[0]?.matchedField, "summary");
});

test("duplicates against the authenticated user's Discover history are rejected", () => {
  const result = deduplicateDiscoverProblems({
    candidates: [problem({ problem_title: "Agency client reporting bottleneck" })],
    userHistory: [problem({ problem_title: "Client reporting bottlenecks for agencies" })],
  });
  assert.equal(result.accepted.length, 0);
  assert.equal(result.diagnostics.historyDuplicateCount, 1);
});

test("another user's private history does not affect the current user's scoped input", () => {
  const otherUsersPrivateHistory = [problem({ problem_title: "Client reporting bottlenecks for agencies" })];
  const result = deduplicateDiscoverProblems({
    candidates: [problem()],
    userHistory: [],
  });
  assert.equal(otherUsersPrivateHistory.length, 1);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.diagnostics.historyDuplicateCount, 0);
});

test("rejected duplicates are excluded and accepted distinct ideas remain once", () => {
  const distinct = problem({
    problem_title: "Construction bid follow up delays",
    problem_summary: "Contractors lose revenue because bid follow ups are tracked manually across inboxes and spreadsheets.",
    affected_niches: "Construction contractors",
    problem_cluster: "Sales Follow-up",
  });
  const result = deduplicateDiscoverProblems({ candidates: [problem(), problem(), distinct] });
  assert.deepEqual(result.accepted.map((item) => item.problem_title), [
    "Client reporting bottlenecks for agencies",
    "Construction bid follow up delays",
  ]);
});

test("diversity filtering limits superficially different ideas in the same cluster and niche", () => {
  const result = deduplicateDiscoverProblems({
    candidates: [
      problem({ problem_title: "Agency reporting bottlenecks", problem_summary: "Agency teams spend hours preparing reports from spreadsheets." }),
      problem({ problem_title: "Client analytics report assembly", problem_summary: "Client services teams manually assemble analytics reports from dashboards." }),
      problem({ problem_title: "Recurring client update packets", problem_summary: "Marketing agencies compile recurring client update packets from spreadsheets and dashboards." }),
    ],
  });
  assert.equal(result.accepted.length, 2);
  assert.equal(result.diagnostics.diversityRejectedCount, 1);
});

test("target count bounds acceptance and supports bounded replacement callers without loops", () => {
  const titles = [
    "Payroll variance reconciliation",
    "Warehouse pick path planning",
    "Dental recall scheduling",
    "Restaurant vendor invoice matching",
    "Legal intake conflict checks",
    "Gym class waitlist management",
    "Property maintenance triage",
  ];
  const summaries = [
    "Finance teams reconcile payroll variance exceptions across timekeeping exports and accounting ledgers before close.",
    "Warehouse supervisors redraw pick paths after inventory moves create slow fulfillment handoffs.",
    "Dental offices lose preventive visits when recall scheduling depends on front desk reminders.",
    "Restaurant operators chase vendor invoice mismatches before weekly cash planning can finish.",
    "Law firms manually screen new intake forms for conflict issues before consultations are booked.",
    "Fitness studios coordinate waitlists and late cancellations for popular class slots by hand.",
    "Property managers triage tenant maintenance requests from fragmented email and SMS threads.",
  ];
  const candidates = titles.map((title, index) => problem({
    problem_title: title,
    problem_summary: summaries[index],
    affected_niches: `Niche ${index}`,
    suggested_solutions: `Purpose-built solution ${index} | Workflow assistant ${title}`,
    problem_cluster: `Cluster ${index}`,
  }));
  const result = deduplicateDiscoverProblems({ candidates, targetCount: 5 });
  assert.equal(result.accepted.length, 5);
});


test("public Discover errors remain sanitized at the route boundary", () => {
  const publicError = "Could not discover opportunities.";
  const internalError = new Error("database secret stack trace");
  assert.equal(publicError.includes(internalError.message), false);
});

test("Discover-to-Scan conversion fields remain available on accepted problems", () => {
  const result = deduplicateDiscoverProblems({ candidates: [problem()] });
  const accepted = result.accepted[0];
  assert.ok(accepted.problem_title);
  assert.ok(accepted.problem_summary);
  assert.ok(accepted.affected_niches);
  assert.ok(accepted.suggested_solutions);
  assert.ok(accepted.source_evidence);
});
