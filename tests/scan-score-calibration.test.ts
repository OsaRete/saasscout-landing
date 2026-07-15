import assert from "node:assert/strict";
import test from "node:test";

import { computeScanQualityDiagnostics, type ScanQualityDiagnosticEvidence } from "../lib/scan/quality-diagnostics.ts";
import { buildScanCalibrationShadowLog, calibrateAnalyzeEvidenceConfidence, calibrateGenerateOpportunitiesSupport } from "../lib/scan/score-calibration.ts";
import type { AnalyzeEvidenceOutput, GenerateOpportunitiesOutput, GeneratedOpportunity } from "../lib/scan/output-validation.ts";
import type { ScanGroundedClaim } from "../lib/scan/grounding.ts";

const evidence: ScanQualityDiagnosticEvidence[] = [
  { evidenceId: "ev-1", sourceKind: "pasted_evidence" },
  { evidenceId: "ev-2", sourceKind: "uploaded_document" },
  { evidenceId: "ev-3", sourceKind: "external_snippet" },
];

function grounded(text: string, evidenceId = "ev-1"): ScanGroundedClaim { return { text, groundingMode: "evidence", evidenceRefs: [{ evidenceId, relevance: "primary" }] }; }
function inferred(text: string): ScanGroundedClaim { return { text, groundingMode: "inference", evidenceRefs: [], inferenceReason: "Current evidence suggests this but does not directly prove it." }; }
function analyze(claims: ScanGroundedClaim[], score = 8): AnalyzeEvidenceOutput {
  return { inferred_market: "Finance operations market with Acme Corp reporting delays and validation risks.", audience_summary: "B2B finance operators in mid-market companies.", evidence_summary: "Evidence mentions reporting bottlenecks, pricing, competition, and validation concerns.", pain_points: "Slow reporting | Approval delays", repeated_patterns: "Reporting delays repeat across teams", workflow_problems: "Manual CSV review and Slack handoffs", willingness_to_pay_signals: "$49 pricing budget appears in evidence", opportunity_angles: "Market validation through reporting workflow automation", confidence_score: score, grounding: { inferred_market: claims[0], audience_summary: claims[1] ?? claims[0], evidence_summary: claims[2] ?? claims[0], pain_points: [claims[3] ?? claims[0]], repeated_patterns: [claims[4] ?? claims[0]], workflow_problems: [claims[5] ?? claims[0]], willingness_to_pay_signals: [claims[6] ?? claims[0]], opportunity_angles: [claims[7] ?? claims[0]], confidence_score: claims[8] ?? claims[0] }, groundingSummary: { totalClaims: 0, evidenceGroundedClaims: 0, inferenceClaims: 0, unsupportedClaims: 0, groundingCoverage: 0, distinctEvidenceIdsReferenced: 0, contradictingReferenceCount: 0, invalidReferenceCount: 0 } };
}
function opp(title: string, base: ScanGroundedClaim, score = 8): GeneratedOpportunity { return { title, score, pain: `${title} pain at Acme Corp causes 42% delays.`, customer: "B2B finance operators", mvp: "CSV import, Salesforce sync, and Slack alerts.", pricing: "$49 per month", difficulty: "Medium", problem_summary: "Repeated reporting bottlenecks create validation risk.", target_customer: "Mid-market finance ops", mvp_roadmap: "Week 1 import, week 2 workflow, week 3 alerts", validation_questions: "Will this reduce reporting delay?", landing_page_idea: "Reporting workflow automation", acquisition_channels: "LinkedIn and partner forums", grounding: { pain: base, customer: grounded("Finance operators are affected.", "ev-2"), rationale: grounded("Repeated workflow evidence supports rationale.", "ev-3"), mvp: grounded("CSV and Slack workflows are referenced.", "ev-1"), pricing: grounded("Budget is mentioned.", "ev-2"), score: grounded("Multiple sources support score.", "ev-3"), difficulty: grounded("Moderate integrations are required.", "ev-1") } }; }
function gen(opportunities: GeneratedOpportunity[]): GenerateOpportunitiesOutput { return { opportunities, groundingSummary: { totalClaims: 0, evidenceGroundedClaims: 0, inferenceClaims: 0, unsupportedClaims: 0, groundingCoverage: 0, distinctEvidenceIdsReferenced: 0, contradictingReferenceCount: 0, invalidReferenceCount: 0 } }; }

function calibrateAnalyze(output: AnalyzeEvidenceOutput, ev = evidence) { return calibrateAnalyzeEvidenceConfidence({ output, diagnostics: computeScanQualityDiagnostics({ output, evidence: ev }) }).confidence; }

