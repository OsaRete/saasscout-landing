import type { Evidence } from "../../evidence";
import { evidenceToKnowledgeUpdateInput } from "../../knowledge";
import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import type { OpportunityCandidate } from "../opportunity";
import type { PainCandidate } from "../pain";
import type { PatternCandidate } from "../pattern";
import type { TrendCandidate } from "../trend";
import { rankMonetizationCandidates as rankCandidates } from "./ranking";
import { createMonetizationContext, dedupeMonetizationEvidence } from "./relationships";
import { averageMonetizationScore, calculateCompositeMonetizationScore, competitionFromScore, marketSizeFromScore, monetizationRiskFromScore, normalizeMonetizationScore, pricingHypothesisFromSignals, recurrenceFromScore, revenuePotentialFromScore, willingnessToPayFromScore } from "./scoring";
import type { MonetizationCandidate, MonetizationDetectionInput, MonetizationDetectionResult, MonetizationEvidence, MonetizationSignal } from "./types";
import { validateMonetizationDetectionInput, validateMonetizationDetectionResult } from "./validation";

const PAYMENT_TERMS = ["pay", "paid", "budget", "pricing", "cost", "expensive", "subscription", "invoice", "roi", "revenue"];
const COMPETITION_TERMS = ["competitor", "vendor", "tool", "software", "platform", "alternative", "marketplace", "app"];
const RECURRING_TERMS = ["monthly", "weekly", "daily", "recurring", "repeat", "ongoing", "subscription", "retention", "workflow"];
const SEAT_TERMS = ["team", "seat", "user", "employee", "member"];
const USAGE_TERMS = ["usage", "api", "volume", "credits", "metered"];
const TRANSACTION_TERMS = ["transaction", "commission", "payment", "booking", "order"];
const ENTERPRISE_TERMS = ["enterprise", "compliance", "security", "procurement", "approval", "sso"];

function normalizeDetectedAt(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function evidenceTitle(evidence: Evidence) {
  return evidence.detectedProblemTitle || evidence.extractedClaim || evidence.capturedText.slice(0, 120);
}

function termCount(evidence: MonetizationEvidence[], terms: string[]) {
  return evidence.reduce((count, item) => {
    const claim = normalizeKnowledgeText(item.claim);
    return count + terms.filter((term) => claim.includes(term)).length;
  }, 0);
}

function toMonetizationEvidence(evidence: Evidence): MonetizationEvidence {
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
    painIntensity: normalizeMonetizationScore(evidence.painIntensity),
    frequencySignal: normalizeMonetizationScore(evidence.frequencySignal),
    buyingIntentSignal: normalizeMonetizationScore(evidence.buyingIntentSignal),
    confidenceScore: normalizeMonetizationScore(evidence.confidenceScore, 5),
    sourceQualityScore: normalizeMonetizationScore(evidence.sourceQualityScore, 5),
  };
}

function evidenceFromCandidate(candidate: OpportunityCandidate | PainCandidate | PatternCandidate | TrendCandidate): MonetizationEvidence[] {
  return candidate.evidence.map((evidence) => ({
    fingerprint: evidence.fingerprint,
    sourceType: evidence.sourceType,
    sourceName: evidence.sourceName,
    sourceUrl: evidence.sourceUrl,
    capturedAt: evidence.capturedAt,
    claim: evidence.claim,
    market: "market" in evidence ? evidence.market : "market" in candidate.context ? candidate.context.market : candidate.context.markets[0] || null,
    audience: "audience" in evidence ? evidence.audience : "audience" in candidate.context ? candidate.context.audience : candidate.context.audiences[0] || null,
    nicheCategory: "nicheCategory" in evidence ? evidence.nicheCategory : "nicheCategory" in candidate.context ? candidate.context.nicheCategory : candidate.context.niches[0] || null,
    painIntensity: evidence.painIntensity,
    frequencySignal: evidence.frequencySignal,
    buyingIntentSignal: "buyingIntentSignal" in evidence ? evidence.buyingIntentSignal : 0,
    confidenceScore: evidence.confidenceScore,
    sourceQualityScore: evidence.sourceQualityScore,
  }));
}

/** Evaluates whether evidence-backed opportunities can realistically become businesses without AI or side effects. */
export class MonetizationEngine {
  /** Collects reusable monetization signals from Opportunity, Pain, Pattern, Trend, Evidence, and Knowledge references. */
  collectMonetizationSignals(input: MonetizationDetectionInput): MonetizationSignal[] {
    const grouped = this.groupMonetizationInputs(input);
    return Array.from(grouped.values()).map((group) => this.createSignalFromGroup(group, input));
  }

