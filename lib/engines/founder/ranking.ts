import type { FounderOpportunityFit } from "./types";

/** Ranks founder opportunity fits so future decision layers can recommend the best personalized sequence first. */
export function rankFounderOpportunityFits(fits: FounderOpportunityFit[]) {
  return [...fits]
    .sort((a, b) => b.score.totalScore - a.score.totalScore || b.score.readinessScore - a.score.readinessScore || b.score.interestFitScore - a.score.interestFitScore || a.id.localeCompare(b.id))
    .map((fit, index) => ({ ...fit, rank: index + 1 }));
}
