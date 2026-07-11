import type { Snapshot, SnapshotEvidence, SnapshotProvenance } from "./types";
import type { SnapshotPersistenceInput, SnapshotPersistenceValidationMetadata } from "./persistence";

export type SnapshotStorageRecordKind =
  | "snapshot_identity"
  | "snapshot_section"
  | "snapshot_evidence"
  | "snapshot_evidence_support"
  | "snapshot_provenance_source"
  | "snapshot_evidence_lineage"
  | "snapshot_engine_attribution"
  | "snapshot_processing_history"
  | "snapshot_validation";

export type SnapshotStorageRecordBase = Readonly<{
  kind: SnapshotStorageRecordKind;
  storageKey: string;
  snapshotId: string;
  discoveryId: string;
  contractVersion: string;
  createdAt: string;
}>;

export type SnapshotIdentityStorageRecord = SnapshotStorageRecordBase & Readonly<{
  kind: "snapshot_identity";
  snapshotVersion: string;
  lifecycleState: Snapshot["metadata"]["lifecycleState"];
  idempotencyKey: string;
  versions: Snapshot["versions"];
}>;

export type SnapshotSectionStorageRecord = SnapshotStorageRecordBase & Readonly<{
  kind: "snapshot_section";
  section:
    | "discovery_context"
    | "problem_intelligence"
    | "opportunity_intelligence"
    | "founder_intelligence"
    | "confidence"
    | "diagnostics";
  payload:
    | Snapshot["discoveryContext"]
    | Snapshot["problemIntelligence"]
    | Snapshot["opportunityIntelligence"]
    | NonNullable<Snapshot["founderIntelligence"]>
    | Snapshot["confidence"]
    | Snapshot["diagnostics"];
}>;

export type SnapshotEvidenceStorageRecord = SnapshotStorageRecordBase & Readonly<{
  kind: "snapshot_evidence";
  evidenceId: string;
  evidenceKind: SnapshotEvidence["kind"];
  relationship: SnapshotEvidence["relationship"];
  claim: string;
  sourceReference?: SnapshotEvidence["sourceReference"];
  confidence?: SnapshotEvidence["confidence"];
  provenanceIds: readonly string[];
}>;

export type SnapshotEvidenceSupportStorageRecord = SnapshotStorageRecordBase & Readonly<{
  kind: "snapshot_evidence_support";
  evidenceId: string;
  supportKey: string;
  support: SnapshotEvidence["supports"][number];
}>;

export type SnapshotProvenanceSourceStorageRecord = SnapshotStorageRecordBase & Readonly<{
  kind: "snapshot_provenance_source";
  source: SnapshotProvenance["sourceReferences"][number];
}>;

export type SnapshotEvidenceLineageStorageRecord = SnapshotStorageRecordBase & Readonly<{
  kind: "snapshot_evidence_lineage";
  lineage: SnapshotProvenance["evidenceLineage"][number];
}>;

export type SnapshotEngineAttributionStorageRecord = SnapshotStorageRecordBase & Readonly<{
  kind: "snapshot_engine_attribution";
  attribution: SnapshotProvenance["engineAttribution"][number];
}>;

export type SnapshotProcessingHistoryStorageRecord = SnapshotStorageRecordBase & Readonly<{
  kind: "snapshot_processing_history";
  historyKey: string;
  history: SnapshotProvenance["processingHistory"][number];
}>;

export type SnapshotValidationStorageRecord = SnapshotStorageRecordBase & Readonly<{
  kind: "snapshot_validation";
  validation: SnapshotPersistenceValidationMetadata;
}>;

export type SnapshotStorageRecord =
  | SnapshotIdentityStorageRecord
  | SnapshotSectionStorageRecord
  | SnapshotEvidenceStorageRecord
  | SnapshotEvidenceSupportStorageRecord
  | SnapshotProvenanceSourceStorageRecord
  | SnapshotEvidenceLineageStorageRecord
  | SnapshotEngineAttributionStorageRecord
  | SnapshotProcessingHistoryStorageRecord
  | SnapshotValidationStorageRecord;

export type SnapshotStorageMapping = Readonly<{
  snapshotId: string;
  discoveryId: string;
  contractVersion: string;
  idempotencyKey: string;
  records: readonly SnapshotStorageRecord[];
}>;

type MappableSection = SnapshotSectionStorageRecord["section"];

