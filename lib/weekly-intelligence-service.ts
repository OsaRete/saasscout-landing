import "server-only";

import { recordOperationalEvent } from "./operational-events.ts";
import {
  buildEmptyWeeklyReport,
  collectWeeklyEvidenceFromDataMoat,
  getWeeklyIntelligencePeriod,
  normalizeWeeklyProblemTitleKey,
  selectWeeklyModelEvidence,
  validateWeeklyModelOutput,
  type WeeklyEvidenceSource,
  type WeeklyExecutionMode,
  type WeeklyModelOutput,
  type WeeklyPeriod,
  type WeeklyReportProblem,
  type WeeklySharedSource,
} from "./weekly-intelligence.ts";
import { buildWeeklyMonitoringRecordsFromDataMoat, selectWeeklyMonitoringTopics, type WeeklyMonitoringRecord } from "./weekly-monitoring-context.ts";
import { classifyWeeklyExternalEvidence, type WeeklyExternalCollection, type WeeklyExternalEvidence, type WeeklyExternalHistory } from "./weekly-external-evidence.ts";
import { WeeklyModelResponseError, type WeeklyModelParserStrategy } from "./weekly-model-output.ts";

export type WeeklyGenerationClaimStatus = "claimed" | "completed" | "processing" | "reclaimed";

export type WeeklyEntryPath = "button" | "cron";

export type WeeklyDiagnosticStage =
  | "received"
  | "authenticated"
  | "capability_checked"
  | "period_resolved"
  | "existing_run_checked"
  | "run_claimed"
  | "external_sources_collected"
  | "external_sources_normalized"
  | "external_sources_deduplicated"
  | "external_history_loading_started"
  | "external_history_loaded"
  | "external_sources_classified"
  | "data_moat_sources_loaded"
  | "monitoring_context_selected"
  | "model_generation_started"
  | "model_generation_completed"
  | "model_response_extracted"
  | "model_response_parsed"
  | "model_response_validated"
  | "parent_persisted"
  | "sources_persisted"
  | "problems_persisted"
  | "data_moat_updated"
  | "completion_transitioned"
  | "response_completed";

export type WeeklyDiagnosticCode =
  | "weekly_authentication_failed"
  | "weekly_profile_unavailable"
  | "weekly_capability_denied"
  | "weekly_period_resolution_failed"
  | "weekly_existing_run_lookup_failed"
  | "weekly_current_period_reused"
  | "weekly_run_claim_failed"
  | "weekly_source_collection_failed"
  | "weekly_external_history_read_failed"
  | "weekly_source_degraded"
  | "weekly_data_moat_read_failed"
  | "weekly_provider_not_configured"
  | "weekly_provider_failed"
  | "weekly_response_empty"
  | "weekly_response_truncated"
  | "weekly_response_parse_failed"
  | "weekly_response_validation_failed"
  | "weekly_parent_persistence_failed"
  | "weekly_source_persistence_failed"
  | "weekly_problem_persistence_failed"
  | "weekly_data_moat_update_failed"
  | "weekly_completion_failed"
  | "weekly_schedule_unauthorized"
  | "weekly_schedule_configuration_invalid"
  | "weekly_recipient_selection_failed"
  | "weekly_partial_recipient_failure"
  | "weekly_unexpected_failure";

export class WeeklyDiagnosticError extends Error {
  code: WeeklyDiagnosticCode;
  stage: WeeklyDiagnosticStage;
  weeklyExecutionId?: string;
  cause?: unknown;

