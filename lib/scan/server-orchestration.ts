import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AuthError, requireUser } from "../../app/api/_utils/auth.ts";
import { ScanAcceptanceError, acceptScanRequest, scanAcceptanceHttpStatusForCode } from "./acceptance.ts";
import { createScanArtifactPersistenceAuthorizationContext, type ScanArtifactPersistenceAuthorizationContext } from "./artifact-persistence.ts";
import { runScanArtifactPersistenceShadow } from "./artifact-persistence-shadow-runner.ts";
import { preflightScanEvidenceMultipartFiles, ScanEvidenceIngestionError, scanEvidenceHttpStatusForCode, type ScanDiscoverContextInput, type ScanEvidenceFileInput, type ScanExternalSnippetInput } from "./evidence-ingestion.ts";
import { recordOperationalEvent } from "../operational-events.ts";
import { deriveSuitabilityBand } from "./solution-intelligence.ts";
import { buildSafeScanWorkflowLog, executeScanWorkflow, isScanWorkflowFailure, scanWorkflowHttpStatusForFailure, type ScanWorkflowAuthorizationContext, type ScanWorkflowFailureResult, type ScanWorkflowInput, type ScanWorkflowResult } from "./workflow.ts";

export const SCAN_SERVER_ORCHESTRATION_VERSION = "scan-server-orchestration@1" as const;

const ALLOWED_TOP_LEVEL = new Set(["intent", "pastedEvidence", "files", "externalSnippets", "discoverContext", "legacyContext"]);
const ALLOWED_MULTIPART = new Set(["intent", "pastedEvidence", "files", "externalSnippets", "discoverContext", "legacyContext"]);
const ALLOWED_INTENT = new Set(["market", "niche", "audience", "region", "description"]);
const ALLOWED_ITEM = new Set(["title", "content"]);
const ALLOWED_LEGACY_CONTEXT = new Set(["sourceProblemTitle", "sourceProblemId", "sourceDiscoveryId"]);
const FORBIDDEN_CLIENT_FIELDS = new Set(["userId", "executionId", "status", "allowedEvidenceIds", "derivedAnalysis", "calibration", "diagnostics", "workflowVersion", "technicalContext", "authorization", "authorizationMode"]);

type AuthenticatedScanUser = Readonly<{ id?: string }>;
export type ScanServerOrchestrationConfig = Readonly<{ workflowEnabled: boolean; persistenceShadowEnabled: boolean; allowedUserIds: ReadonlySet<string> }>;
export type ScanServerOrchestrationSuccessResponse = Readonly<{ success: true; scanId?: string; workflow: Readonly<{ version: ScanWorkflowResult["version"]; executionId: string; status: "completed"; problemIntelligence: ScanWorkflowResult["problemIntelligence"]; problemCalibration: Pick<ScanWorkflowResult["problemCalibration"], "version" | "score10" | "score100" | "scoreBand" | "reliabilityClassification">; solutionIntelligence: ScanWorkflowResult["solutionIntelligence"]; evidenceSummary: ScanWorkflowResult["evidence"]; processingHistory: ScanWorkflowResult["processingHistory"]; technicalContext: ScanWorkflowResult["technicalContext"] }> }>;
export type ScanServerOrchestrationFailureResponse = Readonly<{ success: false; error: Readonly<{ code: ScanWorkflowFailureResult["error"]["code"]; stage: ScanWorkflowFailureResult["error"]["stage"]; message: string }>; execution: Readonly<{ version: ScanWorkflowFailureResult["version"]; executionId: string; status: "failed"; processingHistory: ScanWorkflowFailureResult["processingHistory"] }> }>;

