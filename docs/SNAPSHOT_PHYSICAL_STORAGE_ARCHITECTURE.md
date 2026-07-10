# Snapshot Physical Storage Architecture

**Status:** Draft  
**Owner:** SaaSScout Architecture  
**Phase:** Data Moat – Physical Persistence Design  
**Depends on:**

- PRODUCT_VISION.md
- DATA_MOAT.md
- DATA_MOAT_ARCHITECTURE.md
- DATA_MOAT_DATA_MODEL.md
- SNAPSHOT_CANONICAL_CONTRACT.md
- SNAPSHOT_TYPES.md
- SNAPSHOT_NORMALIZATION.md
- SNAPSHOT_MAPPING.md
- SNAPSHOT_ENGINE_DESIGN.md

---

# Purpose

This document defines the physical storage architecture for immutable Snapshots inside the Data Moat.

The Snapshot Contract defines **what** a Snapshot is.

The Snapshot Physical Storage Architecture defines **how** a Snapshot is physically represented while preserving every architectural invariant established during Phase 1.

This document is intentionally storage-oriented while remaining database-independent.

It defines architectural principles rather than SQL implementation.

---

# Architectural Principle

Every successful Discovery produces exactly one immutable Snapshot.

That Snapshot becomes the permanent historical record of what SaaSScout knew at one precise moment in time.

Nothing may modify that Snapshot after persistence.

Historical truth is append-only.

Knowledge evolves.

Snapshots never evolve.

---

# Snapshot Persistence Philosophy

The physical persistence model exists to preserve historical intelligence.

It is **not** optimized for:

- reporting
- dashboards
- analytics
- recommendation generation
- memory retrieval
- query performance

Those concerns belong to downstream layers.

The storage layer exists solely to preserve historical truth.

---

# Primary Objectives

The physical model must guarantee:

- immutability
- deterministic persistence
- provider independence
- traceability
- version preservation
- evidence preservation
- idempotent writes
- append-only history

---

# Snapshot Storage Layers

One Snapshot is composed of several conceptual storage layers.

```
Snapshot
│
├── Identity
├── Metadata
├── Discovery Context
├── Problem Intelligence
├── Opportunity Intelligence
├── Founder Intelligence
├── Evidence
├── Confidence
├── Diagnostics
├── Versions
└── Provenance
```

These layers represent conceptual ownership.

They do not necessarily imply one SQL table per layer.

---

# Snapshot Identity

Snapshot Identity uniquely identifies one historical Snapshot.

Identity must remain stable forever.

Identity is independent from:

- database implementation
- storage provider
- repository implementation
- infrastructure

Identity includes:

- Snapshot ID
- Discovery ID
- Contract Version
- Snapshot Version
- Creation Timestamp
- Lifecycle State

Identity never changes.

---

# Snapshot Metadata

Metadata describes the Snapshot itself.

Metadata is not business intelligence.

Metadata never participates in Knowledge Evolution.

Metadata includes:

- creation timestamp
- lifecycle state
- contract version
- normalization version
- intelligence version
- confidence version

Metadata must never contain:

- recommendation state
- learning state
- business metrics
- user state

---

# Discovery Context

Discovery Context preserves the execution environment that produced the Snapshot.

It exists only for historical reconstruction.

Discovery Context never becomes canonical knowledge.

Discovery Context may include:

- search topic
- market
- language
- audience
- discovery mode
- selected providers
- execution context

Provider-specific payloads must never be stored.

---

# Intelligence Sections

Business intelligence remains separated by responsibility.

The storage architecture preserves independent sections for:

Problem Intelligence

Opportunity Intelligence

Founder Intelligence

Each section remains independently versionable.

Each section may evolve independently in future contract versions.

---

# Evidence Storage

Evidence is stored as immutable historical evidence.

Evidence preserves:

- evidence identity
- evidence type
- evidence claim
- support targets
- source references
- provenance references
- confidence

Evidence is never rewritten.

Evidence may later participate in:

- Observation Extraction
- Knowledge Evolution
- Recommendation
- Memory

---

# Confidence Storage

Confidence represents confidence at Snapshot creation time.

Confidence is historical.

Confidence is never recalculated inside the Snapshot.

Future confidence models create new derived knowledge rather than rewriting history.

---

# Diagnostics Storage

Diagnostics preserve processing diagnostics.

Diagnostics exist only to explain Snapshot creation.

Diagnostics are not business intelligence.

Diagnostics never influence future learning directly.

---

# Version Storage

Every Snapshot permanently stores:

- Contract Version
- Engine Version
- Intelligence Version
- Normalization Version
- Confidence Version

Future systems must always know exactly which architecture produced every Snapshot.

---

# Provenance Storage

Provenance preserves historical traceability.

Every important conclusion inside a Snapshot must be traceable to supporting evidence.

Provenance includes:

- source references
- evidence lineage
- engine attribution
- processing history

Raw provider payloads are never stored.

---

# Physical Representation

The physical representation must preserve conceptual separation.

Storage implementation may use:

- relational tables
- JSON documents
- hybrid structures

provided that conceptual ownership remains intact.

Implementation details must never redefine Snapshot semantics.

---

# Persistence Boundary

Snapshot persistence begins only after:

Discovery completed

↓

Normalization completed

↓

Snapshot Builder completed

↓

Snapshot Validator succeeded

↓

Snapshot Pipeline succeeded

Only then may persistence occur.

---

# Immutability

After persistence:

Snapshots can never be modified.

Corrections produce new Snapshots.

Knowledge Evolution derives new knowledge.

Historical Snapshots remain unchanged forever.

---

# Idempotency

Snapshot persistence must be idempotent.

Repeated persistence of the same Snapshot must never create duplicate historical records.

Identity determines uniqueness.

Infrastructure must never create duplicate history.

---

# Storage Independence

The physical architecture must remain independent from:

Supabase

PostgreSQL

SQLite

MongoDB

Cloud storage

Future storage providers

Storage providers implement the architecture.

They never define it.

---

# Future Compatibility

The storage architecture must support future integration with:

Observation Extraction

Knowledge Evolution

Historical Intelligence

Memory

Learning

Recommendation

Prediction

Analytics

without redesigning Snapshot persistence.

---

# Non Goals

This document does not define:

SQL schema

database tables

indexes

constraints

foreign keys

RLS policies

repository implementation

transaction implementation

migration strategy

Those belong to later documents.

---

# Architectural Invariants

The following invariants are mandatory.

Snapshots are immutable.

Snapshots are append-only.

Every Snapshot represents one Discovery.

Historical truth is never rewritten.

Provider payloads are never stored.

Evidence remains traceable.

Versions remain permanently preserved.

Persistence is deterministic.

Persistence is idempotent.

Knowledge is always downstream of Snapshot persistence.

Observation Extraction always consumes persisted Snapshots.

Future storage implementations must preserve these invariants exactly.

No infrastructure implementation may weaken them.