  constructor(code: WeeklyDiagnosticCode, stage: WeeklyDiagnosticStage, message: string, options?: { cause?: unknown; weeklyExecutionId?: string }) {
    super(message);
    this.name = "WeeklyDiagnosticError";
    this.code = code;
    this.stage = stage;
    this.weeklyExecutionId = options?.weeklyExecutionId;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function createWeeklyExecutionId() {
  return `weekly_${crypto.randomUUID()}`;
}

export function getWeeklyDiagnostic(error: unknown, fallbackStage: WeeklyDiagnosticStage, weeklyExecutionId?: string) {
  if (error instanceof WeeklyDiagnosticError) {
    return { code: error.code, stage: error.stage, weeklyExecutionId: error.weeklyExecutionId || weeklyExecutionId };
  }
  return { code: "weekly_unexpected_failure" as const, stage: fallbackStage, weeklyExecutionId };
}

function classifyWeeklyError(error: unknown, stage: WeeklyDiagnosticStage, weeklyExecutionId: string): WeeklyDiagnosticError {
  if (error instanceof WeeklyDiagnosticError) return error;
  if (error instanceof WeeklyModelResponseError) {
    const responseStage = error.code === "weekly_response_parse_failed" ? "model_response_parsed" : "model_generation_completed";
    return new WeeklyDiagnosticError(error.code, responseStage, "Weekly provider response did not satisfy the model output contract.", { cause: error, weeklyExecutionId });
  }
  const message = error instanceof Error ? error.message : "";
  if (/OPENROUTER_API_KEY/.test(message)) return new WeeklyDiagnosticError("weekly_provider_not_configured", "model_generation_started", "Weekly provider is not configured.", { cause: error, weeklyExecutionId });
  if (/No AI response/.test(message)) return new WeeklyDiagnosticError("weekly_response_empty", "model_generation_completed", "Weekly provider returned an empty response.", { cause: error, weeklyExecutionId });
  if (/JSON|valid JSON/i.test(message) || error instanceof SyntaxError) return new WeeklyDiagnosticError("weekly_response_parse_failed", "model_response_parsed", "Weekly provider response could not be parsed.", { cause: error, weeklyExecutionId });
  if (/Malformed|missing source evidence|without user evidence/i.test(message)) return new WeeklyDiagnosticError("weekly_response_validation_failed", "model_response_validated", "Weekly provider response failed validation.", { cause: error, weeklyExecutionId });
  if (stage === "run_claimed" || stage === "existing_run_checked") return new WeeklyDiagnosticError("weekly_run_claim_failed", stage, "Weekly run claim failed.", { cause: error, weeklyExecutionId });
  if (stage === "data_moat_sources_loaded") return new WeeklyDiagnosticError("weekly_data_moat_read_failed", stage, "Weekly Data Moat read failed.", { cause: error, weeklyExecutionId });
  if (stage === "external_history_loading_started") return new WeeklyDiagnosticError("weekly_external_history_read_failed", stage, "Weekly external history read failed.", { cause: error, weeklyExecutionId });
  if (stage === "sources_persisted") return new WeeklyDiagnosticError("weekly_source_persistence_failed", stage, "Weekly source persistence failed.", { cause: error, weeklyExecutionId });
  if (stage === "problems_persisted") return new WeeklyDiagnosticError("weekly_problem_persistence_failed", stage, "Weekly problem persistence failed.", { cause: error, weeklyExecutionId });
  if (stage === "completion_transitioned") return new WeeklyDiagnosticError("weekly_completion_failed", stage, "Weekly completion transition failed.", { cause: error, weeklyExecutionId });
  if (stage === "model_generation_completed") return new WeeklyDiagnosticError("weekly_provider_failed", stage, "Weekly provider request failed.", { cause: error, weeklyExecutionId });
  return new WeeklyDiagnosticError("weekly_unexpected_failure", stage, "Weekly generation failed unexpectedly.", { cause: error, weeklyExecutionId });
}


export type WeeklyGenerationClaim = {
  status: WeeklyGenerationClaimStatus;
  run: Record<string, unknown>;
};

export type AuthoritativeWeeklyGenerationResult = {
  success: true;
  status: WeeklyGenerationClaimStatus;
  run: Record<string, unknown>;
  sources_saved: number;
  sourceCounts: WeeklySourceCounts;
  problems: Record<string, unknown>[];
  code?: WeeklyDiagnosticCode;
  stage?: WeeklyDiagnosticStage;
  weeklyExecutionId?: string;
  executionMode: WeeklyExecutionMode | null;
  providerState: WeeklyExternalCollection["status"] | null;
  reused: boolean;
};

export type WeeklySourceCounts = Readonly<{ currentPeriodInternalEvidenceCount: number; eligibleExternalEvidenceCount: number; historicalContextCount: number; monitoringTopicCount: number; externalSourcesCollected: number; externalSourcesEligible: number; externalSourcesPersisted: number; externalSourcesNew: number; externalSourcesChanged: number; externalSourcesResurfaced: number; externalSourcesUnchanged: number; totalEvidenceUsed: number; sourceDegraded: boolean }>;
const emptySourceCounts = (run: Record<string, unknown> = {}): WeeklySourceCounts => ({ currentPeriodInternalEvidenceCount: 0, eligibleExternalEvidenceCount: 0, historicalContextCount: 0, monitoringTopicCount: 0, externalSourcesCollected: 0, externalSourcesEligible: 0, externalSourcesPersisted: Number(run.external_sources_persisted || 0), externalSourcesNew: 0, externalSourcesChanged: 0, externalSourcesResurfaced: 0, externalSourcesUnchanged: 0, totalEvidenceUsed: Number(run.total_sources_analyzed || 0), sourceDegraded: false });

export function deriveWeeklyExecutionMode(input: { usableFreshExternalCount: number; currentInternalCount: number; trustworthyHistoricalContextCount: number }): WeeklyExecutionMode {
  const hasFresh = input.usableFreshExternalCount > 0;
  const hasContext = input.currentInternalCount > 0 || input.trustworthyHistoricalContextCount > 0;
  if (hasFresh) return hasContext ? "mixed" : "fresh_market";
  return hasContext ? "data_moat_fallback" : "insufficient_context";
}

export type AuthoritativeWeeklyGenerationRepository = {
  claimRun(input: { userId: string; period: WeeklyPeriod; staleBefore: string }): Promise<WeeklyGenerationClaim>;
  getProblemsForRun(runId: string): Promise<Record<string, unknown>[]>;
  completeRun(input: { runId: string; userId: string; period: WeeklyPeriod; totalSourcesAnalyzed: number; summary: string; executionMode: WeeklyExecutionMode; providerState: WeeklyExternalCollection["status"]; externalSourcesPersisted: number; sourceDegraded: boolean }): Promise<Record<string, unknown>>;
  replaceProblems(input: { runId: string; problems: WeeklyReportProblem[] }): Promise<Record<string, unknown>[]>;
  markRunFailed(input: { runId: string; errorMessage: string }): Promise<void>;
  loadExternalHistory?(input: { userId: string; beforePeriodStart: string }): Promise<WeeklyExternalHistory[]>;
  persistExternalSources?(input: { runId: string; sources: WeeklyExternalEvidence[] }): Promise<number>;
};

export type AuthoritativeWeeklyGenerationDependencies = {
  repository: AuthoritativeWeeklyGenerationRepository;
  aggregate: (userId: string) => Promise<Parameters<typeof collectWeeklyEvidenceFromDataMoat>[0] extends { aggregate: infer A } ? Awaited<ReturnType<Extract<A, (...args: never[]) => unknown>>> : never>;
  loadPriorWeeklyMonitoringRecords?: (userId: string, period: WeeklyPeriod) => Promise<WeeklyMonitoringRecord[]>;
  collectExternal?: (input: { topics: ReturnType<typeof selectWeeklyMonitoringTopics>["topics"]; runId: string; period: WeeklyPeriod; collectedAt: string }) => Promise<WeeklyExternalCollection>;
  analyze: (input: {
    period: WeeklyPeriod;
    userEvidence: WeeklyEvidenceSource[];
    priorUserContext: WeeklyEvidenceSource[];
    sharedContext: WeeklySharedSource[];
    executionMode: WeeklyExecutionMode;
  }) => Promise<WeeklyModelOutput | { modelOutput: WeeklyModelOutput; responseMetadata: { responseContentPresent: boolean; responseContentLength: number; finishReason: string; responseFormatRequested: boolean; parserStrategy: WeeklyModelParserStrategy; parseAttemptCount: number; promptCharacterCount?: number; promptApproxTokenCount?: number; maxOutputTokens?: number; requestedProblemCount?: number } }>;
  now?: Date;
  processingTtlMs?: number;
  log?: (event: string, payload: Record<string, unknown>) => void;
  weeklyExecutionId?: string;
  entryPath?: WeeklyEntryPath;
};

export function normalizeWeeklyProblemsForPersistence(problems: WeeklyReportProblem[]) {
  const byTitleKey = new Map<string, WeeklyReportProblem>();

  for (const problem of problems) {
    const titleKey = normalizeWeeklyProblemTitleKey(problem.problem_title);
    if (!titleKey) continue;
    if (!byTitleKey.has(titleKey)) byTitleKey.set(titleKey, { ...problem, problem_title: problem.problem_title.trim().replace(/\s+/g, " ") });
  }

  return Array.from(byTitleKey.values()).sort((a, b) => normalizeWeeklyProblemTitleKey(a.problem_title).localeCompare(normalizeWeeklyProblemTitleKey(b.problem_title)));
}

export async function runAuthoritativeWeeklyGenerationForUser({
  userId,
  period = getWeeklyIntelligencePeriod(),
  dependencies,
}: {
  userId: string;
  period?: WeeklyPeriod;
  dependencies: AuthoritativeWeeklyGenerationDependencies;
}): Promise<AuthoritativeWeeklyGenerationResult> {
  const now = dependencies.now || new Date();
  const weeklyExecutionId = dependencies.weeklyExecutionId || createWeeklyExecutionId();
  const entryPath = dependencies.entryPath || "button";
  let currentStage: WeeklyDiagnosticStage = "received";
  const stageStartedAt = new Map<WeeklyDiagnosticStage, number>();
  const stageDurationsMs: Partial<Record<WeeklyDiagnosticStage, number>> = {};
  const logStage = (stage: WeeklyDiagnosticStage, payload: Record<string, unknown> = {}) => {
    currentStage = stage;
    const started = stageStartedAt.get(stage) || Date.now();
    stageStartedAt.set(stage, started);
    stageDurationsMs[stage] = Date.now() - started;
    dependencies.log?.(stage, { weeklyExecutionId, entryPath, userId, periodKey: `${period.period_start}/${period.period_end}`, stage, stageDurationsMs, ...payload });
  };
  logStage("received");
  const staleBefore = new Date(now.getTime() - (dependencies.processingTtlMs ?? 15 * 60 * 1000)).toISOString();
  const workflowStartedAt = Date.now();
  let claim: WeeklyGenerationClaim;
  try {
    currentStage = "run_claimed";
    claim = await dependencies.repository.claimRun({ userId, period, staleBefore });
  } catch (error) {
    throw classifyWeeklyError(error, "run_claimed", weeklyExecutionId);
  }
  const runId = String(claim.run.id || "");
  logStage("existing_run_checked", { existingRunId: runId, existingStatus: claim.status });
  logStage("run_claimed", { existingRunId: runId, existingStatus: claim.status });
  await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: claim.status, status: claim.status === "reclaimed" ? "claimed" : claim.status, userId, safeMetadata: { runId, plan: claim.run.plan } });

