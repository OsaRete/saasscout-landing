import assert from "node:assert/strict";
import test from "node:test";

import { computeScanQualityDiagnostics } from "../lib/scan/quality-diagnostics.ts";
import type { ScanQualityDiagnosticEvidence } from "../lib/scan/quality-diagnostics.ts";
import type { GenerateOpportunitiesOutput, GeneratedOpportunity } from "../lib/scan/output-validation.ts";
import type { ScanGroundedClaim } from "../lib/scan/grounding.ts";

const evidence: ScanQualityDiagnosticEvidence[] = [
  { evidenceId: "ev-1", sourceKind: "pasted_evidence" },
  { evidenceId: "ev-2", sourceKind: "uploaded_document" },
  { evidenceId: "ev-3", sourceKind: "external_snippet" },
];
const evidenceWithUnused = [...evidence, { evidenceId: "ev-4", sourceKind: "external_snippet" as const }];

function grounded(text: string, evidenceId = "ev-1"): ScanGroundedClaim {
  return { text, groundingMode: "evidence", evidenceRefs: [{ evidenceId, relevance: "primary" }] };
}

function inferred(text: string, reason = "Pattern inferred from supplied aggregate evidence context."): ScanGroundedClaim {
  return { text, groundingMode: "inference", evidenceRefs: [], inferenceReason: reason };
}

function opportunity(title: string, claim: ScanGroundedClaim): GeneratedOpportunity {
  return {
    title,
    score: 8,
    pain: `${title} pain mentions Acme Corp and 42% reporting delays in the market.`,
    customer: "Finance Ops teams at Acme Corp-like B2B SaaS companies",
    mvp: "Build a focused workflow with Salesforce import, CSV review, and Slack alerts.",
    pricing: "$49 per month per team",
    difficulty: "Medium",
    problem_summary: "Problem is grounded in repeated reporting delays and approval bottlenecks.",
    target_customer: "B2B finance operators",
    mvp_roadmap: "Week 1 import, Week 2 workflow, Week 3 alerts",
    validation_questions: "Would this remove the weekly reporting bottleneck?",
    landing_page_idea: "Report approval automation for finance teams",
    acquisition_channels: "LinkedIn finance communities and Xero partner forums",
    grounding: {
      pain: claim,
      customer: grounded("Finance operators report slow weekly reporting.", "ev-2"),
      rationale: grounded("The market shows repeated reporting delays across teams.", "ev-3"),
      mvp: grounded("CSV and Slack workflows are explicitly referenced by users.", "ev-1"),
      pricing: grounded("Users mention budget for reporting automation.", "ev-2"),
      score: grounded("Multiple source types support the opportunity score.", "ev-3"),
      difficulty: grounded("Integration requirements are moderate.", "ev-1"),
    },
  };
}

function singleSourceOpportunity(title: string, claim: ScanGroundedClaim, evidenceId = "ev-1"): GeneratedOpportunity {
  const item = opportunity(title, claim);
  item.grounding.customer = grounded("Single source supports the customer claim.", evidenceId);
  item.grounding.rationale = grounded("Single source supports the rationale claim.", evidenceId);
  item.grounding.mvp = grounded("Single source supports the mvp claim.", evidenceId);
  item.grounding.pricing = grounded("Single source supports the pricing claim.", evidenceId);
  item.grounding.score = grounded("Single source supports the score claim.", evidenceId);
  item.grounding.difficulty = grounded("Single source supports the difficulty claim.", evidenceId);
  return item;
}

function output(opportunities: GeneratedOpportunity[]): GenerateOpportunitiesOutput {
  return { opportunities, groundingSummary: { totalClaims: 0, evidenceGroundedClaims: 0, inferenceClaims: 0, unsupportedClaims: 0, groundingCoverage: 0, distinctEvidenceIdsReferenced: 0, contradictingReferenceCount: 0, invalidReferenceCount: 0 } };
}