  /** Groups upstream intelligence by normalized problem and market so monetization can be compared consistently. */
  groupMonetizationInputs(input: MonetizationDetectionInput) {
    const grouped = new Map<string, { title: string; evidence: MonetizationEvidence[]; opportunityCandidateIds: string[]; painCandidateIds: string[]; patternCandidateIds: string[]; trendCandidateIds: string[] }>();
    const upsert = (title: string, evidence: MonetizationEvidence[], type: "evidence" | "opportunity" | "pain" | "pattern" | "trend", id?: string) => {
      const firstEvidence = evidence[0];
      const key = [normalizeKnowledgeText(title), normalizeKnowledgeText(firstEvidence?.market), normalizeKnowledgeText(firstEvidence?.audience)].join("|");
      const current = grouped.get(key) || { title, evidence: [], opportunityCandidateIds: [], painCandidateIds: [], patternCandidateIds: [], trendCandidateIds: [] };
      if (type === "opportunity" && id) current.opportunityCandidateIds.push(id);
      if (type === "pain" && id) current.painCandidateIds.push(id);
      if (type === "pattern" && id) current.patternCandidateIds.push(id);
      if (type === "trend" && id) current.trendCandidateIds.push(id);
      current.evidence = dedupeMonetizationEvidence([...current.evidence, ...evidence]);
      grouped.set(key, current);
    };
    for (const evidence of input.evidence || []) upsert(evidenceTitle(evidence), [toMonetizationEvidence(evidence)], "evidence");
    for (const candidate of input.opportunityCandidates || []) upsert(candidate.title, evidenceFromCandidate(candidate), "opportunity", candidate.id);
    for (const candidate of input.painCandidates || []) upsert(candidate.title, evidenceFromCandidate(candidate), "pain", candidate.id);
    for (const candidate of input.patternCandidates || []) upsert(candidate.title, evidenceFromCandidate(candidate), "pattern", candidate.id);
    for (const candidate of input.trendCandidates || []) upsert(candidate.title, evidenceFromCandidate(candidate), "trend", candidate.id);
    return grouped;
  }

  /** Evaluates willingness to pay from buying intent, pain intensity, payment language, and opportunity support. */
  evaluateWillingnessToPay(signal: MonetizationSignal) {
    return normalizeMonetizationScore(averageMonetizationScore(signal.evidence.map((item) => item.buyingIntentSignal)) * 0.45 + averageMonetizationScore(signal.evidence.map((item) => item.painIntensity)) * 0.25 + Math.min(10, termCount(signal.evidence, PAYMENT_TERMS) * 1.5) * 0.2 + Math.min(10, signal.context.opportunityCandidateIds.length * 2) * 0.1);
  }

  /** Evaluates revenue potential from willingness, market size, recurrence, and validated opportunity breadth. */
  evaluateRevenuePotential(signal: MonetizationSignal) {
    return normalizeMonetizationScore(signal.willingnessToPayScore * 0.35 + signal.marketSizeScore * 0.25 + signal.recurringPotentialScore * 0.25 + Math.min(10, signal.context.opportunityCandidateIds.length * 2.5) * 0.15);
  }

  /** Evaluates whether the available signals support a clear first pricing model hypothesis. */
  evaluatePricingHypothesis(signal: MonetizationSignal) {
    const clarity = [termCount(signal.evidence, SEAT_TERMS), termCount(signal.evidence, USAGE_TERMS), termCount(signal.evidence, TRANSACTION_TERMS), termCount(signal.evidence, ENTERPRISE_TERMS), termCount(signal.evidence, RECURRING_TERMS)].filter((count) => count > 0).length;
    return normalizeMonetizationScore(Math.min(10, clarity * 2 + signal.willingnessToPayScore * 0.35 + signal.recurringPotentialScore * 0.25));
  }

  /** Evaluates market size from market/audience specificity, evidence breadth, and trend support. */
  evaluateMarketSize(signal: MonetizationSignal) {
    const contextBreadth = [signal.context.market, signal.context.audience, signal.context.nicheCategory].filter(Boolean).length;
    return normalizeMonetizationScore(contextBreadth * 1.5 + Math.min(10, signal.evidence.length * 1.3) * 0.35 + Math.min(10, signal.context.trendCandidateIds.length * 2.5) * 0.25 + Math.min(10, signal.context.patternCandidateIds.length * 2) * 0.2);
  }

