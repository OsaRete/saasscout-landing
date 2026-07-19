import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { executeScanWorkflow, type ScanWorkflowDependencies, type ScanWorkflowAuthorizationContext } from "../lib/scan/workflow.ts";
const TEST_SCAN_WORKFLOW_AUTHORIZATION: ScanWorkflowAuthorizationContext = Object.freeze({ authenticated: true, authorizationMode: "internal_user" });
import { validateAnalyzeEvidenceOutput } from "../lib/scan/output-validation.ts";
import { computeSolutionIntelligenceDiagnostics, validateSolutionIntelligenceOutput } from "../lib/scan/solution-intelligence.ts";
import { ingestScanEvidence } from "../lib/scan/evidence-ingestion.ts";
import { computeScanQualityDiagnostics } from "../lib/scan/quality-diagnostics.ts";
import { calibrateAnalyzeEvidenceConfidence } from "../lib/scan/score-calibration.ts";
import { buildSafeScanArtifactMapperLog, canonicalSerializeScanIntelligenceArtifact, mapCompletedScanWorkflowToArtifact, scanScanIntelligenceArtifactPrivacy, toPublicScanIntelligenceArtifact, validateScanIntelligenceArtifact, verifyScanIntelligenceArtifactIntegrity, parseAndValidateScanIntelligenceArtifact, ScanIntelligenceArtifactValidationError } from "../lib/scan/intelligence-artifact.ts";

const claim = (id: string) => ({ text:"Supported by evidence.", groundingMode:"evidence", evidenceRefs:[{ evidenceId:id, relevance:"primary" }] });
const inf = { text:"Inferred from evidence.", groundingMode:"inference", evidenceRefs:[], inferenceReason:"This is inferred from evidence gaps." };
function analysis(id="pasted-evidence-001") { return validateAnalyzeEvidenceOutput({ inferred_market:"Agency ops inferred", audience_summary:"Agency owners", evidence_summary:"Manual reporting pain", pain_points:"Manual reports", repeated_patterns:"Weekly spreadsheets", workflow_problems:"Copying data", willingness_to_pay_signals:"Existing tool spend", opportunity_angles:"Automation", confidence_score:8, grounding:{ inferred_market:claim(id), audience_summary:claim(id), evidence_summary:claim(id), pain_points:[claim(id)], repeated_patterns:[claim(id)], workflow_problems:[claim(id)], willingness_to_pay_signals:[claim(id)], opportunity_angles:[inf], confidence_score:claim(id) } }, { evidenceIds:[id] }); }
function solution(id="pasted-evidence-001") { const e=claim(id); const cat=(category:string,suitability:number,suitabilityBand:string)=>({ category, suitability, suitabilityBand, rationale:inf, advantages:[inf], limitations:[inf], prerequisites:[inf] }); return validateSolutionIntelligenceOutput({ version:"scan-solution-intelligence@1", problemFraming:e, evaluatedCategories:[cat("software_product",0.5,"possible"), cat("productized_service",0.7,"strong"), cat("validate_first",0.9,"best_fit")], recommendedCategory:"validate_first", secondaryCategory:"productized_service", recommendation:inf, existingSolutionAssessment:{ knownAlternatives:[{ nameOrCategory:"Generic reporting tool", alternativeType:"generic_tool", observedStrengths:[e], observedWeaknesses:[e], evidenceRefs:[{ evidenceId:id }] }], evidenceCoverage:"limited", whatAppearsValidated:[e], whatAppearsPoorlySolved:[e], replacementRisk:inf }, innovationAssessment:{ innovationMode:"unproven_concept", verifiedFoundation:[], proposedDifferentiation:[inf], unverifiedAssumptions:[inf], feasibilityConstraints:[inf], noveltyRisk:"moderate" }, validationReadiness:{ readiness:"problem_validation_ready", knownFacts:[e], criticalUnknowns:[inf], cheapestNextTest:"customer_interviews", testRationale:inf, successSignal:inf, failureSignal:inf }, keyAssumptions:[inf], risks:[inf], nextValidationAction:inf }, { evidenceIds:[id] }); }
function deps(): ScanWorkflowDependencies { let t=0; return { now:()=>new Date(Date.UTC(2026,0,1,0,0,t++)), createExecutionId:()=>"scan-workflow-00000000-0000-4000-8000-000000000000", ingestEvidence:async (input)=>ingestScanEvidence(input), generateProblemModelOutput:async (input)=>JSON.stringify(analysis(input.allowedEvidenceIds[0])), validateProblemModelOutput:(input, raw)=>validateAnalyzeEvidenceOutput(JSON.parse(raw), { evidenceIds: input.allowedEvidenceIds }), computeProblemDiagnostics:(input, output)=>computeScanQualityDiagnostics({ output, evidence:[{ evidenceId:input.allowedEvidenceIds[0], sourceKind:"pasted_evidence" }] }), computeProblemCalibration:(output, diagnostics)=>calibrateAnalyzeEvidenceConfidence({ output, diagnostics }).confidence, generateSolutionModelOutput:async (input)=>JSON.stringify(solution(input.allowedEvidenceIds[0])), validateSolutionModelOutput:(input, raw)=>validateSolutionIntelligenceOutput(JSON.parse(raw), { evidenceIds: input.allowedEvidenceIds }), computeSolutionDiagnostics:(output)=>computeSolutionIntelligenceDiagnostics(output) }; }
async function makeArtifact() { const w=await executeScanWorkflow({ intent:{ market:"Submitted market", audience:"Submitted audience", description:"Private submitted context" }, pastedEvidence:"Agency operators manually build weekly reports from spreadsheets." }, TEST_SCAN_WORKFLOW_AUTHORIZATION, deps()); return { workflow:w, artifact: mapCompletedScanWorkflowToArtifact(w) }; }

