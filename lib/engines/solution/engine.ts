import { SOLUTION_CATEGORIES, getSolutionCategoryDefinition } from "./categories.ts";
import { createEmptySolutionIntelligenceDiagnostics } from "./diagnostics.ts";
import { rankSolutionEvaluations } from "./ranking.ts";
import { calculateSolutionScoreBreakdown, normalizeSolutionScore, type SolutionSignalProfile } from "./scoring.ts";
import type { RejectedSolutionCategory, SolutionCategory, SolutionCandidate, SolutionEvaluation, SolutionIntelligenceInput, SolutionIntelligenceResult, SolutionRecommendation } from "./types.ts";
import { validateSolutionIntelligenceInput, validateSolutionIntelligenceResult } from "./validation.ts";

const RECOMMENDATION_SCORE_THRESHOLD = 6.8;
const RECOMMENDATION_CONFIDENCE_THRESHOLD = 6.2;
const RECOMMENDATION_EVIDENCE_THRESHOLD = 5.5;

const SIGNAL_TERMS: Record<string, string[]> = {
  workflow: ["workflow", "process", "repeat", "recurring", "routine", "operations", "pipeline"],
  recurring: ["daily", "weekly", "monthly", "repeat", "recurring", "every time", "ongoing"],
  business: ["business", "team", "company", "enterprise", "operator", "employee", "b2b", "revenue", "compliance"],
  software: ["software", "dashboard", "platform", "tool", "portal", "system", "database"],
  data: ["data", "analytics", "report", "insight", "tracking", "document", "unstructured", "classification"],
  manual: ["manual", "spreadsheet", "copy paste", "copy-paste", "hand", "tedious", "admin"],
  physical: ["physical", "device", "shipping", "inventory", "warehouse", "field", "offline", "material", "packaging"],
  human: ["human", "expert", "done for you", "done-for-you", "managed", "specialist", "operator", "concierge"],
  mobile: ["mobile", "phone", "on the go", "on-the-go", "ios", "android", "camera", "notification"],
  consumer: ["consumer", "personal", "families", "students", "home", "fitness", "habit"],
  location: ["location", "nearby", "local", "geo", "route", "field", "venue"],
  frequent: ["daily", "habit", "frequent", "real time", "real-time"],
  developer: ["developer", "api", "sdk", "integration", "webhook", "infrastructure", "programmatic"],
  integration: ["integrate", "integration", "connect", "sync", "webhook", "api", "zapier"],
  logistics: ["logistics", "shipping", "delivery", "returns", "inventory", "supply chain"],
  manufacturing: ["manufacturing", "factory", "prototype", "materials", "assembly", "certification"],
  hardware: ["hardware", "sensor", "device", "iot", "machine", "equipment", "wearable"],
  sensor: ["sensor", "camera", "measurement", "monitor", "embedded", "iot"],
  compliance: ["compliance", "regulated", "safety", "certification", "audit"],
  twoSided: ["marketplace", "buyers", "sellers", "supply", "demand", "matching", "providers"],
  fragmentedSupply: ["fragmented", "vendors", "providers", "freelancers", "directory"],
  local: ["local", "nearby", "city", "neighborhood", "regional"],
  trust: ["trust", "risk", "sensitive", "mission critical", "mission-critical", "legal", "financial", "health"],
  custom: ["custom", "bespoke", "tailored", "case by case", "case-by-case", "complex", "high touch", "high-touch"],
  consulting: ["consulting", "advisor", "strategy", "diagnose", "implementation", "expertise"],
  automation: ["automate", "automation", "rules", "workflow", "manual", "repetitive", "bot"],
  ai: ["ai", "machine learning", "llm", "model", "prediction", "classification", "generate", "summarize"],
  unstructured: ["unstructured", "text", "document", "email", "conversation", "image", "audio"],
  education: ["learn", "course", "training", "curriculum", "education", "teach", "onboarding"],
  knowledge: ["knowledge", "skill", "best practice", "playbook", "template", "guide"],
  beginner: ["beginner", "novice", "new to", "confused", "don't know", "how to"],
  hybrid: ["hybrid", "software plus service", "service plus software", "hardware plus software", "managed platform"],
  complexity: ["complex", "multi step", "multi-step", "cross functional", "cross-functional", "end to end", "end-to-end"],
  pricing: ["pricing", "expensive", "cost", "budget", "paid", "pay", "roi", "shared savings"],
  outcome: ["outcome", "performance", "guarantee", "success fee", "commission", "shared savings"],
  finance: ["finance", "financing", "insurance", "embedded finance", "payment", "credit"],
  underserved: ["underserved", "no solution", "missing", "workaround", "broken", "alternatives fail"],
  urgent: ["urgent", "critical", "asap", "deadline", "painful", "blocked", "costly"],
};