  if (claim.status === "completed") {
    const problems = await dependencies.repository.getProblemsForRun(runId);
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "reused", status: "reused", userId, durationMs: Date.now() - workflowStartedAt, safeMetadata: { runId, reused: true, generatedProblems: problems.length, plan: claim.run.plan } });
    return { success: true, status: "completed", run: claim.run, sources_saved: Number(claim.run.external_sources_persisted || 0), sourceCounts: emptySourceCounts(claim.run), problems, code: "weekly_current_period_reused", stage: "response_completed", weeklyExecutionId, executionMode: (claim.run.execution_mode as WeeklyExecutionMode) || null, providerState: (claim.run.external_provider_state as WeeklyExternalCollection["status"]) || null, reused: true };
  }

  if (claim.status === "processing") {
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "processing", status: "processing", userId, durationMs: Date.now() - workflowStartedAt, safeMetadata: { runId, plan: claim.run.plan } });
    return { success: true, status: "processing", run: claim.run, sources_saved: 0, sourceCounts: emptySourceCounts(claim.run), problems: [], stage: "response_completed", weeklyExecutionId, executionMode: null, providerState: null, reused: false };
  }

  try {
    currentStage = "data_moat_sources_loaded";
    const { aggregation, userEvidence, priorUserContext, sharedContext } = await collectWeeklyEvidenceFromDataMoat({
      userId,
      period,
      aggregate: dependencies.aggregate,
    });
    const priorWeeklyRecords = dependencies.loadPriorWeeklyMonitoringRecords
      ? await dependencies.loadPriorWeeklyMonitoringRecords(userId, period)
      : [];
    const historicalMonitoringRecords = [...buildWeeklyMonitoringRecordsFromDataMoat(aggregation, userId), ...priorWeeklyRecords]
      .filter((record) => record.occurredAt < period.period_start);
    const monitoring = selectWeeklyMonitoringTopics({
      authenticatedUserId: userId,
      periodEnd: period.period_end,
      records: historicalMonitoringRecords,
    });
    logStage("monitoring_context_selected", { ...monitoring.diagnostics, currentPeriodEvidenceCount: userEvidence.length });
    const collection = dependencies.collectExternal
      ? await dependencies.collectExternal({ topics: monitoring.topics, runId, period, collectedAt: now.toISOString() })
      : { status: "no_results" as const, observations: [], metrics: { providerAttemptCount: 0, providerSuccessCount: 0, providerFailureCount: 0, providerNotConfiguredCount: 0, rawExternalResultCount: 0, normalizedExternalResultCount: 0, deduplicatedExternalCount: 0, sourceDegraded: false } };
    logStage("external_sources_collected", { ...collection.metrics, collectionStatus: collection.status });
    logStage("external_sources_normalized", { normalizedExternalResultCount: collection.metrics.normalizedExternalResultCount });
    logStage("external_sources_deduplicated", { deduplicatedExternalCount: collection.metrics.deduplicatedExternalCount });
    logStage("external_history_loading_started");
    const history = dependencies.repository.loadExternalHistory ? await dependencies.repository.loadExternalHistory({ userId, beforePeriodStart: period.period_start }) : [];
    logStage("external_history_loaded", { historicalSourceCount: history.length });
    const external = classifyWeeklyExternalEvidence(collection.observations, history, period);
    const eligibleExternal = external.filter((item) => item.freshness !== "unchanged");
    const sourceCountsBeforePersistence = { externalSourcesCollected: collection.metrics.normalizedExternalResultCount, externalSourcesEligible: eligibleExternal.length, externalSourcesNew: external.filter((item) => item.freshness === "new" || item.freshness === "publication_unknown").length, externalSourcesChanged: external.filter((item) => item.freshness === "changed").length, externalSourcesResurfaced: external.filter((item) => item.freshness === "resurfaced").length, externalSourcesUnchanged: external.filter((item) => item.freshness === "unchanged").length };
    logStage("external_sources_classified", sourceCountsBeforePersistence);
    const historicalContext: WeeklyEvidenceSource[] = monitoring.topics.map((topic) => ({
      type: "historical_context",
      id: `weekly_context_${topic.fingerprint}`,
      title: topic.title,
      summary: topic.problemSummary || `Previously grounded owner context for ${topic.market || "this market"}.`,
      created_at: topic.latestObservedAt,
      provenance: "owner_scoped_historical_context",
    }));
    let persistedExternal = 0;
    let usableExternal = eligibleExternal;
    let persistenceDegraded = false;
    currentStage = "sources_persisted";
    try {
      persistedExternal = dependencies.repository.persistExternalSources ? await dependencies.repository.persistExternalSources({ runId, sources: external }) : 0;
      if (external.length > 0 && persistedExternal !== external.length) throw new Error("Persisted external source count mismatch.");
    } catch (error) {
      if (historicalContext.length === 0 && userEvidence.length === 0) throw error;
      usableExternal = [];
      persistenceDegraded = true;
      dependencies.log?.("external_persistence_fallback", { weeklyExecutionId, runId, periodKey: `${period.period_start}/${period.period_end}`, attemptedRowCount: external.length, persistedRowCount: persistedExternal, operation: "weekly_external_sources_upsert", conflictTarget: "run_id,evidence_id" });
    }
    const monitoringTopicLabels = new Map(monitoring.topics.map((topic) => [topic.fingerprint, [topic.title, topic.market, topic.niche].filter(Boolean).join(" / ")]));
    const externalEvidence: WeeklyEvidenceSource[] = usableExternal.map((item) => ({ type: "external", id: item.evidenceId, title: item.title || "Public external observation", summary: item.snippet || item.title || "Public external observation", created_at: item.publishedAt || item.collectedAt, provenance: `raw_external:${item.sourceProvider}:${item.freshness}`, monitoring_topic: monitoringTopicLabels.get(item.monitoringTopicFingerprint) || item.monitoringTopicFingerprint, source_type: item.sourceType, freshness: item.freshness, published_at: item.publishedAt }));
    const executionMode = deriveWeeklyExecutionMode({ usableFreshExternalCount: externalEvidence.length, currentInternalCount: userEvidence.length, trustworthyHistoricalContextCount: historicalContext.length });
    const availableEvidenceEnvelope = executionMode === "data_moat_fallback" ? [...userEvidence, ...historicalContext] : executionMode === "insufficient_context" ? [] : [...userEvidence, ...externalEvidence];
    const evidenceEnvelope = selectWeeklyModelEvidence(availableEvidenceEnvelope);
    const sourceCounts: WeeklySourceCounts = { currentPeriodInternalEvidenceCount: userEvidence.length, eligibleExternalEvidenceCount: externalEvidence.length, historicalContextCount: historicalContext.length, monitoringTopicCount: monitoring.topics.length, externalSourcesCollected: collection.metrics.normalizedExternalResultCount, externalSourcesEligible: usableExternal.length, externalSourcesPersisted: persistedExternal, externalSourcesNew: external.filter((item) => item.freshness === "new" || item.freshness === "publication_unknown").length, externalSourcesChanged: external.filter((item) => item.freshness === "changed").length, externalSourcesResurfaced: external.filter((item) => item.freshness === "resurfaced").length, externalSourcesUnchanged: external.filter((item) => item.freshness === "unchanged").length, totalEvidenceUsed: evidenceEnvelope.length, sourceDegraded: collection.metrics.sourceDegraded || persistenceDegraded };
    logStage("sources_persisted", { persistedExternalCount: persistedExternal });
    logStage("data_moat_sources_loaded", { currentPeriodInternalEvidenceCount: userEvidence.length, sharedSourceCount: sharedContext.length, priorUserContextCount: priorUserContext.length });
    const emptyEvidence = evidenceEnvelope.length === 0;
    dependencies.log?.("source_counts", { currentPeriodInternalEvidenceCount: sourceCounts.currentPeriodInternalEvidenceCount, eligibleExternalEvidenceCount: sourceCounts.eligibleExternalEvidenceCount, historicalContextCount: sourceCounts.historicalContextCount, totalEvidenceUsed: sourceCounts.totalEvidenceUsed, sharedSourceCount: sharedContext.length, emptyEvidence });
    const selectedExternalEvidenceCount = evidenceEnvelope.filter((item) => item.type === "external").length;
    dependencies.log?.("model_evidence_selected", { modelEvidenceAvailableCount: availableEvidenceEnvelope.length, modelEvidenceSelectedCount: evidenceEnvelope.length, modelEvidenceOmittedCount: availableEvidenceEnvelope.length - evidenceEnvelope.length, availableExternalEvidenceCount: externalEvidence.length, selectedExternalEvidenceCount, omittedExternalEvidenceCount: externalEvidence.length - selectedExternalEvidenceCount, selectedMonitoringTopicCount: new Set(evidenceEnvelope.filter((item) => item.type === "external").map((item) => item.monitoring_topic)).size, historicalContextSelectedCount: evidenceEnvelope.filter((item) => item.type === "historical_context").length, totalEvidenceUsed: evidenceEnvelope.length });

    let report;
    if (emptyEvidence) {
      report = buildEmptyWeeklyReport(period);
      if (monitoring.topics.length > 0 && (collection.status === "healthy" || collection.status === "no_results")) {
        report = { summary: `No eligible fresh external evidence was found for the monitored topics this period (${period.period_start} through ${period.period_end}). SaaSScout is not inferring market change from historical context.`, problems: [] };
      }
      logStage("model_generation_started", { skipped: true, reason: "empty_evidence" });
      logStage("model_generation_completed", { skipped: true });
      logStage("model_response_extracted", { skipped: true });
      logStage("model_response_parsed", { skipped: true });
      logStage("model_response_validated", { generatedProblemCount: 0 });
    } else {
      logStage("model_generation_started");
      let modelOutput;
      try {
        modelOutput = await dependencies.analyze({ period, userEvidence: evidenceEnvelope, priorUserContext, sharedContext, executionMode });
      } catch (error) {
        throw classifyWeeklyError(error, "model_generation_completed", weeklyExecutionId);
      }
      const generated = "modelOutput" in modelOutput ? modelOutput : { modelOutput, responseMetadata: undefined };
      logStage("model_generation_completed", generated.responseMetadata || {});
      logStage("model_response_extracted", generated.responseMetadata || {});
      logStage("model_response_parsed", generated.responseMetadata || {});
      try {
        report = validateWeeklyModelOutput(generated.modelOutput, evidenceEnvelope, priorUserContext, executionMode);
      } catch (error) {
        throw classifyWeeklyError(error, "model_response_validated", weeklyExecutionId);
      }
      logStage("model_response_validated", { generatedProblemCount: report.problems.length });
    }
    const normalizedProblems = normalizeWeeklyProblemsForPersistence(report.problems);
    currentStage = "problems_persisted";
    const problems = await dependencies.repository.replaceProblems({ runId, problems: normalizedProblems });
    logStage("problems_persisted", { problemsPersisted: problems.length });
    logStage("data_moat_updated", { generatedProblemCount: problems.length });
    currentStage = "completion_transitioned";
    const completedRun = await dependencies.repository.completeRun({ runId, userId, period, totalSourcesAnalyzed: evidenceEnvelope.length, summary: report.summary, executionMode, providerState: collection.status, externalSourcesPersisted: persistedExternal, sourceDegraded: sourceCounts.sourceDegraded });
    logStage("parent_persisted", { finalStatus: completedRun.status });
    logStage("completion_transitioned", { finalStatus: completedRun.status });
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "completed", status: "completed", userId, durationMs: Date.now() - workflowStartedAt, safeMetadata: { runId, reused: false, generatedProblems: problems.length, plan: completedRun.plan } });
    logStage("response_completed", { finalStatus: completedRun.status, generatedProblemCount: problems.length });
    return { success: true, status: claim.status, run: completedRun, sources_saved: persistedExternal, sourceCounts, problems, stage: "response_completed", weeklyExecutionId, executionMode, providerState: collection.status, reused: false };
  } catch (error) {
    const diagnostic = classifyWeeklyError(error, currentStage, weeklyExecutionId);
    await dependencies.repository.markRunFailed({ runId, errorMessage: diagnostic.code });
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: diagnostic.stage, status: "failed", userId, requestId: weeklyExecutionId, durationMs: Date.now() - workflowStartedAt, failureCategory: diagnostic.code, safeMetadata: { runId, plan: claim.run.plan, weeklyExecutionId, entryPath, stage: diagnostic.stage, code: diagnostic.code } });
    dependencies.log?.("weekly_failed", { weeklyExecutionId, entryPath, userId, periodKey: `${period.period_start}/${period.period_end}`, existingRunId: runId, failureStage: diagnostic.stage, code: diagnostic.code, durationMs: Date.now() - workflowStartedAt });
    throw diagnostic;
  }
}
