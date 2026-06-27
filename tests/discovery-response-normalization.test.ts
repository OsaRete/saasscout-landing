import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cleanJsonResponse,
  clampScore,
  normalizeProblems,
  type DiscoveredProblem,
} from "../lib/intelligence/discovery-response-normalization.ts";

const completeProblem = (overrides: Partial<DiscoveredProblem> = {}): DiscoveredProblem => ({
  problem_title: "Manual onboarding is slow",
  problem_summary: "Teams lose time coordinating onboarding manually.",
  affected_niches: "Agencies | Consultants",
  suggested_solutions: "Client onboarding portal | Automation assistant",
  pain_score: 8,
  revenue_score: 7,
  urgency_score: 6,
  trend_score: 5,
  buying_signal_score: 4,
  frequency_score: 3,
  source_quality_score: 9,
  opportunity_score: 82,
  problem_cluster: "Client Operations",
  build_difficulty: "Medium",
  source_evidence: "Multiple sources mention manual onboarding friction.",
  ...overrides,
});

describe("cleanJsonResponse", () => {
  it("removes markdown JSON fences", () => {
    assert.equal(cleanJsonResponse('```json\n{"summary":"ok"}\n```'), '{"summary":"ok"}');
  });
});

describe("clampScore", () => {
  it("clamps values between 1 and 10 by default", () => {
    assert.equal(clampScore(0), 1);
    assert.equal(clampScore(11), 10);
    assert.equal(clampScore(6), 6);
  });

  it("supports custom min/max values", () => {
    assert.equal(clampScore(0, 50, 10, 100), 10);
    assert.equal(clampScore(120, 50, 10, 100), 100);
    assert.equal(clampScore(70, 50, 10, 100), 70);
  });
});

describe("normalizeProblems", () => {
  it("limits output to 8 problems", () => {
    const problems = Array.from({ length: 9 }, (_, index) =>
      completeProblem({ problem_title: `Problem ${index + 1}` })
    );

    assert.equal(normalizeProblems(problems).length, 8);
  });

  it("applies default title, summary, affected niches, suggested solutions and source evidence when fields are missing", () => {
    const [problem] = normalizeProblems([
      completeProblem({
        problem_title: "",
        problem_summary: "",
        affected_niches: "",
        suggested_solutions: "",
        source_evidence: "",
      }),
    ]);

    assert.equal(problem.problem_title, "Market Problem 1");
    assert.equal(
      problem.problem_summary,
      "A repeated market problem was detected from external and internal signals."
    );
    assert.equal(problem.affected_niches, "Small businesses | Solo founders | Service providers");
    assert.equal(
      problem.suggested_solutions,
      "Workflow automation tool | Lightweight operating system | AI assistant"
    );
    assert.equal(
      problem.source_evidence,
      "External and internal signals suggest repeated workflow friction."
    );
  });

  it("clamps all 1-10 score fields", () => {
    const [problem] = normalizeProblems([
      completeProblem({
        pain_score: 0,
        revenue_score: 11,
        urgency_score: -3,
        trend_score: 12,
        buying_signal_score: Number.NaN,
        frequency_score: Number.POSITIVE_INFINITY,
        source_quality_score: 6,
      }),
    ]);

    assert.equal(problem.pain_score, 1);
    assert.equal(problem.revenue_score, 10);
    assert.equal(problem.urgency_score, 1);
    assert.equal(problem.trend_score, 10);
    assert.equal(problem.buying_signal_score, 7);
    assert.equal(problem.frequency_score, 7);
    assert.equal(problem.source_quality_score, 6);
  });

  it("clamps opportunity_score between 1 and 100", () => {
    assert.equal(normalizeProblems([completeProblem({ opportunity_score: 0 })])[0].opportunity_score, 70);
    assert.equal(normalizeProblems([completeProblem({ opportunity_score: -5 })])[0].opportunity_score, 1);
    assert.equal(normalizeProblems([completeProblem({ opportunity_score: 120 })])[0].opportunity_score, 100);
  });

  it("normalizes invalid build_difficulty to Medium", () => {
    assert.equal(normalizeProblems([completeProblem({ build_difficulty: "Impossible" })])[0].build_difficulty, "Medium");
  });

  it("preserves valid Easy, Medium and Hard values", () => {
    assert.deepEqual(
      ["Easy", "Medium", "Hard"].map((build_difficulty) =>
        normalizeProblems([completeProblem({ build_difficulty })])[0].build_difficulty
      ),
      ["Easy", "Medium", "Hard"]
    );
  });

  it("preserves the existing output shape expected by discovered_problems inserts", () => {
    const [problem] = normalizeProblems([completeProblem()]);

    assert.deepEqual(Object.keys(problem), [
      "problem_title",
      "problem_summary",
      "affected_niches",
      "suggested_solutions",
      "pain_score",
      "revenue_score",
      "urgency_score",
      "trend_score",
      "buying_signal_score",
      "frequency_score",
      "source_quality_score",
      "opportunity_score",
      "problem_cluster",
      "build_difficulty",
      "source_evidence",
    ]);
  });
});
