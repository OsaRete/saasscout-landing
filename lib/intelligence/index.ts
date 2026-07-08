export {
  adaptDiscoverySourcesToInput,
  validateDiscoveryAdapterSources,
  type DiscoveryAdapterSource,
  type DiscoverySourceAdapterInput,
} from "./discovery-source-adapter";
export { DiscoveryOrchestrator } from "./orchestrator";
export {
  advanceDiscoveryStage,
  appendDiscoveryWarning,
  createDiscoveryContext,
  createInitialDiscoveryState,
} from "./state";
export {
  canAdvanceDiscoveryStage,
  getDiscoveryPipelineOrder,
  validateDiscoveryState,
  type DiscoveryPipelineValidationResult,
} from "./validation";
export type {
  DiscoveryContext,
  DiscoveryDecisionContext,
  DiscoveryInput,
  DiscoveryMetrics,
  DiscoveryModularPipelineOptions,
  DiscoveryModularPipelineOutputs,
  DiscoveryModularPipelineResult,
  DiscoveryPipelineState,
  DiscoveryPipelineStage,
  DiscoveryPipelineStageDiagnostic,
  DiscoveryStageStatus,
  DiscoveryResult,
  DiscoveryStage,
} from "./types";

export {
  buildSolutionDiagnosticAggregateReport,
  createEmptySolutionDiagnosticAggregateReport,
  formatSolutionDiagnosticSummary,
  getSolutionConfidenceBucket,
  mergeSolutionDiagnosticAggregateReports,
  type SolutionCategoryDiagnosticStats,
  type SolutionConfidenceBucket,
  type SolutionDiagnosticAggregateReport,
} from "./solution-diagnostics/index.ts";

export type {
  Snapshot,
  SnapshotConfidence,
  SnapshotConfidenceCalibration,
  SnapshotDiagnostics,
  SnapshotDiscoveryContext,
  SnapshotEvidence,
  SnapshotExecutionConfiguration,
  SnapshotFounderIntelligence,
  SnapshotMetadata,
  SnapshotOpportunityIntelligence,
  SnapshotProblemIntelligence,
  SnapshotProvenance,
  SnapshotSectionIdentifier,
  SnapshotSupportTarget,
  SnapshotSupportTargetField,
  SnapshotVersions,
} from "./snapshots";
