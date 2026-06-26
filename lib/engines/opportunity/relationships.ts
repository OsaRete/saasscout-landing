import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import type { OpportunityContext, OpportunityEvidence, OpportunityMarketContext } from "./types";

/** Creates a stable relationship id connecting opportunity candidates to upstream engine and knowledge references. */
export function createOpportunityRelationshipId(...parts: Array<string | null | undefined>) {
  return generateKnowledgeId("or", ...parts);
}

/** Deduplicates evidence by fingerprint so opportunities preserve provenance without inflating scores. */
export function dedupeOpportunityEvidence(evidence: OpportunityEvidence[]) {
  const byFingerprint = new Map<string, OpportunityEvidence>();
  for (const item of evidence) byFingerprint.set(item.fingerprint, item);
  return Array.from(byFingerprint.values()).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

/** Builds reusable opportunity context linking candidates back to pain, pattern, trend, evidence, and knowledge references. */
export function createOpportunityContext(input: {
  title: string;
  evidence: OpportunityEvidence[];
  painCandidateIds?: string[];
  patternCandidateIds?: string[];
  trendCandidateIds?: string[];
  knowledgeProblemIds?: string[];
  relatedRelationshipIds?: string[];
}): OpportunityContext {
  const firstEvidence = input.evidence[0];
  return {
    market: firstEvidence?.market || null,
    audience: firstEvidence?.audience || null,
    nicheCategory: firstEvidence?.nicheCategory || null,
    primaryTheme: normalizeKnowledgeText(input.title),
    painCandidateIds: Array.from(new Set(input.painCandidateIds || [])).sort(),
    patternCandidateIds: Array.from(new Set(input.patternCandidateIds || [])).sort(),
    trendCandidateIds: Array.from(new Set(input.trendCandidateIds || [])).sort(),
    knowledgeProblemIds: Array.from(new Set(input.knowledgeProblemIds || [])).sort(),
    relatedRelationshipIds: Array.from(new Set(input.relatedRelationshipIds || [])).sort(),
  };
}

/** Creates market context that future monetization and founder-match engines can enrich without re-reading raw sources. */
export function createOpportunityMarketContext(input: {
  title: string;
  evidence: OpportunityEvidence[];
  existingSolutionSignals?: string[];
  underservedSignals?: string[];
}): OpportunityMarketContext {
  const firstEvidence = input.evidence[0];
  return {
    market: firstEvidence?.market || null,
    audience: firstEvidence?.audience || null,
    nicheCategory: firstEvidence?.nicheCategory || null,
    primaryProblem: input.title,
    existingSolutionSignals: Array.from(new Set(input.existingSolutionSignals || [])).sort(),
    underservedSignals: Array.from(new Set(input.underservedSignals || [])).sort(),
  };
}
