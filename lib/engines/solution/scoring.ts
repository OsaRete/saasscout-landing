import type { SolutionCategory, SolutionEvaluationScoreBreakdown, SolutionScore } from "./types.ts";

export type SolutionSignalProfile = {
  evidenceCount: number;
  problemText: string;
  evidenceText: string;
  marketText: string;
  audienceText: string;
  signals: Record<string, number>;
};

export function normalizeSolutionScore(value: number | null | undefined, fallback = 0): SolutionScore {
  const score = Number(value ?? fallback);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

export function averageSolutionScore(values: number[], fallback = 0): SolutionScore {
  const scores = values.filter(Number.isFinite);
  if (scores.length === 0) return normalizeSolutionScore(fallback);
  return normalizeSolutionScore(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

const CATEGORY_WEIGHTS: Record<SolutionCategory, Partial<Record<string, number>>> = {
  saas_software: { workflow: 1.4, recurring: 1.2, business: 0.8, software: 1.4, data: 0.8, manual: 0.8, physical: -1.6, human: -0.6 },
  mobile_app: { mobile: 2.0, consumer: 1.0, location: 1.0, frequent: 0.8, workflow: 0.3, developer: -0.8, physical: -0.4 },
  api: { developer: 2.2, integration: 1.6, data: 1.0, automation: 0.9, workflow: 0.4, human: -0.8, physical: -0.8 },
  physical_product: { physical: 2.4, logistics: 1.1, consumer: 0.6, manufacturing: 1.4, software: -1.0, developer: -1.0 },
  hardware: { hardware: 2.5, sensor: 1.8, physical: 1.4, manufacturing: 1.4, compliance: 0.8, software: -0.4 },
  marketplace: { twoSided: 2.2, fragmentedSupply: 1.4, local: 0.8, trust: 0.7, workflow: -0.4 },
  service: { human: 2.1, custom: 1.4, trust: 1.1, urgent: 0.8, consulting: 1.0, recurring: 0.3, automation: -0.8 },
  automation: { automation: 2.1, manual: 1.5, workflow: 1.4, integration: 1.0, recurring: 1.0, physical: -0.8, custom: -0.3 },
  ai_product: { ai: 2.2, data: 1.2, unstructured: 1.5, automation: 0.9, workflow: 0.5, trust: -0.5, physical: -0.8 },
  education_product: { education: 2.3, knowledge: 1.4, beginner: 1.0, consumer: 0.5, urgent: -0.5, physical: -0.6 },
  consulting: { consulting: 2.3, human: 1.8, custom: 1.5, trust: 1.1, business: 0.8, recurring: -0.2, automation: -0.6 },
  hybrid_model: { hybrid: 1.7, physical: 0.7, software: 0.7, human: 0.7, custom: 0.7, complexity: 0.8 },
  new_business_model: { pricing: 2.0, outcome: 1.8, finance: 1.4, underserved: 0.8, business: 0.5, evidenceWeak: -0.8 },
};

const COMPLEXITY_PENALTY: Record<SolutionCategory, { implementation: number; operational: number; scalability: number; defensibility: number }> = {
  saas_software: { implementation: 6.4, operational: 6.4, scalability: 8.6, defensibility: 6.2 },
  mobile_app: { implementation: 6.8, operational: 6.5, scalability: 8.0, defensibility: 5.2 },
  api: { implementation: 5.8, operational: 6.2, scalability: 8.8, defensibility: 6.5 },
  physical_product: { implementation: 4.7, operational: 4.2, scalability: 5.8, defensibility: 6.4 },
  hardware: { implementation: 3.4, operational: 3.8, scalability: 5.2, defensibility: 7.4 },
  marketplace: { implementation: 6.0, operational: 4.6, scalability: 8.2, defensibility: 8.0 },
  service: { implementation: 8.4, operational: 4.6, scalability: 4.8, defensibility: 4.7 },
  automation: { implementation: 7.1, operational: 6.8, scalability: 8.1, defensibility: 5.8 },
  ai_product: { implementation: 5.6, operational: 6.1, scalability: 8.3, defensibility: 5.8 },
  education_product: { implementation: 8.2, operational: 6.5, scalability: 6.6, defensibility: 4.8 },
  consulting: { implementation: 8.7, operational: 5.5, scalability: 3.8, defensibility: 5.5 },
  hybrid_model: { implementation: 5.0, operational: 4.4, scalability: 6.6, defensibility: 7.0 },
  new_business_model: { implementation: 5.8, operational: 4.8, scalability: 7.0, defensibility: 6.8 },
};

export function categoryFitScore(category: SolutionCategory, profile: SolutionSignalProfile) {
  const weights = CATEGORY_WEIGHTS[category];
  const raw = Object.entries(weights).reduce((sum, [signal, weight]) => sum + (profile.signals[signal] || 0) * (weight ?? 0), 4.2);
  return normalizeSolutionScore(raw);
}

export function evidenceStrengthScore(profile: SolutionSignalProfile) {
  const volume = Math.min(5, profile.evidenceCount * 1.4);
  const specificity = Math.min(3, Object.values(profile.signals).filter((value) => value > 0).length * 0.35);
  const references = profile.evidenceCount > 0 ? 2 : 0;
  return normalizeSolutionScore(volume + specificity + references);
}

export function calculateSolutionScoreBreakdown(category: SolutionCategory, profile: SolutionSignalProfile): SolutionEvaluationScoreBreakdown {
  const fit = categoryFitScore(category, profile);
  const evidenceStrength = evidenceStrengthScore(profile);
  const base = COMPLEXITY_PENALTY[category];
  const willingness = normalizeSolutionScore(4 + (profile.signals.business || 0) * 0.8 + (profile.signals.urgent || 0) * 0.7 + (profile.signals.pricing || 0) * 0.8 + (profile.signals.consumer || 0) * 0.25);
  const distribution = normalizeSolutionScore(4.8 + (profile.signals.developer || 0) * (category === "api" ? 0.8 : 0.2) + (profile.signals.consumer || 0) * (category === "mobile_app" || category === "physical_product" ? 0.6 : 0.2) + (profile.signals.business || 0) * 0.35);
  const confidence = normalizeSolutionScore(evidenceStrength * 0.55 + fit * 0.3 + Math.min(10, profile.evidenceCount * 1.2) * 0.15);
  const overall = normalizeSolutionScore(fit * 0.26 + willingness * 0.14 + base.scalability * 0.12 + base.implementation * 0.1 + base.operational * 0.08 + distribution * 0.1 + base.defensibility * 0.08 + evidenceStrength * 0.07 + confidence * 0.05);
  return {
    problemSolutionFitScore: fit,
    willingnessToPayScore: willingness,
    scalabilityScore: normalizeSolutionScore(base.scalability),
    implementationComplexityScore: normalizeSolutionScore(base.implementation),
    operationalComplexityScore: normalizeSolutionScore(base.operational),
    distributionFitScore: distribution,
    defensibilityScore: normalizeSolutionScore(base.defensibility),
    evidenceStrengthScore: evidenceStrength,
    confidenceScore: confidence,
    overallSolutionScore: overall,
  };
}
