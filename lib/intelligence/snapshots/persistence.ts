import type { Snapshot } from "./types";
import type { SnapshotPipelineResult } from "./pipeline.ts";
import { SNAPSHOT_VALIDATOR_VERSION, type SnapshotValidationIssue, type SnapshotValidationResult, type SnapshotValidationSummary } from "./validator.ts";

export type SnapshotPersistenceRejectionReason =
  | "invalid_snapshot"
  | "missing_snapshot"
  | "missing_validation"
  | "port_unavailable";

export type SnapshotPersistenceValidationMetadata = Readonly<{
  valid: true;
  validatorVersion: string;
  summary: SnapshotValidationSummary;
  errors: readonly SnapshotValidationIssue[];
  warnings: readonly SnapshotValidationIssue[];
}>;

export type SnapshotPersistenceInput = Readonly<{
  /** Canonical, immutable Snapshot that has already passed validation. */
  snapshot: Snapshot;
  /** Validation metadata proves that the Snapshot was accepted by the frozen Snapshot validator. */
  validation: SnapshotPersistenceValidationMetadata;
  /** Deterministic caller-provided idempotency boundary for future repositories. */
  idempotencyKey: string;
}>;

export type SnapshotPersistenceSuccessResult = Readonly<{
  status: "success";
  persisted: true;
  snapshotId: string;
  discoveryId: string;
  persistenceId: string;
  message: string;
  errors: readonly SnapshotValidationIssue[];
  warnings: readonly SnapshotValidationIssue[];
}>;

export type SnapshotPersistenceFailureResult = Readonly<{
  status: "failure";
  persisted: false;
  reason: SnapshotPersistenceRejectionReason;
  snapshotId?: string;
  discoveryId?: string;
  message: string;
  errors: readonly SnapshotValidationIssue[];
}>;

export type SnapshotPersistenceResult = SnapshotPersistenceSuccessResult | SnapshotPersistenceFailureResult;

export type SnapshotPersistenceInputResult =
  | Readonly<{ status: "accepted"; input: SnapshotPersistenceInput }>
  | SnapshotPersistenceFailureResult;

export interface SnapshotPersistencePort {
  /**
   * Persist a validated Snapshot at a future infrastructure boundary.
   * Implementations must not persist invalid Snapshots and must return a failure result instead.
   */
  persistSnapshot(input: SnapshotPersistenceInput): Promise<SnapshotPersistenceResult> | SnapshotPersistenceResult;
}

function persistenceIdFor(snapshot: Snapshot): string {
  return `${snapshot.metadata.discoveryId}:${snapshot.metadata.snapshotId}:${snapshot.metadata.contractVersion}`;
}

function validationMetadata(validation: SnapshotValidationResult): SnapshotPersistenceValidationMetadata {
  return Object.freeze({
    valid: true as const,
    validatorVersion: SNAPSHOT_VALIDATOR_VERSION,
    summary: validation.summary,
    errors: Object.freeze([...validation.errors]),
    warnings: Object.freeze([...validation.warnings]),
  });
}

export function createSnapshotPersistenceInputFromPipeline(
  result: SnapshotPipelineResult,
): SnapshotPersistenceInputResult {
  const snapshotId = result.snapshot?.metadata.snapshotId;
  const discoveryId = result.snapshot?.metadata.discoveryId;

  if (!result.snapshot) {
    return Object.freeze({
      status: "failure" as const,
      persisted: false as const,
      reason: "missing_snapshot" as const,
      message: "Snapshot persistence requires a Snapshot produced by the Snapshot pipeline.",
      errors: Object.freeze([...result.errors]),
    });
  }

  if (!result.validation) {
    return Object.freeze({
      status: "failure" as const,
      persisted: false as const,
      reason: "missing_validation" as const,
      snapshotId,
      discoveryId,
      message: "Snapshot persistence requires validation metadata from the Snapshot validator.",
      errors: Object.freeze([...result.errors]),
    });
  }

  if (!result.valid || !result.validation.valid) {
    return Object.freeze({
      status: "failure" as const,
      persisted: false as const,
      reason: "invalid_snapshot" as const,
      snapshotId,
      discoveryId,
      message: "Invalid Snapshots must not cross the Snapshot persistence boundary.",
      errors: Object.freeze([...result.validation.errors]),
    });
  }

  const input: SnapshotPersistenceInput = Object.freeze({
    snapshot: result.snapshot,
    validation: validationMetadata(result.validation),
    idempotencyKey: persistenceIdFor(result.snapshot),
  });

  return Object.freeze({ status: "accepted" as const, input });
}

/**
 * Test-only boundary double. It records nothing outside memory and performs no database writes.
 * Production code should provide a separate infrastructure implementation in a later PR.
 */
export class InMemorySnapshotPersistencePort implements SnapshotPersistencePort {
  readonly persistedSnapshots: SnapshotPersistenceInput[] = [];

  persistSnapshot(input: SnapshotPersistenceInput): SnapshotPersistenceResult {
    if (input.validation.valid !== true) {
      return Object.freeze({
        status: "failure" as const,
        persisted: false as const,
        reason: "invalid_snapshot" as const,
        snapshotId: input.snapshot.metadata.snapshotId,
        discoveryId: input.snapshot.metadata.discoveryId,
        message: "Invalid Snapshots must not be persisted.",
        errors: Object.freeze([]),
      });
    }

    this.persistedSnapshots.push(input);

    return Object.freeze({
      status: "success" as const,
      persisted: true as const,
      snapshotId: input.snapshot.metadata.snapshotId,
      discoveryId: input.snapshot.metadata.discoveryId,
      persistenceId: input.idempotencyKey,
      message: "Validated Snapshot accepted by in-memory persistence boundary double.",
      errors: Object.freeze([...input.validation.errors]),
      warnings: Object.freeze([...input.validation.warnings]),
    });
  }
}
