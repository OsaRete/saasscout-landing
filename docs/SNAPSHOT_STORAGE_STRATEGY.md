# Snapshot Storage Strategy

**Status:** Draft  
**Owner:** SaaSScout Architecture  
**Phase:** Data Moat – Physical Persistence Design

Depends on:

- SNAPSHOT_CANONICAL_CONTRACT.md
- SNAPSHOT_PHYSICAL_STORAGE_ARCHITECTURE.md
- SNAPSHOT_MAPPING.md
- SNAPSHOT_ENGINE_DESIGN.md
- DATA_MOAT_ARCHITECTURE.md

---

# Purpose

This document defines how immutable Snapshots are transformed into persistent storage records.

It does not define SQL tables.

It does not define Supabase implementation.

It defines the conceptual storage strategy that every future repository implementation must preserve.

---

# Design Goals

The storage strategy must preserve:

- immutability
- deterministic persistence
- provider independence
- append-only history
- traceability
- version compatibility
- idempotency
- historical reconstruction

Every implementation must produce the same logical storage representation regardless of infrastructure.

---

# Conceptual Flow

The Snapshot persistence flow is:

Discovery

↓

Snapshot Builder

↓

Snapshot Validator

↓

Snapshot Pipeline

↓

Persistence Boundary

↓

Storage Mapper

↓

Repository

↓

Physical Database

Each layer has exactly one responsibility.

No layer may absorb responsibilities belonging to another.

---

# Storage Philosophy

The Snapshot itself is the canonical historical artifact.

Storage records are merely a physical representation of that artifact.

Storage records must never redefine Snapshot semantics.

The Snapshot Contract always remains authoritative.

---

# Record Strategy

One Snapshot is represented as a deterministic collection of conceptual records.

Example:

Snapshot

↓

Identity Record

↓

Section Records

↓

Evidence Records

↓

Evidence Support Records

↓

Provenance Records

↓

Validation Record

The complete record set represents one immutable Snapshot.

Partial persistence is forbidden.

---

# Record Independence

Each conceptual record owns one responsibility.

Examples:

Identity Record

stores Snapshot identity only.

Section Record

stores one intelligence section.

Evidence Record

stores one evidence object.

Support Record

stores one evidence support relationship.

Validation Record

stores validator output.

No record should duplicate responsibilities owned by another record.

---

# Identity Strategy

Every record belonging to one Snapshot shares:

- Snapshot ID
- Discovery ID
- Contract Version

These values establish logical ownership.

Individual record identifiers never replace Snapshot identity.

---

# Storage Keys

Every stored record must have a deterministic storage key.

Storage keys must be derived only from canonical Snapshot identity.

Storage keys must never contain:

- randomness
- timestamps generated during persistence
- provider identifiers
- database-generated business meaning

Storage keys exist solely to support deterministic persistence.

---

# Record Ordering

Storage order must be deterministic.

Equivalent Snapshots must always produce the same ordered record set.

Ordering must never depend on:

provider order

runtime execution order

thread scheduling

database implementation

Deterministic ordering guarantees reproducible persistence.

---

# Atomic Persistence

All records belonging to one Snapshot form one logical persistence unit.

Either:

every record is stored,

or

no record is stored.

Partial persistence is prohibited.

---

# Idempotent Persistence

Persisting the same Snapshot multiple times must never create duplicate history.

Equivalent Snapshot identities represent the same historical artifact.

Repository implementations must detect identical persistence requests deterministically.

Repeated identical writes must be safe.

---

# Append-Only History

Storage never updates historical Snapshots.

Storage never deletes historical Snapshots.

Storage never rewrites historical Snapshots.

Corrections create new Snapshots.

Knowledge evolves independently.

---

# Evidence Strategy

Evidence records preserve historical evidence exactly as captured.

Evidence must remain connected to:

- support targets
- provenance
- confidence
- source references

Evidence is historical.

Evidence is never recalculated during persistence.

---

# Provenance Strategy

Provenance records preserve complete traceability.

Every persisted intelligence conclusion must remain reconstructable from stored provenance.

Repository implementations must never remove provenance.

---

# Validation Strategy

Only validated Snapshots may cross the persistence boundary.

Validation metadata is stored together with the Snapshot.

Validation metadata exists to explain why a Snapshot entered the Data Moat.

Validation metadata never becomes business intelligence.

---

# Version Strategy

Every stored Snapshot permanently preserves:

- Contract Version
- Snapshot Version
- Engine Version
- Normalization Version
- Intelligence Version
- Confidence Version

Version information allows future systems to interpret historical Snapshots correctly.

---

# Provider Independence

Storage records never contain:

provider payloads

provider request identifiers

prompt history

runtime debug objects

temporary execution state

UI state

database implementation details

Only canonical Snapshot semantics may be stored.

---

# Repository Independence

The storage strategy is independent from repository implementation.

Future implementations may use:

Supabase

PostgreSQL

SQLite

MongoDB

Cloud storage

Custom storage engines

provided they preserve the canonical storage strategy.

---

# Query Independence

The storage strategy is not optimized for querying.

Future query models may introduce:

materialized views

indexes

search projections

analytics tables

read models

without modifying historical Snapshot storage.

---

# Observation Extraction

Observation Extraction never consumes Discovery output.

Observation Extraction always consumes persisted Snapshots.

This guarantees that historical intelligence remains reproducible.

---

# Knowledge Evolution

Knowledge Evolution never writes directly into Snapshot storage.

Knowledge Evolution reads immutable Snapshots.

Derived knowledge is stored separately.

Historical Snapshot persistence remains untouched.

---

# Failure Strategy

Persistence failures must never corrupt history.

Failure must leave the Data Moat unchanged.

Retry behavior must preserve idempotency.

Infrastructure failures must never create duplicate historical records.

---

# Future Compatibility

The storage strategy must support future evolution without redesign.

Future additions include:

Observation Extraction

Knowledge Evolution

Memory

Learning

Recommendation

Prediction

Analytics

Historical Intelligence

New functionality extends the storage strategy.

It never replaces it.

---

# Non Goals

This document does not define:

SQL schema

Supabase tables

indexes

constraints

foreign keys

RLS policies

repository implementation

database transactions

migration files

Those belong to later implementation documents.

---

# Architectural Invariants

Every Snapshot becomes one deterministic storage mapping.

Storage records never redefine Snapshot semantics.

Every record belongs to exactly one Snapshot.

Persistence is atomic.

Persistence is deterministic.

Persistence is idempotent.

Historical records are append-only.

Provider-specific information is never stored.

Knowledge Evolution never modifies Snapshot storage.

Future repository implementations must preserve these invariants exactly.
## Identity, replay, and version alignment

Snapshot storage identity and repository replay behavior are governed by `docs/SNAPSHOT_STORAGE_IDENTITY_AND_CONFLICT_POLICY.md`. Storage keys must be derived from canonical semantic fields, never array indexes, insertion order, provider execution order, database-generated business identifiers, or provider-specific behavior. The full Snapshot `versions` object is retained while migration designs may additionally expose first-class version columns for compatibility and indexing.
