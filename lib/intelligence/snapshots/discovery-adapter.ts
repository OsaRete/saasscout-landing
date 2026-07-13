import type { SnapshotBuilderInput } from "./builder.ts";
import type {
  SnapshotConfidence,
  SnapshotDiagnostics,
  SnapshotDiscoveryMode,
  SnapshotEvidence,
  SnapshotEvidenceKind,
  SnapshotEvidenceRelationship,
  SnapshotExecutionConfiguration,
  SnapshotLifecycleState,
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
  lifecycleState?: SnapshotLifecycleState;
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

function omitUndefined<T extends Readonly<Record<string, unknown>>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined),
  ) as T;
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
    rationale: score.rationale ? normalizeStringList(score.rationale) : undefined,
  };
}

function normalizeSupports(
  supports: readonly SnapshotSupportTarget[],
): readonly SnapshotSupportTarget[] {
  return [...supports]
    .map((support) =>
      omitUndefined({
        section: support.section,
        field: support.field,
        targetId: support.targetId ? support.targetId.trim() : undefined,
        rationale: support.rationale ? support.rationale.trim() : undefined,
      }),
    )
    .sort((left, right) => {
      const leftKey = `${left.section}:${left.field ?? ""}:${left.targetId ?? ""}:${left.rationale ?? ""}`;
      const rightKey = `${right.section}:${right.field ?? ""}:${right.targetId ?? ""}:${right.rationale ?? ""}`;
      return leftKey.localeCompare(rightKey);
    });
}

function normalizeSourceReference(
  sourceReference: SnapshotEvidence["sourceReference"] | undefined,
): SnapshotEvidence["sourceReference"] | undefined {
  if (!sourceReference) return undefined;

  return {
    sourceId: sourceReference.sourceId
      ? requireNonEmpty(
          sourceReference.sourceId,
          "evidence.sourceReference.sourceId",
        )
      : undefined,
    sourceType: sourceReference.sourceType
      ? requireNonEmpty(
          sourceReference.sourceType,
          "evidence.sourceReference.sourceType",
        )
      : undefined,
    sourceName:
      sourceReference.sourceName !== undefined
        ? normalizeOptionalString(sourceReference.sourceName) ?? null
        : undefined,
    sourceUrl:
      sourceReference.sourceUrl !== undefined
        ? normalizeOptionalString(sourceReference.sourceUrl) ?? null
        : undefined,
    capturedAt: sourceReference.capturedAt
      ? requireNonEmpty(
          sourceReference.capturedAt,
          "evidence.sourceReference.capturedAt",
        )
      : undefined,
  };
}

