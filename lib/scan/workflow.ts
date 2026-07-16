import "server-only";
import { randomUUID } from "node:crypto";
import { buildTrustedUserIntent, type TrustedUserIntent } from "./evidence-envelope.ts";
import { ingestScanEvidence, SCAN_EVIDENCE_INGESTION_VERSION, toEvidenceEnvelopeInputs, type ScanDiscoverContextInput, type ScanEvidenceFileInput, type ScanEvidenceIngestionResult, type ScanEvidencePublicErrorCode, type ScanExternalSnippetInput } from "./evidence-ingestion.ts";
import { computeProblemIntelligenceCalibration, computeProblemIntelligenceDiagnostics, generateProblemIntelligenceModelOutput, ProblemIntelligenceServiceError, problemIntelligenceTechnicalMetadata, validateProblemIntelligenceModelOutput, type ProblemIntelligenceModelOutput, type ProblemIntelligenceServiceInput } from "./problem-intelligence-service.ts";
import { computeValidatedSolutionIntelligenceDiagnostics, generateSolutionIntelligenceModelOutput, SolutionIntelligenceServiceError, solutionIntelligenceTechnicalMetadata, validateSolutionIntelligenceModelOutput, type SolutionIntelligenceModelOutput, type SolutionIntelligenceServiceInput } from "./solution-intelligence-service.ts";
import type { AnalyzeEvidenceOutput } from "./output-validation.ts";
import type { ScanQualityDiagnostics } from "./quality-diagnostics.ts";
import type { ScanCalibratedScore } from "./score-calibration.ts";
import type { SolutionIntelligenceDiagnostics, SolutionIntelligenceResult } from "./solution-intelligence.ts";

export const SCAN_WORKFLOW_VERSION = "scan-workflow@1" as const;
export const SCAN_WORKFLOW_STAGE_ORDER = Object.freeze(["received", "authenticated", "input_validated", "evidence_ingested", "problem_intelligence_started", "problem_intelligence_validated", "problem_diagnostics_computed", "problem_calibration_computed", "solution_intelligence_started", "solution_intelligence_validated", "solution_diagnostics_computed", "completed"] as const);
export type ScanWorkflowStage = typeof SCAN_WORKFLOW_STAGE_ORDER[number] | "failed";
export type ScanWorkflowStatus = "running" | "completed" | "failed";
export type ScanWorkflowErrorCode = "scan_workflow_request_invalid" | "scan_workflow_evidence_failed" | "scan_workflow_problem_generation_failed" | "scan_workflow_problem_json_invalid" | "scan_workflow_problem_validation_failed" | "scan_workflow_problem_grounding_failed" | "scan_workflow_solution_generation_failed" | "scan_workflow_solution_json_invalid" | "scan_workflow_solution_validation_failed" | "scan_workflow_solution_grounding_failed" | "scan_workflow_problem_diagnostics_failed" | "scan_workflow_problem_calibration_failed" | "scan_workflow_solution_diagnostics_failed" | "scan_workflow_configuration_failed" | "scan_workflow_timeout" | "scan_workflow_internal_failed";
export type ScanWorkflowStageRecord = Readonly<{ stage: ScanWorkflowStage; status: "started" | "completed" | "failed"; startedAt: string; completedAt?: string; durationMs?: number; errorCode?: ScanWorkflowErrorCode }>;
export type ScanWorkflowAuthorizationContext = Readonly<{ authenticated: true; authorizationMode: "internal_user" | "design_partner" | "eligible_plan" }>;
export const TEST_SCAN_WORKFLOW_AUTHORIZATION: ScanWorkflowAuthorizationContext = Object.freeze({ authenticated: true, authorizationMode: "internal_user" });
export type ScanWorkflowSafeIntent = Readonly<{ market?: string; niche?: string; audience?: string; region?: string; description?: string }>;
export type ScanWorkflowInput = Readonly<{ intent: ScanWorkflowSafeIntent; pastedEvidence?: string; files?: readonly ScanEvidenceFileInput[]; externalSnippets?: readonly ScanExternalSnippetInput[]; discoverContext?: readonly ScanDiscoverContextInput[] }>;
export type ScanWorkflowEvidenceSummary = Readonly<{ version: typeof SCAN_EVIDENCE_INGESTION_VERSION; sourceCount: number; independentSourceCount: number; derivedSourceCount: number; sourceKindCounts: Readonly<Record<string, number>>; truncatedSourceCount: number; allowedEvidenceIds: readonly string[] }>;
export type ScanWorkflowTechnicalContext = Readonly<{ workflowVersion: typeof SCAN_WORKFLOW_VERSION; evidenceIngestionVersion: typeof SCAN_EVIDENCE_INGESTION_VERSION; problemPromptVersion: string; problemModel: string; problemValidatorVersion: string; calibrationVersion: string; solutionIntelligenceVersion: string; solutionPromptVersion: string; solutionModel: string; startedAt: string; completedAt: string; totalDurationMs: number }>;
export type ScanWorkflowResult = Readonly<{ version: typeof SCAN_WORKFLOW_VERSION; executionId: string; status: "completed"; startedAt: string; completedAt: string; intent: ScanWorkflowSafeIntent; evidence: ScanWorkflowEvidenceSummary; problemIntelligence: AnalyzeEvidenceOutput; problemDiagnostics: ScanQualityDiagnostics; problemCalibration: ScanCalibratedScore; solutionIntelligence: SolutionIntelligenceResult; solutionDiagnostics: SolutionIntelligenceDiagnostics; processingHistory: readonly ScanWorkflowStageRecord[]; technicalContext: ScanWorkflowTechnicalContext }>;
export type ScanWorkflowFailureResult = Readonly<{ version: typeof SCAN_WORKFLOW_VERSION; executionId: string; status: "failed"; startedAt: string; completedAt: string; error: Readonly<{ code: ScanWorkflowErrorCode; stage: ScanWorkflowStage; message: "The Scan workflow could not safely complete."; statusClass: string; causeCategory?: string }>; processingHistory: readonly ScanWorkflowStageRecord[] }>;
export type ScanWorkflowDependencies = Readonly<{ now(): Date; createExecutionId(): string; ingestEvidence(input: Omit<ScanWorkflowInput, "intent">): Promise<ScanEvidenceIngestionResult>; generateProblemModelOutput(input: ProblemIntelligenceServiceInput): Promise<ProblemIntelligenceModelOutput>; validateProblemModelOutput(input: ProblemIntelligenceServiceInput, modelOutput: ProblemIntelligenceModelOutput): AnalyzeEvidenceOutput; computeProblemDiagnostics(input: ProblemIntelligenceServiceInput, output: AnalyzeEvidenceOutput): ScanQualityDiagnostics; computeProblemCalibration(output: AnalyzeEvidenceOutput, diagnostics: ScanQualityDiagnostics): ScanCalibratedScore; generateSolutionModelOutput(input: SolutionIntelligenceServiceInput): Promise<SolutionIntelligenceModelOutput>; validateSolutionModelOutput(input: SolutionIntelligenceServiceInput, modelOutput: SolutionIntelligenceModelOutput): SolutionIntelligenceResult; computeSolutionDiagnostics(output: SolutionIntelligenceResult): SolutionIntelligenceDiagnostics }>;

