import type { SnapshotHistoricalContext, SnapshotRetrievalResult } from "./types.ts";

export const SNAPSHOT_CONTEXT_DEFAULT_LIMIT = 5;
export const SNAPSHOT_CONTEXT_HARD_LIMIT = 10;
export const SNAPSHOT_CONTEXT_CLAIM_SNIPPET_LIMIT = 3;
export const SNAPSHOT_CONTEXT_CLAIM_SNIPPET_CHAR_LIMIT = 220;

const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, " ");
const capLimit = (limit: number | undefined): number => Math.max(0, Math.min(SNAPSHOT_CONTEXT_HARD_LIMIT, Math.floor(limit ?? SNAPSHOT_CONTEXT_DEFAULT_LIMIT)));

export function buildSnapshotHistoricalContext(results: readonly SnapshotRetrievalResult[], limit?: number): readonly SnapshotHistoricalContext[] {
  return results.slice(0, capLimit(limit)).map((result) => ({
    snapshotId: result.snapshotId,
    discoveryId: result.discoveryId,
    createdAt: result.createdAt,
    title: normalizeWhitespace(result.title),
    summary: normalizeWhitespace(result.summary),
    opportunitySummary: normalizeWhitespace(result.opportunitySummary),
    relatedNiches: result.relatedNiches.map(normalizeWhitespace).filter(Boolean),
    affectedMarket: result.affectedMarket == null ? result.affectedMarket : normalizeWhitespace(result.affectedMarket),
    confidence: result.confidence,
    evidenceCount: result.evidenceCount,
    sourceTypes: [...new Set(result.sourceTypes.map(normalizeWhitespace).filter(Boolean))].sort(),
    claimSnippets: result.claimSnippets.slice(0, SNAPSHOT_CONTEXT_CLAIM_SNIPPET_LIMIT).map((snippet) => normalizeWhitespace(snippet).slice(0, SNAPSHOT_CONTEXT_CLAIM_SNIPPET_CHAR_LIMIT)),
    retrievalExplanations: result.explanations.map(normalizeWhitespace).filter(Boolean),
  }));
}
