import "server-only";
import type { SnapshotRetrievalMode, SnapshotRetrievalOutcome, SnapshotRetrievalQuery } from "./types.ts";
import type { SnapshotRetrievalRepository } from "./repository.ts";
import { normalizeSnapshotRetrievalQuery, rankSnapshotRetrievalCandidates } from "./ranker.ts";
import { buildSnapshotHistoricalContext } from "./context-builder.ts";

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

export function fingerprintSnapshotRetrievalQuery(query: SnapshotRetrievalQuery): string {
  const normalized = normalizeSnapshotRetrievalQuery(query);
  const material = JSON.stringify({ tokens: normalized.tokens, niches: normalized.niches, clusters: normalized.clusters, userId: query.userId ?? null, organizationId: query.organizationId ?? null, discoveryId: query.discoveryId ?? null });
  let hash = 2166136261;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= material.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function diagnostics(mode: SnapshotRetrievalMode, query: SnapshotRetrievalQuery, overrides: Partial<SnapshotRetrievalOutcome["diagnostics"]>): SnapshotRetrievalOutcome["diagnostics"] {
  return {
    mode,
    ownershipScope: query.discoveryId != null ? "discovery" : query.organizationId != null ? "organization" : query.userId != null ? "user" : "unknown",
    queryFingerprint: fingerprintSnapshotRetrievalQuery(query),
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
  if (mode === "disabled") {
    logger?.info?.("snapshot_retrieval_disabled", { queryFingerprint });
    return { status: "disabled", results: [], historicalContext: [], diagnostics: diagnostics(mode, query, {}) };
  }
  if (mode === "influence") {
    logger?.warn?.("snapshot_retrieval_unsupported_mode", { mode, queryFingerprint });
    return { status: "unsupported_mode", results: [], historicalContext: [], diagnostics: diagnostics(mode, query, { unsupportedMode: true, errorCode: "SNAPSHOT_RETRIEVAL_INFLUENCE_UNSUPPORTED" }), error: { code: "SNAPSHOT_RETRIEVAL_INFLUENCE_UNSUPPORTED", message: "Snapshot retrieval influence mode is not implemented in this foundational PR." } };
  }
  try {
    const candidates = await repository.findCandidates(query);
    const results = rankSnapshotRetrievalCandidates(query, candidates);
    const historicalContext = buildSnapshotHistoricalContext(results);
    logger?.info?.("snapshot_retrieval_shadow_completed", { queryFingerprint, candidateCount: candidates.length, rankedResultCount: results.length, contextCount: historicalContext.length });
    return { status: "shadow_success", results, historicalContext, diagnostics: diagnostics(mode, query, { candidateCount: candidates.length, rankedResultCount: results.length, contextCount: historicalContext.length, repositoryCalled: true }) };
  } catch {
    logger?.error?.("snapshot_retrieval_repository_error", { queryFingerprint, code: "SNAPSHOT_RETRIEVAL_REPOSITORY_ERROR" });
    return { status: "error", results: [], historicalContext: [], diagnostics: diagnostics(mode, query, { repositoryCalled: true, errorCode: "SNAPSHOT_RETRIEVAL_REPOSITORY_ERROR" }), error: { code: "SNAPSHOT_RETRIEVAL_REPOSITORY_ERROR", message: "Snapshot retrieval failed before producing historical context." } };
  }
}
