import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { authorizeScanOrchestration, mapScanOrchestrationFailureResponse, mapScanOrchestrationSuccessResponse, readScanServerOrchestrationConfig, validateJsonScanOrchestrationRequest } from "../lib/scan/server-orchestration.ts";
import { ScanEvidenceIngestionError } from "../lib/scan/evidence-ingestion.ts";
import type { ScanWorkflowFailureResult, ScanWorkflowResult } from "../lib/scan/workflow.ts";

test("scan server orchestration validates request shape before workflow execution", () => {
  const input = validateJsonScanOrchestrationRequest({
    intent: { market: " Agencies ", audience: " Owners ", region: " US ", description: " Manual reporting " },
    pastedEvidence: " Evidence text ",
    externalSnippets: [{ title: "Forum", content: "Operators complain about manual weekly reporting." }],
    discoverContext: [{ content: "Prior Discovery problem context." }],
  });

  assert.deepEqual(input.intent, { market: "Agencies", niche: undefined, audience: "Owners", region: "US", description: "Manual reporting" });
  assert.equal(input.pastedEvidence, "Evidence text");
  assert.equal(input.externalSnippets?.[0]?.title, "Forum");
  assert.equal(input.discoverContext?.[0]?.content, "Prior Discovery problem context.");
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
