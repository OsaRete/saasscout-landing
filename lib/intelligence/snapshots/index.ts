export type {
  Snapshot,
  SnapshotConfidence,
  SnapshotConfidenceCalibration,
  SnapshotDiagnostics,
  SnapshotDiagnosticCategory,
  SnapshotDiagnosticSeverity,
  SnapshotDiscoveryContext,
  SnapshotDiscoveryMode,
  SnapshotEvidence,
  SnapshotEvidenceKind,
  SnapshotEvidenceRelationship,
  SnapshotExecutionConfiguration,
  SnapshotFounderIntelligence,
  SnapshotLifecycleState,
  SnapshotMetadata,
  SnapshotOpportunityIntelligence,
  SnapshotProblemIntelligence,
  SnapshotProcessingStepStatus,
  SnapshotProvenance,
  SnapshotScore,
  SnapshotSectionIdentifier,
  SnapshotSupportTarget,
  SnapshotSupportTargetField,
  SnapshotVersions,
} from "./types";

export {
  buildSnapshot,
  SNAPSHOT_BUILDER_CONTRACT_VERSION,
  SNAPSHOT_BUILDER_ENGINE_VERSION,
  SNAPSHOT_BUILDER_INTELLIGENCE_VERSION,
  SNAPSHOT_BUILDER_NORMALIZATION_VERSION,
  SNAPSHOT_BUILDER_SNAPSHOT_VERSION,
  type SnapshotBuilderInput,
  type SnapshotBuilderMetadataInput,
} from "./builder.ts";

export {
  mapDiscoveryToSnapshotInput,
  type DiscoverySnapshotAdapterContextInput,
  type DiscoverySnapshotAdapterEvidenceInput,
  type DiscoverySnapshotAdapterInput,
  type DiscoverySnapshotAdapterMetadataInput,
} from "./discovery-adapter.ts";


export {
  buildDiscoverOpportunitiesSnapshotInput,
  type DiscoverOpportunitiesSnapshotInput,
  type DiscoverOpportunitiesSnapshotSource,
} from "./discover-opportunities-adapter.ts";

export {
  SNAPSHOT_VALIDATOR_VERSION,
  validateSnapshot,
  type SnapshotValidationIssue,
  type SnapshotValidationResult,
  type SnapshotValidationSeverity,
  type SnapshotValidationSummary,
} from "./validator.ts";

export {
  runSnapshotPipeline,
  type SnapshotPipelineDiagnostic,
  type SnapshotPipelineResult,
  type SnapshotPipelineStage,
  type SnapshotPipelineStatus,
  type SnapshotPipelineSummary,
} from "./pipeline.ts";

export {
  createSnapshotPersistenceInputFromPipeline,
  InMemorySnapshotPersistencePort,
  type SnapshotPersistenceFailureResult,
  type SnapshotPersistenceInput,
  type SnapshotPersistenceInputResult,
  type SnapshotPersistencePort,
  type SnapshotPersistenceRejectionReason,
  type SnapshotPersistenceResult,
  type SnapshotPersistenceSuccessResult,
  type SnapshotPersistenceValidationMetadata,
} from "./persistence.ts";

export {
  mapSnapshotPersistenceInputToStorageRecords,
  type SnapshotEngineAttributionStorageRecord,
  type SnapshotEvidenceLineageStorageRecord,
  type SnapshotEvidenceStorageRecord,
  type SnapshotEvidenceSupportStorageRecord,
  type SnapshotIdentityStorageRecord,
  type SnapshotProcessingHistoryStorageRecord,
  type SnapshotProvenanceSourceStorageRecord,
  type SnapshotSectionStorageRecord,
  type SnapshotStorageMapping,
  type SnapshotStorageRecord,
  type SnapshotStorageRecordBase,
  type SnapshotStorageRecordKind,
  type SnapshotValidationStorageRecord,
} from "./storage-mapper.ts";

export {
  hashSnapshotStorageMapping,
  hashSnapshotStorageRecord,
  serializeCanonicalSnapshotStorageMapping,
  serializeCanonicalSnapshotStorageRecord,
  SNAPSHOT_STORAGE_HASH_ALGORITHM,
  SNAPSHOT_STORAGE_RECORD_KINDS,
  type SnapshotStorageHash,
} from "./storage-hash.ts";

export {
  buildSupabaseSnapshotPersistencePayload,
  mapSupabaseSnapshotWriteResponse,
  type SnapshotSupabaseMappedWriteResponse,
  type SnapshotSupabaseRpcRecord,
  type SnapshotSupabaseRpcStatus,
  type SnapshotSupabaseWriteMappingPayload,
  type SnapshotSupabaseWriteMappingResponse,
} from "./supabase-persistence-adapter.ts";

export {
  InMemorySnapshotRepositoryPort,
  validateSnapshotRepositoryWriteInput,
  type SnapshotRepositoryFailureReason,
  type SnapshotRepositoryFailureResult,
  type SnapshotRepositoryIssue,
  type SnapshotRepositoryPort,
  type SnapshotRepositoryReadInput,
  type SnapshotRepositoryReadResult,
  type SnapshotRepositoryReadSuccessResult,
  type SnapshotRepositoryWriteInput,
  type SnapshotRepositoryWriteOutcome,
  type SnapshotRepositoryWriteResult,
  type SnapshotRepositoryWriteSuccessResult,
} from "./repository.ts";

export type {
  SnapshotHistoricalContext,
  SnapshotRetrievalCandidate,
  SnapshotRetrievalDiagnostics,
  SnapshotRetrievalMode,
  SnapshotRetrievalOutcome,
  SnapshotRetrievalQuery,
  SnapshotRetrievalResult,
  SnapshotRetrievalScoreBreakdown,
} from "./retrieval/index.ts";

export {
  buildSnapshotHistoricalContext,
  calculateSnapshotRetrievalBreakdown,
  InMemorySnapshotRetrievalRepository,
  normalizeSnapshotRetrievalQuery,
  rankSnapshotRetrievalCandidates,
  SNAPSHOT_RETRIEVAL_WEIGHTS,
  SNAPSHOT_RETRIEVAL_WEIGHT_SUM,
  tokenizeDeterministically,
  type SnapshotRetrievalRepository,
} from "./retrieval/index.ts";
