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
  insufficient_evidence: "Needs evidence",
  weak: "Weak signal",
  promising: "Promising",
  validated: "Validated",
  contradicted: "Contradicted",
};

const RECOMMENDATION_LABELS: Record<PublicIdeaValidationResponse["recommendation"], string> = {
  do_not_prioritize: "Do not prioritize",
  collect_more_evidence: "Collect more evidence",
  run_deep_scan: "Run deep scan",
  prioritize_beta_validation: "Prioritize beta validation",
};

const RECOMMENDATION_TEXT: Record<PublicIdeaValidationResponse["recommendation"], string> = {
  do_not_prioritize: "Related evidence contains stronger contradiction than support. Treat this as a low-priority idea until new evidence changes the signal.",
  collect_more_evidence: "The engine did not find enough related user-owned evidence. Collect more market signals before prioritizing execution.",
  run_deep_scan: "The evidence is promising but not conclusive. Run a deeper scan to strengthen or falsify the opportunity.",
  prioritize_beta_validation: "The evidence base is strong enough to prioritize beta validation with real users.",
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