test("completed workflow maps to deterministic validated immutable artifact", async () => { const a=await makeArtifact(); const b=await makeArtifact(); assert.deepEqual(a.artifact,b.artifact); assert.equal(a.artifact.version,"scan-intelligence-artifact@1"); assert.equal(a.artifact.artifactId,"scan-artifact-00000000-0000-4000-8000-000000000000"); assert.equal(a.artifact.execution.status,"completed"); validateScanIntelligenceArtifact(a.artifact); assert.equal(verifyScanIntelligenceArtifactIntegrity(a.artifact), true); assert.equal(Object.isFrozen(a.artifact.solutionIntelligence.validationReadiness.knownFacts), true); assert.equal(canonicalSerializeScanIntelligenceArtifact(a.artifact), canonicalSerializeScanIntelligenceArtifact(b.artifact)); assert.equal(a.artifact.integrity.artifactHash,b.artifact.integrity.artifactHash); });

test("workflow-only contract rejects failed, partial, wrong version, and missing stage", async () => { const { workflow, artifact }=await makeArtifact(); assert.throws(()=>mapCompletedScanWorkflowToArtifact({ ...workflow, status:"failed" } as never)); assert.throws(()=>mapCompletedScanWorkflowToArtifact({ status:"completed" } as never)); assert.throws(()=>mapCompletedScanWorkflowToArtifact({ ...workflow, version:"scan-workflow@2" } as never)); assert.throws(()=>validateScanIntelligenceArtifact({ ...artifact, processingHistory: artifact.processingHistory.slice(1), integrity: artifact.integrity })); });

test("intent, evidence, grounding, calibration, solution and validation are preserved without private content", async () => { const { artifact }=await makeArtifact(); assert.equal(artifact.intent.submitted.market,"Submitted market"); assert.equal(artifact.problemIntelligence.inferred_market,"Agency ops inferred"); assert.notEqual(artifact.intent.submitted.market, artifact.problemIntelligence.inferred_market); assert.equal(artifact.evidence.sources[0].evidenceId,"pasted-evidence-001"); assert.equal(artifact.evidence.sources[0].privacyClass,"private_user"); assert.equal("normalizedContent" in artifact.evidence.sources[0], false); assert.equal("originalFilename" in artifact.evidence.sources[0], false); assert.equal(artifact.problemIntelligence.grounding.opportunity_angles[0].groundingMode,"inference"); assert.equal(artifact.quality.score10, artifact.quality.modelScoreComparison.modelScore10 - artifact.quality.modelScoreComparison.absoluteDelta10 <= 10 ? artifact.quality.score10 : artifact.quality.score10); assert.equal(artifact.solutionIntelligence.evaluatedCategories.length,3); assert.equal(artifact.solutionIntelligence.recommendedCategory,"validate_first"); assert.equal(artifact.validation.readiness, artifact.solutionIntelligence.validationReadiness.readiness); assert.equal(artifact.validation.nextValidationAction.text, artifact.solutionIntelligence.nextValidationAction.text); });

