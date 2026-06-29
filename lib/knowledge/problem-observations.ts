import type { EvidenceProvenance, EvidenceSourceType } from "../evidence/index.ts";
import { generateKnowledgeId, generateKnowledgeProblemFingerprint, normalizeKnowledgeText } from "./fingerprint.ts";
import { normalizeEvolutionSignal } from "./evolution/scoring.ts";
import type { ProblemEvolutionObservation } from "./evolution/types.ts";

export type ProblemObservationSourceMetadata = {
  sourceType: EvidenceSourceType | string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceRank?: number | null;
  sourceId?: string | null;
  sourceTable?: string | null;
};

export type ProblemObservationScoreBreakdown = {
  pain: number;
  revenue: number;
  urgency: number;
  trend: number;
  buyingSignal: number;
  frequency: number;
  sourceQuality: number;
  opportunity: number;
  intelligence: number;
};

export type ProblemObservationMarketMetadata = {
  market: string | null;
  audience: string | null;
};

export type ProblemObservationNicheMetadata = {
  nicheCategory: string | null;
  affectedNiches: string[];
  problemCluster: string | null;
};

export type ProblemObservation = ProblemEvolutionObservation & {
  observation_fingerprint: string;
  normalized_title: string;
  source_metadata: Required<ProblemObservationSourceMetadata>;
  provenance: EvidenceProvenance & {
    source_table: string;
    source_id: string | null;
    source_url: string | null;
    source_rank: number | null;
  };
  timestamps: {
    observed_at: string;
    first_seen_at: string | null;
    last_seen_at: string | null;
  };
  score_breakdown: ProblemObservationScoreBreakdown;
  evidence_summary: string | null;
  market_metadata: ProblemObservationMarketMetadata;
  niche_metadata: ProblemObservationNicheMetadata;
  confidence: number;
  source_quality: number;
  buying_signal: number;
  frequency: number;
  opportunity_score: number;
};

export type ProblemObservationInput = {
  title: string;
  observedAt: string | Date;
  source: ProblemObservationSourceMetadata;
  provenance?: EvidenceProvenance | null;
  evidenceSummary?: string | null;
  market?: string | null;
  audience?: string | null;
  nicheCategory?: string | null;
  affectedNiches?: string[] | string | null;
  problemCluster?: string | null;
  scores?: Partial<ProblemObservationScoreBreakdown> & {
    confidence?: number | null;
  };
  firstSeenAt?: string | Date | null;
  lastSeenAt?: string | Date | null;
  preparedCount?: number | null;
  convertedCount?: number | null;
  sourceCount?: number | null;
  evidenceCount?: number | null;
  sourceTypes?: string[] | null;
};

export type ProblemObservationValidationResult = {
  valid: boolean;
  errors: string[];
};

function stringOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isoTimestamp(value: string | Date | null | undefined) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const trimmed = stringOrNull(value);
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizedStringList(value: string[] | string | null | undefined) {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[|,]/) : [];
  return Array.from(new Set(rawValues.map((item) => normalizeKnowledgeText(item)).filter(Boolean))).sort();
}

function normalizedCount(value: number | null | undefined) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function buildScoreBreakdown(scores: ProblemObservationInput["scores"] = {}): ProblemObservationScoreBreakdown {
  return {
    pain: normalizeEvolutionSignal(scores.pain),
    revenue: normalizeEvolutionSignal(scores.revenue),
    urgency: normalizeEvolutionSignal(scores.urgency),
    trend: normalizeEvolutionSignal(scores.trend),
    buyingSignal: normalizeEvolutionSignal(scores.buyingSignal),
    frequency: normalizeEvolutionSignal(scores.frequency),
    sourceQuality: normalizeEvolutionSignal(scores.sourceQuality),
    opportunity: normalizeEvolutionSignal(scores.opportunity),
    intelligence: normalizeEvolutionSignal(scores.intelligence),
  };
}

export function validateProblemObservation(observation: ProblemObservation): ProblemObservationValidationResult {
  const errors: string[] = [];

  if (!stringOrNull(observation.problem_title)) errors.push("problem_title is required.");
  if (!stringOrNull(observation.normalized_title)) errors.push("normalized_title is required.");
  if (!stringOrNull(observation.observation_fingerprint)) errors.push("observation_fingerprint is required.");
  if (!isoTimestamp(observation.timestamps.observed_at)) errors.push("timestamps.observed_at must be a valid timestamp.");
  if (!stringOrNull(observation.source_metadata.sourceType)) errors.push("source_metadata.sourceType is required.");

  for (const [key, value] of Object.entries(observation.score_breakdown)) {
    if (!Number.isFinite(value) || value < 0 || value > 10) errors.push(`score_breakdown.${key} must be between 0 and 10.`);
  }

  return { valid: errors.length === 0, errors };
}