function objectRecord(value: unknown) { return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype); }
function failInvalid(): never { throw new ScanEvidenceIngestionError("scan_evidence_request_invalid"); }
function validateKeys(record: Record<string, unknown>, allowed: Set<string>) { for (const key of Object.keys(record)) if (!allowed.has(key) || FORBIDDEN_CLIENT_FIELDS.has(key)) failInvalid(); }
function stringField(value: unknown, max: number) { if (value === undefined) return undefined; if (typeof value !== "string") failInvalid(); const normalized = value.trim().slice(0, max); return normalized || undefined; }
function parseIntent(value: unknown) { if (!objectRecord(value)) failInvalid(); const record = value as Record<string, unknown>; validateKeys(record, ALLOWED_INTENT); const market = stringField(record.market, 120); const niche = stringField(record.niche, 120); const audience = stringField(record.audience, 120); const region = stringField(record.region, 80); const description = stringField(record.description, 600); return Object.freeze({ ...(market ? { market } : {}), ...(niche ? { niche } : {}), ...(audience ? { audience } : {}), ...(region ? { region } : {}), ...(description ? { description } : {}) }); }
function parseLegacyContext(value: unknown) { if (value === undefined) return undefined; if (!objectRecord(value)) failInvalid(); const record = value as Record<string, unknown>; validateKeys(record, ALLOWED_LEGACY_CONTEXT); return Object.freeze({ sourceProblemTitle: stringField(record.sourceProblemTitle, 200), sourceProblemId: stringField(record.sourceProblemId, 120), sourceDiscoveryId: stringField(record.sourceDiscoveryId, 120) }); }
function parseItems(value: unknown) { if (value === undefined) return undefined; if (!Array.isArray(value)) failInvalid(); return Object.freeze(value.map((item) => { if (!objectRecord(item)) failInvalid(); const record = item as Record<string, unknown>; validateKeys(record, ALLOWED_ITEM); const content = stringField(record.content, 4_000); if (!content) failInvalid(); const title = stringField(record.title, 120); return Object.freeze({ ...(title ? { title } : {}), content }); })) as readonly (ScanExternalSnippetInput | ScanDiscoverContextInput)[]; }
function parseBoundedJson(raw: FormDataEntryValue | null) { if (raw === null) return undefined; if (typeof raw !== "string" || raw.length > 80_000) failInvalid(); try { return JSON.parse(raw); } catch { failInvalid(); } }


export type ScanLegacyContext = Readonly<{ sourceProblemTitle?: string; sourceProblemId?: string; sourceDiscoveryId?: string }>;
type ScanPersistenceClient = Pick<SupabaseClient, "from" | "rpc">;

