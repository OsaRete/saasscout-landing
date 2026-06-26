import type { Evidence } from "../../evidence";
import { evidenceToKnowledgeUpdateInput } from "../../knowledge";
import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import type { PainCandidate } from "../pain";
import type { PatternCandidate } from "../pattern";
import type { TrendCandidate } from "../trend";
import { rankOpportunityCandidates as rankCandidates } from "./ranking";
import { createOpportunityContext, createOpportunityMarketContext, dedupeOpportunityEvidence } from "./relationships";
import {
  averageOpportunityScore,
  calculateCompositeOpportunityScore,
  normalizeOpportunityScore,
  readinessFromScore,
  riskFromScore,
} from "./scoring";
import type {
  OpportunityCandidate,
  OpportunityDetectionInput,
  OpportunityDetectionResult,
  OpportunityEvidence,
  OpportunitySignal,
} from "./types";
import { validateOpportunityDetectionInput, validateOpportunityDetectionResult } from "./validation";

function normalizeDetectedAt(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function evidenceTitle(evidence: Evidence) {
  return evidence.detectedProblemTitle || evidence.extractedClaim || evidence.capturedText.slice(0, 120);
}

function toOpportunityEvidence(evidence: Evidence): OpportunityEvidence {
  return {
    fingerprint: evidence.deduplicationFingerprint,
    sourceType: evidence.sourceType,
    sourceName: evidence.sourceName,
    sourceUrl: evidence.sourceUrl,
    capturedAt: evidence.capturedAt,
    claim: evidence.extractedClaim || evidence.capturedText || evidenceTitle(evidence),
    market: evidence.market,
    audience: evidence.audience,
    nicheCategory: evidence.nicheCategory,
    painIntensity: normalizeOpportunityScore(evidence.painIntensity),
    frequencySignal: normalizeOpportunityScore(evidence.frequencySignal),
    buyingIntentSignal: normalizeOpportunityScore(evidence.buyingIntentSignal),
    confidenceScore: normalizeOpportunityScore(evidence.confidenceScore, 5),
    sourceQualityScore: normalizeOpportunityScore(evidence.sourceQualityScore, 5),
  };
}

function contextMarket(candidate: PainCandidate | PatternCandidate | TrendCandidate) {
  if ("market" in candidate.context) return candidate.context.market;
  return candidate.context.markets[0] || null;
}

function contextAudience(candidate: PainCandidate | PatternCandidate | TrendCandidate) {
  if ("audience" in candidate.context) return candidate.context.audience;
  return candidate.context.audiences[0] || null;
}

function contextNiche(candidate: PainCandidate | PatternCandidate | TrendCandidate) {
  if ("nicheCategory" in candidate.context) return candidate.context.nicheCategory;
  return candidate.context.niches[0] || null;
}

function collectCandidateEvidence(candidate: PainCandidate | PatternCandidate | TrendCandidate): OpportunityEvidence[] {
  return candidate.evidence.map((evidence) => ({
    fingerprint: evidence.fingerprint,
    sourceType: evidence.sourceType,
    sourceName: evidence.sourceName,
    sourceUrl: evidence.sourceUrl,
    capturedAt: evidence.capturedAt,
    claim: evidence.claim,
    painIntensity: evidence.painIntensity,
    frequencySignal: evidence.frequencySignal,
    confidenceScore: evidence.confidenceScore,
    sourceQualityScore: evidence.sourceQualityScore,
    buyingIntentSignal: 0,
    market: "market" in evidence ? evidence.market : contextMarket(candidate),
    audience: "audience" in evidence ? evidence.audience : contextAudience(candidate),
    nicheCategory: "nicheCategory" in evidence ? evidence.nicheCategory : contextNiche(candidate),
  }));
}

/**
 * Discovers evidence-backed opportunity candidates without AI, persistence, routes, prompts, Supabase, or UI coupling.
 * Future orchestrators can adopt this class as SaaSScout's reusable Opportunity Engine foundation.
 */
export class OpportunityEngine {
  /** Collects normalized pain, pattern, trend, knowledge, and evidence signals into reusable opportunity signals. */
  collectOpportunitySignals(input: OpportunityDetectionInput): OpportunitySignal[] {
    const directEvidence = (input.evidence || []).map(toOpportunityEvidence);
    const grouped = this.combinePainPatternTrendSignals(input, directEvidence);
    return Array.from(grouped.values()).map((group) => this.createSignalFromGroup(group, input));
  }

  /** Combines upstream Pain, Pattern, and Trend Engine candidates by normalized problem and market context. */
  combinePainPatternTrendSignals(input: OpportunityDetectionInput, directEvidence: OpportunityEvidence[] = []) {
    const grouped = new Map<string, {
      title: string;
      evidence: OpportunityEvidence[];
      painCandidateIds: string[];
      patternCandidateIds: string[];
      trendCandidateIds: string[];
    }>();
    const upsert = (title: string, evidence: OpportunityEvidence[], type: "pain" | "pattern" | "trend", id?: string) => {
      const firstEvidence = evidence[0];
      const key = [normalizeKnowledgeText(title), normalizeKnowledgeText(firstEvidence?.market), normalizeKnowledgeText(firstEvidence?.audience)].join("|");
      const current = grouped.get(key) || { title, evidence: [], painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [] };
      if (type === "pain" && id) current.painCandidateIds.push(id);
      if (type === "pattern" && id) current.patternCandidateIds.push(id);
      if (type === "trend" && id) current.trendCandidateIds.push(id);
      current.evidence = dedupeOpportunityEvidence([...current.evidence, ...evidence]);
      grouped.set(key, current);
    };

    for (const evidence of directEvidence) upsert(evidence.claim, [evidence], "pain");
    for (const candidate of input.painCandidates || []) upsert(candidate.title, collectCandidateEvidence(candidate), "pain", candidate.id);
    for (const candidate of input.patternCandidates || []) upsert(candidate.title, collectCandidateEvidence(candidate), "pattern", candidate.id);
    for (const candidate of input.trendCandidates || []) upsert(candidate.title, collectCandidateEvidence(candidate), "trend", candidate.id);
    return grouped;
  }

  /** Evaluates market pull from frequency, buying intent, trend presence, and pattern reuse. */
  evaluateMarketPull(signal: OpportunitySignal) {
    return normalizeOpportunityScore(
      averageOpportunityScore(signal.evidence.map((item) => item.frequencySignal)) * 0.35 +
        averageOpportunityScore(signal.evidence.map((item) => item.buyingIntentSignal)) * 0.25 +
        Math.min(10, signal.trendCandidateIds.length * 2.5) * 0.25 +
        Math.min(10, signal.patternCandidateIds.length * 2) * 0.15
    );
  }

  /** Evaluates problem urgency from pain intensity, recurrence, evidence volume, and upstream pain support. */
  evaluateProblemUrgency(signal: OpportunitySignal) {
    return normalizeOpportunityScore(
      averageOpportunityScore(signal.evidence.map((item) => item.painIntensity)) * 0.45 +
        averageOpportunityScore(signal.evidence.map((item) => item.frequencySignal)) * 0.25 +
        Math.min(10, signal.evidence.length * 1.5) * 0.2 +
        Math.min(10, signal.painCandidateIds.length * 2) * 0.1
    );
  }

  /** Evaluates solution potential from explicit market pull, urgency, and deterministic underserved-language signals. */
  evaluateSolutionPotential(signal: OpportunitySignal) {
    const underservedScore = Math.min(10, signal.marketContext.underservedSignals.length * 2.5);
    return normalizeOpportunityScore(signal.marketPullScore * 0.35 + signal.problemUrgencyScore * 0.4 + underservedScore * 0.25);
  }

  /** Evaluates build simplicity from workflow clarity and scope concentration until richer implementation-cost engines exist. */
  evaluateBuildSimplicity(signal: OpportunitySignal) {
    const scopePenalty = Math.min(4, Math.max(0, signal.context.patternCandidateIds.length - 2));
    const contextClarity = [signal.context.market, signal.context.audience, signal.context.nicheCategory].filter(Boolean).length * 2;
    return normalizeOpportunityScore(6 + contextClarity - scopePenalty);
  }

  /** Evaluates differentiation potential from underserved evidence, pattern breadth, and trend timing. */
  evaluateDifferentiationPotential(signal: OpportunitySignal) {
    return normalizeOpportunityScore(
      Math.min(10, signal.marketContext.underservedSignals.length * 2.5) * 0.45 +
        Math.min(10, signal.patternCandidateIds.length * 2) * 0.25 +
        Math.min(10, signal.trendCandidateIds.length * 2.5) * 0.3
    );
  }

  /** Calculates the composite deterministic Opportunity Score future Decision Layer components can explain. */
  calculateOpportunityScore(signal: OpportunitySignal) {
    return calculateCompositeOpportunityScore({
      marketPullScore: signal.marketPullScore,
      problemUrgencyScore: signal.problemUrgencyScore,
      solutionPotentialScore: signal.solutionPotentialScore,
      buildSimplicityScore: signal.buildSimplicityScore,
      differentiationPotentialScore: signal.differentiationPotentialScore,
      evidenceCount: signal.evidence.length,
      confidenceScore: averageOpportunityScore(signal.evidence.map((item) => item.confidenceScore)),
      sourceQualityScore: averageOpportunityScore(signal.evidence.map((item) => item.sourceQualityScore)),
      risk: signal.risk,
    });
  }

  /** Calculates confidence from evidence quality so a future Confidence Engine can audit opportunity conclusions. */
  calculateOpportunityConfidence(signal: OpportunitySignal) {
    return normalizeOpportunityScore(
      averageOpportunityScore(signal.evidence.map((item) => item.confidenceScore)) * 0.6 +
        averageOpportunityScore(signal.evidence.map((item) => item.sourceQualityScore)) * 0.4
    );
  }

  /** Applies stable ranking so future orchestrators consume the most evidence-backed opportunities first. */
  rankOpportunityCandidates(candidates: OpportunityCandidate[]) {
    return rankCandidates(candidates);
  }

  /** Produces the full typed Opportunity Detection Result without changing current product behavior. */
  produceOpportunityDetectionResult(input: OpportunityDetectionInput): OpportunityDetectionResult {
    const validation = validateOpportunityDetectionInput(input);
    const detectedAt = normalizeDetectedAt(input.detectedAt);
    const signals = validation.valid ? this.collectOpportunitySignals(input) : [];
    const candidates = this.rankOpportunityCandidates(
      signals.map((signal) => ({
        id: generateKnowledgeId("oc", signal.id),
        title: signal.title,
        normalizedTitle: signal.normalizedTitle,
        context: signal.context,
        marketContext: signal.marketContext,
        evidence: signal.evidence,
        score: this.calculateOpportunityScore(signal),
        readiness: signal.readiness,
        risk: signal.risk,
        rank: 0,
      }))
    );
    const result: OpportunityDetectionResult = {
      runId: input.runId || `opportunity-${detectedAt}`,
      detectedAt,
      candidates,
      signals,
      warnings: validation.errors,
      summary: {
        evidenceCount: input.evidence?.length || 0,
        painCandidateCount: input.painCandidates?.length || 0,
        patternCandidateCount: input.patternCandidates?.length || 0,
        trendCandidateCount: input.trendCandidates?.length || 0,
        signalCount: signals.length,
        candidateCount: candidates.length,
        highestScore: candidates[0]?.score.totalScore || 0,
        averageConfidence: averageOpportunityScore(candidates.map((candidate) => candidate.score.confidenceScore)),
      },
    };
    const resultValidation = validateOpportunityDetectionResult(result);
    if (!resultValidation.valid) throw new Error(`Invalid opportunity detection result: ${resultValidation.errors.join(" ")}`);
    return result;
  }

  /** Runs the full deterministic Opportunity Engine pipeline for future Discovery Orchestrator integration. */
  run(input: OpportunityDetectionInput) {
    return this.produceOpportunityDetectionResult(input);
  }

  private createSignalFromGroup(group: { title: string; evidence: OpportunityEvidence[]; painCandidateIds: string[]; patternCandidateIds: string[]; trendCandidateIds: string[] }, input: OpportunityDetectionInput): OpportunitySignal {
    const title = group.title;
    const normalizedTitle = normalizeKnowledgeText(title);
    const evidenceFingerprints = new Set(group.evidence.map((item) => item.fingerprint));
    const updates = input.knowledgeUpdates || (input.evidence || []).map((item) => evidenceToKnowledgeUpdateInput(item));
    const relatedUpdates = updates.filter((update) => evidenceFingerprints.has(update.evidence.fingerprint));
    const knowledgeProblemIds = (input.knownProblems || [])
      .filter((problem) => relatedUpdates.some((update) => update.problem.fingerprint === problem.fingerprint))
      .map((problem) => problem.id);
    const relatedRelationshipIds = [...(input.relationships || []), ...relatedUpdates.flatMap((update) => update.relationships)].map((relationship) => relationship.id);
    const marketContext = createOpportunityMarketContext({
      title,
      evidence: group.evidence,
      underservedSignals: this.extractUnderservedSignals(group.evidence),
      existingSolutionSignals: this.extractExistingSolutionSignals(group.evidence),
    });
    const context = createOpportunityContext({
      title,
      evidence: group.evidence,
      painCandidateIds: group.painCandidateIds,
      patternCandidateIds: group.patternCandidateIds,
      trendCandidateIds: group.trendCandidateIds,
      knowledgeProblemIds,
      relatedRelationshipIds,
    });
    const baseSignal = {
      id: generateKnowledgeId("os", normalizedTitle, context.market, context.audience),
      title,
      normalizedTitle,
      context,
      marketContext,
      evidence: group.evidence,
      painCandidateIds: context.painCandidateIds,
      patternCandidateIds: context.patternCandidateIds,
      trendCandidateIds: context.trendCandidateIds,
      marketPullScore: 0,
      problemUrgencyScore: 0,
      solutionPotentialScore: 0,
      buildSimplicityScore: 0,
      differentiationPotentialScore: 0,
      readiness: "unknown" as const,
      risk: "unknown" as const,
    };
    const marketPullScore = this.evaluateMarketPull(baseSignal);
    const problemUrgencyScore = this.evaluateProblemUrgency({ ...baseSignal, marketPullScore });
    const solutionPotentialScore = this.evaluateSolutionPotential({ ...baseSignal, marketPullScore, problemUrgencyScore });
    const buildSimplicityScore = this.evaluateBuildSimplicity(baseSignal);
    const differentiationPotentialScore = this.evaluateDifferentiationPotential(baseSignal);
    const risk = riskFromScore(Math.max(0, 10 - buildSimplicityScore + (marketContext.existingSolutionSignals.length > 2 ? 1.5 : 0)));
    const readiness = readinessFromScore(averageOpportunityScore([marketPullScore, problemUrgencyScore, solutionPotentialScore]));
    return { ...baseSignal, marketPullScore, problemUrgencyScore, solutionPotentialScore, buildSimplicityScore, differentiationPotentialScore, readiness, risk };
  }

  private extractUnderservedSignals(evidence: OpportunityEvidence[]) {
    const terms = ["manual", "expensive", "slow", "broken", "missing", "hard", "spreadsheet", "workaround", "frustrating"];
    return Array.from(new Set(evidence.flatMap((item) => terms.filter((term) => normalizeKnowledgeText(item.claim).includes(term))))).sort();
  }

  private extractExistingSolutionSignals(evidence: OpportunityEvidence[]) {
    const terms = ["tool", "software", "platform", "app", "service", "vendor", "competitor"];
    return Array.from(new Set(evidence.flatMap((item) => terms.filter((term) => normalizeKnowledgeText(item.claim).includes(term))))).sort();
  }
}
