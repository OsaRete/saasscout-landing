import "server-only";
import { createHash } from "node:crypto";
import type { SnapshotRetrievalMode, SnapshotRetrievalOutcome, SnapshotRetrievalQuery } from "./types.ts";
import type { SnapshotRetrievalRepository } from "./repository.ts";
import { normalizeSnapshotRetrievalQuery, rankSnapshotRetrievalCandidates } from "./ranker.ts";
import { buildSnapshotHistoricalContext } from "./context-builder.ts";
import { summarizeSnapshotRetrievalDuplicates, summarizeSnapshotRetrievalQuality } from "./quality-diagnostics.ts";

export type SnapshotRetrievalSafeLogger = Readonly<{
  info?: (event: string, metadata: Record<string, unknown>) => void;
  warn?: (event: string, metadata: Record<string, unknown>) => void;
  error?: (event: string, metadata: Record<string, unknown>) => void;
}>;

export type ExecuteSnapshotRetrievalInput = Readonly<{
  mode: SnapshotRetrievalMode;
  query: SnapshotRetrievalQuery;
  repository: SnapshotRetrievalRepository;
  logger?: SnapshotRetrievalSafeLogger;
}>;

function fnv1a32(material: string): string {
  let hash = 2166136261;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function fingerprintSnapshotRetrievalQuery(query: SnapshotRetrievalQuery): string {
  const normalized = normalizeSnapshotRetrievalQuery(query);
  const material = JSON.stringify({ tokens: normalized.tokens, niches: normalized.niches, clusters: normalized.clusters, userId: query.userId ?? null, organizationId: query.organizationId ?? null, discoveryId: query.discoveryId ?? null });
  return fnv1a32(material);
}

export function fingerprintSnapshotRetrievalExecution(input: Readonly<{ queryFingerprint: string; referenceTimestamp: string; userId?: string; organizationId?: string | null; discoveryId?: string }>): string {
  const material = JSON.stringify({ queryFingerprint: input.queryFingerprint, referenceTimestamp: input.referenceTimestamp, userScope: input.userId ?? null, organizationScope: input.organizationId ?? null, discoveryScope: input.discoveryId ?? null });
  return `sha256:${createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

function diagnostics(mode: SnapshotRetrievalMode, query: SnapshotRetrievalQuery, overrides: Partial<SnapshotRetrievalOutcome["diagnostics"]>): SnapshotRetrievalOutcome["diagnostics"] {
  return {
    mode,
    ownershipScope: query.discoveryId != null ? "discovery" : query.organizationId != null ? "organization" : query.userId != null ? "user" : "unknown",
    queryFingerprint: fingerprintSnapshotRetrievalQuery(query),
    discoveryExecutionFingerprint: fingerprintSnapshotRetrievalExecution({ queryFingerprint: fingerprintSnapshotRetrievalQuery(query), referenceTimestamp: query.referenceTimestamp, userId: query.userId, organizationId: query.organizationId, discoveryId: query.discoveryId }),
    candidateCount: 0,
    rankedResultCount: 0,
    contextCount: 0,
    repositoryCalled: false,
    ...overrides,
  };
}

export async function executeSnapshotRetrieval(input: ExecuteSnapshotRetrievalInput): Promise<SnapshotRetrievalOutcome> {
  const { mode, query, repository, logger } = input;
  const queryFingerprint = fingerprintSnapshotRetrievalQuery(query);
  const discoveryExecutionFingerprint = fingerprintSnapshotRetrievalExecution({ queryFingerprint, referenceTimestamp: query.referenceTimestamp, userId: query.userId, organizationId: query.organizationId, discoveryId: query.discoveryId });
  if (mode === "disabled") {
    logger?.info?.("snapshot_retrieval_disabled", { queryFingerprint, discoveryExecutionFingerprint });
    return { status: "disabled", results: [], historicalContext: [], diagnostics: diagnostics(mode, query, {}) };
  }
  if (mode === "influence") {
    logger?.warn?.("snapshot_retrieval_unsupported_mode", { mode, queryFingerprint, discoveryExecutionFingerprint });
    return { status: "unsupported_mode", results: [], historicalContext: [], diagnostics: diagnostics(mode, query, { unsupportedMode: true, errorCode: "SNAPSHOT_RETRIEVAL_INFLUENCE_UNSUPPORTED" }), error: { code: "SNAPSHOT_RETRIEVAL_INFLUENCE_UNSUPPORTED", message: "Snapshot retrieval influence mode is not implemented in this foundational PR." } };
  }
  try {
    const candidates = await repository.findCandidates(query);
    const duplicateSummary = summarizeSnapshotRetrievalDuplicates(candidates);
    const results = rankSnapshotRetrievalCandidates(query, candidates);
    const qualitySummary = summarizeSnapshotRetrievalQuality(results);
    const historicalContext = buildSnapshotHistoricalContext(results);
    logger?.info?.("snapshot_retrieval_shadow_completed", { queryFingerprint, discoveryExecutionFingerprint, candidateCount: candidates.length, rankedResultCount: results.length, contextCount: historicalContext.length, duplicateCandidateCount: duplicateSummary.duplicateCandidateCount, qualityClassification: qualitySummary.qualityClassification });
    return { status: "shadow_success", results, historicalContext, diagnostics: diagnostics(mode, query, { discoveryExecutionFingerprint, candidateCount: candidates.length, rankedResultCount: results.length, contextCount: historicalContext.length, repositoryCalled: true, duplicateSummary, qualityClassification: qualitySummary.qualityClassification, scoreDistribution: qualitySummary.scoreDistribution, topResultBreakdown: qualitySummary.topResultBreakdown }) };
  } catch {
    logger?.error?.("snapshot_retrieval_repository_error", { queryFingerprint, discoveryExecutionFingerprint, code: "SNAPSHOT_RETRIEVAL_REPOSITORY_ERROR" });
    return { status: "error", results: [], historicalContext: [], diagnostics: diagnostics(mode, query, { repositoryCalled: true, errorCode: "SNAPSHOT_RETRIEVAL_REPOSITORY_ERROR" }), error: { code: "SNAPSHOT_RETRIEVAL_REPOSITORY_ERROR", message: "Snapshot retrieval failed before producing historical context." } };
  }
}