test("same evidence reused across claims is not a within-claim duplicate", () => {
  const diagnostics = computeScanQualityDiagnostics({
    output: output([
      singleSourceOpportunity("One evidence A", grounded("Reporting delays increased in finance operations.", "ev-1")),
      singleSourceOpportunity("One evidence B", grounded("Approval delays increased in finance operations.", "ev-1")),
    ]),
    evidence: [{ evidenceId: "ev-1", sourceKind: "pasted_evidence" }],
  });

  assert.equal(diagnostics.evidenceDiagnostics.duplicateReferencesWithinClaims, 0);
  assert.ok(diagnostics.evidenceDiagnostics.reusedEvidenceAcrossClaims > 0);
  assert.equal(diagnostics.evidenceDiagnostics.evidenceConcentration, 1);
});

test("same evidence repeated twice inside one claim counts as duplicate", () => {
  const repeated: ScanGroundedClaim = {
    text: "Evidence references repeat one private source inside the same claim.",
    groundingMode: "evidence",
    evidenceRefs: [{ evidenceId: "ev-1" }, { evidenceId: "ev-1" }, { evidenceId: "missing-ev" }],
  };
  const diagnostics = computeScanQualityDiagnostics({ output: output([opportunity("Bad references", repeated)]), evidence: evidenceWithUnused });

  assert.equal(diagnostics.evidenceDiagnostics.duplicateReferencesWithinClaims, 1);
  assert.deepEqual(diagnostics.evidenceDiagnostics.invalidReferences, ["missing-ev"]);
  assert.ok(diagnostics.evidenceDiagnostics.missingReferences.includes("ev-4"));
});

test("three evidence IDs from one source kind separates independent count from source-kind diversity", () => {
  const sameKindEvidence: ScanQualityDiagnosticEvidence[] = ["ev-1", "ev-2", "ev-3"].map((evidenceId) => ({ evidenceId, sourceKind: "pasted_evidence" as const }));
  const diagnostics = computeScanQualityDiagnostics({
    output: output([
      opportunity("Pasted one", grounded("First pasted source supports reporting delays.", "ev-1")),
      opportunity("Pasted two", grounded("Second pasted source supports approval delays.", "ev-2")),
      opportunity("Pasted three", grounded("Third pasted source supports reconciliation delays.", "ev-3")),
    ]),
    evidence: sameKindEvidence,
  });

  assert.equal(diagnostics.evidenceDiagnostics.independentEvidenceCount, 3);
  assert.equal(diagnostics.evidenceDiagnostics.evidenceCoverage, 1);
  assert.equal(diagnostics.evidenceDiagnostics.evidenceSourceKindDiversity, 0.2);
});

test("pasted, uploaded, and external evidence increase source-kind diversity", () => {
  const diagnostics = computeScanQualityDiagnostics({
    output: output([
      opportunity("Mixed one", grounded("Pasted evidence supports reporting delays.", "ev-1")),
      opportunity("Mixed two", grounded("Uploaded evidence supports approval delays.", "ev-2")),
      opportunity("Mixed three", grounded("External evidence supports reconciliation delays.", "ev-3")),
    ]),
    evidence,
  });

  assert.equal(diagnostics.evidenceDiagnostics.independentEvidenceCount, 3);
  assert.equal(diagnostics.evidenceDiagnostics.evidenceSourceKindDiversity, 0.6);
});

test("one source supporting every claim shows complete coverage but full concentration", () => {
  const diagnostics = computeScanQualityDiagnostics({ output: output([singleSourceOpportunity("Single source", grounded("One source supports every generated claim.", "ev-1"))]), evidence: [{ evidenceId: "ev-1", sourceKind: "pasted_evidence" }] });

  assert.equal(diagnostics.evidenceDiagnostics.evidenceCoverage, 1);
  assert.equal(diagnostics.evidenceDiagnostics.independentEvidenceCount, 1);
  assert.equal(diagnostics.evidenceDiagnostics.evidenceSourceKindDiversity, 0.2);
  assert.equal(diagnostics.evidenceDiagnostics.evidenceConcentration, 1);
});

test("duplicated claims do not inflate contradiction counts", () => {
  const duplicate = opportunity("Duplicate claim", grounded("Finance teams report high reporting workload.", "ev-1"));
  const diagnostics = computeScanQualityDiagnostics({ output: output([duplicate, duplicate]), evidence });

  assert.ok(diagnostics.contradictionDiagnostics.duplicatedClaims > 0);
  assert.equal(diagnostics.contradictionDiagnostics.contradictionCount, 0);
});