function normalizeEvidence(
  input: readonly DiscoverySnapshotAdapterEvidenceInput[],
): readonly SnapshotEvidence[] {
  return input
    .map((evidence) => ({
      evidenceId: requireNonEmpty(evidence.evidenceId, "evidence.evidenceId"),
      kind: evidence.kind,
      relationship: evidence.relationship,
      sourceReference: normalizeSourceReference(evidence.sourceReference),
      claim: requireNonEmpty(evidence.claim, "evidence.claim"),
      supports: normalizeSupports(evidence.supports),
      confidence: normalizeScore(evidence.confidence),
      provenanceIds: normalizeStringList(evidence.provenanceIds),
    }))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function normalizeProblemIntelligence(
  input: SnapshotProblemIntelligence,
): SnapshotProblemIntelligence {
  return {
    title: requireNonEmpty(input.title, "problemIntelligence.title"),
    summary: requireNonEmpty(input.summary, "problemIntelligence.summary"),
    painDescription: normalizeOptionalString(input.painDescription),
    affectedMarket: normalizeOptionalString(input.affectedMarket),
    affectedAudience: normalizeOptionalString(input.affectedAudience),
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
    founderScore: normalizeScore(input.founderScore),
    founderFit: normalizeOptionalString(input.founderFit),
    technicalComplexity: normalizeScore(input.technicalComplexity),
    domainMatch: normalizeScore(input.domainMatch),
    distributionMatch: normalizeScore(input.distributionMatch),
    executionDifficulty: normalizeScore(input.executionDifficulty),
    founderAdvantages: normalizeStringList(input.founderAdvantages),
    founderRisks: normalizeStringList(input.founderRisks),
    evidenceIds: normalizeStringList(input.evidenceIds),
  };
}

function normalizeConfidence(
  input: SnapshotConfidence,
): SnapshotConfidence {
  return {
    overall: normalizeScore(input.overall) ?? input.overall,
    evidence: normalizeScore(input.evidence),
    opportunity: normalizeScore(input.opportunity),
    founder: normalizeScore(input.founder),
    market: normalizeScore(input.market),
    calibration: input.calibration
      ? {
          method: input.calibration.method,
          methodVersion: input.calibration.methodVersion,
          scoreScale: input.calibration.scoreScale
            ? {
                min: input.calibration.scoreScale.min,
                max: input.calibration.scoreScale.max,
                interpretation: input.calibration.scoreScale.interpretation,
              }
            : undefined,
          notes: input.calibration.notes
            ? normalizeStringList(input.calibration.notes)
            : undefined,
        }
      : undefined,
  };
}

function normalizeVersions(
  input: Partial<SnapshotVersions> | undefined,
): Partial<SnapshotVersions> | undefined {
  if (!input) return undefined;

  return {
    snapshotContract: input.snapshotContract,
    engine: input.engine,
    intelligence: input.intelligence,
    confidence: input.confidence,
    normalization: input.normalization,
  };
}

function normalizeDiagnostics(
  input: SnapshotDiagnostics | undefined,
): SnapshotDiagnostics | undefined {
  if (!input) return undefined;

  return {
    items: input.items
      .map((item) => ({
        diagnosticId: requireNonEmpty(item.diagnosticId, "diagnostics.items.diagnosticId"),
        category: item.category,
        severity: item.severity,
        code: requireNonEmpty(item.code, "diagnostics.items.code"),
        message: requireNonEmpty(item.message, "diagnostics.items.message"),
        relatedEvidenceIds: normalizeStringList(item.relatedEvidenceIds),
      }))
      .sort((left, right) =>
        left.diagnosticId.localeCompare(right.diagnosticId),
      ),
    processing: input.processing
      .map((step) => ({
        step: requireNonEmpty(step.step, "diagnostics.processing.step"),
        status: step.status,
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
      sourceType: sourceReference.sourceType,
      sourceName: sourceReference.sourceName,
      sourceUrl: sourceReference.sourceUrl,
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
      runId: input.provenance?.runId
        ? requireNonEmpty(input.provenance.runId, "provenance.runId")
        : undefined,
    },
    engineAttribution: (input.provenance?.engineAttribution ?? [])
      .map((attribution) => ({
        engineName: requireNonEmpty(
          attribution.engineName,
          "provenance.engineAttribution.engineName",
        ),
        engineVersion: requireNonEmpty(
          attribution.engineVersion,
          "provenance.engineAttribution.engineVersion",
        ),
        section: attribution.section,
      }))
      .sort((left, right) => {
        const leftKey = `${left.section}:${left.engineName}:${left.engineVersion}`;
        const rightKey = `${right.section}:${right.engineName}:${right.engineVersion}`;
        return leftKey.localeCompare(rightKey);
      }),
    sourceReferences,
    evidenceLineage,
    processingHistory: (input.provenance?.processingHistory ?? [])
      .map((history) => ({
        step: requireNonEmpty(history.step, "provenance.processingHistory.step"),
        completedAt: history.completedAt
          ? requireNonEmpty(
              history.completedAt,
              "provenance.processingHistory.completedAt",
            )
          : undefined,
        version: history.version
          ? requireNonEmpty(
              history.version,
              "provenance.processingHistory.version",
            )
          : undefined,
      }))
      .sort((left, right) => {
        const leftKey = `${left.step}:${left.completedAt ?? ""}:${left.version ?? ""}`;
        const rightKey = `${right.step}:${right.completedAt ?? ""}:${right.version ?? ""}`;
        return leftKey.localeCompare(rightKey);
      }),
  };
}

function normalizeExecutionConfiguration(
  configuration: SnapshotExecutionConfiguration | undefined,
): SnapshotExecutionConfiguration | undefined {
  if (!configuration) return undefined;

  return {
    requestedMaxResults: configuration.requestedMaxResults,
    selectedSourceProviders: configuration.selectedSourceProviders
      ? normalizeStringList(configuration.selectedSourceProviders)
      : undefined,
    discoveryMode: configuration.discoveryMode,
    locale: normalizeOptionalString(configuration.locale),
    language: normalizeOptionalString(configuration.language),
    marketHint: normalizeOptionalString(configuration.marketHint),
    audienceHint: normalizeOptionalString(configuration.audienceHint),
    includeFounderContext: configuration.includeFounderContext,
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
      lifecycleState: input.metadata.lifecycleState,
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
        requestedAt: input.discoveryContext.requestedAt
          ? requireNonEmpty(
              input.discoveryContext.requestedAt,
              "discoveryContext.requestedAt",
            )
          : undefined,
        completedAt: input.discoveryContext.completedAt
          ? requireNonEmpty(
              input.discoveryContext.completedAt,
              "discoveryContext.completedAt",
            )
          : undefined,
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
    founderIntelligence: normalizeFounderIntelligence(input.founderIntelligence),
    evidence,
    confidence: normalizeConfidence(input.confidence),
    diagnostics: normalizeDiagnostics(input.diagnostics),
    versions: normalizeVersions(input.versions),
    provenance: buildProvenance(input, evidence),
  };
}
