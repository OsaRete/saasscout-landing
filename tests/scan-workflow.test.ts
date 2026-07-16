import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { executeScanWorkflow, buildSafeScanWorkflowLog, buildDerivedProblemContext, isScanWorkflowFailure, validateScanWorkflowIntent, ScanWorkflowRecorder, TEST_SCAN_WORKFLOW_AUTHORIZATION, type ScanWorkflowDependencies } from "../lib/scan/workflow.ts";
import { validateAnalyzeEvidenceOutput } from "../lib/scan/output-validation.ts";
import { validateSolutionIntelligenceOutput } from "../lib/scan/solution-intelligence.ts";
import { ingestScanEvidence } from "../lib/scan/evidence-ingestion.ts";
import { computeScanQualityDiagnostics } from "../lib/scan/quality-diagnostics.ts";
import { calibrateAnalyzeEvidenceConfidence } from "../lib/scan/score-calibration.ts";

const claim = (id: string) => ({ text:"Supported by evidence.", groundingMode:"evidence", evidenceRefs:[{ evidenceId:id, relevance:"primary" }] });
const inf = { text:"Inferred from evidence.", groundingMode:"inference", evidenceRefs:[], inferenceReason:"This is inferred from evidence gaps." };
function analysis(id="pasted-evidence-001") { return validateAnalyzeEvidenceOutput({ inferred_market:"Agency ops", audience_summary:"Agency owners", evidence_summary:"Manual reporting pain", pain_points:"Manual reports", repeated_patterns:"Weekly spreadsheets", workflow_problems:"Copying data", willingness_to_pay_signals:"Existing tool spend", opportunity_angles:"Automation", confidence_score:8, grounding:{ inferred_market:claim(id), audience_summary:claim(id), evidence_summary:claim(id), pain_points:[claim(id)], repeated_patterns:[claim(id)], workflow_problems:[claim(id)], willingness_to_pay_signals:[claim(id)], opportunity_angles:[inf], confidence_score:claim(id) } }, { evidenceIds:[id] }); }
function solution(id="pasted-evidence-001") { const e=claim(id); const cat=(category:string,suitability:number,suitabilityBand:string)=>({ category, suitability, suitabilityBand, rationale:inf, advantages:[inf], limitations:[inf], prerequisites:[inf] }); const categories=[cat("software_product",0.5,"possible"), cat("productized_service",0.7,"strong"), cat("validate_first",0.9,"best_fit")]; return validateSolutionIntelligenceOutput({ version:"scan-solution-intelligence@1", problemFraming:e, evaluatedCategories:categories, recommendedCategory:"validate_first", recommendation:inf, existingSolutionAssessment:{ knownAlternatives:[], evidenceCoverage:"limited", whatAppearsValidated:[e], whatAppearsPoorlySolved:[e], replacementRisk:inf }, innovationAssessment:{ innovationMode:"unproven_concept", verifiedFoundation:[], proposedDifferentiation:[inf], unverifiedAssumptions:[inf], feasibilityConstraints:[inf], noveltyRisk:"moderate" }, validationReadiness:{ readiness:"problem_validation_ready", knownFacts:[e], criticalUnknowns:[inf], cheapestNextTest:"customer_interviews", testRationale:inf, successSignal:inf, failureSignal:inf }, keyAssumptions:[inf], risks:[inf], nextValidationAction:inf }, { evidenceIds:[id] }); }
function diagnostics() { return { categoryCount:3, uniqueCategoryCount:3, recommendedCategoryPresent:true, validateFirstConsidered:true, evidenceGroundedClaimPercentage:.5, inferenceClaimPercentage:.5, independentEvidenceIdsReferenced:1, invalidReferenceCount:0, existingAlternativeCount:0, namedAlternativesWithEvidence:0, innovationVerifiedFoundationCount:0, innovationAssumptionCount:1, criticalUnknownCount:1, validationReadiness:"problem_validation_ready" as const, cheapestNextTest:"customer_interviews" as const, contradictionReferenceCount:0 }; }
function deps(overrides: Partial<ScanWorkflowDependencies> = {}, calls: string[] = []): ScanWorkflowDependencies { let t=0; return { now:()=>new Date(Date.UTC(2026,0,1,0,0,t++)), createExecutionId:()=>"scan-workflow-00000000-0000-4000-8000-000000000000", ingestEvidence:async (input)=>{ calls.push("ingest"); return ingestScanEvidence(input); }, generateProblemModelOutput:async (input)=>{ calls.push("problem.generate"); assert.deepEqual(input.allowedEvidenceIds, ["pasted-evidence-001"]); return JSON.stringify(analysis(input.allowedEvidenceIds[0])); }, validateProblemModelOutput:(input, raw)=>{ calls.push("problem.validate"); return validateAnalyzeEvidenceOutput(JSON.parse(raw), { evidenceIds: input.allowedEvidenceIds }); }, computeProblemDiagnostics:(input, output)=>{ calls.push("problem.diagnostics"); return computeScanQualityDiagnostics({ output, evidence:[{ evidenceId:input.allowedEvidenceIds[0], sourceKind:"pasted_evidence" }] }); }, computeProblemCalibration:(output, problemDiagnostics)=>{ calls.push("problem.calibration"); return calibrateAnalyzeEvidenceConfidence({ output, diagnostics:problemDiagnostics }).confidence; }, generateSolutionModelOutput:async (input)=>{ calls.push("solution.generate"); assert.equal(input.derivedProblemContext?.content.includes("internal_derived_problem_intelligence"), true); assert.deepEqual(input.allowedEvidenceIds, ["pasted-evidence-001"]); return JSON.stringify(solution(input.allowedEvidenceIds[0])); }, validateSolutionModelOutput:(input, raw)=>{ calls.push("solution.validate"); return validateSolutionIntelligenceOutput(JSON.parse(raw), { evidenceIds: input.allowedEvidenceIds }); }, computeSolutionDiagnostics:()=>{ calls.push("solution.diagnostics"); return diagnostics(); }, ...overrides }; }

