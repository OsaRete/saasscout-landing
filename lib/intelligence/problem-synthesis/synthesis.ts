import type { Evidence } from "../../evidence";
import type { ProblemSynthesisCandidate, ProblemSynthesisDiagnostics, ProblemSynthesisInput, ProblemSynthesisResult, ProblemScoreBreakdown } from "./types";

function clampScore(value: unknown, fallback = 0) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, score));
}

function average(values: unknown[], fallback = 0) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function sentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function evidenceReference(evidence: Evidence) {
  return [evidence.deduplicationFingerprint, evidence.sourceName, evidence.sourceUrl].filter(Boolean).join(" — ");
}

function primaryTitle(input: ProblemSynthesisInput) {
  const candidates = [
    ...(input.opportunityDetection?.candidates || []),
    ...(input.painDetection?.candidates || []),
    ...(input.patternDetection?.candidates || []),
    ...(input.trendDetection?.candidates || []),
    ...(input.monetizationEvaluation?.candidates || []),
    ...(input.confidenceEvaluation?.candidates || []),
  ];

  const ranked = candidates
    .map((candidate) => ({ title: candidate.title, normalizedTitle: candidate.normalizedTitle, score: clampScore(candidate.score?.totalScore, 0), rank: candidate.rank || 999 }))
    .sort((a, b) => b.score - a.score || a.rank - b.rank || a.normalizedTitle.localeCompare(b.normalizedTitle));

  return ranked[0]?.title || input.evidence.find((item) => item.detectedProblemTitle)?.detectedProblemTitle || "Synthesized market problem";
}

function canonicalCluster(title: string, input: ProblemSynthesisInput) {
  return input.opportunityDetection?.candidates[0]?.context.primaryTheme || input.patternDetection?.candidates[0]?.context.primaryTheme || input.trendDetection?.candidates[0]?.context.primaryTheme || normalize(title) || "general_problem";
}

function suggestedSolutions(input: ProblemSynthesisInput) {
  const opportunitySolutions = (input.opportunityDetection?.candidates || []).map((candidate) => {
    const underserved = candidate.marketContext.underservedSignals[0];
    return underserved ? `Workflow product addressing ${underserved}` : `Focused solution for ${candidate.marketContext.primaryProblem}`;
  });
  const monetizationSolutions = (input.monetizationEvaluation?.candidates || []).map((candidate) => `${candidate.pricingHypothesis.replaceAll("_", " ")} SaaS for ${candidate.context.primaryProblem}`);
  return unique([...opportunitySolutions, ...monetizationSolutions]).slice(0, 5);
}

function buildScoreBreakdown(input: ProblemSynthesisInput): ProblemScoreBreakdown {
  const evidence = input.evidence;
  const confidenceScores = input.confidenceEvaluation?.candidates.map((candidate) => candidate.score.totalScore) || [];
  const breakdown = {
    painScore: average(input.painDetection?.candidates.map((candidate) => candidate.score.totalScore) || evidence.map((item) => item.painIntensity), 0),
    urgencyScore: average(input.opportunityDetection?.candidates.map((candidate) => candidate.score.problemUrgencyScore) || [], average(evidence.map((item) => item.painIntensity), 0)),
    frequencyScore: average(evidence.map((item) => item.frequencySignal), 0),
    trendScore: average(input.trendDetection?.candidates.map((candidate) => candidate.score.totalScore) || [], 0),
    opportunityScore: average(input.opportunityDetection?.candidates.map((candidate) => candidate.score.totalScore) || [], 0),
    revenueScore: average(input.monetizationEvaluation?.candidates.map((candidate) => candidate.score.totalScore) || [], 0),
    buyingSignalScore: average(evidence.map((item) => item.buyingIntentSignal), 0),
    sourceQualityScore: average(evidence.map((item) => item.sourceQualityScore), 0),
    confidenceScore: average(confidenceScores, average(evidence.map((item) => item.confidenceScore), 0)),
    totalScore: 0,
  };
  breakdown.totalScore = average(Object.entries(breakdown).filter(([key]) => key !== "totalScore").map(([, value]) => value), 0);
  return Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, Math.round(clampScore(value, 0) * 100) / 100])) as ProblemScoreBreakdown;
}