test("contradictory claims are counted independently from duplication", () => {
  const first = opportunity("Churn increase monitor", grounded("Customer churn is increasing in the finance market.", "ev-1"));
  const second = opportunity("Churn decrease monitor", grounded("Customer churn is decreasing in the finance market.", "ev-2"));
  for (const [index, item] of [first, second].entries()) {
    item.grounding.customer = grounded(`Unique customer claim ${index} for churn workflow.`, "ev-2");
    item.grounding.rationale = grounded(`Unique rationale claim ${index} for churn workflow.`, "ev-3");
    item.grounding.mvp = grounded(`Unique mvp claim ${index} for churn workflow.`, "ev-1");
    item.grounding.pricing = grounded(`Unique pricing claim ${index} for churn workflow.`, "ev-2");
    item.grounding.score = grounded(`Unique score claim ${index} for churn workflow.`, "ev-3");
    item.grounding.difficulty = grounded(`Unique difficulty claim ${index} for churn workflow.`, "ev-1");
  }
  const diagnostics = computeScanQualityDiagnostics({ output: output([first, second]), evidence });

  assert.ok(diagnostics.contradictionDiagnostics.contradictionCount > 0);
  assert.equal(diagnostics.contradictionDiagnostics.contradictionPairCount, diagnostics.contradictionDiagnostics.contradictionCount);
  assert.equal(diagnostics.contradictionDiagnostics.duplicatedClaims, 0);
});

test("duplicated opportunities remain separate from contradictions", () => {
  const duplicate = opportunity("Repeated opportunity", grounded("Finance teams report repeated approval delays.", "ev-1"));
  const diagnostics = computeScanQualityDiagnostics({ output: output([duplicate, duplicate]), evidence });

  assert.ok(diagnostics.contradictionDiagnostics.duplicatedOpportunities > 0);
  assert.equal(diagnostics.contradictionDiagnostics.contradictionCount, 0);
});

test("contract completeness and heuristic topic coverage are separate metrics", () => {
  const sparse = opportunity("Sparse", inferred("Teams may need a better tool."));
  sparse.pricing = "";
  sparse.validation_questions = "";
  sparse.pain = "";
  const diagnostics = computeScanQualityDiagnostics({ output: output([sparse]), evidence });

  assert.ok(diagnostics.schemaCompleteness.contractFieldCompleteness.missingFields.includes("pain"));
  assert.ok(diagnostics.schemaCompleteness.contractFieldCompleteness.completeness < 1);
  assert.ok(diagnostics.schemaCompleteness.heuristicTopicCoverage.missingTopics.includes("competition"));
  assert.ok(diagnostics.schemaCompleteness.heuristicTopicCoverage.coverage < 1);
});

test("quality summary remains compact and excludes private claim text, evidence content, and inference reasons", () => {
  const privateText = "PRIVATE_CUSTOMER_CONTENT_123";
  const privateReason = "PRIVATE_INFERENCE_REASON_456";
  const diagnostics = computeScanQualityDiagnostics({ output: output([opportunity("Safe logging", inferred(privateText, privateReason))]), evidence });
  const serialized = JSON.stringify(diagnostics.qualitySummary);

  assert.equal(serialized.includes(privateText), false);
  assert.equal(serialized.includes(privateReason), false);
  assert.equal(serialized.includes("normalizedContent"), false);
  assert.deepEqual(Object.keys(diagnostics.qualitySummary).sort(), [
    "contractFieldCompleteness",
    "contradictionCount",
    "duplicatedClaims",
    "duplicatedOpportunities",
    "evidenceConcentration",
    "evidenceCoverage",
    "evidenceSourceKindDiversity",
    "genericityIndicators",
    "groundingCoverage",
    "heuristicTopicCoverage",
    "independentEvidenceCount",
    "sourceCoverage",
    "specificityScore",
    "unsupportedClaims",
  ].sort());
});
