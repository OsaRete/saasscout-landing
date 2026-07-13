import type { SnapshotRetrievalCandidate, SnapshotRetrievalQuery, SnapshotRetrievalResult, SnapshotRetrievalScoreBreakdown } from "./types.ts";

export const SNAPSHOT_RETRIEVAL_MAX_CANDIDATES_DEFAULT = 50;
export const SNAPSHOT_RETRIEVAL_MAX_CANDIDATES_HARD_CAP = 100;
export const SNAPSHOT_RETRIEVAL_RESULT_LIMIT_DEFAULT = 5;
export const SNAPSHOT_RETRIEVAL_RESULT_LIMIT_HARD_CAP = 10;
export const SNAPSHOT_RETRIEVAL_MAX_QUERY_LENGTH = 500;
export const SNAPSHOT_RETRIEVAL_MAX_TOKENS = 64;
export const SNAPSHOT_RETRIEVAL_FRESHNESS_WINDOW_DAYS = 365;
export const SNAPSHOT_RETRIEVAL_PROVENANCE_SATURATION_SOURCE_TYPES = 4;
export const SNAPSHOT_RETRIEVAL_INVALID_TIMESTAMP_FRESHNESS = 0;

export const SNAPSHOT_RETRIEVAL_WEIGHTS = Object.freeze({
  queryTextMatch: 0.3,
  nicheOverlap: 0.2,
  clusterOverlap: 0.15,
  evidenceStrength: 0.15,
  snapshotConfidence: 0.1,
  provenanceDiversity: 0.05,
  freshness: 0.05,
});

export const SNAPSHOT_RETRIEVAL_WEIGHT_SUM = Object.values(SNAPSHOT_RETRIEVAL_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
if (SNAPSHOT_RETRIEVAL_WEIGHT_SUM !== 1) throw new Error("Snapshot retrieval weights must sum to exactly 1.");

export type NormalizedSnapshotRetrievalQuery = Readonly<{
  text: string;
  tokens: readonly string[];
  niches: readonly string[];
  clusters: readonly string[];
  keywords: readonly string[];
  maxCandidates: number;
  resultLimit: number;
  referenceTimestamp: string;
}>;

const TOKEN_PATTERN = /[a-z0-9]+/g;

export function normalizeText(value: string): string {
  return value.slice(0, SNAPSHOT_RETRIEVAL_MAX_QUERY_LENGTH).trim().toLowerCase().replace(/\s+/g, " ");
}

export function tokenizeDeterministically(value: string): readonly string[] {
  const tokens = normalizeText(value).match(TOKEN_PATTERN) ?? [];
  return [...new Set(tokens.filter(Boolean))].slice(0, SNAPSHOT_RETRIEVAL_MAX_TOKENS);
}

function normalizeStringList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).flatMap((value) => tokenizeDeterministically(value)))].slice(0, SNAPSHOT_RETRIEVAL_MAX_TOKENS);
}

function capInteger(value: number | undefined, defaultValue: number, hardCap: number): number {
  if (!Number.isFinite(value ?? NaN)) return defaultValue;
  return Math.max(0, Math.min(hardCap, Math.floor(value as number)));
}

