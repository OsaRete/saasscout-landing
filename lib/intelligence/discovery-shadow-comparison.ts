import type { DiscoveredProblem } from "./discovery-response-normalization";
import type { DiscoveryModularPipelineResult } from "./types";

export type DiscoveryShadowParityStatus =
  | "aligned"
  | "partial"
  | "divergent"
  | "insufficient_data";

export type DiscoveryShadowComparisonMetrics = {
  legacy_problem_count: number;
  orchestrator_pain_candidate_count: number;
  orchestrator_pattern_candidate_count: number;
  orchestrator_trend_candidate_count: number;
  orchestrator_opportunity_candidate_count: number;
  orchestrator_monetization_candidate_count: number;
  orchestrator_confidence_candidate_count: number;
  orchestrator_deduplication_group_count: number;
  legacy_average_opportunity_score: number;
  orchestrator_average_opportunity_score: number;
  title_overlap_count: number;
  keyword_overlap_count: number;
  warnings_count: number;
  stages_executed: string[];
  parity_status: DiscoveryShadowParityStatus;
};

const STOP_WORDS = new Set([
  "and",
  "are",
  "but",
  "for",
  "from",
  "into",
  "the",
  "that",
  "this",
  "with",
  "without",
  "workflow",
  "workflows",
]);

function countItems<T>(items?: T[]) {
  return Array.isArray(items) ? items.length : 0;
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function tokenize(value: unknown) {
  if (typeof value !== "string") return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function normalizedTitleTokens(value: unknown) {
  return new Set(tokenize(value));
}

function keywordOverlap(legacyProblems: DiscoveredProblem[], orchestratorTitles: string[]) {
  const legacyTokens = new Set(
    legacyProblems.flatMap((problem) => [
      ...tokenize(problem.problem_title),
      ...tokenize(problem.problem_cluster),
    ])
  );
  const orchestratorTokens = new Set(orchestratorTitles.flatMap((title) => tokenize(title)));

  return [...legacyTokens].filter((token) => orchestratorTokens.has(token)).length;
}

function titleOverlap(legacyProblems: DiscoveredProblem[], orchestratorTitles: string[]) {
  const orchestratorTokenSets = orchestratorTitles.map(normalizedTitleTokens);

  return legacyProblems.filter((problem) => {
    const legacyTokens = normalizedTitleTokens(problem.problem_title);
    if (legacyTokens.size === 0) return false;

    return orchestratorTokenSets.some((orchestratorTokens) => {
      const overlap = [...legacyTokens].filter((token) => orchestratorTokens.has(token)).length;
      return overlap >= Math.min(2, legacyTokens.size);
    });
  }).length;
}

function calculateParityStatus({
  legacyProblemCount,
  orchestratorOpportunityCount,
  titleOverlapCount,
  keywordOverlapCount,
}: {
  legacyProblemCount: number;
  orchestratorOpportunityCount: number;
  titleOverlapCount: number;
  keywordOverlapCount: number;
}): DiscoveryShadowParityStatus {
  if (legacyProblemCount === 0 || orchestratorOpportunityCount === 0) {
    return "insufficient_data";
  }

  const countRatio = Math.min(legacyProblemCount, orchestratorOpportunityCount) / Math.max(legacyProblemCount, orchestratorOpportunityCount);
  const overlapRatio = titleOverlapCount / legacyProblemCount;

  if (countRatio >= 0.75 && (overlapRatio >= 0.5 || keywordOverlapCount >= 3)) {
    return "aligned";
  }

  if (countRatio >= 0.4 || overlapRatio > 0 || keywordOverlapCount > 0) {
    return "partial";
  }

  return "divergent";
}

export function buildDiscoveryShadowComparisonMetrics({
  legacyProblems,
  orchestratorResult,
}: {
  legacyProblems: DiscoveredProblem[];
  orchestratorResult: DiscoveryModularPipelineResult;
}): DiscoveryShadowComparisonMetrics {
  const opportunityCandidates = orchestratorResult.outputs.opportunityDetection?.candidates || [];
  const orchestratorTitles = opportunityCandidates.map((candidate) => candidate.normalizedTitle || candidate.title);
  const legacyProblemCount = countItems(legacyProblems);
  const orchestratorOpportunityCount = countItems(opportunityCandidates);
  const titleOverlapCount = titleOverlap(legacyProblems, orchestratorTitles);
  const keywordOverlapCount = keywordOverlap(legacyProblems, orchestratorTitles);

  return {
    legacy_problem_count: legacyProblemCount,
    orchestrator_pain_candidate_count: countItems(orchestratorResult.outputs.painDetection?.candidates),
    orchestrator_pattern_candidate_count: countItems(orchestratorResult.outputs.patternDetection?.candidates),
    orchestrator_trend_candidate_count: countItems(orchestratorResult.outputs.trendDetection?.candidates),
    orchestrator_opportunity_candidate_count: orchestratorOpportunityCount,
    orchestrator_monetization_candidate_count: countItems(orchestratorResult.outputs.monetizationEvaluation?.candidates),
    orchestrator_confidence_candidate_count: countItems(orchestratorResult.outputs.confidenceEvaluation?.candidates),
    orchestrator_deduplication_group_count: orchestratorResult.outputs.semanticProblemDeduplication?.summary.groupCount || 0,
    legacy_average_opportunity_score: average(legacyProblems.map((problem) => Number(problem.opportunity_score)).filter(Number.isFinite)),
    orchestrator_average_opportunity_score: average(opportunityCandidates.map((candidate) => Number(candidate.score?.totalScore)).filter(Number.isFinite)),
    title_overlap_count: titleOverlapCount,
    keyword_overlap_count: keywordOverlapCount,
    warnings_count: orchestratorResult.warnings.length,
    stages_executed: orchestratorResult.diagnostics.filter((diagnostic) => diagnostic.status === "completed").map((diagnostic) => diagnostic.stage),
    parity_status: calculateParityStatus({ legacyProblemCount, orchestratorOpportunityCount, titleOverlapCount, keywordOverlapCount }),
  };
}
