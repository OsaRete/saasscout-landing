import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildProblemObservation,
  buildProblemObservationBatch,
  serializeProblemObservation,
  validateProblemObservation,
  type ProblemObservationInput,
} from "../lib/knowledge/problem-observations.ts";

const baseInput = (overrides: Partial<ProblemObservationInput> = {}): ProblemObservationInput => ({
  title: " Manual client onboarding is slow ",
  observedAt: "2026-01-15T12:00:00.000Z",
  source: {
    sourceType: "external_source",
    sourceName: "Reddit",
    sourceUrl: "https://example.com/thread",
    sourceRank: 2,
    sourceId: "src_123",
    sourceTable: "discovered_problems",
  },
  provenance: {
    sourceTable: "discovered_problems",
    sourceId: "row_123",
    userId: "user_123",
  },
  evidenceSummary: "Founders complain that onboarding clients still requires manual follow-up.",
  market: "Agency Operations",
  audience: "Small agencies",
  nicheCategory: "Operations",
  affectedNiches: "Agencies | Consultants | Agencies",
  problemCluster: "client_onboarding",
  scores: {
    pain: 8,
    revenue: 7,
    urgency: 6,
    trend: 5,
    buyingSignal: 9,
    frequency: 8,
    sourceQuality: 7,
    opportunity: 82,
    intelligence: 7.4,
    confidence: 8.2,
  },
  firstSeenAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-15T12:00:00.000Z",
  preparedCount: 1,
  convertedCount: 0,
  sourceCount: 3,
  evidenceCount: 4,
  sourceTypes: ["reddit", "External_Source"],
  ...overrides,
});

describe("buildProblemObservation", () => {
  it("builds a validated append-only observation with normalized metadata and reused evolution scores", () => {
    const observation = buildProblemObservation(baseInput());

    assert.equal(observation.problem_title, "Manual client onboarding is slow");
    assert.equal(observation.normalized_title, "manual client onboarding is slow");
    assert.match(observation.observation_fingerprint, /^po:/);
    assert.equal(observation.timestamps.observed_at, "2026-01-15T12:00:00.000Z");
    assert.equal(observation.source_metadata.sourceTable, "discovered_problems");
    assert.equal(observation.provenance.source_table, "discovered_problems");
    assert.equal(observation.score_breakdown.opportunity, 8.2);
    assert.equal(observation.opportunity_score, 8.2);
    assert.equal(observation.confidence, 8.2);
    assert.equal(observation.source_quality, 7);
    assert.equal(observation.buying_signal, 9);
    assert.equal(observation.frequency, 8);
    assert.deepEqual(observation.niche_metadata.affectedNiches, ["agencies", "consultants"]);
    assert.deepEqual(observation.source_types, ["external source", "reddit"]);
    assert.deepEqual(validateProblemObservation(observation), { valid: true, errors: [] });
  });

  it("is deterministic for identical inputs", () => {
    const first = buildProblemObservation(baseInput());
    const second = buildProblemObservation(baseInput());

    assert.deepEqual(second, first);
  });

  it("uses market and audience in the deterministic observation fingerprint", () => {
    const first = buildProblemObservation(baseInput({ market: "Agency Operations" }));
    const second = buildProblemObservation(baseInput({ market: "Ecommerce Operations" }));

    assert.notEqual(second.observation_fingerprint, first.observation_fingerprint);
  });

  it("rejects observations that are not ready to persist", () => {
    assert.throws(
      () => buildProblemObservation(baseInput({ observedAt: "not-a-date" })),
      /timestamps\.observed_at must be a valid timestamp/
    );
  });
});

describe("buildProblemObservationBatch", () => {
  it("builds every observation in order", () => {
    const batch = buildProblemObservationBatch([
      baseInput({ title: "Problem A" }),
      baseInput({ title: "Problem B" }),
    ]);

    assert.deepEqual(batch.map((item) => item.problem_title), ["Problem A", "Problem B"]);
  });
});

describe("serializeProblemObservation", () => {
  it("returns a persistence-ready copy without mutating the original observation", () => {
    const observation = buildProblemObservation(baseInput());
    const serialized = serializeProblemObservation(observation);

    serialized.niche_metadata.affectedNiches.push("mutated");

    assert.notEqual(serialized, observation);
    assert.deepEqual(observation.niche_metadata.affectedNiches, ["agencies", "consultants"]);
    assert.equal(serialized.observation_fingerprint, observation.observation_fingerprint);
  });
});
