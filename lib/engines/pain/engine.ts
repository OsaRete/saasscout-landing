import type { Evidence } from "../../evidence";
import { evidenceToKnowledgeUpdateInput } from "../../knowledge";
import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import { rankPainCandidates as rankCandidates } from "./ranking";
import {
  averagePainScore,
  calculateCompositePainScore,
  frequencyFromScore,
  normalizePainScore,
  severityFromScore,
} from "./scoring";
import type { PainCandidate, PainDetectionInput, PainDetectionResult, PainEvidence, PainSignal } from "./types";
import { validatePainDetectionInput, validatePainDetectionResult } from "./validation";

function normalizeDetectedAt(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function evidenceTitle(evidence: Evidence) {
  return evidence.detectedProblemTitle || evidence.extractedClaim || evidence.capturedText.slice(0, 120);
}

function toPainEvidence(evidence: Evidence): PainEvidence {
  return {
    fingerprint: evidence.deduplicationFingerprint,
    sourceType: evidence.sourceType,
    sourceName: evidence.sourceName,
    sourceUrl: evidence.sourceUrl,
    capturedAt: evidence.capturedAt,
    claim: evidence.extractedClaim || evidence.capturedText,
    painIntensity: normalizePainScore(evidence.painIntensity),
    frequencySignal: normalizePainScore(evidence.frequencySignal),
    confidenceScore: normalizePainScore(evidence.confidenceScore, 5),
    sourceQualityScore: normalizePainScore(evidence.sourceQualityScore, 5),
  };
}

/**
 * Detects evidence-backed market pain without AI, storage side effects, prompts, routes, or UI coupling.
 * Future orchestrators can adopt this class as the reusable Pain Detection Engine in SaaSScout's engines layer.
 */
export class PainDetectionEngine {
  /** Collects normalized evidence into deterministic pain signals that preserve source provenance. */
  collectPainSignals(input: PainDetectionInput): PainSignal[] {
    const updates = input.knowledgeUpdates || input.evidence.map((evidence) => evidenceToKnowledgeUpdateInput(evidence));
    const grouped = this.groupEvidence(input.evidence);

    return Array.from(grouped.entries()).map(([key, evidenceGroup]) => {
      const firstEvidence = evidenceGroup[0];
      const update = updates.find((candidate) => candidate.evidence.fingerprint === firstEvidence.deduplicationFingerprint);
      const relatedRelationshipIds = (input.relationships || update?.relationships || []).map((relationship) => relationship.id);
      const painEvidence = evidenceGroup.map(toPainEvidence);
      const averagePainIntensity = averagePainScore(painEvidence.map((evidence) => evidence.painIntensity));
      const averageFrequencySignal = averagePainScore(painEvidence.map((evidence) => evidence.frequencySignal));
      const averageEvidenceConfidence = averagePainScore(painEvidence.map((evidence) => evidence.confidenceScore));
      const averageSourceQuality = averagePainScore(painEvidence.map((evidence) => evidence.sourceQualityScore));
      const title = evidenceTitle(firstEvidence);
      const knownProblem = input.knownProblems?.find((problem) => problem.fingerprint === update?.problem.fingerprint);

      return {
        id: generateKnowledgeId("ps", key),
        title,
        normalizedTitle: normalizeKnowledgeText(title),
        context: {
          market: firstEvidence.market,
          audience: firstEvidence.audience,
          nicheCategory: firstEvidence.nicheCategory,
          knowledgeProblemId: knownProblem?.id || null,
          relatedRelationshipIds,
        },
        evidence: painEvidence,
        severity: this.evaluateSeverity(averagePainIntensity),
        frequency: this.evaluateFrequency(averageFrequencySignal),
        averagePainIntensity,
        averageFrequencySignal,
        averageEvidenceConfidence,
        averageSourceQuality,
      };
    });
  }

  /** Groups evidence by normalized problem, market, and audience so pain candidates represent reusable knowledge. */
  groupEvidence(evidence: Evidence[]) {
    const grouped = new Map<string, Evidence[]>();
    for (const item of evidence) {
      const key = [normalizeKnowledgeText(evidenceTitle(item)), normalizeKnowledgeText(item.market), normalizeKnowledgeText(item.audience)].join("|");
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    return grouped;
  }

  /** Evaluates pain severity from normalized intensity signals until richer domain-specific severity models exist. */
  evaluateSeverity(score: number) {
    return severityFromScore(score);
  }

  /** Evaluates pain frequency from normalized recurrence signals until historical trend engines provide persistence. */
  evaluateFrequency(score: number) {
    return frequencyFromScore(score);
  }

  /** Calculates a deterministic score explaining why a pain signal should or should not become a candidate. */
  calculatePainScore(signal: PainSignal) {
    return calculateCompositePainScore({
      severityScore: signal.averagePainIntensity,
      frequencyScore: signal.averageFrequencySignal,
      evidenceCount: signal.evidence.length,
      confidenceScore: signal.averageEvidenceConfidence,
      sourceQualityScore: signal.averageSourceQuality,
    });
  }

  /** Calculates candidate confidence from evidence confidence and source quality for future Confidence Engine handoff. */
  calculateConfidence(signal: PainSignal) {
    return normalizePainScore(signal.averageEvidenceConfidence * 0.6 + signal.averageSourceQuality * 0.4);
  }

  /** Applies stable ranking so downstream engines can consume the strongest pain candidates first. */
  rankPainCandidates(candidates: PainCandidate[]) {
    return rankCandidates(candidates);
  }

  /** Produces the full typed detection result without changing product behavior or persisting knowledge. */
  producePainDetectionResult(input: PainDetectionInput): PainDetectionResult {
    const validation = validatePainDetectionInput(input);
    const detectedAt = normalizeDetectedAt(input.detectedAt);
    const signals = validation.valid ? this.collectPainSignals(input) : [];
    const candidates = this.rankPainCandidates(
      signals.map((signal) => ({
        id: generateKnowledgeId("pc", signal.id),
        title: signal.title,
        normalizedTitle: signal.normalizedTitle,
        context: signal.context,
        evidence: signal.evidence,
        severity: signal.severity,
        frequency: signal.frequency,
        score: this.calculatePainScore(signal),
        rank: 0,
      }))
    );
    const result: PainDetectionResult = {
      runId: input.runId || `pain-${detectedAt}`,
      detectedAt,
      candidates,
      signals,
      warnings: validation.errors,
      summary: {
        evidenceCount: input.evidence.length,
        signalCount: signals.length,
        candidateCount: candidates.length,
        highestScore: candidates[0]?.score.totalScore || 0,
        averageConfidence: averagePainScore(candidates.map((candidate) => candidate.score.confidenceScore)),
      },
    };
    const resultValidation = validatePainDetectionResult(result);
    if (!resultValidation.valid) throw new Error(`Invalid pain detection result: ${resultValidation.errors.join(" ")}`);
    return result;
  }

  /** Runs the full deterministic Pain Detection Engine pipeline for future orchestrator integration points. */
  run(input: PainDetectionInput) {
    return this.producePainDetectionResult(input);
  }
}
