# Scan Artifact Persistence Shadow

Version: `scan-artifact-persistence@1`  
Status: Implemented in Shadow Mode only.

## Audit summary

The audit treated code/tests as behavior, Scan docs as architectural intent, and Supabase migrations/RPCs as persistence truth. Current production Scan routes still write no Artifact rows and legacy usage counters are unchanged. The experimental `scan-workflow@1` route creates an in-memory `scan-intelligence-artifact@1`; this PR adds optional shadow persistence after completion only.

Snapshot persistence patterns were classified as follows:

- Safely reusable: server-only data access modules, stable canonical serialization before hashing, append-only tables, replay/conflict semantics, controlled error mapping, safe aggregate logs, source-level migration assertions.
- Reusable after adaptation: idempotency and conflict handling. Scan uses owner-scoped Artifact/execution identity rather than Discover Snapshot/discovery identity, and stores one canonical JSONB Artifact plus safe projections rather than decomposed Snapshot records.
- Discover-specific: Snapshot section/evidence/provenance table decomposition, Snapshot storage mapping keys, Discover lifecycle states, Retrieval candidate repositories, and Discover persistence quality gates.

No disagreement required changing legacy behavior. Snapshot RPCs use service-role writes without user ownership because Discover persistence is system-owned; Scan Artifact Shadow adds explicit `owner_id` and authenticated route-derived ownership.

## Contract and identities

The persistence contract is `scan-artifact-persistence@1`. It does not bump `scan-intelligence-artifact@1` or `scan-workflow@1`.

Identity separation:

- Artifact identity: `artifactId`, `execution.executionId`, and `integrity.artifactHash`.
- Database identity: table row UUID.
- Idempotency identity: `scan-artifact-shadow:v1:<sha256>`, derived server-side from persistence version, Artifact version, Artifact ID, workflow execution ID, and a one-way hash of owner scope.

The idempotency key never uses raw owner ID, client input, or Artifact hash alone.

## Schema, constraints, indexes, RLS

Migration `20260716000000_create_scan_artifact_persistence_shadow.sql` adds `scan_intelligence_artifacts` with owner, Artifact metadata, canonical JSONB payload, safe projections, and `created_at`. Constraints enforce owner-scoped uniqueness for Artifact ID, execution ID, and idempotency key; bounded ID formats; SHA-256 hash format; version values; non-negative source counts; and score ranges.

Indexes are limited to expected future reads: owner + created date, owner + Artifact ID, owner + execution ID, and Artifact version.

RLS is enabled. Authenticated users can select only rows where `owner_id = auth.uid()`. Direct authenticated inserts, updates, and deletes are not granted. A trigger rejects updates and deletes so rows are append-only even through privileged accidental mutation paths.

## RPC/repository architecture

Persistence uses a controlled server repository in `lib/scan/artifact-persistence.ts` and a service-role RPC `persist_scan_intelligence_artifact_shadow`. The route obtains `ownerId` from `requireUser`; owner is never read from the request body and is never embedded in or returned by public Artifact projections.

The RPC obtains the owner from a scalar supplied by the server repository because the current service-role admin client does not execute with the end-user JWT. This is a deliberate adaptation of the audited Snapshot pattern. Direct client execution is revoked; only `service_role` can call it.

## Write, replay, conflict, and read validation

Before writing, the repository validates the Artifact, verifies integrity, canonicalizes the payload, derives the idempotency key, and sends only bounded metadata plus JSONB payload to the RPC.

Replay behavior:

- Same owner + same Artifact execution + same hash returns `replayed` and writes no row.
- Same idempotency identity + different Artifact ID/execution/hash returns a controlled conflict and leaves the existing row unchanged.
- Different owner scope derives a different idempotency identity.

Reads by Artifact ID or execution ID are owner-scoped. The repository parses JSON, calls `parseAndValidateScanIntelligenceArtifact()`, verifies integrity, compares row metadata and projections against the payload, and treats disagreement as stored-data corruption. It never repairs or overwrites rows.

## Shadow route integration

The experimental workflow route sequence is:

1. feature flag and allowlist checks;
2. authenticated request parsing;
3. execute `scan-workflow@1`;
4. map and validate `scan-intelligence-artifact@1`;
5. if `SCAN_ARTIFACT_PERSISTENCE_SHADOW_ENABLED=true`, attempt persistence;
6. read after write and compare canonical serialized Artifact;
7. return the existing workflow response shape.

Default is disabled. When disabled, no persistence repository call or database access occurs. Shadow failures are isolated: workflow success still returns success, and only safe internal diagnostics are logged.

## Safe logs and monitoring

`buildSafeScanArtifactPersistenceShadowLog()` emits aggregate-only diagnostics: event, versions, status, duration, source counts, score band, reliability, validation readiness, recommended category, processing stage count, integrity flag, replay flag, and safe error code.

It excludes owner ID, Artifact ID, execution ID, idempotency key, hashes, evidence IDs, claims, intent, competitors, recommendations, raw payload, and Supabase/SQL details.

Minimum monitoring before broader enablement: attempted writes, inserted, replayed, conflicts, write failures, read failures, verification failures, average and p95 duration if available, corrupt-row count, and flag-disabled count. No external analytics vendor is added.

## Deployment and non-goals

Deployment order:

1. deploy the additive migration;
2. deploy code with the shadow flag false;
3. enable for internal users only;
4. monitor safe logs and verification outcomes;
5. expand carefully.

Non-goals: current UI migration, public Artifact result routes, legacy flow removal, Artifact as response source, editing/deletion UI, retention automation, Retrieval, Knowledge Fusion, validation campaigns, outcome capture, Feedback Moat, payment changes, usage-counter changes, model/provider changes, retries, queues, background jobs, and backfill.

Retention/deletion is a future privileged policy. Account deletion or regulatory deletion must be handled by a separate controlled process.

## Compatibility and limitations

The persisted Artifact does not influence current Scan results, opportunity generation, exactly-three opportunity behavior, displayed score, plan checks, usage increments, saved Scan behavior, result pages, UI, or legacy routes. Read-after-write exists only for verification.

Known limitations: no public durable result read, no UI source migration, no automated retention/deletion, and no Retrieval/Knowledge Fusion consumption yet.