export function normalizeSnapshotRetrievalQuery(query: SnapshotRetrievalQuery): NormalizedSnapshotRetrievalQuery {
  const text = normalizeText(query.rawQueryText);
  return Object.freeze({
    text,
    tokens: Object.freeze([...new Set([...tokenizeDeterministically(text), ...normalizeStringList(query.keywords)])]),
    niches: Object.freeze(normalizeStringList(query.niches)),
    clusters: Object.freeze(normalizeStringList(query.clusters)),
    keywords: Object.freeze(normalizeStringList(query.keywords)),
    maxCandidates: capInteger(query.maxCandidates, SNAPSHOT_RETRIEVAL_MAX_CANDIDATES_DEFAULT, SNAPSHOT_RETRIEVAL_MAX_CANDIDATES_HARD_CAP),
    resultLimit: capInteger(query.resultLimit, SNAPSHOT_RETRIEVAL_RESULT_LIMIT_DEFAULT, SNAPSHOT_RETRIEVAL_RESULT_LIMIT_HARD_CAP),
    referenceTimestamp: query.referenceTimestamp,
  });
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const roundPublic = (value: number): number => Number(clamp01(value).toFixed(6));
const overlap = (a: readonly string[], b: readonly string[]): number => a.length === 0 ? 0 : clamp01(a.filter((token) => new Set(b).has(token)).length / a.length);

function candidateTextTokens(candidate: SnapshotRetrievalCandidate): readonly string[] {
  return tokenizeDeterministically([
    candidate.problem.title,
    candidate.problem.summary,
    candidate.opportunity.summary,
    ...candidate.evidenceSignals.map((signal) => signal.claimSnippet),
  ].join(" "));
}

export function calculateSnapshotRetrievalBreakdown(query: NormalizedSnapshotRetrievalQuery, candidate: SnapshotRetrievalCandidate): SnapshotRetrievalScoreBreakdown {
  const queryTextMatch = overlap(query.tokens, candidateTextTokens(candidate));
  const nicheOverlap = overlap(query.niches, normalizeStringList(candidate.problem.relatedNiches));
  const clusterOverlap = overlap(query.clusters, tokenizeDeterministically(candidate.problem.affectedMarket ?? ""));
  const evidenceCount = candidate.evidenceSignals.length;
  const averageConfidence = evidenceCount === 0 ? 0 : candidate.evidenceSignals.reduce((sum, signal) => sum + (signal.confidence == null ? 0.5 : clamp01(signal.confidence)), 0) / evidenceCount;
  const supportScore = evidenceCount === 0 ? 0 : Math.min(1, candidate.evidenceSignals.reduce((sum, signal) => sum + Math.max(0, signal.supportingTargetCount ?? 0), 0) / (evidenceCount * 3));
  // evidenceStrength = 0 when no evidence; otherwise capped weighted blend of evidence count saturation (40%), avg confidence or 0.5 fallback (40%), and supporting target saturation (20%).
  const evidenceStrength = evidenceCount === 0 ? 0 : clamp01(0.4 * Math.min(1, evidenceCount / 5) + 0.4 * averageConfidence + 0.2 * supportScore);
  const snapshotConfidence = candidate.confidence?.overall == null ? 0.5 : clamp01(candidate.confidence.overall);
  const distinctSourceTypes = new Set(candidate.sourceTypes.map((sourceType) => normalizeText(sourceType)).filter(Boolean)).size;
  const provenanceDiversity = clamp01(distinctSourceTypes / SNAPSHOT_RETRIEVAL_PROVENANCE_SATURATION_SOURCE_TYPES);
  const referenceMs = Date.parse(query.referenceTimestamp);
  const candidateMs = Date.parse(candidate.createdAt);
  const ageDays = (referenceMs - candidateMs) / 86_400_000;
  const freshness = Number.isFinite(referenceMs) && Number.isFinite(candidateMs) && ageDays >= 0
    ? clamp01(1 - ageDays / SNAPSHOT_RETRIEVAL_FRESHNESS_WINDOW_DAYS)
    : SNAPSHOT_RETRIEVAL_INVALID_TIMESTAMP_FRESHNESS;
  return { queryTextMatch, nicheOverlap, clusterOverlap, evidenceStrength, snapshotConfidence, provenanceDiversity, freshness };
}

function totalScore(breakdown: SnapshotRetrievalScoreBreakdown): number {
  return SNAPSHOT_RETRIEVAL_WEIGHTS.queryTextMatch * breakdown.queryTextMatch
    + SNAPSHOT_RETRIEVAL_WEIGHTS.nicheOverlap * breakdown.nicheOverlap
    + SNAPSHOT_RETRIEVAL_WEIGHTS.clusterOverlap * breakdown.clusterOverlap
    + SNAPSHOT_RETRIEVAL_WEIGHTS.evidenceStrength * breakdown.evidenceStrength
    + SNAPSHOT_RETRIEVAL_WEIGHTS.snapshotConfidence * breakdown.snapshotConfidence
    + SNAPSHOT_RETRIEVAL_WEIGHTS.provenanceDiversity * breakdown.provenanceDiversity
    + SNAPSHOT_RETRIEVAL_WEIGHTS.freshness * breakdown.freshness;
}

function explanations(b: SnapshotRetrievalScoreBreakdown): readonly string[] {
  const entries: [keyof SnapshotRetrievalScoreBreakdown, string][] = [
    ["queryTextMatch", "Lexical query terms matched historical problem, opportunity, or claim snippets."],
    ["nicheOverlap", "Query niches overlap with related historical niches."],
    ["clusterOverlap", "Query cluster terms overlap with the affected market."],
    ["evidenceStrength", "Historical evidence count, confidence, and support coverage contributed."],
    ["snapshotConfidence", "Snapshot confidence contributed."],
    ["provenanceDiversity", "Distinct source types contributed provenance diversity."],
    ["freshness", "Snapshot recency contributed within the configured freshness window."],
  ];
  return entries.filter(([key]) => (b[key] ?? 0) > 0).map(([, text]) => text);
}

export function rankSnapshotRetrievalCandidates(query: SnapshotRetrievalQuery, candidates: readonly SnapshotRetrievalCandidate[]): readonly SnapshotRetrievalResult[] {
  const normalizedQuery = normalizeSnapshotRetrievalQuery(query);
  return candidates
    .slice(0, normalizedQuery.maxCandidates)
    .filter((candidate) => candidate.lifecycleState === "validated" || candidate.lifecycleState === "persisted")
    .map((candidate) => {
      const rawBreakdown = calculateSnapshotRetrievalBreakdown(normalizedQuery, candidate);
      const score = totalScore(rawBreakdown);
      return {
        snapshotId: candidate.snapshotId,
        discoveryId: candidate.discoveryId,
        contractVersion: candidate.contractVersion,
        createdAt: candidate.createdAt,
        lifecycleState: candidate.lifecycleState,
        ownership: candidate.ownership,
        title: candidate.problem.title,
        summary: candidate.problem.summary,
        opportunitySummary: candidate.opportunity.summary,
        relatedNiches: candidate.problem.relatedNiches,
        affectedMarket: candidate.problem.affectedMarket,
        confidence: roundPublic(rawBreakdown.snapshotConfidence),
        evidenceCount: candidate.evidenceSignals.length,
        sourceTypes: [...new Set(candidate.sourceTypes)].sort(),
        claimSnippets: candidate.evidenceSignals.map((signal) => signal.claimSnippet),
        score: roundPublic(score),
        scoreBreakdown: Object.fromEntries(Object.entries(rawBreakdown).map(([key, value]) => [key, roundPublic(value)])) as SnapshotRetrievalScoreBreakdown,
        explanations: explanations(rawBreakdown),
      } as const;
    })
    .sort((a, b) => b.score - a.score || b.scoreBreakdown.queryTextMatch - a.scoreBreakdown.queryTextMatch || b.scoreBreakdown.evidenceStrength - a.scoreBreakdown.evidenceStrength || Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.snapshotId.localeCompare(b.snapshotId))
    .slice(0, normalizedQuery.resultLimit);
}
