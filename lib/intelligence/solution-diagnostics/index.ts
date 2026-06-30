import { SOLUTION_CATEGORIES, type SolutionCategory, type SolutionIntelligenceResult } from "../../engines/solution/index.ts";

export type SolutionConfidenceBucket = "0-2" | "2-4" | "4-6" | "6-8" | "8-10";

export type SolutionCategoryDiagnosticStats = {
  evaluatedCount: number;
  selectedCount: number;
  rejectedCount: number;
  selectionRate: number;
  rejectionRate: number;
  averageConfidence: number;
  averageOverallScore: number;
  averageEvidenceSupportScore: number;
};

export type SolutionDiagnosticAggregateReport = {
  totalEvaluations: number;
  recommendationRate: number;
  insufficientEvidenceRate: number;
  averageConfidence: number;
  averageOverallScore: number;
  categoryDistribution: Record<SolutionCategory, number>;
  categorySelectionFrequency: Record<SolutionCategory, number>;
  rejectedCategoryFrequency: Record<SolutionCategory, number>;
  categoryStatistics: Record<SolutionCategory, SolutionCategoryDiagnosticStats>;
  saasSelectionRate: number;
  nonSaasSelectionRate: number;
  saasBiasRate: number;
  averageEvidenceSupportScore: number;
  averageMissingEvidence: number;
  averageWarnings: number;
  averageRejectedCategories: number;
  averageRecommendationConfidence: number;
  confidenceBuckets: Record<SolutionConfidenceBucket, number>;
  recommendationsWithStrongEvidence: number;
  recommendationsWithWeakEvidence: number;
  recommendationsWithoutRecommendation: number;
  recommendationCoverage: number;
};

const SAAS_CATEGORY: SolutionCategory = "saas_software";
const STRONG_EVIDENCE_THRESHOLD = 7;
const CONFIDENCE_BUCKETS: SolutionConfidenceBucket[] = ["0-2", "2-4", "4-6", "6-8", "8-10"];

function emptyCategoryRecord<T>(valueFactory: () => T): Record<SolutionCategory, T> {
  return Object.fromEntries(SOLUTION_CATEGORIES.map((category) => [category, valueFactory()])) as Record<SolutionCategory, T>;
}