test("successful complete workflow is deterministic and ordered", async () => { const calls:string[]=[]; const input={ intent:{ market:"Agencies" }, pastedEvidence:"Agency operators manually build weekly reports from spreadsheets." }; const a=await executeScanWorkflow(input, TEST_SCAN_WORKFLOW_AUTHORIZATION, deps({}, calls)); const b=await executeScanWorkflow(input, TEST_SCAN_WORKFLOW_AUTHORIZATION, deps()); assert.deepEqual(a,b); assert.equal(a.status,"completed"); assert.deepEqual(calls,["ingest","problem.generate","problem.validate","problem.diagnostics","problem.calibration","solution.generate","solution.validate","solution.diagnostics"]); assert.equal(a.processingHistory.at(-1)?.stage,"completed"); assert.ok(a.processingHistory.every(r => (r.durationMs ?? 0) >= 0)); assert.equal(a.evidence.allowedEvidenceIds.includes("pasted-evidence-001"), true); });

test("evidence failure stops before model services", async () => { const calls:string[]=[]; await assert.rejects(() => executeScanWorkflow({ intent:{market:"x"}, pastedEvidence:"short" }, TEST_SCAN_WORKFLOW_AUTHORIZATION, deps({}, calls)), (e) => { assert.equal(isScanWorkflowFailure(e), true); assert.equal((e as { error: { code: string } }).error.code,"scan_workflow_evidence_failed"); return true; }); assert.deepEqual(calls,["ingest"]); });

test("problem failure stops solution and is safe", async () => { const calls:string[]=[]; await assert.rejects(() => executeScanWorkflow({ intent:{market:"x"}, pastedEvidence:"Enough useful evidence content for workflow." }, TEST_SCAN_WORKFLOW_AUTHORIZATION, deps({ generateProblemModelOutput:async()=>{ calls.push("problem.generate"); throw new Error("raw provider secret"); } }, calls)), (e) => { assert.equal(isScanWorkflowFailure(e), true); assert.equal(JSON.stringify(e).includes("raw provider secret"), false); return true; }); assert.deepEqual(calls,["ingest","problem.generate"]); });


test("recorder rejects untruthful transitions", () => {
  let ms = 0;
  const rec = new ScanWorkflowRecorder(() => new Date(ms++));
  assert.throws(() => rec.complete("received"));
  assert.throws(() => rec.fail("received", "scan_workflow_internal_failed"));
  rec.start("received");
  assert.throws(() => rec.start("authenticated"));
  assert.throws(() => rec.complete("authenticated"));
  rec.complete("received");
  assert.throws(() => rec.start("received"));
  rec.start("authenticated");
  rec.fail("authenticated", "scan_workflow_request_invalid");
  assert.throws(() => rec.start("input_validated"));
});

async function expectFailure(overrides: Partial<ScanWorkflowDependencies>, expectedStage: string, expectedCode: string, expectedCalls: string[]) {
  const calls: string[] = [];
  await assert.rejects(() => executeScanWorkflow({ intent:{ market:"Agencies" }, pastedEvidence:"Agency operators manually build weekly reports from spreadsheets." }, TEST_SCAN_WORKFLOW_AUTHORIZATION, deps(overrides, calls)), (e) => {
    assert.equal(isScanWorkflowFailure(e), true);
    const f = e as { error:{ stage:string; code:string }; processingHistory:{ stage:string; status:string; errorCode?:string }[]; status:string };
    assert.equal(f.status, "failed");
    assert.equal(f.error.stage, expectedStage);
    assert.equal(f.error.code, expectedCode);
    assert.equal(f.processingHistory.filter((r) => r.status === "failed").length, 1);
    assert.equal(f.processingHistory.at(-1)?.stage, expectedStage);
    assert.equal(f.processingHistory.at(-1)?.status, "failed");
    assert.equal(JSON.stringify(f).includes("raw-secret-model-text"), false);
    assert.equal(JSON.stringify(f).includes("private evidence phrase"), false);
    return true;
  });
  assert.deepEqual(calls, expectedCalls);
}

