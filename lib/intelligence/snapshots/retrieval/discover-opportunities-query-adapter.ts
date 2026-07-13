import type { SnapshotRetrievalQuery } from "./types.ts";

const DEFAULT_DISCOVERY_QUERY_TEXT = "SaaS opportunity discovery from market signals and internal data moat";

function cleanString(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed === "" ? undefined : trimmed;
}

function cleanList(values: readonly string[] | undefined): readonly string[] | undefined {
  if (!values) return undefined;
  const cleaned = [...new Set(values.map(cleanString).filter((value): value is string => value != null))];
  return cleaned.length > 0 ? Object.freeze(cleaned) : undefined;
}

export type BuildDiscoverOpportunitiesRetrievalQueryInput = Readonly<{
  userId: string;
  queryText?: string | null;
  referenceTimestamp: string;
  currentDiscoveryId?: string | null;
  niches?: readonly string[];
  clusters?: readonly string[];
  keywords?: readonly string[];
  maxCandidates?: number;
  resultLimit?: number;
}>;

export function buildDiscoverOpportunitiesRetrievalQuery(input: BuildDiscoverOpportunitiesRetrievalQueryInput): SnapshotRetrievalQuery {
  const query: SnapshotRetrievalQuery = {
    rawQueryText: cleanString(input.queryText) ?? DEFAULT_DISCOVERY_QUERY_TEXT,
    userId: input.userId,
    referenceTimestamp: input.referenceTimestamp,
    maxCandidates: input.maxCandidates ?? 50,
    resultLimit: input.resultLimit ?? 5,
    ...(cleanString(input.currentDiscoveryId) ? { excludeDiscoveryId: cleanString(input.currentDiscoveryId) } : {}),
    ...(cleanList(input.niches) ? { niches: cleanList(input.niches) } : {}),
    ...(cleanList(input.clusters) ? { clusters: cleanList(input.clusters) } : {}),
    ...(cleanList(input.keywords) ? { keywords: cleanList(input.keywords) } : {}),
  };
  return Object.freeze(query);
}
