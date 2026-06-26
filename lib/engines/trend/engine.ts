import type { Evidence } from "../../evidence";
import { evidenceToKnowledgeUpdateInput } from "../../knowledge";
import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import { rankTrendCandidates as rankCandidates } from "./ranking";
import {
  averageTrendScore,
  calculateCompositeTrendScore,
  directionFromChange,
  momentumFromScore,
  normalizeTrendScore,
  scoreFromDirection,
  velocityFromScore,
} from "./scoring";
import { calculateWindowChange, createTrendTimeWindows, normalizeTimeWindowDays, normalizeTrendDate } from "./time-windows";
import type { TrendCandidate, TrendDetectionInput, TrendDetectionResult, TrendEvidence, TrendSignal, TrendTimeWindow } from "./types";
import { validateTrendDetectionInput, validateTrendDetectionResult } from "./validation";

function evidenceTitle(evidence: Evidence) {
  return evidence.detectedProblemTitle || evidence.extractedClaim || evidence.capturedText.slice(0, 120);
}

function evidenceClaim(evidence: Evidence) {
  return evidence.extractedClaim || evidence.capturedText || evidenceTitle(evidence);
}

function toTrendEvidence(evidence: Evidence): TrendEvidence {
  return {
    fingerprint: evidence.deduplicationFingerprint,
    sourceType: evidence.sourceType,
    sourceName: evidence.sourceName,
    sourceUrl: evidence.sourceUrl,
    capturedAt: evidence.capturedAt,
    claim: evidenceClaim(evidence),
    market: evidence.market,
    audience: evidence.audience,
    nicheCategory: evidence.nicheCategory,
    painIntensity: normalizeTrendScore(evidence.painIntensity),
    frequencySignal: normalizeTrendScore(evidence.frequencySignal),
    confidenceScore: normalizeTrendScore(evidence.confidenceScore, 5),
    sourceQualityScore: normalizeTrendScore(evidence.sourceQualityScore, 5),
  };
}

function evidenceFromInput(input: TrendDetectionInput) {
  const directEvidence = (input.evidence || []).map(toTrendEvidence);
  const painEvidence: TrendEvidence[] = (input.painCandidates || []).flatMap((candidate) =>
    candidate.evidence.map((evidence) => ({
      ...evidence,
      market: candidate.context.market,
      audience: candidate.context.audience,
      nicheCategory: candidate.context.nicheCategory,
    }))
  );
  const patternEvidence: TrendEvidence[] = (input.patternCandidates || []).flatMap((candidate) => candidate.evidence);
  return [...directEvidence, ...painEvidence, ...patternEvidence];
}

/**
 * Detects market movement over time without AI, storage side effects, prompt changes, routes, or UI coupling.
 * Future orchestrators can adopt this class as SaaSScout's reusable Trend Engine foundation.
 */
export class TrendEngine {
  /** Collects Evidence, Pain Engine, and Pattern Engine outputs into deterministic temporal trend signals. */
  collectTrendSignals(input: TrendDetectionInput): TrendSignal[] {
    const evidence = evidenceFromInput(input);
    const grouped = new Map<string, TrendEvidence[]>();
    for (const item of evidence) {
      const key = [
        normalizeKnowledgeText(item.claim).split(" ").slice(0, 8).join(" "),
        normalizeKnowledgeText(item.market),
        normalizeKnowledgeText(item.audience),
      ].join("|");
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }

    return Array.from(grouped.entries()).map(([key, group]) => {
      const [label] = key.split("|");
      const timeWindows = this.groupSignalsByTimeWindow(group, input.timeWindowDays);
      const intensityChange = calculateWindowChange(timeWindows, (window) => window.averagePainIntensity);
      const frequencyChange = calculateWindowChange(timeWindows, (window) => window.averageFrequencySignal);
      const direction = this.detectDirection(timeWindows);
      const context = this.buildContext(label, group, input);
      return {
        id: generateKnowledgeId("trs", key),
        label,
        normalizedLabel: normalizeKnowledgeText(label),
        context,
        evidence: group,
        timeWindows,
        momentum: this.detectMomentum(timeWindows),
        velocity: this.detectVelocity(timeWindows),
        direction,
        emergenceScore: this.detectEmergingPatterns(timeWindows),
        intensityChange,
        frequencyChange,
      };
    });
  }

