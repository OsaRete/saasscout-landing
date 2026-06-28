import { normalizeEvolutionSignal } from "../scoring.ts";
import type { ProblemEvolutionObservation } from "../types.ts";

export type EvolutionSourceTable = "problem_intelligence" | "weekly_detected_problems" | "weekly_sources" | "discovered_problems";
export type RowLike = Record<string, unknown>;

type ScoreField =
  | "pain_score"
  | "revenue_score"
  | "urgency_score"
  | "trend_score"
  | "buying_signal_score"
  | "frequency_score"
  | "source_quality_score"
  | "opportunity_score"
  | "intelligence_score";

function stringOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedScore(row: RowLike, field: ScoreField) {
  return normalizeEvolutionSignal(numberOrNull(row[field]) ?? numberOrNull(row[`avg_${field}`]));
}

function normalizedCount(value: unknown) {
  const number = numberOrNull(value);
  return number === null ? 0 : Math.max(0, Math.floor(number));
}

function dateOrNull(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const stringValue = stringOrNull(value);
  if (!stringValue) return null;
  const date = new Date(stringValue);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function splitSourceTypes(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[|,]/) : [];
  return Array.from(new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))).sort();
}

function observedAt(row: RowLike) {
  return dateOrNull(row.observed_at) || dateOrNull(row.created_at) || dateOrNull(row.updated_at) || dateOrNull(row.first_seen_at) || dateOrNull(row.last_seen_at) || null;
}

function compactEvidence(row: RowLike) {
  return stringOrNull(row.source_evidence) || stringOrNull(row.source_snippet) || stringOrNull(row.problem_summary) || null;
}

function sourceTypesFor(row: RowLike, fallback: string) {
  const sourceTypes = splitSourceTypes(row.source_types);
  const sourceType = stringOrNull(row.source_type);
  const category = stringOrNull(row.category);
  return Array.from(new Set([...sourceTypes, sourceType, category, fallback].filter((item): item is string => Boolean(item)).map((item) => item.toLowerCase()))).sort();
}

function baseObservation(row: RowLike, sourceTable: EvolutionSourceTable, fallbackSourceType: string): ProblemEvolutionObservation {
  const sourceTypes = sourceTypesFor(row, fallbackSourceType);
  const observation: ProblemEvolutionObservation = {
    problem_title: stringOrNull(row.problem_title) || stringOrNull(row.source_title) || stringOrNull(row.title) || "Untitled problem",
    observedAt: observedAt(row),
    pain_score: normalizedScore(row, "pain_score"),
    revenue_score: normalizedScore(row, "revenue_score"),
    urgency_score: normalizedScore(row, "urgency_score"),
    trend_score: normalizedScore(row, "trend_score"),
    buying_signal_score: normalizedScore(row, "buying_signal_score"),
    frequency_score: normalizedScore(row, "frequency_score"),
    source_quality_score: normalizedScore(row, "source_quality_score"),
    opportunity_score: normalizedScore(row, "opportunity_score"),
    intelligence_score: normalizedScore(row, "intelligence_score"),
    prepared_count: normalizedCount(row.prepared_count),
    converted_count: normalizedCount(row.converted_count),
    source_count: normalizedCount(row.source_count) || sourceTypes.length,
    evidence_count: normalizedCount(row.evidence_count) || (compactEvidence(row) ? 1 : 0),
    source_types: sourceTypes,
    first_seen_at: dateOrNull(row.first_seen_at),
    last_seen_at: dateOrNull(row.last_seen_at),
    problem_cluster: stringOrNull(row.problem_cluster),
    source_evidence: compactEvidence(row),
    provenance: {
      source_table: sourceTable,
      row_id: stringOrNull(row.id),
      discovery_id: stringOrNull(row.discovery_id),
      user_id: stringOrNull(row.user_id),
      source_url: stringOrNull(row.source_url) || stringOrNull(row.url),
      source_rank: numberOrNull(row.source_rank),
    },
  };

  return observation;
}

export function problemIntelligenceRowToEvolutionObservation(row: RowLike): ProblemEvolutionObservation {
  return baseObservation(row, "problem_intelligence", "data_moat");
}

export function weeklyDetectedProblemRowToEvolutionObservation(row: RowLike): ProblemEvolutionObservation {
  return baseObservation(row, "weekly_detected_problems", "weekly_intelligence");
}

export function weeklySourceRowToEvolutionObservation(row: RowLike): ProblemEvolutionObservation {
  const observation = baseObservation(row, "weekly_sources", "weekly_source");
  return {
    ...observation,
    problem_title: stringOrNull(row.problem_title) || stringOrNull(row.problem_cluster) || observation.problem_title,
    trend_score: observation.trend_score || normalizeEvolutionSignal(numberOrNull(row.signal_score)),
    source_quality_score: observation.source_quality_score || normalizeEvolutionSignal(numberOrNull(row.signal_score)),
    evidence_count: observation.evidence_count || (stringOrNull(row.source_title) || stringOrNull(row.source_snippet) ? 1 : 0),
  };
}

export function discoveredProblemRowToEvolutionObservation(row: RowLike): ProblemEvolutionObservation {
  return baseObservation(row, "discovered_problems", "discovery");
}
