import type { SnapshotStorageMapping } from "./storage-mapper";

export type SnapshotRepositoryFailureReason =
  | "missing_storage_mapping"
  | "invalid_storage_mapping"
  | "record_identity_mismatch"
  | "record_idempotency_mismatch"
  | "record_set_empty"
  | "not_found"
  | "rejected_conflict"
  | "port_unavailable";

export type SnapshotRepositoryIssue = Readonly<{
  reason: SnapshotRepositoryFailureReason;
  message: string;
  storageKey?: string;
}>;

export type SnapshotRepositoryWriteInput = Readonly<{
  /**
   * Conceptual storage mapping produced from a validated Snapshot persistence input.
   * Raw Discovery output and raw Snapshot pipeline input must not cross this boundary.
   */
  mapping: SnapshotStorageMapping;
}>;

export type SnapshotRepositoryReadInput = Readonly<{
  snapshotId: string;
  discoveryId: string;
  contractVersion: string;
  /** Deterministic identity produced by the Snapshot persistence/storage mapping boundary. */
  idempotencyKey: string;
}>;

export type SnapshotRepositoryWriteOutcome = "inserted" | "replayed_identical";

export type SnapshotRepositoryWriteSuccessResult = Readonly<{
  status: "success";
  outcome: SnapshotRepositoryWriteOutcome;
  written: boolean;
  snapshotId: string;
  discoveryId: string;
  contractVersion: string;
  idempotencyKey: string;
  repositoryKey: string;
  recordCount: number;
  message: string;
}>;

export type SnapshotRepositoryReadSuccessResult = Readonly<{
  status: "success";
  found: true;
  snapshotId: string;
  discoveryId: string;
  contractVersion: string;
  idempotencyKey: string;
  repositoryKey: string;
  mapping: SnapshotStorageMapping;
  message: string;
}>;

export type SnapshotRepositoryFailureResult = Readonly<{
  status: "failure";
  reason: SnapshotRepositoryFailureReason;
  snapshotId?: string;
  discoveryId?: string;
  contractVersion?: string;
  idempotencyKey?: string;
  message: string;
  issues: readonly SnapshotRepositoryIssue[];
}>;

export type SnapshotRepositoryWriteResult = SnapshotRepositoryWriteSuccessResult | SnapshotRepositoryFailureResult;
export type SnapshotRepositoryReadResult = SnapshotRepositoryReadSuccessResult | SnapshotRepositoryFailureResult;

export interface SnapshotRepositoryPort {
  /**
   * Write conceptual Snapshot storage records behind a provider-neutral repository boundary.
   * Future Supabase or other infrastructure implementations must conform to this interface.
   */
  writeSnapshotMapping(input: SnapshotRepositoryWriteInput): Promise<SnapshotRepositoryWriteResult> | SnapshotRepositoryWriteResult;

  /** Read conceptual Snapshot storage records by deterministic Snapshot storage identity. */
  readSnapshotMapping(input: SnapshotRepositoryReadInput): Promise<SnapshotRepositoryReadResult> | SnapshotRepositoryReadResult;
}

