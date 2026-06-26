import type { OpportunityReadiness, OpportunityRisk, OpportunityScore } from "./types";

/** Normalizes opportunity metrics onto SaaSScout's deterministic 0-10 intelligence scale. */
export function normalizeOpportunityScore(value: number | null | undefined, fallback = 0) {
  const score = Number(value ?? fallback);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

/** Calculates stable averages so opportunity scoring remains explainable and independent from AI generation. */
export function averageOpportunityScore(values: number[]) {
  if (values.length === 0) return 0;
  return normalizeOpportunityScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Converts deterministic opportunity strength into a readiness bucket for future decision-layer handoff. */
export function readinessFromScore(score: number): OpportunityReadiness {
  if (score >= 8.5) return "urgent";
  if (score >= 7) return "ready";
  if (score >= 4.5) return "validated";
  if (score > 0) return "early";
  return "unknown";
}

/** Converts deterministic risk pressure into a reusable risk bucket for future monetization and founder-fit engines. */
export function riskFromScore(score: number): OpportunityRisk {
  if (score >= 8.5) return "critical";
  if (score >= 6.5) return "high";
  if (score >= 3.5) return "moderate";
  if (score > 0) return "low";
  return "unknown";
}

/** Converts a risk bucket into a penalty so high-risk opportunities remain visible but ranked honestly. */
export function riskPenaltyFromRisk(risk: OpportunityRisk) {
  if (risk === "critical") return 2.5;
  if (risk === "high") return 1.6;
  if (risk === "moderate") return 0.8;
  if (risk === "low") return 0.2;
  return 0;
}

/** Calculates deterministic opportunity quality from pain, pattern, trend, evidence, and market-context signals. */
export function calculateCompositeOpportunityScore(input: {
  marketPullScore: number;
  problemUrgencyScore: number;
  solutionPotentialScore: number;
  buildSimplicityScore: number;
  differentiationPotentialScore: number;
  evidenceCount: number;
  confidenceScore: number;
  sourceQualityScore: number;
  risk: OpportunityRisk;
}): OpportunityScore {
  const evidenceScore = normalizeOpportunityScore(Math.min(10, Math.log10(Math.max(1, input.evidenceCount)) * 4 + 2));
  const confidenceScore = normalizeOpportunityScore(input.confidenceScore * 0.6 + input.sourceQualityScore * 0.4);
  const riskPenalty = riskPenaltyFromRisk(input.risk);
  const weightedScore =
    input.marketPullScore * 0.25 +
    input.problemUrgencyScore * 0.25 +
    input.solutionPotentialScore * 0.18 +
    input.buildSimplicityScore * 0.12 +
    input.differentiationPotentialScore * 0.1 +
    evidenceScore * 0.05 +
    confidenceScore * 0.05;
  const totalScore = normalizeOpportunityScore(weightedScore - riskPenalty);

  return {
    marketPullScore: normalizeOpportunityScore(input.marketPullScore),
    problemUrgencyScore: normalizeOpportunityScore(input.problemUrgencyScore),
    solutionPotentialScore: normalizeOpportunityScore(input.solutionPotentialScore),
    buildSimplicityScore: normalizeOpportunityScore(input.buildSimplicityScore),
    differentiationPotentialScore: normalizeOpportunityScore(input.differentiationPotentialScore),
    evidenceScore,
    confidenceScore,
    riskPenalty: normalizeOpportunityScore(riskPenalty),
    totalScore,
    rationale: [
      "Opportunity score is deterministic and derived only from evidence-backed pain, pattern, trend, and knowledge signals.",
      `${input.evidenceCount} evidence item(s) support this opportunity candidate.`,
    ],
  };
}
