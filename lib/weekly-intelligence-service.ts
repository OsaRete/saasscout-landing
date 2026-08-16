import "server-only";

import { recordOperationalEvent } from "./operational-events.ts";
import {
  buildEmptyWeeklyReport,
  collectWeeklyEvidenceFromDataMoat,
  countWeeklyEvidence,
  getWeeklyIntelligencePeriod,
  normalizeWeeklyProblemTitleKey,
  validateWeeklyModelOutput,
  type WeeklyEvidenceSource,
  type WeeklyModelOutput,
  type WeeklyPeriod,
  type WeeklyReportProblem,
  type WeeklySharedSource,
} from "./weekly-intelligence.ts";
import { buildWeeklyMonitoringRecordsFromDataMoat, selectWeeklyMonitoringTopics, type WeeklyMonitoringRecord } from "./weekly-monitoring-context.ts";
import { classifyWeeklyExternalEvidence, type WeeklyExternalCollection, type WeeklyExternalEvidence, type WeeklyExternalHistory } from "./weekly-external-evidence.ts";

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
  | "external_sources_classified"
  | "data_moat_sources_loaded"
  | "monitoring_context_selected"
  | "model_generation_started"
  | "model_generation_completed"
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
  | "weekly_source_degraded"
  | "weekly_data_moat_read_failed"
  | "weekly_provider_not_configured"
  | "weekly_provider_failed"
  | "weekly_response_empty"
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
  const message = error instanceof Error ? error.message : "";
  if (/OPENROUTER_API_KEY/.test(message)) return new WeeklyDiagnosticError("weekly_provider_not_configured", "model_generation_started", "Weekly provider is not configured.", { cause: error, weeklyExecutionId });
  if (/No AI response/.test(message)) return new WeeklyDiagnosticError("weekly_response_empty", "model_generation_completed", "Weekly provider returned an empty response.", { cause: error, weeklyExecutionId });
  if (/JSON|valid JSON/i.test(message) || error instanceof SyntaxError) return new WeeklyDiagnosticError("weekly_response_parse_failed", "model_response_parsed", "Weekly provider response could not be parsed.", { cause: error, weeklyExecutionId });
  if (/Malformed|missing source evidence|without user evidence/i.test(message)) return new WeeklyDiagnosticError("weekly_response_validation_failed", "model_response_validated", "Weekly provider response failed validation.", { cause: error, weeklyExecutionId });
  if (stage === "run_claimed" || stage === "existing_run_checked") return new WeeklyDiagnosticError("weekly_run_claim_failed", stage, "Weekly run claim failed.", { cause: error, weeklyExecutionId });
  if (stage === "data_moat_sources_loaded") return new WeeklyDiagnosticError("weekly_data_moat_read_failed", stage, "Weekly Data Moat read failed.", { cause: error, weeklyExecutionId });
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
};

export type WeeklySourceCounts = Readonly<{ currentPeriodInternalEvidenceCount: number; monitoringTopicCount: number; externalSourcesCollected: number; externalSourcesEligible: number; externalSourcesPersisted: number; externalSourcesNew: number; externalSourcesChanged: number; externalSourcesResurfaced: number; externalSourcesUnchanged: number; totalEvidenceUsed: number; sourceDegraded: boolean }>;
const emptySourceCounts = (run: Record<string, unknown> = {}): WeeklySourceCounts => ({ currentPeriodInternalEvidenceCount: 0, monitoringTopicCount: 0, externalSourcesCollected: 0, externalSourcesEligible: 0, externalSourcesPersisted: Number(run.external_sources_persisted || 0), externalSourcesNew: 0, externalSourcesChanged: 0, externalSourcesResurfaced: 0, externalSourcesUnchanged: 0, totalEvidenceUsed: Number(run.total_sources_analyzed || 0), sourceDegraded: false });