  /** Groups temporal evidence into reusable time windows that future trend memory can compare across runs. */
  groupSignalsByTimeWindow(evidence: TrendEvidence[], timeWindowDays?: number): TrendTimeWindow[] {
    return createTrendTimeWindows(evidence, normalizeTimeWindowDays(timeWindowDays));
  }

  /** Detects acceleration in evidence volume, pain intensity, and frequency across time windows. */
  detectMomentum(timeWindows: TrendTimeWindow[]) {
    const volumeChange = calculateWindowChange(timeWindows, (window) => Math.min(10, window.evidenceCount * 2));
    const intensityChange = calculateWindowChange(timeWindows, (window) => window.averagePainIntensity);
    const frequencyChange = calculateWindowChange(timeWindows, (window) => window.averageFrequencySignal);
    return momentumFromScore(normalizeTrendScore(volumeChange * 0.4 + intensityChange * 0.3 + frequencyChange * 0.3 + 4));
  }

  /** Detects trend velocity from the latest evidence density so future opportunity engines can reason about timing. */
  detectVelocity(timeWindows: TrendTimeWindow[]) {
    if (timeWindows.length === 0) return velocityFromScore(0);
    const latest = timeWindows[timeWindows.length - 1];
    const previous = timeWindows.length > 1 ? timeWindows[timeWindows.length - 2] : latest;
    const latestDensity = Math.min(10, latest.evidenceCount * 2);
    const previousDensity = Math.min(10, previous.evidenceCount * 2);
    return velocityFromScore(normalizeTrendScore(latestDensity + Math.max(0, latestDensity - previousDensity)));
  }

  /** Detects whether a market signal is rising, emerging, stable, or declining over the available windows. */
  detectDirection(timeWindows: TrendTimeWindow[]) {
    const intensityChange = calculateWindowChange(timeWindows, (window) => window.averagePainIntensity);
    const frequencyChange = calculateWindowChange(timeWindows, (window) => window.averageFrequencySignal);
    const volumeChange = calculateWindowChange(timeWindows, (window) => Math.min(10, window.evidenceCount * 2));
    return directionFromChange(intensityChange * 0.35 + frequencyChange * 0.35 + volumeChange * 0.3);
  }

  /** Detects weak or newly repeated signals by rewarding recent evidence concentration after sparse history. */
  detectEmergingPatterns(timeWindows: TrendTimeWindow[]) {
    if (timeWindows.length === 0) return 0;
    const latest = timeWindows[timeWindows.length - 1];
    const previous = timeWindows.slice(0, -1);
    const previousAverage = averageTrendScore(previous.map((window) => Math.min(10, window.evidenceCount * 2)));
    const latestScore = normalizeTrendScore(Math.min(10, latest.evidenceCount * 2) + latest.averagePainIntensity * 0.2 + latest.averageFrequencySignal * 0.2);
    return normalizeTrendScore(latestScore - previousAverage + (previous.length === 0 ? 2 : 0));
  }

  /** Calculates an explainable deterministic score for a trend signal before it becomes a candidate. */
  calculateTrendScore(signal: TrendSignal) {
    return calculateCompositeTrendScore({
      momentumScore: this.scoreMomentum(signal.momentum),
      velocityScore: this.scoreVelocity(signal.velocity),
      directionScore: scoreFromDirection(signal.direction),
      emergenceScore: signal.emergenceScore,
      evidenceCount: signal.evidence.length,
      confidenceScore: averageTrendScore(signal.evidence.map((item) => item.confidenceScore)),
      sourceQualityScore: averageTrendScore(signal.evidence.map((item) => item.sourceQualityScore)),
    });
  }

  /** Calculates candidate confidence from evidence quality for future Confidence Engine handoff. */
  calculateTrendConfidence(signal: TrendSignal) {
    return normalizeTrendScore(
      averageTrendScore(signal.evidence.map((item) => item.confidenceScore)) * 0.6 +
        averageTrendScore(signal.evidence.map((item) => item.sourceQualityScore)) * 0.4
    );
  }

