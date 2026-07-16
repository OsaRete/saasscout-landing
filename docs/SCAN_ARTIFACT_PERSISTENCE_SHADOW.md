# Scan Artifact Persistence Shadow

Version: `scan-artifact-persistence@1`  
Status: Implemented in Shadow Mode only. Flags remain disabled by default.

## PR 10.1 operational hardening summary

PR 10.1 keeps the existing Artifact, workflow, UI, and public response contracts unchanged while hardening the database boundary before controlled internal Shadow execution. The audit found that code/tests are behavioral truth, this document captures architectural intent, and `supabase/migrations/20260716000000_create_scan_artifact_persistence_shadow.sql` is persistence truth.

Confirmed discrepancies resolved in this PR:

- The service-role RPC cannot authenticate through `auth.uid()` because it runs through the server admin client. Ownership is now modeled honestly as a route-derived internal authorization context, not as database-authenticated end-user identity.
- Pure Shadow Mode now uses internal-only reads. Authenticated direct table `SELECT` is revoked and no owner-select policy is created until a reviewed durable result API exists.
- SQL cross-checks RPC scalar parameters against the JSONB Artifact payload before insert.
- Replay requires full deterministic row/payload/projection equality, not only identity and hash.
- Owner-scoped unique races are re-read and mapped to `replayed` or `conflict` deterministically.
- Redundant unique-backed owner/artifact and owner/execution indexes were removed.
- Stored read records no longer claim `replayed`; replay remains a write outcome only.
- Safe logs use the canonical Artifact `quality.scoreBand` and bounded duration normalization.

## Service-role ownership boundary

Persistence is executed only by the server-admin repository through `persist_scan_intelligence_artifact_shadow`, which is granted only to `service_role`. The RPC does **not** execute as the end-user JWT, cannot use `auth.uid()` as the owner source, and does not independently authenticate the owner. It trusts a server route-derived owner supplied by the internal repository.

The repository now requires `ScanArtifactPersistenceAuthorizationContext`:

```ts
type ScanArtifactPersistenceAuthorizationContext = Readonly<{
  authenticatedOwnerId: string;
  source: "require_user";
}>;
```

This context is constructed only from `requireUser()`, is separate from request body and Artifact payloads, validates the owner as a UUID, accepts no caller-provided idempotency key, accepts no owner field from HTTP input, and never returns or logs owner identity publicly.

## Shadow read-isolation policy

Chosen policy: internal-only reads during pure Shadow Mode.

- RLS remains enabled.
- `anon` and `authenticated` receive no table privileges.
- No authenticated owner-select policy is active yet.
- Server-admin repository reads remain explicitly owner-filtered for read-after-write verification.
- Public durable reads are deferred until a reviewed result API exists.

## SQL payload and metadata consistency

The RPC validates bounded scalar fields and cross-checks the JSONB Artifact payload before insert. It verifies object shape, version, Artifact ID, execution ID, workflow version, canonicalization version, Artifact hash, evidence summary counts, quality scores, reliability classification, validation readiness, and recommended category. This is intentionally not a duplicate of the full TypeScript Artifact validator; TypeScript remains the complete contract validator and SQL is the persistence boundary guard.

The RPC also validates owner existence, Artifact/execution ID formats and relationship, idempotency key format, hash format, count ranges, and score ranges. Invalid inputs return a bounded status and are mapped by the repository to safe persistence errors without exposing SQL text, SQLSTATE, constraint names, Supabase messages, or owner identity.

## Replay, race, and conflict behavior

Replay now requires the persisted row to match the incoming write across identity, versions, canonicalization, hash, JSONB payload structural equality, and deterministic projection columns. If any value differs under the same owner-scoped identity, the RPC returns `conflict` rather than replaying or updating.

For owner-scoped unique races, the RPC re-reads the owner row and classifies it as:

- `replayed` when all persisted values match;
- `conflict` when any persisted value differs.

Rows are append-only. Updates and deletes remain blocked by trigger.

## Index decision

The unique constraints already create indexes for:

