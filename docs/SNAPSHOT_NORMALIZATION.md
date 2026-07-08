# Snapshot Normalization

## Purpose

This document defines the canonical normalization process that transforms a Discovery result into a canonical Snapshot.

Normalization exists to guarantee that every Snapshot follows the same architectural contract regardless of:

- AI provider
- Discovery implementation
- Engine version
- Prompt strategy
- External data providers
- Internal intelligence pipeline

Normalization is an architectural responsibility.

It is not an implementation detail.

---

# Architectural Principle

The Discovery Engine produces intelligence.

The Snapshot Engine produces historical records.

Between both systems there must always exist a deterministic normalization step.

Discovery Output

↓

Normalization

↓

Canonical Snapshot

Normalization prevents implementation details from leaking into the Data Moat.

---

# Why Normalization Exists

Different Discovery engines may produce:

- different field names
- different score ranges
- different evidence formats
- different confidence formats
- different metadata
- different diagnostics

The Data Moat must never depend on those differences.

Normalization guarantees that every Snapshot has the same meaning independently of how Discovery was implemented.

---

# Normalization Goals

Normalization must:

- standardize intelligence
- remove transient implementation details
- preserve business meaning
- preserve traceability
- preserve provenance
- preserve determinism
- preserve compatibility

Normalization must never invent intelligence.

---

# Inputs

Normalization receives a completed Discovery result.

The Discovery result is considered immutable.

Normalization must never modify the original Discovery output.

Instead, it creates a new canonical Snapshot.

---

# Outputs

Normalization produces exactly one canonical Snapshot.

Every successful Discovery generates one Snapshot.

No additional interpretation occurs during normalization.

---

# Architectural Flow

Discovery Result

↓

Validation

↓

Normalization

↓

Canonical Snapshot

↓

Snapshot Validation

↓

Snapshot Persistence

↓

Observation Extraction

---

# Normalization Responsibilities

Normalization is responsible for:

- field standardization
- canonical naming
- score normalization
- evidence normalization
- confidence normalization
- provenance normalization
- metadata generation
- version assignment

Normalization is NOT responsible for:

- generating intelligence
- correcting intelligence
- improving intelligence
- ranking opportunities
- learning
- updating knowledge
- persistence
- recommendation generation

---

# Canonical Naming

Discovery implementations may use different names for equivalent concepts.

Normalization converts them into one canonical vocabulary.

For example:

Opportunity Score

Business Score

Potential Score

↓

Opportunity Score

Likewise:

Pain

Problem

Need

↓

Problem

The canonical vocabulary belongs to the Snapshot Contract.

Discovery engines remain free to evolve independently.

---

# Score Normalization

Discovery engines may calculate scores differently.

Normalization standardizes score representation.

Normalization must never modify business meaning.

Normalization only guarantees consistent representation.

Future score evolution must be handled through versioning.

---

# Confidence Normalization

Confidence values produced by Discovery must be normalized into a consistent conceptual format.

Normalization does not recalibrate confidence.

It only guarantees that future systems consume confidence consistently.

---

# Evidence Normalization

Evidence is one of the most important normalization responsibilities.

Normalization preserves:

- evidence references
- evidence origin
- evidence identifiers
- evidence relationships

Normalization must never preserve raw provider payloads.

Evidence should remain provider-independent.

---

# Provenance Normalization

Every important intelligence artifact must preserve provenance.

Normalization guarantees that every Snapshot can explain:

- where intelligence came from
- which Discovery produced it
- which engine generated it
- which evidence supports it

Missing provenance must cause validation failure.

---

# Metadata Normalization

Metadata generated during normalization includes concepts such as:

- Snapshot Identifier
- Discovery Identifier
- Contract Version
- Engine Version
- Creation Timestamp
- Lifecycle State

Metadata exists only for traceability.

It never modifies intelligence.

---

# Version Assignment

Normalization assigns the Snapshot Contract version.

Future systems may also assign:

- Normalization Version
- Confidence Version
- Intelligence Version

Version assignment allows historical Snapshots to remain valid indefinitely.

---

# Unknown Fields

Discovery engines may generate additional information over time.

Normalization follows the following rule:

Known fields

↓

Canonical Snapshot

Unknown fields

↓

Ignored or explicitly preserved for future compatibility according to Snapshot Contract policy.

Unknown fields must never silently redefine Snapshot semantics.

---

# Missing Fields

Normalization never fabricates missing intelligence.

If required information is absent:

Snapshot Validation determines whether the Snapshot remains valid.

Normalization does not guess.

---

# Determinism

Normalization must always be deterministic.

Identical Discovery results must produce identical Snapshots.

Normalization must never depend on:

- execution order
- infrastructure
- timestamps (except metadata)
- randomness
- LLM generation
- network conditions

Determinism is mandatory.

---

# Provider Independence

Normalization removes provider-specific concepts.

The Snapshot must never expose:

- OpenAI-specific structures
- Claude-specific structures
- Gemini-specific structures
- Reddit payloads
- X payloads
- SerpAPI payloads
- GitHub payloads

Providers are implementation details.

Snapshots are provider-independent.

---

# Discovery Independence

Normalization protects the Data Moat from Discovery evolution.

Discovery may evolve.

Discovery may be rewritten.

Discovery may use different models.

Discovery may introduce new engines.

Normalization guarantees that historical Snapshots remain compatible.

---

# Observation Compatibility

Normalization prepares the Snapshot for future Observation extraction.

It does not perform Observation extraction.

Observation extraction is a downstream responsibility.

Normalization must preserve enough information for future extraction without embedding Observation logic.

---

# Knowledge Compatibility

Normalization prepares historical intelligence.

It never creates Knowledge Nodes.

Knowledge Evolution owns that responsibility.

---

# Memory Compatibility

Future Memory systems consume normalized Snapshots.

Normalization therefore guarantees:

- stable field meanings
- stable relationships
- stable metadata
- stable provenance

Memory never depends on Discovery implementation.

---

# Learning Compatibility

Learning systems require comparable historical intelligence.

Normalization guarantees structural consistency.

Learning determines behavioral improvements.

Normalization never learns.

---

# Recommendation Compatibility

Recommendation systems consume normalized historical intelligence.

Normalization guarantees consistency.

Recommendation engines remain independent.

---

# Architectural Invariants

## Invariant 1

Normalization never changes business meaning.

---

## Invariant 2

Normalization never invents intelligence.

---

## Invariant 3

Normalization never removes provenance.

---

## Invariant 4

Normalization never preserves provider-specific structures.

---

## Invariant 5

Normalization never performs learning.

---

## Invariant 6

Normalization never performs persistence.

---

## Invariant 7

Normalization is deterministic.

---

## Invariant 8

Normalization preserves compatibility across Discovery versions.

---

## Invariant 9

Normalization must be independent of AI providers.

---

## Invariant 10

Normalization prepares intelligence for the Data Moat but never modifies the Data Moat itself.

---

# Relationship with Future Layers

Normalization serves every future subsystem equally.

Snapshot

↓

Observation

↓

Knowledge Evolution

↓

Memory

↓

Learning

↓

Recommendation

↓

Prediction

No downstream layer should require knowledge of the original Discovery implementation.

---

# Success Criteria

The normalization architecture is considered successful when:

- any Discovery implementation can generate the same canonical Snapshot;
- Snapshots remain stable across engine upgrades;
- providers remain replaceable without architectural impact;
- historical Snapshots never require migration because of Discovery implementation changes;
- downstream systems consume canonical intelligence without provider-specific assumptions.

Normalization is therefore the architectural boundary that permanently decouples Discovery from the Data Moat.