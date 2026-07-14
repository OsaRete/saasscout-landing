import type { SnapshotRetrievalCandidate, SnapshotRetrievalResult, SnapshotRetrievalScoreBreakdown } from "./types.ts";

export type SnapshotRetrievalQualityClassification = "strongly_related" | "partially_related" | "weakly_related" | "not_relevant" | "empty";

export type SnapshotRetrievalRelevanceSignals = Readonly<{
  total: number;
  queryTextMatch: number;
  nicheOverlap: number;
  clusterOverlap: number;
  evidenceStrength: number;
  snapshotConfidence: number;
  provenanceDiversity: number;
  freshness: number;
  hasThematicRelevance: boolean;
  qualityScoreLift: number;
}>;

export type SnapshotRetrievalTopResultBreakdown = SnapshotRetrievalRelevanceSignals & Readonly<{
  qualityClassification: SnapshotRetrievalQualityClassification;
}>;

export type SnapshotRetrievalScoreDistribution = Readonly<{
  count: number;
  minScore: number;
  maxScore: number;
  averageScore: number;
  medianScore: number;
  p95Score: number;
  zeroScoreCount: number;
  nearZeroScoreCount: number;
  thematicRelevantCount: number;
  nonRelevantQualityLiftCount: number;
}>;

export type SnapshotRetrievalDuplicateSummary = Readonly<{
  candidatesRead: number;
  uniqueSnapshotCount: number;
  duplicateCandidateCount: number;
  duplicateSnapshotIdCount: number;
}>;

export type SnapshotRetrievalQualitySummary = Readonly<{
  qualityClassification: SnapshotRetrievalQualityClassification;
  topResultBreakdown: SnapshotRetrievalTopResultBreakdown | null;
  scoreDistribution: SnapshotRetrievalScoreDistribution;
}>;

export const SNAPSHOT_RETRIEVAL_QUALITY_THRESHOLDS = Object.freeze({
  strongTotalScore: 0.6,
  strongThematicFactor: 0.5,
  partialTotalScore: 0.35,
  weakTotalScoreExclusive: 0,
  nearZeroScoreInclusive: 0.05,
});

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function roundMetric(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(6));
}

function percentileNearestRank(sortedValues: readonly number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  // Deterministic nearest-rank percentile. For one value and other small samples, p95 is the highest value at
  // ceil(0.95 * n), avoiding interpolation noise in operator diagnostics.
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.ceil(percentile * sortedValues.length) - 1));
  return sortedValues[index] ?? 0;
}

function median(sortedValues: readonly number[]): number {
  if (sortedValues.length === 0) return 0;
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? ((sortedValues[middle - 1] ?? 0) + (sortedValues[middle] ?? 0)) / 2
    : sortedValues[middle] ?? 0;
}

export function hasSnapshotRetrievalThematicRelevance(breakdown: SnapshotRetrievalScoreBreakdown): boolean {
  // Diagnostic relevance gate only: support factors may strengthen relevant candidates but cannot create thematic relevance.
  return clamp01(breakdown.queryTextMatch) > 0 || clamp01(breakdown.nicheOverlap) > 0 || clamp01(breakdown.clusterOverlap) > 0;
}

export function getSnapshotRetrievalRelevanceSignals(result: Pick<SnapshotRetrievalResult, "score" | "scoreBreakdown">): SnapshotRetrievalRelevanceSignals {
  const breakdown = result.scoreBreakdown;
  const signals = {
    total: clamp01(result.score),
    queryTextMatch: clamp01(breakdown.queryTextMatch),
    nicheOverlap: clamp01(breakdown.nicheOverlap),
    clusterOverlap: clamp01(breakdown.clusterOverlap),
    evidenceStrength: clamp01(breakdown.evidenceStrength),
    snapshotConfidence: clamp01(breakdown.snapshotConfidence),
    provenanceDiversity: clamp01(breakdown.provenanceDiversity),
    freshness: clamp01(breakdown.freshness),
  };
  return Object.freeze({
    ...signals,
    hasThematicRelevance: signals.queryTextMatch > 0 || signals.nicheOverlap > 0 || signals.clusterOverlap > 0,
    qualityScoreLift: roundMetric(signals.evidenceStrength + signals.snapshotConfidence + signals.provenanceDiversity + signals.freshness),
  });
}

