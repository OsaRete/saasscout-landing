import type { Evidence } from "../evidence";
import { calculateKnowledgeConfidence } from "./confidence";
import { generateKnowledgeProblemFingerprint, generateKnowledgeId, normalizeKnowledgeText } from "./fingerprint";
import { createKnowledgeRelationship, relationshipEntityId } from "./relationships";
import type { KnowledgeRelationship, KnowledgeUpdateInput } from "./types";

function scoreOrDefault(value: number | null, fallback = 0) {
  return value ?? fallback;
}

function problemTitleFromEvidence(evidence: Evidence) {
  return evidence.detectedProblemTitle || evidence.extractedClaim || evidence.capturedText.slice(0, 120);
}

export function evidenceToKnowledgeUpdateInput(evidence: Evidence): KnowledgeUpdateInput {
  const title = problemTitleFromEvidence(evidence);
  const normalizedTitle = normalizeKnowledgeText(title);
  const fingerprint = generateKnowledgeProblemFingerprint({
    title,
    market: evidence.market,
    audience: evidence.audience,
  });
  const sourceId = generateKnowledgeId(
    "ks",
    evidence.sourceType,
    evidence.sourceUrl,
    evidence.sourceName,
    evidence.deduplicationFingerprint
  );
  const problemId = generateKnowledgeId("kp", fingerprint);
  const evidenceConfidence = scoreOrDefault(evidence.confidenceScore, 5);
  const sourceQuality = scoreOrDefault(evidence.sourceQualityScore, 5);
  const confidenceScore = calculateKnowledgeConfidence({
    evidenceCount: 1,
    averageEvidenceConfidence: evidenceConfidence,
    averageSourceQuality: sourceQuality,
    latestEvidenceAt: evidence.capturedAt,
  });
  const relationships: KnowledgeRelationship[] = [
    createKnowledgeRelationship({
      from: { type: "problem", id: problemId },
      to: { type: "source", id: sourceId },
      relationshipType: "supported_by_source",
      strength: sourceQuality,
      evidenceCount: 1,
      confidenceScore,
      timestamp: evidence.capturedAt,
      metadata: { evidenceFingerprint: evidence.deduplicationFingerprint },
    }),
  ];

  if (evidence.market) {
    relationships.push(
      createKnowledgeRelationship({
        from: { type: "problem", id: problemId },
        to: { type: "market", id: relationshipEntityId("market", evidence.market) },
        relationshipType: "appears_in_market",
        strength: scoreOrDefault(evidence.frequencySignal, 5),
        evidenceCount: 1,
        confidenceScore,
        timestamp: evidence.capturedAt,
      })
    );
  }

  if (evidence.audience) {
    relationships.push(
      createKnowledgeRelationship({
        from: { type: "problem", id: problemId },
        to: { type: "audience", id: relationshipEntityId("audience", evidence.audience) },
        relationshipType: "affects_audience",
        strength: scoreOrDefault(evidence.painIntensity, 5),
        evidenceCount: 1,
        confidenceScore,
        timestamp: evidence.capturedAt,
      })
    );
  }

  return {
    problem: {
      title,
      normalizedTitle,
      fingerprint,
      market: evidence.market,
      audience: evidence.audience,
      nicheCategory: evidence.nicheCategory,
      description: evidence.extractedClaim,
    },
    source: {
      id: sourceId,
      sourceType: evidence.sourceType,
      name: evidence.sourceName,
      url: evidence.sourceUrl,
      qualityScore: sourceQuality,
      capturedAt: evidence.capturedAt,
      evidenceFingerprint: evidence.deduplicationFingerprint,
      provenance: evidence.provenance,
    },
    evidence: {
      fingerprint: evidence.deduplicationFingerprint,
      capturedAt: evidence.capturedAt,
      confidenceScore: evidenceConfidence,
      painIntensity: scoreOrDefault(evidence.painIntensity),
      frequencySignal: scoreOrDefault(evidence.frequencySignal),
      buyingIntentSignal: scoreOrDefault(evidence.buyingIntentSignal),
    },
    relationships,
  };
}
