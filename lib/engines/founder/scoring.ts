import type { FounderFitScore, FounderReadiness, FounderRisk } from "./types";

/** Normalizes founder intelligence metrics onto SaaSScout's deterministic 0-10 personalization scale. */
export function normalizeFounderScore(value: number | null | undefined, fallback = 0) {
  const score = Number(value ?? fallback);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

/** Calculates stable averages so Founder Intelligence remains explainable and provider-independent. */
export function averageFounderScore(values: number[]) {
  if (values.length === 0) return 0;
  return normalizeFounderScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Converts deterministic founder risk pressure into reusable risk labels for future decision layers. */
export function founderRiskFromScore(score: number): FounderRisk {
  if (score >= 8.5) return "critical";
  if (score >= 6.5) return "high";
  if (score >= 3.5) return "moderate";
  if (score > 0) return "low";
  return "unknown";
}

/** Converts founder readiness scores into labels that communicate execution preparedness. */
export function founderReadinessFromScore(score: number): FounderReadiness {
  if (score >= 8.5) return "exceptional";
  if (score >= 7) return "strong";
  if (score >= 4.5) return "prepared";
  if (score > 0) return "exploring";
  return "unknown";
}

/** Converts founder risk labels into penalties so unsuitable opportunities are ranked honestly but not hidden. */
export function founderRiskPenalty(risk: FounderRisk) {
  if (risk === "critical") return 3;
  if (risk === "high") return 2;
  if (risk === "moderate") return 1;
  if (risk === "low") return 0.3;
  return 0;
}

/** Calculates the composite Founder Fit Score from founder capability, constraints, opportunity, and monetization signals. */
export function calculateCompositeFounderFitScore(input: {
  skillFitScore: number;
  experienceFitScore: number;
  budgetFitScore: number;
  timeFitScore: number;
  interestFitScore: number;
  opportunityStrengthScore: number;
  monetizationFitScore: number;
  evidenceCount: number;
  constraintPenalty: number;
  risk: FounderRisk;
}): FounderFitScore {
  const evidenceScore = normalizeFounderScore(Math.min(10, Math.log10(Math.max(1, input.evidenceCount)) * 4 + 2));
  const riskPenalty = founderRiskPenalty(input.risk);
  const readinessScore = normalizeFounderScore(input.skillFitScore * 0.25 + input.experienceFitScore * 0.2 + input.budgetFitScore * 0.15 + input.timeFitScore * 0.15 + input.interestFitScore * 0.15 + evidenceScore * 0.1 - input.constraintPenalty * 0.35);
  const weightedScore = input.skillFitScore * 0.18 + input.experienceFitScore * 0.16 + input.budgetFitScore * 0.12 + input.timeFitScore * 0.12 + input.interestFitScore * 0.14 + input.opportunityStrengthScore * 0.14 + input.monetizationFitScore * 0.09 + evidenceScore * 0.05;

  return {
    skillFitScore: normalizeFounderScore(input.skillFitScore),
    experienceFitScore: normalizeFounderScore(input.experienceFitScore),
    budgetFitScore: normalizeFounderScore(input.budgetFitScore),
    timeFitScore: normalizeFounderScore(input.timeFitScore),
    interestFitScore: normalizeFounderScore(input.interestFitScore),
    opportunityStrengthScore: normalizeFounderScore(input.opportunityStrengthScore),
    monetizationFitScore: normalizeFounderScore(input.monetizationFitScore),
    evidenceScore,
    constraintPenalty: normalizeFounderScore(input.constraintPenalty),
    riskPenalty: normalizeFounderScore(riskPenalty),
    readinessScore,
    totalScore: normalizeFounderScore(weightedScore - input.constraintPenalty - riskPenalty),
    rationale: ["Founder fit score is deterministic and derived only from founder profile, constraints, opportunity, monetization, evidence, and knowledge references.", `${input.evidenceCount} evidence item(s) support this founder opportunity fit.`],
  };
}
