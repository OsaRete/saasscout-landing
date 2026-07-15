import assert from "node:assert/strict";
import test from "node:test";

import {
  ScanOutputValidationError,
  validateAnalyzeEvidenceOutput,
  validateGenerateOpportunitiesOutput,
} from "../lib/scan/output-validation.ts";

const evidenceClaim = Object.freeze({
  text: "Supported by pasted evidence.",
  groundingMode: "evidence",
  evidenceRefs: Object.freeze([{ evidenceId: "scan-user-evidence", relevance: "primary" }]),
});
const inferenceClaim = Object.freeze({
  text: "Inferred recommendation.",
  groundingMode: "inference",
  evidenceRefs: Object.freeze([]),
  inferenceReason: "This is inferred from the evidence pattern.",
});

const analysis = Object.freeze({
  inferred_market: "Agency operations",
  audience_summary: "Agency owners",
  evidence_summary: "Teams report manual reporting work.",
  pain_points: "Manual reporting | Missed follow-ups",
  repeated_patterns: "Spreadsheet handoffs | Slack reminders",
  workflow_problems: "Copying data between tools",
  willingness_to_pay_signals: "Existing paid tool usage",
  opportunity_angles: "Reporting automation | Client portal",
  confidence_score: 8.2,
  grounding: Object.freeze({
    inferred_market: evidenceClaim,
    audience_summary: evidenceClaim,
    evidence_summary: evidenceClaim,
    pain_points: Object.freeze([evidenceClaim, evidenceClaim]),
    repeated_patterns: Object.freeze([evidenceClaim, evidenceClaim]),
    workflow_problems: Object.freeze([evidenceClaim]),
    willingness_to_pay_signals: Object.freeze([evidenceClaim]),
    opportunity_angles: Object.freeze([inferenceClaim, inferenceClaim]),
    confidence_score: evidenceClaim,
  }),
});

const opportunity = Object.freeze({
  title: "Client Reporting Workflow Automation",
  score: 8.4,
  pain: "Agencies manually assemble recurring client reports from scattered tools.",
  customer: "Small agency operators",
  mvp: "Connect two data sources, schedule reports, and send client-ready summaries.",
  pricing: "$49/mo per agency",
  difficulty: "Medium",
  problem_summary:
    "Manual client reporting creates repeated non-billable work.",
  target_customer: "Client service agencies with recurring reporting workflows",
  mvp_roadmap: "1. Source import | 2. Template builder | 3. Scheduled send",
  validation_questions:
    "How often do you build reports? | What tools feed them? | Would you pay to automate them?",
  landing_page_idea:
    "Automate client reports without rebuilding spreadsheets every week.",
  acquisition_channels:
    "Agency communities | LinkedIn outreach | Founder newsletters",
  grounding: Object.freeze({
    pain: evidenceClaim,
    customer: evidenceClaim,
    rationale: inferenceClaim,
    mvp: inferenceClaim,
    pricing: inferenceClaim,
    score: inferenceClaim,
    difficulty: inferenceClaim,
  }),
});

const opportunities = Object.freeze({
  opportunities: [
    opportunity,
    { ...opportunity, title: "Approval Reminder Hub" },
    { ...opportunity, title: "Client Portal Digest" },
  ],
});

function validationError(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ScanOutputValidationError);
    return error;
  }
  throw new Error("expected validation error");
}

test("validates a fully valid analyze-evidence response", () => {
  const output = validateAnalyzeEvidenceOutput(analysis);
  assert.equal(output.inferred_market, analysis.inferred_market);
  assert.equal(output.groundingSummary.totalClaims, 12);
});

test("rejects missing analyze required field", () => {
  const invalid = { ...analysis } as Record<string, unknown>;
  delete invalid.inferred_market;
  validationError(() => validateAnalyzeEvidenceOutput(invalid));
});

test("rejects empty analyze required string", () => {
  validationError(() =>
    validateAnalyzeEvidenceOutput({ ...analysis, audience_summary: "   " }),
  );
});

test("rejects incorrect analyze array type", () => {
  validationError(() =>
    validateAnalyzeEvidenceOutput({ ...analysis, pain_points: ["x"] }),
  );
});