function normalizeText(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function countTerms(text: string, terms: string[]) {
  return terms.reduce((count, term) => count + (text.includes(normalizeText(term)) ? 1 : 0), 0);
}

function normalizedDate(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
}

function buildSignalProfile(input: SolutionIntelligenceInput): SolutionSignalProfile {
  const evidenceReferences = input.evidenceReferences || [];
  const contextText = Object.values(input.context || {}).map((value) => Array.isArray(value) ? value.join(" ") : typeof value === "object" ? JSON.stringify(value) : String(value ?? "")).join(" ");
  const text = normalizeText([input.problemTitle, input.problemSummary, evidenceReferences.join(" "), (input.affectedMarkets || []).join(" "), (input.affectedAudiences || []).join(" "), contextText].join(" "));
  const signals = Object.fromEntries(Object.entries(SIGNAL_TERMS).map(([signal, terms]) => [signal, Math.min(3, countTerms(text, terms))]));
  signals.evidenceWeak = evidenceReferences.length < 2 ? 2 : 0;
  return { evidenceCount: evidenceReferences.length, problemText: normalizeText(`${input.problemTitle} ${input.problemSummary}`), evidenceText: normalizeText(evidenceReferences.join(" ")), marketText: normalizeText((input.affectedMarkets || []).join(" ")), audienceText: normalizeText((input.affectedAudiences || []).join(" ")), signals };
}

function candidateFor(category: SolutionCategory, input: SolutionIntelligenceInput, profile: SolutionSignalProfile, evaluation: ReturnType<typeof calculateSolutionScoreBreakdown>): SolutionCandidate {
  const definition = getSolutionCategoryDefinition(category);
  return {
    id: `solution-${category}-${normalizeText(input.problemTitle).slice(0, 48).replaceAll(" ", "-") || "untitled"}`,
    category,
    title: `${definition.label} evaluation for ${input.problemTitle}`,
    summary: `${definition.label} is evaluated as one possible response to the problem, not as a default recommendation.`,
    targetCustomer: input.affectedAudiences?.[0] || input.affectedMarkets?.[0] || null,
    primaryUseCase: input.problemSummary,
    expectedBusinessModel: definition.typicalBusinessModels[0] || null,
    rationale: [`${definition.label} fit score is ${evaluation.problemSolutionFitScore}/10 based on deterministic textual and evidence signals.`],
    assumptions: [`The evaluation assumes the supplied problem summary and ${profile.evidenceCount} evidence reference(s) accurately represent the market problem.`],
    risks: definition.commonRisks,
    supportingEvidenceReferences: input.evidenceReferences || [],
    missingEvidence: missingEvidenceFor(profile, evaluation),
  };
}

function missingEvidenceFor(profile: SolutionSignalProfile, score: { evidenceStrengthScore: number; willingnessToPayScore: number; distributionFitScore: number }) {
  const missing: string[] = [];
  if (profile.evidenceCount < 2) missing.push("More independent evidence references are needed before recommending a solution category.");
  if (score.willingnessToPayScore < 5.5) missing.push("Stronger willingness-to-pay or budget evidence is missing.");
  if (score.distributionFitScore < 5.5) missing.push("Distribution channel fit is not yet well supported by evidence.");
  if (score.evidenceStrengthScore < RECOMMENDATION_EVIDENCE_THRESHOLD) missing.push("Evidence strength is below the conservative recommendation threshold.");
  return missing;
}

function rejectedReasons(evaluation: SolutionEvaluation) {
  const reasons: string[] = [];
  const score = evaluation.scoreBreakdown;
  if (score.evidenceStrengthScore < RECOMMENDATION_EVIDENCE_THRESHOLD) reasons.push("Evidence strength is too weak for recommendation.");
  if (score.confidenceScore < RECOMMENDATION_CONFIDENCE_THRESHOLD) reasons.push("Confidence is below the safe recommendation threshold.");
  if (score.overallSolutionScore < RECOMMENDATION_SCORE_THRESHOLD) reasons.push("Overall solution score is below the safe recommendation threshold.");
  return reasons;
}

export class SolutionIntelligenceEngine {
  evaluateCategories(input: SolutionIntelligenceInput): SolutionEvaluation[] {
    const profile = buildSignalProfile(input);
    return rankSolutionEvaluations(SOLUTION_CATEGORIES.map((category) => {
      const scoreBreakdown = calculateSolutionScoreBreakdown(category, profile);
      const candidate = candidateFor(category, input, profile, scoreBreakdown);
      return {
        candidate,
        scoreBreakdown,
        rationale: [...candidate.rationale, `Overall score is ${scoreBreakdown.overallSolutionScore}/10 after weighting fit, monetization, scalability, complexity, distribution, defensibility, evidence, and confidence.`],
        assumptions: candidate.assumptions,
        risks: candidate.risks,
        supportingEvidenceReferences: candidate.supportingEvidenceReferences,
        missingEvidence: candidate.missingEvidence,
      };
    }));
  }

  buildRecommendation(evaluations: SolutionEvaluation[]): SolutionRecommendation | null {
    const top = evaluations[0] || null;
    const rejectedCategories = evaluations.flatMap((evaluation): RejectedSolutionCategory[] => {
      const reasons = rejectedReasons(evaluation);
      return reasons.length ? [{ category: evaluation.candidate.category, rejectedReasons: reasons, rationale: evaluation.rationale, assumptions: evaluation.assumptions, risks: evaluation.risks, supportingEvidenceReferences: evaluation.supportingEvidenceReferences, missingEvidence: evaluation.missingEvidence }] : [];
    });
    if (!top) return null;
    const topReasons = rejectedReasons(top);
    if (topReasons.length > 0) {
      return {
        recommendedCategory: null,
        recommendedCandidate: null,
        evaluation: null,
        rationale: ["No solution category passed the conservative diagnostic recommendation thresholds.", ...topReasons],
        assumptions: top.assumptions,
        risks: top.risks,
        supportingEvidenceReferences: top.supportingEvidenceReferences,
        missingEvidence: top.missingEvidence,
        rejectedCategories,
      };
    }
    return { recommendedCategory: top.candidate.category, recommendedCandidate: top.candidate, evaluation: top, rationale: top.rationale, assumptions: top.assumptions, risks: top.risks, supportingEvidenceReferences: top.supportingEvidenceReferences, missingEvidence: top.missingEvidence, rejectedCategories };
  }

  run(input: SolutionIntelligenceInput): SolutionIntelligenceResult {
    const validation = validateSolutionIntelligenceInput(input);
    const evaluatedAt = normalizedDate(input.evaluatedAt);
    const evaluations = validation.valid ? this.evaluateCategories(input) : [];
    const recommendation = validation.valid ? this.buildRecommendation(evaluations) : null;
    const rejectedCategories = recommendation?.rejectedCategories || [];
    const lowConfidenceReasonCount = rejectedCategories.reduce((sum, item) => sum + item.rejectedReasons.filter((reason) => reason.toLowerCase().includes("confidence")).length, 0);
    const missingEvidenceCount = evaluations.reduce((sum, item) => sum + item.missingEvidence.length, 0);
    const warnings = [
      ...validation.errors,
      ...(recommendation?.recommendedCategory ? [] : ["No solution category has enough deterministic evidence for a safe recommendation."]),
    ];
    const diagnostics = createEmptySolutionIntelligenceDiagnostics({
      evaluatedCategoryCount: evaluations.length,
      rejectedCategoryCount: rejectedCategories.length,
      recommendedCategory: recommendation?.recommendedCategory || null,
      lowConfidenceReasonCount,
      missingEvidenceCount,
      fallbackUsed: false,
      warnings,
    });
    const result: SolutionIntelligenceResult = {
      runId: input.runId || `solution-${evaluatedAt}`,
      evaluatedAt,
      evaluations,
      rejectedCategories,
      recommendation,
      diagnostics,
      warnings,
    };
    const resultValidation = validateSolutionIntelligenceResult(result);
    if (!resultValidation.valid) throw new Error(`Invalid solution intelligence result: ${resultValidation.errors.join(" ")}`);
    return result;
  }
}

export function runSolutionIntelligence(input: SolutionIntelligenceInput) {
  return new SolutionIntelligenceEngine().run(input);
}

export function scoreForDiagnostics(value: number) {
  return normalizeSolutionScore(value);
}
