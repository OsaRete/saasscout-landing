import { generateKnowledgeId } from "../fingerprint";
import { extractProblemTokens, generateProblemFingerprint, normalizeProblemText, uniqueSorted } from "./helpers";
import { collectCanonicalEvidenceFingerprints } from "./relationships";
import { rankConsolidationGroups, rankProblemCandidates } from "./ranking";
import { calculateSimilarityScore, compareAudienceContext, compareFeedbackSignals, compareMarketContext, comparePainSignals, comparePatternSignals, compareTrendSignals } from "./scoring";
import type { ProblemAlias, ProblemCanonicalIdentity, ProblemConsolidationDecision, ProblemConsolidationGroup, ProblemDeduplicationCandidate, ProblemDeduplicationInput, ProblemDeduplicationResult, ProblemSimilarityScore } from "./types";

/** Provides deterministic semantic problem deduplication for the Knowledge Layer without invoking AI providers. */
export class ProblemDeduplicationEngine {
  /** Collects reusable candidates from evidence, knowledge problems and engine outputs before future persistence occurs. */
  collectProblemCandidates(input: ProblemDeduplicationInput): ProblemDeduplicationCandidate[] {
    const candidates: ProblemDeduplicationCandidate[] = [];
    for (const problem of input.knownProblems || []) candidates.push(this.createCandidate(problem.id, problem.title, problem.market, problem.audience, problem.nicheCategory, problem.description, problem.sourceIds, problem.confidenceScore, problem.lastSeenAt, problem.id));
    for (const evidence of input.evidence || []) if (evidence.detectedProblemTitle) candidates.push(this.createCandidate(evidence.deduplicationFingerprint, evidence.detectedProblemTitle, evidence.market, evidence.audience, evidence.nicheCategory, evidence.extractedClaim || evidence.capturedText, [evidence.deduplicationFingerprint], evidence.confidenceScore || 0, evidence.capturedAt));
    for (const pain of input.painCandidates || []) candidates.push({ ...this.createCandidate(pain.id, pain.title, pain.context.market, pain.context.audience, pain.context.nicheCategory, null, pain.evidence.map((item) => item.fingerprint), pain.score.confidenceScore, null), painCandidateIds: [pain.id] });
    for (const pattern of input.patternCandidates || []) candidates.push({ ...this.createCandidate(pattern.id, pattern.title, pattern.context.markets[0] || null, pattern.context.audiences[0] || null, pattern.context.niches[0] || null, null, pattern.evidence.map((item) => item.fingerprint), pattern.score.confidenceScore, null), patternCandidateIds: [pattern.id], painCandidateIds: pattern.context.painCandidateIds });
    for (const trend of input.trendCandidates || []) candidates.push({ ...this.createCandidate(trend.id, trend.title, trend.context.market, trend.context.audience, trend.context.nicheCategory, null, trend.evidence.map((item) => item.fingerprint), trend.score.confidenceScore, null), trendCandidateIds: [trend.id], painCandidateIds: trend.context.painCandidateIds, patternCandidateIds: trend.context.patternCandidateIds });
    return rankProblemCandidates(candidates);
  }

  /** Normalizes problem text for stable comparison across source formats and user wording. */
  normalizeProblemText(value: string | null | undefined) { return normalizeProblemText(value); }
  /** Generates deterministic fingerprints for canonical problem identity candidates. */
  generateProblemFingerprint(input: { title: string | null; market?: string | null; audience?: string | null }) { return generateProblemFingerprint(input); }
  /** Extracts comparable tokens for semantic matching that avoids exact-title-only consolidation. */
  extractProblemTokens(value: string | null | undefined) { return extractProblemTokens(value); }
  /** Compares all deterministic signals between two problem candidates. */
  compareProblemSimilarity(a: ProblemDeduplicationCandidate, b: ProblemDeduplicationCandidate) { return calculateSimilarityScore(a, b); }
  /** Compares market context for future Knowledge Layer consolidation safeguards. */
  compareMarketContext = compareMarketContext;
  /** Compares audience context for future Knowledge Layer consolidation safeguards. */
  compareAudienceContext = compareAudienceContext;
  /** Compares Pain Engine relationships for semantic consolidation. */
  comparePainSignals = comparePainSignals;
  /** Compares Pattern Engine relationships for semantic consolidation. */
  comparePatternSignals = comparePatternSignals;
  /** Compares Trend Engine relationships for semantic consolidation. */
  compareTrendSignals = compareTrendSignals;
  /** Compares Feedback Engine relationships for semantic consolidation. */
  compareFeedbackSignals = compareFeedbackSignals;
  /** Calculates the final deterministic similarity score between two candidates. */
  calculateSimilarityScore = calculateSimilarityScore;

