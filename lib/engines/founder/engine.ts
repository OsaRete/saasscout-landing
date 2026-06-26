import { generateKnowledgeId, normalizeKnowledgeText } from "../../knowledge/fingerprint";
import { createFounderContext, createFounderFitCandidate, calculateTermOverlapScore } from "./relationships";
import { averageFounderScore, calculateCompositeFounderFitScore, founderReadinessFromScore, founderRiskFromScore, normalizeFounderScore } from "./scoring";
import type { FounderCapability, FounderConstraint, FounderFitCandidate, FounderFitScore, FounderIntelligenceInput, FounderIntelligenceResult, FounderOpportunityFit, FounderProfile, FounderReadiness, FounderRisk, FounderSignal } from "./types";
import { rankFounderOpportunityFits as rankFits } from "./ranking";
import { validateFounderIntelligenceInput, validateFounderIntelligenceResult } from "./validation";

function normalizeEvaluatedAt(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function signalFromText(source: FounderSignal["source"], value: string, strengthScore = 6): FounderSignal {
  const normalizedLabel = normalizeKnowledgeText(value);
  return { id: generateKnowledgeId("fs", source, normalizedLabel), label: value, normalizedLabel, source, strengthScore: normalizeFounderScore(strengthScore) };
}

function candidateTerms(candidate: FounderFitCandidate) {
  return [candidate.title, candidate.opportunityCandidate.context.market, candidate.opportunityCandidate.context.audience, candidate.opportunityCandidate.context.nicheCategory, candidate.opportunityCandidate.context.primaryTheme, candidate.monetizationCandidate?.pricingHypothesis, candidate.monetizationCandidate?.revenuePotential].filter(Boolean) as string[];
}

/** Evaluates founder-specific opportunity fit without AI, side effects, or product behavior changes. */
export class FounderIntelligenceEngine {
  /** Collects founder signals from skills, experience, interests, capabilities, constraints, goals, budget, and time for future personalization. */
  collectFounderSignals(profile: FounderProfile): FounderSignal[] {
    return [
      ...profile.skills.map((item) => signalFromText("skill", item, 7)),
      ...profile.experience.map((item) => signalFromText("experience", item, 7)),
      ...profile.interests.map((item) => signalFromText("interest", item, 6)),
      ...(profile.capabilities || []).map((item) => signalFromText("capability", item.label, item.strengthScore)),
      ...(profile.constraints || []).map((item) => signalFromText("constraint", item.label, item.severityScore)),
      ...(profile.goals || []).map((item) => signalFromText("goal", item.label, item.priorityScore)),
      ...(profile.availableBudgetUsd !== null ? [signalFromText("budget", String(profile.availableBudgetUsd), this.evaluateBudgetCapacity(profile))] : []),
      ...(profile.availableHoursPerWeek !== null ? [signalFromText("time", String(profile.availableHoursPerWeek), this.evaluateTimeCapacity(profile))] : []),
    ];
  }

  /** Evaluates founder capabilities into normalized reusable records that future Founder Profile storage can preserve. */
  evaluateFounderCapabilities(profile: FounderProfile): FounderCapability[] {
    const explicit = profile.capabilities || [];
    const derived = [...profile.skills.map((skill) => ({ type: "skill" as const, label: skill })), ...profile.experience.map((experience) => ({ type: "experience" as const, label: experience }))].map((item) => ({ id: generateKnowledgeId("fc", profile.id, item.type, item.label), type: item.type, label: item.label, normalizedLabel: normalizeKnowledgeText(item.label), strengthScore: 7, evidenceRefs: [] }));
    return [...explicit, ...derived].map((item) => ({ ...item, normalizedLabel: item.normalizedLabel || normalizeKnowledgeText(item.label), strengthScore: normalizeFounderScore(item.strengthScore, 5), evidenceRefs: item.evidenceRefs || [] }));
  }

  /** Evaluates founder constraints so future decision layers can avoid recommendations the founder cannot realistically execute. */
  evaluateFounderConstraints(profile: FounderProfile): FounderConstraint[] {
    const constraints = [...(profile.constraints || [])];
    if (profile.availableBudgetUsd !== null && profile.availableBudgetUsd < 1000) constraints.push({ id: generateKnowledgeId("fcx", profile.id, "budget"), type: "budget", label: "Limited available budget", normalizedLabel: "limited available budget", severityScore: 7 });
    if (profile.availableHoursPerWeek !== null && profile.availableHoursPerWeek < 8) constraints.push({ id: generateKnowledgeId("fcx", profile.id, "time"), type: "time", label: "Limited weekly execution time", normalizedLabel: "limited weekly execution time", severityScore: 7 });
    return constraints.map((item) => ({ ...item, normalizedLabel: item.normalizedLabel || normalizeKnowledgeText(item.label), severityScore: normalizeFounderScore(item.severityScore, 5) }));
  }

  /** Evaluates skill overlap between a founder and candidate so SaaSScout can personalize beyond universal opportunity scores. */
  evaluateSkillFit(profile: FounderProfile, candidate: FounderFitCandidate) {
    return normalizeFounderScore(calculateTermOverlapScore(profile.skills, candidateTerms(candidate)) || averageFounderScore((profile.capabilities || []).filter((item) => item.type === "skill" || item.type === "technical").map((item) => item.strengthScore)) * 0.7);
  }

  /** Evaluates experience fit to identify opportunities where accumulated founder context improves execution odds. */
  evaluateExperienceFit(profile: FounderProfile, candidate: FounderFitCandidate) {
    return normalizeFounderScore(calculateTermOverlapScore(profile.experience, candidateTerms(candidate)) || averageFounderScore((profile.capabilities || []).filter((item) => item.type === "experience" || item.type === "domain").map((item) => item.strengthScore)) * 0.7);
  }

  /** Evaluates budget fit against deterministic complexity signals from opportunity and monetization candidates. */
  evaluateBudgetFit(profile: FounderProfile, candidate: FounderFitCandidate) {
    if (profile.availableBudgetUsd === null) return 5;
    const complexity = 10 - candidate.opportunityCandidate.score.buildSimplicityScore + (candidate.monetizationCandidate?.score.competitionPressureScore || 0) * 0.3;
    const budgetCapacity = this.evaluateBudgetCapacity(profile);
    return normalizeFounderScore(budgetCapacity - Math.max(0, complexity - 5) * 0.7);
  }

  /** Evaluates time fit so SaaSScout can distinguish weekend-friendly opportunities from operationally heavy ones. */
  evaluateTimeFit(profile: FounderProfile, candidate: FounderFitCandidate) {
    if (profile.availableHoursPerWeek === null) return 5;
    const executionLoad = 10 - candidate.opportunityCandidate.score.buildSimplicityScore + candidate.relatedTrendCandidates.length * 0.5;
    return normalizeFounderScore(this.evaluateTimeCapacity(profile) - Math.max(0, executionLoad - 5) * 0.6);
  }

  /** Evaluates interest fit to keep recommendations aligned with founder motivation and long-term persistence. */
  evaluateInterestFit(profile: FounderProfile, candidate: FounderFitCandidate) {
    return normalizeFounderScore(calculateTermOverlapScore(profile.interests, candidateTerms(candidate)) || averageFounderScore((profile.goals || []).map((goal) => goal.priorityScore)) * 0.5);
  }

  /** Evaluates full founder opportunity fit candidate relationships before scoring and ranking. */
  evaluateOpportunityFit(input: FounderIntelligenceInput): FounderFitCandidate[] {
    return (input.opportunityCandidates || []).map((opportunity) => createFounderFitCandidate({ opportunity, monetizationCandidates: input.monetizationCandidates, painCandidates: input.painCandidates, patternCandidates: input.patternCandidates, trendCandidates: input.trendCandidates }));
  }

  /** Evaluates founder-specific risk from constraints, poor fit, low readiness, and upstream business risk. */
  evaluateFounderRisk(scoreInput: Omit<FounderFitScore, "riskPenalty" | "totalScore" | "rationale">, candidate?: FounderFitCandidate): FounderRisk {
    const upstreamRisk = candidate?.opportunityCandidate.risk === "critical" || candidate?.monetizationCandidate?.risk === "critical" ? 2 : candidate?.opportunityCandidate.risk === "high" || candidate?.monetizationCandidate?.risk === "high" ? 1 : 0;
    return founderRiskFromScore((10 - scoreInput.skillFitScore) * 0.18 + (10 - scoreInput.experienceFitScore) * 0.18 + (10 - scoreInput.budgetFitScore) * 0.18 + (10 - scoreInput.timeFitScore) * 0.18 + scoreInput.constraintPenalty * 0.2 + upstreamRisk);
  }

  /** Calculates the composite founder fit score future orchestrators can use without changing existing behavior. */
  calculateFounderFitScore(profile: FounderProfile, candidate: FounderFitCandidate): FounderFitScore {
    const skillFitScore = this.evaluateSkillFit(profile, candidate);
    const experienceFitScore = this.evaluateExperienceFit(profile, candidate);
    const budgetFitScore = this.evaluateBudgetFit(profile, candidate);
    const timeFitScore = this.evaluateTimeFit(profile, candidate);
    const interestFitScore = this.evaluateInterestFit(profile, candidate);
    const opportunityStrengthScore = candidate.opportunityCandidate.score.totalScore;
    const monetizationFitScore = candidate.monetizationCandidate?.score.totalScore || 5;
    const constraintPenalty = averageFounderScore(this.evaluateFounderConstraints(profile).map((item) => item.severityScore)) * 0.35;
    const provisional = { skillFitScore, experienceFitScore, budgetFitScore, timeFitScore, interestFitScore, opportunityStrengthScore, monetizationFitScore, evidenceScore: 0, constraintPenalty, readinessScore: 0 };
    const risk = this.evaluateFounderRisk(provisional, candidate);
    return calculateCompositeFounderFitScore({ skillFitScore, experienceFitScore, budgetFitScore, timeFitScore, interestFitScore, opportunityStrengthScore, monetizationFitScore, evidenceCount: candidate.evidenceFingerprints.length, constraintPenalty, risk });
  }

  /** Calculates founder readiness from fit score dimensions for future onboarding and decision sequencing. */
  calculateFounderReadiness(score: FounderFitScore): FounderReadiness {
    return founderReadinessFromScore(score.readinessScore);
  }

  /** Applies deterministic ranking so SaaSScout can avoid recommending the same generic best idea to every founder. */
  rankFounderOpportunityFits(fits: FounderOpportunityFit[]) {
    return rankFits(fits);
  }

  /** Produces the typed Founder Intelligence Result without changing routes, prompts, storage, UI, or production behavior. */
  produceFounderIntelligenceResult(input: FounderIntelligenceInput): FounderIntelligenceResult {
    const validation = validateFounderIntelligenceInput(input);
    const evaluatedAt = normalizeEvaluatedAt(input.evaluatedAt);
    const candidates = validation.valid ? this.evaluateOpportunityFit(input) : [];
    const fits = this.rankFounderOpportunityFits(candidates.map((candidate) => {
      const score = this.calculateFounderFitScore(input.founderProfile, candidate);
      const risk = this.evaluateFounderRisk(score, candidate);
      return { id: generateKnowledgeId("fof", input.founderProfile.id, candidate.id), founderProfileId: input.founderProfile.id, candidate, score, risk, readiness: this.calculateFounderReadiness(score), rank: 0 };
    }));
    const result: FounderIntelligenceResult = { runId: input.runId || `founder-${evaluatedAt}`, evaluatedAt, founderProfile: input.founderProfile, context: createFounderContext(input.founderProfile), signals: this.collectFounderSignals(input.founderProfile), capabilities: this.evaluateFounderCapabilities(input.founderProfile), constraints: this.evaluateFounderConstraints(input.founderProfile), opportunityFits: fits, warnings: validation.errors, summary: { opportunityCandidateCount: input.opportunityCandidates?.length || 0, monetizationCandidateCount: input.monetizationCandidates?.length || 0, fitCount: fits.length, highestScore: fits[0]?.score.totalScore || 0, averageReadinessScore: averageFounderScore(fits.map((fit) => fit.score.readinessScore)) } };
    const resultValidation = validateFounderIntelligenceResult(result);
    if (!resultValidation.valid) throw new Error(`Invalid founder intelligence result: ${resultValidation.errors.join(" ")}`);
    return result;
  }

  /** Runs the full deterministic Founder Intelligence Engine pipeline for future Discovery Orchestrator adoption. */
  run(input: FounderIntelligenceInput) {
    return this.produceFounderIntelligenceResult(input);
  }

  private evaluateBudgetCapacity(profile: FounderProfile) {
    if (profile.availableBudgetUsd === null) return 5;
    return normalizeFounderScore(Math.log10(Math.max(1, profile.availableBudgetUsd)) * 2);
  }

  private evaluateTimeCapacity(profile: FounderProfile) {
    if (profile.availableHoursPerWeek === null) return 5;
    return normalizeFounderScore((profile.availableHoursPerWeek / 40) * 10);
  }
}
