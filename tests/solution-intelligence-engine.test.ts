import assert from "node:assert/strict";
import test from "node:test";

import { SOLUTION_CATEGORIES, runSolutionIntelligence, type SolutionIntelligenceInput } from "../lib/engines/solution/index.ts";

function input(overrides: Partial<SolutionIntelligenceInput>): SolutionIntelligenceInput {
  return {
    runId: "test-run",
    problemTitle: "Operators struggle with repeated manual workflows",
    problemSummary: "Teams copy paste data between spreadsheets every week and need automation for a recurring business workflow.",
    affectedMarkets: ["B2B operations"],
    affectedAudiences: ["operations teams"],
    evidenceReferences: ["reddit: manual spreadsheet workflow", "interview: weekly copy paste process", "review: need automation"],
    evaluatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

test("evaluates all solution categories", () => {
  const result = runSolutionIntelligence(input({}));
  assert.equal(result.evaluations.length, SOLUTION_CATEGORIES.length);
  assert.equal(result.diagnostics.evaluatedCategoryCount, SOLUTION_CATEGORIES.length);
  assert.deepEqual(new Set(result.evaluations.map((evaluation) => evaluation.candidate.category)), new Set(SOLUTION_CATEGORIES));
});

test("does not default to SaaS when evidence supports human execution", () => {
  const result = runSolutionIntelligence(input({
    problemTitle: "Founders need expert implementation help",
    problemSummary: "Small businesses need a trusted human expert for custom case by case implementation, strategic diagnosis, and done-for-you managed support.",
    evidenceReferences: ["interview: need human expert", "sales call: custom implementation", "forum: done-for-you managed service"],
  }));
  assert.notEqual(result.recommendation?.recommendedCategory, "saas_software");
  assert.ok(["consulting", "service"].includes(result.recommendation?.recommendedCategory || ""));
});

test("recommends service or consulting when evidence suggests human execution", () => {
  const result = runSolutionIntelligence(input({
    problemTitle: "Compliance teams need expert remediation",
    problemSummary: "The work is sensitive, high trust, custom, and needs a human specialist to diagnose risk and implement fixes for each company.",
    evidenceReferences: ["call: human specialist required", "review: custom compliance remediation", "survey: will pay for trusted expert"],
  }));
  assert.ok(["consulting", "service"].includes(result.recommendation?.recommendedCategory || ""));
});

test("recommends SaaS or automation for repeated workflow software pain", () => {
  const result = runSolutionIntelligence(input({}));
  assert.ok(["automation", "saas_software"].includes(result.recommendation?.recommendedCategory || ""));
});

test("recommends physical product or hardware when physical-world constraints dominate", () => {
  const result = runSolutionIntelligence(input({
    problemTitle: "Warehouses cannot monitor damaged cold-chain packages",
    problemSummary: "Teams need a physical sensor device for offline warehouse inventory, packaging, shipping, and temperature measurement in the field.",
    affectedMarkets: ["logistics"],
    affectedAudiences: ["warehouse operators"],
    evidenceReferences: ["field report: physical sensor needed", "review: packaging temperature damage", "interview: offline warehouse device"],
  }));
  assert.ok(["hardware", "physical_product"].includes(result.recommendation?.recommendedCategory || ""));
});

test("returns insufficient evidence when input is weak", () => {
  const result = runSolutionIntelligence(input({
    problemTitle: "Vague problem",
    problemSummary: "Something is hard.",
    evidenceReferences: [],
  }));
  assert.equal(result.recommendation?.recommendedCategory, null);
  assert.ok(result.warnings.some((warning) => warning.includes("No solution category")));
});

test("ranking is deterministic", () => {
  const scenario = input({});
  assert.deepEqual(runSolutionIntelligence(scenario), runSolutionIntelligence(scenario));
});

test("diagnostics are populated", () => {
  const result = runSolutionIntelligence(input({}));
  assert.equal(result.diagnostics.evaluatedCategoryCount, SOLUTION_CATEGORIES.length);
  assert.equal(typeof result.diagnostics.rejectedCategoryCount, "number");
  assert.equal(result.diagnostics.recommendedCategory, result.recommendation?.recommendedCategory || null);
  assert.equal(result.diagnostics.fallbackUsed, false);
  assert.ok(Array.isArray(result.diagnostics.warnings));
});
