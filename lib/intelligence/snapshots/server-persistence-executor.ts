import "server-only";

import {
  createSupabaseAdminClient,
  SupabaseAdminConfigurationError,
  type SupabaseAdminClient,
} from "../../supabase/server-admin.ts";
import { hashSnapshotStorageMapping, type SnapshotStorageHash } from "./storage-hash.ts";
import { mapSnapshotPersistenceInputToStorageRecords, type SnapshotStorageMapping } from "./storage-mapper.ts";
import type { SnapshotPersistenceInput } from "./persistence.ts";
import {
  buildSupabaseSnapshotPersistencePayload,
  mapSupabaseSnapshotWriteResponse,
  type SnapshotSupabaseWriteMappingResponse,
} from "./supabase-persistence-adapter.ts";

export type SnapshotProductionPersistenceFailureReason =
  | "rejected_conflict"
  | "failed"
  | "supabase_client_error"
  | "malformed_rpc_response"
  | "missing_service_role_key"
  | "feature_disabled";

export type SnapshotProductionPersistenceOutcome =
  | Readonly<{
      status: "success";
      outcome: "inserted" | "replayed_identical";
      written: boolean;
      snapshotId: string;
      discoveryId: string;
      contractVersion: string;
      idempotencyKey: string;
      mappingHash: SnapshotStorageHash;
      message: string;
    }>
  | Readonly<{
      status: "failure";
      reason: SnapshotProductionPersistenceFailureReason;
      written: false;
      snapshotId?: string;
      discoveryId?: string;
      contractVersion?: string;
      idempotencyKey?: string;
      mappingHash?: SnapshotStorageHash;
      message: string;
    }>;

type RpcClient = Pick<SupabaseAdminClient, "rpc">;

type SnapshotPersistenceExecutorOptions = Readonly<{
  getAdminClient?: () => RpcClient;
  isEnabled?: () => boolean;
}>;

export function isSnapshotPersistenceEnabled(): boolean {
  return process.env.SNAPSHOT_PERSISTENCE_ENABLED === "1";
}

function isStorageMapping(input: SnapshotPersistenceInput | SnapshotStorageMapping): input is SnapshotStorageMapping {
  return "records" in input && Array.isArray(input.records);
}

function normalizeMapping(input: SnapshotPersistenceInput | SnapshotStorageMapping): SnapshotStorageMapping {
  return isStorageMapping(input) ? input : mapSnapshotPersistenceInputToStorageRecords(input);
}

function baseFailure(
  mapping: SnapshotStorageMapping | undefined,
  reason: SnapshotProductionPersistenceFailureReason,
  message: string,
): SnapshotProductionPersistenceOutcome {
  return Object.freeze({
    status: "failure" as const,
    reason,
    written: false as const,
    snapshotId: mapping?.snapshotId,
    discoveryId: mapping?.discoveryId,
    contractVersion: mapping?.contractVersion,
    idempotencyKey: mapping?.idempotencyKey,
    mappingHash: mapping ? hashSnapshotStorageMapping(mapping) : undefined,
    message,
  });
}

export async function persistSnapshotToSupabase(
  input: SnapshotPersistenceInput | SnapshotStorageMapping,
  options: SnapshotPersistenceExecutorOptions = {},
): Promise<SnapshotProductionPersistenceOutcome> {
  const enabled = options.isEnabled ?? isSnapshotPersistenceEnabled;

  if (!enabled()) {
    return baseFailure(undefined, "feature_disabled", "Snapshot persistence is disabled.");
  }

  let mapping: SnapshotStorageMapping;
  try {
    mapping = normalizeMapping(input);
  } catch (error) {
    return Object.freeze({
      status: "failure" as const,
      reason: "malformed_rpc_response" as const,
      written: false as const,
      message: error instanceof Error ? error.message : "Snapshot persistence input could not be mapped.",
    });
  }

  const mappingHash = hashSnapshotStorageMapping(mapping);
  const payload = buildSupabaseSnapshotPersistencePayload(mapping);
  let client: RpcClient;

  try {
    client = (options.getAdminClient ?? createSupabaseAdminClient)();
  } catch (error) {
    if (error instanceof SupabaseAdminConfigurationError) {
      return baseFailure(mapping, "missing_service_role_key", "Snapshot persistence server configuration is missing.");
    }

    return baseFailure(mapping, "supabase_client_error", "Snapshot persistence Supabase client could not be created.");
  }

  try {
    const { data, error } = await client.rpc("write_snapshot_mapping", {
      mapped_snapshot: payload,
    });

    if (error) {
      return baseFailure(mapping, "supabase_client_error", "Snapshot persistence RPC returned a client error.");
    }

    let mapped;
    try {
      mapped = mapSupabaseSnapshotWriteResponse(data as SnapshotSupabaseWriteMappingResponse);
    } catch {
      return baseFailure(mapping, "malformed_rpc_response", "Snapshot persistence RPC returned a malformed response.");
    }

    if (mapped.status === "success") {
      return Object.freeze({
        status: "success" as const,
        outcome: mapped.outcome ?? "inserted",
        written: mapped.written,
        snapshotId: mapped.snapshotId ?? mapping.snapshotId,
        discoveryId: mapped.discoveryId ?? mapping.discoveryId,
        contractVersion: mapping.contractVersion,
        idempotencyKey: mapped.idempotencyKey ?? mapping.idempotencyKey,
        mappingHash,
        message: mapped.message,
      });
    }

    return baseFailure(mapping, mapped.reason === "rejected_conflict" ? "rejected_conflict" : "failed", mapped.message);
  } catch {
    return baseFailure(mapping, "supabase_client_error", "Snapshot persistence RPC call failed.");
  }
}
