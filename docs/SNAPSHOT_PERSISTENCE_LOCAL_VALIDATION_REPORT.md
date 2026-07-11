# Snapshot Persistence Local Validation Report

**Project:** SaaSScout  
**Date:** 11 July 2026  
**Environment:** Local (Docker Desktop + WSL2 + Supabase CLI + PostgreSQL)

---

# Objective

Validate the complete Snapshot Persistence migration before deploying it to the production Supabase project.

Migration validated:

```
supabase/migrations/20260710000000_create_snapshot_persistence_schema.sql
```

The goal of this validation is to verify:

- Repository integrity
- Atomic persistence
- Idempotency
- Immutable storage
- Referential integrity
- Security model
- Deterministic reconstruction
- Concurrency behavior

---

# Environment

- Windows 11
- Docker Desktop
- WSL2
- Supabase CLI
- PostgreSQL (local)
- PowerShell

---

# Validation Results

## 1. Migration deployment

### Objective

Verify that the migration creates every required object.

### Verified

- Snapshot tables
- Constraints
- Indexes
- Triggers
- Functions
- SECURITY DEFINER RPC

### Result

✅ PASS

---

## 2. Initial insertion

### Objective

Insert a valid Snapshot Mapping.

### Expected

```
status = inserted
written = true
```

### Result

✅ PASS

---

## 3. Idempotent replay

### Objective

Execute the exact same mapping twice.

### Expected

```
status = replayed_identical
written = false
```

No additional rows should be inserted.

### Result

✅ PASS

---

## 4. Conflict detection

### Objective

Replay the same Snapshot using a different mapping hash.

### Expected

```
status = rejected_conflict
```

Repository must remain unchanged.

### Result

✅ PASS

---

## 5. Invalid section rollback

### Objective

Insert a Snapshot with invalid section cardinality.

### Expected

Transaction rollback.

No records persisted.

### Result

✅ PASS

---

## 6. Referential integrity rollback

### Objective

Insert Evidence Support referencing a non-existent Evidence record.

### Expected

Transaction rollback.

No records persisted.

### Result

✅ PASS

---

## 7. Append-only UPDATE protection

### Objective

Attempt to modify persisted data.

### Expected

```
UPDATE forbidden
```

### Result

✅ PASS

---

## 8. Append-only DELETE protection

### Objective

Attempt to delete persisted data.

### Expected

```
DELETE forbidden
```

### Result

✅ PASS

---

## 9. Anonymous role protection

### Objective

Verify that anon cannot read tables or execute the persistence RPC.

### Expected

Permission denied.

### Result

✅ PASS

---

## 10. Authenticated role protection

### Objective

Verify that authenticated users cannot read persistence tables or execute the persistence RPC.

### Expected

Permission denied.

### Result

✅ PASS

---

## 11. Service Role validation

### Objective

Verify that only service_role can execute the persistence function.

### Expected

RPC execution allowed.

Input validation executed correctly.

### Result

✅ PASS

---

## 12. Concurrent insertion

### Objective

Execute two identical Snapshot insertions simultaneously.

### Expected

One transaction:

```
inserted
```

Second transaction:

```
replayed_identical
```

Repository must contain only one Snapshot.

### Result

✅ PASS

---

## 13. Deterministic reconstruction

### Objective

Reconstruct the persisted Snapshot twice.

### Expected

Both generated JSON files must produce the exact same SHA256 hash.

Observed SHA256:

```
5612F9F316F1A1774B0097F16129DFACE588B2C5B9D64627E6C5FA9B1ACAF45A
```

The hashes matched exactly.

### Result

✅ PASS

---

# Overall Validation

The Snapshot Persistence layer successfully demonstrated:

- Atomic transactions
- Immutable storage
- Idempotent writes
- Conflict detection
- Referential integrity
- Append-only protection
- Secure RPC permissions
- Deterministic reconstruction
- Concurrent write safety

---

# Final Status

```
READY FOR REMOTE DEPLOYMENT
```

All planned local validation scenarios completed successfully.

The persistence layer is considered production-ready pending final architecture and security audit.