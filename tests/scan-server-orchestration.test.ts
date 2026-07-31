import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { authorizeScanOrchestration, mapScanOrchestrationFailureResponse, mapScanOrchestrationSuccessResponse, readScanServerOrchestrationConfig, validateJsonScanOrchestrationRequest } from "../lib/scan/server-orchestration.ts";
import { ScanEvidenceIngestionError } from "../lib/scan/evidence-ingestion.ts";
import { executeScanWorkflow, isScanWorkflowFailure, validateScanWorkflowIntent, type ScanWorkflowFailureResult, type ScanWorkflowResult } from "../lib/scan/workflow.ts";
import { validateScanTrustedIntent } from "../lib/scan/trusted-intent.ts";

test("scan server orchestration validates request shape before workflow execution", () => {
  const input = validateJsonScanOrchestrationRequest({
    intent: { market: " Agencies ", audience: " Owners ", region: " US ", description: " Manual reporting " },
    pastedEvidence: " Evidence text ",
    externalSnippets: [{ title: "Forum", content: "Operators complain about manual weekly reporting." }],
    discoverContext: [{ content: "Prior Discovery problem context." }],
  });

  assert.deepEqual(input.intent, { market: "Agencies", audience: "Owners", region: "US", description: "Manual reporting" });
  assert.equal(input.pastedEvidence, "Evidence text");
  assert.equal(input.externalSnippets?.[0]?.title, "Forum");
  assert.equal(input.discoverContext?.[0]?.content, "Prior Discovery problem context.");
});

test("scan request boundary omits absent and normalized-empty intent fields", () => {
  const complete = validateJsonScanOrchestrationRequest({ intent: { market: " Small Businesses ", audience: " Small business owners ", region: " Global " } });
  assert.deepEqual(complete.intent, { market: "Small Businesses", audience: "Small business owners", region: "Global" });
  assert.equal(Object.hasOwn(complete.intent, "niche"), false);
  assert.equal(Object.hasOwn(complete.intent, "description"), false);
  assert.equal(Object.values(complete.intent).includes(undefined), false);
  const marketOnly = validateJsonScanOrchestrationRequest({ intent: { market: " Small Businesses ", niche: "   ", description: "\t" } });
  assert.deepEqual(marketOnly.intent, { market: "Small Businesses" });
  assert.deepEqual(validateScanWorkflowIntent(marketOnly.intent), { market: "Small Businesses" });
});

test("scan intent remains strict after request-boundary normalization", () => {
  assert.throws(() => validateScanWorkflowIntent(validateJsonScanOrchestrationRequest({ intent: { market: " ", niche: "\t" } }).intent));
  assert.throws(() => validateJsonScanOrchestrationRequest({ intent: { market: "Agencies", unexpected: "value" } }), ScanEvidenceIngestionError);
  assert.throws(() => validateScanTrustedIntent({ niche: undefined }));
  assert.throws(() => validateScanTrustedIntent({ audience: "" }));
});

test("production-shaped Deep Scan input progresses beyond input_validated", async () => {
  const input = validateJsonScanOrchestrationRequest({ intent: { market: " Small Businesses ", audience: " Small business owners ", region: " Global ", niche: "", description: " " }, pastedEvidence: "Production-shaped evidence is long enough to reach evidence ingestion." });
  await assert.rejects(() => executeScanWorkflow(input, { authenticated: true, authorizationMode: "internal_user" }, { now: () => new Date("2026-01-01T00:00:00.000Z"), createExecutionId: () => "scan-workflow-00000000-0000-4000-8000-000000000000", ingestEvidence: async () => { throw new ScanEvidenceIngestionError("scan_evidence_request_invalid"); } } as never), (error) => {
    assert.equal(isScanWorkflowFailure(error), true);
    const failure = error as ScanWorkflowFailureResult;
    assert.equal(failure.error.stage, "evidence_ingested");
    assert.equal(failure.processingHistory.some((record) => record.stage === "input_validated" && record.status === "completed"), true);
    return true;
  });
});

test("scan server orchestration rejects client-owned workflow and persistence fields", () => {
  assert.throws(() => validateJsonScanOrchestrationRequest({ intent: { market: "x" }, userId: "attacker" }), ScanEvidenceIngestionError);
  assert.throws(() => validateJsonScanOrchestrationRequest({ intent: { market: "x", executionId: "client" } }), ScanEvidenceIngestionError);
  assert.throws(() => validateJsonScanOrchestrationRequest({ intent: { market: "x" }, files: [] }), ScanEvidenceIngestionError);
  assert.throws(() => validateJsonScanOrchestrationRequest({ intent: { market: "x" }, externalSnippets: [{ content: "" }] }), ScanEvidenceIngestionError);
});

test("scan server orchestration authorization is server owned and environment gated", () => {
  const config = readScanServerOrchestrationConfig({ SCAN_SERVER_WORKFLOW_ENABLED: "true", SCAN_ARTIFACT_PERSISTENCE_SHADOW_ENABLED: "true", SCAN_SERVER_WORKFLOW_ALLOWED_USER_IDS: "user-a, user-b" });

  assert.equal(config.workflowEnabled, true);
  assert.equal(config.persistenceShadowEnabled, true);
  assert.deepEqual(authorizeScanOrchestration({ id: "user-a" }, config), { authenticated: true, authorizationMode: "internal_user" });
  assert.equal(authorizeScanOrchestration({ id: "user-c" }, config), null);
});

