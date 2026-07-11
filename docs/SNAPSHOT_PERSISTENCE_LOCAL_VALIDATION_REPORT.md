# Snapshot Persistence Local Validation Report

**Project:** SaaSScout

**Validated migration:**

```
supabase/migrations/20260710000000_create_snapshot_persistence_schema.sql
```

**Validation date:** July 2026

---

# Purpose

This document records the complete local validation performed for the Snapshot Persistence layer before any remote Supabase deployment.

The objective of this validation was to verify that the Snapshot repository behaves correctly under normal operation, replay scenarios, conflict scenarios, transactional failures, security restrictions and deterministic reconstruction.

All tests documented here were executed against an isolated local Supabase instance.

No remote Supabase project was accessed.

No production database was modified.

---

# Local Environment

- Windows 10 Home Single Language
- Docker Desktop
- WSL2
- Supabase CLI
- PostgreSQL (local container)
- PowerShell

---

# Validated Database Objects

The migration successfully created the complete Snapshot Persistence schema.

Validated tables:

- snapshot_identities
- snapshot_sections
- snapshot_evidence
- snapshot_evidence_supports
- snapshot_provenance_sources
- snapshot_evidence_lineage
- snapshot_engine_attribution
- snapshot_processing_history
- snapshot_validations

Validated infrastructure:

- SECURITY DEFINER write RPC
- Append-only triggers
- Primary Keys
- Foreign Keys
- Unique Constraints
- Advisory Lock
- Row Level Security
- Permission revocations
- Service Role execution permissions

---

# Validation Results

## ✅ 1. Migration execution

Verified that the migration executes successfully from a clean database.

Status:

PASS

---

## ✅ 2. Schema creation

Verified creation of all nine Snapshot Persistence tables.

Status:

PASS

---

## ✅ 3. SECURITY DEFINER RPC

Verified that `public.write_snapshot_mapping(jsonb)` exists and is configured as SECURITY DEFINER.

Status:

PASS

---

## ✅ 4. Atomic Snapshot insertion

Inserted a valid Snapshot mapping.

Verified:

- Snapshot Identity
- Sections
- Validation

were persisted atomically.

Status:

PASS

---

## ✅ 5. Idempotent replay

Submitted exactly the same Snapshot twice.

Observed result:

- no duplicate rows
- replay detected
- repository remained immutable

Status:

PASS

---

## ✅ 6. Sequential conflict detection

Submitted the same repository identity with a different mappingHash.

Observed result:

- conflict detected
- write rejected
- original Snapshot preserved

Status:

PASS

---

## ✅ 7. Required section validation

Submitted a Snapshot missing one mandatory section.

Observed result:

- transaction rejected
- rollback completed
- zero rows persisted

Status:

PASS

---

## ✅ 8. Referential integrity validation

Submitted an Evidence Support referencing a non-existent Evidence.

Observed result:

- transaction rejected
- rollback completed
- zero rows persisted

Status:

PASS

---

## ✅ 9. Append-only protection

Attempted UPDATE operations on Snapshot tables.

Observed result:

```
UPDATE forbidden
```

Original rows remained unchanged.

Status:

PASS

---

## ✅ 10. DELETE protection

Attempted DELETE operations.

Observed result:

```
DELETE forbidden
```

Original rows remained intact.

Status:

PASS

---

## ✅ 11. Anonymous access

Attempted direct table reads using the `anon` role.

Observed result:

Permission denied.

Status:

PASS

---

## ✅ 12. Authenticated access

Attempted direct table reads using the `authenticated` role.

Observed result:

Permission denied.

Status:

PASS

---

## ✅ 13. RPC execution permissions

Verified:

- anon cannot execute the RPC
- authenticated cannot execute the RPC
- service_role can execute the RPC

Status:

PASS

---

## ✅ 14. Concurrent identical writes

Executed two simultaneous writes for the same Snapshot.

Observed result:

One transaction inserted the Snapshot.

The second transaction detected an identical replay.

Final repository state:

- one identity
- one Snapshot
- no duplicates

Status:

PASS

---

## ✅ 15. Deterministic reconstruction

Reconstructed the Snapshot directly from the database.

Generated two independent reconstruction files.

Computed SHA-256 for both outputs.

Observed result:

Both hashes were identical.

This confirms deterministic reconstruction from persisted storage.

Status:

PASS

---

# Overall Validation Summary

The following capabilities were successfully validated locally:

- Schema creation
- Atomic persistence
- Idempotent replay
- Sequential conflict detection
- Transaction rollback
- Required section validation
- Referential integrity
- Append-only enforcement
- Row Level Security
- Service-role-only write boundary
- Concurrent identical writes
- Deterministic reconstruction

---

# Remaining Verification Before Production

Although the local validation was successful, the following items remain part of the controlled deployment process before production deployment:

- Verify remote Supabase project identity.
- Inspect remote migration history.
- Inspect remote object ownership.
- Verify remote RLS policies.
- Verify remote function permissions.
- Execute migration dry-run.
- Validate complete TypeScript → SQL → TypeScript hash equivalence using production-generated Snapshots.
- Execute concurrent conflicting-write validation.
- Prepare rollback strategy.
- Obtain explicit deployment approval.

---

# Final Assessment

## Local Validation

✅ PASSED

The Snapshot Persistence layer behaved correctly for all documented local validation scenarios.

No data corruption, duplicate persistence, partial writes or permission regressions were observed.

---

## Deployment Readiness

Current status:

```
READY FOR CONTROLLED REMOTE DEPLOYMENT PREPARATION
```

This migration **is not yet approved for direct production deployment**.

Before executing `supabase db push`, the remote project state must be inspected and the deployment gate completed.

---

# Conclusion

The Snapshot Persistence implementation has successfully passed isolated local validation.

The persistence model demonstrates:

- immutable repository behavior;
- deterministic storage;
- transactional consistency;
- append-only guarantees;
- controlled write access through a SECURITY DEFINER RPC;
- successful recovery from invalid transactions;
- deterministic reconstruction from persisted data.

Based on the completed local validation, the project is ready to proceed to the **controlled remote deployment preparation phase**.