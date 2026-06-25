import { generateKnowledgeId, normalizeKnowledgeText } from "./fingerprint";
import type {
  KnowledgeEntityType,
  KnowledgeRelationship,
  KnowledgeRelationshipType,
} from "./types";

type RelationshipEndpoint = {
  type: KnowledgeEntityType;
  id: string;
};

export function createKnowledgeRelationship({
  from,
  to,
  relationshipType,
  strength,
  evidenceCount,
  confidenceScore,
  timestamp = new Date().toISOString(),
  metadata,
}: {
  from: RelationshipEndpoint;
  to: RelationshipEndpoint;
  relationshipType: KnowledgeRelationshipType;
  strength: number;
  evidenceCount: number;
  confidenceScore: number;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}): KnowledgeRelationship {
  return {
    id: generateKnowledgeId("kr", from.type, from.id, relationshipType, to.type, to.id),
    from,
    to,
    relationshipType,
    strength: Math.min(10, Math.max(0, Number(strength.toFixed(1)))),
    evidenceCount: Math.max(0, Math.floor(evidenceCount)),
    confidenceScore: Math.min(10, Math.max(0, Number(confidenceScore.toFixed(1)))),
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata,
  };
}

export function relationshipEntityId(type: KnowledgeEntityType, value: string) {
  return generateKnowledgeId(type, normalizeKnowledgeText(value));
}