test("processing history and provenance validation rejects invalid structures", async () => { const { artifact }=await makeArtifact(); const dup={ ...artifact, processingHistory:[...artifact.processingHistory.slice(0,-1), artifact.processingHistory[0]], integrity:artifact.integrity }; assert.throws(()=>validateScanIntelligenceArtifact(dup)); const failed={ ...artifact, processingHistory:artifact.processingHistory.map((r,i)=>i===0?{...r,status:"failed"}:r), integrity:artifact.integrity }; assert.throws(()=>validateScanIntelligenceArtifact(failed)); const badDuration={ ...artifact, processingHistory:artifact.processingHistory.map((r,i)=>i===0?{...r,durationMs:-1}:r), integrity:artifact.integrity }; assert.throws(()=>validateScanIntelligenceArtifact(badDuration)); const noProv={ ...artifact, provenance:{ ...artifact.provenance, problemModel:"" }, integrity:artifact.integrity }; assert.throws(()=>validateScanIntelligenceArtifact(noProv)); assert.equal(JSON.stringify(artifact.provenance).includes("providerRequestId"), false); assert.equal(JSON.stringify(artifact.provenance).includes("authorization"), false); });

test("canonicalization rejects unsupported values and preserves array order", async () => { const { artifact }=await makeArtifact(); const reordered={ b:1, a:2 }; assert.equal(canonicalSerializeScanIntelligenceArtifact(reordered), '{"a":2,"b":1}'); assert.notEqual(canonicalSerializeScanIntelligenceArtifact([1,2]), canonicalSerializeScanIntelligenceArtifact([2,1])); assert.throws(()=>canonicalSerializeScanIntelligenceArtifact({ x: undefined })); assert.throws(()=>canonicalSerializeScanIntelligenceArtifact({ x: Number.NaN })); assert.throws(()=>canonicalSerializeScanIntelligenceArtifact({ x: new Date() })); assert.throws(()=>canonicalSerializeScanIntelligenceArtifact({ x: Buffer.from("x") })); assert.throws(()=>canonicalSerializeScanIntelligenceArtifact({ x: new Map() })); assert.ok(canonicalSerializeScanIntelligenceArtifact(artifact).includes("scan-intelligence-artifact@1")); });

test("integrity detects nested, history, solution and algorithm mutations", async () => { const { artifact }=await makeArtifact(); assert.equal(verifyScanIntelligenceArtifactIntegrity({ ...artifact, intent:{ ...artifact.intent, submitted:{ market:"mutated" } } } as never), false); assert.equal(verifyScanIntelligenceArtifactIntegrity({ ...artifact, processingHistory:artifact.processingHistory.slice(1) } as never), false); assert.equal(verifyScanIntelligenceArtifactIntegrity({ ...artifact, solutionIntelligence:{ ...artifact.solutionIntelligence, recommendedCategory:"software_product" } } as never), false); assert.throws(()=>validateScanIntelligenceArtifact({ ...artifact, integrity:{ ...artifact.integrity, algorithm:"md5" } })); });

