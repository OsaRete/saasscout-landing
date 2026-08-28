import type { PublicIdeaValidationResponse } from "../idea-validation";

export type ResultsIdeaValidationBadgeTone = "violet" | "cyan" | "slate" | "amber";

export type ResultsIdeaValidationView = Readonly<{
  confidenceLabel: string;
  statusLabel: string;
  recommendationLabel: string;
  recommendationText: string;
  tone: ResultsIdeaValidationBadgeTone;
}>;

const STATUS_LABELS: Record<PublicIdeaValidationResponse["status"], string> = {
  insufficient_evidence: "Insufficient internal evidence",
  weak: "Weak alignment",
  promising: "Moderate alignment",
  validated: "Strong alignment",
  contradicted: "Contradictory evidence",
};

const RECOMMENDATION_LABELS: Record<PublicIdeaValidationResponse["recommendation"], string> = {
  do_not_prioritize: "Do not prioritize",
  collect_more_evidence: "Collect more evidence",
  run_deep_scan: "Run deep scan",
  prioritize_beta_validation: "Prioritize customer research",
};

const RECOMMENDATION_TEXT: Record<PublicIdeaValidationResponse["recommendation"], string> = {
  do_not_prioritize: "Related evidence contains stronger contradiction than support. Treat this as a low-priority idea until new evidence changes the signal.",
  collect_more_evidence: "SaaSScout did not find enough related internal evidence. Collect more market intelligence before prioritizing execution.",
  run_deep_scan: "Internal evidence is moderately aligned but not conclusive. Run a deeper scan to strengthen or challenge the opportunity.",
  prioritize_beta_validation: "Internal evidence is strongly aligned. Use this context to prioritize real-world customer research, not as a substitute for it.",
};

export function buildResultsIdeaValidationView(
  validation: PublicIdeaValidationResponse,
): ResultsIdeaValidationView {
  const tone: ResultsIdeaValidationBadgeTone =
    validation.status === "validated" || validation.status === "promising"
      ? "cyan"
      : validation.status === "contradicted"
        ? "amber"
        : "violet";

  return Object.freeze({
    confidenceLabel: `${validation.confidence.toFixed(1)}%`,
    statusLabel: STATUS_LABELS[validation.status],
    recommendationLabel: RECOMMENDATION_LABELS[validation.recommendation],
    recommendationText: RECOMMENDATION_TEXT[validation.recommendation],
    tone,
  });
}
