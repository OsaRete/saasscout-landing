import type { ExecuteSnapshotRetrievalInput } from "./server-retrieval-executor.ts";
import { executeSnapshotRetrieval } from "./server-retrieval-executor.ts";
import { createSupabaseSnapshotRetrievalRepository } from "./supabase-repository.ts";
import type { SnapshotRetrievalOutcome, SnapshotRetrievalQuery } from "./types.ts";
import { getSnapshotRetrievalMode, type SupportedSnapshotRetrievalMode } from "./config.ts";
import { buildDiscoverOpportunitiesRetrievalQuery } from "./discover-opportunities-query-adapter.ts";

export type DiscoverySnapshotRetrievalExecutor = (input: ExecuteSnapshotRetrievalInput) => Promise<SnapshotRetrievalOutcome>;
export type DiscoverySnapshotRetrievalRepositoryFactory = () => ExecuteSnapshotRetrievalInput["repository"];

export function logSnapshotRetrievalShadowOutcome({ outcome, durationMs }: { outcome: SnapshotRetrievalOutcome; durationMs: number }) {
  const payload = {
    event: "snapshot_retrieval_shadow_result",
    mode: outcome.diagnostics.mode,
    queryFingerprint: outcome.diagnostics.queryFingerprint,
    ownershipScope: outcome.diagnostics.ownershipScope,
    candidatesRead: outcome.diagnostics.candidateCount,
    resultsReturned: outcome.diagnostics.rankedResultCount,
    topScores: outcome.results.slice(0, 3).map((result) => result.score),
    durationMs,
    status: outcome.status,
    warningsCount: outcome.error ? 1 : 0,
  };

  if (outcome.status === "error" || outcome.status === "unsupported_mode") {
    console.warn("Snapshot retrieval shadow metrics:", payload);
    return;
  }

  console.info("Snapshot retrieval shadow metrics:", payload);
}

export async function runDiscoverOpportunitiesSnapshotRetrievalShadow({
  userId,
  queryText,
  referenceTimestamp,
  mode = getSnapshotRetrievalMode(),
  repositoryFactory = createSupabaseSnapshotRetrievalRepository,
  executor = executeSnapshotRetrieval,
}: {
  userId: string;
  queryText: string;
  referenceTimestamp: string;
  mode?: SupportedSnapshotRetrievalMode;
  repositoryFactory?: DiscoverySnapshotRetrievalRepositoryFactory;
  executor?: DiscoverySnapshotRetrievalExecutor;
}): Promise<SnapshotRetrievalOutcome | null> {
  if (mode !== "shadow") return null;

  const query: SnapshotRetrievalQuery = buildDiscoverOpportunitiesRetrievalQuery({
    userId,
    queryText,
    referenceTimestamp,
  });

  const startedAt = Date.now();
  try {
    const outcome = await executor({ mode, query, repository: repositoryFactory() });
    logSnapshotRetrievalShadowOutcome({ outcome, durationMs: Date.now() - startedAt });
    return outcome;
  } catch {
    const failureOutcome: SnapshotRetrievalOutcome = {
      status: "error",
      results: [],
      historicalContext: [],
      diagnostics: {
        mode,
        ownershipScope: "user",
        queryFingerprint: "unavailable",
        candidateCount: 0,
        rankedResultCount: 0,
        contextCount: 0,
        repositoryCalled: true,
        errorCode: "SNAPSHOT_RETRIEVAL_SHADOW_UNHANDLED_ERROR",
      },
      error: {
        code: "SNAPSHOT_RETRIEVAL_SHADOW_UNHANDLED_ERROR",
        message: "Snapshot retrieval shadow execution failed non-disruptively.",
      },
    };
    logSnapshotRetrievalShadowOutcome({ outcome: failureOutcome, durationMs: Date.now() - startedAt });
    return failureOutcome;
  }
}