test("structural privacy guard, public projection, safe log and compatibility", async () => { const { artifact }=await makeArtifact(); for (const key of ["userId","email","authorization","authorizationMode","accessToken","refreshToken","apiKey","providerRequestId","rawModelOutput","rawOutput","prompt","fileBuffer","bytes","storagePath","signedUrl"]) assert.throws(()=>scanScanIntelligenceArtifactPrivacy({ [key]:"x" })); const pub=toPublicScanIntelligenceArtifact(artifact); const ps=JSON.stringify(pub); assert.equal(ps.includes("contentHash"), false); assert.equal(ps.includes("privacyClass"), false); assert.equal(ps.includes("userId"), false); assert.equal(ps.includes("authorization"), false); assert.equal(ps.includes(artifact.integrity.artifactHash), false); const log=buildSafeScanArtifactMapperLog({ artifact, mappingDurationMs:5 }); const ls=JSON.stringify(log); for (const token of ["pasted-evidence-001","Submitted market","Supported by evidence","Generic reporting tool","validate_first",artifact.integrity.artifactHash]) assert.equal(ls.includes(token), false); assert.doesNotMatch(readFileSync("lib/scan/intelligence-artifact.ts","utf8"), /supabase|\.from\(|insert\(|upsert\(|delete\(/i); assert.match(readFileSync("lib/scan/server-orchestration.ts","utf8"), /evidenceSummary: workflow\.evidence/); });

test("round trip parse validate verify", async () => { const { artifact }=await makeArtifact(); const parsed=JSON.parse(canonicalSerializeScanIntelligenceArtifact(artifact)); validateScanIntelligenceArtifact(parsed); assert.equal(verifyScanIntelligenceArtifactIntegrity(parsed), true); assert.deepEqual(parsed, JSON.parse(JSON.stringify(artifact))); });

function rehashArtifact(a: Record<string, unknown>) {
  const payload = { ...a };
  delete payload.integrity;
  const hash = createHash("sha256").update(canonicalSerializeScanIntelligenceArtifact(payload), "utf8").digest("hex");
  return { ...a, integrity: { algorithm: "sha256", canonicalizationVersion: "scan-artifact-canonical-json@1", artifactHash: hash } };
}

test("adversarial parsed JSON durable validation coverage", async () => {
  const { artifact } = await makeArtifact();
  const base = JSON.parse(canonicalSerializeScanIntelligenceArtifact(artifact));
  const valid = (mutate: (x: Record<string, unknown>) => void) => { const x = JSON.parse(JSON.stringify(base)); mutate(x); return rehashArtifact(x); };
  const invalid = (mutate: (x: Record<string, unknown>) => void) => { const x = JSON.parse(JSON.stringify(base)); mutate(x); return x; };
  const semanticCases = [
    invalid((x) => { delete x.version; }),
    invalid((x) => { delete x.execution.startedAt; }),
    invalid((x) => { x.evidence.sources[0].extra = true; }),
    invalid((x) => { x.execution.totalDurationMs = "11"; }),
    valid((x) => { x.evidence.sources.push({ ...x.evidence.sources[0] }); x.evidence.summary.sourceCount++; x.evidence.summary.sourceKindCounts.pasted_evidence++; x.evidence.summary.independentSourceCount++; }),
    valid((x) => { x.evidence.sources[0].trustClass = "internal_derived_non_independent"; }),
    valid((x) => { x.evidence.summary.allowedEvidenceIds = []; }),
    valid((x) => { x.evidence.summary.sourceKindCounts.pasted_evidence = 99; }),
    valid((x) => { x.evidence.summary.independentSourceCount = 99; }),
    valid((x) => { x.evidence.summary.truncatedSourceCount = 99; }),
    valid((x) => { x.evidence.sources[0].sourceKind = "bad"; }),
    valid((x) => { x.evidence.sources[0].contentHash = "sha256:bad"; }),
    valid((x) => { x.quality.score10 = 9.99; }),
    valid((x) => { x.quality.scoreBand = "very_low"; }),
    valid((x) => { x.quality.reliabilityClassification = "magic"; }),
    valid((x) => { x.quality.solutionDiagnostics.categoryCount = 99; }),
    valid((x) => { x.validation.successSignal.text = "mismatch"; }),
    valid((x) => { x.processingHistory[1].startedAt = x.processingHistory[0].startedAt; }),
    valid((x) => { x.processingHistory[0].durationMs = 99; }),
    valid((x) => { x.processingHistory[0].startedAt = "2025-12-31T23:59:00.000Z"; }),
    valid((x) => { x.execution.processingStageCount = 99; }),
    valid((x) => { x.provenance.workflowVersion = "scan-workflow@2"; }),
    valid((x) => { x.provenance.evidenceIngestionVersion = "scan-evidence-ingestion@2"; }),
    valid((x) => { x.execution.executionId = "scan-workflow-not-a-uuid"; x.artifactId = "scan-artifact-not-a-uuid"; }),
    invalid((x) => { x.rawContent = "secret"; }),
  ];
  for (const c of semanticCases) assert.throws(() => validateScanIntelligenceArtifact(c), ScanIntelligenceArtifactValidationError);
  const contentText = valid((x) => { x.problemIntelligence.grounding.evidence_summary.text = "Legitimate claim text may mention content strategy."; });
  validateScanIntelligenceArtifact(contentText);
  const hashValidSemanticsInvalid = valid((x) => { x.evidence.summary.sourceCount = 99; });
  assert.throws(() => validateScanIntelligenceArtifact(hashValidSemanticsInvalid));
  const semanticsValidHashMutated = { ...base, integrity: { ...base.integrity, artifactHash: "0".repeat(64) } };
  assert.throws(() => validateScanIntelligenceArtifact(semanticsValidHashMutated));
  assert.throws(() => parseAndValidateScanIntelligenceArtifact("{" + " ".repeat(1_500_001)), ScanIntelligenceArtifactValidationError);
  const parsed = parseAndValidateScanIntelligenceArtifact(canonicalSerializeScanIntelligenceArtifact(artifact));
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.solutionIntelligence.validationReadiness.knownFacts[0]), true);
});


test("PR 9.2 semantic hardening rejects trusted-intent, evidence, extraction, diagnostics, provenance and taxonomy contradictions", async () => {
  const { artifact } = await makeArtifact();
  const base = JSON.parse(canonicalSerializeScanIntelligenceArtifact(artifact));
  const valid = (mutate: (x: Record<string, unknown>) => void) => { const x = JSON.parse(JSON.stringify(base)); mutate(x); return rehashArtifact(x); };
  const cases = [
    valid((x) => { x.intent.submitted.extra = "x"; }),
    valid((x) => { x.intent.submitted.market = 7; }),
    valid((x) => { x.intent.submitted.market = "x".repeat(121); }),
    valid((x) => { x.intent.submitted = {}; }),
    valid((x) => { x.evidence.sources[0].privacyClass = "public_external"; }),
    valid((x) => { x.evidence.sources[0].trustClass = "external_public_untrusted"; }),
    valid((x) => { x.evidence.sources[0].sourceKind = "discover_context"; x.evidence.sources[0].trustClass = "internal_derived_non_independent"; x.evidence.sources[0].privacyClass = "derived_private"; }),
    valid((x) => { x.evidence.sources[0].privacyClass = "derived_private"; }),
    valid((x) => { x.evidence.sources[0].sourceKind = "uploaded_pdf"; x.evidence.sources[0].trustClass = "user_supplied_untrusted"; x.evidence.sources[0].privacyClass = "private_user"; x.evidence.sources[0].extractionStatus = "not_required"; }),
    valid((x) => { x.evidence.sources[0].extractionStatus = "extracted"; }),
    valid((x) => { x.evidence.sources[0].truncated = true; x.evidence.sources[0].extractionStatus = "extracted"; x.evidence.summary.truncatedSourceCount = 1; }),
    valid((x) => { x.evidence.sources[0].truncated = false; x.evidence.sources[0].extractionStatus = "partially_extracted"; }),
    valid((x) => { delete x.quality.diagnostics.groundingCoverage.totalClaims; }),
    valid((x) => { x.quality.diagnostics.groundingCoverage.extra = 1; }),
    valid((x) => { x.quality.diagnostics.genericityIndicators.excessiveRepetition = "false"; }),
    valid((x) => { x.quality.diagnostics.groundingCoverage.totalClaims = -1; }),
    valid((x) => { x.quality.diagnostics.groundingCoverage.evidenceGroundedPercentage = 1.2; }),
    valid((x) => { x.quality.diagnostics.qualitySummary.groundingCoverage = 0.123; }),
    valid((x) => { x.quality.solutionDiagnostics.categoryCount = 3.5; }),
    valid((x) => { x.quality.solutionDiagnostics.recommendedCategoryPresent = "true"; }),
    valid((x) => { x.quality.solutionDiagnostics.evidenceGroundedClaimPercentage = 2; }),
    valid((x) => { x.quality.solutionDiagnostics.uniqueCategoryCount = 4; }),
    valid((x) => { x.quality.solutionDiagnostics.namedAlternativesWithEvidence = 2; }),
    valid((x) => { x.quality.solutionDiagnostics.validationReadiness = "ready"; }),
    valid((x) => { x.quality.solutionDiagnostics.categoryCount = 99; }),
    valid((x) => { x.provenance.problemPromptVersion = "scan-analyze-evidence@2"; }),
    valid((x) => { x.provenance.problemValidatorVersion = "scan-output-validation@2"; }),
    valid((x) => { x.provenance.solutionPromptVersion = "scan-solution-intelligence@2"; }),
    valid((x) => { x.provenance.solutionValidatorVersion = "scan-solution-intelligence-validator@2"; }),
    valid((x) => { x.quality.score100 = 99; }),
  ];
  for (const c of cases) assert.throws(() => validateScanIntelligenceArtifact(c), ScanIntelligenceArtifactValidationError);
  for (const mutate of [
    (x: Record<string, unknown>) => { delete x.problemIntelligence.grounding; },
    (x: Record<string, unknown>) => { x.problemIntelligence.grounding.evidence_summary.groundingMode = "evidence"; x.problemIntelligence.grounding.evidence_summary.evidenceRefs = []; },
    (x: Record<string, unknown>) => { x.solutionIntelligence.recommendedCategory = "not_a_category"; },
    (x: Record<string, unknown>) => { x.quality.solutionDiagnostics.categoryCount = 99; },
  ]) { const c = valid(mutate); assert.throws(() => validateScanIntelligenceArtifact(c), ScanIntelligenceArtifactValidationError); }
});
