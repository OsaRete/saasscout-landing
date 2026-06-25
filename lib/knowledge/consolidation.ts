import { calculateKnowledgeConfidence } from "./confidence";
import type {
  KnowledgeConsolidationCandidate,
  KnowledgeConsolidationResult,
  KnowledgeUpdateInput,
} from "./types";

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function latestIso(dates: string[]) {
  return dates.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));
}

export function prepareProblemConsolidationCandidates(
  updates: KnowledgeUpdateInput[]
): KnowledgeConsolidationCandidate[] {
  const grouped = new Map<string, KnowledgeUpdateInput[]>();

  for (const update of updates) {
    const key = update.problem.fingerprint;
    grouped.set(key, [...(grouped.get(key) || []), update]);
  }

  return Array.from(grouped.entries()).map(([fingerprint, group]) => {
    const latestEvidenceAt = latestIso(group.map((update) => update.evidence.capturedAt));
    const confidenceScore = calculateKnowledgeConfidence({
      evidenceCount: group.length,
      averageEvidenceConfidence: average(group.map((update) => update.evidence.confidenceScore)),
      averageSourceQuality: average(group.map((update) => update.source.qualityScore)),
      latestEvidenceAt,
    });

    return {
      fingerprint,
      normalizedTitle: group[0].problem.normalizedTitle,
      market: group[0].problem.market,
      audience: group[0].problem.audience,
      evidenceFingerprints: group.map((update) => update.evidence.fingerprint),
      evidenceCount: group.length,
      confidenceScore,
      lastSeenAt: latestEvidenceAt,
    };
  });
}

export function evaluateKnowledgeConsolidation(
  candidates: KnowledgeConsolidationCandidate[]
): KnowledgeConsolidationResult {
  const sorted = [...candidates].sort((a, b) => b.evidenceCount - a.evidenceCount);
  const canonical = sorted[0];

  if (!canonical) {
    return {
      canonicalFingerprint: "",
      candidates: [],
      mergedEvidenceCount: 0,
      confidenceScore: 0,
      relationshipStrength: 0,
      shouldMerge: false,
      reasons: ["No consolidation candidates were provided."],
    };
  }

  const mergedEvidenceCount = sorted.reduce((sum, candidate) => sum + candidate.evidenceCount, 0);
  const confidenceScore = average(sorted.map((candidate) => candidate.confidenceScore));
  const sameContext = sorted.every(
    (candidate) => candidate.market === canonical.market && candidate.audience === canonical.audience
  );
  const relationshipStrength = Math.min(10, mergedEvidenceCount + (sameContext ? 2 : 0));

  return {
    canonicalFingerprint: canonical.fingerprint,
    candidates: sorted,
    mergedEvidenceCount,
    confidenceScore: Number(confidenceScore.toFixed(1)),
    relationshipStrength,
    shouldMerge: sorted.length > 1 && sameContext && relationshipStrength >= 4,
    reasons: [
      sameContext
        ? "Candidates share the same market and audience context."
        : "Candidates require semantic review because their market or audience context differs.",
      `${mergedEvidenceCount} evidence item(s) support this consolidation set.`,
    ],
  };
}
