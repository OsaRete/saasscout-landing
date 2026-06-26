import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import type { MonetizationContext, MonetizationEvidence } from "./types";

/** Creates stable relationship identifiers linking monetization intelligence to upstream SaaSScout knowledge. */
export function createMonetizationRelationshipId(...parts: Array<string | null | undefined>) {
  return generateKnowledgeId("mr", ...parts);
}

/** Deduplicates monetization evidence by fingerprint so scoring rewards breadth instead of repeated copies. */
export function dedupeMonetizationEvidence(evidence: MonetizationEvidence[]) {
  const byFingerprint = new Map<string, MonetizationEvidence>();
  for (const item of evidence) byFingerprint.set(item.fingerprint, item);
  return Array.from(byFingerprint.values()).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

/** Builds reusable context connecting monetization candidates to opportunities, pains, trends, evidence, and knowledge. */
export function createMonetizationContext(input: { title: string; evidence: MonetizationEvidence[]; opportunityCandidateIds?: string[]; painCandidateIds?: string[]; patternCandidateIds?: string[]; trendCandidateIds?: string[]; knowledgeProblemIds?: string[]; relatedRelationshipIds?: string[] }): MonetizationContext {
  const firstEvidence = input.evidence[0];
  return {
    market: firstEvidence?.market || null,
    audience: firstEvidence?.audience || null,
    nicheCategory: firstEvidence?.nicheCategory || null,
    primaryProblem: normalizeKnowledgeText(input.title),
    opportunityCandidateIds: Array.from(new Set(input.opportunityCandidateIds || [])).sort(),
    painCandidateIds: Array.from(new Set(input.painCandidateIds || [])).sort(),
    patternCandidateIds: Array.from(new Set(input.patternCandidateIds || [])).sort(),
    trendCandidateIds: Array.from(new Set(input.trendCandidateIds || [])).sort(),
    knowledgeProblemIds: Array.from(new Set(input.knowledgeProblemIds || [])).sort(),
    evidenceFingerprints: Array.from(new Set(input.evidence.map((item) => item.fingerprint))).sort(),
    relatedRelationshipIds: Array.from(new Set(input.relatedRelationshipIds || [])).sort(),
  };
}
