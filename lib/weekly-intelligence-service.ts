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

export type WeeklyGenerationClaimStatus = "claimed" | "completed" | "processing" | "reclaimed";

export type WeeklyGenerationClaim = {
  status: WeeklyGenerationClaimStatus;
  run: Record<string, unknown>;
};

export type AuthoritativeWeeklyGenerationResult = {
  success: true;
  status: WeeklyGenerationClaimStatus;
  run: Record<string, unknown>;
  sources_saved: number;
  problems: Record<string, unknown>[];
};

export type AuthoritativeWeeklyGenerationRepository = {
  claimRun(input: { userId: string; period: WeeklyPeriod; staleBefore: string }): Promise<WeeklyGenerationClaim>;
  getProblemsForRun(runId: string): Promise<Record<string, unknown>[]>;
  completeRun(input: { runId: string; userId: string; period: WeeklyPeriod; totalSourcesAnalyzed: number; summary: string }): Promise<Record<string, unknown>>;
  replaceProblems(input: { runId: string; problems: WeeklyReportProblem[] }): Promise<Record<string, unknown>[]>;
  markRunFailed(input: { runId: string; errorMessage: string }): Promise<void>;
};

export type AuthoritativeWeeklyGenerationDependencies = {
  repository: AuthoritativeWeeklyGenerationRepository;
  aggregate: (userId: string) => Promise<Parameters<typeof collectWeeklyEvidenceFromDataMoat>[0] extends { aggregate: infer A } ? Awaited<ReturnType<Extract<A, (...args: never[]) => unknown>>> : never>;
  analyze: (input: {
    period: WeeklyPeriod;
    userEvidence: WeeklyEvidenceSource[];
    priorUserContext: WeeklyEvidenceSource[];
    sharedContext: WeeklySharedSource[];
  }) => Promise<WeeklyModelOutput>;
  now?: Date;
  processingTtlMs?: number;
  log?: (event: string, payload: Record<string, unknown>) => void;
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
  const staleBefore = new Date(now.getTime() - (dependencies.processingTtlMs ?? 15 * 60 * 1000)).toISOString();
  const workflowStartedAt = Date.now();
  const claim = await dependencies.repository.claimRun({ userId, period, staleBefore });
  const runId = String(claim.run.id || "");
  await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: claim.status, status: claim.status === "reclaimed" ? "claimed" : claim.status, userId, safeMetadata: { runId, plan: claim.run.plan } });

  if (claim.status === "completed") {
    const problems = await dependencies.repository.getProblemsForRun(runId);
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "reused", status: "reused", userId, durationMs: Date.now() - workflowStartedAt, safeMetadata: { runId, reused: true, generatedProblems: problems.length, plan: claim.run.plan } });
    return { success: true, status: "completed", run: claim.run, sources_saved: Number(claim.run.total_sources_analyzed || 0), problems };
  }

  if (claim.status === "processing") {
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "processing", status: "processing", userId, durationMs: Date.now() - workflowStartedAt, safeMetadata: { runId, plan: claim.run.plan } });
    return { success: true, status: "processing", run: claim.run, sources_saved: Number(claim.run.total_sources_analyzed || 0), problems: [] };
  }

  try {
    const { userEvidence, priorUserContext, sharedContext } = await collectWeeklyEvidenceFromDataMoat({
      userId,
      period,
      aggregate: dependencies.aggregate,
    });
    const emptyEvidence = userEvidence.length === 0;
    dependencies.log?.("source_counts", { userId, period, evidenceCounts: countWeeklyEvidence(userEvidence), sharedSourceCount: sharedContext.length, emptyEvidence });

    const report = emptyEvidence
      ? buildEmptyWeeklyReport(period)
      : validateWeeklyModelOutput(await dependencies.analyze({ period, userEvidence, priorUserContext, sharedContext }), userEvidence);
    const normalizedProblems = normalizeWeeklyProblemsForPersistence(report.problems);
    const completedRun = await dependencies.repository.completeRun({ runId, userId, period, totalSourcesAnalyzed: userEvidence.length, summary: report.summary });
    const problems = await dependencies.repository.replaceProblems({ runId, problems: normalizedProblems });
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "completed", status: "completed", userId, durationMs: Date.now() - workflowStartedAt, safeMetadata: { runId, reused: false, generatedProblems: problems.length, plan: completedRun.plan } });
    return { success: true, status: claim.status, run: completedRun, sources_saved: userEvidence.length, problems };
  } catch (error) {
    await dependencies.repository.markRunFailed({ runId, errorMessage: error instanceof Error ? error.message : "Unknown Weekly generation failure." });
    await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "failed", status: "failed", userId, durationMs: Date.now() - workflowStartedAt, failureCategory: error instanceof Error ? error.name : "weekly_generation_failed", safeMetadata: { runId, plan: claim.run.plan } });
    throw error;
  }
}
