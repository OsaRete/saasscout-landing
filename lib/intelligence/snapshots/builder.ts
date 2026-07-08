import type {
  Snapshot,
  SnapshotConfidence,
  SnapshotDiagnostics,
  SnapshotDiscoveryContext,
  SnapshotEvidence,
  SnapshotExecutionConfiguration,
  SnapshotFounderIntelligence,
  SnapshotLifecycleState,
  SnapshotMetadata,
  SnapshotOpportunityIntelligence,
  SnapshotProblemIntelligence,
  SnapshotProvenance,
  SnapshotVersions,
} from "./types";

export const SNAPSHOT_BUILDER_CONTRACT_VERSION = "1.0";
export const SNAPSHOT_BUILDER_SNAPSHOT_VERSION = "1.0";
export const SNAPSHOT_BUILDER_ENGINE_VERSION = "snapshot-builder-scaffold@1.0";
export const SNAPSHOT_BUILDER_INTELLIGENCE_VERSION = "discovery-like-input@1.0";
export const SNAPSHOT_BUILDER_NORMALIZATION_VERSION = "snapshot-normalization-scaffold@1.0";

export type SnapshotBuilderMetadataInput = Readonly<{
  snapshotId: string;
  discoveryId: string;
  createdAt: string;
  snapshotVersion?: string;
  contractVersion?: string;
  lifecycleState?: SnapshotLifecycleState;
}>;

export type SnapshotBuilderInput = Readonly<{
  metadata: SnapshotBuilderMetadataInput;
  discoveryContext: SnapshotDiscoveryContext;
  problemIntelligence: SnapshotProblemIntelligence;
  opportunityIntelligence: SnapshotOpportunityIntelligence;
  founderIntelligence?: SnapshotFounderIntelligence;
  evidence: readonly SnapshotEvidence[];
  confidence: SnapshotConfidence;
  diagnostics?: SnapshotDiagnostics;
  versions?: Partial<SnapshotVersions>;
  provenance: SnapshotProvenance;
}>;

function assertRequiredString(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`Snapshot Builder requires ${fieldName}.`);
  }
}

function sortStrings(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function normalizeExecutionConfiguration(
  configuration: SnapshotExecutionConfiguration | undefined
): SnapshotExecutionConfiguration | undefined {
  if (!configuration) return undefined;

  return {
    ...configuration,
    selectedSourceProviders: configuration.selectedSourceProviders
      ? sortStrings(configuration.selectedSourceProviders)
      : undefined,
  };
}

function buildMetadata(input: SnapshotBuilderMetadataInput): SnapshotMetadata {
  assertRequiredString(input.snapshotId, "metadata.snapshotId");
  assertRequiredString(input.discoveryId, "metadata.discoveryId");
  assertRequiredString(input.createdAt, "metadata.createdAt");

  return {
    snapshotId: input.snapshotId,
    discoveryId: input.discoveryId,
    snapshotVersion: input.snapshotVersion ?? SNAPSHOT_BUILDER_SNAPSHOT_VERSION,
    contractVersion: input.contractVersion ?? SNAPSHOT_BUILDER_CONTRACT_VERSION,
    createdAt: input.createdAt,
    lifecycleState: input.lifecycleState ?? "created",
  };
}

function buildDiscoveryContext(input: SnapshotDiscoveryContext): SnapshotDiscoveryContext {
  assertRequiredString(input.searchTopic, "discoveryContext.searchTopic");

  return {
    ...input,
    sourceProviders: sortStrings(input.sourceProviders),
    execution: {
      ...input.execution,
      configuration: normalizeExecutionConfiguration(input.execution.configuration),
    },
  };
}

function buildDiagnostics(input: SnapshotDiagnostics | undefined): SnapshotDiagnostics {
  return (
    input ?? {
      items: [],
      processing: [
        {
          step: "snapshot_builder_scaffold",
          status: "completed",
          warnings: [],
        },
      ],
      metrics: {},
    }
  );
}

function buildVersions(input: Partial<SnapshotVersions> | undefined): SnapshotVersions {
  return {
    snapshotContract: input?.snapshotContract ?? SNAPSHOT_BUILDER_CONTRACT_VERSION,
    engine: input?.engine ?? SNAPSHOT_BUILDER_ENGINE_VERSION,
    intelligence: input?.intelligence ?? SNAPSHOT_BUILDER_INTELLIGENCE_VERSION,
    confidence: input?.confidence,
    normalization: input?.normalization ?? SNAPSHOT_BUILDER_NORMALIZATION_VERSION,
  };
}

function buildEvidence(input: readonly SnapshotEvidence[]): readonly SnapshotEvidence[] {
  return [...input].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function cloneSnapshotValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneSnapshotValue(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneSnapshotValue(nestedValue)])
    ) as T;
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }

  return value;
}

export function buildSnapshot(input: SnapshotBuilderInput): Snapshot {
  const snapshot: Snapshot = {
    metadata: buildMetadata(input.metadata),
    discoveryContext: buildDiscoveryContext(input.discoveryContext),
    problemIntelligence: input.problemIntelligence,
    opportunityIntelligence: input.opportunityIntelligence,
    ...(input.founderIntelligence ? { founderIntelligence: input.founderIntelligence } : {}),
    evidence: buildEvidence(input.evidence),
    confidence: input.confidence,
    diagnostics: buildDiagnostics(input.diagnostics),
    versions: buildVersions(input.versions),
    provenance: input.provenance,
  };

  return deepFreeze(cloneSnapshotValue(snapshot));
}