  /** Evaluates competition pressure from explicit vendor language and opportunity competition context. */
  evaluateCompetitionPressure(signal: MonetizationSignal) {
    return normalizeMonetizationScore(Math.min(10, termCount(signal.evidence, COMPETITION_TERMS) * 1.4 + signal.context.opportunityCandidateIds.length));
  }

  /** Evaluates recurring potential from recurrence language, frequency, and persistent upstream pain/trend support. */
  evaluateRecurringPotential(signal: MonetizationSignal) {
    return normalizeMonetizationScore(averageMonetizationScore(signal.evidence.map((item) => item.frequencySignal)) * 0.45 + Math.min(10, termCount(signal.evidence, RECURRING_TERMS) * 1.5) * 0.3 + Math.min(10, (signal.context.painCandidateIds.length + signal.context.trendCandidateIds.length) * 1.5) * 0.25);
  }

  /** Evaluates monetization risk from weak payment evidence, competition pressure, and poor recurrence. */
  evaluateMonetizationRisk(signal: MonetizationSignal) {
    return monetizationRiskFromScore((10 - signal.willingnessToPayScore) * 0.35 + signal.competitionPressureScore * 0.3 + (10 - signal.recurringPotentialScore) * 0.2 + (10 - signal.marketSizeScore) * 0.15);
  }

  /** Calculates the composite score used to rank whether an opportunity can become a business. */
  calculateMonetizationScore(signal: MonetizationSignal) {
    return calculateCompositeMonetizationScore({ willingnessToPayScore: signal.willingnessToPayScore, revenuePotentialScore: signal.revenuePotentialScore, pricingHypothesisScore: signal.pricingHypothesisScore, marketSizeScore: signal.marketSizeScore, competitionPressureScore: signal.competitionPressureScore, recurringPotentialScore: signal.recurringPotentialScore, evidenceCount: signal.evidence.length, confidenceScore: averageMonetizationScore(signal.evidence.map((item) => item.confidenceScore)), sourceQualityScore: averageMonetizationScore(signal.evidence.map((item) => item.sourceQualityScore)), risk: signal.risk });
  }

  /** Calculates monetization confidence so future Confidence Engine integrations can audit business viability conclusions. */
  calculateMonetizationConfidence(signal: MonetizationSignal) {
    return normalizeMonetizationScore(averageMonetizationScore(signal.evidence.map((item) => item.confidenceScore)) * 0.6 + averageMonetizationScore(signal.evidence.map((item) => item.sourceQualityScore)) * 0.4);
  }

  /** Applies deterministic ranking so future orchestrators prioritize monetizable opportunities over merely interesting ideas. */
  rankMonetizationCandidates(candidates: MonetizationCandidate[]) {
    return rankCandidates(candidates);
  }

  /** Produces the typed Monetization Detection Result without changing routes, prompts, storage, UI, or product behavior. */
  produceMonetizationDetectionResult(input: MonetizationDetectionInput): MonetizationDetectionResult {
    const validation = validateMonetizationDetectionInput(input);
    const detectedAt = normalizeDetectedAt(input.detectedAt);
    const signals = validation.valid ? this.collectMonetizationSignals(input) : [];
    const candidates = this.rankMonetizationCandidates(signals.map((signal) => ({ id: generateKnowledgeId("mc", signal.id), title: signal.title, normalizedTitle: signal.normalizedTitle, context: signal.context, evidence: signal.evidence, score: this.calculateMonetizationScore(signal), willingnessToPaySignal: signal.willingnessToPaySignal, revenuePotential: signal.revenuePotential, pricingHypothesis: signal.pricingHypothesis, marketSizeSignal: signal.marketSizeSignal, competitionSignal: signal.competitionSignal, recurrenceSignal: signal.recurrenceSignal, risk: signal.risk, rank: 0 })));
    const result: MonetizationDetectionResult = { runId: input.runId || `monetization-${detectedAt}`, detectedAt, candidates, signals, warnings: validation.errors, summary: { evidenceCount: input.evidence?.length || 0, opportunityCandidateCount: input.opportunityCandidates?.length || 0, painCandidateCount: input.painCandidates?.length || 0, patternCandidateCount: input.patternCandidates?.length || 0, trendCandidateCount: input.trendCandidates?.length || 0, signalCount: signals.length, candidateCount: candidates.length, highestScore: candidates[0]?.score.totalScore || 0, averageConfidence: averageMonetizationScore(candidates.map((candidate) => candidate.score.confidenceScore)) } };
    const resultValidation = validateMonetizationDetectionResult(result);
    if (!resultValidation.valid) throw new Error(`Invalid monetization detection result: ${resultValidation.errors.join(" ")}`);
    return result;
  }

