export const LEGACY_OPPORTUNITY_SCORE_MIN = 0;
export const LEGACY_OPPORTUNITY_SCORE_MAX = 10;
export const LEGACY_OPPORTUNITY_SCORE_PROGRESS_MAX = 100;
export const LEGACY_OPPORTUNITY_SCORE_FALLBACK = 0;

export type LegacyOpportunityScoreTone = {
  ring: string;
  bar: string;
  label: "Validated" | "Promising" | "Emerging";
};

export function normalizeLegacyOpportunityScore(
  score: unknown,
  fallback = LEGACY_OPPORTUNITY_SCORE_FALLBACK
): number {
  const numericScore = typeof score === "number" ? score : Number(score);
  const safeFallback = Number.isFinite(fallback)
    ? fallback
    : LEGACY_OPPORTUNITY_SCORE_FALLBACK;
  const value = Number.isFinite(numericScore) ? numericScore : safeFallback;

  return Math.max(
    LEGACY_OPPORTUNITY_SCORE_MIN,
    Math.min(LEGACY_OPPORTUNITY_SCORE_MAX, value)
  );
}

export function formatLegacyOpportunityScore(score: unknown): string {
  return `${normalizeLegacyOpportunityScore(score)} / ${LEGACY_OPPORTUNITY_SCORE_MAX}`;
}

export function legacyOpportunityScoreToProgressWidth(score: unknown): number {
  const progressWidth =
    (normalizeLegacyOpportunityScore(score) / LEGACY_OPPORTUNITY_SCORE_MAX) *
    LEGACY_OPPORTUNITY_SCORE_PROGRESS_MAX;

  return Math.max(
    LEGACY_OPPORTUNITY_SCORE_MIN,
    Math.min(LEGACY_OPPORTUNITY_SCORE_PROGRESS_MAX, progressWidth)
  );
}

export function getLegacyOpportunityScoreTone(
  score: unknown
): LegacyOpportunityScoreTone {
  const normalizedScore = normalizeLegacyOpportunityScore(score);

  if (normalizedScore >= 8) {
    return {
      ring: "border-cyan-300/40 bg-cyan-300/15 text-cyan-100",
      bar: "from-cyan-300 via-violet-300 to-fuchsia-300",
      label: "Validated",
    };
  }

  if (normalizedScore >= 6.5) {
    return {
      ring: "border-violet-300/40 bg-violet-400/15 text-violet-100",
      bar: "from-violet-300 via-cyan-300 to-blue-300",
      label: "Promising",
    };
  }

  return {
    ring: "border-white/15 bg-white/[0.06] text-gray-100",
    bar: "from-gray-300 via-violet-300 to-cyan-300",
    label: "Emerging",
  };
}