test("corroborated analyze evidence beats single-source, inference-heavy, invalid, and contradicted cases", () => {
  const strong = calibrateAnalyze(analyze(["ev-1", "ev-2", "ev-3", "ev-1", "ev-2", "ev-3", "ev-1", "ev-2", "ev-3"].map((id, i) => grounded(`Market validation claim ${i} increased with high specificity.`, id))));
  const single = calibrateAnalyze(analyze(Array.from({ length: 9 }, (_, i) => grounded(`Single source claim ${i} supports full coverage.`, "ev-1"))), [{ evidenceId: "ev-1", sourceKind: "pasted_evidence" }]);
  const inference = calibrateAnalyze(analyze(Array.from({ length: 9 }, (_, i) => i < 6 ? inferred(`Inferred claim ${i}`) : grounded(`Grounded claim ${i}`, "ev-1"))));
  const invalid = calibrateAnalyze(analyze([grounded("Missing evidence reference", "missing"), ...Array.from({ length: 8 }, (_, i) => inferred(`Weak claim ${i}`))]));
  const contradicted = calibrateAnalyze(analyze([grounded("Reporting delay is increasing high in finance teams", "ev-1"), grounded("Reporting delay is decreasing low in finance teams", "ev-2"), ...Array.from({ length: 7 }, (_, i) => grounded(`Other support claim ${i}`, "ev-3"))]));
  assert.equal(strong.reliabilityClassification, "corroborated");
  assert.equal(single.reliabilityClassification, "single_source");
  assert.ok(single.score01 < 0.7);
  assert.ok(strong.score10 > single.score10);
  assert.ok(inference.score10 < strong.score10);
  assert.equal(invalid.reliabilityClassification, "insufficient_evidence");
  assert.equal(contradicted.reliabilityClassification, "contradicted");
  assert.ok(contradicted.score10 < strong.score10);
});

test("model score changes only comparison delta", () => {
  const claims = Array.from({ length: 9 }, (_, i) => grounded(`Stable calibrated claim ${i}`, evidence[i % 3].evidenceId));
  const low = calibrateAnalyze(analyze(claims, 2));
  const high = calibrateAnalyze(analyze(claims, 9));
  assert.equal(low.score01, high.score01);
  assert.notEqual(low.absoluteDelta10, high.absoluteDelta10);
});

test("opportunity support scores distinguish strong, weak, and duplicated opportunities without changing contradiction count", () => {
  const strongOutput = gen([opp("Strong support", grounded("Pain is directly grounded.", "ev-1"))]);
  const weak = opp("Weak support", inferred("Pain is inferred."), 9);
  weak.grounding.customer = inferred("Customer inferred."); weak.grounding.rationale = inferred("Rationale inferred."); weak.grounding.pricing = inferred("Pricing inferred."); weak.grounding.score = inferred("Score inferred."); weak.grounding.difficulty = inferred("Difficulty inferred.");
  const weakOutput = gen([weak]);
  const duplicateOutput = gen([opp("Duplicate", grounded("Pain is grounded", "ev-1")), opp("Duplicate", grounded("Pain is grounded", "ev-1"))]);
  const strong = calibrateGenerateOpportunitiesSupport({ output: strongOutput, diagnostics: computeScanQualityDiagnostics({ output: strongOutput, evidence }) }).opportunitySupportScores[0];
  const weakScore = calibrateGenerateOpportunitiesSupport({ output: weakOutput, diagnostics: computeScanQualityDiagnostics({ output: weakOutput, evidence }) }).opportunitySupportScores[0];
  const duplicateDiagnostics = computeScanQualityDiagnostics({ output: duplicateOutput, evidence });
  const dupScore = calibrateGenerateOpportunitiesSupport({ output: duplicateOutput, diagnostics: duplicateDiagnostics }).opportunitySupportScores[0];
  assert.ok(strong.score10 > weakScore.score10);
  assert.ok(dupScore.penalties.some((item) => item.name === "duplicated_opportunity" && item.contribution > 0));
  assert.equal(duplicateDiagnostics.contradictionDiagnostics.contradictionCount, 0);
});

test("range conversions, reliability thresholds, privacy-safe log, and determinism", () => {
  const output = gen([opp("Private uploaded document title must not log", grounded("Claim text secret uploaded document", "ev-1"))]);
  const diagnostics = computeScanQualityDiagnostics({ output, evidence });
  const first = calibrateGenerateOpportunitiesSupport({ output, diagnostics });
  const second = calibrateGenerateOpportunitiesSupport({ output, diagnostics });
  assert.deepEqual(first, second);
  const score = first.opportunitySupportScores[0];
  assert.ok(score.score01 >= 0 && score.score01 <= 1);
  assert.equal(score.score10, Number((score.score01 * 10).toFixed(2)));
  assert.equal(score.score100, Number((score.score01 * 100).toFixed(2)));
  assert.deepEqual(first.aggregateDiagnostics.reliabilityClassificationCounts, { insufficient_evidence: 0, single_source: 0, limited_support: 0, corroborated: 1, contradicted: 0 });
  const noValid = opp("No valid refs", grounded("Missing", "missing"));
  noValid.grounding.customer = grounded("Missing customer", "missing"); noValid.grounding.rationale = grounded("Missing rationale", "missing"); noValid.grounding.mvp = grounded("Missing mvp", "missing"); noValid.grounding.pricing = grounded("Missing pricing", "missing"); noValid.grounding.score = grounded("Missing score", "missing"); noValid.grounding.difficulty = grounded("Missing difficulty", "missing");
  const noValidOutput = gen([noValid]);
  const insufficient = calibrateGenerateOpportunitiesSupport({ output: noValidOutput, diagnostics: computeScanQualityDiagnostics({ output: noValidOutput, evidence }) }).opportunitySupportScores[0];
  assert.equal(insufficient.reliabilityClassification, "insufficient_evidence");
  const log = buildScanCalibrationShadowLog({ route: "generate-opportunities", model: "m", promptVersion: "p", calibration: first, durationMs: 1 });
  const serialized = JSON.stringify(log);
  assert.doesNotMatch(serialized, /Private uploaded document title|Claim text secret|inferred|uploaded document/i);
});
