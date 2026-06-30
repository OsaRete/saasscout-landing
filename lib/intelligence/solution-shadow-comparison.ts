import type { SolutionCategory, SolutionIntelligenceResult } from "../engines/solution";
import type { DiscoveredProblem } from "./discovery-response-normalization";
import type { ProblemSynthesisResult } from "./problem-synthesis";
import type { DiscoveryModularPipelineResult } from "./types";

export type SolutionShadowComparisonMetrics = {
  legacySolutionCount: number;
  legacyProblemCount: number;
  problemSynthesisCandidateCount: number;
  problemTitleOverlapCount: number;
  problemSummaryOverlapCount: number;
  evaluatedCategoryCount: number;
  recommendedCategory: SolutionCategory | null;
  recommendedCategoryConfidence: number;
  saasSelected: boolean;
  nonSaasSelected: boolean;
  saasBiasDetected: boolean;
  categoryCoverageScore: number;
  evidenceSupportScore: number;
  recommendationConfidenceScore: number;
  rejectedCategoryReasonCoverage: number;
  missingEvidenceCount: number;
  lowConfidenceReasonCount: number;
  disagreementCount: number;
  warnings: string[];
};

const SAAS_CATEGORY: SolutionCategory = "saas_software";
const ALL_CATEGORY_COUNT = 13;
const CONFIDENT_RECOMMENDATION_THRESHOLD = 6.2;

