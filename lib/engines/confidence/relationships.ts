import type { Evidence } from "../../evidence";
import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import type { FounderOpportunityFit } from "../founder";
import type { MonetizationCandidate } from "../monetization";
import type { OpportunityCandidate } from "../opportunity";
import type { PainCandidate } from "../pain";
import type { PatternCandidate } from "../pattern";
import type { TrendCandidate } from "../trend";
import type { ConfidenceCandidateKind, ConfidenceContext, ConfidenceEvidence } from "./types";
import { normalizeConfidenceScore } from "./scoring";

/** Converts raw Evidence Layer records into confidence evidence that preserves provenance without storage coupling. */
export function confidenceEvidenceFromEvidence(evidence: Evidence): ConfidenceEvidence {
  return { fingerprint: evidence.deduplicationFingerprint, sourceType: evidence.sourceType, sourceName: evidence.sourceName, sourceUrl: evidence.sourceUrl, capturedAt: evidence.capturedAt, claim: evidence.extractedClaim || evidence.capturedText, confidenceScore: normalizeConfidenceScore(evidence.confidenceScore, 5), sourceQualityScore: normalizeConfidenceScore(evidence.sourceQualityScore, 5), market: evidence.market, audience: evidence.audience, nicheCategory: evidence.nicheCategory };
}

/** Deduplicates confidence evidence so repeated upstream candidates cannot inflate trust scores. */
export function dedupeConfidenceEvidence(evidence: ConfidenceEvidence[]) {
  const map = new Map<string, ConfidenceEvidence>();
  for (const item of evidence) map.set(item.fingerprint, item);
  return Array.from(map.values());
}

/** Creates a relationship id for future graph edges between confidence candidates and supported intelligence objects. */
export function createConfidenceRelationshipId(kind: ConfidenceCandidateKind, candidateId: string, targetId: string) {
  return generateKnowledgeId("cr", kind, candidateId, targetId);
}

/** Builds a normalized confidence context linking evidence, knowledge, and every upstream intelligence engine. */
export function createConfidenceContext(input: { primaryClaim: string; evidence: ConfidenceEvidence[]; knowledgeProblemIds?: string[]; relatedRelationshipIds?: string[]; painCandidateIds?: string[]; patternCandidateIds?: string[]; trendCandidateIds?: string[]; opportunityCandidateIds?: string[]; monetizationCandidateIds?: string[]; founderFitCandidateIds?: string[] }): ConfidenceContext {
  const firstEvidence = input.evidence[0];
  return { market: firstEvidence?.market || null, audience: firstEvidence?.audience || null, nicheCategory: firstEvidence?.nicheCategory || null, primaryClaim: input.primaryClaim, evidenceFingerprints: input.evidence.map((item) => item.fingerprint), knowledgeProblemIds: input.knowledgeProblemIds || [], relatedRelationshipIds: input.relatedRelationshipIds || [], painCandidateIds: input.painCandidateIds || [], patternCandidateIds: input.patternCandidateIds || [], trendCandidateIds: input.trendCandidateIds || [], opportunityCandidateIds: input.opportunityCandidateIds || [], monetizationCandidateIds: input.monetizationCandidateIds || [], founderFitCandidateIds: input.founderFitCandidateIds || [] };
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

/** Extracts reusable confidence evidence from any upstream candidate that carries evidence-backed intelligence. */
export function evidenceFromUpstreamCandidate(candidate: PainCandidate | PatternCandidate | TrendCandidate | OpportunityCandidate | MonetizationCandidate | FounderOpportunityFit): ConfidenceEvidence[] {
  const source = "candidate" in candidate ? candidate.candidate.opportunityCandidate.evidence : candidate.evidence;
  return dedupeConfidenceEvidence(source.map((item) => ({ fingerprint: item.fingerprint, sourceType: item.sourceType, sourceName: item.sourceName, sourceUrl: item.sourceUrl, capturedAt: item.capturedAt, claim: item.claim, confidenceScore: normalizeConfidenceScore(item.confidenceScore, 5), sourceQualityScore: normalizeConfidenceScore(item.sourceQualityScore, 5), market: nullableText("market" in item ? item.market : null), audience: nullableText("audience" in item ? item.audience : null), nicheCategory: nullableText("nicheCategory" in item ? item.nicheCategory : null) })));
}

/** Builds a stable title for confidence candidates derived from heterogeneous engine outputs. */
export function confidenceTitleForCandidate(candidate: PainCandidate | PatternCandidate | TrendCandidate | OpportunityCandidate | MonetizationCandidate | FounderOpportunityFit) {
  return "title" in candidate ? candidate.title : candidate.candidate.title;
}

/** Normalizes confidence titles so ranking, grouping, and future graph relationships remain deterministic. */
export function normalizeConfidenceTitle(title: string | null | undefined) {
  return normalizeKnowledgeText(title || "unknown confidence candidate");
}