const SECTION_ORDER: readonly MappableSection[] = Object.freeze([
  "discovery_context",
  "problem_intelligence",
  "opportunity_intelligence",
  "founder_intelligence",
  "confidence",
  "diagnostics",
]);

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => lexicalCompare(left, right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function semanticKey(parts: readonly unknown[]): string {
  return parts.map((part) => canonicalize(part)).join(":");
}

function baseRecord(input: SnapshotPersistenceInput, kind: SnapshotStorageRecordKind, suffix: string): SnapshotStorageRecordBase {
  const { metadata } = input.snapshot;
  return Object.freeze({
    kind,
    storageKey: `${metadata.discoveryId}:${metadata.snapshotId}:${metadata.contractVersion}:${suffix}`,
    snapshotId: metadata.snapshotId,
    discoveryId: metadata.discoveryId,
    contractVersion: metadata.contractVersion,
    createdAt: metadata.createdAt,
  });
}

function sectionPayload(snapshot: Snapshot, section: MappableSection): SnapshotSectionStorageRecord["payload"] | undefined {
  if (section === "discovery_context") return snapshot.discoveryContext;
  if (section === "problem_intelligence") return snapshot.problemIntelligence;
  if (section === "opportunity_intelligence") return snapshot.opportunityIntelligence;
  if (section === "founder_intelligence") return snapshot.founderIntelligence;
  if (section === "confidence") return snapshot.confidence;
  return snapshot.diagnostics;
}

export function mapSnapshotPersistenceInputToStorageRecords(input: SnapshotPersistenceInput): SnapshotStorageMapping {
  const { snapshot } = input;
  const records: SnapshotStorageRecord[] = [];

  records.push(Object.freeze({
    ...baseRecord(input, "snapshot_identity", "identity"),
    kind: "snapshot_identity" as const,
    snapshotVersion: snapshot.metadata.snapshotVersion,
    lifecycleState: snapshot.metadata.lifecycleState,
    idempotencyKey: input.idempotencyKey,
    versions: snapshot.versions,
  }));

  for (const section of SECTION_ORDER) {
    const payload = sectionPayload(snapshot, section);
    if (!payload) continue;
    records.push(Object.freeze({
      ...baseRecord(input, "snapshot_section", `section:${section}`),
      kind: "snapshot_section" as const,
      section,
      payload,
    }));
  }

  for (const evidence of snapshot.evidence) {
    records.push(Object.freeze({
      ...baseRecord(input, "snapshot_evidence", `evidence:${evidence.evidenceId}`),
      kind: "snapshot_evidence" as const,
      evidenceId: evidence.evidenceId,
      evidenceKind: evidence.kind,
      relationship: evidence.relationship,
      claim: evidence.claim,
      sourceReference: evidence.sourceReference,
      confidence: evidence.confidence,
      provenanceIds: evidence.provenanceIds,
    }));

    for (const support of [...evidence.supports].sort((left, right) => lexicalCompare(canonicalize(left), canonicalize(right)))) {
      const supportKey = semanticKey([support.section, support.field ?? null, support.targetId ?? null, support.rationale ?? null]);
      records.push(Object.freeze({
        ...baseRecord(input, "snapshot_evidence_support", `evidence:${evidence.evidenceId}:support:${supportKey}`),
        kind: "snapshot_evidence_support" as const,
        evidenceId: evidence.evidenceId,
        supportKey,
        support,
      }));
    }
  }

  for (const source of snapshot.provenance.sourceReferences) {
    records.push(Object.freeze({
      ...baseRecord(input, "snapshot_provenance_source", `provenance:source:${source.sourceId}`),
      kind: "snapshot_provenance_source" as const,
      source,
    }));
  }

  for (const lineage of snapshot.provenance.evidenceLineage) {
    records.push(Object.freeze({
      ...baseRecord(input, "snapshot_evidence_lineage", `provenance:lineage:${lineage.evidenceId}`),
      kind: "snapshot_evidence_lineage" as const,
      lineage,
    }));
  }

  for (const attribution of [...snapshot.provenance.engineAttribution].sort((left, right) => lexicalCompare(canonicalize(left), canonicalize(right)))) {
    const attributionKey = semanticKey([attribution.engineName, attribution.engineVersion, attribution.section]);
    records.push(Object.freeze({
      ...baseRecord(input, "snapshot_engine_attribution", `provenance:engine:${attributionKey}`),
      kind: "snapshot_engine_attribution" as const,
      attribution,
    }));
  }

  for (const history of [...snapshot.provenance.processingHistory].sort((left, right) => lexicalCompare(canonicalize(left), canonicalize(right)))) {
    const historyKey = semanticKey([history.step, history.completedAt ?? null, history.version ?? null]);
    records.push(Object.freeze({
      ...baseRecord(input, "snapshot_processing_history", `provenance:processing:${historyKey}`),
      kind: "snapshot_processing_history" as const,
      historyKey,
      history,
    }));
  }

  records.push(Object.freeze({
    ...baseRecord(input, "snapshot_validation", "validation"),
    kind: "snapshot_validation" as const,
    validation: input.validation,
  }));

  return Object.freeze({
    snapshotId: snapshot.metadata.snapshotId,
    discoveryId: snapshot.metadata.discoveryId,
    contractVersion: snapshot.metadata.contractVersion,
    idempotencyKey: input.idempotencyKey,
    records: Object.freeze(records),
  });
}
