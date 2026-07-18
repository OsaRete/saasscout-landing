import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLegacyOpportunityScore,
  getLegacyOpportunityScoreTone,
  legacyOpportunityScoreToProgressWidth,
  normalizeLegacyOpportunityScore,
} from "../lib/legacy-opportunity-score-presentation.ts";

test("formats decimal and integer legacy scores on the 1-10 presentation scale", () => {
  assert.equal(formatLegacyOpportunityScore(7.5), "7.5 / 10");
  assert.equal(formatLegacyOpportunityScore(8), "8 / 10");
});

test("maps legacy scores to progress widths between 0 and 100", () => {
  assert.equal(legacyOpportunityScoreToProgressWidth(7.5), 75);

  for (const value of [-100, -1, 0, 5, 10, 11, 100, null, undefined, NaN, Infinity]) {
    const width = legacyOpportunityScoreToProgressWidth(value);

    assert.ok(width >= 0, `${String(value)} should not map below 0`);
    assert.ok(width <= 100, `${String(value)} should not map above 100`);
  }
});

test("handles invalid values safely with the legacy fallback", () => {
  assert.equal(formatLegacyOpportunityScore(null), "0 / 10");
  assert.equal(formatLegacyOpportunityScore(undefined), "0 / 10");
  assert.equal(formatLegacyOpportunityScore(NaN), "0 / 10");
  assert.equal(formatLegacyOpportunityScore(Infinity), "0 / 10");
});

test("clamps legacy scores to the normalized 0-10 range", () => {
  assert.equal(normalizeLegacyOpportunityScore(-2), 0);
  assert.equal(formatLegacyOpportunityScore(-2), "0 / 10");
  assert.equal(normalizeLegacyOpportunityScore(12), 10);
  assert.equal(formatLegacyOpportunityScore(12), "10 / 10");
});

test("uses score-tone thresholds for the legacy 1-10 scale", () => {
  assert.equal(getLegacyOpportunityScoreTone(8).label, "Validated");
  assert.equal(getLegacyOpportunityScoreTone(7.5).label, "Promising");
  assert.equal(getLegacyOpportunityScoreTone(6.5).label, "Promising");
  assert.equal(getLegacyOpportunityScoreTone(6.49).label, "Emerging");
});

test("does not mutate input values while normalizing or formatting", () => {
  const scoreObject = Object.freeze({ valueOf: () => 7.5 });

  assert.equal(normalizeLegacyOpportunityScore(scoreObject), 7.5);
  assert.equal(formatLegacyOpportunityScore(scoreObject), "7.5 / 10");
  assert.deepEqual(scoreObject, { valueOf: scoreObject.valueOf });
});
