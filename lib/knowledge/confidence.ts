import type { ConfidenceEvolutionInput } from "./types";

function clampScore(value: number) {
  return Math.min(10, Math.max(0, Number(value.toFixed(1))));
}

function recencyScore(latestEvidenceAt: string, now: string | Date = new Date()) {
  const latest = Date.parse(latestEvidenceAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);

  if (Number.isNaN(latest) || Number.isNaN(current)) return 0;

  const daysOld = Math.max(0, (current - latest) / (1000 * 60 * 60 * 24));
  if (daysOld <= 30) return 10;
  if (daysOld >= 365) return 2;

  return 10 - (daysOld - 30) * (8 / 335);
}

export function calculateKnowledgeConfidence({
  evidenceCount,
  averageEvidenceConfidence,
  averageSourceQuality,
  latestEvidenceAt,
  now,
}: ConfidenceEvolutionInput) {
  const quantityScore = Math.min(10, Math.log10(Math.max(1, evidenceCount)) * 4 + 2);
  const qualityScore = (averageEvidenceConfidence * 0.55 + averageSourceQuality * 0.45) || 0;
  const freshnessScore = recencyScore(latestEvidenceAt, now);

  return clampScore(quantityScore * 0.3 + qualityScore * 0.5 + freshnessScore * 0.2);
}
