import assert from "node:assert/strict";
import test from "node:test";

import {
  ScanOutputValidationError,
  validateAnalyzeEvidenceOutput,
  validateGenerateOpportunitiesOutput,
} from "../lib/scan/output-validation.ts";

const evidence = { text: "Supported", groundingMode: "evidence", evidenceRefs: [{ evidenceId: "scan-user-evidence", relevance: "primary" }] };
const inference = { text: "Inferred", groundingMode: "inference", evidenceRefs: [], inferenceReason: "This is a recommendation inferred from the evidence." };

function analyze(overrides = {}) {
  return {
    inferred_market: "Agency reporting",
    audience_summary: "Agency operators",
    evidence_summary: "Operators mention reporting pain",
    pain_points: "Manual reports | Missed updates",
    repeated_patterns: "Weekly reporting",
    workflow_problems: "Copy paste dashboards",
    willingness_to_pay_signals: "No clear willingness-to-pay signals found",
    opportunity_angles: "Reporting automation | Client portal",
    confidence_score: 7.2,
    grounding: {
      inferred_market: evidence,
      audience_summary: evidence,
      evidence_summary: evidence,
      pain_points: [evidence, evidence],
      repeated_patterns: [evidence],
      workflow_problems: [evidence],
      willingness_to_pay_signals: [inference],
      opportunity_angles: [inference, inference],
      confidence_score: evidence,
    },
    ...overrides,
  };
}

function opportunity(overrides = {}) {
  return {
    title: "Reporting CRM",
    score: 8,
    pain: "Agencies lose time on reports.",
    customer: "Agency operators",
    mvp: "Report builder",
    pricing: "$29/mo",
    difficulty: "Medium",
    problem_summary: "Reporting is fragmented.",
    target_customer: "Small agencies",
    mvp_roadmap: "Import | Build | Send",
    validation_questions: "Do reports take time?",
    landing_page_idea: "Ship reports faster.",
    acquisition_channels: "Communities",
    grounding: { pain: evidence, customer: evidence, rationale: inference, mvp: inference, pricing: inference, score: inference, difficulty: inference },
    ...overrides,
  };
}

test("validates fully grounded and mixed Analyze Evidence outputs", () => {
  const output = validateAnalyzeEvidenceOutput(analyze());
  assert.equal(output.inferred_market, "Agency reporting");
  assert.equal(output.groundingSummary.totalClaims, 11);
  assert.equal(output.grounding.willingness_to_pay_signals[0].groundingMode, "inference");
});

test("rejects Analyze Evidence grounding mismatch and invented evidence IDs", () => {
  assert.throws(() => validateAnalyzeEvidenceOutput(analyze({ grounding: { ...analyze().grounding, pain_points: [evidence] } })), ScanOutputValidationError);
  assert.throws(() => validateAnalyzeEvidenceOutput(analyze({ grounding: { ...analyze().grounding, confidence_score: { ...evidence, evidenceRefs: [{ evidenceId: "invented" }] } } })), /validation/);
});

test("validates exactly three grounded opportunities", () => {
  const output = validateGenerateOpportunitiesOutput({ opportunities: [opportunity(), opportunity({ title: "Portal" }), opportunity({ title: "Dashboard" })] });
  assert.equal(output.opportunities.length, 3);
  assert.equal(output.groundingSummary.totalClaims, 21);
});

test("rejects missing opportunity grounding, score rationale issues, count mismatch, and unknown pricing evidence", () => {
  assert.throws(() => validateGenerateOpportunitiesOutput({ opportunities: [opportunity(), opportunity(), { ...opportunity(), grounding: undefined }] }), ScanOutputValidationError);
  assert.throws(() => validateGenerateOpportunitiesOutput({ opportunities: [opportunity(), opportunity()] }), ScanOutputValidationError);
  assert.throws(() => validateGenerateOpportunitiesOutput({ opportunities: [opportunity(), opportunity(), opportunity({ grounding: { ...opportunity().grounding, score: { text: "score", groundingMode: "inference", evidenceRefs: [] } } })] }), ScanOutputValidationError);
  assert.throws(() => validateGenerateOpportunitiesOutput({ opportunities: [opportunity(), opportunity(), opportunity({ grounding: { ...opportunity().grounding, pricing: { text: "pricing", groundingMode: "evidence", evidenceRefs: [{ evidenceId: "invented" }] } } })] }), ScanOutputValidationError);
});