function completeness(input: ProblemSynthesisInput, evidenceCount: number) {
  const checks = [
    evidenceCount > 0,
    Boolean(input.painDetection?.candidates.length),
    Boolean(input.patternDetection?.candidates.length),
    Boolean(input.trendDetection?.candidates.length),
    Boolean(input.opportunityDetection?.candidates.length),
    Boolean(input.monetizationEvaluation?.candidates.length),
    Boolean(input.confidenceEvaluation?.candidates.length),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100) / 100;
}

export class ProblemIntelligenceSynthesisEngine {
  run(input: ProblemSynthesisInput): ProblemSynthesisResult {
    const runId = input.runId || "problem_synthesis_dry_run";
    const synthesizedAt = input.synthesizedAt ? new Date(input.synthesizedAt).toISOString() : new Date().toISOString();
    const evidence = [...input.evidence].sort((a, b) => a.deduplicationFingerprint.localeCompare(b.deduplicationFingerprint));
    const evidenceReferences = evidence.map(evidenceReference);
    const claims = unique(evidence.map((item) => item.extractedClaim || item.detectedProblemTitle || item.capturedText)).slice(0, 5);
    const markets = unique(evidence.map((item) => item.market || item.nicheCategory));
    const audiences = unique(evidence.map((item) => item.audience || item.nicheCategory));
    const sourceNames = unique(evidence.map((item) => item.sourceName));
    const title = primaryTitle(input);
    const scoreBreakdown = buildScoreBreakdown(input);
    const confidence = Math.round(clampScore(scoreBreakdown.confidenceScore || scoreBreakdown.totalScore, 0) * 100) / 100;
    const conciseEvidenceSummary = claims.length > 0 ? claims.slice(0, 3).map(sentence).join(" ") : "No reusable evidence claims were available for synthesis.";
    const synthesizedSummary = sentence(`${title} is supported by ${evidence.length} evidence item${evidence.length === 1 ? "" : "s"}${markets.length ? ` across ${markets.slice(0, 3).join(", ")}` : ""}${audiences.length ? ` for ${audiences.slice(0, 3).join(", ")}` : ""}`);
    const warnings = evidence.length === 0 ? ["Problem synthesis produced no candidates because no normalized evidence was available."] : [];
    const diagnostic: ProblemSynthesisDiagnostics = {
      synthesizedTitle: title,
      synthesizedSummary,
      evidenceCount: evidence.length,
      evidenceReferences,
      confidence,
      synthesisCompleteness: completeness(input, evidence.length),
      engineCandidateCounts: {
        pain: input.painDetection?.candidates.length || 0,
        pattern: input.patternDetection?.candidates.length || 0,
        trend: input.trendDetection?.candidates.length || 0,
        opportunity: input.opportunityDetection?.candidates.length || 0,
        monetization: input.monetizationEvaluation?.candidates.length || 0,
        confidence: input.confidenceEvaluation?.candidates.length || 0,
        feedback: input.feedbackLearning?.signals.length || 0,
      },
      warnings,
    };
    const candidates: ProblemSynthesisCandidate[] = evidence.length === 0 ? [] : [{
      id: `${runId}:problem-synthesis:${normalize(title) || "candidate"}`,
      synthesizedProblemTitle: title,
      synthesizedSummary,
      affectedMarkets: markets,
      affectedAudiences: audiences,
      suggestedSolutions: suggestedSolutions(input),
      conciseEvidenceSummary,
      canonicalProblemCluster: canonicalCluster(title, input),
      scoreBreakdown,
      supportingEvidenceReferences: evidenceReferences,
      confidence,
      narrative: { title, summary: synthesizedSummary, primaryTheme: canonicalCluster(title, input), rationale: ["Deterministically selected the strongest engine title.", "Synthesized evidence, market, audience, score, and confidence signals without AI."] },
      evidenceSummary: { evidenceCount: evidence.length, sourceCount: sourceNames.length, sourceNames, markets, audiences, claims, references: evidenceReferences, summary: conciseEvidenceSummary },
      diagnostics: diagnostic,
    }];

    return {
      runId,
      synthesizedAt,
      candidates,
      diagnostics: [diagnostic],
      warnings,
      summary: { evidenceCount: evidence.length, candidateCount: candidates.length, averageConfidence: confidence, averageCompleteness: diagnostic.synthesisCompleteness },
    };
  }
}
