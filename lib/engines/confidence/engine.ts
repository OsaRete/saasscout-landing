import type { Evidence } from "../../evidence";
import { generateKnowledgeId } from "../../knowledge/fingerprint";
import { averageConfidenceScore, calculateCompositeConfidenceScore, consistencyFromScore, evidenceQualityFromScore, inferenceRiskFromScore, normalizeConfidenceScore, recencyFromScore, sourceDiversityFromScore, validationFromScore } from "./scoring";
import { rankConfidenceCandidates as rankCandidates } from "./ranking";
import { confidenceEvidenceFromEvidence, confidenceTitleForCandidate, createConfidenceContext, dedupeConfidenceEvidence, evidenceFromUpstreamCandidate, normalizeConfidenceTitle } from "./relationships";
import type { ConfidenceCandidate, ConfidenceDetectionInput, ConfidenceDetectionResult, ConfidenceEvidence, ConfidenceSignal } from "./types";
import { validateConfidenceDetectionInput, validateConfidenceDetectionResult } from "./validation";

function normalizeDetectedAt(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function evidenceTitle(evidence: Evidence) {
  return evidence.detectedProblemTitle || evidence.extractedClaim || evidence.capturedText.slice(0, 120);
}

/** Calculates explainable trust for conclusions without AI, side effects, routes, prompts, storage, or UI coupling. */
export class ConfidenceEngine {
  /** Collects confidence signals across Evidence, Knowledge, Pain, Pattern, Trend, Opportunity, Monetization, and Founder intelligence. */
  collectConfidenceSignals(input: ConfidenceDetectionInput): ConfidenceSignal[] {
    const signals: ConfidenceSignal[] = [];
    for (const evidence of input.evidence || []) signals.push(this.createSignal("evidence", evidence.deduplicationFingerprint, evidenceTitle(evidence), [confidenceEvidenceFromEvidence(evidence)], { relatedRelationshipIds: (input.relationships || []).map((relationship) => relationship.id) }));
    for (const problem of input.knownProblems || []) signals.push(this.createSignal("knowledge", problem.id, problem.title, (input.evidence || []).filter((evidence) => problem.sourceIds.includes(evidence.deduplicationFingerprint)).map(confidenceEvidenceFromEvidence), { knowledgeProblemIds: [problem.id] }));
    for (const candidate of input.painCandidates || []) signals.push(this.createSignal("pain", candidate.id, candidate.title, evidenceFromUpstreamCandidate(candidate), { painCandidateIds: [candidate.id], knowledgeProblemIds: [candidate.context.knowledgeProblemId].filter(Boolean) as string[], relatedRelationshipIds: candidate.context.relatedRelationshipIds }));
    for (const candidate of input.patternCandidates || []) signals.push(this.createSignal("pattern", candidate.id, candidate.title, evidenceFromUpstreamCandidate(candidate), { patternCandidateIds: [candidate.id], painCandidateIds: candidate.context.painCandidateIds, knowledgeProblemIds: candidate.context.knowledgeProblemIds, relatedRelationshipIds: candidate.context.relatedRelationshipIds }));
    for (const candidate of input.trendCandidates || []) signals.push(this.createSignal("trend", candidate.id, candidate.title, evidenceFromUpstreamCandidate(candidate), { trendCandidateIds: [candidate.id], painCandidateIds: candidate.context.painCandidateIds, patternCandidateIds: candidate.context.patternCandidateIds, knowledgeProblemIds: candidate.context.knowledgeProblemIds, relatedRelationshipIds: candidate.context.relatedRelationshipIds }));
    for (const candidate of input.opportunityCandidates || []) signals.push(this.createSignal("opportunity", candidate.id, candidate.title, evidenceFromUpstreamCandidate(candidate), { opportunityCandidateIds: [candidate.id], painCandidateIds: candidate.context.painCandidateIds, patternCandidateIds: candidate.context.patternCandidateIds, trendCandidateIds: candidate.context.trendCandidateIds, knowledgeProblemIds: candidate.context.knowledgeProblemIds, relatedRelationshipIds: candidate.context.relatedRelationshipIds }));
    for (const candidate of input.monetizationCandidates || []) signals.push(this.createSignal("monetization", candidate.id, candidate.title, evidenceFromUpstreamCandidate(candidate), { monetizationCandidateIds: [candidate.id], opportunityCandidateIds: candidate.context.opportunityCandidateIds, painCandidateIds: candidate.context.painCandidateIds, patternCandidateIds: candidate.context.patternCandidateIds, trendCandidateIds: candidate.context.trendCandidateIds, knowledgeProblemIds: candidate.context.knowledgeProblemIds, relatedRelationshipIds: candidate.context.relatedRelationshipIds }));
    for (const fit of input.founderFits || []) signals.push(this.createSignal("founder_fit", fit.id, confidenceTitleForCandidate(fit), evidenceFromUpstreamCandidate(fit), { founderFitCandidateIds: [fit.id], opportunityCandidateIds: [fit.candidate.opportunityCandidate.id], monetizationCandidateIds: fit.candidate.monetizationCandidate ? [fit.candidate.monetizationCandidate.id] : [], painCandidateIds: fit.candidate.relatedPainCandidates.map((candidate) => candidate.id), patternCandidateIds: fit.candidate.relatedPatternCandidates.map((candidate) => candidate.id), trendCandidateIds: fit.candidate.relatedTrendCandidates.map((candidate) => candidate.id), knowledgeProblemIds: fit.candidate.knowledgeProblemIds, relatedRelationshipIds: fit.candidate.relatedRelationshipIds }));
    return signals;
  }

  /** Evaluates whether supporting evidence is high quality enough to justify a trusted conclusion. */
  evaluateEvidenceQuality(evidence: ConfidenceEvidence[]) { return averageConfidenceScore(evidence.map((item) => item.confidenceScore * 0.6 + item.sourceQualityScore * 0.4)); }

  /** Evaluates source diversity so one noisy source cannot overstate confidence in an opportunity or recommendation. */
  evaluateSourceDiversity(evidence: ConfidenceEvidence[]) { return normalizeConfidenceScore(Math.min(10, new Set(evidence.map((item) => `${item.sourceType}:${item.sourceName || item.sourceUrl || item.fingerprint}`)).size * 2.5)); }

  /** Evaluates recency so confidence reflects whether evidence still represents the current market. */
  evaluateRecency(evidence: ConfidenceEvidence[], now: string | Date = new Date()) {
    const nowMs = new Date(now).getTime();
    return averageConfidenceScore(evidence.map((item) => { const ageDays = Math.max(0, (nowMs - new Date(item.capturedAt).getTime()) / 86_400_000); return ageDays <= 30 ? 10 : ageDays <= 90 ? 8 : ageDays <= 180 ? 6 : ageDays <= 365 ? 4 : 2; }));
  }

  /** Evaluates consistency by comparing agreement across normalized claims and market context. */
  evaluateConsistency(evidence: ConfidenceEvidence[]) {
    if (evidence.length === 0) return 0;
    const uniqueClaims = new Set(evidence.map((item) => normalizeConfidenceTitle(item.claim))).size;
    const agreement = evidence.length / Math.max(1, uniqueClaims);
    return normalizeConfidenceScore(Math.min(10, 4 + agreement * 2 + Math.min(3, evidence.length / 2)));
  }

  /** Evaluates validation strength from upstream engine relationships and cross-engine support. */
  evaluateValidationStrength(signal: Pick<ConfidenceSignal, "context" | "evidence">) {
    const engineSupport = [signal.context.painCandidateIds.length, signal.context.patternCandidateIds.length, signal.context.trendCandidateIds.length, signal.context.opportunityCandidateIds.length, signal.context.monetizationCandidateIds.length, signal.context.founderFitCandidateIds.length].filter((count) => count > 0).length;
    return normalizeConfidenceScore(Math.min(10, engineSupport * 1.4 + signal.context.knowledgeProblemIds.length * 1.2 + signal.context.relatedRelationshipIds.length * 0.5 + Math.min(3, signal.evidence.length * 0.4)));
  }

  /** Evaluates inference risk so unsupported leaps between evidence and conclusions can be flagged before output. */
  evaluateInferenceRisk(signal: Pick<ConfidenceSignal, "evidenceQualityScore" | "sourceDiversityScore" | "consistencyScore" | "validationStrengthScore" | "evidence">) {
    const scarcityRisk = signal.evidence.length === 0 ? 10 : signal.evidence.length === 1 ? 4 : 1;
    return normalizeConfidenceScore((10 - signal.evidenceQualityScore) * 0.3 + (10 - signal.sourceDiversityScore) * 0.2 + (10 - signal.consistencyScore) * 0.2 + (10 - signal.validationStrengthScore) * 0.2 + scarcityRisk * 0.1);
  }

  /** Calculates the composite confidence score future decision layers can attach to every recommendation. */
  calculateConfidenceScore(signal: ConfidenceSignal) { return calculateCompositeConfidenceScore({ ...signal, evidenceCount: signal.evidence.length }); }

  /** Assigns a confidence level from a numeric score for explainable product-facing trust labels. */
  assignConfidenceLevel(score: number) { return calculateCompositeConfidenceScore({ evidenceQualityScore: score, sourceDiversityScore: score, recencyScore: score, consistencyScore: score, validationStrengthScore: score, inferenceRiskScore: 10 - score, evidenceCount: score > 0 ? 1 : 0 }).level; }

  /** Applies deterministic ranking so future orchestrators prioritize trustworthy conclusions over speculative ones. */
  rankConfidenceCandidates(candidates: ConfidenceCandidate[]) { return rankCandidates(candidates); }

  /** Produces the full typed Confidence Detection Result without changing current SaaSScout product behavior. */
  produceConfidenceDetectionResult(input: ConfidenceDetectionInput): ConfidenceDetectionResult {
    const validation = validateConfidenceDetectionInput(input);
    const detectedAt = normalizeDetectedAt(input.detectedAt);
    const signals = validation.valid ? this.collectConfidenceSignals(input) : [];
    const candidates = this.rankConfidenceCandidates(signals.map((signal) => ({ id: generateKnowledgeId("cc", signal.candidateId), kind: signal.candidateKind, title: signal.context.primaryClaim, normalizedTitle: normalizeConfidenceTitle(signal.context.primaryClaim), context: signal.context, evidence: signal.evidence, score: this.calculateConfidenceScore(signal), rank: 0 })));
    const result: ConfidenceDetectionResult = { runId: input.runId || `confidence-${detectedAt}`, detectedAt, candidates, signals, warnings: validation.errors, summary: { evidenceCount: input.evidence?.length || 0, knowledgeProblemCount: input.knownProblems?.length || 0, painCandidateCount: input.painCandidates?.length || 0, patternCandidateCount: input.patternCandidates?.length || 0, trendCandidateCount: input.trendCandidates?.length || 0, opportunityCandidateCount: input.opportunityCandidates?.length || 0, monetizationCandidateCount: input.monetizationCandidates?.length || 0, founderFitCandidateCount: input.founderFits?.length || 0, signalCount: signals.length, candidateCount: candidates.length, highestScore: candidates[0]?.score.totalScore || 0, averageConfidence: averageConfidenceScore(candidates.map((candidate) => candidate.score.totalScore)) } };
    const resultValidation = validateConfidenceDetectionResult(result);
    if (!resultValidation.valid) throw new Error(`Invalid confidence detection result: ${resultValidation.errors.join(" ")}`);
    return result;
  }

  /** Runs the complete deterministic Confidence Engine pipeline for future Discovery Orchestrator adoption. */
  run(input: ConfidenceDetectionInput) { return this.produceConfidenceDetectionResult(input); }

  private createSignal(kind: ConfidenceSignal["candidateKind"], candidateId: string, title: string, rawEvidence: ConfidenceEvidence[], links: Partial<ConfidenceSignal["context"]>): ConfidenceSignal {
    const evidence = dedupeConfidenceEvidence(rawEvidence);
    const context = createConfidenceContext({ primaryClaim: title, evidence, ...links });
    const base = { id: generateKnowledgeId("cs", kind, candidateId), candidateId, candidateKind: kind, context, evidence, evidenceQualityScore: this.evaluateEvidenceQuality(evidence), sourceDiversityScore: this.evaluateSourceDiversity(evidence), recencyScore: this.evaluateRecency(evidence), consistencyScore: this.evaluateConsistency(evidence), validationStrengthScore: 0, inferenceRiskScore: 0 };
    const validationStrengthScore = this.evaluateValidationStrength(base);
    const inferenceRiskScore = this.evaluateInferenceRisk({ ...base, validationStrengthScore });
    return { ...base, validationStrengthScore, inferenceRiskScore, evidenceQualitySignal: evidenceQualityFromScore(base.evidenceQualityScore), sourceDiversitySignal: sourceDiversityFromScore(base.sourceDiversityScore), recencySignal: recencyFromScore(base.recencyScore), consistencySignal: consistencyFromScore(base.consistencyScore), validationSignal: validationFromScore(validationStrengthScore), inferenceRisk: inferenceRiskFromScore(inferenceRiskScore) };
  }
}
