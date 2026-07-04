import type { DiscoveredProblem } from "../discovery-response-normalization.ts";
import {
  buildDiscoveryPersistencePlan,
  type PlannedDiscoveredProblem,
} from "../discovery-orchestrator-persistence-plan.ts";
import { evaluateDiscoveryPersistenceQuality } from "../discovery-persistence-quality-gates.ts";
import type { DiscoveryModularPipelineResult } from "../types.ts";
import type {
  DiscoveryQualityComparison,
  LegacyQualityMetrics,
  ModularQualityMetrics,
  QualityCategory,
  QualityCategoryScore,
  QualityComparisonWinner,
} from "./types.ts";

export type { DiscoveryQualityComparison, LegacyQualityMetrics, ModularQualityMetrics, QualityCategoryScore, QualityComparisonDiagnostics } from "./types.ts";

const CATEGORIES: QualityCategory[] = [
  "title_specificity",
  "summary_quality",
  "evidence_quality",
  "evidence_compactness",
  "score_consistency",
  "opportunity_completeness",
  "market_coverage",
  "fallback_usage",
  "row_level_synthesis_readiness",
  "quality_gate_results",
];

const SCORE_FIELDS = [
  "pain_score",
  "revenue_score",
  "urgency_score",
  "trend_score",
  "buying_signal_score",
  "frequency_score",
  "source_quality_score",
] as const;

type ComparableProblem = Pick<PlannedDiscoveredProblem, "problem_title" | "problem_summary" | "affected_niches" | "suggested_solutions" | "source_evidence" | "opportunity_score" | (typeof SCORE_FIELDS)[number]>;

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return clampScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

const TITLE_STOP_WORDS = new Set(["a", "an", "and", "are", "as", "by", "for", "from", "in", "into", "is", "of", "on", "or", "that", "the", "to", "with"]);

function normalizeTitleToken(token: string) {
  if (token === "automated") return "automation";
  if (token === "agencies") return "agency";
  if (["fragmented", "disconnected", "scattered"].includes(token)) return "fragmentation";
  if (token === "delay") return "delays";
  if (token === "dependencies") return "dependency";
  if (token === "leads") return "lead";
  if (token === "workflows") return "workflow";
  if (token === "spreadsheets") return "spreadsheet";
  return token;
}

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !TITLE_STOP_WORDS.has(token))
    .map(normalizeTitleToken);
}

const BUSINESS_DOMAIN_TERMS = new Set([
  "accounting",
  "agency",
  "automation",
  "approval",
  "billing",
  "client",
  "crm",
  "customer",
  "finance",
  "follow",
  "gap",
  "gaps",
  "handoff",
  "handoffs",
  "invoice",
  "lead",
  "onboarding",
  "process",
  "qualification",
  "operational",
  "operations",
  "reporting",
  "sales",
  "spreadsheet",
  "workflow",
]);

const PROBLEM_MECHANISM_TERMS = new Set([
  "backlog",
  "bottleneck",
  "bottlenecks",
  "breakdown",
  "delays",
  "dependency",
  "error",
  "errors",
  "follow",
  "fragmentation",
  "friction",
  "gap",
  "gaps",
  "handoff",
  "handoffs",
  "management",
  "leakage",
  "loss",
  "manual",
  "missed",
  "mistakes",
]);

const GENERIC_TITLE_TERMS = new Set([
  "automation",
  "business",
  "manual",
  "management",
  "operations",
  "process",
  "problems",
  "software",
  "tool",
  "tools",
  "workflow",
]);

const GENERIC_TITLE_PHRASES = new Set([
  "automation tools",
  "business problems",
  "manual",
  "operations",
  "operations bottlenecks",
  "workflow automation",
]);

function normalizedTitlePhrase(tokens: string[]) {
  return tokens.join(" ");
}

