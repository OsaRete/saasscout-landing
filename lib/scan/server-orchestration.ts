import "server-only";

import { AuthError, requireUser } from "../../app/api/_utils/auth.ts";
import { createScanArtifactPersistenceAuthorizationContext, type ScanArtifactPersistenceAuthorizationContext } from "./artifact-persistence.ts";
import { runScanArtifactPersistenceShadow } from "./artifact-persistence-shadow-runner.ts";
import { preflightScanEvidenceMultipartFiles, ScanEvidenceIngestionError, scanEvidenceHttpStatusForCode, type ScanDiscoverContextInput, type ScanEvidenceFileInput, type ScanExternalSnippetInput } from "./evidence-ingestion.ts";
import { buildSafeScanWorkflowLog, executeScanWorkflow, isScanWorkflowFailure, scanWorkflowHttpStatusForFailure, type ScanWorkflowAuthorizationContext, type ScanWorkflowFailureResult, type ScanWorkflowInput, type ScanWorkflowResult } from "./workflow.ts";

export const SCAN_SERVER_ORCHESTRATION_VERSION = "scan-server-orchestration@1" as const;

const ALLOWED_TOP_LEVEL = new Set(["intent", "pastedEvidence", "files", "externalSnippets", "discoverContext"]);
const ALLOWED_MULTIPART = new Set(["intent", "pastedEvidence", "files", "externalSnippets", "discoverContext"]);
const ALLOWED_INTENT = new Set(["market", "niche", "audience", "region", "description"]);
const ALLOWED_ITEM = new Set(["title", "content"]);
const FORBIDDEN_CLIENT_FIELDS = new Set(["userId", "executionId", "status", "allowedEvidenceIds", "derivedAnalysis", "calibration", "diagnostics", "workflowVersion", "technicalContext", "authorization", "authorizationMode"]);

type AuthenticatedScanUser = Readonly<{ id?: string }>;
export type ScanServerOrchestrationConfig = Readonly<{ workflowEnabled: boolean; persistenceShadowEnabled: boolean; allowedUserIds: ReadonlySet<string> }>;
export type ScanServerOrchestrationSuccessResponse = Readonly<{ success: true; workflow: Readonly<{ version: ScanWorkflowResult["version"]; executionId: string; status: "completed"; problemIntelligence: ScanWorkflowResult["problemIntelligence"]; problemCalibration: Pick<ScanWorkflowResult["problemCalibration"], "version" | "score10" | "score100" | "scoreBand" | "reliabilityClassification">; solutionIntelligence: ScanWorkflowResult["solutionIntelligence"]; evidenceSummary: ScanWorkflowResult["evidence"]; processingHistory: ScanWorkflowResult["processingHistory"]; technicalContext: ScanWorkflowResult["technicalContext"] }> }>;
export type ScanServerOrchestrationFailureResponse = Readonly<{ success: false; error: Readonly<{ code: ScanWorkflowFailureResult["error"]["code"]; stage: ScanWorkflowFailureResult["error"]["stage"]; message: ScanWorkflowFailureResult["error"]["message"] }>; execution: Readonly<{ version: ScanWorkflowFailureResult["version"]; executionId: string; status: "failed"; processingHistory: ScanWorkflowFailureResult["processingHistory"] }> }>;

function objectRecord(value: unknown) { return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype); }
function failInvalid(): never { throw new ScanEvidenceIngestionError("scan_evidence_request_invalid"); }
function validateKeys(record: Record<string, unknown>, allowed: Set<string>) { for (const key of Object.keys(record)) if (!allowed.has(key) || FORBIDDEN_CLIENT_FIELDS.has(key)) failInvalid(); }
function stringField(value: unknown, max: number) { if (value === undefined) return undefined; if (typeof value !== "string") failInvalid(); return value.trim().slice(0, max); }
function parseIntent(value: unknown) { if (!objectRecord(value)) failInvalid(); const record = value as Record<string, unknown>; validateKeys(record, ALLOWED_INTENT); return Object.freeze({ market: stringField(record.market, 120), niche: stringField(record.niche, 120), audience: stringField(record.audience, 120), region: stringField(record.region, 80), description: stringField(record.description, 600) }); }
function parseItems(value: unknown) { if (value === undefined) return undefined; if (!Array.isArray(value)) failInvalid(); return Object.freeze(value.map((item) => { if (!objectRecord(item)) failInvalid(); const record = item as Record<string, unknown>; validateKeys(record, ALLOWED_ITEM); const content = stringField(record.content, 4_000); if (!content) failInvalid(); const title = stringField(record.title, 120); return Object.freeze({ ...(title ? { title } : {}), content }); })) as readonly (ScanExternalSnippetInput | ScanDiscoverContextInput)[]; }
function parseBoundedJson(raw: FormDataEntryValue | null) { if (raw === null) return undefined; if (typeof raw !== "string" || raw.length > 80_000) failInvalid(); try { return JSON.parse(raw); } catch { failInvalid(); } }