test("scan server orchestration response mapping preserves public workflow compatibility", () => {
  const workflow = {
    version: "scan-workflow@1",
    executionId: "scan-workflow-00000000-0000-4000-8000-000000000000",
    status: "completed",
    problemIntelligence: { inferred_market: "Agency ops" },
    problemCalibration: { version: "scan-score-calibration@1", score10: 8, score100: 80, scoreBand: "strong", reliabilityClassification: "directional", private: "omitted" },
    solutionIntelligence: { recommendedCategory: "validate_first" },
    evidence: { sourceCount: 1 },
    processingHistory: [],
    technicalContext: { workflowVersion: "scan-workflow@1" },
  } as unknown as ScanWorkflowResult;

  const response = mapScanOrchestrationSuccessResponse(workflow);
  assert.equal(response.success, true);
  assert.equal(response.workflow.evidenceSummary, workflow.evidence);
  assert.deepEqual(Object.keys(response.workflow.problemCalibration), ["version", "score10", "score100", "scoreBand", "reliabilityClassification"]);
});

test("scan server orchestration keeps route thin and separates boundaries", () => {
  const route = readFileSync("app/api/scan/workflow/route.ts", "utf8");
  const orchestration = readFileSync("lib/scan/server-orchestration.ts", "utf8");
  const workflow = readFileSync("lib/scan/workflow.ts", "utf8");

  assert.match(route, /runScanServerOrchestration/);
  assert.doesNotMatch(route, /supabase|\.from\(|insert\(|upsert\(|update\(|delete\(/i);
  assert.match(orchestration, /validateJsonScanOrchestrationRequest/);
  assert.match(orchestration, /executeAcceptedScanWorkflow/);
  assert.match(orchestration, /acceptScanRequest/);
  assert.match(orchestration, /transitionLegacyScan/);
  assert.match(orchestration, /persistLegacyResults/);
  assert.match(orchestration, /persistScanOrchestrationArtifacts/);
  assert.match(orchestration, /mapScanOrchestrationSuccessResponse/);
  assert.doesNotMatch(workflow, /supabase|\.from\(|insert\(|upsert\(|update\(|delete\(/i);
});

test("scan browser delegates workflow sequencing to the server workflow endpoint", () => {
  const page = readFileSync("app/scan/page.tsx", "utf8");

  assert.match(page, /fetch\("\/api\/scan\/workflow"/);
  assert.doesNotMatch(page, /fetch\("\/api\/scan\/acceptance"/);
  assert.doesNotMatch(page, /fetch\("\/api\/analyze-evidence"/);
  assert.doesNotMatch(page, /fetch\("\/api\/generate-opportunities"/);
  assert.doesNotMatch(page, /from\("opportunities"\)\.insert/);
  assert.doesNotMatch(page, /from\("evidence_analysis"\)\.insert/);
  assert.doesNotMatch(page, /status:\s*"processing"/);
  assert.doesNotMatch(page, /status:\s*"completed"/);
  assert.doesNotMatch(page, /status:\s*"failed"/);
});

test("scan server owns lifecycle persistence and Results compatibility rows", () => {
  const orchestration = readFileSync("lib/scan/server-orchestration.ts", "utf8");

  assert.match(orchestration, /acceptScanRequest/);
  assert.match(orchestration, /transitionLegacyScan\(client, acceptance\.scanId, user\.id \|\| "", "processing"\)/);
  assert.match(orchestration, /transitionLegacyScan\(client, acceptance\.scanId, user\.id \|\| "", "completed"\)/);
  assert.match(orchestration, /transitionLegacyScan\(client, acceptance\.scanId, user\.id \|\| "", "failed"\)/);
  assert.match(orchestration, /from\("evidence_analysis"\)\.insert/);
  assert.match(orchestration, /from\("opportunities"\)\.insert/);
  assert.match(orchestration, /source_discovery_id/);
  assert.match(orchestration, /source_problem_id/);
});

test("scan server orchestration failure response remains sanitized", () => {
  const failure = { version:"scan-workflow@1", executionId:"scan-workflow-x", status:"failed", error:{ code:"scan_workflow_internal_failed", stage:"failed", message:"The Scan workflow could not safely complete.", statusClass:"5xx" }, processingHistory:[] } as ScanWorkflowFailureResult;
  const response = mapScanOrchestrationFailureResponse(failure);
  assert.equal(JSON.stringify(response).includes("statusClass"), false);
});

test("scan server persistence keeps trusted user ownership constraints after browser write revocation", () => {
  const orchestration = readFileSync("lib/scan/server-orchestration.ts", "utf8");

  assert.match(orchestration, /createScanOrchestrationPersistenceClient\(\)/);
  assert.match(orchestration, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(orchestration, /acceptScanRequest\([^\n]+\{ id: user\.id \|\| "" \}/);
  assert.match(orchestration, /from\("scan"\)\.update\(\{ status \}\)\.eq\("id", scanId\)\.eq\("user_id", userId\)/);
  assert.match(orchestration, /user_id: userId/);
});

test("scan acceptance errors keep their safe status instead of workflow request-invalid", () => {
  const orchestration = readFileSync("lib/scan/server-orchestration.ts", "utf8");

  assert.match(orchestration, /error instanceof ScanAcceptanceError/);
  assert.match(orchestration, /scanAcceptanceHttpStatusForCode\(error\.code\)/);
  assert.match(orchestration, /stage:\s*"acceptance"/);
  assert.doesNotMatch(orchestration, /ScanAcceptanceError[\s\S]+scan_workflow_request_invalid/);
});

test("Scan page logs sanitized diagnostics without evidence or authorization headers", () => {
  const page = readFileSync("app/scan/page.tsx", "utf8");

  assert.match(page, /console\.warn\("Scan workflow failed", \{ code: safeCode, stage: safeStage, status: response\.status \}\)/);
  assert.doesNotMatch(page, /console\.(warn|error)\([^\n]*(evidence|Authorization|accessToken|headers)/);
});
