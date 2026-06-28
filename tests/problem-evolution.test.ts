import assert from "node:assert/strict";
import test from "node:test";

import { classifyProblemEvolution } from "../lib/knowledge/evolution/index.ts";
import type { ProblemEvolutionObservation } from "../lib/knowledge/evolution/index.ts";

const now = "2026-06-28T00:00:00.000Z";

function observation(observedAt: string, score: number, sourceTypes: string[] = ["reddit"]): ProblemEvolutionObservation {
  return {
    observedAt,
    pain_score: score,
    revenue_score: score,
    urgency_score: score,
    trend_score: score,
    buying_signal_score: score,
    frequency_score: score,
    source_quality_score: score,
    opportunity_score: score * 10,
    intelligence_score: score * 10,
    evidence_count: 1,
    source_count: sourceTypes.length,
    source_types: sourceTypes,
  };
}

test("classifies unknown with no observations", () => {
  const assessment = classifyProblemEvolution({ observations: [], now });
  assert.equal(assessment.lifecycleState, "unknown");
  assert.deepEqual(assessment.reasons, ["insufficient_observations", "sparse_low_quality_evidence", "no_feedback_signal"]);
});

test("classifies new with a recent first observation", () => {
  const assessment = classifyProblemEvolution({ observations: [observation("2026-06-20T00:00:00.000Z", 6)], now });
  assert.equal(assessment.lifecycleState, "new");
  assert.ok(assessment.reasons.includes("recent_first_seen"));
});

test("classifies recurring with repeated observations", () => {
  const assessment = classifyProblemEvolution({ observations: [observation("2026-05-10T00:00:00.000Z", 6), observation("2026-06-20T00:00:00.000Z", 6)], now });
  assert.equal(assessment.lifecycleState, "recurring");
  assert.ok(assessment.reasons.includes("multiple_observations"));
});

test("classifies growing when recent scores increase", () => {
  const assessment = classifyProblemEvolution({ observations: [observation("2026-04-01T00:00:00.000Z", 4), observation("2026-04-10T00:00:00.000Z", 4), observation("2026-06-20T00:00:00.000Z", 8), observation("2026-06-21T00:00:00.000Z", 8)], now });
  assert.equal(assessment.lifecycleState, "growing");
  assert.ok(assessment.reasons.includes("recent_momentum_exceeds_history"));
});

test("classifies declining only with enough historical data", () => {
  const insufficient = classifyProblemEvolution({ observations: [observation("2026-04-01T00:00:00.000Z", 8), observation("2026-06-20T00:00:00.000Z", 3)], now });
  assert.notEqual(insufficient.lifecycleState, "declining");

  const assessment = classifyProblemEvolution({ observations: [observation("2026-04-01T00:00:00.000Z", 8), observation("2026-04-10T00:00:00.000Z", 8), observation("2026-06-20T00:00:00.000Z", 3), observation("2026-06-21T00:00:00.000Z", 3)], now });
  assert.equal(assessment.lifecycleState, "declining");
  assert.ok(assessment.reasons.includes("recent_momentum_below_history"));
});

test("classifies validated with converted_count or strong evidence", () => {
  assert.equal(classifyProblemEvolution({ observations: [observation("2026-06-20T00:00:00.000Z", 4)], converted_count: 1, now }).lifecycleState, "validated");
  const assessment = classifyProblemEvolution({ observations: Array.from({ length: 5 }, (_, index) => observation(`2026-06-2${index}T00:00:00.000Z`, 8, ["reddit", "github"])), evidence_count: 5, source_types: ["reddit", "github"], now });
  assert.equal(assessment.lifecycleState, "validated");
  assert.ok(assessment.reasons.includes("strong_recurring_evidence"));
});

test("classifies weak with sparse low-quality evidence", () => {
  const assessment = classifyProblemEvolution({ observations: [observation("2026-05-10T00:00:00.000Z", 2)], now });
  assert.equal(assessment.lifecycleState, "weak");
  assert.ok(assessment.reasons.includes("sparse_low_quality_evidence"));
  assert.ok(assessment.reasons.includes("low_signal_strength"));
});

test("produces deterministic reasons and scores", () => {
  const input = { observations: [observation("2026-05-10T00:00:00.000Z", 6), observation("2026-06-20T00:00:00.000Z", 7, ["reddit", "github"])], prepared_count: 1, now };
  assert.deepEqual(classifyProblemEvolution(input), classifyProblemEvolution(input));
});