const SAAS_TERMS = ["saas", "software", "platform", "dashboard", "app", "tool", "portal", "crm", "system"];
const STOP_WORDS = new Set(["and", "are", "for", "from", "into", "that", "the", "this", "with", "without"]);

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function normalizeText(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function splitLegacySolutions(value: string | null | undefined) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSaasLikeSolution(value: string) {
  const normalized = normalizeText(value);
  return SAAS_TERMS.some((term) => normalized.includes(term));
}

function tokenize(value: unknown) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function countOverlappingProblemFields({
  legacyProblems,
  synthesis,
  legacyField,
  synthesisField,
}: {
  legacyProblems: DiscoveredProblem[];
  synthesis?: ProblemSynthesisResult;
  legacyField: "problem_title" | "problem_summary";
  synthesisField: "synthesizedProblemTitle" | "synthesizedSummary";
}) {
  const synthesisTokenSets = (synthesis?.candidates || []).map((candidate) => new Set(tokenize(candidate[synthesisField])));
  if (synthesisTokenSets.length === 0) return 0;

  return legacyProblems.filter((problem) => {
    const legacyTokens = tokenize(problem[legacyField]);
    if (legacyTokens.length === 0) return false;
    return synthesisTokenSets.some((synthesisTokens) => legacyTokens.some((token) => synthesisTokens.has(token)));
  }).length;
}

function countRejectedCategoriesWithReasons(result?: SolutionIntelligenceResult) {
  return (result?.rejectedCategories || []).filter((category) => category.rejectedReasons.length > 0 || category.rationale.length > 0).length;
}

function getRecommendationConfidence(result?: SolutionIntelligenceResult) {
  return roundMetric(result?.recommendation?.evaluation?.scoreBreakdown.confidenceScore || 0);
}

function getRecommendedCategory(result?: SolutionIntelligenceResult) {
  return result?.recommendation?.recommendedCategory || result?.diagnostics.recommendedCategory || null;
}

function buildWarnings({
  legacySolutionCount,
  synthesisCandidateCount,
  evaluatedCategoryCount,
  recommendedCategory,
  solutionResult,
}: {
  legacySolutionCount: number;
  synthesisCandidateCount: number;
  evaluatedCategoryCount: number;
  recommendedCategory: SolutionCategory | null;
  solutionResult?: SolutionIntelligenceResult;
}) {
  const warnings = new Set<string>();
  if (legacySolutionCount === 0) warnings.add("No legacy suggested solutions were available for shadow comparison.");
  if (synthesisCandidateCount === 0) warnings.add("No Problem Synthesis candidates were available for shadow comparison.");
  if (evaluatedCategoryCount === 0) warnings.add("Solution Intelligence did not evaluate any categories.");
  if (!recommendedCategory) warnings.add("Solution Intelligence did not produce a recommended category.");
  for (const warning of solutionResult?.warnings || []) warnings.add(warning);
  for (const warning of solutionResult?.diagnostics.warnings || []) warnings.add(warning);
  return [...warnings].sort();
}

export function buildSolutionShadowComparisonMetrics({
  legacyProblems,
  problemSynthesis,
  solutionIntelligence,
}: {
  legacyProblems: DiscoveredProblem[];
  problemSynthesis?: ProblemSynthesisResult;
  solutionIntelligence?: SolutionIntelligenceResult;
}): SolutionShadowComparisonMetrics {
  const legacySolutions = legacyProblems.flatMap((problem) => splitLegacySolutions(problem.suggested_solutions));
  const legacySolutionCount = legacySolutions.length;
  const legacyHasOnlySaasSuggestions = legacySolutionCount > 0 && legacySolutions.every(isSaasLikeSolution);
  const evaluatedCategoryCount = solutionIntelligence?.diagnostics.evaluatedCategoryCount || solutionIntelligence?.evaluations.length || 0;
  const recommendedCategory = getRecommendedCategory(solutionIntelligence);
  const recommendedCategoryConfidence = getRecommendationConfidence(solutionIntelligence);
  const saasSelected = recommendedCategory === SAAS_CATEGORY;
  const nonSaasSelected = Boolean(recommendedCategory && !saasSelected);
  const rejectedCategoryCount = solutionIntelligence?.rejectedCategories.length || 0;
  const rejectedWithReasons = countRejectedCategoriesWithReasons(solutionIntelligence);
  const missingEvidenceCount = solutionIntelligence?.diagnostics.missingEvidenceCount || 0;
  const lowConfidenceReasonCount = solutionIntelligence?.diagnostics.lowConfidenceReasonCount || 0;
  const hasConfidentRecommendation = recommendedCategoryConfidence >= CONFIDENT_RECOMMENDATION_THRESHOLD;
  const disagreementCount = legacySolutionCount > 0 && recommendedCategory
    ? legacySolutions.filter((solution) => isSaasLikeSolution(solution) !== saasSelected).length
    : 0;
  const synthesisCandidateCount = problemSynthesis?.candidates.length || 0;
  const problemTitleOverlapCount = countOverlappingProblemFields({ legacyProblems, synthesis: problemSynthesis, legacyField: "problem_title", synthesisField: "synthesizedProblemTitle" });
  const problemSummaryOverlapCount = countOverlappingProblemFields({ legacyProblems, synthesis: problemSynthesis, legacyField: "problem_summary", synthesisField: "synthesizedSummary" });

  return {
    legacySolutionCount,
    legacyProblemCount: legacyProblems.length,
    problemSynthesisCandidateCount: synthesisCandidateCount,
    problemTitleOverlapCount,
    problemSummaryOverlapCount,
    evaluatedCategoryCount,
    recommendedCategory,
    recommendedCategoryConfidence,
    saasSelected,
    nonSaasSelected,
    saasBiasDetected: legacyHasOnlySaasSuggestions && nonSaasSelected && hasConfidentRecommendation,
    categoryCoverageScore: roundMetric(Math.min(1, evaluatedCategoryCount / ALL_CATEGORY_COUNT)),
    evidenceSupportScore: roundMetric(Math.max(0, Math.min(1, 1 - missingEvidenceCount / Math.max(1, evaluatedCategoryCount + rejectedCategoryCount)))),
    recommendationConfidenceScore: roundMetric(recommendedCategoryConfidence / 10),
    rejectedCategoryReasonCoverage: roundMetric(rejectedCategoryCount === 0 ? 0 : rejectedWithReasons / rejectedCategoryCount),
    missingEvidenceCount,
    lowConfidenceReasonCount,
    disagreementCount,
    warnings: buildWarnings({ legacySolutionCount, synthesisCandidateCount, evaluatedCategoryCount, recommendedCategory, solutionResult: solutionIntelligence }),
  };
}

export function buildSolutionShadowComparisonMetricsFromDiscoveryResult({
  legacyProblems,
  orchestratorResult,
}: {
  legacyProblems: DiscoveredProblem[];
  orchestratorResult: DiscoveryModularPipelineResult;
}) {
  return buildSolutionShadowComparisonMetrics({
    legacyProblems,
    problemSynthesis: orchestratorResult.outputs.problemIntelligenceSynthesis,
    solutionIntelligence: orchestratorResult.outputs.solutionIntelligenceEvaluation,
  });
}
