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
  selectedBuildDifficultySource: "opportunity_build_simplicity_score" | "fallback_medium";
  opportunityCandidateId: string | null;
  opportunityCandidateTitle: string | null;
  matchedOpportunityCandidateId: string | null;
  matchedOpportunityCandidateTitle: string | null;
  rawBuildSimplicityScore: number | null;
  buildSimplicityScoreUsed: number | null;
  persistedValue: string;
  confidence: number;
  matchReason: string;
  ambiguityReason: string | null;
  fallbackAvoided: boolean;
  attribution: "explicit_id_match" | "synthesis_cluster_seed_match" | "canonical_or_semantic_title_match" | "normalized_title_match" | "token_market_audience_match" | "unique_contextual_opportunity_match" | "unavailable" | "ambiguous";
  attributionMethod: "explicit_id_match" | "synthesis_cluster_seed_match" | "canonical_or_semantic_title_match" | "normalized_title_match" | "token_market_audience_match" | "unique_contextual_opportunity_match" | "unavailable" | "ambiguous";
};

type AffectedNicheEnrichmentDiagnostic = {
  source: "problem_synthesis" | "fallback";
  baseValueCount: number;
  enrichedValueCount: number;
  addedValues: string[];
  persistedValue: string;
  fallbackAvoided: boolean;
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
  affected_niche_enrichment_by_row: Array<{ rowIndex: number; diagnostic: AffectedNicheEnrichmentDiagnostic }>;
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

function collectUniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
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

const TITLE_STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with"]);

function normalizedTokenSet(value: string) {
  return new Set(normalizedMatchValue(value).split(" ").filter((token) => token.length > 2 && !TITLE_STOP_WORDS.has(token)));
}

function tokenOverlapScore(left: string, right: string) {
  const leftTokens = normalizedTokenSet(left);
  const rightTokens = normalizedTokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function overlapAny(left: string[], right: string[]) {
  const normalizedRight = new Set(right.map(normalizedMatchValue).filter(Boolean));
  return left.map(normalizedMatchValue).filter(Boolean).some((value) => normalizedRight.has(value));
}

function collectPossibleIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const ids = new Set<string>();
  const visit = (item: unknown) => {
    if (!item) return;
    if (typeof item === "string") {
      if (item.trim()) ids.add(item.trim());
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item !== "object") return;
    for (const [key, nested] of Object.entries(item as Record<string, unknown>)) {
      if (/(^id$|Id$|Ids$|_id$|_ids$)/.test(key)) visit(nested);
    }
  };
  visit(value);
  return [...ids];
}

type SynthesisSeedMatch = {
  seed: NonNullable<ProblemSynthesisCandidate["diagnostics"]>["candidateCollapseReport"]["rankedSeeds"][number];
  opportunity: OpportunityCandidate;
};

function findSynthesisSeedOpportunityMatch(candidate: ProblemSynthesisCandidate, opportunities: OpportunityCandidate[]): SynthesisSeedMatch | null {
  const rankedSeeds = candidate.diagnostics?.candidateCollapseReport?.rankedSeeds || [];
  const candidateTitle = normalizedMatchValue(candidate.synthesizedProblemTitle);
  const matchingSeeds = rankedSeeds.filter((seed) => normalizedMatchValue(seed.semanticTitle || "") === candidateTitle || normalizedMatchValue(seed.title || "") === candidateTitle);
  const seedMatches = matchingSeeds.flatMap((seed) => {
    const seedTitles = [seed.normalizedTitle, seed.title, seed.semanticTitle, seed.problemCluster].map((value) => normalizedMatchValue(value || "")).filter(Boolean);
    const seedMarkets = [seed.market].filter(Boolean);
    const seedAudiences = [seed.audience].filter(Boolean);
    return opportunities.map((opportunity) => {
      const opportunityTitles = [opportunity.normalizedTitle, opportunity.title, opportunity.context?.primaryTheme, opportunity.marketContext?.primaryProblem]
        .map((value) => normalizedMatchValue(value || ""))
        .filter(Boolean);
      const exactTitle = opportunityTitles.some((title) => seedTitles.includes(title));
      const tokenOverlap = Math.max(...seedTitles.flatMap((seedTitle) => opportunityTitles.map((title) => tokenOverlapScore(seedTitle, title))), 0);
      const marketOverlap = overlapAny(seedMarkets, [opportunity.context?.market, opportunity.marketContext?.market, opportunity.context?.nicheCategory].filter(Boolean) as string[]);
      const audienceOverlap = overlapAny(seedAudiences, [opportunity.context?.audience, opportunity.marketContext?.audience, opportunity.context?.nicheCategory].filter(Boolean) as string[]);
      const supportScore = opportunitySupportScore(opportunity);
      const deterministic = exactTitle || (tokenOverlap >= 0.6 && (marketOverlap || audienceOverlap));
      return { seed, opportunity, exactTitle, tokenOverlap, marketOverlap, audienceOverlap, deterministic, supportScore };
    });
  }).filter((match) => match.deterministic && Number.isFinite(Number(match.opportunity.score.buildSimplicityScore)));

  seedMatches.sort((a, b) => Number(b.exactTitle) - Number(a.exactTitle) || b.tokenOverlap - a.tokenOverlap || Number(b.marketOverlap) - Number(a.marketOverlap) || Number(b.audienceOverlap) - Number(a.audienceOverlap) || b.supportScore - a.supportScore);
  const best = seedMatches[0];
  if (!best) return null;
  const tied = seedMatches.filter((match) => match.exactTitle === best.exactTitle && match.tokenOverlap === best.tokenOverlap && match.marketOverlap === best.marketOverlap && match.audienceOverlap === best.audienceOverlap && match.supportScore === best.supportScore);
  return tied.length === 1 ? { seed: best.seed, opportunity: best.opportunity } : null;
}

function opportunitySupportScore(opportunity: OpportunityCandidate) {
  const total = Number(opportunity.score.totalScore);
  const evidence = Number(opportunity.score.evidenceScore);
  const confidence = Number(opportunity.score.confidenceScore);
  const evidenceCount = opportunity.evidence?.length || 0;
  return [total, evidence, confidence].filter(Number.isFinite).reduce((sum, value) => sum + value, 0) + evidenceCount / 10;
}

function resolveBuildDifficultyForSynthesisCandidate(
  candidate: ProblemSynthesisCandidate,
  opportunities: OpportunityCandidate[]
): BuildDifficultyDiagnostic {
  const synthesisTitles = [candidate.synthesizedProblemTitle, candidate.narrative?.title, candidate.diagnostics?.synthesizedTitle].map(normalizedMatchValue).filter(Boolean);
  const synthesisTitleSet = new Set(synthesisTitles);
  const synthesisMarkets = candidate.affectedMarkets || [];
  const synthesisAudiences = candidate.affectedAudiences || [];
  const explicitIds = new Set(collectPossibleIds(candidate));
  const explicitIdMatches = opportunities.filter((opportunity) => explicitIds.has(opportunity.id) && Number.isFinite(Number(opportunity.score.buildSimplicityScore)));
  const explicitIdMatch = explicitIdMatches.length === 1 ? explicitIdMatches[0] : null;

  if (explicitIdMatch) {
    const rawBuildSimplicityScore = Number(explicitIdMatch.score.buildSimplicityScore);
    return {
      source: "mapped_opportunity_signal",
      selectedBuildDifficultySource: "opportunity_build_simplicity_score",
      opportunityCandidateId: explicitIdMatch.id,
      opportunityCandidateTitle: explicitIdMatch.title,
      matchedOpportunityCandidateId: explicitIdMatch.id,
      matchedOpportunityCandidateTitle: explicitIdMatch.title,
      rawBuildSimplicityScore,
      buildSimplicityScoreUsed: rawBuildSimplicityScore,
      persistedValue: buildDifficultyFromSimplicityScore(rawBuildSimplicityScore),
      confidence: 1,
      matchReason: "explicit linked opportunity/source id matched synthesis row",
      ambiguityReason: null,
      fallbackAvoided: true,
      attribution: "explicit_id_match",
      attributionMethod: "explicit_id_match",
    };
  }

  const synthesisSeedMatch = findSynthesisSeedOpportunityMatch(candidate, opportunities);
  if (synthesisSeedMatch) {
    const rawBuildSimplicityScore = Number(synthesisSeedMatch.opportunity.score.buildSimplicityScore);
    return {
      source: "mapped_opportunity_signal",
      selectedBuildDifficultySource: "opportunity_build_simplicity_score",
      opportunityCandidateId: synthesisSeedMatch.opportunity.id,
      opportunityCandidateTitle: synthesisSeedMatch.opportunity.title,
      matchedOpportunityCandidateId: synthesisSeedMatch.opportunity.id,
      matchedOpportunityCandidateTitle: synthesisSeedMatch.opportunity.title,
      rawBuildSimplicityScore,
      buildSimplicityScoreUsed: rawBuildSimplicityScore,
      persistedValue: buildDifficultyFromSimplicityScore(rawBuildSimplicityScore),
      confidence: 0.95,
      matchReason: `same synthesis cluster seed matched opportunity candidate via ranked seed "${synthesisSeedMatch.seed.title}"`,
      ambiguityReason: null,
      fallbackAvoided: true,
      attribution: "synthesis_cluster_seed_match",
      attributionMethod: "synthesis_cluster_seed_match",
    };
  }

  const scoredMatches = opportunities.map((opportunity) => {
    const opportunityTitles = [opportunity.normalizedTitle, opportunity.title, opportunity.context?.primaryTheme, opportunity.marketContext?.primaryProblem].map((value) => normalizedMatchValue(value || "")).filter(Boolean);
    const canonicalOrSemanticMatch = opportunityTitles.some((title) => synthesisTitleSet.has(title));
    const bestTokenOverlap = Math.max(...opportunityTitles.map((title) => tokenOverlapScore(candidate.synthesizedProblemTitle, title)), 0);
    const marketOverlap = overlapAny(synthesisMarkets, [opportunity.context?.market, opportunity.marketContext?.market].filter(Boolean) as string[]);
    const audienceOverlap = overlapAny(synthesisAudiences, [opportunity.context?.audience, opportunity.marketContext?.audience].filter(Boolean) as string[]);
    const contextOverlapCount = Number(marketOverlap) + Number(audienceOverlap);
    const confidence = canonicalOrSemanticMatch ? 1 : Math.min(0.99, bestTokenOverlap * 0.7 + contextOverlapCount * 0.15);
    const deterministic = canonicalOrSemanticMatch || (bestTokenOverlap >= 0.6 && contextOverlapCount > 0);
    const matchReason = canonicalOrSemanticMatch
      ? "shared canonical/semantic normalized title"
      : deterministic
        ? `normalized title token overlap ${(bestTokenOverlap * 100).toFixed(0)}% with ${marketOverlap ? "market" : "no market"} and ${audienceOverlap ? "audience" : "no audience"} overlap`
        : `insufficient deterministic relation: token overlap ${(bestTokenOverlap * 100).toFixed(0)}%, marketOverlap=${marketOverlap}, audienceOverlap=${audienceOverlap}`;
    return { opportunity, canonicalOrSemanticMatch, bestTokenOverlap, contextOverlapCount, deterministic, confidence, matchReason, supportScore: opportunitySupportScore(opportunity) };
  }).filter((match) => match.deterministic && Number.isFinite(Number(match.opportunity.score.buildSimplicityScore)));

  scoredMatches.sort((a, b) => {
    if (Number(b.canonicalOrSemanticMatch) !== Number(a.canonicalOrSemanticMatch)) return Number(b.canonicalOrSemanticMatch) - Number(a.canonicalOrSemanticMatch);
    if (b.bestTokenOverlap !== a.bestTokenOverlap) return b.bestTokenOverlap - a.bestTokenOverlap;
    if (b.contextOverlapCount !== a.contextOverlapCount) return b.contextOverlapCount - a.contextOverlapCount;
    return b.supportScore - a.supportScore;
  });

  const best = scoredMatches[0];
  if (best) {
    const tiedBest = scoredMatches.filter((match) => match.canonicalOrSemanticMatch === best.canonicalOrSemanticMatch && match.bestTokenOverlap === best.bestTokenOverlap && match.contextOverlapCount === best.contextOverlapCount && match.supportScore === best.supportScore);
    if (tiedBest.length === 1) {
      const rawBuildSimplicityScore = Number(best.opportunity.score.buildSimplicityScore);
      return {
        source: "mapped_opportunity_signal",
        selectedBuildDifficultySource: "opportunity_build_simplicity_score",
        opportunityCandidateId: best.opportunity.id,
        opportunityCandidateTitle: best.opportunity.title,
        matchedOpportunityCandidateId: best.opportunity.id,
        matchedOpportunityCandidateTitle: best.opportunity.title,
        rawBuildSimplicityScore,
        buildSimplicityScoreUsed: rawBuildSimplicityScore,
        persistedValue: buildDifficultyFromSimplicityScore(rawBuildSimplicityScore),
        confidence: Number(best.confidence.toFixed(2)),
        matchReason: best.matchReason,
        ambiguityReason: null,
        fallbackAvoided: true,
        attribution: best.canonicalOrSemanticMatch ? "canonical_or_semantic_title_match" : best.bestTokenOverlap === 1 ? "normalized_title_match" : "token_market_audience_match",
        attributionMethod: best.canonicalOrSemanticMatch ? "canonical_or_semantic_title_match" : best.bestTokenOverlap === 1 ? "normalized_title_match" : "token_market_audience_match",
      };
    }
  }

  const contextualMatches = opportunities.filter((opportunity) => {
    if (!Number.isFinite(Number(opportunity.score.buildSimplicityScore))) return false;
    const opportunityTitles = [opportunity.normalizedTitle, opportunity.title, opportunity.context?.primaryTheme, opportunity.marketContext?.primaryProblem]
      .map((value) => normalizedMatchValue(value || ""))
      .filter(Boolean);
    const bestTokenOverlap = Math.max(...opportunityTitles.map((title) => tokenOverlapScore(candidate.synthesizedProblemTitle, title)), 0);
    const opportunityContext = [
      opportunity.context?.market,
      opportunity.marketContext?.market,
      opportunity.context?.audience,
      opportunity.marketContext?.audience,
      opportunity.context?.nicheCategory,
      opportunity.context?.primaryTheme,
      opportunity.marketContext?.primaryProblem,
    ].filter(Boolean) as string[];
    return bestTokenOverlap >= 0.35 && overlapAny([...synthesisMarkets, ...synthesisAudiences, candidate.canonicalProblemCluster].filter(Boolean), opportunityContext);
  });

  if (contextualMatches.length === 1) {
    const contextualMatch = contextualMatches[0];
    const rawBuildSimplicityScore = Number(contextualMatch.score.buildSimplicityScore);
    return {
      source: "mapped_opportunity_signal",
      selectedBuildDifficultySource: "opportunity_build_simplicity_score",
      opportunityCandidateId: contextualMatch.id,
      opportunityCandidateTitle: contextualMatch.title,
      matchedOpportunityCandidateId: contextualMatch.id,
      matchedOpportunityCandidateTitle: contextualMatch.title,
      rawBuildSimplicityScore,
      buildSimplicityScoreUsed: rawBuildSimplicityScore,
      persistedValue: buildDifficultyFromSimplicityScore(rawBuildSimplicityScore),
      confidence: 0.75,
      matchReason: "only finite-build-simplicity opportunity candidate shares synthesis market, audience, or cluster context",
      ambiguityReason: null,
      fallbackAvoided: true,
      attribution: "unique_contextual_opportunity_match",
      attributionMethod: "unique_contextual_opportunity_match",
    };
  }

  const ambiguityReason = explicitIdMatches.length > 1
    ? "multiple explicit linked opportunity candidates had finite build simplicity scores"
    : scoredMatches.length > 1
      ? "multiple equally supported opportunity candidates matched the synthesis row"
      : contextualMatches.length > 1
        ? "multiple opportunity candidates shared synthesis context"
        : "no confident related opportunity build simplicity signal";

  return {
    source: "fallback",
    selectedBuildDifficultySource: "fallback_medium",
    opportunityCandidateId: null,
    opportunityCandidateTitle: null,
    matchedOpportunityCandidateId: null,
    matchedOpportunityCandidateTitle: null,
    rawBuildSimplicityScore: null,
    buildSimplicityScoreUsed: null,
    persistedValue: "Medium",
    confidence: 0,
    matchReason: ambiguityReason,
    ambiguityReason,
    fallbackAvoided: false,
    attribution: ambiguityReason === "no confident related opportunity build simplicity signal" ? "unavailable" : "ambiguous",
    attributionMethod: ambiguityReason === "no confident related opportunity build simplicity signal" ? "unavailable" : "ambiguous",
  };
}

function buildSynthesisAffectedNiches(candidate: ProblemSynthesisCandidate): AffectedNicheEnrichmentDiagnostic {
  const baseValues = collectUniqueValues([...candidate.affectedMarkets, ...candidate.affectedAudiences]);
  const rankedSeeds = candidate.diagnostics?.candidateCollapseReport?.rankedSeeds || [];
  const enrichmentValues = collectUniqueValues([
    candidate.canonicalProblemCluster,
    candidate.narrative?.primaryTheme,
    candidate.evidenceSummary?.markets?.[0],
    candidate.evidenceSummary?.audiences?.[0],
    ...rankedSeeds.slice(0, 3).flatMap((seed) => [seed.market, seed.audience, seed.problemCluster]),
  ]);
  const enrichedValues = collectUniqueValues([...baseValues, ...enrichmentValues]);
  const addedValues = enrichedValues.filter((value) => !baseValues.includes(value));
  const persistedValue = enrichedValues.length > 0 ? enrichedValues.join(" | ") : DEFAULT_NICHES;

  return {
    source: enrichedValues.length > 0 ? "problem_synthesis" : "fallback",
    baseValueCount: baseValues.length,
    enrichedValueCount: enrichedValues.length,
    addedValues,
    persistedValue,
    fallbackAvoided: enrichedValues.length > 0,
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
        selectedBuildDifficultySource: opportunity && Number.isFinite(rawBuildSimplicityScore) ? "opportunity_build_simplicity_score" : "fallback_medium",
        opportunityCandidateId: opportunity?.id || null,
        opportunityCandidateTitle: opportunity?.title || null,
        matchedOpportunityCandidateId: opportunity?.id || null,
        matchedOpportunityCandidateTitle: opportunity?.title || null,
        rawBuildSimplicityScore: Number.isFinite(rawBuildSimplicityScore) ? rawBuildSimplicityScore : null,
        buildSimplicityScoreUsed: Number.isFinite(rawBuildSimplicityScore) ? rawBuildSimplicityScore : null,
        persistedValue: buildDifficulty(opportunity),
        confidence: opportunity && Number.isFinite(rawBuildSimplicityScore) ? 1 : 0,
        matchReason: opportunity && Number.isFinite(rawBuildSimplicityScore) ? "seed row directly uses its own opportunity build simplicity score" : "no opportunity build simplicity score available for seed row",
        ambiguityReason: opportunity && Number.isFinite(rawBuildSimplicityScore) ? null : "no opportunity build simplicity score available for seed row",
        fallbackAvoided: Boolean(opportunity && Number.isFinite(rawBuildSimplicityScore)),
        attribution: opportunity ? "normalized_title_match" : "unavailable",
        attributionMethod: opportunity ? "normalized_title_match" : "unavailable",
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
    const affectedNicheDiagnostic = buildSynthesisAffectedNiches(candidate);
    const affected = affectedNicheDiagnostic.persistedValue;
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
    mark("affected_niches", affected === DEFAULT_NICHES ? "fallback:affected_niches" : "orchestrator:problem_synthesis.affectedMarkets_affectedAudiences_context_enrichment");
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
    mark("build_difficulty", buildDifficultyDiagnostic.source === "mapped_opportunity_signal" ? `orchestrator:opportunity.score.buildSimplicityScore:${buildDifficultyDiagnostic.attribution}` : "fallback:build_difficulty");
    mark("source_evidence", evidence === DEFAULT_EVIDENCE ? "fallback:source_evidence" : "orchestrator:problem_synthesis.conciseEvidenceSummary");
    const uniqueFallbackFields = [...new Set(fallbackFields)];
    return { row, sources, scoreMappings, buildDifficultyDiagnostic, affectedNicheDiagnostic, fallbackFields: uniqueFallbackFields, rowSource: sourceForRow(uniqueFallbackFields, "problem_synthesis") };
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
      affected_niche_enrichment_by_row: rows.map((planned, rowIndex) => {
        const affectedNicheDiagnostic = "affectedNicheDiagnostic" in planned ? planned.affectedNicheDiagnostic as AffectedNicheEnrichmentDiagnostic : null;
        const { row } = planned;
        return {
          rowIndex,
          diagnostic: affectedNicheDiagnostic || {
            source: row.affected_niches === DEFAULT_NICHES ? "fallback" : "problem_synthesis",
            baseValueCount: row.affected_niches === DEFAULT_NICHES ? 0 : row.affected_niches.split("|").filter((item) => item.trim()).length,
            enrichedValueCount: row.affected_niches === DEFAULT_NICHES ? 0 : row.affected_niches.split("|").filter((item) => item.trim()).length,
            addedValues: [],
            persistedValue: row.affected_niches,
            fallbackAvoided: row.affected_niches !== DEFAULT_NICHES,
          },
        };
      }),
      warnings,
    },
  };
}