export function classifySnapshotRetrievalQuality(result: Pick<SnapshotRetrievalResult, "score" | "scoreBreakdown"> | null | undefined): SnapshotRetrievalQualityClassification {
  if (result == null) return "empty";
  const signals = getSnapshotRetrievalRelevanceSignals(result);
  if (!signals.hasThematicRelevance) return "not_relevant";
  const hasStrongFactor = signals.queryTextMatch >= SNAPSHOT_RETRIEVAL_QUALITY_THRESHOLDS.strongThematicFactor
    || signals.nicheOverlap >= SNAPSHOT_RETRIEVAL_QUALITY_THRESHOLDS.strongThematicFactor
    || signals.clusterOverlap >= SNAPSHOT_RETRIEVAL_QUALITY_THRESHOLDS.strongThematicFactor;
  if (signals.total >= SNAPSHOT_RETRIEVAL_QUALITY_THRESHOLDS.strongTotalScore && hasStrongFactor) return "strongly_related";
  if (signals.total >= SNAPSHOT_RETRIEVAL_QUALITY_THRESHOLDS.partialTotalScore) return "partially_related";
  if (signals.total > SNAPSHOT_RETRIEVAL_QUALITY_THRESHOLDS.weakTotalScoreExclusive) return "weakly_related";
  return "not_relevant";
}

export function summarizeSnapshotRetrievalDuplicates(candidates: readonly Pick<SnapshotRetrievalCandidate, "snapshotId">[]): SnapshotRetrievalDuplicateSummary {
  const counts = new Map<string, number>();
  for (const candidate of candidates) counts.set(candidate.snapshotId, (counts.get(candidate.snapshotId) ?? 0) + 1);
  let duplicateCandidateCount = 0;
  let duplicateSnapshotIdCount = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      duplicateSnapshotIdCount += 1;
      duplicateCandidateCount += count - 1;
    }
  }
  return Object.freeze({ candidatesRead: candidates.length, uniqueSnapshotCount: counts.size, duplicateCandidateCount, duplicateSnapshotIdCount });
}

export function calculateSnapshotRetrievalScoreDistribution(results: readonly Pick<SnapshotRetrievalResult, "score" | "scoreBreakdown">[]): SnapshotRetrievalScoreDistribution {
  const scores = results.map((result) => clamp01(result.score)).sort((a, b) => a - b);
  const count = scores.length;
  const average = count === 0 ? 0 : scores.reduce((sum, score) => sum + score, 0) / count;
  return Object.freeze({
    count,
    minScore: roundMetric(scores[0] ?? 0),
    maxScore: roundMetric(scores[count - 1] ?? 0),
    averageScore: roundMetric(average),
    medianScore: roundMetric(median(scores)),
    p95Score: roundMetric(percentileNearestRank(scores, 0.95)),
    zeroScoreCount: scores.filter((score) => score === 0).length,
    nearZeroScoreCount: scores.filter((score) => score > 0 && score <= SNAPSHOT_RETRIEVAL_QUALITY_THRESHOLDS.nearZeroScoreInclusive).length,
    thematicRelevantCount: results.filter((result) => getSnapshotRetrievalRelevanceSignals(result).hasThematicRelevance).length,
    nonRelevantQualityLiftCount: results.filter((result) => {
      const signals = getSnapshotRetrievalRelevanceSignals(result);
      return !signals.hasThematicRelevance && signals.qualityScoreLift > 0 && signals.total > 0;
    }).length,
  });
}

export function getSnapshotRetrievalTopResultBreakdown(result: Pick<SnapshotRetrievalResult, "score" | "scoreBreakdown"> | null | undefined): SnapshotRetrievalTopResultBreakdown | null {
  if (result == null) return null;
  return Object.freeze({ ...getSnapshotRetrievalRelevanceSignals(result), qualityClassification: classifySnapshotRetrievalQuality(result) });
}

export function summarizeSnapshotRetrievalQuality(results: readonly Pick<SnapshotRetrievalResult, "score" | "scoreBreakdown">[]): SnapshotRetrievalQualitySummary {
  const topResult = results[0];
  return Object.freeze({
    qualityClassification: classifySnapshotRetrievalQuality(topResult),
    topResultBreakdown: getSnapshotRetrievalTopResultBreakdown(topResult),
    scoreDistribution: calculateSnapshotRetrievalScoreDistribution(results),
  });
}