export type AuthoritativeWeeklyGenerationRepository = {
  claimRun(input: { userId: string; period: WeeklyPeriod; staleBefore: string }): Promise<WeeklyGenerationClaim>;
  getProblemsForRun(runId: string): Promise<Record<string, unknown>[]>;
  completeRun(input: { runId: string; userId: string; period: WeeklyPeriod; totalSourcesAnalyzed: number; summary: string }): Promise<Record<string, unknown>>;
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
  }) => Promise<WeeklyModelOutput>;
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
    return { success: true, status: "completed", run: claim.run, sources_saved: Number(claim.run.external_sources_persisted || 0), sourceCounts: emptySourceCounts(claim.run), problems, code: "weekly_current_period_reused", stage: "response_completed", weeklyExecutionId };
  }

  if (claim.status === "processing") {
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "processing", status: "processing", userId, durationMs: Date.now() - workflowStartedAt, safeMetadata: { runId, plan: claim.run.plan } });
    return { success: true, status: "processing", run: claim.run, sources_saved: 0, sourceCounts: emptySourceCounts(claim.run), problems: [], stage: "response_completed", weeklyExecutionId };
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
    const monitoring = selectWeeklyMonitoringTopics({
      authenticatedUserId: userId,
      periodEnd: period.period_end,
      records: [...buildWeeklyMonitoringRecordsFromDataMoat(aggregation, userId), ...priorWeeklyRecords],
    });
    logStage("monitoring_context_selected", { ...monitoring.diagnostics, currentPeriodEvidenceCount: userEvidence.length });
    const collection = dependencies.collectExternal
      ? await dependencies.collectExternal({ topics: monitoring.topics, runId, period, collectedAt: now.toISOString() })
      : { status: "no_results" as const, observations: [], metrics: { providerAttemptCount: 0, providerSuccessCount: 0, providerFailureCount: 0, providerNotConfiguredCount: 0, rawExternalResultCount: 0, normalizedExternalResultCount: 0, deduplicatedExternalCount: 0, sourceDegraded: false } };
    logStage("external_sources_collected", { ...collection.metrics, collectionStatus: collection.status });
    logStage("external_sources_normalized", { normalizedExternalResultCount: collection.metrics.normalizedExternalResultCount });
    logStage("external_sources_deduplicated", { deduplicatedExternalCount: collection.metrics.deduplicatedExternalCount });
    if ((collection.status === "unavailable" || collection.status === "not_configured") && userEvidence.length === 0 && monitoring.topics.length > 0) {
      throw new WeeklyDiagnosticError(collection.status === "not_configured" ? "weekly_provider_not_configured" : "weekly_source_collection_failed", "external_sources_collected", "Fresh external evidence collection is unavailable.", { weeklyExecutionId });
    }
    const history = dependencies.repository.loadExternalHistory ? await dependencies.repository.loadExternalHistory({ userId, beforePeriodStart: period.period_start }) : [];
    const external = classifyWeeklyExternalEvidence(collection.observations, history, period);
    const eligibleExternal = external.filter((item) => item.freshness !== "unchanged");
    const persistedExternal = dependencies.repository.persistExternalSources ? await dependencies.repository.persistExternalSources({ runId, sources: external }) : 0;
    const externalEvidence: WeeklyEvidenceSource[] = eligibleExternal.map((item) => ({ type: "external", id: item.evidenceId, title: item.title || item.canonicalUrl, summary: item.snippet || item.title || "Public external observation", created_at: item.publishedAt || item.collectedAt, provenance: `raw_external:${item.sourceProvider}:${item.freshness}` }));
    const evidenceEnvelope = [...userEvidence, ...externalEvidence];
    const sourceCounts: WeeklySourceCounts = { currentPeriodInternalEvidenceCount: userEvidence.length, monitoringTopicCount: monitoring.topics.length, externalSourcesCollected: collection.metrics.normalizedExternalResultCount, externalSourcesEligible: eligibleExternal.length, externalSourcesPersisted: persistedExternal, externalSourcesNew: external.filter((item) => item.freshness === "new" || item.freshness === "publication_unknown").length, externalSourcesChanged: external.filter((item) => item.freshness === "changed").length, externalSourcesResurfaced: external.filter((item) => item.freshness === "resurfaced").length, externalSourcesUnchanged: external.filter((item) => item.freshness === "unchanged").length, totalEvidenceUsed: evidenceEnvelope.length, sourceDegraded: collection.metrics.sourceDegraded };
    logStage("external_sources_classified", sourceCounts);
    logStage("sources_persisted", { persistedExternalCount: persistedExternal });
    logStage("data_moat_sources_loaded", { sourceCount: userEvidence.length, sharedSourceCount: sharedContext.length, priorUserContextCount: priorUserContext.length });
    const emptyEvidence = evidenceEnvelope.length === 0;
    dependencies.log?.("source_counts", { userId, period, evidenceCounts: countWeeklyEvidence(userEvidence), sharedSourceCount: sharedContext.length, emptyEvidence });

    let report;
    if (emptyEvidence) {
      report = buildEmptyWeeklyReport(period);
      if (monitoring.topics.length > 0 && (collection.status === "healthy" || collection.status === "no_results")) {
        report = { summary: `No eligible fresh external evidence was found for the monitored topics this period (${period.period_start} through ${period.period_end}). SaaSScout is not inferring market change from historical context.`, problems: [] };
      }
      logStage("model_generation_started", { skipped: true, reason: "empty_evidence" });
      logStage("model_generation_completed", { skipped: true });
      logStage("model_response_parsed", { skipped: true });
      logStage("model_response_validated", { generatedProblemCount: 0 });
    } else {
      logStage("model_generation_started");
      let modelOutput;
      try {
        modelOutput = await dependencies.analyze({ period, userEvidence: evidenceEnvelope, priorUserContext, sharedContext });
      } catch (error) {
        throw classifyWeeklyError(error, "model_generation_completed", weeklyExecutionId);
      }
      logStage("model_generation_completed");
      logStage("model_response_parsed");
      try {
        report = validateWeeklyModelOutput(modelOutput, evidenceEnvelope, priorUserContext);
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
    const completedRun = await dependencies.repository.completeRun({ runId, userId, period, totalSourcesAnalyzed: evidenceEnvelope.length, summary: report.summary });
    logStage("parent_persisted", { finalStatus: completedRun.status });
    logStage("completion_transitioned", { finalStatus: completedRun.status });
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "completed", status: "completed", userId, durationMs: Date.now() - workflowStartedAt, safeMetadata: { runId, reused: false, generatedProblems: problems.length, plan: completedRun.plan } });
    logStage("response_completed", { finalStatus: completedRun.status, generatedProblemCount: problems.length });
    return { success: true, status: claim.status, run: completedRun, sources_saved: persistedExternal, sourceCounts, problems, stage: "response_completed", weeklyExecutionId };
  } catch (error) {
    const diagnostic = classifyWeeklyError(error, currentStage, weeklyExecutionId);
    await dependencies.repository.markRunFailed({ runId, errorMessage: diagnostic.code });
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: diagnostic.stage, status: "failed", userId, requestId: weeklyExecutionId, durationMs: Date.now() - workflowStartedAt, failureCategory: diagnostic.code, safeMetadata: { runId, plan: claim.run.plan, weeklyExecutionId, entryPath, stage: diagnostic.stage, code: diagnostic.code } });
    dependencies.log?.("weekly_failed", { weeklyExecutionId, entryPath, userId, periodKey: `${period.period_start}/${period.period_end}`, existingRunId: runId, failureStage: diagnostic.stage, code: diagnostic.code, durationMs: Date.now() - workflowStartedAt });
    throw diagnostic;
  }
}
