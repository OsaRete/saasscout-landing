import assert from "node:assert/strict";
import test from "node:test";

import { computeScanQualityDiagnostics } from "../lib/scan/quality-diagnostics.ts";
import type { GenerateOpportunitiesOutput, GeneratedOpportunity } from "../lib/scan/output-validation.ts";
import type { ScanGroundedClaim } from "../lib/scan/grounding.ts";

const evidence = [
  { evidenceId: "ev-1", sourceKind: "pasted_evidence" as const },
  { evidenceId: "ev-2", sourceKind: "uploaded_document" as const },
  { evidenceId: "ev-3", sourceKind: "external_snippet" as const },
];
const evidenceWithUnused = [...evidence, { evidenceId: "ev-4", sourceKind: "external_snippet" as const }];

function grounded(text: string, evidenceId = "ev-1"): ScanGroundedClaim {
  return { text, groundingMode: "evidence", evidenceRefs: [{ evidenceId, relevance: "primary" }] };
}

function inferred(text: string, reason = "Pattern inferred from the supplied evidence context."): ScanGroundedClaim {
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

function output(opportunities: GeneratedOpportunity[]): GenerateOpportunitiesOutput {
  return { opportunities, groundingSummary: { totalClaims: 0, evidenceGroundedClaims: 0, inferenceClaims: 0, unsupportedClaims: 0, groundingCoverage: 0, distinctEvidenceIdsReferenced: 0, contradictingReferenceCount: 0, invalidReferenceCount: 0 } };
}

test("computes high-quality diagnostics for fully grounded scan responses", () => {
  const diagnostics = computeScanQualityDiagnostics({
    output: output([
      opportunity("Reporting workflow monitor", grounded("Reporting delays increased by 42% at Acme Corp.", "ev-1")),
      opportunity("Approval bottleneck alerts", grounded("Approval bottlenecks are reported by finance teams.", "ev-2")),
      opportunity("CSV reconciliation assistant", grounded("CSV reconciliation is cited as a repeated workflow problem.", "ev-3")),
    ]),
    evidence,
    derivedAnalysisUsed: true,
  });

  assert.equal(diagnostics.groundingCoverage.evidenceGroundedPercentage, 1);
  assert.equal(diagnostics.groundingCoverage.inferenceClaims, 0);
  assert.equal(diagnostics.evidenceDiagnostics.invalidReferences.length, 0);
  assert.equal(diagnostics.evidenceDiagnostics.missingReferences.length, 0);
  assert.equal(diagnostics.sourceCoverage.userEvidenceUsed, 1);
  assert.equal(diagnostics.sourceCoverage.uploadedDocumentsUsed, 1);
  assert.equal(diagnostics.sourceCoverage.externalSourcesUsed, 1);
  assert.equal(diagnostics.sourceCoverage.derivedAnalysisUsed, 1);
  assert.ok(diagnostics.specificityMetrics.specificityScore > 0.3);
});

test("measures inference-heavy and incomplete schema outputs without rejecting them", () => {
  const diagnostics = computeScanQualityDiagnostics({
    output: output([
      opportunity("Generic helper", inferred("Teams may need a better tool.")),
      opportunity("Generic helper two", inferred("Users may benefit from workflow automation.")),
      opportunity("Generic helper three", inferred("A dashboard could help.")),
    ]),
    evidence,
  });

  assert.equal(diagnostics.groundingCoverage.evidenceGroundedClaims, 18);
  assert.equal(diagnostics.groundingCoverage.inferenceClaims, 3);
  assert.ok(diagnostics.groundingCoverage.inferencePercentage > 0);
  assert.ok(diagnostics.schemaCompleteness.missingSections.includes("competition"));
  assert.ok(diagnostics.schemaCompleteness.completeness < 1);
});

test("reports missing evidence, duplicated evidence ids, and invalid evidence ids", () => {
  const duplicateAndInvalid: ScanGroundedClaim = {
    text: "Evidence references include repeated and unknown IDs.",
    groundingMode: "evidence",
    evidenceRefs: [{ evidenceId: "ev-1" }, { evidenceId: "ev-1" }, { evidenceId: "missing-ev" }],
  };
  const diagnostics = computeScanQualityDiagnostics({ output: output([opportunity("Bad references", duplicateAndInvalid)]), evidence: evidenceWithUnused });

  assert.equal(diagnostics.evidenceDiagnostics.duplicateEvidenceReferenceCount, 5);
  assert.deepEqual(diagnostics.evidenceDiagnostics.invalidReferences, ["missing-ev"]);
  assert.ok(diagnostics.evidenceDiagnostics.missingReferences.includes("ev-4"));
});

test("detects generic response indicators", () => {
  const generic = opportunity("Placeholder", inferred("Leverage seamless best practices to optimize your company workflow.", ""));
  generic.pain = "Leverage seamless best practices.";
  generic.customer = "Leverage seamless best practices.";
  generic.mvp = "TODO placeholder";
  const diagnostics = computeScanQualityDiagnostics({ output: output([generic, generic, generic]), evidence });

  assert.equal(diagnostics.genericityIndicators.excessiveRepetition, true);
  assert.ok(diagnostics.genericityIndicators.vagueRecommendations > 0);
  assert.ok(diagnostics.genericityIndicators.placeholderLikeLanguage > 0);
  assert.ok(diagnostics.genericityIndicators.repeatedOpportunityStructures > 0);
});

test("detects obvious contradictions and duplicated claims", () => {
  const first = opportunity("Churn increase monitor", grounded("Customer churn is increasing in the finance market.", "ev-1"));
  const second = opportunity("Churn decrease monitor", grounded("Customer churn is decreasing in the finance market.", "ev-2"));
  const third = opportunity("Churn duplicate monitor", grounded("Customer churn is decreasing in the finance market.", "ev-2"));

  const diagnostics = computeScanQualityDiagnostics({ output: output([first, second, third]), evidence });

  assert.ok(diagnostics.contradictionDiagnostics.contradictionCount >= 2);
  assert.ok(diagnostics.contradictionDiagnostics.duplicatedClaims >= 1);
});
