import { hashSnapshotStorageMapping, hashSnapshotStorageRecord, type SnapshotStorageHash } from "./storage-hash.ts";
import { validateSnapshotRepositoryWriteInput } from "./repository.ts";
import type { SnapshotStorageMapping, SnapshotStorageRecord } from "./storage-mapper.ts";

export type SnapshotSupabaseRpcRecord = SnapshotStorageRecord & Readonly<{
  contentHash: SnapshotStorageHash;
}>;

export type SnapshotSupabaseWriteMappingPayload = Readonly<{
  snapshotId: string;
  discoveryId: string;
  contractVersion: string;
  idempotencyKey: string;
  mappingHash: SnapshotStorageHash;
  records: readonly SnapshotSupabaseRpcRecord[];
}>;

/**
 * Builds the pure JSON payload accepted by public.write_snapshot_mapping(jsonb).
 * It validates the repository mapping, assigns each child its own contentHash, and assigns the
 * root mappingHash from the complete canonical mapping. It never generates IDs/timestamps or
 * touches Supabase/network/database clients.
 */
export function buildSupabaseSnapshotPersistencePayload(mapping: SnapshotStorageMapping): SnapshotSupabaseWriteMappingPayload {
  const issues = validateSnapshotRepositoryWriteInput({ mapping });
  if (issues.length > 0) {
    throw new Error(`Invalid SnapshotStorageMapping for Supabase RPC payload: ${issues.map((issue) => issue.message).join("; ")}`);
  }

  const mappingHash = hashSnapshotStorageMapping(mapping);
  const records = mapping.records.map((record) => Object.freeze({
    ...record,
    contentHash: hashSnapshotStorageRecord(record),
  })) as SnapshotSupabaseRpcRecord[];

  return Object.freeze({
    snapshotId: mapping.snapshotId,
    discoveryId: mapping.discoveryId,
    contractVersion: mapping.contractVersion,
    idempotencyKey: mapping.idempotencyKey,
    mappingHash,
    records: Object.freeze(records),
  });
}


export type SnapshotSupabaseRpcStatus = "inserted" | "replayed_identical" | "rejected_conflict" | "failed";

export type SnapshotSupabaseWriteMappingResponse = Readonly<{
  status: SnapshotSupabaseRpcStatus;
  written: boolean;
  snapshot_id?: string;
  discovery_id?: string;
  idempotency_key?: string;
  message?: string;
}>;

export type SnapshotSupabaseMappedWriteResponse = Readonly<{
  status: "success" | "failure";
  outcome?: "inserted" | "replayed_identical";
  reason?: "rejected_conflict" | "failed";
  written: boolean;
  snapshotId?: string;
  discoveryId?: string;
  idempotencyKey?: string;
  message: string;
}>;

export function mapSupabaseSnapshotWriteResponse(response: SnapshotSupabaseWriteMappingResponse): SnapshotSupabaseMappedWriteResponse {
  if (response.status === "inserted") {
    if (response.written !== true) {
      throw new Error("Invalid Supabase Snapshot RPC response: inserted responses must have written=true.");
    }
    return Object.freeze({
      status: "success" as const,
      outcome: "inserted" as const,
      written: true,
      snapshotId: response.snapshot_id,
      discoveryId: response.discovery_id,
      idempotencyKey: response.idempotency_key,
      message: response.message ?? "Snapshot mapping write accepted by Supabase RPC.",
    });
  }

  if (response.status === "replayed_identical") {
    if (response.written !== false) {
      throw new Error("Invalid Supabase Snapshot RPC response: replayed_identical responses must have written=false.");
    }
    return Object.freeze({
      status: "success" as const,
      outcome: "replayed_identical" as const,
      written: false,
      snapshotId: response.snapshot_id,
      discoveryId: response.discovery_id,
      idempotencyKey: response.idempotency_key,
      message: response.message ?? "Snapshot mapping write accepted by Supabase RPC.",
    });
  }

  if (response.status !== "rejected_conflict" && response.status !== "failed") {
    throw new Error(`Invalid Supabase Snapshot RPC response status: ${String((response as { status?: unknown }).status)}`);
  }

  if (response.written !== false) {
    throw new Error(`Invalid Supabase Snapshot RPC response: ${response.status} responses must have written=false.`);
  }

  return Object.freeze({
    status: "failure" as const,
    reason: response.status,
    written: false,
    snapshotId: response.snapshot_id,
    discoveryId: response.discovery_id,
    idempotencyKey: response.idempotency_key,
    message: response.message ?? "Snapshot mapping write rejected or failed by Supabase RPC.",
  });
}