  /** Applies stable ranking so downstream engines can consume the strongest trend candidates first. */
  rankTrendCandidates(candidates: TrendCandidate[]) {
    return rankCandidates(candidates);
  }

  /** Produces the full typed detection result without changing product behavior or persisting knowledge. */
  produceTrendDetectionResult(input: TrendDetectionInput): TrendDetectionResult {
    const validation = validateTrendDetectionInput(input);
    const detectedAt = normalizeTrendDate(input.detectedAt);
    const signals = validation.valid ? this.collectTrendSignals(input) : [];
    const candidates = this.rankTrendCandidates(
      signals.map((signal) => ({
        id: generateKnowledgeId("trc", signal.id),
        title: signal.label,
        normalizedTitle: signal.normalizedLabel,
        context: signal.context,
        evidence: signal.evidence,
        timeWindows: signal.timeWindows,
        momentum: signal.momentum,
        velocity: signal.velocity,
        direction: signal.direction,
        score: this.calculateTrendScore(signal),
        rank: 0,
      }))
    );
    const result: TrendDetectionResult = {
      runId: input.runId || `trend-${detectedAt}`,
      detectedAt,
      candidates,
      signals,
      warnings: validation.errors,
      summary: {
        evidenceCount: input.evidence?.length || 0,
        painCandidateCount: input.painCandidates?.length || 0,
        patternCandidateCount: input.patternCandidates?.length || 0,
        signalCount: signals.length,
        candidateCount: candidates.length,
        highestScore: candidates[0]?.score.totalScore || 0,
        averageConfidence: averageTrendScore(candidates.map((candidate) => candidate.score.confidenceScore)),
      },
    };
    const resultValidation = validateTrendDetectionResult(result);
    if (!resultValidation.valid) throw new Error(`Invalid trend detection result: ${resultValidation.errors.join(" ")}`);
    return result;
  }

  /** Runs the full deterministic Trend Engine pipeline for future Discovery Orchestrator integration points. */
  run(input: TrendDetectionInput) {
    return this.produceTrendDetectionResult(input);
  }

  private buildContext(label: string, evidence: TrendEvidence[], input: TrendDetectionInput) {
    const updates = input.knowledgeUpdates || (input.evidence || []).map((item) => evidenceToKnowledgeUpdateInput(item));
    const evidenceFingerprints = new Set(evidence.map((item) => item.fingerprint));
    const relatedUpdates = updates.filter((update) => evidenceFingerprints.has(update.evidence.fingerprint));
    return {
      market: evidence[0]?.market || null,
      audience: evidence[0]?.audience || null,
      nicheCategory: evidence[0]?.nicheCategory || null,
      primaryTheme: label,
      painCandidateIds: (input.painCandidates || [])
        .filter((candidate) => candidate.evidence.some((item) => evidenceFingerprints.has(item.fingerprint)))
        .map((candidate) => candidate.id),
      patternCandidateIds: (input.patternCandidates || [])
        .filter((candidate) => candidate.evidence.some((item) => evidenceFingerprints.has(item.fingerprint)))
        .map((candidate) => candidate.id),
      knowledgeProblemIds: (input.knownProblems || [])
        .filter((problem) => relatedUpdates.some((update) => update.problem.fingerprint === problem.fingerprint))
        .map((problem) => problem.id),
      relatedRelationshipIds: [...(input.relationships || []), ...relatedUpdates.flatMap((update) => update.relationships)].map((relationship) => relationship.id),
    };
  }

  private scoreMomentum(momentum: TrendSignal["momentum"]) {
    if (momentum === "surging") return 9;
    if (momentum === "accelerating") return 7;
    if (momentum === "building") return 5;
    if (momentum === "flat") return 2;
    return 0;
  }

  private scoreVelocity(velocity: TrendSignal["velocity"]) {
    if (velocity === "breakout") return 9;
    if (velocity === "fast") return 7;
    if (velocity === "steady") return 5;
    if (velocity === "slow") return 2;
    return 0;
  }
}
