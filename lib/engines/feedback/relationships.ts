import type { Evidence } from "../../evidence";
import { generateKnowledgeId } from "../../knowledge/fingerprint";
import type { KnowledgeProblem, KnowledgeRelationship } from "../../knowledge";
import type { ConfidenceCandidate } from "../confidence";
import type { FounderOpportunityFit } from "../founder";
import type { MonetizationCandidate } from "../monetization";
import type { OpportunityCandidate } from "../opportunity";
import type { PainCandidate } from "../pain";
import type { PatternCandidate } from "../pattern";
import type { TrendCandidate } from "../trend";
import type { FeedbackContext, FeedbackEvent } from "./types";

const emptyContext = (): FeedbackContext => ({ market: null, audience: null, nicheCategory: null, evidenceFingerprints: [], knowledgeProblemIds: [], relatedRelationshipIds: [], painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [], opportunityCandidateIds: [], monetizationCandidateIds: [], founderFitCandidateIds: [], confidenceCandidateIds: [] });
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

/** Creates a stable relationship id for future graph edges from feedback events to SaaSScout intelligence objects. */
export function createFeedbackRelationshipId(eventId: string, targetId: string) { return generateKnowledgeId("fr", eventId, targetId); }

/** Merges feedback contexts without coupling the engine to storage or orchestration details. */
export function mergeFeedbackContexts(...contexts: Array<Partial<FeedbackContext> | undefined>): FeedbackContext {
  const merged = emptyContext();
  for (const context of contexts) {
    if (!context) continue;
    merged.market ||= context.market || null;
    merged.audience ||= context.audience || null;
    merged.nicheCategory ||= context.nicheCategory || null;
    merged.evidenceFingerprints.push(...(context.evidenceFingerprints || []));
    merged.knowledgeProblemIds.push(...(context.knowledgeProblemIds || []));
    merged.relatedRelationshipIds.push(...(context.relatedRelationshipIds || []));
    merged.painCandidateIds.push(...(context.painCandidateIds || []));
    merged.patternCandidateIds.push(...(context.patternCandidateIds || []));
    merged.trendCandidateIds.push(...(context.trendCandidateIds || []));
    merged.opportunityCandidateIds.push(...(context.opportunityCandidateIds || []));
    merged.monetizationCandidateIds.push(...(context.monetizationCandidateIds || []));
    merged.founderFitCandidateIds.push(...(context.founderFitCandidateIds || []));
    merged.confidenceCandidateIds.push(...(context.confidenceCandidateIds || []));
  }
  return { ...merged, evidenceFingerprints: unique(merged.evidenceFingerprints), knowledgeProblemIds: unique(merged.knowledgeProblemIds), relatedRelationshipIds: unique(merged.relatedRelationshipIds), painCandidateIds: unique(merged.painCandidateIds), patternCandidateIds: unique(merged.patternCandidateIds), trendCandidateIds: unique(merged.trendCandidateIds), opportunityCandidateIds: unique(merged.opportunityCandidateIds), monetizationCandidateIds: unique(merged.monetizationCandidateIds), founderFitCandidateIds: unique(merged.founderFitCandidateIds), confidenceCandidateIds: unique(merged.confidenceCandidateIds) };
}

/** Connects feedback events to Evidence Layer fingerprints so outcomes can later improve deduplication and source quality. */
export function relateFeedbackToEvidence(event: FeedbackEvent, evidence: Evidence[]) { return evidence.filter((item) => event.context.evidenceFingerprints.includes(item.deduplicationFingerprint)); }

/** Connects feedback events to Knowledge Layer problems so validated outcomes can strengthen accumulated knowledge. */
export function relateFeedbackToKnowledge(event: FeedbackEvent, problems: KnowledgeProblem[]) { return problems.filter((problem) => event.context.knowledgeProblemIds.includes(problem.id)); }

/** Connects feedback events to Knowledge relationships so future graph learning can reinforce or weaken edges. */
export function relateFeedbackToRelationships(event: FeedbackEvent, relationships: KnowledgeRelationship[]) { return relationships.filter((relationship) => event.context.relatedRelationshipIds.includes(relationship.id)); }

