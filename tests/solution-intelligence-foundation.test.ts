import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptySolutionIntelligenceDiagnostics,
  SOLUTION_CATEGORIES,
  SOLUTION_CATEGORY_REGISTRY,
  type SolutionEvaluationScoreBreakdown,
  type SolutionIntelligenceDiagnostics,
} from "../lib/engines/solution/index.ts";

const expectedCategories = [
  "saas_software",
  "mobile_app",
  "api",
  "physical_product",
  "hardware",
  "marketplace",
  "service",
  "automation",
  "ai_product",
  "education_product",
  "consulting",
  "hybrid_model",
  "new_business_model",
];

test("all expected solution categories are defined", () => {
  assert.deepEqual([...SOLUTION_CATEGORIES], expectedCategories);
});

test("category registry has stable metadata for every category", () => {
  assert.deepEqual(Object.keys(SOLUTION_CATEGORY_REGISTRY), expectedCategories);

  for (const category of SOLUTION_CATEGORIES) {
    const definition = SOLUTION_CATEGORY_REGISTRY[category];
    assert.equal(definition.category, category);
    assert.ok(definition.label.length > 0);
    assert.ok(definition.description.length > 0);
    assert.ok(definition.typicalBusinessModels.length > 0);
    assert.ok(definition.commonStrengths.length > 0);
    assert.ok(definition.commonRisks.length > 0);
  }
});

test("score types support 0-10 style solution evaluation", () => {
  const scoreBreakdown: SolutionEvaluationScoreBreakdown = {
    problemSolutionFitScore: 10,
    willingnessToPayScore: 9,
    scalabilityScore: 8,
    implementationComplexityScore: 3,
    operationalComplexityScore: 4,
    distributionFitScore: 7,
    defensibilityScore: 6,
    evidenceStrengthScore: 5,
    confidenceScore: 8,
    overallSolutionScore: 7.2,
  };

  for (const score of Object.values(scoreBreakdown)) {
    assert.ok(score >= 0);
    assert.ok(score <= 10);
  }
});

test("diagnostics can represent incomplete evaluations", () => {
  const diagnostics: SolutionIntelligenceDiagnostics = createEmptySolutionIntelligenceDiagnostics({
    missingEvidenceCount: 3,
    warnings: ["No solution category has enough evidence for a recommendation."],
  });

  assert.equal(diagnostics.evaluatedCategoryCount, 0);
  assert.equal(diagnostics.rejectedCategoryCount, 0);
  assert.equal(diagnostics.recommendedCategory, null);
  assert.equal(diagnostics.fallbackUsed, false);
  assert.equal(diagnostics.missingEvidenceCount, 3);
});