export function buildProblemObservation(input: ProblemObservationInput): ProblemObservation {
  const title = input.title.trim();
  const normalizedTitle = normalizeKnowledgeText(title);
  const observedAt = isoTimestamp(input.observedAt);
  const firstSeenAt = isoTimestamp(input.firstSeenAt);
  const lastSeenAt = isoTimestamp(input.lastSeenAt);
  const sourceType = stringOrNull(input.source.sourceType) || "unknown";
  const sourceUrl = stringOrNull(input.source.sourceUrl);
  const sourceName = stringOrNull(input.source.sourceName);
  const sourceId = stringOrNull(input.source.sourceId);
  const sourceTable = stringOrNull(input.source.sourceTable) || stringOrNull(input.provenance?.sourceTable) || "problem_observations";
  const scoreBreakdown = buildScoreBreakdown(input.scores);
  const market = stringOrNull(input.market);
  const audience = stringOrNull(input.audience);
  const nicheCategory = stringOrNull(input.nicheCategory);
  const problemCluster = stringOrNull(input.problemCluster);
  const evidenceSummary = stringOrNull(input.evidenceSummary);
  const sourceTypes = Array.from(new Set([...(input.sourceTypes || []), sourceType].map((item) => normalizeKnowledgeText(item)).filter(Boolean))).sort();
  const problemFingerprint = generateKnowledgeProblemFingerprint({ title, market, audience });
  const observationFingerprint = generateKnowledgeId(
    "po",
    problemFingerprint,
    observedAt,
    sourceType,
    sourceUrl,
    sourceName,
    evidenceSummary
  );
  const confidence = normalizeEvolutionSignal(input.scores?.confidence ?? (scoreBreakdown.intelligence || scoreBreakdown.sourceQuality));
  const sourceCount = normalizedCount(input.sourceCount) || sourceTypes.length;
  const evidenceCount = normalizedCount(input.evidenceCount) || (evidenceSummary ? 1 : 0);

  const observation: ProblemObservation = {
    observation_fingerprint: observationFingerprint,
    problem_title: title,
    normalized_title: normalizedTitle,
    observedAt,
    pain_score: scoreBreakdown.pain,
    revenue_score: scoreBreakdown.revenue,
    urgency_score: scoreBreakdown.urgency,
    trend_score: scoreBreakdown.trend,
    buying_signal_score: scoreBreakdown.buyingSignal,
    frequency_score: scoreBreakdown.frequency,
    source_quality_score: scoreBreakdown.sourceQuality,
    opportunity_score: scoreBreakdown.opportunity,
    intelligence_score: scoreBreakdown.intelligence,
    prepared_count: normalizedCount(input.preparedCount),
    converted_count: normalizedCount(input.convertedCount),
    source_count: sourceCount,
    evidence_count: evidenceCount,
    source_types: sourceTypes,
    first_seen_at: firstSeenAt,
    last_seen_at: lastSeenAt,
    problem_cluster: problemCluster,
    source_evidence: evidenceSummary,
    source_metadata: {
      sourceType,
      sourceName,
      sourceUrl,
      sourceRank: input.source.sourceRank ?? null,
      sourceId,
      sourceTable,
    },
    provenance: {
      ...(input.provenance || {}),
      source_table: sourceTable,
      source_id: sourceId,
      source_url: sourceUrl,
      source_rank: input.source.sourceRank ?? null,
    },
    timestamps: {
      observed_at: observedAt || "",
      first_seen_at: firstSeenAt,
      last_seen_at: lastSeenAt,
    },
    score_breakdown: scoreBreakdown,
    evidence_summary: evidenceSummary,
    market_metadata: { market, audience },
    niche_metadata: {
      nicheCategory,
      affectedNiches: normalizedStringList(input.affectedNiches),
      problemCluster,
    },
    confidence,
    source_quality: scoreBreakdown.sourceQuality,
    buying_signal: scoreBreakdown.buyingSignal,
    frequency: scoreBreakdown.frequency,
  };

  const validation = validateProblemObservation(observation);
  if (!validation.valid) {
    throw new Error(`Invalid problem observation: ${validation.errors.join(" ")}`);
  }

  return observation;
}

export function buildProblemObservationBatch(inputs: ProblemObservationInput[]) {
  return inputs.map((input) => buildProblemObservation(input));
}

export function serializeProblemObservation(observation: ProblemObservation) {
  const validation = validateProblemObservation(observation);
  if (!validation.valid) {
    throw new Error(`Invalid problem observation: ${validation.errors.join(" ")}`);
  }

  return {
    ...observation,
    provenance: { ...observation.provenance },
    source_metadata: { ...observation.source_metadata },
    timestamps: { ...observation.timestamps },
    score_breakdown: { ...observation.score_breakdown },
    market_metadata: { ...observation.market_metadata },
    niche_metadata: {
      ...observation.niche_metadata,
      affectedNiches: [...observation.niche_metadata.affectedNiches],
    },
    source_types: [...(observation.source_types || [])],
  };
}
