import type { SnapshotLifecycleState } from "../types.ts";

export type SnapshotRetrievalMode = "disabled" | "shadow" | "influence";
export type SnapshotRetrievalOwnershipScope = "user" | "organization" | "discovery" | "unknown";
export type SnapshotRetrievalLifecycleState = Extract<SnapshotLifecycleState, "validated" | "persisted">;

export type SnapshotRetrievalQuery = Readonly<{
  rawQueryText: string;
  userId?: string;
  organizationId?: string | null;
  discoveryId?: string;
  excludeDiscoveryId?: string;
  niches?: readonly string[];
  clusters?: readonly string[];
  keywords?: readonly string[];
  maxCandidates?: number;
  resultLimit?: number;
  referenceTimestamp: string;
  timeWindowDays?: number;
}>;

export type SnapshotRetrievalEvidenceSignal = Readonly<{
  claimSnippet: string;
  confidence?: number | null;
  supportingTargetCount?: number;
  sourceType?: string | null;
}>;

export type SnapshotRetrievalCandidate = Readonly<{
  snapshotId: string;
  discoveryId: string;
  contractVersion: string;
  createdAt: string;
  lifecycleState: SnapshotRetrievalLifecycleState;
  ownership: Readonly<{
    userId?: string;
    organizationId?: string | null;
    discoveryId: string;
    scope: SnapshotRetrievalOwnershipScope;
  }>;
  problem: Readonly<{
    title: string;
    summary: string;
    affectedMarket?: string | null;
    relatedNiches: readonly string[];
  }>;
  opportunity: Readonly<{
    summary: string;
  }>;
  confidence?: Readonly<{
    overall?: number | null;
  }>;
  evidenceSignals: readonly SnapshotRetrievalEvidenceSignal[];
  sourceTypes: readonly string[];
}>;

export type SnapshotRetrievalScoreBreakdown = Readonly<{
  queryTextMatch: number;
  nicheOverlap: number;
  clusterOverlap: number;
  evidenceStrength: number;
  snapshotConfidence: number;
  provenanceDiversity: number;
  freshness: number;
  semanticSimilarity?: number;
}>;

export type SnapshotRetrievalResult = Readonly<{
  snapshotId: string;
  discoveryId: string;
  contractVersion: string;
  createdAt: string;
  lifecycleState: SnapshotRetrievalLifecycleState;
  ownership: SnapshotRetrievalCandidate["ownership"];
  title: string;
  summary: string;
  opportunitySummary: string;
  relatedNiches: readonly string[];
  affectedMarket?: string | null;
  confidence: number;
  evidenceCount: number;
  sourceTypes: readonly string[];
  claimSnippets: readonly string[];
  score: number;
  scoreBreakdown: SnapshotRetrievalScoreBreakdown;
  explanations: readonly string[];
}>;

export type SnapshotHistoricalContext = Readonly<{
  snapshotId: string;
  discoveryId: string;
  createdAt: string;
  title: string;
  summary: string;
  opportunitySummary: string;
  relatedNiches: readonly string[];
  affectedMarket?: string | null;
  confidence: number;
  evidenceCount: number;
  sourceTypes: readonly string[];
  claimSnippets: readonly string[];
  retrievalExplanations: readonly string[];
}>;

export type SnapshotRetrievalDiagnostics = Readonly<{
  mode: SnapshotRetrievalMode;
  ownershipScope: SnapshotRetrievalOwnershipScope;
  queryFingerprint: string;
  candidateCount: number;
  rankedResultCount: number;
  contextCount: number;
  repositoryCalled: boolean;
  unsupportedMode?: boolean;
  errorCode?: string;
}>;

export type SnapshotRetrievalOutcome = Readonly<{
  status: "disabled" | "shadow_success" | "unsupported_mode" | "error";
  results: readonly SnapshotRetrievalResult[];
  historicalContext: readonly SnapshotHistoricalContext[];
  diagnostics: SnapshotRetrievalDiagnostics;
  error?: Readonly<{ code: string; message: string }>;
}>;
