import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import type { MonetizationCandidate } from "../monetization";
import type { OpportunityCandidate } from "../opportunity";
import type { PainCandidate } from "../pain";
import type { PatternCandidate } from "../pattern";
import type { TrendCandidate } from "../trend";
import type { FounderContext, FounderFitCandidate, FounderProfile } from "./types";

/** Creates stable relationship identifiers linking founder fit intelligence to SaaSScout-owned knowledge. */
export function createFounderRelationshipId(...parts: Array<string | null | undefined>) {
  return generateKnowledgeId("fr", ...parts);
}

/** Builds reusable founder context so future orchestrators can personalize decisions without reading UI state. */
export function createFounderContext(profile: FounderProfile): FounderContext {
  return {
    founderProfileId: profile.id,
    normalizedSkills: profile.skills.map(normalizeKnowledgeText).filter(Boolean).sort(),
    normalizedExperience: profile.experience.map(normalizeKnowledgeText).filter(Boolean).sort(),
    normalizedInterests: profile.interests.map(normalizeKnowledgeText).filter(Boolean).sort(),
    capabilityIds: (profile.capabilities || []).map((item) => item.id).sort(),
    constraintIds: (profile.constraints || []).map((item) => item.id).sort(),
    goalIds: (profile.goals || []).map((item) => item.id).sort(),
  };
}

/** Finds the monetization candidate that corresponds to an opportunity candidate using deterministic relationship references. */
export function findRelatedMonetizationCandidate(opportunity: OpportunityCandidate, monetizationCandidates: MonetizationCandidate[] = []) {
  return monetizationCandidates.find((candidate) => candidate.context.opportunityCandidateIds.includes(opportunity.id) || candidate.normalizedTitle === opportunity.normalizedTitle) || null;
}

/** Creates a Founder Fit Candidate by connecting opportunities to monetization, pain, pattern, trend, evidence, and knowledge references. */
export function createFounderFitCandidate(input: { opportunity: OpportunityCandidate; monetizationCandidates?: MonetizationCandidate[]; painCandidates?: PainCandidate[]; patternCandidates?: PatternCandidate[]; trendCandidates?: TrendCandidate[] }): FounderFitCandidate {
  const monetizationCandidate = findRelatedMonetizationCandidate(input.opportunity, input.monetizationCandidates || []);
  const painIds = new Set(input.opportunity.context.painCandidateIds);
  const patternIds = new Set(input.opportunity.context.patternCandidateIds);
  const trendIds = new Set(input.opportunity.context.trendCandidateIds);
  const evidenceFingerprints = new Set([...input.opportunity.evidence.map((item) => item.fingerprint), ...(monetizationCandidate?.context.evidenceFingerprints || [])]);
  return {
    id: createFounderRelationshipId(input.opportunity.id, monetizationCandidate?.id),
    title: input.opportunity.title,
    normalizedTitle: input.opportunity.normalizedTitle,
    opportunityCandidate: input.opportunity,
    monetizationCandidate,
    relatedPainCandidates: (input.painCandidates || []).filter((candidate) => painIds.has(candidate.id)),
    relatedPatternCandidates: (input.patternCandidates || []).filter((candidate) => patternIds.has(candidate.id)),
    relatedTrendCandidates: (input.trendCandidates || []).filter((candidate) => trendIds.has(candidate.id)),
    evidenceFingerprints: Array.from(evidenceFingerprints).sort(),
    knowledgeProblemIds: Array.from(new Set([...(input.opportunity.context.knowledgeProblemIds || []), ...(monetizationCandidate?.context.knowledgeProblemIds || [])])).sort(),
    relatedRelationshipIds: Array.from(new Set([...(input.opportunity.context.relatedRelationshipIds || []), ...(monetizationCandidate?.context.relatedRelationshipIds || [])])).sort(),
  };
}

/** Ranks normalized terms by overlap so founder traits can be compared to opportunity context deterministically. */
export function calculateTermOverlapScore(founderTerms: string[], candidateTerms: string[]) {
  const founder = new Set(founderTerms.map(normalizeKnowledgeText).filter(Boolean));
  const candidate = Array.from(new Set(candidateTerms.map(normalizeKnowledgeText).filter(Boolean)));
  if (founder.size === 0 || candidate.length === 0) return 0;
  const matches = candidate.filter((term) => founder.has(term) || Array.from(founder).some((founderTerm) => founderTerm.includes(term) || term.includes(founderTerm))).length;
  return Math.min(10, (matches / candidate.length) * 10);
}