export function readScanServerOrchestrationConfig(env: NodeJS.ProcessEnv = process.env): ScanServerOrchestrationConfig { return Object.freeze({ workflowEnabled: env.SCAN_SERVER_WORKFLOW_ENABLED === "true", persistenceShadowEnabled: env.SCAN_ARTIFACT_PERSISTENCE_SHADOW_ENABLED === "true", allowedUserIds: new Set((env.SCAN_SERVER_WORKFLOW_ALLOWED_USER_IDS || "").split(",").map((v) => v.trim()).filter(Boolean)) }); }
export function validateJsonScanOrchestrationRequest(body: unknown): ScanWorkflowInput { if (!objectRecord(body)) failInvalid(); const record = body as Record<string, unknown>; validateKeys(record, ALLOWED_TOP_LEVEL); if (record.files !== undefined) failInvalid(); return Object.freeze({ intent: parseIntent(record.intent), pastedEvidence: stringField(record.pastedEvidence, 12_000), externalSnippets: parseItems(record.externalSnippets) as readonly ScanExternalSnippetInput[] | undefined, discoverContext: parseItems(record.discoverContext) as readonly ScanDiscoverContextInput[] | undefined }); }
export async function validateMultipartScanOrchestrationRequest(request: Request): Promise<ScanWorkflowInput> { const form = await request.formData(); for (const key of form.keys()) if (!ALLOWED_MULTIPART.has(key) || FORBIDDEN_CLIENT_FIELDS.has(key)) failInvalid(); const preflight = preflightScanEvidenceMultipartFiles(form.getAll("files")); const files: ScanEvidenceFileInput[] = []; for (const file of preflight.files) files.push({ filename: file.name, mimeType: file.type, byteLength: file.size, bytes: Buffer.from(await file.arrayBuffer()) }); return Object.freeze({ intent: parseIntent(parseBoundedJson(form.get("intent")) ?? {}), pastedEvidence: stringField(form.get("pastedEvidence"), 12_000), files: Object.freeze(files), externalSnippets: parseItems(parseBoundedJson(form.get("externalSnippets"))) as readonly ScanExternalSnippetInput[] | undefined, discoverContext: parseItems(parseBoundedJson(form.get("discoverContext"))) as readonly ScanDiscoverContextInput[] | undefined }); }
export function authorizeScanOrchestration(user: AuthenticatedScanUser | null, config: Pick<ScanServerOrchestrationConfig, "allowedUserIds">): ScanWorkflowAuthorizationContext | null { if (user?.id && config.allowedUserIds.has(user.id)) return Object.freeze({ authenticated: true, authorizationMode: "internal_user" }); return null; }
export async function executeScanOrchestrationWorkflow(input: ScanWorkflowInput, authorization: ScanWorkflowAuthorizationContext) { return executeScanWorkflow(input, authorization); }
export async function persistScanOrchestrationArtifacts(input: { enabled: boolean; user: AuthenticatedScanUser | null; completedWorkflow: ScanWorkflowResult }) { let authorization: ScanArtifactPersistenceAuthorizationContext | null = null; try { authorization = createScanArtifactPersistenceAuthorizationContext(input.user); } catch { authorization = null; } await runScanArtifactPersistenceShadow({ enabled: input.enabled, authorization, completedWorkflow: input.completedWorkflow }); }
export function mapScanOrchestrationSuccessResponse(workflow: ScanWorkflowResult): ScanServerOrchestrationSuccessResponse { return Object.freeze({ success: true, workflow: { version: workflow.version, executionId: workflow.executionId, status: workflow.status, problemIntelligence: workflow.problemIntelligence, problemCalibration: { version: workflow.problemCalibration.version, score10: workflow.problemCalibration.score10, score100: workflow.problemCalibration.score100, scoreBand: workflow.problemCalibration.scoreBand, reliabilityClassification: workflow.problemCalibration.reliabilityClassification }, solutionIntelligence: workflow.solutionIntelligence, evidenceSummary: workflow.evidence, processingHistory: workflow.processingHistory, technicalContext: workflow.technicalContext } }); }
export function mapScanOrchestrationFailureResponse(failure: ScanWorkflowFailureResult): ScanServerOrchestrationFailureResponse { return Object.freeze({ success:false, error:{ code: failure.error.code, stage: failure.error.stage, message: failure.error.message }, execution:{ version:failure.version, executionId:failure.executionId, status:failure.status, processingHistory:failure.processingHistory } }); }
export function scanOrchestrationUnavailableResponse() { return Response.json({ success:false, error:{ code:"scan_workflow_temporarily_unavailable", message:"The Scan workflow is temporarily unavailable." } }, { status: 503 }); }

export async function runScanServerOrchestration(request: Request, config: ScanServerOrchestrationConfig = readScanServerOrchestrationConfig()): Promise<Response> {
  try {
    if (!config.workflowEnabled) return scanOrchestrationUnavailableResponse();
    const user = await requireUser(request);
    const authorization = authorizeScanOrchestration(user as AuthenticatedScanUser, config);
    if (!authorization) return scanOrchestrationUnavailableResponse();
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("multipart/form-data") ? await validateMultipartScanOrchestrationRequest(request) : validateJsonScanOrchestrationRequest(await request.json());
    const result = await executeScanOrchestrationWorkflow(input, authorization);
    await persistScanOrchestrationArtifacts({ enabled: config.persistenceShadowEnabled, user: user as AuthenticatedScanUser, completedWorkflow: result });
    console.info("Scan workflow", buildSafeScanWorkflowLog({ event:"scan_workflow_completed", result }));
    return Response.json(mapScanOrchestrationSuccessResponse(result));
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ success:false, error:"Unauthorized" }, { status:error.status });
    if (isScanWorkflowFailure(error)) { console.warn("Scan workflow", buildSafeScanWorkflowLog({ event:"scan_workflow_failed", failure:error })); return Response.json(mapScanOrchestrationFailureResponse(error), { status: scanWorkflowHttpStatusForFailure(error) }); }
    if (error instanceof ScanEvidenceIngestionError) return Response.json({ success:false, error:{ code:error.code, message:"The Scan workflow request is invalid." } }, { status: scanEvidenceHttpStatusForCode(error.code) });
    return Response.json({ success:false, error:{ code:"scan_workflow_request_invalid", message:"The Scan workflow request is invalid." } }, { status:400 });
  }
}
