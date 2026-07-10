# Snapshot Database Architecture

**Status:** Draft  
**Owner:** SaaSScout Architecture  
**Phase:** Data Moat – Database Architecture

Depends on:

- SNAPSHOT_CANONICAL_CONTRACT.md
- SNAPSHOT_PHYSICAL_STORAGE_ARCHITECTURE.md
- SNAPSHOT_STORAGE_STRATEGY.md
- SNAPSHOT_ENGINE_DESIGN.md
- DATA_MOAT_ARCHITECTURE.md

---

# Purpose

This document defines how the immutable Snapshot Storage Model is represented inside a relational database.

It is intentionally database-agnostic.

Although the first implementation will use Supabase (PostgreSQL), this document defines architectural rules rather than SQL implementation.

SQL migrations are derived from this document.

This document is the architectural contract between Snapshot Storage and future database implementations.

---

# Architectural Principle

The database stores immutable historical Snapshots.

The database does not store Discovery executions.

The database does not store Knowledge Evolution state.

The database does not store recommendations.

The database stores only the canonical Snapshot representation.

---

# Persistence Unit

The smallest persistence unit is one Snapshot.

One successful Snapshot persistence operation stores the complete Snapshot.

The persistence unit is never:

- one section
- one evidence
- one source
- one confidence record

The persistence unit is always the entire Snapshot.

---

# Storage Model

Each Snapshot is decomposed into conceptual record groups.

Those groups become physical database tables.

Conceptually:

Snapshot

↓

Snapshot Identity

↓

Snapshot Sections

↓

Evidence

↓

Evidence Supports

↓

Provenance Sources

↓

Evidence Lineage

↓

Engine Attribution

↓

Processing History

↓

Validation

Each group owns one responsibility.

---

# Table Ownership

Every physical table belongs exclusively to Snapshot persistence.

Knowledge Evolution must never write directly into Snapshot tables.

Observation Extraction may read Snapshot tables.

Future Analytics may read Snapshot tables.

No external component owns Snapshot persistence.

---

# Snapshot Identity

Snapshot identity is permanent.

Identity includes:

- Snapshot ID
- Discovery ID
- Contract Version
- Snapshot Version
- Created At
- Lifecycle State
- Idempotency Key

Identity never changes.

---

# Section Storage

Each canonical Snapshot section is stored independently.

Sections remain logically isolated.

Examples:

Discovery Context

Problem Intelligence

Opportunity Intelligence

Founder Intelligence

Confidence

Diagnostics

Each section preserves exactly the canonical Snapshot meaning.

No table should merge multiple section responsibilities.

---

# Evidence Storage

Evidence is stored independently.

Evidence records reference the owning Snapshot.

Evidence never becomes shared mutable state.

Evidence is historical.

Evidence is append-only.

---

# Evidence Support Storage

Support relationships are stored separately.

This allows:

multiple evidence items supporting one conclusion,

one evidence item supporting multiple conclusions,

future graph traversal,

future Knowledge Evolution.

Supports are immutable.

---

# Provenance Storage

Provenance is stored independently.

Every evidence object preserves:

source references,

processing lineage,

engine attribution,

processing history.

Complete historical reconstruction must always remain possible.

---

# Validation Storage

Validation metadata is stored independently.

Validation metadata explains:

why a Snapshot entered the Data Moat.

Validation metadata never becomes business intelligence.

---

# Storage Keys

Every persisted record owns a deterministic storage key.

Storage keys must:

be reproducible,

remain stable,

never depend on insertion order,

never depend on database-generated identifiers,

never depend on provider execution.

---

# Primary Identity

The primary business identity of the Data Moat is the Snapshot.

Database surrogate IDs may exist internally.

They never replace Snapshot identity.

Snapshot ID remains the canonical identifier.

---

# Foreign Key Philosophy

Relationships express ownership.

Every child record belongs to exactly one Snapshot.

Relationships always point upward toward immutable history.

No child record may outlive its Snapshot.

---

# Transaction Model

Persisting one Snapshot is one database transaction.

Either:

every Snapshot record is committed,

or

every Snapshot record is rolled back.

Partial persistence is forbidden.

---

# Idempotency

Persisting the same Snapshot twice must never duplicate history.

Repository implementations must detect deterministic replay.

Repeated identical persistence must succeed safely.

Conflicting persistence must fail deterministically.

---

# Update Policy

Historical Snapshot records are never updated.

Historical Snapshot records are never overwritten.

Historical Snapshot records are never deleted during normal operation.

Corrections generate new Snapshots.

---

# Append-Only Strategy

Snapshot storage is append-only.

Historical intelligence is permanent.

Derived intelligence evolves elsewhere.

The database therefore represents a permanent historical ledger.

---

# Query Model

Snapshot storage is optimized for correctness.

It is not optimized for reporting.

Future read models may introduce:

materialized views,

analytics tables,

search indexes,

cache projections.

These never modify Snapshot storage.

---

# Knowledge Evolution Boundary

Knowledge Evolution never writes into Snapshot tables.

Knowledge Evolution reads immutable Snapshot history.

Derived knowledge is stored separately.

This separation is mandatory.

---

# Observation Extraction Boundary

Observation Extraction is the first consumer of persisted Snapshots.

It never consumes Discovery output.

It never consumes provider payloads.

It only consumes canonical Snapshot history.

---

# Repository Boundary

The repository implementation owns:

database communication,

transactions,

retry logic,

conflict handling,

database-specific optimizations.

The repository never changes Snapshot semantics.

---

# Security

Snapshot storage is server-side only.

Clients never write Snapshot records directly.

Administrative persistence uses privileged credentials.

Database permissions must prevent unauthorized writes.

---

# Version Compatibility

Historical Snapshots remain readable forever.

Future schema evolution must preserve:

Contract Version,

Normalization Version,

Engine Version,

Confidence Version,

Snapshot Version.

Schema evolution must never invalidate historical Snapshots.

---

# Scalability

The storage model must support:

millions of Snapshots,

billions of evidence records,

append-only growth,

parallel ingestion,

future partitioning,

future archival.

Scalability decisions must preserve Snapshot semantics.

---

# Failure Recovery

Database failures must never corrupt historical intelligence.

Recovery procedures must preserve idempotency.

Rollback must restore the database to the exact state before persistence began.

---

# Database Independence

This architecture supports multiple implementations.

Examples:

PostgreSQL

Supabase

CockroachDB

Aurora PostgreSQL

SQLite

Distributed SQL

Future migrations must preserve this contract independently of infrastructure.

---

# Non Goals

This document does not define:

SQL syntax,

CREATE TABLE statements,

indexes,

constraints,

RLS policies,

migration ordering,

repository implementation,

Supabase configuration.

Those belong to implementation documents.

---

# Architectural Invariants

Every Snapshot is persisted exactly once.

Every persisted record belongs to one Snapshot.

Snapshot identity never changes.

Persistence is atomic.

Persistence is deterministic.

Persistence is append-only.

Historical intelligence is immutable.

Knowledge Evolution never modifies Snapshot storage.

Observation Extraction always starts from persisted Snapshots.

Database implementation never changes Snapshot semantics.
## Pre-SQL identity gate

Before the first Snapshot SQL migration, database architecture must satisfy `docs/SNAPSHOT_STORAGE_IDENTITY_AND_CONFLICT_POLICY.md`: atomic mapping writes, inserted versus identical replay versus rejected conflict outcomes, immutable historical records, exact required-section uniqueness, zero-or-one founder intelligence, and validator-owned `validatorVersion` persistence.