/** Builds a feedback context from upstream engine candidates while preserving modular engine boundaries. */
export function createFeedbackContext(input: { evidence?: Evidence[]; knowledgeProblems?: KnowledgeProblem[]; relationships?: KnowledgeRelationship[]; painCandidates?: PainCandidate[]; patternCandidates?: PatternCandidate[]; trendCandidates?: TrendCandidate[]; opportunityCandidates?: OpportunityCandidate[]; monetizationCandidates?: MonetizationCandidate[]; founderFits?: FounderOpportunityFit[]; confidenceCandidates?: ConfidenceCandidate[] }): FeedbackContext {
  return mergeFeedbackContexts(
    { evidenceFingerprints: (input.evidence || []).map((item) => item.deduplicationFingerprint), knowledgeProblemIds: (input.knowledgeProblems || []).map((item) => item.id), relatedRelationshipIds: (input.relationships || []).map((item) => item.id), painCandidateIds: (input.painCandidates || []).map((item) => item.id), patternCandidateIds: (input.patternCandidates || []).map((item) => item.id), trendCandidateIds: (input.trendCandidates || []).map((item) => item.id), opportunityCandidateIds: (input.opportunityCandidates || []).map((item) => item.id), monetizationCandidateIds: (input.monetizationCandidates || []).map((item) => item.id), founderFitCandidateIds: (input.founderFits || []).map((item) => item.id), confidenceCandidateIds: (input.confidenceCandidates || []).map((item) => item.id) },
    ...(input.painCandidates || []).map((candidate) => ({ market: candidate.context.market, audience: candidate.context.audience, nicheCategory: candidate.context.nicheCategory, knowledgeProblemIds: [candidate.context.knowledgeProblemId].filter(Boolean) as string[], relatedRelationshipIds: candidate.context.relatedRelationshipIds, evidenceFingerprints: candidate.evidence.map((item) => item.fingerprint) })),
    ...(input.opportunityCandidates || []).map((candidate) => ({ market: candidate.context.market, audience: candidate.context.audience, nicheCategory: candidate.context.nicheCategory, evidenceFingerprints: candidate.evidence.map((item) => item.fingerprint), knowledgeProblemIds: candidate.context.knowledgeProblemIds, relatedRelationshipIds: candidate.context.relatedRelationshipIds, painCandidateIds: candidate.context.painCandidateIds, patternCandidateIds: candidate.context.patternCandidateIds, trendCandidateIds: candidate.context.trendCandidateIds })),
    ...(input.monetizationCandidates || []).map((candidate) => ({ market: candidate.context.market, audience: candidate.context.audience, nicheCategory: candidate.context.nicheCategory, evidenceFingerprints: candidate.context.evidenceFingerprints, knowledgeProblemIds: candidate.context.knowledgeProblemIds, relatedRelationshipIds: candidate.context.relatedRelationshipIds, opportunityCandidateIds: candidate.context.opportunityCandidateIds, painCandidateIds: candidate.context.painCandidateIds, patternCandidateIds: candidate.context.patternCandidateIds, trendCandidateIds: candidate.context.trendCandidateIds })),
    ...(input.confidenceCandidates || []).map((candidate) => ({ market: candidate.context.market, audience: candidate.context.audience, nicheCategory: candidate.context.nicheCategory, evidenceFingerprints: candidate.context.evidenceFingerprints, knowledgeProblemIds: candidate.context.knowledgeProblemIds, relatedRelationshipIds: candidate.context.relatedRelationshipIds, painCandidateIds: candidate.context.painCandidateIds, patternCandidateIds: candidate.context.patternCandidateIds, trendCandidateIds: candidate.context.trendCandidateIds, opportunityCandidateIds: candidate.context.opportunityCandidateIds, monetizationCandidateIds: candidate.context.monetizationCandidateIds, founderFitCandidateIds: candidate.context.founderFitCandidateIds }))
  );
}
