import type { Evidence } from "../../evidence";
import { evidenceToKnowledgeUpdateInput } from "../../knowledge";
import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import { rankPatternCandidates as rankCandidates } from "./ranking";
import { createPatternRelationship, uniqueNormalizedValues } from "./relationships";
import {
  averagePatternScore,
  calculateCompositePatternScore,
  normalizePatternScore,
  patternFrequencyFromScore,
  strengthFromScore,
} from "./scoring";
import type {
  PatternCandidate,
  PatternContext,
  PatternDetectionInput,
  PatternDetectionResult,
  PatternEvidence,
  PatternSignal,
} from "./types";
import { validatePatternDetectionInput, validatePatternDetectionResult } from "./validation";

const DEFAULT_WORKFLOW_TERMS = ["manual", "spreadsheet", "approval", "reporting", "onboarding", "billing", "compliance", "handoff", "integration"];

function normalizeDetectedAt(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function evidenceTitle(evidence: Evidence) {
  return evidence.detectedProblemTitle || evidence.extractedClaim || evidence.capturedText.slice(0, 120);
}

function evidenceClaim(evidence: Evidence) {
  return evidence.extractedClaim || evidence.capturedText || evidenceTitle(evidence);
}

function toPatternEvidence(evidence: Evidence): PatternEvidence {
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
    painIntensity: normalizePatternScore(evidence.painIntensity),
    frequencySignal: normalizePatternScore(evidence.frequencySignal),
    confidenceScore: normalizePatternScore(evidence.confidenceScore, 5),
    sourceQualityScore: normalizePatternScore(evidence.sourceQualityScore, 5),
  };
}

function collectEvidenceFromInput(input: PatternDetectionInput) {
  const directEvidence = input.evidence || [];
  const painEvidence: PatternEvidence[] = (input.painCandidates || []).flatMap((candidate) =>
    candidate.evidence.map((evidence) => ({
      ...evidence,
      market: candidate.context.market,
      audience: candidate.context.audience,
      nicheCategory: candidate.context.nicheCategory,
    }))
  );
  return { directEvidence, painEvidence };
}

function contextFromEvidence(label: string, evidence: PatternEvidence[], input: PatternDetectionInput): PatternContext {
  const updates = input.knowledgeUpdates || (input.evidence || []).map((item) => evidenceToKnowledgeUpdateInput(item));
  const evidenceFingerprints = new Set(evidence.map((item) => item.fingerprint));
  const relatedUpdates = updates.filter((update) => evidenceFingerprints.has(update.evidence.fingerprint));
  return {
    primaryTheme: label,
    markets: uniqueNormalizedValues(evidence.map((item) => item.market)),
    audiences: uniqueNormalizedValues(evidence.map((item) => item.audience)),
    niches: uniqueNormalizedValues(evidence.map((item) => item.nicheCategory)),
    workflowTerms: [],
    painCandidateIds: (input.painCandidates || [])
      .filter((candidate) => candidate.evidence.some((item) => evidenceFingerprints.has(item.fingerprint)))
      .map((candidate) => candidate.id),
    knowledgeProblemIds: (input.knownProblems || [])
      .filter((problem) => relatedUpdates.some((update) => update.problem.fingerprint === problem.fingerprint))
      .map((problem) => problem.id),
    relatedRelationshipIds: [...(input.relationships || []), ...relatedUpdates.flatMap((update) => update.relationships)].map((relationship) => relationship.id),
  };
}

/**
 * Detects repeated market patterns without AI, storage side effects, route coupling, prompt changes, or UI behavior changes.
 * Future orchestrators can use this class to connect pain signals into SaaSScout-owned pattern intelligence.
 */
export class PatternDetectionEngine {
  /** Collects normalized evidence and pain outputs into deterministic pattern signals that preserve provenance. */
  collectPatternSignals(input: PatternDetectionInput): PatternSignal[] {
    const { directEvidence, painEvidence } = collectEvidenceFromInput(input);
    const evidence = [...directEvidence.map(toPatternEvidence), ...painEvidence];
    const themeSignals = this.detectRepeatedThemes(evidence, input);
    return [
      ...themeSignals,
      ...this.detectMarketRelationships(evidence, input),
      ...this.detectAudienceRelationships(evidence, input),
      ...this.detectWorkflowRelationships(evidence, input),
    ];
  }

  /** Groups Pain Detection Engine candidates by normalized title, market, and audience for future pattern analysis. */
  groupRelatedPainCandidates(input: PatternDetectionInput) {
    const grouped = new Map<string, NonNullable<PatternDetectionInput["painCandidates"]>>();
    for (const candidate of input.painCandidates || []) {
      const key = [candidate.normalizedTitle, normalizeKnowledgeText(candidate.context.market), normalizeKnowledgeText(candidate.context.audience)].join("|");
      grouped.set(key, [...(grouped.get(key) || []), candidate]);
    }
    return grouped;
  }

  /** Detects repeated problem themes so SaaSScout can connect similar pain across evidence and future scans. */
  detectRepeatedThemes(evidence: PatternEvidence[], input: PatternDetectionInput): PatternSignal[] {
    return this.groupEvidenceBy(evidence, (item) => normalizeKnowledgeText(item.claim).split(" ").slice(0, 8).join(" "), "theme", input);
  }

  /** Detects market-level relationships that indicate the same pain pattern may exist across related markets. */
  detectMarketRelationships(evidence: PatternEvidence[], input: PatternDetectionInput): PatternSignal[] {
    return this.groupEvidenceBy(evidence, (item) => normalizeKnowledgeText(item.market), "market", input);
  }

