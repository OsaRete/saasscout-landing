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

export type SnapshotSectionIdentifier =
  | "metadata"
  | "discovery_context"
  | "problem_intelligence"
  | "opportunity_intelligence"
  | "founder_intelligence"
  | "evidence"
  | "confidence"
  | "diagnostics"
  | "versions"
  | "provenance";

export type SnapshotSupportTargetField =
  | "title"
  | "summary"
  | "pain_description"
  | "affected_market"
  | "affected_audience"
  | "pain_severity"
  | "frequency"
  | "urgency"
  | "existing_workarounds"
  | "related_niches"
  | "opportunity_score"
  | "market_size_signals"
  | "competitive_signals"
  | "build_simplicity"
  | "willingness_to_pay"
  | "revenue_potential"
  | "risk_indicators"
  | "validation_indicators"
  | "founder_score"
  | "founder_fit"
  | "technical_complexity"
  | "domain_match"
  | "distribution_match"
  | "execution_difficulty"
  | "founder_advantages"
  | "founder_risks"
  | "overall"
  | "evidence"
  | "opportunity"
  | "founder"
  | "market"
  | "diagnostic_item"
  | "processing_step"
  | "metric";

export type SnapshotSupportTarget = Readonly<{
  /** Canonical Snapshot section supported by this evidence. */
  section: SnapshotSectionIdentifier;
  /** Optional canonical field within the target section. */
  field?: SnapshotSupportTargetField;
  /** Optional stable identifier for a specific target item, score, diagnostic, or related artifact. */
  targetId?: string;
  /** Optional deterministic explanation of why the evidence supports the target. */
  rationale?: string;
}>;

export type SnapshotDiagnosticSeverity = "info" | "warning" | "error";

export type SnapshotDiagnosticCategory =
  | "engine"
  | "quality"
  | "decision"
  | "validation"
  | "processing"
  | "scoring";

export type SnapshotProcessingStepStatus = "completed" | "skipped" | "warning" | "failed";

export type SnapshotExecutionConfiguration = Readonly<{
  /** Requested result cap only; actual provider/runtime pagination details are excluded. */
  requestedMaxResults?: number;
  /** Normalized source/provider names selected for this execution; no raw provider configuration. */
  selectedSourceProviders?: readonly string[];
  /** Canonical Discovery mode requested for this execution. */
  discoveryMode?: SnapshotDiscoveryMode;
  /** Locale hint such as "en-US" when provided by Discovery. */
  locale?: string | null;
  /** Language hint such as "en" when provided by Discovery. */
  language?: string | null;
  /** Market hint requested by the execution context. */
  marketHint?: string | null;
  /** Audience hint requested by the execution context. */
  audienceHint?: string | null;
  /** Whether founder context was requested; excludes the founder profile itself. */
  includeFounderContext?: boolean;
}>;

export type SnapshotConfidenceCalibration = Readonly<{
  /** Provider-independent calibration method identifier. */
  method: "heuristic" | "statistical" | "hybrid" | "manual_review" | "unknown";
  /** Version of the provider-independent confidence method. */
  methodVersion?: string;
  /** Deterministic score scale used by confidence scores. */
  scoreScale?: Readonly<{
    min: number;
    max: number;
    interpretation?: string;
  }>;
  /** Deterministic calibration notes only; no runtime debug objects or provider metadata. */
  notes?: readonly string[];
}>;

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
    configuration?: SnapshotExecutionConfiguration;
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
  /** Canonical Snapshot targets this evidence supports; never arbitrary strings or provider payload paths. */
  supports: readonly SnapshotSupportTarget[];
  confidence?: SnapshotScore;
  provenanceIds: readonly string[];
}>;

export type SnapshotConfidence = Readonly<{
  overall: SnapshotScore;
  evidence?: SnapshotScore;
  opportunity?: SnapshotScore;
  founder?: SnapshotScore;
  market?: SnapshotScore;
  /** Provider-independent confidence calibration metadata. */
  calibration?: SnapshotConfidenceCalibration;
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
