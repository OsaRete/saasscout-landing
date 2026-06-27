export { ProblemDeduplicationEngine } from "./engine";
export { generateProblemFingerprint, normalizeProblemText, extractProblemTokens, normalizeSimilarityScore, calculateOverlapScore, uniqueSorted, validateProblemDeduplicationCandidate } from "./helpers";
export { rankConsolidationGroups, rankProblemCandidates } from "./ranking";
export { collectCanonicalAudiences, collectCanonicalEvidenceFingerprints, collectCanonicalMarkets, collectCanonicalSignalLinks, createProblemAliasLinks } from "./relationships";
export { calculateSimilarityScore, compareAudienceContext, compareFeedbackSignals, compareMarketContext, comparePainSignals, comparePatternSignals, compareTrendSignals } from "./scoring";
export type * from "./types";
