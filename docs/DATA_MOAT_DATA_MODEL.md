# DATA_MOAT_DATA_MODEL

Version: 1.0

Status: Draft

Owner: SaaSScout Core Intelligence

---

# Purpose

This document defines the conceptual data model of the SaaSScout Data Moat.

It does not describe database tables or implementation details.

Instead, it defines the fundamental intelligence entities that exist inside the platform and how they relate to one another.

The objective is to ensure that future implementations preserve a consistent long-term intelligence model regardless of storage technology.

---

# Conceptual Model

The Data Moat is composed of five conceptual layers.

```
Discovery

↓

Snapshot

↓

Observation

↓

Knowledge

↓

Historical Intelligence
```

Each layer has a different responsibility.

---

# Layer 1 — Discovery

A Discovery is the execution of the Modular Intelligence Engine.

It is ephemeral.

It exists only during processing.

A Discovery is never persisted.

Its responsibility is to analyze market signals and produce structured intelligence.

Output:

- Problems
- Opportunities
- Scores
- Diagnostics
- Evidence
- Founder Intelligence

---

# Layer 2 — Snapshot

A Snapshot is an immutable representation of one Discovery.

Snapshots preserve exactly what SaaSScout knew at one moment in time.

Every successful Discovery generates one Snapshot.

Snapshots are historical records.

Snapshots are never modified.

---

## Snapshot Attributes

Every Snapshot should conceptually contain:

- Snapshot ID
- Timestamp
- Search Query
- Search Context
- Source List
- Problem Intelligence
- Opportunity Intelligence
- Founder Intelligence
- Quality Diagnostics
- Decision Diagnostics
- Confidence Metrics
- Engine Version
- Workflow Version
- Knowledge Version

---

## Snapshot Responsibilities

A Snapshot exists to:

- preserve history
- enable comparisons
- feed Knowledge Evolution
- support future analytics

Snapshots never make decisions.

They only preserve observations.

---

# Layer 3 — Observation

An Observation is the smallest unit of persisted intelligence.

Examples include:

Problem detected

Pain score

Competition score

Founder score

Evidence reference

Affected niche

Business model

Trend signal

Every Observation belongs to exactly one Snapshot.

Multiple Snapshots may produce equivalent Observations.

---

## Observation Attributes

Conceptually an Observation contains:

- Observation ID
- Snapshot ID
- Observation Type
- Observation Value
- Confidence
- Evidence References
- Timestamp
- Originating Engine
- Version

---

## Observation Principles

Observations never overwrite previous observations.

New observations increase historical knowledge.

---

# Layer 4 — Knowledge

Knowledge is derived.

Knowledge is never entered manually.

Knowledge is produced by comparing multiple Observations.

Example

Observation

Pain = 6

↓

Observation

Pain = 8

↓

Observation

Pain = 9

↓

Knowledge

Pain is increasing.

Knowledge represents long-term understanding rather than individual events.

---

## Knowledge Node

Every important concept eventually becomes a Knowledge Node.

Examples:

Manual Sales Automation

Healthcare CRM

Invoice Approval

Lead Qualification

Customer Retention

Knowledge Nodes aggregate multiple observations.

---

## Knowledge Node Attributes

Conceptually:

- Node ID
- Canonical Title
- Description
- Confidence
- Frequency
- Stability
- First Seen
- Last Seen
- Observation Count
- Related Markets
- Related Niches
- Related Evidence

---

# Layer 5 — Historical Intelligence

Historical Intelligence describes how Knowledge evolves.

Examples:

Pain trend

Competition trend

Market maturity

Founder trend

Business model evolution

Signal stability

Emerging opportunity

Declining opportunity

Historical Intelligence is always derived.

It is never manually stored.

---

# Entity Relationships

Conceptually the relationships are:

```
Discovery

↓

Snapshot

↓

Observation

↓

Knowledge Node

↓

Historical Intelligence
```

One Discovery

creates

One Snapshot

---

One Snapshot

contains

Many Observations

---

Many Observations

strengthen

One Knowledge Node

---

Many Knowledge Nodes

generate

Historical Intelligence

---

# Conceptual Entity Definitions

## Discovery

Ephemeral execution.

Never persisted.

---

## Snapshot

Immutable historical record.

Persisted.

---

## Observation

Smallest persisted intelligence unit.

Persisted.

---

## Knowledge Node

Accumulated market understanding.

Persisted.

---

## Historical Intelligence

Derived historical interpretation.

Generated.

---

# Versioning

Every persisted entity should preserve version metadata.

Conceptually:

Engine Version

Workflow Version

Knowledge Version

Schema Version

Future migrations should never invalidate historical intelligence.

---

# Confidence

Confidence exists at multiple layers.

Observation Confidence

↓

Knowledge Confidence

↓

Historical Confidence

Confidence should become stronger as evidence accumulates.

---

# Evidence

Every Observation should maintain references to supporting evidence.

Evidence may originate from:

Search Engines

X

Reddit

News

Knowledge Evolution

Future Validation Engine

Evidence itself is not knowledge.

Evidence supports knowledge.

---

# Identity

Every entity must preserve a stable identity.

Examples

Snapshot ID

Observation ID

Knowledge Node ID

Identity must never depend on ordering or runtime execution.

---

# Immutability Rules

Discovery

Mutable during execution.

Never persisted.

---

Snapshot

Immutable.

Never edited.

---

Observation

Immutable.

Never edited.

---

Knowledge Node

May evolve.

History must remain preserved.

---

Historical Intelligence

Continuously recalculated.

Never rewrites historical observations.

---

# Lifecycle

```
Discovery

↓

Snapshot Created

↓

Observations Persisted

↓

Knowledge Updated

↓

Historical Intelligence Recalculated

↓

Future Modules Consume Knowledge
```

---

# Future Consumers

The following systems will consume the Data Moat.

Founder Intelligence 2.0

Memory

Validation Engine

Learning Engine

Recommendation Engine

Trend Detection

Opportunity Ranking

Historical Comparison

Predictive Intelligence

---

# Non Goals

The Data Model is NOT intended to describe:

Database schema

SQL tables

Indexes

Storage providers

Supabase implementation

Caching

API contracts

These belong to implementation documents.

---

# Success Criteria

The Data Model will be considered successful when:

Every Discovery maps cleanly into one Snapshot.

Every Snapshot produces structured Observations.

Observations accumulate into Knowledge Nodes.

Knowledge Nodes generate Historical Intelligence.

Future intelligence modules can consume knowledge without depending on the Discovery Engine.

The conceptual model remains independent from storage technology.

---

# Final Statement

The Data Model defines how SaaSScout understands markets.

Discoveries are temporary.

Snapshots preserve history.

Observations accumulate evidence.

Knowledge Nodes represent understanding.

Historical Intelligence explains change.

Together, these layers transform isolated analyses into a continuously expanding proprietary intelligence network that becomes more valuable with every discovery performed.