import type { SnapshotBuilderInput } from "./builder.ts";
import type {
  SnapshotConfidence,
  SnapshotDiagnostics,
  SnapshotDiscoveryMode,
  SnapshotEvidence,
  SnapshotEvidenceKind,
  SnapshotEvidenceRelationship,
  SnapshotExecutionConfiguration,
  SnapshotFounderIntelligence,
  SnapshotOpportunityIntelligence,
  SnapshotProblemIntelligence,
  SnapshotProvenance,
  SnapshotScore,
  SnapshotSupportTarget,
  SnapshotVersions,
} from "./types";

export type DiscoverySnapshotAdapterMetadataInput = Readonly<{
  snapshotId: string;
  discoveryId: string;
  createdAt: string;
}>;

export type DiscoverySnapshotAdapterContextInput = Readonly<{
  searchTopic: string;
  searchIntent?: string | null;
  discoveryMode?: SnapshotDiscoveryMode;
  requestedLanguage?: string | null;
  requestedMarket?: string | null;
  requestedAudience?: string | null;
  sourceProviders?: readonly string[];
  requestedAt?: string;
  completedAt?: string;
  configuration?: SnapshotExecutionConfiguration;
}>;

export type DiscoverySnapshotAdapterEvidenceInput = Readonly<{
  evidenceId: string;
  kind: SnapshotEvidenceKind;
  relationship: SnapshotEvidenceRelationship;
  claim: string;
  supports: readonly SnapshotSupportTarget[];
  confidence?: SnapshotScore;
  sourceReference?: SnapshotEvidence["sourceReference"];
  provenanceIds?: readonly string[];
}>;

export type DiscoverySnapshotAdapterInput = Readonly<{
  metadata: DiscoverySnapshotAdapterMetadataInput;
  discoveryContext: DiscoverySnapshotAdapterContextInput;
  problemIntelligence: SnapshotProblemIntelligence;
  opportunityIntelligence: SnapshotOpportunityIntelligence;
  founderIntelligence?: SnapshotFounderIntelligence;
  evidence: readonly DiscoverySnapshotAdapterEvidenceInput[];
  confidence: SnapshotConfidence;
  diagnostics?: SnapshotDiagnostics;
  versions?: Partial<SnapshotVersions>;
  provenance?: Readonly<{
    runId?: string;
    engineAttribution?: SnapshotProvenance["engineAttribution"];
    processingHistory?: SnapshotProvenance["processingHistory"];
  }>;
}>;

function requireNonEmpty(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`Discovery Snapshot Adapter requires ${fieldName}.`);
  }

  return normalized;
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function normalizeStringList(
  values: readonly string[] = [],
): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    compareStrings,
  );
}

function normalizeScore(
  score: SnapshotScore | undefined,
): SnapshotScore | undefined {
  if (!score) return undefined;

  return {
    value: score.value,
    ...(score.rationale
      ? { rationale: normalizeStringList(score.rationale) }
      : {}),
  };
}

function normalizeSupports(
  supports: readonly SnapshotSupportTarget[],
): readonly SnapshotSupportTarget[] {
  return [...supports]
    .map((support) => ({
      section: support.section,
      ...(support.field ? { field: support.field } : {}),
      ...(support.targetId ? { targetId: support.targetId.trim() } : {}),
      ...(support.rationale ? { rationale: support.rationale.trim() } : {}),
    }))
    .sort((left, right) => {
      const leftKey = `${left.section}:${left.field ?? ""}:${left.targetId ?? ""}:${left.rationale ?? ""}`;
      const rightKey = `${right.section}:${right.field ?? ""}:${right.targetId ?? ""}:${right.rationale ?? ""}`;
      return leftKey.localeCompare(rightKey);
    });
}

