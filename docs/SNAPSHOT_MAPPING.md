# Snapshot Mapping

## Purpose

This document defines the canonical architectural mapping between the Discovery Engine output and the Snapshot Contract.

Its purpose is to establish a deterministic transformation contract that remains stable regardless of:

- Discovery implementation
- AI model
- Prompt strategy
- Intelligence engine evolution
- Provider integrations
- Future Data Moat implementations

This document is conceptual.

It intentionally does not define implementation details.

---

# Architectural Principle

Discovery generates intelligence.

The Snapshot preserves intelligence.

The Snapshot must never become a copy of the Discovery output.

Instead, Discovery intelligence is transformed into a canonical historical representation.

Discovery Output

↓

Canonical Mapping

↓

Canonical Snapshot

---

# Mapping Goals

The mapping process exists to:

- preserve business intelligence
- preserve historical meaning
- preserve traceability
- preserve provenance
- normalize structure
- isolate implementation details
- protect future compatibility

Mapping must never reinterpret intelligence.

---

# Mapping Flow

Discovery

↓

Normalization

↓

Canonical Mapping

↓

Snapshot

↓

Validation

↓

Persistence

↓

Observation Extraction

↓

Knowledge Evolution

---

# Mapping Rules

Every Snapshot section has exactly one source of truth.

Each Discovery concept must map to exactly one canonical Snapshot responsibility.

No Discovery concept should belong to multiple Snapshot sections.

---

# Snapshot Metadata Mapping

Discovery execution metadata

↓

Snapshot Metadata

Metadata includes conceptual information such as:

- Snapshot Identifier
- Discovery Identifier
- Creation Timestamp
- Contract Version
- Lifecycle State

Business intelligence must never be stored inside Metadata.

---

# Discovery Context Mapping

Discovery execution context

↓

Discovery Context

Examples include:

- search topic
- search language
- requested market
- requested audience
- discovery mode
- source providers
- execution configuration

Context describes the environment.

It never becomes business knowledge.

---

# Problem Intelligence Mapping

Problem-related Discovery output

↓

Problem Intelligence

Conceptual examples include:

- problem title
- summary
- pain
- urgency
- frequency
- affected market
- affected audience
- workarounds

Problem Intelligence represents the market problem only.

It must never contain opportunity reasoning.

---

# Opportunity Intelligence Mapping

Opportunity-related Discovery output

↓

Opportunity Intelligence

Conceptual examples include:

- opportunity score
- business opportunity
- monetization
- market attractiveness
- build simplicity
- willingness to pay
- opportunity rationale

Opportunity Intelligence explains why the problem represents an opportunity.

It does not recommend what should be built.

---

# Founder Intelligence Mapping

Founder-related Discovery output

↓

Founder Intelligence

Conceptual examples include:

- founder score
- founder fit
- execution difficulty
- technical alignment
- founder advantages
- founder risks

Founder Intelligence evaluates compatibility.

It never changes Problem Intelligence or Opportunity Intelligence.

---

# Evidence Mapping

Discovery evidence

↓

Evidence

Evidence includes conceptual references such as:

- supporting signals
- supporting observations
- evidence references
- source identifiers
- confidence rationale

Evidence preserves support.

It never stores raw provider payloads.

---

# Confidence Mapping

Discovery confidence

↓

Confidence

Confidence preserves:

- overall confidence
- evidence confidence
- opportunity confidence
- founder confidence

Confidence is descriptive.

It is never prescriptive.

---

# Diagnostics Mapping

Discovery diagnostics

↓

Diagnostics

Examples include:

- quality metrics
- validation metrics
- engine diagnostics
- processing metrics
- warning codes
- decision diagnostics

Diagnostics remain separated from business intelligence.

---

# Version Mapping

Discovery version information

↓

Versions

Conceptually includes:

- Contract Version
- Engine Version
- Intelligence Version
- Normalization Version
- Confidence Version

Versioning exists exclusively for compatibility.

---

# Provenance Mapping

Discovery provenance

↓

Provenance

Conceptually preserves:

- evidence origin
- engine attribution
- source references
- processing lineage

Every important Snapshot conclusion must preserve provenance.

---

# Fields That Must Never Be Mapped