  /** Runs the full deterministic Monetization Engine pipeline for future Discovery Orchestrator adoption. */
  run(input: MonetizationDetectionInput) {
    return this.produceMonetizationDetectionResult(input);
  }

  private createSignalFromGroup(group: { title: string; evidence: MonetizationEvidence[]; opportunityCandidateIds: string[]; painCandidateIds: string[]; patternCandidateIds: string[]; trendCandidateIds: string[] }, input: MonetizationDetectionInput): MonetizationSignal {
    const title = group.title;
    const normalizedTitle = normalizeKnowledgeText(title);
    const evidenceFingerprints = new Set(group.evidence.map((item) => item.fingerprint));
    const updates = input.knowledgeUpdates || (input.evidence || []).map((item) => evidenceToKnowledgeUpdateInput(item));
    const relatedUpdates = updates.filter((update) => evidenceFingerprints.has(update.evidence.fingerprint));
    const knowledgeProblemIds = (input.knownProblems || []).filter((problem) => relatedUpdates.some((update) => update.problem.fingerprint === problem.fingerprint)).map((problem) => problem.id);
    const relatedRelationshipIds = [...(input.relationships || []), ...relatedUpdates.flatMap((update) => update.relationships)].map((relationship) => relationship.id);
    const context = createMonetizationContext({ title, evidence: group.evidence, opportunityCandidateIds: group.opportunityCandidateIds, painCandidateIds: group.painCandidateIds, patternCandidateIds: group.patternCandidateIds, trendCandidateIds: group.trendCandidateIds, knowledgeProblemIds, relatedRelationshipIds });
    const baseSignal: MonetizationSignal = { id: generateKnowledgeId("ms", normalizedTitle, context.market, context.audience), title, normalizedTitle, context, evidence: group.evidence, willingnessToPayScore: 0, revenuePotentialScore: 0, pricingHypothesisScore: 0, marketSizeScore: 0, competitionPressureScore: 0, recurringPotentialScore: 0, willingnessToPaySignal: "unknown", revenuePotential: "unknown", pricingHypothesis: "unknown", marketSizeSignal: "unknown", competitionSignal: "unknown", recurrenceSignal: "unknown", risk: "unknown" };
    const marketSizeScore = this.evaluateMarketSize(baseSignal);
    const recurringPotentialScore = this.evaluateRecurringPotential(baseSignal);
    const competitionPressureScore = this.evaluateCompetitionPressure(baseSignal);
    const willingnessToPayScore = this.evaluateWillingnessToPay({ ...baseSignal, marketSizeScore, recurringPotentialScore, competitionPressureScore });
    const pricingHypothesisScore = this.evaluatePricingHypothesis({ ...baseSignal, marketSizeScore, recurringPotentialScore, competitionPressureScore, willingnessToPayScore });
    const revenuePotentialScore = this.evaluateRevenuePotential({ ...baseSignal, marketSizeScore, recurringPotentialScore, competitionPressureScore, willingnessToPayScore, pricingHypothesisScore });
    const pricingHypothesis = pricingHypothesisFromSignals({ recurringScore: recurringPotentialScore, marketSizeScore, willingnessToPayScore, competitionPressureScore, transactionTerms: termCount(group.evidence, TRANSACTION_TERMS), seatTerms: termCount(group.evidence, SEAT_TERMS), usageTerms: termCount(group.evidence, USAGE_TERMS), enterpriseTerms: termCount(group.evidence, ENTERPRISE_TERMS) });
    const risk = this.evaluateMonetizationRisk({ ...baseSignal, marketSizeScore, recurringPotentialScore, competitionPressureScore, willingnessToPayScore, pricingHypothesisScore, revenuePotentialScore });
    return { ...baseSignal, willingnessToPayScore, revenuePotentialScore, pricingHypothesisScore, marketSizeScore, competitionPressureScore, recurringPotentialScore, willingnessToPaySignal: willingnessToPayFromScore(willingnessToPayScore), revenuePotential: revenuePotentialFromScore(revenuePotentialScore), pricingHypothesis, marketSizeSignal: marketSizeFromScore(marketSizeScore), competitionSignal: competitionFromScore(competitionPressureScore), recurrenceSignal: recurrenceFromScore(recurringPotentialScore), risk };
  }
}
