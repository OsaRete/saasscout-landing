import { createHash } from "node:crypto";
import type { SnapshotStorageMapping, SnapshotStorageRecord, SnapshotStorageRecordKind } from "./storage-mapper.ts";

export type SnapshotStorageHash = `sha256:${string}`;

const HASH_PREFIX = "sha256:";
const SHA256_HEX_LENGTH = 64;

export const SNAPSHOT_STORAGE_HASH_ALGORITHM = Object.freeze({
  algorithm: "SHA-256",
  format: "sha256:<64 lowercase hex>",
});

export const SNAPSHOT_STORAGE_RECORD_KINDS: readonly SnapshotStorageRecordKind[] = Object.freeze([
  "snapshot_identity",
  "snapshot_section",
  "snapshot_evidence",
  "snapshot_evidence_support",
  "snapshot_provenance_source",
  "snapshot_evidence_lineage",
  "snapshot_engine_attribution",
  "snapshot_processing_history",
  "snapshot_validation",
]);

const ALLOWED_MAPPING_KEYS = new Set(["snapshotId", "discoveryId", "contractVersion", "idempotencyKey", "records"]);
const BASE_RECORD_KEYS = ["kind", "storageKey", "snapshotId", "discoveryId", "contractVersion", "createdAt"] as const;
const EXCLUDED_KEYS = new Set(["id", "uuid", "snapshotIdentityId", "snapshotEvidenceId", "persisted_at", "persistedAt"]);

const KIND_KEYS: Readonly<Record<SnapshotStorageRecordKind, readonly string[]>> = Object.freeze({
  snapshot_identity: Object.freeze([...BASE_RECORD_KEYS, "snapshotVersion", "lifecycleState", "idempotencyKey", "versions"]),
  snapshot_section: Object.freeze([...BASE_RECORD_KEYS, "section", "payload"]),
  snapshot_evidence: Object.freeze([...BASE_RECORD_KEYS, "evidenceId", "evidenceKind", "relationship", "claim", "sourceReference", "confidence", "provenanceIds"]),
  snapshot_evidence_support: Object.freeze([...BASE_RECORD_KEYS, "evidenceId", "supportKey", "support"]),
  snapshot_provenance_source: Object.freeze([...BASE_RECORD_KEYS, "source"]),
  snapshot_evidence_lineage: Object.freeze([...BASE_RECORD_KEYS, "lineage"]),
  snapshot_engine_attribution: Object.freeze([...BASE_RECORD_KEYS, "attribution"]),
  snapshot_processing_history: Object.freeze([...BASE_RECORD_KEYS, "historyKey", "history"]),
  snapshot_validation: Object.freeze([...BASE_RECORD_KEYS, "validation"]),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): SnapshotStorageHash {
  const digest = createHash("sha256").update(value, "utf8").digest("hex");
  return `${HASH_PREFIX}${digest}` as SnapshotStorageHash;
}

function assertHashFormat(hash: SnapshotStorageHash): void {
  const hex = hash.slice(HASH_PREFIX.length);
  if (!hash.startsWith(HASH_PREFIX) || hex.length !== SHA256_HEX_LENGTH || !/^[0-9a-f]+$/.test(hex)) {
    throw new Error("Snapshot storage hash must use sha256:<64 lowercase hex> format.");
  }
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
      .join(",")}}`;
  }
  throw new Error(`Unsupported Snapshot storage hash value type: ${typeof value}`);
}

function canonicalRecord(record: SnapshotStorageRecord): Record<string, unknown> {
  if (!SNAPSHOT_STORAGE_RECORD_KINDS.includes(record.kind)) {
    throw new Error(`Unknown Snapshot storage record kind: ${(record as { kind?: unknown }).kind}`);
  }

  const allowed = new Set(KIND_KEYS[record.kind]);
  const canonical: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    if (value === undefined || EXCLUDED_KEYS.has(key)) continue;
    if (!allowed.has(key)) {
      throw new Error(`Field "${key}" is not part of the canonical ${record.kind} storage hash input.`);
    }
    canonical[key] = value;
  }

  for (const key of allowed) {
    if ((record as Record<string, unknown>)[key] !== undefined && canonical[key] === undefined) canonical[key] = (record as Record<string, unknown>)[key];
  }

  return canonical;
}

export function serializeCanonicalSnapshotStorageRecord(record: SnapshotStorageRecord): string {
  return canonicalJson(canonicalRecord(record));
}

export function serializeCanonicalSnapshotStorageMapping(mapping: SnapshotStorageMapping): string {
  for (const key of Object.keys(mapping as Record<string, unknown>)) {
    if (!ALLOWED_MAPPING_KEYS.has(key) && !EXCLUDED_KEYS.has(key)) {
      throw new Error(`Field "${key}" is not part of the canonical SnapshotStorageMapping hash input.`);
    }
  }

  return canonicalJson({
    snapshotId: mapping.snapshotId,
    discoveryId: mapping.discoveryId,
    contractVersion: mapping.contractVersion,
    idempotencyKey: mapping.idempotencyKey,
    records: [...mapping.records]
      .sort((left, right) => left.storageKey.localeCompare(right.storageKey))
      .map((record) => canonicalRecord(record)),
  });
}

/** contentHash is the hash of one canonical storage record; physical database UUIDs and persisted_at are excluded. */
export function hashSnapshotStorageRecord(record: SnapshotStorageRecord): SnapshotStorageHash {
  const hash = sha256(serializeCanonicalSnapshotStorageRecord(record));
  assertHashFormat(hash);
  return hash;
}

/**
 * mappingHash is the hash of the complete canonical mapping: every allowed record sorted by storageKey.
 * Identical equivalent mappings produce identical hashes, and any canonical child change changes mappingHash.
 */
export function hashSnapshotStorageMapping(mapping: SnapshotStorageMapping): SnapshotStorageHash {
  const hash = sha256(serializeCanonicalSnapshotStorageMapping(mapping));
  assertHashFormat(hash);
  return hash;
}