function titleSpecificity(row: ComparableProblem) {
  const tokens = words(row.problem_title || "");
  if (tokens.length === 0) return 0;

  const unique = new Set(tokens);
  const phrase = normalizedTitlePhrase(tokens);
  const businessTermCount = tokens.filter((token) => BUSINESS_DOMAIN_TERMS.has(token)).length;
  const problemMechanismCount = tokens.filter((token) => PROBLEM_MECHANISM_TERMS.has(token)).length;
  const lengthScore = Math.min(1, tokens.length / 4) * 20;
  const uniquenessScore = (unique.size / tokens.length) * 15;
  const businessContextScore = Math.min(1, businessTermCount / 2) * 25;
  const problemMechanismScore = Math.min(1, problemMechanismCount / 2) * 25;
  const compoundContextBonus = /\b(follow-up|spreadsheet-based)\b/i.test(row.problem_title || "") ? 5 : 0;
  const conciseSpecificTitleBonus = tokens.length === 3 && ((businessTermCount >= 2 && problemMechanismCount >= 1) || (businessTermCount >= 1 && problemMechanismCount >= 2)) ? 10 : 0;
  const multiContextTitleBonus = tokens.length >= 4 && tokens.length <= 5 && businessTermCount >= 2 && problemMechanismCount >= 1 ? 5 : 0;
  const domainSpecificityBonus = tokens.length >= 3 && tokens.length <= 5 && businessTermCount >= 3 && problemMechanismCount === 0 ? 15 : 0;
  let score = lengthScore + uniquenessScore + businessContextScore + problemMechanismScore + compoundContextBonus + conciseSpecificTitleBonus + multiContextTitleBonus + domainSpecificityBonus;

  const isExplicitlyGeneric = GENERIC_TITLE_PHRASES.has(phrase);
  const isShortGeneric = tokens.length <= 2 && tokens.every((token) => GENERIC_TITLE_TERMS.has(token) || BUSINESS_DOMAIN_TERMS.has(token));
  const isBroadProblemOnly = tokens.length <= 2 && problemMechanismCount >= 1 && businessTermCount <= 1;

  if (isExplicitlyGeneric) score *= 0.45;
  else if (isShortGeneric) score *= 0.6;
  else if (isBroadProblemOnly) score *= 0.75;

  if (isExplicitlyGeneric || isShortGeneric) return Math.min(clampScore(score), 55);
  return clampScore(score);
}

function summaryQuality(row: ComparableProblem) {
  const summaryTokens = words(row.problem_summary || "");
  const titleTokens = new Set(words(row.problem_title || ""));
  const overlap = summaryTokens.filter((token) => titleTokens.has(token)).length / Math.max(1, summaryTokens.length);
  return clampScore(Math.min(1, summaryTokens.length / 22) * 80 + (1 - Math.min(0.5, overlap)) * 20);
}

function evidenceQuality(row: ComparableProblem) {
  const evidenceTokens = words(row.source_evidence || "");
  const sourceHint = /https?:\/\/|reddit|x\.com|hacker news|github|review|source/i.test(row.source_evidence || "") ? 20 : 0;
  return clampScore(Math.min(1, evidenceTokens.length / 28) * 80 + sourceHint);
}

function evidenceCompactness(row: ComparableProblem) {
  const length = (row.source_evidence || "").length;
  if (length === 0) return 0;
  if (length <= 900) return 100;
  return clampScore(100 - ((length - 900) / 900) * 100);
}

function scoreConsistency(row: ComparableProblem) {
  const primary = SCORE_FIELDS.map((field) => Number(row[field])).filter(Number.isFinite);
  if (primary.length === 0 || !Number.isFinite(row.opportunity_score)) return 0;
  const averagePrimary = average(primary.map((score) => score * 10));
  return clampScore(100 - Math.abs(averagePrimary - Number(row.opportunity_score)));
}

function completeness(row: ComparableProblem) {
  const populated = [row.problem_title, row.problem_summary, row.affected_niches, row.suggested_solutions, row.source_evidence]
    .filter((value) => typeof value === "string" && value.trim()).length;
  const validScores = [...SCORE_FIELDS, "opportunity_score" as const].filter((field) => Number.isFinite(row[field])).length;
  return clampScore(((populated / 5) * 0.55 + (validScores / 8) * 0.45) * 100);
}

function affectedNicheTokens(rows: ComparableProblem[]) {
  return [...new Set(rows.flatMap((row) => row.affected_niches.split("|").map((item) => item.trim().toLowerCase()).filter(Boolean)))].sort();
}

function marketCoverage(rows: ComparableProblem[]) {
  const niches = affectedNicheTokens(rows);
  return clampScore(Math.min(1, niches.length / 5) * 100);
}