- `owner_id + artifact_id`;
- `owner_id + execution_id`;
- `owner_id + idempotency_key`.

Therefore explicit duplicate owner/artifact and owner/execution indexes were removed. The owner/created-at index remains for future owner-scoped operational inspection, and the Artifact-version index remains as a low-cardinality rollout/audit helper while the contract is young.

## Read-result semantics

`ScanArtifactPersistenceResult` represents only write outcomes: `inserted` or `replayed`. `ScanArtifactStoredRecord` represents reads and contains only record ID, Artifact ID, Artifact hash, persisted timestamp, and Artifact. Read functions never report `status: replayed` or `replayed: true`; replay is only reported when a write actually replayed.

Read validation independently detects not found, Supabase read failure, malformed payload, invalid Artifact integrity, row/payload identity mismatch, execution mismatch, version mismatch, hash mismatch, projection mismatch, malformed record ID, and malformed timestamp. Corrupt stored data maps to `scan_artifact_persistence_corrupt` and is never repaired in place.

## Safe logging

Safe logs emit bounded aggregate diagnostics only. They use `artifact.quality.scoreBand` directly, normalize non-finite or negative durations to `0`, and emit only controlled statuses and safe error codes. Logs exclude owner ID, Artifact ID, execution ID, idempotency key, hashes, evidence IDs, claims, intent text, competitors, recommendations, raw payloads, Supabase errors, SQLSTATEs, and constraint names.

## Route Shadow helper

`runScanArtifactPersistenceShadow()` is a server-only helper that executes only after a completed workflow. Inputs are the enabled decision, verified persistence authorization context, completed workflow, injected repository, and optional clock/logger. Outputs are `disabled`, `inserted_verified`, `replay_verified`, or controlled failure statuses. The route ignores this result for the public response and never exposes Artifact or persistence metadata.

## Verification scope

Current automated coverage is deliberately labeled by scope:

- Source-asserted: migration grants/RLS/index policy and route compatibility assertions.
- Mock-tested/repository-consistent: idempotency derivation, insert/replay/read verification, safe conflict mapping, read corruption mapping, RPC response validation, safe logging, route Shadow helper behavior, and repository-level Promise concurrency semantics.
- PostgreSQL-tested: not executed in this CI run. The Snapshot persistence docs record prior local Supabase conventions, but Scan Artifact Shadow still requires opt-in local Supabase verification before enabling.
- Not yet verified: remote Supabase deployment, real PostgreSQL concurrent unique-race behavior for this migration, public durable result reads, Retrieval, Knowledge Fusion, UI migration, validation campaigns, outcome capture, queues, retries, and backfills.

Opt-in local database verification command once Supabase local is available:

```bash
supabase db reset && npm run test -- tests/scan-artifact-persistence-shadow.test.ts
```

Manual SQL verification should cover migration application, RPC compilation, append-only update/delete denial, authenticated direct insert denial, authenticated direct select denial, anonymous denial, service-role RPC insert, replay, conflict, cross-owner repository read isolation, and payload mismatch rejection.

## Rollout checklist

1. Apply migration in staging/local.
2. Execute database integration verification.
3. Confirm service-role environment exists.
4. Keep both flags false.
5. Add one internal user to workflow allowlist.
6. Enable workflow flag.
7. Execute workflow without persistence.
8. Enable persistence-shadow flag.
9. Execute one controlled Scan.
10. Verify one row.
11. Replay same execution and verify no duplicate.
12. Inspect safe logs.
13. Test a controlled Shadow failure.
14. Keep public/legacy flow unchanged.

## Compatibility

The persisted Artifact still does not influence current Scan results, opportunity generation, exactly-three opportunity behavior, displayed score, plan checks, usage increments, saved Scan behavior, result pages, UI, legacy routes, Retrieval, Knowledge Fusion, validation campaigns, outcome capture, payments, queues, retries, backfills, or public result sourcing. `scan-artifact-persistence@1`, `scan-intelligence-artifact@1`, and `scan-workflow@1` remain unchanged.
