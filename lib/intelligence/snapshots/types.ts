/**
 * Canonical Snapshot TypeScript contract for Phase 1 of the Data Moat Snapshot architecture.
 *
 * These types intentionally model the conceptual Snapshot contract only. They do not define
 * persistence schemas, API responses, UI view models, provider payloads, prompt history, or
 * executable Snapshot Builder/Validator behavior.
 */
export type SnapshotLifecycleState = "created" | "validated" | "persisted" | "rejected";

export type SnapshotDiscoveryMode =
  | "market_discovery"
  | "problem_discovery"
  | "opportunity_discovery"
  | "founder_match"
  | "diagnostic"
  | "unknown";

export type SnapshotEvidenceKind =
  | "external_source"
  | "extracted_signal"
  | "supporting_observation"
  | "market_indicator"
  | "confidence_rationale";

export type SnapshotEvidenceRelationship =
  | "supports_problem"
  | "supports_opportunity"
  | "supports_founder_intelligence"
  | "supports_confidence"
  | "supports_diagnostic";

export type SnapshotDiagnosticSeverity = "info" | "warning" | "error";

export type SnapshotDiagnosticCategory =
  | "engine"
  | "quality"
  | "decision"
  | "validation"
  | "processing"
  | "scoring";

export type SnapshotProcessingStepStatus = "completed" | "skipped" | "warning" | "failed";

export type SnapshotScore = Readonly<{
  /** Canonical normalized score. Current convention is 0-1 unless a future version says otherwise. */
  value: number;
  /** Human-readable explanation of what this score represents. */
  rationale?: readonly string[];
}>;

export type SnapshotMetadata = Readonly<{
  /** Immutable Snapshot identifier assigned by the future Snapshot Engine. */
  snapshotId: string;
  /** Discovery execution identifier that produced this Snapshot. */
  discoveryId: string;
  /** Snapshot version visible at the identity layer for traceability. */
  snapshotVersion: string;
  /** Contract version visible at the identity layer for compatibility checks. */
  contractVersion: string;
  /** ISO-8601 creation timestamp. Timestamp is metadata only and not business intelligence. */
  createdAt: string;
  /** Lifecycle state for interpreting Snapshot handling without mutating historical intelligence. */
  lifecycleState: SnapshotLifecycleState;
}>;

export type SnapshotDiscoveryContext = Readonly<{
  /** Topic or query that framed the Discovery execution. */
  searchTopic: string;
  /** Optional user or system intent that describes why Discovery was requested. */
  searchIntent?: string | null;
  discoveryMode: SnapshotDiscoveryMode;
  requestedLanguage?: string | null;
  requestedMarket?: string | null;
  requestedAudience?: string | null;
  /** Normalized source/provider names only; no provider-specific payloads. */
  sourceProviders: readonly string[];
  /** Deterministic, provider-independent execution context. */
  execution: Readonly<{
    requestedAt?: string;
    completedAt?: string;
    configuration?: Readonly<Record<string, unknown>>;
  }>;
}>;

export type SnapshotProblemIntelligence = Readonly<{
  title: string;
  summary: string;
  painDescription?: string | null;
  affectedMarket?: string | null;
  affectedAudience?: string | null;
  painSeverity?: SnapshotScore;
  frequency?: SnapshotScore;
  urgency?: SnapshotScore;
  existingWorkarounds: readonly string[];
  relatedNiches: readonly string[];
  evidenceIds: readonly string[];
}>;

export type SnapshotOpportunityIntelligence = Readonly<{
  summary: string;
  opportunityScore?: SnapshotScore;
  marketSizeSignals: readonly string[];
  competitiveSignals: readonly string[];
  buildSimplicity?: SnapshotScore;
  willingnessToPay?: SnapshotScore;
  revenuePotential?: SnapshotScore;
  riskIndicators: readonly string[];
  validationIndicators: readonly string[];
  evidenceIds: readonly string[];
}>;

export type SnapshotFounderIntelligence = Readonly<{
  founderScore?: SnapshotScore;
  founderFit?: string | null;
  technicalComplexity?: SnapshotScore;
  domainMatch?: SnapshotScore;
  distributionMatch?: SnapshotScore;
  executionDifficulty?: SnapshotScore;
  founderAdvantages: readonly string[];
  founderRisks: readonly string[];
  evidenceIds: readonly string[];
}>;

export type SnapshotEvidence = Readonly<{
  evidenceId: string;
  kind: SnapshotEvidenceKind;
  relationship: SnapshotEvidenceRelationship;
  sourceReference?: Readonly<{
    sourceId?: string;
    sourceType?: string;
    sourceName?: string | null;
    sourceUrl?: string | null;
    capturedAt?: string;
  }>;
  /** Provider-independent description of the supporting signal; never raw provider payload. */
  claim: string;
  /** IDs of Snapshot sections or normalized intelligence artifacts this evidence supports. */
  supports: readonly string[];
  confidence?: SnapshotScore;
  provenanceIds: readonly string[];
}>;

export type SnapshotConfidence = Readonly<{
  overall: SnapshotScore;
  evidence?: SnapshotScore;
  opportunity?: SnapshotScore;
  founder?: SnapshotScore;
  market?: SnapshotScore;
  /** Reserved for future confidence calibration metadata without forcing a contract rewrite. */
  calibration?: Readonly<Record<string, unknown>>;
}>;

export type SnapshotDiagnostics = Readonly<{
  items: readonly Readonly<{
    diagnosticId: string;
    category: SnapshotDiagnosticCategory;
    severity: SnapshotDiagnosticSeverity;
    code: string;
    message: string;
    relatedEvidenceIds: readonly string[];
  }>[];
  processing: readonly Readonly<{
    step: string;
    status: SnapshotProcessingStepStatus;
    warnings: readonly string[];
  }>[];
  metrics: Readonly<Record<string, number>>;
}>;

export type SnapshotVersions = Readonly<{
  snapshotContract: string;
  engine: string;
  intelligence: string;
  confidence?: string;
  normalization?: string;
}>;

export type SnapshotProvenance = Readonly<{
  discoveryOrigin: Readonly<{
    discoveryId: string;
    runId?: string;
  }>;
  engineAttribution: readonly Readonly<{
    engineName: string;
    engineVersion: string;
    section: keyof Pick<
      Snapshot,
      "problemIntelligence" | "opportunityIntelligence" | "founderIntelligence" | "confidence" | "diagnostics"
    >;
  }>[];
  sourceReferences: readonly Readonly<{
    sourceId: string;
    sourceType?: string;
    sourceName?: string | null;
    sourceUrl?: string | null;
  }>[];
  evidenceLineage: readonly Readonly<{
    evidenceId: string;
    derivedFrom: readonly string[];
  }>[];
  /** Normalized processing history only; prompt history and raw provider responses are excluded. */
  processingHistory: readonly Readonly<{
    step: string;
    completedAt?: string;
    version?: string;
  }>[];
}>;

export type Snapshot = Readonly<{
  metadata: SnapshotMetadata;
  discoveryContext: SnapshotDiscoveryContext;
  problemIntelligence: SnapshotProblemIntelligence;
  opportunityIntelligence: SnapshotOpportunityIntelligence;
  /** Optional by contract; absence must never invalidate a Snapshot. */
  founderIntelligence?: SnapshotFounderIntelligence;
  evidence: readonly SnapshotEvidence[];
  confidence: SnapshotConfidence;
  diagnostics: SnapshotDiagnostics;
  versions: SnapshotVersions;
  provenance: SnapshotProvenance;
}>;
