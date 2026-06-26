import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import type { PatternRelationship, PatternRelationshipType } from "./types";
import { normalizePatternScore } from "./scoring";

/** Creates a deterministic pattern relationship that future Knowledge Layer integrations can persist or enrich. */
export function createPatternRelationship(input: {
  relationshipType: PatternRelationshipType;
  label: string;
  strength: number;
  evidenceCount: number;
  confidenceScore: number;
  relatedPainCandidateIds?: string[];
  relatedKnowledgeRelationshipIds?: string[];
}): PatternRelationship {
  const normalizedLabel = normalizeKnowledgeText(input.label);
  return {
    id: generateKnowledgeId("pr", input.relationshipType, normalizedLabel, input.relatedPainCandidateIds?.join("|")),
    relationshipType: input.relationshipType,
    label: input.label,
    strength: normalizePatternScore(input.strength),
    evidenceCount: Math.max(0, Math.floor(input.evidenceCount)),
    confidenceScore: normalizePatternScore(input.confidenceScore),
    relatedPainCandidateIds: input.relatedPainCandidateIds || [],
    relatedKnowledgeRelationshipIds: input.relatedKnowledgeRelationshipIds || [],
  };
}

/** Extracts normalized reusable tokens from market, audience, niche, and workflow fields for pattern grouping. */
export function uniqueNormalizedValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeKnowledgeText).filter(Boolean))).sort();
}

/** Measures overlap between two deterministic token sets so engines can relate patterns without semantic AI calls. */
export function calculateTokenOverlap(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((value) => rightSet.has(value)).length;
  return normalizePatternScore((overlap / Math.max(left.length, right.length)) * 10);
}