function normalizeEvidence(
  input: readonly DiscoverySnapshotAdapterEvidenceInput[],
): readonly SnapshotEvidence[] {
  return input
    .map((evidence) => ({
      evidenceId: requireNonEmpty(evidence.evidenceId, "evidence.evidenceId"),
      kind: evidence.kind,
      relationship: evidence.relationship,
      ...(evidence.sourceReference
        ? {
            sourceReference: {
              ...(evidence.sourceReference.sourceId
                ? {
                    sourceId: requireNonEmpty(
                      evidence.sourceReference.sourceId,
                      "evidence.sourceReference.sourceId",
                    ),
                  }
                : {}),
              ...(evidence.sourceReference.sourceType
                ? {
                    sourceType: requireNonEmpty(
                      evidence.sourceReference.sourceType,
                      "evidence.sourceReference.sourceType",
                    ),
                  }
                : {}),
              ...(evidence.sourceReference.sourceName !== undefined
                ? {
                    sourceName:
                      normalizeOptionalString(
                        evidence.sourceReference.sourceName,
                      ) ?? null,
                  }
                : {}),
              ...(evidence.sourceReference.sourceUrl !== undefined
                ? {
                    sourceUrl:
                      normalizeOptionalString(
                        evidence.sourceReference.sourceUrl,
                      ) ?? null,
                  }
                : {}),
              ...(evidence.sourceReference.capturedAt
                ? {
                    capturedAt: requireNonEmpty(
                      evidence.sourceReference.capturedAt,
                      "evidence.sourceReference.capturedAt",
                    ),
                  }
                : {}),
            },
          }
        : {}),
      claim: requireNonEmpty(evidence.claim, "evidence.claim"),
      supports: normalizeSupports(evidence.supports),
      ...(evidence.confidence
        ? { confidence: normalizeScore(evidence.confidence) }
        : {}),
      provenanceIds: normalizeStringList(evidence.provenanceIds),
    }))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function normalizeProblemIntelligence(
  input: SnapshotProblemIntelligence,
): SnapshotProblemIntelligence {
  return {
    ...input,
    title: requireNonEmpty(input.title, "problemIntelligence.title"),
    summary: requireNonEmpty(input.summary, "problemIntelligence.summary"),
    painSeverity: normalizeScore(input.painSeverity),
    frequency: normalizeScore(input.frequency),
    urgency: normalizeScore(input.urgency),
    existingWorkarounds: normalizeStringList(input.existingWorkarounds),
    relatedNiches: normalizeStringList(input.relatedNiches),
    evidenceIds: normalizeStringList(input.evidenceIds),
  };
}

function normalizeOpportunityIntelligence(
  input: SnapshotOpportunityIntelligence,
): SnapshotOpportunityIntelligence {
  return {
    ...input,
    summary: requireNonEmpty(input.summary, "opportunityIntelligence.summary"),
    opportunityScore: normalizeScore(input.opportunityScore),
    marketSizeSignals: normalizeStringList(input.marketSizeSignals),
    competitiveSignals: normalizeStringList(input.competitiveSignals),
    buildSimplicity: normalizeScore(input.buildSimplicity),
    willingnessToPay: normalizeScore(input.willingnessToPay),
    revenuePotential: normalizeScore(input.revenuePotential),
    riskIndicators: normalizeStringList(input.riskIndicators),
    validationIndicators: normalizeStringList(input.validationIndicators),
    evidenceIds: normalizeStringList(input.evidenceIds),
  };
}

function normalizeFounderIntelligence(
  input: SnapshotFounderIntelligence | undefined,
): SnapshotFounderIntelligence | undefined {
  if (!input) return undefined;

  return {
    ...input,
    founderScore: normalizeScore(input.founderScore),
    technicalComplexity: normalizeScore(input.technicalComplexity),
    domainMatch: normalizeScore(input.domainMatch),
    distributionMatch: normalizeScore(input.distributionMatch),
    executionDifficulty: normalizeScore(input.executionDifficulty),
    founderAdvantages: normalizeStringList(input.founderAdvantages),
    founderRisks: normalizeStringList(input.founderRisks),
    evidenceIds: normalizeStringList(input.evidenceIds),
  };
}

function normalizeDiagnostics(
  input: SnapshotDiagnostics | undefined,
): SnapshotDiagnostics | undefined {
  if (!input) return undefined;

  return {
    items: [...input.items].sort((left, right) =>
      left.diagnosticId.localeCompare(right.diagnosticId),
    ),
    processing: [...input.processing]
      .map((step) => ({
        ...step,
        warnings: normalizeStringList(step.warnings),
      }))
      .sort((left, right) =>
        `${left.step}:${left.status}`.localeCompare(
          `${right.step}:${right.status}`,
        ),
      ),
    metrics: Object.fromEntries(
      Object.entries(input.metrics).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

function sourceIdForEvidence(evidence: SnapshotEvidence): string | undefined {
  return evidence.sourceReference?.sourceId ?? evidence.provenanceIds[0];
}

function buildProvenance(
  input: DiscoverySnapshotAdapterInput,
  evidence: readonly SnapshotEvidence[],
): SnapshotProvenance {
  const sourceReferences = evidence
    .map((item) => item.sourceReference)
    .filter(
      (
        sourceReference,
      ): sourceReference is NonNullable<SnapshotEvidence["sourceReference"]> =>
        Boolean(sourceReference?.sourceId),
    )
    .map((sourceReference) => ({
      sourceId: sourceReference.sourceId as string,
      ...(sourceReference.sourceType
        ? { sourceType: sourceReference.sourceType }
        : {}),
      ...(sourceReference.sourceName !== undefined
        ? { sourceName: sourceReference.sourceName }
        : {}),
      ...(sourceReference.sourceUrl !== undefined
        ? { sourceUrl: sourceReference.sourceUrl }
        : {}),
    }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  const evidenceLineage = evidence.map((item) => ({
    evidenceId: item.evidenceId,
    derivedFrom: normalizeStringList(
      item.provenanceIds.length > 0
        ? item.provenanceIds
        : [sourceIdForEvidence(item) ?? item.evidenceId],
    ),
  }));

  return {
    discoveryOrigin: {
      discoveryId: requireNonEmpty(
        input.metadata.discoveryId,
        "metadata.discoveryId",
      ),
      ...(input.provenance?.runId
        ? { runId: requireNonEmpty(input.provenance.runId, "provenance.runId") }
        : {}),
    },
    engineAttribution: [...(input.provenance?.engineAttribution ?? [])].sort(
      (left, right) => {
        const leftKey = `${left.section}:${left.engineName}:${left.engineVersion}`;
        const rightKey = `${right.section}:${right.engineName}:${right.engineVersion}`;
        return leftKey.localeCompare(rightKey);
      },
    ),
    sourceReferences,
    evidenceLineage,
    processingHistory: [...(input.provenance?.processingHistory ?? [])].sort(
      (left, right) => {
        const leftKey = `${left.step}:${left.completedAt ?? ""}:${left.version ?? ""}`;
        const rightKey = `${right.step}:${right.completedAt ?? ""}:${right.version ?? ""}`;
        return leftKey.localeCompare(rightKey);
      },
    ),
  };
}

function normalizeExecutionConfiguration(
  configuration: SnapshotExecutionConfiguration | undefined,
): SnapshotExecutionConfiguration | undefined {
  if (!configuration) return undefined;

  return {
    ...configuration,
    selectedSourceProviders: configuration.selectedSourceProviders
      ? normalizeStringList(configuration.selectedSourceProviders)
      : undefined,
  };
}

export function mapDiscoveryToSnapshotInput(
  input: DiscoverySnapshotAdapterInput,
): SnapshotBuilderInput {
  const evidence = normalizeEvidence(input.evidence);
  const discoveryMode = input.discoveryContext.discoveryMode ?? "unknown";
  const sourceProviders = normalizeStringList(
    input.discoveryContext.sourceProviders,
  );

  return {
    metadata: {
      snapshotId: requireNonEmpty(
        input.metadata.snapshotId,
        "metadata.snapshotId",
      ),
      discoveryId: requireNonEmpty(
        input.metadata.discoveryId,
        "metadata.discoveryId",
      ),
      createdAt: requireNonEmpty(
        input.metadata.createdAt,
        "metadata.createdAt",
      ),
    },
    discoveryContext: {
      searchTopic: requireNonEmpty(
        input.discoveryContext.searchTopic,
        "discoveryContext.searchTopic",
      ),
      searchIntent: normalizeOptionalString(
        input.discoveryContext.searchIntent,
      ),
      discoveryMode,
      requestedLanguage: normalizeOptionalString(
        input.discoveryContext.requestedLanguage,
      ),
      requestedMarket: normalizeOptionalString(
        input.discoveryContext.requestedMarket,
      ),
      requestedAudience: normalizeOptionalString(
        input.discoveryContext.requestedAudience,
      ),
      sourceProviders,
      execution: {
        ...(input.discoveryContext.requestedAt
          ? {
              requestedAt: requireNonEmpty(
                input.discoveryContext.requestedAt,
                "discoveryContext.requestedAt",
              ),
            }
          : {}),
        ...(input.discoveryContext.completedAt
          ? {
              completedAt: requireNonEmpty(
                input.discoveryContext.completedAt,
                "discoveryContext.completedAt",
              ),
            }
          : {}),
        configuration: normalizeExecutionConfiguration(
          input.discoveryContext.configuration,
        ),
      },
    },
    problemIntelligence: normalizeProblemIntelligence(
      input.problemIntelligence,
    ),
    opportunityIntelligence: normalizeOpportunityIntelligence(
      input.opportunityIntelligence,
    ),
    ...(input.founderIntelligence
      ? {
          founderIntelligence: normalizeFounderIntelligence(
            input.founderIntelligence,
          ),
        }
      : {}),
    evidence,
    confidence: input.confidence,
    diagnostics: normalizeDiagnostics(input.diagnostics),
    versions: input.versions,
    provenance: buildProvenance(input, evidence),
  };
}