function metricsForRows(rows: ComparableProblem[], synthesisCompletenessScore: number, fallbackUsageScore: number, rowLevelSynthesisReadinessScore: number, qualityGateScore: number): LegacyQualityMetrics {
  return {
    problemCount: rows.length,
    averageTitleSpecificity: average(rows.map(titleSpecificity)),
    averageSummaryQuality: average(rows.map(summaryQuality)),
    averageEvidenceQuality: average(rows.map(evidenceQuality)),
    averageEvidenceCompactness: average(rows.map(evidenceCompactness)),
    averageScoreConsistency: average(rows.map(scoreConsistency)),
    averageOpportunityCompleteness: average(rows.map(completeness)),
    marketCoverageScore: marketCoverage(rows),
    fallbackUsageScore,
    synthesisCompletenessScore,
    rowLevelSynthesisReadinessScore,
    qualityGateScore,
  };
}

function pick(metrics: LegacyQualityMetrics, category: QualityCategory) {
  if (category === "title_specificity") return metrics.averageTitleSpecificity;
  if (category === "summary_quality") return metrics.averageSummaryQuality;
  if (category === "evidence_quality") return metrics.averageEvidenceQuality;
  if (category === "evidence_compactness") return metrics.averageEvidenceCompactness;
  if (category === "score_consistency") return metrics.averageScoreConsistency;
  if (category === "opportunity_completeness") return metrics.averageOpportunityCompleteness;
  if (category === "market_coverage") return metrics.marketCoverageScore;
  if (category === "fallback_usage") return metrics.fallbackUsageScore;
  if (category === "row_level_synthesis_readiness") return metrics.rowLevelSynthesisReadinessScore;
  return metrics.qualityGateScore;
}

function winner(legacyScore: number, modularScore: number): QualityComparisonWinner {
  if (legacyScore === 0 && modularScore === 0) return "insufficient_data";
  if (Math.abs(legacyScore - modularScore) < 0.01) return "tie";
  return modularScore > legacyScore ? "modular" : "legacy";
}

function buildCategories(legacyMetrics: LegacyQualityMetrics, modularMetrics: ModularQualityMetrics): QualityCategoryScore[] {
  return CATEGORIES.map((category) => {
    const legacyScore = pick(legacyMetrics, category);
    const modularScore = pick(modularMetrics, category);
    return {
      category,
      legacyScore,
      modularScore,
      winner: winner(legacyScore, modularScore),
      diagnostics: [`${category} legacy=${legacyScore} modular=${modularScore}`],
    };
  });
}