  /** Assigns a conservative consolidation decision for future orchestrators to persist or review. */
  assignConsolidationDecision(group: ProblemConsolidationGroup): ProblemConsolidationDecision {
    const score = Math.max(0, ...group.similarityScores.map((item) => item.totalScore));
    const decision = score >= 8 ? "merge" : score >= 6.5 ? "link" : score >= 4.5 ? "review" : "separate";
    return { groupId: group.id, decision, score, rationale: [`Highest deterministic similarity score is ${score}.`, `${group.evidenceFingerprints.length} evidence fingerprint(s) support this group.`] };
  }

  /** Groups similar problem candidates so future Knowledge services can consolidate aliases around canonical identities. */
  groupSimilarProblems(candidates: ProblemDeduplicationCandidate[]): ProblemConsolidationGroup[] {
    const visited = new Set<string>();
    const groups: ProblemConsolidationGroup[] = [];
    for (const candidate of candidates) {
      if (visited.has(candidate.id)) continue;
      const members = [candidate];
      const scores: ProblemSimilarityScore[] = [];
      for (const other of candidates) {
        if (candidate.id === other.id || visited.has(other.id)) continue;
        const score = this.compareProblemSimilarity(candidate, other);
        if (score.totalScore >= 6.5) { members.push(other); scores.push(score); }
      }
      members.forEach((member) => visited.add(member.id));
      const ranked = rankProblemCandidates(members);
      const canonicalCandidate = ranked[0];
      const aliases: ProblemAlias[] = ranked.slice(1).map((member) => ({ id: generateKnowledgeId("problem_alias", canonicalCandidate.id, member.id), canonicalId: canonicalCandidate.id, title: member.title, normalizedTitle: member.normalizedTitle, fingerprint: member.fingerprint, evidenceFingerprints: member.evidenceFingerprints, similarityScore: scores.find((score) => score.candidateBId === member.id || score.candidateAId === member.id)?.totalScore || 0, createdFromCandidateId: member.id }));
      const canonical: ProblemCanonicalIdentity = { id: canonicalCandidate.id, title: canonicalCandidate.title, normalizedTitle: canonicalCandidate.normalizedTitle, fingerprint: canonicalCandidate.fingerprint, market: canonicalCandidate.market, audience: canonicalCandidate.audience, nicheCategory: canonicalCandidate.nicheCategory, evidenceFingerprints: collectCanonicalEvidenceFingerprints(ranked), aliases, confidenceScore: canonicalCandidate.confidenceScore };
      groups.push({ id: generateKnowledgeId("problem_group", canonical.id, ...ranked.map((item) => item.id)), canonical, candidates: ranked, aliases, similarityScores: scores, evidenceFingerprints: canonical.evidenceFingerprints });
    }
    return rankConsolidationGroups(groups);
  }

  /** Produces a complete deduplication result for future Knowledge Layer orchestrators without changing current product behavior. */
  produceDeduplicationResult(input: ProblemDeduplicationInput): ProblemDeduplicationResult {
    const createdAt = input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString();
    const candidates = this.collectProblemCandidates(input);
    const groups = this.groupSimilarProblems(candidates);
    const decisions = groups.map((group) => this.assignConsolidationDecision(group));
    return { runId: input.runId || generateKnowledgeId("problem_dedup_run", createdAt), createdAt, candidates, groups, decisions, ungroupedCandidates: groups.filter((group) => group.candidates.length === 1).flatMap((group) => group.candidates), warnings: [], summary: { candidateCount: candidates.length, groupCount: groups.length, aliasCount: groups.reduce((sum, group) => sum + group.aliases.length, 0), mergeDecisionCount: decisions.filter((decision) => decision.decision === "merge").length, reviewDecisionCount: decisions.filter((decision) => decision.decision === "review").length } };
  }

  private createCandidate(idSeed: string, title: string, market: string | null, audience: string | null, nicheCategory: string | null, description: string | null, evidenceFingerprints: string[], confidenceScore: number, lastSeenAt: string | null, sourceProblemId: string | null = null): ProblemDeduplicationCandidate {
    const normalizedTitle = this.normalizeProblemText(title);
    const fingerprint = this.generateProblemFingerprint({ title, market, audience });
    return { id: generateKnowledgeId("problem_candidate", idSeed, title, market, audience), title, normalizedTitle, fingerprint, tokens: this.extractProblemTokens(`${title} ${description || ""}`), market, audience, nicheCategory, description, evidenceFingerprints: uniqueSorted(evidenceFingerprints), sourceProblemId, painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [], opportunityCandidateIds: [], confidenceCandidateIds: [], feedbackEventIds: [], confidenceScore, lastSeenAt };
  }
}
