# SNAPSHOT_ENGINE_DESIGN

Version: 1.0

Status: Draft

Owner: SaaSScout Core Intelligence

---

# Purpose

The Snapshot Engine is responsible for transforming every successful Discovery into an immutable historical Snapshot.

It is the first implementation component of the Data Moat.

Its responsibility is not to generate intelligence.

Its responsibility is to preserve intelligence.

The Snapshot Engine is the bridge between the stateless Modular Intelligence Engine and the stateful Data Moat.

---

# Responsibilities

The Snapshot Engine has five responsibilities.

1.

Receive the final output of the Discovery workflow.

2.

Normalize the intelligence.

3.

Build an immutable Snapshot.

4.

Persist the Snapshot.

5.

Trigger Knowledge Evolution.

Nothing else.

---

# Non Responsibilities

The Snapshot Engine does NOT:

Generate intelligence.

Modify intelligence.

Rank opportunities.

Learn from history.

Update production behavior.

Make business decisions.

Those responsibilities belong to other modules.

---

# Position inside SaaSScout

```
Discovery Workflow

↓

Modular Engine

↓

Snapshot Engine

↓

Data Moat

↓

Knowledge Evolution

↓

Historical Intelligence
```

The Snapshot Engine is the gateway into the Data Moat.

---

# Trigger

A Snapshot is created only when:

The Discovery Workflow finishes successfully.

Quality Gates have passed.

Diagnostics have completed.

Decision Layer has completed.

Persistence planning has completed.

Knowledge Evolution is ready.

Failed Discoveries never generate Snapshots.

---

# Snapshot Lifecycle

```
Discovery Completed

↓

Normalize Intelligence

↓

Build Snapshot

↓

Validate Snapshot

↓

Persist Snapshot

↓

Emit Snapshot Created Event

↓

Knowledge Evolution

↓

End
```

Each stage must complete successfully before moving to the next.

---

# Snapshot Creation Pipeline

## Stage 1

Receive Discovery Output.

Inputs include:

Problem Intelligence

Opportunity Intelligence

Founder Intelligence

Diagnostics

Scores

Evidence

Versions

---

## Stage 2

Normalize.

The Snapshot Engine converts engine output into canonical structures.

Normalization should remove transient implementation details.

Normalization must be deterministic.

---

## Stage 3

Build Snapshot.

The Snapshot object is assembled.

The Snapshot contains only structured intelligence.

---

## Stage 4

Validate Snapshot.

Validation confirms:

Required fields exist.

Versions exist.

Confidence values exist.

Evidence references exist.

Identifiers are stable.

Invalid Snapshots are rejected.

---

## Stage 5

Persist Snapshot.

Persistence occurs only after validation succeeds.

Persistence failures never corrupt existing knowledge.

---

## Stage 6

Emit Snapshot Event.

The Snapshot Engine emits a domain event.

Example:

SnapshotCreated

Knowledge Evolution consumes this event.

Future modules may subscribe.

---

# Snapshot Contents

Every Snapshot should conceptually contain:

Snapshot Metadata

Search Metadata

Source Metadata

Problem Intelligence

Opportunity Intelligence

Founder Intelligence

Evidence References

Scores

Confidence

Diagnostics

Versions

Quality Metrics

Decision Metrics

---

# Metadata

Conceptual metadata includes:

Snapshot ID

Timestamp

Search Query

Search Context

Discovery Version

Engine Version

Workflow Version

Knowledge Version

---

# Validation Rules

Every Snapshot must satisfy:

Unique Snapshot ID.

Immutable timestamp.

Stable versions.

Valid evidence references.

Confidence values.

Quality diagnostics.

Decision diagnostics.

Snapshots failing validation are never persisted.

---

# Idempotency

The Snapshot Engine must be idempotent.

Repeated processing of the same Discovery must never create inconsistent history.

Duplicate processing should be safely ignored or explicitly versioned.

---

# Error Handling

Failures should be isolated.

Possible failure stages include:

Normalization Failure

Validation Failure

Persistence Failure

Knowledge Evolution Failure

Failures must never corrupt previous Snapshots.

---

# Retry Strategy

Persistence may retry.

Normalization should not retry automatically.

Validation failures require correction.

Knowledge Evolution retries independently.

---

# Transaction Boundaries

Snapshot persistence and Knowledge Evolution are independent.

Knowledge Evolution failure must never invalidate a persisted Snapshot.

Snapshots are considered durable immediately after persistence.

---

# Version Compatibility

Every Snapshot preserves:

Engine Version

Workflow Version

Knowledge Version

Future migrations must remain backward compatible.

Historical Snapshots must never become unreadable.

---

# Events

Future domain events include:

SnapshotCreated

SnapshotValidated

SnapshotPersisted

SnapshotRejected

KnowledgeEvolutionStarted

KnowledgeEvolutionCompleted

These events are conceptual and implementation-independent.

---

# Security

Snapshots never store:

Raw prompts

LLM conversations

Chain-of-thought

Temporary reasoning

Secrets

API keys

Transient debugging information

Only structured intelligence is persisted.

---

# Observability

The Snapshot Engine should expose diagnostics for:

Snapshots created

Snapshots rejected

Validation failures

Persistence failures

Average creation time

Average persistence time

Version distribution

Engine distribution

These metrics support future monitoring.

---

# Architectural Invariants

The following rules must never be violated.

A Snapshot is immutable.

Snapshots are historical records.

The Snapshot Engine never modifies intelligence.

Knowledge Evolution never edits Snapshots.

Snapshots always preserve provenance.

Snapshots always preserve version metadata.

The Snapshot Engine remains deterministic.

Persistence never changes production behavior.

---

# Integration with Knowledge Evolution

After persistence:

Snapshot

↓

Observation Extraction

↓

Knowledge Update

↓

Historical Intelligence

The Snapshot Engine never performs these operations directly.

It only initiates them.

---

# Future Integrations

The Snapshot Engine should eventually support:

Memory

Validation Engine

Learning Engine

Recommendation Engine

Predictive Intelligence

Historical Analytics

without requiring architectural changes.

---

# Success Criteria

The Snapshot Engine will be considered complete when:

Every successful Discovery produces exactly one immutable Snapshot.

No failed Discovery generates a Snapshot.

Snapshot validation is deterministic.

Snapshots preserve complete provenance.

Knowledge Evolution is triggered automatically.

No production behavior changes.

No historical information is overwritten.

---

# Final Statement

The Snapshot Engine is the entry point of the SaaSScout Data Moat.

The Modular Engine discovers.

The Snapshot Engine preserves.

Knowledge Evolution learns.

Historical Intelligence understands change.

By separating these responsibilities, SaaSScout ensures that intelligence generation remains stateless while accumulated market knowledge grows safely, deterministically, and indefinitely over time.