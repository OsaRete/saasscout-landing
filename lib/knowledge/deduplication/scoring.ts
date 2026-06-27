import { calculateOverlapScore, normalizeProblemText, normalizeSimilarityScore } from "./helpers";
import type { ProblemDeduplicationCandidate, ProblemSimilarityScore, ProblemSimilaritySignal } from "./types";

/** Compares market context so canonical problems do not merge unrelated pains from different markets too aggressively. */
export function compareMarketContext(a: ProblemDeduplicationCandidate, b: ProblemDeduplicationCandidate): ProblemSimilaritySignal {
  const score = !a.market || !b.market ? 4 : normalizeProblemText(a.market) === normalizeProblemText(b.market) ? 10 : 0;
  return { kind: "market", score, weight: 1.1, matched: score >= 8, rationale: "Market context comparison is deterministic." };
}

/** Compares audience context to preserve who experiences the pain while still allowing weak-context review. */
export function compareAudienceContext(a: ProblemDeduplicationCandidate, b: ProblemDeduplicationCandidate): ProblemSimilaritySignal {
  const score = !a.audience || !b.audience ? 4 : normalizeProblemText(a.audience) === normalizeProblemText(b.audience) ? 10 : 0;
  return { kind: "audience", score, weight: 1.1, matched: score >= 8, rationale: "Audience context comparison is deterministic." };
}

/** Compares pain candidate links so repeated pain-engine findings can reinforce semantic consolidation. */
export function comparePainSignals(a: ProblemDeduplicationCandidate, b: ProblemDeduplicationCandidate): ProblemSimilaritySignal {
  const score = calculateOverlapScore(a.painCandidateIds, b.painCandidateIds);
  return { kind: "pain", score, weight: 1.2, matched: score > 0, rationale: "Shared Pain Engine candidates reinforce consolidation." };
}

/** Compares pattern links so related workflows and themes can connect differently worded problem statements. */
export function comparePatternSignals(a: ProblemDeduplicationCandidate, b: ProblemDeduplicationCandidate): ProblemSimilaritySignal {
  const score = calculateOverlapScore(a.patternCandidateIds, b.patternCandidateIds);
  return { kind: "pattern", score, weight: 1, matched: score > 0, rationale: "Shared Pattern Engine candidates reinforce consolidation." };
}

/** Compares trend links so emerging or recurring market movement can strengthen duplicate detection. */
export function compareTrendSignals(a: ProblemDeduplicationCandidate, b: ProblemDeduplicationCandidate): ProblemSimilaritySignal {
  const score = calculateOverlapScore(a.trendCandidateIds, b.trendCandidateIds);
  return { kind: "trend", score, weight: 0.8, matched: score > 0, rationale: "Shared Trend Engine candidates reinforce consolidation." };
}

/** Compares feedback links so real-world validation can prevent fragmented learning around the same pain. */
export function compareFeedbackSignals(a: ProblemDeduplicationCandidate, b: ProblemDeduplicationCandidate): ProblemSimilaritySignal {
  const score = calculateOverlapScore(a.feedbackEventIds, b.feedbackEventIds);
  return { kind: "feedback", score, weight: 0.9, matched: score > 0, rationale: "Shared feedback events reinforce consolidation." };
}

/** Combines deterministic text, context and engine signals into an explainable similarity score. */
export function calculateSimilarityScore(a: ProblemDeduplicationCandidate, b: ProblemDeduplicationCandidate): ProblemSimilarityScore {
  const sharedTokens = a.tokens.filter((token) => b.tokens.includes(token));
  const text: ProblemSimilaritySignal = { kind: "text", score: calculateOverlapScore(a.tokens, b.tokens), weight: 2, matched: sharedTokens.length > 0, rationale: "Token overlap captures non-exact title similarity." };
  const fingerprint: ProblemSimilaritySignal = { kind: "fingerprint", score: a.fingerprint === b.fingerprint ? 10 : 0, weight: 1.5, matched: a.fingerprint === b.fingerprint, rationale: "Matching fingerprints indicate deterministic normalized identity overlap." };
  const signals = [text, fingerprint, compareMarketContext(a, b), compareAudienceContext(a, b), comparePainSignals(a, b), comparePatternSignals(a, b), compareTrendSignals(a, b), compareFeedbackSignals(a, b)];
  const weight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const totalScore = normalizeSimilarityScore(signals.reduce((sum, signal) => sum + signal.score * signal.weight, 0) / weight);
  return { candidateAId: a.id, candidateBId: b.id, totalScore, signals, sharedTokens, reasons: signals.filter((signal) => signal.matched).map((signal) => signal.rationale) };
}