test("truthful phase failure attribution", async () => {
  await expectFailure({ generateProblemModelOutput: async () => { throw new Error("raw-secret-model-text"); } }, "problem_intelligence_started", "scan_workflow_internal_failed", ["ingest"]);
  await expectFailure({ validateProblemModelOutput: () => { throw new Error("raw-secret-model-text"); } }, "problem_intelligence_validated", "scan_workflow_internal_failed", ["ingest","problem.generate"]);
  await expectFailure({ computeProblemDiagnostics: () => { throw new Error("raw-secret-model-text"); } }, "problem_diagnostics_computed", "scan_workflow_internal_failed", ["ingest","problem.generate","problem.validate"]);
  await expectFailure({ computeProblemCalibration: () => { throw new Error("raw-secret-model-text"); } }, "problem_calibration_computed", "scan_workflow_internal_failed", ["ingest","problem.generate","problem.validate","problem.diagnostics"]);
  await expectFailure({ generateSolutionModelOutput: async () => { throw new Error("raw-secret-model-text"); } }, "solution_intelligence_started", "scan_workflow_internal_failed", ["ingest","problem.generate","problem.validate","problem.diagnostics","problem.calibration"]);
  await expectFailure({ validateSolutionModelOutput: () => { throw new Error("raw-secret-model-text"); } }, "solution_intelligence_validated", "scan_workflow_internal_failed", ["ingest","problem.generate","problem.validate","problem.diagnostics","problem.calibration","solution.generate"]);
  await expectFailure({ computeSolutionDiagnostics: () => { throw new Error("raw-secret-model-text"); } }, "solution_diagnostics_computed", "scan_workflow_internal_failed", ["ingest","problem.generate","problem.validate","problem.diagnostics","problem.calibration","solution.generate","solution.validate"]);
});

test("derived context is not independent evidence", () => { const d=buildDerivedProblemContext(analysis()); assert.equal(d.content.includes("pasted-evidence-001"), false); assert.equal(d.content.includes("internal_derived_problem_intelligence"), true); });

test("intent rejects unknown execution and user supplied control fields", () => { assert.throws(() => validateScanWorkflowIntent({ market:"x", executionId:"bad" })); assert.throws(() => validateScanWorkflowIntent({ market:"x", status:"completed" })); });

test("safe workflow log omits private shape", async () => { const result=await executeScanWorkflow({ intent:{ market:"Secret Market" }, pastedEvidence:"Competitor Acme has private painful evidence details." }, TEST_SCAN_WORKFLOW_AUTHORIZATION, deps()); const log=buildSafeScanWorkflowLog({ event:"x", result }); const s=JSON.stringify(log); for (const token of ["Secret Market","Acme","pasted-evidence-001","painful evidence","user_"]) assert.equal(s.includes(token), false); });

test("source compatibility and no migrations", () => { assert.match(readFileSync("app/scan/page.tsx","utf8"), /api\/analyze-evidence/); assert.match(readFileSync("app/api/analyze-evidence/route.ts","utf8"), /return Response\.json\(\{ analysis \}\)/); assert.match(readFileSync("app/api/solution-intelligence/route.ts","utf8"), /success: true,\s*solutionIntelligence/s); assert.equal(readdirSync("supabase/migrations").some(f => f.includes("workflow")), false); assert.doesNotMatch(readFileSync("lib/scan/workflow.ts","utf8"), /supabase|\.from\(|insert\(|upsert\(|update\(|delete\(/i); assert.match(readFileSync("app/api/scan/workflow/route.ts","utf8"), /SCAN_SERVER_WORKFLOW_ENABLED/); assert.match(readFileSync("app/api/scan/workflow/route.ts","utf8"), /requireUser/); });

test("workflow hardening source assertions cover route boundaries and public errors", () => {
  const route = readFileSync("app/api/scan/workflow/route.ts", "utf8");
  const analyze = readFileSync("app/api/analyze-evidence/route.ts", "utf8");
  assert.match(route, /preflightScanEvidenceMultipartFiles\(form\.getAll\("files"\)\)/);
  assert.match(route, /SCAN_SERVER_WORKFLOW_ALLOWED_USER_IDS/);
  assert.match(route, /const user = await requireUser\(request\);[\s\S]*authorizationFor[\s\S]*parseMultipartScanWorkflowInput/);
  assert.match(route, /FORBIDDEN_CLIENT_FIELDS/);
  assert.doesNotMatch(route, /await file\.arrayBuffer\(\)[\s\S]*preflightScanEvidenceMultipartFiles/);
  assert.match(analyze, /analyze_evidence_unexpected_error/);
  assert.match(analyze, /return Response\.json\(\{ error: "Failed to analyze evidence\." \}/);
  assert.doesNotMatch(analyze, /error instanceof Error \? error\.message/);
});