function readSupabaseConfig(env: NodeJS.ProcessEnv = process.env) { const url = env.NEXT_PUBLIC_SUPABASE_URL; const key = env.SUPABASE_SERVICE_ROLE_KEY; if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing."); if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing."); return { url, key }; }
export function createScanOrchestrationPersistenceClient(): SupabaseClient { const { url, key } = readSupabaseConfig(); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
async function transitionLegacyScan(client: ScanPersistenceClient, scanId: string, userId: string, status: "processing" | "completed" | "failed") { const { error } = await client.from("scan").update({ status }).eq("id", scanId).eq("user_id", userId); if (error) throw error; }
async function persistLegacyResults(client: ScanPersistenceClient, userId: string, scanId: string, workflow: ScanWorkflowResult, legacyContext?: ScanLegacyContext) {
  const p = workflow.problemIntelligence;
  const { error: analysisError } = await client.from("evidence_analysis").insert([{ scan_id: scanId, inferred_market: p.inferred_market, audience_summary: p.audience_summary, evidence_summary: p.evidence_summary, pain_points: p.pain_points, repeated_patterns: p.repeated_patterns, workflow_problems: p.workflow_problems, willingness_to_pay_signals: p.willingness_to_pay_signals, opportunity_angles: p.opportunity_angles, confidence_score: p.confidence_score }]);
  if (analysisError) throw analysisError;
  const candidates = workflow.solutionIntelligence.evaluatedCategories.slice(0, 3);
  const rows = candidates.map((solution) => { const suitabilityBand = deriveSuitabilityBand(solution.suitability); return ({ user_id: userId, scan_id: scanId, source_problem_title: legacyContext?.sourceProblemTitle || workflow.intent.market || p.inferred_market || null, source_problem_id: legacyContext?.sourceProblemId || null, source_discovery_id: legacyContext?.sourceDiscoveryId || null, title: `${solution.category.replace(/_/g, " ")} opportunity`, score: Math.max(1, Math.min(10, Math.round(solution.suitability * 10 || workflow.problemCalibration.score10 || 7))), pain: p.pain_points || p.evidence_summary || "No pain point provided.", customer: p.audience_summary || workflow.intent.audience || "Not specified.", mvp: solution.rationale.text || "Not specified.", pricing: p.willingness_to_pay_signals || "Not specified.", difficulty: suitabilityBand === "best_fit" || suitabilityBand === "strong" ? "Medium" : "Hard", problem_summary: p.evidence_summary || p.pain_points || null, target_customer: p.audience_summary || null, mvp_roadmap: solution.rationale.text || null, validation_questions: workflow.solutionIntelligence.nextValidationAction.text || null, landing_page_idea: `${solution.category.replace(/_/g, " ")} for ${p.inferred_market || workflow.intent.market || "this market"}`, acquisition_channels: workflow.solutionIntelligence.validationReadiness.cheapestNextTest || null }); });
  if (rows.length === 0) throw new Error("opportunity_generation_empty");
  const { error: opportunityError } = await client.from("opportunities").insert(rows);
  if (opportunityError) throw opportunityError;
}
export async function executeAcceptedScanWorkflow(input: ScanWorkflowInput & { legacyContext?: ScanLegacyContext }, _request: Request, user: AuthenticatedScanUser, authorization: ScanWorkflowAuthorizationContext, client = createScanOrchestrationPersistenceClient()) {
  const acceptance = await acceptScanRequest({ market: input.intent.market ?? input.intent.niche, audience: input.intent.audience, region: input.intent.region, evidence: input.pastedEvidence }, { id: user.id || "" }, client);
  try {
    await transitionLegacyScan(client, acceptance.scanId, user.id || "", "processing");
    const workflow = await executeScanOrchestrationWorkflow(input, authorization);
    await persistLegacyResults(client, user.id || "", acceptance.scanId, workflow, input.legacyContext);
    await transitionLegacyScan(client, acceptance.scanId, user.id || "", "completed");
    return { acceptance, workflow };
  } catch (error) {
    await transitionLegacyScan(client, acceptance.scanId, user.id || "", "failed").catch(() => undefined);
    throw error;
  }
}

// This allowlist is a rollout/access gate only. It does not grant quota or exceptional entitlements.
export function readScanServerOrchestrationConfig(env: NodeJS.ProcessEnv = process.env): ScanServerOrchestrationConfig { return Object.freeze({ workflowEnabled: env.SCAN_SERVER_WORKFLOW_ENABLED === "true", persistenceShadowEnabled: env.SCAN_ARTIFACT_PERSISTENCE_SHADOW_ENABLED === "true", allowedUserIds: new Set((env.SCAN_SERVER_WORKFLOW_ALLOWED_USER_IDS || "").split(",").map((v) => v.trim()).filter(Boolean)) }); }
export function validateJsonScanOrchestrationRequest(body: unknown): ScanWorkflowInput & { legacyContext?: ScanLegacyContext } { if (!objectRecord(body)) failInvalid(); const record = body as Record<string, unknown>; validateKeys(record, ALLOWED_TOP_LEVEL); if (record.files !== undefined) failInvalid(); return Object.freeze({ intent: parseIntent(record.intent), pastedEvidence: stringField(record.pastedEvidence, 12_000), externalSnippets: parseItems(record.externalSnippets) as readonly ScanExternalSnippetInput[] | undefined, discoverContext: parseItems(record.discoverContext) as readonly ScanDiscoverContextInput[] | undefined, legacyContext: parseLegacyContext(record.legacyContext) }); }
export async function validateMultipartScanOrchestrationRequest(request: Request): Promise<ScanWorkflowInput & { legacyContext?: ScanLegacyContext }> { const form = await request.formData(); for (const key of form.keys()) if (!ALLOWED_MULTIPART.has(key) || FORBIDDEN_CLIENT_FIELDS.has(key)) failInvalid(); const preflight = preflightScanEvidenceMultipartFiles(form.getAll("files")); const files: ScanEvidenceFileInput[] = []; for (const file of preflight.files) files.push({ filename: file.name, mimeType: file.type, byteLength: file.size, bytes: Buffer.from(await file.arrayBuffer()) }); return Object.freeze({ intent: parseIntent(parseBoundedJson(form.get("intent")) ?? {}), pastedEvidence: stringField(form.get("pastedEvidence"), 12_000), files: Object.freeze(files), externalSnippets: parseItems(parseBoundedJson(form.get("externalSnippets"))) as readonly ScanExternalSnippetInput[] | undefined, discoverContext: parseItems(parseBoundedJson(form.get("discoverContext"))) as readonly ScanDiscoverContextInput[] | undefined, legacyContext: parseLegacyContext(parseBoundedJson(form.get("legacyContext"))) }); }
export function authorizeScanOrchestration(user: AuthenticatedScanUser | null, config: Pick<ScanServerOrchestrationConfig, "allowedUserIds">): ScanWorkflowAuthorizationContext | null { if (user?.id && config.allowedUserIds.has(user.id)) return Object.freeze({ authenticated: true, authorizationMode: "internal_user" }); return null; }
export async function executeScanOrchestrationWorkflow(input: ScanWorkflowInput, authorization: ScanWorkflowAuthorizationContext) { return executeScanWorkflow(input, authorization); }
export async function persistScanOrchestrationArtifacts(input: { enabled: boolean; user: AuthenticatedScanUser | null; completedWorkflow: ScanWorkflowResult }) { let authorization: ScanArtifactPersistenceAuthorizationContext | null = null; try { authorization = createScanArtifactPersistenceAuthorizationContext(input.user); } catch { authorization = null; } await runScanArtifactPersistenceShadow({ enabled: input.enabled, authorization, completedWorkflow: input.completedWorkflow }); }
export function mapScanOrchestrationSuccessResponse(workflow: ScanWorkflowResult, scanId?: string): ScanServerOrchestrationSuccessResponse { return Object.freeze({ success: true, ...(scanId ? { scanId } : {}), workflow: { version: workflow.version, executionId: workflow.executionId, status: workflow.status, problemIntelligence: workflow.problemIntelligence, problemCalibration: { version: workflow.problemCalibration.version, score10: workflow.problemCalibration.score10, score100: workflow.problemCalibration.score100, scoreBand: workflow.problemCalibration.scoreBand, reliabilityClassification: workflow.problemCalibration.reliabilityClassification }, solutionIntelligence: workflow.solutionIntelligence, evidenceSummary: workflow.evidence, processingHistory: workflow.processingHistory, technicalContext: workflow.technicalContext } }); }
export function mapScanOrchestrationFailureResponse(failure: ScanWorkflowFailureResult): ScanServerOrchestrationFailureResponse { const message = failure.error.code === "scan_workflow_solution_grounding_failed" ? "The generated solutions could not be reliably grounded in the supplied evidence." : failure.error.message; return Object.freeze({ success:false, error:{ code: failure.error.code, stage: failure.error.stage, message }, execution:{ version:failure.version, executionId:failure.executionId, status:failure.status, processingHistory:failure.processingHistory } }); }
export function scanOrchestrationUnavailableResponse() { return Response.json({ success:false, error:{ code:"scan_workflow_temporarily_unavailable", message:"The Scan workflow is temporarily unavailable." } }, { status: 503 }); }

export async function runScanServerOrchestration(request: Request, config: ScanServerOrchestrationConfig = readScanServerOrchestrationConfig()): Promise<Response> {
  try {
    if (!config.workflowEnabled) return scanOrchestrationUnavailableResponse();
    const user = await requireUser(request);
    const authorization = authorizeScanOrchestration(user as AuthenticatedScanUser, config);
    if (!authorization) return scanOrchestrationUnavailableResponse();
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("multipart/form-data") ? await validateMultipartScanOrchestrationRequest(request) : validateJsonScanOrchestrationRequest(await request.json());
    const workflowStartedAt = Date.now();
    await recordOperationalEvent({ workflow: "scan", eventType: "started", status: "started", userId: user.id || null, safeMetadata: { provider: "openrouter" } });
    const { acceptance, workflow: result } = await executeAcceptedScanWorkflow(input, request, user as AuthenticatedScanUser, authorization);
    await persistScanOrchestrationArtifacts({ enabled: config.persistenceShadowEnabled, user: user as AuthenticatedScanUser, completedWorkflow: result });
    console.info("Scan workflow", buildSafeScanWorkflowLog({ event:"scan_workflow_completed", result }));
    await recordOperationalEvent({ workflow: "scan", eventType: "completed", status: "completed", userId: user.id || null, durationMs: Date.now() - workflowStartedAt, safeMetadata: { scanId: acceptance.scanId, provider: "openrouter", sourcesProcessed: result.evidence.sourceCount } });
    return Response.json(mapScanOrchestrationSuccessResponse(result, acceptance.scanId));
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ success:false, error:"Unauthorized" }, { status:error.status });
    if (isScanWorkflowFailure(error)) { console.warn("Scan workflow", buildSafeScanWorkflowLog({ event:"scan_workflow_failed", failure:error })); await recordOperationalEvent({ workflow: "scan", eventType: "failed", status: "failed", durationMs: undefined, failureCategory: error.error.code, safeMetadata: { provider: "openrouter" } }); return Response.json(mapScanOrchestrationFailureResponse(error), { status: scanWorkflowHttpStatusForFailure(error) }); }
    if (error instanceof ScanAcceptanceError) { await recordOperationalEvent({ workflow: "scan", eventType: "failed", status: "failed", failureCategory: error.code, safeMetadata: { provider: "openrouter", stage: "acceptance" } }).catch(() => undefined); return Response.json({ success:false, error:{ code:error.code, stage:"acceptance", message:error.message } }, { status: scanAcceptanceHttpStatusForCode(error.code) }); }
    if (error instanceof ScanEvidenceIngestionError) return Response.json({ success:false, error:{ code:error.code, message:"The Scan workflow request is invalid." } }, { status: scanEvidenceHttpStatusForCode(error.code) });
    await recordOperationalEvent({ workflow: "scan", eventType: "failed", status: "failed", failureCategory: "scan_workflow_persistence_failed", safeMetadata: { provider: "openrouter", stage: "persistence" } }).catch(() => undefined);
    return Response.json({ success:false, error:{ code:"scan_acceptance_persistence_failed", stage:"persistence", message:"The Scan could not be accepted." } }, { status:500 });
  }
}