function emptyBucketRecord() {
  return Object.fromEntries(CONFIDENCE_BUCKETS.map((bucket) => [bucket, 0])) as Record<SolutionConfidenceBucket, number>;
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function rate(count: number, total: number) {
  if (total === 0) return 0;
  return roundMetric(count / total);
}

export function getSolutionConfidenceBucket(confidence: number): SolutionConfidenceBucket {
  const normalized = Math.max(0, Math.min(10, Number.isFinite(confidence) ? confidence : 0));
  if (normalized < 2) return "0-2";
  if (normalized < 4) return "2-4";
  if (normalized < 6) return "4-6";
  if (normalized < 8) return "6-8";
  return "8-10";
}

export function createEmptySolutionDiagnosticAggregateReport(): SolutionDiagnosticAggregateReport {
  return {
    totalEvaluations: 0,
    recommendationRate: 0,
    insufficientEvidenceRate: 0,
    averageConfidence: 0,
    averageOverallScore: 0,
    categoryDistribution: emptyCategoryRecord(() => 0),
    categorySelectionFrequency: emptyCategoryRecord(() => 0),
    rejectedCategoryFrequency: emptyCategoryRecord(() => 0),
    categoryStatistics: emptyCategoryRecord(() => ({
      evaluatedCount: 0,
      selectedCount: 0,
      rejectedCount: 0,
      selectionRate: 0,
      rejectionRate: 0,
      averageConfidence: 0,
      averageOverallScore: 0,
      averageEvidenceSupportScore: 0,
    })),
    saasSelectionRate: 0,
    nonSaasSelectionRate: 0,
    saasBiasRate: 0,
    averageEvidenceSupportScore: 0,
    averageMissingEvidence: 0,
    averageWarnings: 0,
    averageRejectedCategories: 0,
    averageRecommendationConfidence: 0,
    confidenceBuckets: emptyBucketRecord(),
    recommendationsWithStrongEvidence: 0,
    recommendationsWithWeakEvidence: 0,
    recommendationsWithoutRecommendation: 0,
    recommendationCoverage: 0,
  };
}

export function buildSolutionDiagnosticAggregateReport(runs: SolutionIntelligenceResult[]): SolutionDiagnosticAggregateReport {
  if (runs.length === 0) return createEmptySolutionDiagnosticAggregateReport();

  const report = createEmptySolutionDiagnosticAggregateReport();
  const confidenceScores: number[] = [];
  const overallScores: number[] = [];
  const evidenceScores: number[] = [];
  const recommendationConfidenceScores: number[] = [];
  const categoryConfidenceScores = emptyCategoryRecord((): number[] => []);
  const categoryOverallScores = emptyCategoryRecord((): number[] => []);
  const categoryEvidenceScores = emptyCategoryRecord((): number[] => []);
  let recommendedCount = 0;
  let saasSelectedCount = 0;
  let nonSaasSelectedCount = 0;
  let weakSaasRecommendationCount = 0;
  let warningCount = 0;
  let missingEvidenceCount = 0;
  let rejectedCategoryCount = 0;
  let evaluatedCategoryCount = 0;

  for (const run of runs) {
    const recommendedCategory = run.recommendation?.recommendedCategory || run.diagnostics.recommendedCategory;
    warningCount += new Set([...run.warnings, ...run.diagnostics.warnings]).size;
    missingEvidenceCount += run.diagnostics.missingEvidenceCount;
    rejectedCategoryCount += run.rejectedCategories.length;

    for (const evaluation of run.evaluations) {
      const category = evaluation.candidate.category;
      const confidence = evaluation.scoreBreakdown.confidenceScore;
      const overall = evaluation.scoreBreakdown.overallSolutionScore;
      const evidence = evaluation.scoreBreakdown.evidenceStrengthScore;
      report.categoryDistribution[category] += 1;
      categoryConfidenceScores[category].push(confidence);
      categoryOverallScores[category].push(overall);
      categoryEvidenceScores[category].push(evidence);
      confidenceScores.push(confidence);
      overallScores.push(overall);
      evidenceScores.push(evidence);
      evaluatedCategoryCount += 1;
    }

    for (const rejectedCategory of run.rejectedCategories) {
      report.rejectedCategoryFrequency[rejectedCategory.category] += 1;
    }

    if (recommendedCategory) {
      recommendedCount += 1;
      report.categorySelectionFrequency[recommendedCategory] += 1;
      const recommendationConfidence = run.recommendation?.evaluation?.scoreBreakdown.confidenceScore || 0;
      const recommendationEvidence = run.recommendation?.evaluation?.scoreBreakdown.evidenceStrengthScore || 0;
      recommendationConfidenceScores.push(recommendationConfidence);
      report.confidenceBuckets[getSolutionConfidenceBucket(recommendationConfidence)] += 1;
      if (recommendationEvidence >= STRONG_EVIDENCE_THRESHOLD) report.recommendationsWithStrongEvidence += 1;
      else report.recommendationsWithWeakEvidence += 1;
      if (recommendedCategory === SAAS_CATEGORY) {
        saasSelectedCount += 1;
        if (recommendationEvidence < STRONG_EVIDENCE_THRESHOLD) weakSaasRecommendationCount += 1;
      } else {
        nonSaasSelectedCount += 1;
      }
    } else {
      report.recommendationsWithoutRecommendation += 1;
      report.confidenceBuckets["0-2"] += 1;
    }
  }

  for (const category of SOLUTION_CATEGORIES) {
    const evaluatedCount = report.categoryDistribution[category];
    const selectedCount = report.categorySelectionFrequency[category];
    const rejectedCount = report.rejectedCategoryFrequency[category];
    report.categoryStatistics[category] = {
      evaluatedCount,
      selectedCount,
      rejectedCount,
      selectionRate: rate(selectedCount, runs.length),
      rejectionRate: rate(rejectedCount, runs.length),
      averageConfidence: average(categoryConfidenceScores[category]),
      averageOverallScore: average(categoryOverallScores[category]),
      averageEvidenceSupportScore: average(categoryEvidenceScores[category]),
    };
    report.categoryDistribution[category] = rate(evaluatedCount, Math.max(1, evaluatedCategoryCount));
  }

  report.totalEvaluations = runs.length;
  report.recommendationRate = rate(recommendedCount, runs.length);
  report.insufficientEvidenceRate = rate(report.recommendationsWithoutRecommendation, runs.length);
  report.averageConfidence = average(confidenceScores);
  report.averageOverallScore = average(overallScores);
  report.saasSelectionRate = rate(saasSelectedCount, runs.length);
  report.nonSaasSelectionRate = rate(nonSaasSelectedCount, runs.length);
  report.saasBiasRate = rate(weakSaasRecommendationCount, Math.max(1, recommendedCount));
  report.averageEvidenceSupportScore = average(evidenceScores);
  report.averageMissingEvidence = roundMetric(missingEvidenceCount / runs.length);
  report.averageWarnings = roundMetric(warningCount / runs.length);
  report.averageRejectedCategories = roundMetric(rejectedCategoryCount / runs.length);
  report.averageRecommendationConfidence = average(recommendationConfidenceScores);
  report.recommendationCoverage = report.recommendationRate;

  return report;
}

export function mergeSolutionDiagnosticAggregateReports(reports: SolutionDiagnosticAggregateReport[]): SolutionDiagnosticAggregateReport {
  const total = reports.reduce((sum, report) => sum + report.totalEvaluations, 0);
  if (total === 0) return createEmptySolutionDiagnosticAggregateReport();

  const merged = createEmptySolutionDiagnosticAggregateReport();
  merged.totalEvaluations = total;

  for (const report of reports) {
    const weight = report.totalEvaluations;
    merged.recommendationsWithStrongEvidence += report.recommendationsWithStrongEvidence;
    merged.recommendationsWithWeakEvidence += report.recommendationsWithWeakEvidence;
    merged.recommendationsWithoutRecommendation += report.recommendationsWithoutRecommendation;
    for (const category of SOLUTION_CATEGORIES) {
      merged.categorySelectionFrequency[category] += report.categorySelectionFrequency[category];
      merged.rejectedCategoryFrequency[category] += report.rejectedCategoryFrequency[category];
      merged.categoryDistribution[category] += report.categoryDistribution[category] * weight;
      const source = report.categoryStatistics[category];
      const target = merged.categoryStatistics[category];
      target.evaluatedCount += source.evaluatedCount;
      target.selectedCount += source.selectedCount;
      target.rejectedCount += source.rejectedCount;
      target.averageConfidence += source.averageConfidence * weight;
      target.averageOverallScore += source.averageOverallScore * weight;
      target.averageEvidenceSupportScore += source.averageEvidenceSupportScore * weight;
    }
    for (const bucket of CONFIDENCE_BUCKETS) merged.confidenceBuckets[bucket] += report.confidenceBuckets[bucket];
    merged.recommendationRate += report.recommendationRate * weight;
    merged.insufficientEvidenceRate += report.insufficientEvidenceRate * weight;
    merged.averageConfidence += report.averageConfidence * weight;
    merged.averageOverallScore += report.averageOverallScore * weight;
    merged.saasSelectionRate += report.saasSelectionRate * weight;
    merged.nonSaasSelectionRate += report.nonSaasSelectionRate * weight;
    merged.saasBiasRate += report.saasBiasRate * weight;
    merged.averageEvidenceSupportScore += report.averageEvidenceSupportScore * weight;
    merged.averageMissingEvidence += report.averageMissingEvidence * weight;
    merged.averageWarnings += report.averageWarnings * weight;
    merged.averageRejectedCategories += report.averageRejectedCategories * weight;
    merged.averageRecommendationConfidence += report.averageRecommendationConfidence * weight;
    merged.recommendationCoverage += report.recommendationCoverage * weight;
  }

  for (const key of ["recommendationRate", "insufficientEvidenceRate", "averageConfidence", "averageOverallScore", "saasSelectionRate", "nonSaasSelectionRate", "saasBiasRate", "averageEvidenceSupportScore", "averageMissingEvidence", "averageWarnings", "averageRejectedCategories", "averageRecommendationConfidence", "recommendationCoverage"] as const) {
    merged[key] = roundMetric(merged[key] / total);
  }

  for (const category of SOLUTION_CATEGORIES) {
    merged.categoryDistribution[category] = roundMetric(merged.categoryDistribution[category] / total);
    const stats = merged.categoryStatistics[category];
    stats.selectionRate = rate(stats.selectedCount, total);
    stats.rejectionRate = rate(stats.rejectedCount, total);
    stats.averageConfidence = roundMetric(stats.averageConfidence / total);
    stats.averageOverallScore = roundMetric(stats.averageOverallScore / total);
    stats.averageEvidenceSupportScore = roundMetric(stats.averageEvidenceSupportScore / total);
  }

  return merged;
}

function mostFrequent(frequencies: Record<SolutionCategory, number>) {
  return SOLUTION_CATEGORIES.reduce<SolutionCategory | null>((best, category) => {
    if (!best) return frequencies[category] > 0 ? category : null;
    if (frequencies[category] > frequencies[best]) return category;
    return best;
  }, null);
}

export function formatSolutionDiagnosticSummary(report: SolutionDiagnosticAggregateReport): string {
  const mostSelected = mostFrequent(report.categorySelectionFrequency) || "none";
  const mostRejected = mostFrequent(report.rejectedCategoryFrequency) || "none";
  const readiness = report.recommendationCoverage >= 0.7 && report.averageEvidenceSupportScore >= STRONG_EVIDENCE_THRESHOLD
    ? "ready for deeper Decision Layer validation"
    : "not ready for production Decision Layer integration";

  return [
    "Solution Intelligence Diagnostic Summary",
    `Evaluations: ${report.totalEvaluations}`,
    `Average confidence: ${report.averageConfidence}`,
    `Most selected category: ${mostSelected}`,
    `Most rejected category: ${mostRejected}`,
    `SaaS selected: ${report.saasSelectionRate}`,
    `Non-SaaS selected: ${report.nonSaasSelectionRate}`,
    `Average evidence support: ${report.averageEvidenceSupportScore}`,
    `Average missing evidence: ${report.averageMissingEvidence}`,
    `Average warnings: ${report.averageWarnings}`,
    `Potential SaaS bias: ${report.saasBiasRate}`,
    `Recommendation readiness: ${readiness}`,
  ].join("\n");
}
