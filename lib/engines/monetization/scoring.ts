import type { CompetitionSignal, MarketSizeSignal, MonetizationRisk, MonetizationScore, PricingHypothesis, RecurrenceSignal, RevenuePotential, WillingnessToPaySignal } from "./types";

/** Normalizes monetization signals onto SaaSScout's 0-10 deterministic intelligence scale. */
export function normalizeMonetizationScore(value: number | null | undefined, fallback = 0) {
  const score = Number(value ?? fallback);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

/** Calculates stable averages for monetization scoring without introducing model-dependent judgment. */
export function averageMonetizationScore(values: number[]) {
  if (values.length === 0) return 0;
  return normalizeMonetizationScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Converts willingness-to-pay scores into explainable business viability buckets. */
export function willingnessToPayFromScore(score: number): WillingnessToPaySignal {
  if (score >= 8.5) return "urgent";
  if (score >= 7) return "high";
  if (score >= 4) return "moderate";
  if (score > 0) return "low";
  return "unknown";
}

/** Converts revenue potential scores into reusable candidate labels for future decision engines. */
export function revenuePotentialFromScore(score: number): RevenuePotential {
  if (score >= 8.5) return "exceptional";
  if (score >= 7) return "strong";
  if (score >= 4) return "modest";
  if (score > 0) return "weak";
  return "unknown";
}

/** Selects the initial deterministic pricing hypothesis suggested by monetization evidence. */
export function pricingHypothesisFromSignals(input: { recurringScore: number; marketSizeScore: number; willingnessToPayScore: number; competitionPressureScore: number; transactionTerms: number; seatTerms: number; usageTerms: number; enterpriseTerms: number }): PricingHypothesis {
  if (input.enterpriseTerms > 0 || (input.willingnessToPayScore >= 8 && input.marketSizeScore >= 7)) return "enterprise";
  if (input.usageTerms > input.seatTerms && input.usageTerms > 0) return "usage_based";
  if (input.seatTerms > 0) return "seat_based";
  if (input.transactionTerms > 0 && input.recurringScore < 6) return "transactional";
  if (input.recurringScore > 0 || input.competitionPressureScore < 8) return "subscription";
  return "unknown";
}

/** Converts market-size scores into explicit scope buckets for comparing opportunity viability. */
export function marketSizeFromScore(score: number): MarketSizeSignal {
  if (score >= 8.5) return "expansive";
  if (score >= 7) return "large";
  if (score >= 4) return "focused";
  if (score > 0) return "niche";
  return "unknown";
}

/** Converts competition pressure scores into business-risk buckets without external lookups. */
export function competitionFromScore(score: number): CompetitionSignal {
  if (score >= 8.5) return "saturated";
  if (score >= 6.5) return "crowded";
  if (score >= 3) return "moderate";
  if (score > 0) return "low";
  return "unknown";
}

/** Converts recurring potential scores into retention-oriented monetization labels. */
export function recurrenceFromScore(score: number): RecurrenceSignal {
  if (score >= 8.5) return "persistent";
  if (score >= 6.5) return "recurring";
  if (score >= 3) return "occasional";
  if (score > 0) return "one_time";
  return "unknown";
}

/** Converts aggregate monetization risk pressure into a stable risk label. */
export function monetizationRiskFromScore(score: number): MonetizationRisk {
  if (score >= 8.5) return "critical";
  if (score >= 6.5) return "high";
  if (score >= 3.5) return "moderate";
  if (score > 0) return "low";
  return "unknown";
}

/** Calculates the risk penalty future decision layers can use to avoid non-viable business ideas. */
export function monetizationRiskPenalty(risk: MonetizationRisk) {
  if (risk === "critical") return 3;
  if (risk === "high") return 2;
  if (risk === "moderate") return 1;
  if (risk === "low") return 0.3;
  return 0;
}

/** Builds the composite Monetization Score from deterministic business signals and evidence quality. */
export function calculateCompositeMonetizationScore(input: { willingnessToPayScore: number; revenuePotentialScore: number; pricingHypothesisScore: number; marketSizeScore: number; competitionPressureScore: number; recurringPotentialScore: number; evidenceCount: number; confidenceScore: number; sourceQualityScore: number; risk: MonetizationRisk }): MonetizationScore {
  const evidenceScore = normalizeMonetizationScore(Math.min(10, Math.log10(Math.max(1, input.evidenceCount)) * 4 + 2));
  const confidenceScore = normalizeMonetizationScore(input.confidenceScore * 0.6 + input.sourceQualityScore * 0.4);
  const riskPenalty = monetizationRiskPenalty(input.risk);
  const weightedScore = input.willingnessToPayScore * 0.24 + input.revenuePotentialScore * 0.2 + input.marketSizeScore * 0.14 + input.recurringPotentialScore * 0.16 + input.pricingHypothesisScore * 0.1 + (10 - input.competitionPressureScore) * 0.06 + evidenceScore * 0.05 + confidenceScore * 0.05;
  return {
    willingnessToPayScore: normalizeMonetizationScore(input.willingnessToPayScore),
    revenuePotentialScore: normalizeMonetizationScore(input.revenuePotentialScore),
    pricingHypothesisScore: normalizeMonetizationScore(input.pricingHypothesisScore),
    marketSizeScore: normalizeMonetizationScore(input.marketSizeScore),
    competitionPressureScore: normalizeMonetizationScore(input.competitionPressureScore),
    recurringPotentialScore: normalizeMonetizationScore(input.recurringPotentialScore),
    evidenceScore,
    confidenceScore,
    riskPenalty: normalizeMonetizationScore(riskPenalty),
    totalScore: normalizeMonetizationScore(weightedScore - riskPenalty),
    rationale: ["Monetization score is deterministic and derived only from evidence-backed market, opportunity, pain, pattern, and trend signals.", `${input.evidenceCount} evidence item(s) support this monetization candidate.`],
  };
}
