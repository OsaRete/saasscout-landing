import type { DiscoveryModularPipelineResult } from "./types";
import type { OpportunityCandidate } from "../engines/opportunity";
import type { PainCandidate } from "../engines/pain";
import type { ProblemSynthesisCandidate } from "./problem-synthesis";

export type PersistencePlanWarningCode =
  | "missing_orchestrator_candidates"
  | "fallback_field_used"
  | "invalid_planned_row";

export type PersistencePlanWarning = {
  code: PersistencePlanWarningCode;
  message: string;
  rowIndex?: number;
  field?: keyof PlannedDiscoveredProblem;
};

export type PlannedDiscoveredProblem = {
  discovery_id: string;
  user_id: string;
  problem_title: string;
  problem_summary: string;
  affected_niches: string;
  suggested_solutions: string;
  pain_score: number;
  revenue_score: number;
  urgency_score: number;
  trend_score: number;
  buying_signal_score: number;
  frequency_score: number;
  source_quality_score: number;
  opportunity_score: number;
  problem_cluster: string;
  build_difficulty: string;
  source_evidence: string;
};

export type PlannedProblemFieldSource = Partial<Record<keyof PlannedDiscoveredProblem, string>>;

type ScoreField =
  | "pain_score"
  | "revenue_score"
  | "urgency_score"
  | "trend_score"
  | "buying_signal_score"
  | "frequency_score"
  | "source_quality_score"
  | "opportunity_score";

type PlanRowSource = "problem_synthesis" | "seed_fallback" | "mixed_fallback";

type ScoreMappingDiagnostic = {
  source: "engine" | "fallback";
  inputScale: "0-10";
  persistedScale: "1-10" | "1-100";
  rawValue: number | null;
  persistedValue: number;
};

type ScoreMappingDiagnostics = Partial<Record<ScoreField, ScoreMappingDiagnostic>>;

type BuildDifficultyDiagnostic = {
  source: "mapped_opportunity_signal" | "fallback";
  opportunityCandidateId: string | null;
  rawBuildSimplicityScore: number | null;
  persistedValue: string;
  attribution: "normalized_title_match" | "unavailable" | "ambiguous";
};

export type PersistencePlanDiagnostics = {
  dry_run: true;
  planned_row_count: number;
  valid_row_count: number;
  invalid_row_count: number;
  source_candidate_counts: {
    pain: number;
    pattern: number;
    trend: number;
    opportunity: number;
    monetization: number;
    confidence: number;
    deduplication_groups: number;
    problem_synthesis: number;
  };
  row_sources: Array<{ rowIndex: number; source: PlanRowSource }>;
  fallback_fields_by_row: Array<{ rowIndex: number; fields: Array<keyof PlannedDiscoveredProblem> }>;
  field_sources_by_row: Array<{ rowIndex: number; sources: PlannedProblemFieldSource }>;
  score_mappings_by_row: Array<{ rowIndex: number; mappings: ScoreMappingDiagnostics }>;
  build_difficulty_by_row: Array<{ rowIndex: number; diagnostic: BuildDifficultyDiagnostic }>;
  warnings: PersistencePlanWarning[];
};

export type DiscoveryPersistencePlan = {
  dryRun: true;
  rows: PlannedDiscoveredProblem[];
  diagnostics: PersistencePlanDiagnostics;
};

type PlanOptions = {
  discoveryId?: string | null;
  userId?: string | null;
  maxRows?: number;
};

type ValidationResult = {
  valid: boolean;
  errors: PersistencePlanWarning[];
};

const DISCOVERY_ID_PLACEHOLDER = "__DISCOVERY_ID__";
const USER_ID_PLACEHOLDER = "__USER_ID__";
const DEFAULT_NICHES = "Small businesses | Solo founders | Service providers";
const DEFAULT_SOLUTIONS = "Workflow automation tool | Lightweight operating system | AI assistant";
const DEFAULT_EVIDENCE = "Orchestrator dry-run signals suggest repeated workflow friction, but persistence remains disabled.";
const PLAN_FIELDS = [
  "discovery_id",
  "user_id",
  "problem_title",
  "problem_summary",
  "affected_niches",
  "suggested_solutions",
  "pain_score",
  "revenue_score",
  "urgency_score",
  "trend_score",
  "buying_signal_score",
  "frequency_score",
  "source_quality_score",
  "opportunity_score",
  "problem_cluster",
  "build_difficulty",
  "source_evidence",
] as const satisfies ReadonlyArray<keyof PlannedDiscoveredProblem>;

