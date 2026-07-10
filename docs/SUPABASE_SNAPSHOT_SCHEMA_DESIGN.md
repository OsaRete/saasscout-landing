# Supabase Snapshot Schema Design

**Status:** Draft  
**Owner:** SaaSScout Architecture  
**Phase:** Data Moat – Snapshot Persistence

Depends on:

- SNAPSHOT_CANONICAL_CONTRACT.md
- SNAPSHOT_PHYSICAL_STORAGE_ARCHITECTURE.md
- SNAPSHOT_DATABASE_ARCHITECTURE.md
- SNAPSHOT_STORAGE_STRATEGY.md
- DATA_MOAT_ARCHITECTURE.md

---

# Purpose

This document defines how the Snapshot Database Architecture is implemented inside Supabase.

This is still an architectural document.

It intentionally avoids SQL syntax.

SQL migrations are implementation artifacts generated from this design.

---

# Design Goals

The schema must:

- preserve immutable Snapshot history
- support deterministic persistence
- support idempotent writes
- isolate Snapshot storage from Knowledge Evolution
- remain provider-independent
- support future horizontal growth
- preserve complete historical reconstruction

---

# High-Level Schema

The Snapshot persistence layer is composed of independent storage groups.

Conceptually:

snapshot_identity

snapshot_sections

snapshot_evidence

snapshot_evidence_support

snapshot_provenance_sources

snapshot_evidence_lineage

snapshot_engine_attribution

snapshot_processing_history

snapshot_validation

Each storage group becomes one physical table.

---

# Snapshot Identity Table

Purpose:

Stores one immutable Snapshot identity.

Responsibilities:

- Snapshot ID
- Discovery ID
- Snapshot Version
- Contract Version
- Normalization Version
- Intelligence Version
- Confidence Version
- Lifecycle State
- Created At
- Idempotency Key

Exactly one record exists for each Snapshot.

---

# Snapshot Sections Table

Stores canonical Snapshot sections.

Examples:

- Discovery Context
- Problem Intelligence
- Opportunity Intelligence
- Founder Intelligence
- Confidence
- Diagnostics

Sections remain independent.

Each section belongs to exactly one Snapshot.

---

# Snapshot Evidence Table

Stores canonical evidence.

Responsibilities:

- Evidence identity
- Evidence kind
- Evidence relationship
- Evidence claim
- Confidence
- Provenance IDs

Evidence never stores provider payloads.

Evidence belongs to exactly one Snapshot.

---

# Snapshot Evidence Support Table

Stores canonical evidence support targets.

Supports are separated because:

one evidence may support many conclusions,

many evidence items may support one conclusion.

Supports remain immutable.

---

# Snapshot Provenance Sources Table

Stores normalized source references.

Responsibilities:

- Source identity
- Source provider
- URL
- Capture timestamp
- Source metadata

Raw provider payloads are forbidden.

---

# Snapshot Evidence Lineage Table

Stores evidence lineage.

Responsibilities:

- provenance relationships
- parent evidence
- derived evidence
- lineage metadata

Supports complete reconstruction.

---

# Snapshot Engine Attribution Table

Stores engine attribution.

Responsibilities:

- originating engine
- intelligence engine
- section ownership
- engine version

No provider implementation details are stored.

---

# Snapshot Processing History Table

Stores processing history.

Responsibilities:

- processing steps
- timestamps
- execution status

Never stores prompts.

Never stores raw provider responses.

---

# Snapshot Validation Table

Stores validation metadata.

Responsibilities:

- validation result
- validation version
- validation summary
- validation diagnostics

Validation metadata never becomes business intelligence.

---

# Primary Keys

Every table owns a surrogate database key.

Business identity remains Snapshot ID.

Database keys exist only for relational efficiency.

---

# Foreign Keys

Every table references Snapshot Identity.

Relationships are ownership relationships.

Deleting a Snapshot should require explicit administrative action.

Normal application flow never deletes historical Snapshots.

---

# Unique Constraints

The schema must guarantee:

one Snapshot ID,

one Idempotency Key,

deterministic storage identity,

no duplicated Snapshot persistence.

---

# Transaction Strategy

Persisting a Snapshot writes every table inside one transaction.

Partial commits are forbidden.

Rollback must restore the previous consistent state.

---

# Conflict Strategy

Repeated identical writes:

accepted.

Repeated conflicting writes:

rejected.

Conflict handling must remain deterministic.

---

# Read Strategy

Repository reads always begin from Snapshot Identity.

Related records are reconstructed through ownership relationships.

Knowledge Evolution never bypasses Snapshot Identity.

---

# Repository Ownership

The repository implementation owns:

database communication,

transactions,

retry logic,

conflict resolution,

database optimizations.

The repository never changes Snapshot semantics.

---

# RLS Strategy

Snapshot persistence is server-side.

Anonymous users:

no write access.

Authenticated users:

no write access.

Administrative persistence uses privileged credentials.

Future read permissions may expose derived information only.

---

# Index Strategy

Indexes must optimize:

Snapshot lookup,

Discovery lookup,

Idempotency lookup,

Evidence lookup,

Observation Extraction,

Knowledge Evolution reads.

Indexes never redefine business identity.

---

# Versioning Strategy

Historical versions remain permanently readable.

Schema evolution must preserve:

Snapshot Version,

Contract Version,

Normalization Version,

Confidence Version,

Engine Version.

---

# Migration Strategy

The first migration creates only Snapshot storage.

Knowledge Evolution tables are not created here.

Observation Extraction tables are not created here.

Analytics tables are not created here.

Feedback tables are not created here.

Each future subsystem owns its own migrations.

---

# Legacy Isolation

Existing production tables remain untouched.

Snapshot persistence uses independent storage.

Legacy Discovery remains authoritative until migration is explicitly approved.

---

# Future Extensions

Future storage groups may include:

Observation Extraction

Knowledge Evolution

Memory

Learning

Recommendations

Predictions

Analytics

Feedback

These extensions must never modify existing Snapshot semantics.

---

# Non Goals

This document does not define:

SQL syntax

repository implementation

Supabase client code

API routes

Discovery execution

Knowledge Evolution algorithms

Memory

Learning

Recommendations

Analytics

---

# Architectural Invariants

One Snapshot generates one storage group.

Storage is immutable.

Storage is append-only.

Storage is deterministic.

Storage is atomic.

Storage is provider-independent.

Historical reconstruction is always possible.

Knowledge Evolution is downstream.

Observation Extraction is downstream.

Repository implementation never changes Snapshot semantics.