export function buildDiscoveryQualityComparison({
  legacyProblems,
  orchestratorResult,
}: {
  legacyProblems: DiscoveredProblem[];
  orchestratorResult: DiscoveryModularPipelineResult;
}): DiscoveryQualityComparison {
  const plan = buildDiscoveryPersistencePlan(orchestratorResult);
  const quality = evaluateDiscoveryPersistenceQuality(plan.rows, { fallbackFieldsByRow: plan.diagnostics.fallback_fields_by_row });
  const synthesisCandidateCount = orchestratorResult.outputs.problemIntelligenceSynthesis?.candidates.length || 0;
  const modularCandidateCount = orchestratorResult.outputs.opportunityDetection?.candidates.length || plan.rows.length;
  const legacyMetrics = metricsForRows(legacyProblems, legacyProblems.length > 0 ? 100 : 0, 100, legacyProblems.length > 0 ? 100 : 0, legacyProblems.length > 0 ? 100 : 0);
  const fallbackFieldCount = plan.diagnostics.fallback_fields_by_row.reduce((sum, row) => sum + row.fields.length, 0);
  const fallbackFieldsCounted = [...new Set(plan.diagnostics.fallback_fields_by_row.flatMap((row) => row.fields))].sort();
  const buildDifficultyFallbackOnlyRows = plan.diagnostics.fallback_fields_by_row
    .filter((row) => row.fields.length === 1 && row.fields[0] === "build_difficulty")
    .map((row) => row.rowIndex);
  const modularFallbackScore = plan.rows.length === 0 ? 0 : clampScore(100 - (fallbackFieldCount / Math.max(1, plan.rows.length * 5)) * 100);
  const modularSynthesisScore = modularCandidateCount === 0 ? 0 : clampScore((synthesisCandidateCount / Math.max(1, modularCandidateCount)) * 100);
  const modularQualityGateScore = plan.rows.length === 0 ? 0 : clampScore((quality.summary.accepted_row_count / plan.rows.length) * 100 - quality.summary.issue_count * 5);
  const baseModularMetrics = metricsForRows(plan.rows, modularSynthesisScore, modularFallbackScore, modularQualityGateScore, modularQualityGateScore);
  const modularMetrics: ModularQualityMetrics = {
    ...baseModularMetrics,
    plannedRowCount: plan.rows.length,
    synthesisCandidateCount,
    qualityGateAcceptedRows: quality.summary.accepted_row_count,
    qualityGateRejectedRows: quality.summary.rejected_row_count,
    fallbackFieldCount,
    orchestratorWarningCount: orchestratorResult.warnings.length,
  };
  const categories = buildCategories(legacyMetrics, modularMetrics);
  const overallLegacyScore = average(categories.map((category) => category.legacyScore));
  const overallModularScore = average(categories.map((category) => category.modularScore));

  return {
    categories,
    legacyMetrics,
    modularMetrics,
    overallLegacyScore,
    overallModularScore,
    overallWinner: winner(overallLegacyScore, overallModularScore),
    diagnostics: {
      categoryCount: categories.length,
      legacyProblemCount: legacyProblems.length,
      modularCandidateCount,
      modularPlannedRowCount: plan.rows.length,
      modularSynthesisCandidateCount: synthesisCandidateCount,
      fallbackFieldCount,
      fallbackFieldsCounted,
      fallbackFieldsByRow: plan.diagnostics.fallback_fields_by_row,
      buildDifficultyFallbackOnlyRowCount: buildDifficultyFallbackOnlyRows.length,
      buildDifficultyFallbackOnlyRows,
      qualityGateIssueCount: quality.summary.issue_count,
      buildDifficultyMappingByRow: plan.diagnostics.build_difficulty_by_row,
      affectedNicheEnrichmentByRow: plan.diagnostics.affected_niche_enrichment_by_row,
      marketCoverage: {
        legacyUniqueAffectedNicheTokens: affectedNicheTokens(legacyProblems),
        modularUniqueAffectedNicheTokens: affectedNicheTokens(plan.rows),
        denominator: 5,
        calculation: "min(1, unique affected_niches token count / 5) * 100",
      },
      synthesisCompleteness: {
        modularCandidateCount,
        modularSynthesisCandidateCount: synthesisCandidateCount,
        formula: "modularCandidateCount === 0 ? 0 : (modularSynthesisCandidateCount / max(1, modularCandidateCount)) * 100",
        representsCandidateCompressionRatio: true,
        representsTrueRowQuality: false,
        explanation: "Legacy diagnostic retained for continuity: this value is the synthesis compression ratio, not persisted row quality. Lower percentages can be expected when many engine candidates collapse into fewer high-quality problem candidates.",
      },
      synthesisCompressionRatio: {
        score: modularSynthesisScore,
        formula: "modularCandidateCount === 0 ? 0 : (modularSynthesisCandidateCount / max(1, modularCandidateCount)) * 100",
        explanation: "Clear name for the legacy synthesis_completeness value: percentage of upstream opportunity candidates represented by problem synthesis candidates.",
      },
      rowLevelSynthesisReadiness: {
        score: modularQualityGateScore,
        plannedRowCount: plan.rows.length,
        acceptedRowCount: quality.summary.accepted_row_count,
        rejectedRowCount: quality.summary.rejected_row_count,
        issueCount: quality.summary.issue_count,
        formula: "plannedRowCount === 0 ? 0 : (acceptedRowCount / plannedRowCount) * 100 - issueCount * 5",
        explanation: "Diagnostic-only row readiness derived from planned synthesis rows and persistence quality gates; it is the scored synthesis-quality parity category, while quality_gate_results remains the separate persistence safety gate. It does not control production persistence.",
      },
      notes: [
        "Quality comparison is diagnostic-only and has no production persistence side effects.",
        "Scores are deterministic heuristics intended to measure migration parity before replacing the legacy pipeline.",
        "fallback_usage counts only planned persistence fields whose source remains fallback:* after deterministic mapping; mapped build_difficulty signals are not counted as missing information.",
        "affected_niches for synthesis rows is deterministically enriched from synthesis context and ranked seed market/audience/cluster diagnostics to improve modular market-coverage parity without enabling persistence.",
        "synthesis_completeness is retained for continuity diagnostics, while synthesisCompressionRatio names the same compression metric more clearly and rowLevelSynthesisReadiness replaces compression ratio as the scored synthesis parity category.",
      ],
    },
  };
}