The following Discovery information must never become part of the Snapshot.

## Raw Provider Payloads

Examples:

- Reddit responses
- X responses
- SerpAPI responses
- GitHub payloads
- Product Hunt payloads

These remain implementation details.

---

## Prompt Content

Prompt engineering is not historical intelligence.

Prompt history must never be persisted.

---

## AI Provider Metadata

Provider-specific response structures must never enter the Snapshot.

Examples:

- token usage
- provider request IDs
- provider-specific reasoning
- model formatting

---

## Temporary Processing State

Temporary execution information is never historical intelligence.

Examples:

- intermediate objects
- parser state
- retry counters
- cache entries

---

## UI Information

Presentation details never belong inside the Snapshot.

Examples:

- colors
- layout
- formatting
- sorting
- pagination
- rendering state

---

# One-Way Mapping

The Snapshot Contract is intentionally one-way.

Discovery

↓

Snapshot

The reverse transformation is not guaranteed.

Snapshots preserve intelligence.

They do not preserve Discovery implementation.

---

# Canonical Responsibilities

Every Discovery concept has exactly one destination.

| Discovery Concept | Canonical Snapshot Section |
|-------------------|---------------------------|
| Discovery execution | Metadata |
| Search configuration | Discovery Context |
| Market problem | Problem Intelligence |
| Business opportunity | Opportunity Intelligence |
| Founder evaluation | Founder Intelligence |
| Supporting evidence | Evidence |
| Confidence | Confidence |
| Technical metrics | Diagnostics |
| Version information | Versions |
| Traceability | Provenance |

No Discovery concept should appear in multiple Snapshot sections.

---

# Compatibility Rules

Future Discovery engines may:

- introduce new fields
- rename fields
- improve intelligence
- change AI models
- change providers

The Mapping Contract protects the Snapshot from those changes.

Discovery evolves.

Snapshot semantics remain stable.

---

# Relationship with Observation Extraction

Observation Extraction consumes the Snapshot.

It does not consume Discovery.

Therefore:

Discovery

↓

Snapshot

↓

Observation Extraction

↓

Knowledge Evolution

The Snapshot is the permanent architectural boundary.

---

# Relationship with Knowledge Evolution

Knowledge Evolution consumes canonical Snapshot intelligence.

Knowledge Evolution must never depend on:

- Discovery implementation
- prompts
- providers
- engine internals

Only Snapshot semantics.

---

# Relationship with Memory

Memory consumes Snapshot-derived historical intelligence.

Memory must never require Discovery implementation details.

---

# Relationship with Learning

Learning consumes historical observations.

Learning never consumes raw Discovery output.

---

# Relationship with Recommendation

Recommendation engines consume accumulated intelligence.

Recommendations never depend directly on Discovery implementation.

---

# Architectural Invariants

## Invariant 1

Every Snapshot section has exactly one conceptual responsibility.

---

## Invariant 2

Every Discovery concept has exactly one canonical destination.

---

## Invariant 3

Mapping never changes business meaning.

---

## Invariant 4

Mapping never invents intelligence.

---

## Invariant 5

Mapping never removes provenance.

---

## Invariant 6

Mapping never stores provider-specific structures.

---

## Invariant 7

Mapping never stores prompt history.

---

## Invariant 8

Mapping never stores UI information.

---

## Invariant 9

Mapping is deterministic.

---

## Invariant 10

Mapping is implementation-independent.

---

## Invariant 11

Snapshot semantics must remain stable even if the Discovery Engine is completely replaced.

---

## Invariant 12

Observation Extraction, Knowledge Evolution, Memory, Learning, Recommendation and future engines must depend exclusively on the Snapshot Contract.

---

# Success Criteria

The Snapshot Mapping architecture is considered successful when:

- every Discovery execution can be deterministically transformed into one canonical Snapshot;
- Snapshot semantics remain stable across future engine versions;
- Discovery implementations remain replaceable without affecting the Data Moat;
- downstream systems consume only canonical Snapshot intelligence;
- historical intelligence remains independent of providers, prompts and implementation details.

The Snapshot Mapping Contract is therefore the permanent architectural boundary between the Stateless Modular Intelligence Engine and the Stateful Data Moat.