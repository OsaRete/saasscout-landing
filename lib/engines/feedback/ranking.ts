import type { FeedbackSignal } from "./types";

/** Ranks feedback signals so future orchestrators learn first from the strongest real-world outcomes. */
export function rankFeedbackSignals(signals: FeedbackSignal[]) {
  return [...signals].sort((a, b) => b.learningImpactScore - a.learningImpactScore || b.strengthScore - a.strengthScore || a.event.title.localeCompare(b.event.title));
}