export const defaultScanWorkflowDependencies: ScanWorkflowDependencies = Object.freeze({ now: () => new Date(), createExecutionId: () => `scan-workflow-${randomUUID()}`, ingestEvidence: (input) => ingestScanEvidence(input), generateProblemModelOutput: generateProblemIntelligenceModelOutput, validateProblemModelOutput: validateProblemIntelligenceModelOutput, computeProblemDiagnostics: computeProblemIntelligenceDiagnostics, computeProblemCalibration: computeProblemIntelligenceCalibration, generateSolutionModelOutput: generateSolutionIntelligenceModelOutput, validateSolutionModelOutput: validateSolutionIntelligenceModelOutput, computeSolutionDiagnostics: computeValidatedSolutionIntelligenceDiagnostics });

export class ScanWorkflowRecorder {
  private records: ScanWorkflowStageRecord[] = [];
  private active: { stage: ScanWorkflowStage; startedAt: Date } | null = null;
  private index = -1;
  private terminal = false;
  private readonly now: () => Date;

  constructor(now: () => Date) { this.now = now; }

  start(stage: ScanWorkflowStage) {
    if (this.terminal) throw new Error("scan workflow transition after terminal state");
    if (stage === "failed") throw new Error("failed is terminal only");
    if (this.active) throw new Error("scan workflow active stage already running");
    const next = SCAN_WORKFLOW_STAGE_ORDER.indexOf(stage as typeof SCAN_WORKFLOW_STAGE_ORDER[number]);
    if (next < 0 || next !== this.index + 1) throw new Error("scan workflow stage out of order");
    if (this.records.some((r) => r.stage === stage)) throw new Error("scan workflow duplicate stage");
    this.index = next;
    this.active = { stage, startedAt: this.now() };
  }