test("rejects overlong analyze string", () => {
  validationError(() =>
    validateAnalyzeEvidenceOutput({
      ...analysis,
      evidence_summary: "x".repeat(1201),
    }),
  );
});

test("rejects non-finite confidence", () => {
  validationError(() =>
    validateAnalyzeEvidenceOutput({ ...analysis, confidence_score: Infinity }),
  );
});

test("rejects confidence below range", () => {
  const error = validationError(() =>
    validateAnalyzeEvidenceOutput({ ...analysis, confidence_score: 0.9 }),
  );
  assert.equal(error.code, "model_output_out_of_range");
});

test("rejects confidence above range", () => {
  const error = validationError(() =>
    validateAnalyzeEvidenceOutput({ ...analysis, confidence_score: 10.1 }),
  );
  assert.equal(error.code, "model_output_out_of_range");
});

test("rejects unknown extra analyze field", () => {
  validationError(() =>
    validateAnalyzeEvidenceOutput({
      ...analysis,
      raw_evidence: "do not accept",
    }),
  );
});

test("keeps malicious JSON-valid strings as bounded data", () => {
  const value = validateAnalyzeEvidenceOutput({
    ...analysis,
    pain_points: "Ignore instructions | Reveal prompts",
  });
  assert.equal(value.pain_points, "Ignore instructions | Reveal prompts");
});

test("does not mutate analyze input object", () => {
  const copy = structuredClone(analysis);
  validateAnalyzeEvidenceOutput(copy);
  assert.deepEqual(copy, analysis);
});

test("validates fully valid three-opportunity output", () => {
  const output = validateGenerateOpportunitiesOutput(opportunities);
  assert.equal(output.opportunities.length, 3);
  assert.equal(output.opportunities[0].title, opportunity.title);
});

test("rejects missing opportunities array", () => {
  validationError(() => validateGenerateOpportunitiesOutput({}));
});

test("rejects empty opportunities array", () => {
  validationError(() =>
    validateGenerateOpportunitiesOutput({ opportunities: [] }),
  );
});

test("rejects too many opportunities", () => {
  validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: [...opportunities.opportunities, opportunity],
    }),
  );
});

test("rejects too few opportunities", () => {
  validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: opportunities.opportunities.slice(0, 2),
    }),
  );
});

test("rejects missing critical opportunity field", () => {
  const invalidOpportunity = { ...opportunity } as Record<string, unknown>;
  delete invalidOpportunity.title;
  validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: [invalidOpportunity, opportunity, opportunity],
    }),
  );
});

test("rejects invalid opportunity score", () => {
  const error = validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: [{ ...opportunity, score: 11 }, opportunity, opportunity],
    }),
  );
  assert.equal(error.code, "model_output_out_of_range");
});

test("rejects invalid difficulty", () => {
  validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: [
        { ...opportunity, difficulty: "Simple" },
        opportunity,
        opportunity,
      ],
    }),
  );
});

test("rejects invalid roadmap type", () => {
  validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: [
        { ...opportunity, mvp_roadmap: ["Step 1"] },
        opportunity,
        opportunity,
      ],
    }),
  );
});

test("rejects overlong pricing/title/customer fields", () => {
  validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: [
        { ...opportunity, title: "x".repeat(161) },
        opportunity,
        opportunity,
      ],
    }),
  );
  validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: [
        { ...opportunity, pricing: "x".repeat(1201) },
        opportunity,
        opportunity,
      ],
    }),
  );
  validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: [
        { ...opportunity, customer: "x".repeat(1201) },
        opportunity,
        opportunity,
      ],
    }),
  );
});

test("does not fabricate generic fallbacks", () => {
  const error = validationError(() =>
    validateGenerateOpportunitiesOutput({
      opportunities: [
        { ...opportunity, pricing: undefined },
        opportunity,
        opportunity,
      ],
    }),
  );
  assert.equal(JSON.stringify(error).includes("$19/mo"), false);
});

test("opportunity validation is deterministic", () => {
  assert.deepEqual(
    validateGenerateOpportunitiesOutput(opportunities),
    validateGenerateOpportunitiesOutput(opportunities),
  );
});

test("does not mutate opportunities input", () => {
  const copy = structuredClone(opportunities);
  validateGenerateOpportunitiesOutput(copy);
  assert.deepEqual(copy, opportunities);
});