export function clampPersistedOneToTen(value: unknown, fallback = 7) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(1, score));
}

export function clampPersistedOpportunityScore(value: unknown, fallback = 70) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(100, Math.max(1, Math.round(score)));
}

export function engineScoreToPersistedOneToTen(value: unknown, fallback = 7) {
  return clampPersistedOneToTen(value, fallback);
}

export function engineScoreToPersistedOpportunityScore(value: unknown, fallback = 70) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return clampPersistedOpportunityScore(score * 10, fallback);
}

export function safeAverageScore(values: unknown[], fallback = 7) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function joinUnique(values: Array<string | null | undefined>, fallback: string) {
  const items = [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
  return items.length > 0 ? items.join(" | ") : fallback;
}

function hasId(candidate: { id: string }, ids: string[]) {
  return ids.includes(candidate.id);
}

function findByNormalizedTitle<T extends { normalizedTitle: string }>(items: T[], title: string) {
  return items.find((item) => item.normalizedTitle === title);
}

function collectEvidenceClaims(candidate: {
  evidence?: Array<{ claim?: string; sourceName?: string | null; sourceUrl?: string | null }>;
}) {
  return (candidate.evidence || [])
    .slice(0, 3)
    .map((evidence) => [evidence.claim, evidence.sourceName, evidence.sourceUrl].filter(Boolean).join(" — "))
    .filter(Boolean);
}

function sourceForRow(fallbackFields: Array<keyof PlannedDiscoveredProblem>, primary: "problem_synthesis" | "seed_fallback"): PlanRowSource {
  if (primary === "seed_fallback") return "seed_fallback";
  return fallbackFields.length > 0 ? "mixed_fallback" : "problem_synthesis";
}

function buildDifficultyFromSimplicityScore(value: unknown) {
  const simplicity = Number(value);
  if (!Number.isFinite(simplicity)) return "Medium";
  if (simplicity >= 7.5) return "Easy";
  if (simplicity <= 4) return "Hard";
  return "Medium";
}

function buildDifficulty(opportunity?: OpportunityCandidate) {
  return buildDifficultyFromSimplicityScore(opportunity?.score.buildSimplicityScore);
}

function normalizedMatchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function resolveBuildDifficultyForSynthesisCandidate(
  candidate: ProblemSynthesisCandidate,
  opportunities: OpportunityCandidate[]
): BuildDifficultyDiagnostic {
  const title = normalizedMatchValue(candidate.synthesizedProblemTitle);
  const matches = opportunities.filter((opportunity) => normalizedMatchValue(opportunity.normalizedTitle || opportunity.title) === title);

  if (matches.length === 1) {
    const rawBuildSimplicityScore = Number(matches[0].score.buildSimplicityScore);
    if (Number.isFinite(rawBuildSimplicityScore)) {
      return {
        source: "mapped_opportunity_signal",
        opportunityCandidateId: matches[0].id,
        rawBuildSimplicityScore,
        persistedValue: buildDifficultyFromSimplicityScore(rawBuildSimplicityScore),
        attribution: "normalized_title_match",
      };
    }
  }

  return {
    source: "fallback",
    opportunityCandidateId: null,
    rawBuildSimplicityScore: null,
    persistedValue: "Medium",
    attribution: matches.length > 1 ? "ambiguous" : "unavailable",
  };
}

function validatePlannedDiscoveredProblem(row: PlannedDiscoveredProblem, rowIndex = 0): ValidationResult {
  const errors: PersistencePlanWarning[] = [];

  for (const field of PLAN_FIELDS) {
    if (!(field in row)) {
      errors.push({ code: "invalid_planned_row", message: `Missing ${field}.`, rowIndex, field });
    }
  }

  for (const field of ["discovery_id", "user_id", "problem_title", "problem_summary", "affected_niches", "suggested_solutions", "problem_cluster", "build_difficulty", "source_evidence"] as const) {
    if (typeof row[field] !== "string" || !row[field].trim()) {
      errors.push({ code: "invalid_planned_row", message: `${field} must be a non-empty string.`, rowIndex, field });
    }
  }

  for (const field of ["pain_score", "revenue_score", "urgency_score", "trend_score", "buying_signal_score", "frequency_score", "source_quality_score"] as const) {
    if (!Number.isFinite(row[field]) || row[field] < 1 || row[field] > 10) {
      errors.push({ code: "invalid_planned_row", message: `${field} must be between 1 and 10.`, rowIndex, field });
    }
  }

  if (!Number.isFinite(row.opportunity_score) || row.opportunity_score < 1 || row.opportunity_score > 100) {
    errors.push({ code: "invalid_planned_row", message: "opportunity_score must be between 1 and 100.", rowIndex, field: "opportunity_score" });
  }

  if (!["Easy", "Medium", "Hard"].includes(row.build_difficulty)) {
    errors.push({ code: "invalid_planned_row", message: "build_difficulty must be Easy, Medium, or Hard.", rowIndex, field: "build_difficulty" });
  }

  return { valid: errors.length === 0, errors };
}

export function isPlannedDiscoveredProblem(row: PlannedDiscoveredProblem) {
  return validatePlannedDiscoveredProblem(row).valid;
}

export function validateDiscoveryPersistencePlanRows(rows: PlannedDiscoveredProblem[]) {
  return rows.map((row, rowIndex) => validatePlannedDiscoveredProblem(row, rowIndex));
}

export function buildDiscoveryPersistencePlan(
  orchestratorResult: DiscoveryModularPipelineResult,
  { discoveryId = DISCOVERY_ID_PLACEHOLDER, userId = USER_ID_PLACEHOLDER, maxRows = 8 }: PlanOptions = {}
): DiscoveryPersistencePlan {
  const pain = orchestratorResult.outputs.painDetection?.candidates || [];
  const patterns = orchestratorResult.outputs.patternDetection?.candidates || [];
  const trends = orchestratorResult.outputs.trendDetection?.candidates || [];
  const opportunities = orchestratorResult.outputs.opportunityDetection?.candidates || [];
  const monetization = orchestratorResult.outputs.monetizationEvaluation?.candidates || [];
  const confidence = orchestratorResult.outputs.confidenceEvaluation?.candidates || [];
  const groups = orchestratorResult.outputs.semanticProblemDeduplication?.groups || [];
  const synthesisCandidates = orchestratorResult.outputs.problemIntelligenceSynthesis?.candidates || [];
  const warnings: PersistencePlanWarning[] = [];

  if (synthesisCandidates.length === 0 && opportunities.length === 0 && pain.length === 0) {
    warnings.push({ code: "missing_orchestrator_candidates", message: "No problem synthesis, opportunity, or pain candidates were available for persistence planning." });
  }

  const buildSeedRows = () => {
    const seedCandidates = (opportunities.length > 0 ? opportunities : pain).slice(0, maxRows);
    return seedCandidates.map((seed, rowIndex) => {
      const opportunity = "marketContext" in seed ? (seed as OpportunityCandidate) : undefined;
      const painIds = opportunity?.context.painCandidateIds || [(seed as PainCandidate).id].filter(Boolean);
      const patternIds = opportunity?.context.patternCandidateIds || [];
      const trendIds = opportunity?.context.trendCandidateIds || [];
      const relatedPain = pain.filter((candidate) => hasId(candidate, painIds));
      const relatedPattern = patterns.filter((candidate) => hasId(candidate, patternIds));
      const relatedTrend = trends.filter((candidate) => hasId(candidate, trendIds));
      const relatedMonetization = monetization.find((candidate) => candidate.context.opportunityCandidateIds.some((id) => opportunity?.id === id)) || findByNormalizedTitle(monetization, seed.normalizedTitle);
      const relatedConfidence = confidence.find((candidate) => candidate.context.opportunityCandidateIds.some((id) => opportunity?.id === id)) || findByNormalizedTitle(confidence, seed.normalizedTitle);
      const relatedGroup = groups.find((group) => group.candidates.some((candidate) => candidate.opportunityCandidateIds.includes(opportunity?.id || "") || candidate.painCandidateIds.some((id) => painIds.includes(id))));
      const sources: PlannedProblemFieldSource = {};
      const scoreMappings: ScoreMappingDiagnostics = {};
      const mapEngineScore = (field: Exclude<ScoreField, "opportunity_score">, value: unknown, fallback = 7) => {
        const raw = Number(value);
        const hasEngineValue = Number.isFinite(raw);
        const persistedValue = engineScoreToPersistedOneToTen(value, fallback);
        scoreMappings[field] = {
          source: hasEngineValue ? "engine" : "fallback",
          inputScale: "0-10",
          persistedScale: "1-10",
          rawValue: hasEngineValue ? raw : null,
          persistedValue,
        };
        return persistedValue;
      };
      const mapEngineOpportunityScore = (value: unknown, fallback = 70) => {
        const raw = Number(value);
        const hasEngineValue = Number.isFinite(raw);
        const persistedValue = engineScoreToPersistedOpportunityScore(value, fallback);
        scoreMappings.opportunity_score = {
          source: hasEngineValue ? "engine" : "fallback",
          inputScale: "0-10",
          persistedScale: "1-100",
          rawValue: hasEngineValue ? raw : null,
          persistedValue,
        };
        return persistedValue;
      };
      const fallbackFields: Array<keyof PlannedDiscoveredProblem> = [];
      const rawBuildSimplicityScore = Number(opportunity?.score.buildSimplicityScore);
      const buildDifficultyDiagnostic: BuildDifficultyDiagnostic = {
        source: opportunity && Number.isFinite(rawBuildSimplicityScore) ? "mapped_opportunity_signal" : "fallback",
        opportunityCandidateId: opportunity?.id || null,
        rawBuildSimplicityScore: Number.isFinite(rawBuildSimplicityScore) ? rawBuildSimplicityScore : null,
        persistedValue: buildDifficulty(opportunity),
        attribution: opportunity ? "normalized_title_match" : "unavailable",
      };
      const useFallback = (field: keyof PlannedDiscoveredProblem, source: string) => {
        fallbackFields.push(field);
        sources[field] = source;
      };
      const title = text(seed.title, `Orchestrator Market Problem ${rowIndex + 1}`);
      if (!seed.title) useFallback("problem_title", "fallback:title"); else sources.problem_title = "orchestrator:seed_candidate.title";

      const evidenceClaims = [
        ...collectEvidenceClaims(seed),
        ...relatedPain.flatMap(collectEvidenceClaims),
        ...(relatedMonetization ? collectEvidenceClaims(relatedMonetization) : []),
      ];
      const painRawScore = relatedPain.length > 0 ? safeAverageScore(relatedPain.map((candidate) => candidate.score.totalScore)) : seed.score?.totalScore;
      const trendRawScore = relatedTrend.length > 0 ? safeAverageScore(relatedTrend.map((candidate) => candidate.score.totalScore)) : undefined;
      const frequencyRawScore = relatedPain.length > 0 || relatedPattern.length > 0
        ? safeAverageScore([...relatedPain.map((candidate) => candidate.score.frequencyScore), ...relatedPattern.map((candidate) => candidate.score.frequencyScore)])
        : undefined;
      const sourceQualityRawScores = [relatedConfidence?.score.evidenceQualityScore, opportunity?.score.evidenceScore, ...relatedPain.map((candidate) => candidate.score.evidenceScore)].filter((score) => Number.isFinite(Number(score)));
      const sourceQualityRawScore = sourceQualityRawScores.length > 0 ? safeAverageScore(sourceQualityRawScores) : undefined;
      const row: PlannedDiscoveredProblem = {
        discovery_id: discoveryId || DISCOVERY_ID_PLACEHOLDER,
        user_id: userId || USER_ID_PLACEHOLDER,
        problem_title: title,
        problem_summary: text(opportunity?.marketContext.primaryProblem || relatedGroup?.canonical.title, `${title} appears in orchestrator dry-run signals and needs validation before persistence.`),
        affected_niches: joinUnique([opportunity?.context.nicheCategory, opportunity?.context.audience, opportunity?.context.market, ...relatedPain.map((candidate) => candidate.context.nicheCategory), ...relatedPattern.flatMap((candidate) => candidate.context.niches)], DEFAULT_NICHES),
        suggested_solutions: joinUnique([...(opportunity?.marketContext.underservedSignals || []), ...(opportunity?.marketContext.existingSolutionSignals || [])], DEFAULT_SOLUTIONS),
        pain_score: mapEngineScore("pain_score", painRawScore, 7),
        revenue_score: mapEngineScore("revenue_score", relatedMonetization?.score.totalScore, 7),
        urgency_score: mapEngineScore("urgency_score", opportunity?.score.problemUrgencyScore ?? seed.score?.totalScore, 7),
        trend_score: mapEngineScore("trend_score", trendRawScore, 7),
        buying_signal_score: mapEngineScore("buying_signal_score", relatedMonetization?.score.willingnessToPayScore ?? opportunity?.score.marketPullScore, 7),
        frequency_score: mapEngineScore("frequency_score", frequencyRawScore, 7),
        source_quality_score: mapEngineScore("source_quality_score", sourceQualityRawScore, 7),
        opportunity_score: mapEngineOpportunityScore(opportunity?.score.totalScore ?? seed.score?.totalScore, 70),
        problem_cluster: text(opportunity?.context.primaryTheme || relatedPattern[0]?.title || relatedGroup?.canonical.title, "General Workflow"),
        build_difficulty: buildDifficulty(opportunity),
        source_evidence: evidenceClaims.length > 0 ? evidenceClaims.join(" | ") : DEFAULT_EVIDENCE,
      };

      sources.discovery_id = discoveryId ? "planner:provided_placeholder" : "fallback:discovery_id_placeholder";
      sources.user_id = userId ? "planner:provided_placeholder" : "fallback:user_id_placeholder";
      sources.problem_summary = opportunity?.marketContext.primaryProblem ? "orchestrator:opportunity.marketContext.primaryProblem" : relatedGroup?.canonical.title ? "orchestrator:deduplication.canonical.title" : "fallback:summary";
      sources.affected_niches = row.affected_niches === DEFAULT_NICHES ? "fallback:affected_niches" : "orchestrator:candidate.context";
      sources.suggested_solutions = row.suggested_solutions === DEFAULT_SOLUTIONS ? "fallback:suggested_solutions" : "orchestrator:opportunity.marketContext.solution_signals";
      sources.pain_score = scoreMappings.pain_score?.source === "engine" ? "orchestrator:engine.0-10:pain_score" : "fallback:pain_score";
      sources.revenue_score = scoreMappings.revenue_score?.source === "engine" ? "orchestrator:engine.0-10:monetization.score.totalScore" : "fallback:revenue_score";
      sources.urgency_score = scoreMappings.urgency_score?.source === "engine" ? "orchestrator:engine.0-10:opportunity.score.problemUrgencyScore" : "fallback:urgency_score";
      sources.trend_score = scoreMappings.trend_score?.source === "engine" ? "orchestrator:engine.0-10:trend.score.totalScore" : "fallback:trend_score";
      sources.buying_signal_score = scoreMappings.buying_signal_score?.source === "engine" ? "orchestrator:engine.0-10:buying_signal_score" : "fallback:buying_signal_score";
      sources.frequency_score = scoreMappings.frequency_score?.source === "engine" ? "orchestrator:engine.0-10:pain_pattern.frequencyScore" : "fallback:frequency_score";
      sources.source_quality_score = scoreMappings.source_quality_score?.source === "engine" ? "orchestrator:engine.0-10:confidence_or_evidence_score" : "fallback:source_quality_score";
      sources.opportunity_score = scoreMappings.opportunity_score?.source === "engine" ? "orchestrator:engine.0-10:opportunity.score.totalScore" : "fallback:opportunity_score";
      sources.problem_cluster = row.problem_cluster === "General Workflow" ? "fallback:problem_cluster" : "orchestrator:theme_or_deduplication";
      sources.build_difficulty = buildDifficultyDiagnostic.source === "mapped_opportunity_signal" ? "orchestrator:opportunity.score.buildSimplicityScore" : "fallback:build_difficulty";
      sources.source_evidence = evidenceClaims.length > 0 ? "orchestrator:candidate.evidence" : "fallback:source_evidence";

      for (const [field, source] of Object.entries(sources) as Array<[keyof PlannedDiscoveredProblem, string]>) {
        if (source.startsWith("fallback:")) fallbackFields.push(field);
      }

      const uniqueFallbackFields = [...new Set(fallbackFields)];
      return { row, sources, scoreMappings, buildDifficultyDiagnostic, fallbackFields: uniqueFallbackFields, rowSource: sourceForRow(uniqueFallbackFields, "seed_fallback") };
    });
  };

  const buildSynthesisRows = () => synthesisCandidates.slice(0, maxRows).map((candidate: ProblemSynthesisCandidate, rowIndex) => {
    const sources: PlannedProblemFieldSource = {};
    const scoreMappings: ScoreMappingDiagnostics = {};
    const fallbackFields: Array<keyof PlannedDiscoveredProblem> = [];
    const mapSynthesisScore = (field: Exclude<ScoreField, "opportunity_score">, value: unknown, fallback = 7) => {
      const raw = Number(value);
      const hasEngineValue = Number.isFinite(raw);
      const persistedValue = engineScoreToPersistedOneToTen(value, fallback);
      scoreMappings[field] = { source: hasEngineValue ? "engine" : "fallback", inputScale: "0-10", persistedScale: "1-10", rawValue: hasEngineValue ? raw : null, persistedValue };
      return persistedValue;
    };
    const mapSynthesisOpportunityScore = (value: unknown, fallback = 70) => {
      const raw = Number(value);
      const hasEngineValue = Number.isFinite(raw);
      const persistedValue = engineScoreToPersistedOpportunityScore(value, fallback);
      scoreMappings.opportunity_score = { source: hasEngineValue ? "engine" : "fallback", inputScale: "0-10", persistedScale: "1-100", rawValue: hasEngineValue ? raw : null, persistedValue };
      return persistedValue;
    };
    const mark = (field: keyof PlannedDiscoveredProblem, source: string) => {
      sources[field] = source;
      if (source.startsWith("fallback:")) fallbackFields.push(field);
    };
    const buildDifficultyDiagnostic = resolveBuildDifficultyForSynthesisCandidate(candidate, opportunities);
    const title = text(candidate.synthesizedProblemTitle, `Synthesized Market Problem ${rowIndex + 1}`);
    const summary = text(candidate.synthesizedSummary, `${title} appears in problem synthesis signals and needs validation before persistence.`);
    const affected = joinUnique([...candidate.affectedMarkets, ...candidate.affectedAudiences], DEFAULT_NICHES);
    const solutions = joinUnique(candidate.suggestedSolutions, DEFAULT_SOLUTIONS);
    const evidence = text(candidate.conciseEvidenceSummary || candidate.supportingEvidenceReferences.slice(0, 3).join(" | "), DEFAULT_EVIDENCE);
    const row: PlannedDiscoveredProblem = {
      discovery_id: discoveryId || DISCOVERY_ID_PLACEHOLDER,
      user_id: userId || USER_ID_PLACEHOLDER,
      problem_title: title,
      problem_summary: summary,
      affected_niches: affected,
      suggested_solutions: solutions,
      pain_score: mapSynthesisScore("pain_score", candidate.scoreBreakdown?.painScore, 7),
      revenue_score: mapSynthesisScore("revenue_score", candidate.scoreBreakdown?.revenueScore, 7),
      urgency_score: mapSynthesisScore("urgency_score", candidate.scoreBreakdown?.urgencyScore, 7),
      trend_score: mapSynthesisScore("trend_score", candidate.scoreBreakdown?.trendScore, 7),
      buying_signal_score: mapSynthesisScore("buying_signal_score", candidate.scoreBreakdown?.buyingSignalScore, 7),
      frequency_score: mapSynthesisScore("frequency_score", candidate.scoreBreakdown?.frequencyScore, 7),
      source_quality_score: mapSynthesisScore("source_quality_score", candidate.scoreBreakdown?.sourceQualityScore ?? candidate.confidence, 7),
      opportunity_score: mapSynthesisOpportunityScore(candidate.scoreBreakdown?.opportunityScore ?? candidate.scoreBreakdown?.totalScore, 70),
      problem_cluster: text(candidate.canonicalProblemCluster, "General Workflow"),
      build_difficulty: buildDifficultyDiagnostic.persistedValue,
      source_evidence: evidence,
    };
    mark("discovery_id", discoveryId ? "planner:provided_placeholder" : "fallback:discovery_id_placeholder");
    mark("user_id", userId ? "planner:provided_placeholder" : "fallback:user_id_placeholder");
    mark("problem_title", candidate.synthesizedProblemTitle ? "orchestrator:problem_synthesis.synthesizedProblemTitle" : "fallback:title");
    mark("problem_summary", candidate.synthesizedSummary ? "orchestrator:problem_synthesis.synthesizedSummary" : "fallback:summary");
    mark("affected_niches", affected === DEFAULT_NICHES ? "fallback:affected_niches" : "orchestrator:problem_synthesis.affectedMarkets_affectedAudiences");
    mark("suggested_solutions", solutions === DEFAULT_SOLUTIONS ? "fallback:suggested_solutions" : "orchestrator:problem_synthesis.suggestedSolutions");
    mark("pain_score", scoreMappings.pain_score?.source === "engine" ? "orchestrator:problem_synthesis.scoreBreakdown.painScore" : "fallback:pain_score");
    mark("revenue_score", scoreMappings.revenue_score?.source === "engine" ? "orchestrator:problem_synthesis.scoreBreakdown.revenueScore" : "fallback:revenue_score");
    mark("urgency_score", scoreMappings.urgency_score?.source === "engine" ? "orchestrator:problem_synthesis.scoreBreakdown.urgencyScore" : "fallback:urgency_score");
    mark("trend_score", scoreMappings.trend_score?.source === "engine" ? "orchestrator:problem_synthesis.scoreBreakdown.trendScore" : "fallback:trend_score");
    mark("buying_signal_score", scoreMappings.buying_signal_score?.source === "engine" ? "orchestrator:problem_synthesis.scoreBreakdown.buyingSignalScore" : "fallback:buying_signal_score");
    mark("frequency_score", scoreMappings.frequency_score?.source === "engine" ? "orchestrator:problem_synthesis.scoreBreakdown.frequencyScore" : "fallback:frequency_score");
    mark("source_quality_score", scoreMappings.source_quality_score?.source === "engine" ? "orchestrator:problem_synthesis.scoreBreakdown.sourceQualityScore_or_confidence" : "fallback:source_quality_score");
    mark("opportunity_score", scoreMappings.opportunity_score?.source === "engine" ? "orchestrator:problem_synthesis.scoreBreakdown.opportunityScore" : "fallback:opportunity_score");
    mark("problem_cluster", row.problem_cluster === "General Workflow" ? "fallback:problem_cluster" : "orchestrator:problem_synthesis.canonicalProblemCluster");
    mark("build_difficulty", buildDifficultyDiagnostic.source === "mapped_opportunity_signal" ? "orchestrator:opportunity.score.buildSimplicityScore:mapped_by_normalized_title" : "fallback:build_difficulty");
    mark("source_evidence", evidence === DEFAULT_EVIDENCE ? "fallback:source_evidence" : "orchestrator:problem_synthesis.conciseEvidenceSummary");
    const uniqueFallbackFields = [...new Set(fallbackFields)];
    return { row, sources, scoreMappings, buildDifficultyDiagnostic, fallbackFields: uniqueFallbackFields, rowSource: sourceForRow(uniqueFallbackFields, "problem_synthesis") };
  });

  const rows = synthesisCandidates.length > 0 ? buildSynthesisRows() : buildSeedRows();

  const plannedRows = rows.map(({ row }) => row);
  const validation = validateDiscoveryPersistencePlanRows(plannedRows);
  validation.forEach((result) => warnings.push(...result.errors));
  rows.forEach(({ fallbackFields }, rowIndex) => {
    fallbackFields.forEach((field) => warnings.push({ code: "fallback_field_used", message: `${field} used a safe fallback while planning persistence.`, rowIndex, field }));
  });

  return {
    dryRun: true,
    rows: plannedRows,
    diagnostics: {
      dry_run: true,
      planned_row_count: plannedRows.length,
      valid_row_count: validation.filter((result) => result.valid).length,
      invalid_row_count: validation.filter((result) => !result.valid).length,
      source_candidate_counts: {
        pain: pain.length,
        pattern: patterns.length,
        trend: trends.length,
        opportunity: opportunities.length,
        monetization: monetization.length,
        confidence: confidence.length,
        deduplication_groups: groups.length,
        problem_synthesis: synthesisCandidates.length,
      },
      row_sources: rows.map(({ rowSource }, rowIndex) => ({ rowIndex, source: rowSource })),
      fallback_fields_by_row: rows.map(({ fallbackFields }, rowIndex) => ({ rowIndex, fields: fallbackFields })),
      field_sources_by_row: rows.map(({ sources }, rowIndex) => ({ rowIndex, sources })),
      score_mappings_by_row: rows.map(({ scoreMappings }, rowIndex) => ({ rowIndex, mappings: scoreMappings })),
      build_difficulty_by_row: rows.map(({ buildDifficultyDiagnostic }, rowIndex) => ({ rowIndex, diagnostic: buildDifficultyDiagnostic })),
      warnings,
    },
  };
}