  complete(stage: ScanWorkflowStage) {
    if (this.terminal) throw new Error("scan workflow transition after terminal state");
    if (!this.active || this.active.stage !== stage) throw new Error("scan workflow stage completed before start");
    const completed = this.now();
    const started = this.active.startedAt;
    this.active = null;
    this.records.push(Object.freeze({ stage, status: "completed" as const, startedAt: started.toISOString(), completedAt: completed.toISOString(), durationMs: Math.max(0, completed.getTime() - started.getTime()) }));
    if (stage === "completed") this.terminal = true;
  }

  fail(stage: ScanWorkflowStage, code: ScanWorkflowErrorCode) {
    if (this.terminal) throw new Error("scan workflow transition after terminal state");
    if (!this.active || this.active.stage !== stage) throw new Error("scan workflow stage failed before start");
    const failedAt = this.now();
    const started = this.active.startedAt;
    this.active = null;
    this.records.push(Object.freeze({ stage, status: "failed" as const, startedAt: started.toISOString(), completedAt: failedAt.toISOString(), durationMs: Math.max(0, failedAt.getTime() - started.getTime()), errorCode: code }));
    this.terminal = true;
  }

  activeStage() { return this.active?.stage; }
  history() { return Object.freeze([...this.records]); }
}
const limit = (v: unknown, n: number) => typeof v === "string" ? v.trim().slice(0,n) : undefined;
export function validateScanWorkflowIntent(input: unknown): ScanWorkflowSafeIntent { if (!input || typeof input !== "object" || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) throw new ScanWorkflowError("scan_workflow_request_invalid", "input_validated", "4xx"); const r=input as Record<string, unknown>; const allowed=["market","niche","audience","region","description"]; for (const k of Object.keys(r)) if (!allowed.includes(k)) throw new ScanWorkflowError("scan_workflow_request_invalid", "input_validated", "4xx"); const out={ market:limit(r.market,120), niche:limit(r.niche,120), audience:limit(r.audience,120), region:limit(r.region,80), description:limit(r.description,600) }; if (!Object.values(out).some(Boolean)) throw new ScanWorkflowError("scan_workflow_request_invalid", "input_validated", "4xx"); return Object.freeze(Object.fromEntries(Object.entries(out).filter(([,v])=>Boolean(v))) as ScanWorkflowSafeIntent); }
export class ScanWorkflowError extends Error { readonly code: ScanWorkflowErrorCode; readonly stage: ScanWorkflowStage; readonly statusClass: string; readonly causeCategory?: string; constructor(code: ScanWorkflowErrorCode, stage: ScanWorkflowStage, statusClass: string, causeCategory?: string) { super("The Scan workflow could not safely complete."); this.name="ScanWorkflowError"; this.code=code; this.stage=stage; this.statusClass=statusClass; this.causeCategory=causeCategory; } }
function stageForProblem(kind: string) { return kind === "generation" || kind === "configuration" ? "problem_intelligence_started" : kind === "json" || kind === "validation" || kind === "grounding" ? "problem_intelligence_validated" : kind === "diagnostics" ? "problem_diagnostics_computed" : kind === "calibration" ? "problem_calibration_computed" : "problem_intelligence_started"; }
function stageForSolution(kind: string) { return kind === "generation" || kind === "configuration" ? "solution_intelligence_started" : kind === "json" || kind === "validation" || kind === "grounding" ? "solution_intelligence_validated" : kind === "diagnostics" ? "solution_diagnostics_computed" : "solution_intelligence_started"; }
function mapError(error: unknown, stage: ScanWorkflowStage): ScanWorkflowError { if (error instanceof ScanWorkflowError) return error; if (error instanceof ProblemIntelligenceServiceError) return new ScanWorkflowError(error.kind === "json" ? "scan_workflow_problem_json_invalid" : error.kind === "validation" ? "scan_workflow_problem_validation_failed" : error.kind === "grounding" ? "scan_workflow_problem_grounding_failed" : error.kind === "configuration" ? "scan_workflow_configuration_failed" : error.kind === "diagnostics" ? "scan_workflow_problem_diagnostics_failed" : error.kind === "calibration" ? "scan_workflow_problem_calibration_failed" : "scan_workflow_problem_generation_failed", stageForProblem(error.kind), error.kind === "configuration" ? "5xx" : "502", error.kind); if (error instanceof SolutionIntelligenceServiceError) return new ScanWorkflowError(error.kind === "json" ? "scan_workflow_solution_json_invalid" : error.kind === "validation" ? "scan_workflow_solution_validation_failed" : error.kind === "grounding" ? "scan_workflow_solution_grounding_failed" : error.kind === "configuration" ? "scan_workflow_configuration_failed" : error.kind === "diagnostics" ? "scan_workflow_solution_diagnostics_failed" : "scan_workflow_solution_generation_failed", stageForSolution(error.kind), error.kind === "configuration" ? "5xx" : "502", error.kind); const code = (error as { code?: ScanEvidencePublicErrorCode })?.code?.startsWith?.("scan_evidence_") ? "scan_workflow_evidence_failed" : "scan_workflow_internal_failed"; return new ScanWorkflowError(code, stage, code === "scan_workflow_evidence_failed" ? "4xx" : "5xx"); }
function evidenceSummary(r: ScanEvidenceIngestionResult): ScanWorkflowEvidenceSummary { const counts: Record<string, number> = {}; for (const item of r.evidenceItems) counts[item.sourceKind]=(counts[item.sourceKind]??0)+1; return Object.freeze({ version:r.version, sourceCount:r.totals.sourceCount, independentSourceCount:r.totals.independentSourceCount, derivedSourceCount:r.totals.derivedSourceCount, sourceKindCounts:Object.freeze(counts), truncatedSourceCount:r.totals.truncatedSourceCount, allowedEvidenceIds:Object.freeze([...r.allowedEvidenceIds]) }); }
export function buildDerivedProblemContext(output: AnalyzeEvidenceOutput) { const payload = { type:"internal_derived_problem_intelligence", version:"problem-derived-context@1", inferred_market:output.inferred_market, audience_summary:output.audience_summary, evidence_summary:output.evidence_summary, pain_points:output.pain_points, repeated_patterns:output.repeated_patterns, workflow_problems:output.workflow_problems, willingness_to_pay_signals:output.willingness_to_pay_signals, opportunity_angles:output.opportunity_angles, confidence_score:output.confidence_score }; return Object.freeze({ content: JSON.stringify(payload, Object.keys(payload).sort()).slice(0,4000) }); }
async function runStage<T>(rec: ScanWorkflowRecorder, stage: ScanWorkflowStage, work: () => Promise<T>): Promise<T> { rec.start(stage); try { const result = await work(); rec.complete(stage); return result; } catch (error) { throw mapError(error, stage); } }
function runSyncStage<T>(rec: ScanWorkflowRecorder, stage: ScanWorkflowStage, work: () => T): T { rec.start(stage); try { const result = work(); rec.complete(stage); return result; } catch (error) { throw mapError(error, stage); } }
export async function executeScanWorkflow(input: ScanWorkflowInput, authorization: ScanWorkflowAuthorizationContext, deps: ScanWorkflowDependencies = defaultScanWorkflowDependencies): Promise<ScanWorkflowResult> {
  if (authorization?.authenticated !== true) throw new ScanWorkflowError("scan_workflow_request_invalid", "authenticated", "4xx");
  const startedAt = deps.now();
  const executionId = deps.createExecutionId();
  const rec = new ScanWorkflowRecorder(deps.now);
  try {
    runSyncStage(rec, "received", () => undefined);
    runSyncStage(rec, "authenticated", () => undefined);
    const intent = runSyncStage(rec, "input_validated", () => validateScanWorkflowIntent(input.intent));
    const ing = await runStage(rec, "evidence_ingested", () => deps.ingestEvidence({ pastedEvidence: input.pastedEvidence, files: input.files, externalSnippets: input.externalSnippets, discoverContext: input.discoverContext }));
    const env = toEvidenceEnvelopeInputs(ing);
    const trusted: TrustedUserIntent = buildTrustedUserIntent({ market: intent.market ?? intent.niche, audience: intent.audience, region: intent.region });
    const problemInput: ProblemIntelligenceServiceInput = { intent: trusted, evidence: env.evidence, allowedEvidenceIds: env.allowedEvidenceIds };
    let rawProblem: ProblemIntelligenceModelOutput | undefined = await runStage(rec, "problem_intelligence_started", () => deps.generateProblemModelOutput(problemInput));
    const problemOutput = runSyncStage(rec, "problem_intelligence_validated", () => deps.validateProblemModelOutput(problemInput, rawProblem as ProblemIntelligenceModelOutput));
    rawProblem = undefined;
    const problemDiagnostics = runSyncStage(rec, "problem_diagnostics_computed", () => deps.computeProblemDiagnostics(problemInput, problemOutput));
    const problemCalibration = runSyncStage(rec, "problem_calibration_computed", () => deps.computeProblemCalibration(problemOutput, problemDiagnostics));
    const solutionInput: SolutionIntelligenceServiceInput = { intent: trusted, evidence: env.evidence, allowedEvidenceIds: env.allowedEvidenceIds, derivedProblemContext: buildDerivedProblemContext(problemOutput) };
    let rawSolution: SolutionIntelligenceModelOutput | undefined = await runStage(rec, "solution_intelligence_started", () => deps.generateSolutionModelOutput(solutionInput));
    const solutionOutput = runSyncStage(rec, "solution_intelligence_validated", () => deps.validateSolutionModelOutput(solutionInput, rawSolution as SolutionIntelligenceModelOutput));
    rawSolution = undefined;
    const solutionDiagnostics = runSyncStage(rec, "solution_diagnostics_computed", () => deps.computeSolutionDiagnostics(solutionOutput));
    runSyncStage(rec, "completed", () => undefined);
    const completedAt = deps.now();
    const problemTechnicalMetadata = problemIntelligenceTechnicalMetadata(problemInput, problemCalibration);
    const solutionTechnicalMetadata = solutionIntelligenceTechnicalMetadata(solutionInput);
    const technicalContext = Object.freeze({ workflowVersion: SCAN_WORKFLOW_VERSION, evidenceIngestionVersion: ing.version, problemPromptVersion: problemTechnicalMetadata.promptVersion, problemModel: problemTechnicalMetadata.model, problemValidatorVersion: problemTechnicalMetadata.validatorVersion, calibrationVersion: problemCalibration.version, solutionIntelligenceVersion: solutionTechnicalMetadata.solutionIntelligenceVersion, solutionPromptVersion: solutionTechnicalMetadata.promptVersion, solutionModel: solutionTechnicalMetadata.model, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), totalDurationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()) });
    return Object.freeze({ version: SCAN_WORKFLOW_VERSION, executionId, status: "completed", startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), intent, evidence: evidenceSummary(ing), problemIntelligence: problemOutput, problemDiagnostics, problemCalibration, solutionIntelligence: solutionOutput, solutionDiagnostics, processingHistory: rec.history(), technicalContext });
  } catch (e) {
    const err = mapError(e, rec.activeStage() ?? "failed");
    if (rec.activeStage()) rec.fail(rec.activeStage() as ScanWorkflowStage, err.code);
    throw Object.freeze({ version: SCAN_WORKFLOW_VERSION, executionId, status: "failed", startedAt: startedAt.toISOString(), completedAt: deps.now().toISOString(), error: Object.freeze({ code: err.code, stage: err.stage, message: "The Scan workflow could not safely complete." as const, statusClass: err.statusClass, ...(err.causeCategory ? { causeCategory: err.causeCategory } : {}) }), processingHistory: rec.history() }) satisfies ScanWorkflowFailureResult;
  }
}
export function isScanWorkflowFailure(value: unknown): value is ScanWorkflowFailureResult { return Boolean(value && typeof value === "object" && (value as { status?: unknown }).status === "failed" && (value as { version?: unknown }).version === SCAN_WORKFLOW_VERSION); }
export function scanWorkflowHttpStatusForFailure(failure: ScanWorkflowFailureResult) { if (failure.error.statusClass === "4xx") return 400; if (failure.error.statusClass === "502") return 502; if (failure.error.code === "scan_workflow_configuration_failed") return 500; return 500; }
export function buildSafeScanWorkflowLog(input: { event:string; result?: ScanWorkflowResult; failure?: ScanWorkflowFailureResult }) { const h=input.result?.processingHistory ?? input.failure?.processingHistory ?? []; const tc=input.result?.technicalContext; return Object.freeze({ event:input.event, workflowVersion:SCAN_WORKFLOW_VERSION, executionId:input.result?.executionId ?? input.failure?.executionId, status:input.result?.status ?? input.failure?.status, failedStage:input.failure?.error.stage, errorCode:input.failure?.error.code, totalDurationMs:tc?.totalDurationMs ?? h.reduce((sum,r)=>sum+(r.durationMs ?? 0),0), completedStageCount:h.filter(r=>r.status==="completed").length, evidenceSourceCount:input.result?.evidence.sourceCount, evidenceSourceKindCounts:input.result?.evidence.sourceKindCounts, independentEvidenceCount:input.result?.evidence.independentSourceCount, problemGroundingCoverage:input.result?.problemDiagnostics.qualitySummary.groundingCoverage, problemReliabilityClassification:input.result?.problemCalibration.reliabilityClassification, solutionCategoryCount:input.result?.solutionDiagnostics.categoryCount, validationReadiness:input.result?.solutionDiagnostics.validationReadiness, stageDurations:Object.freeze(Object.fromEntries(h.map(r=>[r.stage,r.durationMs ?? 0]))), problemPromptVersion:tc?.problemPromptVersion, solutionPromptVersion:tc?.solutionPromptVersion, problemModel:tc?.problemModel, solutionModel:tc?.solutionModel }); }
