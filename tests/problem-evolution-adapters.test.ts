import assert from "node:assert/strict";
import test from "node:test";

import {
  discoveredProblemRowToEvolutionObservation,
  problemIntelligenceRowToEvolutionObservation,
  weeklyDetectedProblemRowToEvolutionObservation,
  weeklySourceRowToEvolutionObservation,
} from "../lib/knowledge/evolution/index.ts";

test("adapts a problem_intelligence row with provenance and average scores", () => {
  const row = {
    id: "pi_1",
    problem_title: "Manual onboarding follow-up",
    avg_pain_score: "8",
    avg_revenue_score: 7,
    avg_urgency_score: 6,
    avg_buying_signal_score: 5,
    avg_frequency_score: 4,
    avg_source_quality_score: 3,
    avg_opportunity_score: 82,
    intelligence_score: 91,
    prepared_count: "2",
    converted_count: 1,
    source_count: 3,
    evidence_count: 6,
    source_types: ["Reddit", "github", "reddit"],
    first_seen_at: "2026-06-01T00:00:00.000Z",
    last_seen_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
  };

  assert.deepEqual(problemIntelligenceRowToEvolutionObservation(row), {
    problem_title: "Manual onboarding follow-up",
    observedAt: "2026-06-21T00:00:00.000Z",
    pain_score: 8,
    revenue_score: 7,
    urgency_score: 6,
    trend_score: 0,
    buying_signal_score: 5,
    frequency_score: 4,
    source_quality_score: 3,
    opportunity_score: 8.2,
    intelligence_score: 9.1,
    prepared_count: 2,
    converted_count: 1,
    source_count: 3,
    evidence_count: 6,
    source_types: ["data_moat", "github", "reddit"],
    first_seen_at: "2026-06-01T00:00:00.000Z",
    last_seen_at: "2026-06-20T00:00:00.000Z",
    problem_cluster: null,
    source_evidence: null,
    provenance: {
      source_table: "problem_intelligence",
      row_id: "pi_1",
      discovery_id: null,
      user_id: null,
      source_url: null,
      source_rank: null,
    },
  });
});

test("adapts a weekly_detected_problems row", () => {
  const observation = weeklyDetectedProblemRowToEvolutionObservation({
    id: "wdp_1",
    problem_title: "Agency reporting is manual",
    problem_summary: "Agencies copy metrics into decks.",
    pain_score: 9,
    revenue_score: 8,
    urgency_score: 7,
    trend_score: 6,
    source_evidence: "Multiple agency complaints.",
    created_at: "2026-06-15T12:00:00.000Z",
  });

  assert.equal(observation.problem_title, "Agency reporting is manual");
  assert.equal(observation.observedAt, "2026-06-15T12:00:00.000Z");
  assert.equal(observation.source_evidence, "Multiple agency complaints.");
  assert.equal(observation.evidence_count, 1);
  assert.deepEqual(observation.source_types, ["weekly_intelligence"]);
  assert.equal(observation.provenance?.source_table, "weekly_detected_problems");
});

test("adapts a weekly_sources row", () => {
  const observation = weeklySourceRowToEvolutionObservation({
    id: "ws_1",
    source_title: "Founder asks for billing workaround",
    source_url: "https://example.com/source",
    source_snippet: "Is there a tool for this?",
    source_type: "google_search",
    source_rank: "4",
    signal_score: 73,
    buying_signal_score: 8,
    problem_cluster: "billing_workflows",
    category: "Operations",
    created_at: "2026-06-10T00:00:00.000Z",
  });

  assert.equal(observation.problem_title, "billing_workflows");
  assert.equal(observation.trend_score, 7.3);
  assert.equal(observation.source_quality_score, 7.3);
  assert.equal(observation.buying_signal_score, 8);
  assert.deepEqual(observation.source_types, ["google_search", "operations", "weekly_source"]);
  assert.equal(observation.provenance?.source_url, "https://example.com/source");
  assert.equal(observation.provenance?.source_rank, 4);
});

test("adapts a discovered_problems row", () => {
  const observation = discoveredProblemRowToEvolutionObservation({
    id: "dp_1",
    discovery_id: "disc_1",
    user_id: "user_1",
    problem_title: "Creators lose sponsorship leads",
    pain_score: 7,
    opportunity_score: 88,
    problem_cluster: "creator_crm",
    source_evidence: "Creator forum thread.",
    created_at: "2026-06-11T00:00:00.000Z",
  });

  assert.equal(observation.problem_title, "Creators lose sponsorship leads");
  assert.equal(observation.opportunity_score, 8.8);
  assert.equal(observation.problem_cluster, "creator_crm");
  assert.deepEqual(observation.provenance, {
    source_table: "discovered_problems",
    row_id: "dp_1",
    discovery_id: "disc_1",
    user_id: "user_1",
    source_url: null,
    source_rank: null,
  });
});

test("uses conservative defaults for missing optional fields and date fallbacks", () => {
  const observation = discoveredProblemRowToEvolutionObservation({
    problem_title: "Missing details",
    updated_at: "not a date",
    first_seen_at: "2026-06-02T00:00:00.000Z",
  });

  assert.equal(observation.observedAt, "2026-06-02T00:00:00.000Z");
  assert.equal(observation.pain_score, 0);
  assert.equal(observation.source_count, 1);
  assert.equal(observation.evidence_count, 0);
  assert.deepEqual(observation.source_types, ["discovery"]);
});

test("normalizes numeric fields and remains deterministic", () => {
  const row = {
    problem_title: "Deterministic row",
    pain_score: "120",
    revenue_score: Number.NaN,
    source_count: -4,
    evidence_count: "2.8",
    source_types: "X | Reddit | x",
  };

  const first = discoveredProblemRowToEvolutionObservation(row);
  const second = discoveredProblemRowToEvolutionObservation(row);

  assert.equal(first.pain_score, 10);
  assert.equal(first.revenue_score, 0);
  assert.equal(first.source_count, 3);
  assert.equal(first.evidence_count, 2);
  assert.deepEqual(first, second);
});