function repositoryKeyFor(input: SnapshotRepositoryReadInput): string {
  return `${input.discoveryId}:${input.snapshotId}:${input.contractVersion}:${input.idempotencyKey}`;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function failureFromMapping(
  mapping: SnapshotStorageMapping | undefined,
  reason: SnapshotRepositoryFailureReason,
  message: string,
  issues: readonly SnapshotRepositoryIssue[],
): SnapshotRepositoryFailureResult {
  return Object.freeze({
    status: "failure" as const,
    reason,
    snapshotId: mapping?.snapshotId,
    discoveryId: mapping?.discoveryId,
    contractVersion: mapping?.contractVersion,
    idempotencyKey: mapping?.idempotencyKey,
    message,
    issues: Object.freeze([...issues]),
  });
}

export function validateSnapshotRepositoryWriteInput(
  input: SnapshotRepositoryWriteInput,
): readonly SnapshotRepositoryIssue[] {
  const mapping = input.mapping;
  const issues: SnapshotRepositoryIssue[] = [];

  if (!mapping) {
    return Object.freeze([
      Object.freeze({
        reason: "missing_storage_mapping" as const,
        message: "Snapshot repository writes require a SnapshotStorageMapping.",
      }),
    ]);
  }

  if (!mapping.snapshotId || !mapping.discoveryId || !mapping.contractVersion || !mapping.idempotencyKey) {
    issues.push(Object.freeze({
      reason: "invalid_storage_mapping" as const,
      message: "SnapshotStorageMapping identity fields are required before repository writes.",
    }));
  }

  if (!Array.isArray(mapping.records) || mapping.records.length === 0) {
    issues.push(Object.freeze({
      reason: "record_set_empty" as const,
      message: "Snapshot repository writes require at least one mapped storage record.",
    }));
  }

  const seenStorageKeys = new Set<string>();
  const requiredSectionNames = ["discovery_context", "problem_intelligence", "opportunity_intelligence", "confidence", "diagnostics"] as const;
  const sectionCounts = new Map<string, number>(requiredSectionNames.map((section) => [section, 0]));
  let founderSectionCount = 0;

  for (const record of mapping.records ?? []) {
    if (
      record.snapshotId !== mapping.snapshotId
      || record.discoveryId !== mapping.discoveryId
      || record.contractVersion !== mapping.contractVersion
    ) {
      issues.push(Object.freeze({
        reason: "record_identity_mismatch" as const,
        storageKey: record.storageKey,
        message: "Storage record identity must match the SnapshotStorageMapping identity.",
      }));
    }

    if (seenStorageKeys.has(record.storageKey)) {
      issues.push(Object.freeze({
        reason: "invalid_storage_mapping" as const,
        storageKey: record.storageKey,
        message: "Storage record identities must be unique within a Snapshot mapping.",
      }));
    }
    seenStorageKeys.add(record.storageKey);

    if (record.kind === "snapshot_section") {
      if (record.section === "founder_intelligence") founderSectionCount += 1;
      if (sectionCounts.has(record.section)) sectionCounts.set(record.section, (sectionCounts.get(record.section) ?? 0) + 1);
    }

    if (record.kind === "snapshot_identity" && record.idempotencyKey !== mapping.idempotencyKey) {
      issues.push(Object.freeze({
        reason: "record_idempotency_mismatch" as const,
        storageKey: record.storageKey,
        message: "Snapshot identity record idempotency key must match the SnapshotStorageMapping identity.",
      }));
    }
  }

  for (const section of requiredSectionNames) {
    if (sectionCounts.get(section) !== 1) {
      issues.push(Object.freeze({
        reason: "invalid_storage_mapping" as const,
        message: `Snapshot storage mapping requires exactly one ${section} section record.`,
      }));
    }
  }

  if (founderSectionCount > 1) {
    issues.push(Object.freeze({
      reason: "invalid_storage_mapping" as const,
      message: "Snapshot storage mapping allows zero or one founder_intelligence section record.",
    }));
  }

  return Object.freeze(issues);
}

/**
 * Test-only repository double. It stores mappings in process memory, performs no database writes,
 * and must not be used as a production Snapshot repository implementation.
 */
export class InMemorySnapshotRepositoryPort implements SnapshotRepositoryPort {
  private readonly mappings = new Map<string, SnapshotStorageMapping>();

  writeSnapshotMapping(input: SnapshotRepositoryWriteInput): SnapshotRepositoryWriteResult {
    const issues = validateSnapshotRepositoryWriteInput(input);
    if (issues.length > 0) {
      return failureFromMapping(input.mapping, issues[0].reason, "Snapshot storage mapping rejected by repository boundary.", issues);
    }

    const { mapping } = input;
    const repositoryKey = repositoryKeyFor(mapping);
    const existing = this.mappings.get(repositoryKey);
    if (existing) {
      if (canonicalize(existing) === canonicalize(mapping)) {
        return Object.freeze({
          status: "success" as const,
          outcome: "replayed_identical" as const,
          written: false,
          snapshotId: mapping.snapshotId,
          discoveryId: mapping.discoveryId,
          contractVersion: mapping.contractVersion,
          idempotencyKey: mapping.idempotencyKey,
          repositoryKey,
          recordCount: mapping.records.length,
          message: "Snapshot storage mapping replay matched existing immutable content.",
        });
      }

      return failureFromMapping(mapping, "rejected_conflict", "Snapshot storage mapping conflicts with existing immutable content and was not written.", [
        Object.freeze({ reason: "rejected_conflict" as const, message: "Same repository identity has different canonical content." }),
      ]);
    }

    this.mappings.set(repositoryKey, mapping);

    return Object.freeze({
      status: "success" as const,
      outcome: "inserted" as const,
      written: true,
      snapshotId: mapping.snapshotId,
      discoveryId: mapping.discoveryId,
      contractVersion: mapping.contractVersion,
      idempotencyKey: mapping.idempotencyKey,
      repositoryKey,
      recordCount: mapping.records.length,
      message: "Snapshot storage mapping accepted by in-memory repository boundary double.",
    });
  }

  readSnapshotMapping(input: SnapshotRepositoryReadInput): SnapshotRepositoryReadResult {
    const repositoryKey = repositoryKeyFor(input);
    const mapping = this.mappings.get(repositoryKey);

    if (!mapping) {
      return Object.freeze({
        status: "failure" as const,
        reason: "not_found" as const,
        snapshotId: input.snapshotId,
        discoveryId: input.discoveryId,
        contractVersion: input.contractVersion,
        idempotencyKey: input.idempotencyKey,
        message: "No Snapshot storage mapping exists for the requested repository identity.",
        issues: Object.freeze([
          Object.freeze({ reason: "not_found" as const, message: "Snapshot storage mapping was not found." }),
        ]),
      });
    }

    return Object.freeze({
      status: "success" as const,
      found: true as const,
      snapshotId: mapping.snapshotId,
      discoveryId: mapping.discoveryId,
      contractVersion: mapping.contractVersion,
      idempotencyKey: mapping.idempotencyKey,
      repositoryKey,
      mapping,
      message: "Snapshot storage mapping read from in-memory repository boundary double.",
    });
  }
}