  /** Detects audience-level relationships that show shared pain across buyer or user segments. */
  detectAudienceRelationships(evidence: PatternEvidence[], input: PatternDetectionInput): PatternSignal[] {
    return this.groupEvidenceBy(evidence, (item) => normalizeKnowledgeText(item.audience), "audience", input);
  }

  /** Detects workflow relationships by matching deterministic workflow terms in captured claims and contexts. */
  detectWorkflowRelationships(evidence: PatternEvidence[], input: PatternDetectionInput): PatternSignal[] {
    const terms = uniqueNormalizedValues([...(input.workflowKeywords || []), ...DEFAULT_WORKFLOW_TERMS]);
    return this.groupEvidenceBy(
      evidence,
      (item) => terms.find((term) => normalizeKnowledgeText(`${item.claim} ${item.market} ${item.audience} ${item.nicheCategory}`).includes(term)) || "",
      "workflow",
      input
    );
  }

  /** Calculates explainable pattern strength from score totals for downstream opportunity and confidence engines. */
  calculatePatternStrength(score: number) {
    return strengthFromScore(score);
  }

  /** Calculates deterministic confidence from evidence confidence, source quality, and relationship strength. */
  calculatePatternConfidence(signal: PatternSignal) {
    const relationshipStrength = averagePatternScore(signal.relationships.map((relationship) => relationship.strength));
    return normalizePatternScore(signal.averageEvidenceConfidence * 0.45 + signal.averageSourceQuality * 0.35 + relationshipStrength * 0.2);
  }

  /** Applies stable ranking so future orchestrators consume strongest reusable pattern candidates first. */
  rankPatternCandidates(candidates: PatternCandidate[]) {
    return rankCandidates(candidates);
  }

  /** Produces a complete pattern detection result without persisting data or changing current product behavior. */
  producePatternDetectionResult(input: PatternDetectionInput): PatternDetectionResult {
    const validation = validatePatternDetectionInput(input);
    const detectedAt = normalizeDetectedAt(input.detectedAt);
    const signals = validation.valid ? this.collectPatternSignals(input) : [];
    const candidates = this.rankPatternCandidates(
      signals.map((signal) => {
        const relationshipScore = averagePatternScore(signal.relationships.map((relationship) => relationship.strength));
        const frequencyScore = averagePatternScore([signal.averageFrequencySignal, Math.min(10, signal.evidence.length * 2)]);
        const score = calculateCompositePatternScore({
          themeScore: signal.averagePainIntensity,
          relationshipScore,
          frequencyScore,
          evidenceCount: signal.evidence.length,
          confidenceScore: signal.averageEvidenceConfidence,
          sourceQualityScore: signal.averageSourceQuality,
        });
        return {
          id: generateKnowledgeId("ptc", signal.id),
          title: signal.label,
          normalizedTitle: signal.normalizedLabel,
          context: signal.context,
          evidence: signal.evidence,
          relationships: signal.relationships,
          strength: this.calculatePatternStrength(score.totalScore),
          frequency: patternFrequencyFromScore(frequencyScore),
          score,
          rank: 0,
        };
      })
    );
    const relationships = signals.flatMap((signal) => signal.relationships);
    const result: PatternDetectionResult = {
      runId: input.runId || `pattern-${detectedAt}`,
      detectedAt,
      candidates,
      signals,
      relationships,
      warnings: validation.errors,
      summary: {
        evidenceCount: input.evidence?.length || 0,
        painCandidateCount: input.painCandidates?.length || 0,
        signalCount: signals.length,
        relationshipCount: relationships.length,
        candidateCount: candidates.length,
        highestScore: candidates[0]?.score.totalScore || 0,
        averageConfidence: averagePatternScore(candidates.map((candidate) => candidate.score.confidenceScore)),
      },
    };
    const resultValidation = validatePatternDetectionResult(result);
    if (!resultValidation.valid) throw new Error(`Invalid pattern detection result: ${resultValidation.errors.join(" ")}`);
    return result;
  }

  /** Runs the full deterministic Pattern Detection Engine pipeline for future Discovery Orchestrator adoption. */
  run(input: PatternDetectionInput) {
    return this.producePatternDetectionResult(input);
  }

  private groupEvidenceBy(
    evidence: PatternEvidence[],
    selector: (item: PatternEvidence) => string,
    signalType: PatternSignal["signalType"],
    input: PatternDetectionInput
  ): PatternSignal[] {
    const grouped = new Map<string, PatternEvidence[]>();
    for (const item of evidence) {
      const key = selector(item);
      if (!key) continue;
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }

    return Array.from(grouped.entries()).map(([label, group]) => {
      const context = contextFromEvidence(label, group, input);
      const relationship = createPatternRelationship({
        relationshipType: signalType,
        label,
        strength: normalizePatternScore(group.length * 1.5 + context.markets.length + context.audiences.length + context.niches.length),
        evidenceCount: group.length,
        confidenceScore: averagePatternScore(group.map((item) => item.confidenceScore)),
        relatedPainCandidateIds: context.painCandidateIds,
        relatedKnowledgeRelationshipIds: context.relatedRelationshipIds,
      });
      const workflowTerms = signalType === "workflow" ? [label] : context.workflowTerms;
      return {
        id: generateKnowledgeId("pts", signalType, label),
        label,
        normalizedLabel: normalizeKnowledgeText(label),
        signalType,
        context: { ...context, workflowTerms },
        evidence: group,
        relationships: [relationship],
        averagePainIntensity: averagePatternScore(group.map((item) => item.painIntensity)),
        averageFrequencySignal: averagePatternScore(group.map((item) => item.frequencySignal)),
        averageEvidenceConfidence: averagePatternScore(group.map((item) => item.confidenceScore)),
        averageSourceQuality: averagePatternScore(group.map((item) => item.sourceQualityScore)),
      };
    });
  }
}
