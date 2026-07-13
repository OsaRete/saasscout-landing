# DATA_MOAT_IMPLEMENTATION_PLAN

Version: 1.0

Status: Planning

Owner: SaaSScout Core Intelligence

---

# Purpose

This document defines the implementation roadmap for the SaaSScout Data Moat.

Unlike the architectural documents, this file focuses on execution.

Its goal is to divide the implementation into small, independently verifiable milestones that minimize production risk and maximize long-term maintainability.

Every implementation phase must preserve existing production behavior unless explicitly approved.

---

# Guiding Principles

Implementation must follow these principles.

- Small Pull Requests.
- One responsibility per PR.
- No production behavior changes.
- Preserve backward compatibility.
- Preserve Data Moat ownership.
- Diagnostic-first development.
- Every stage must be testable independently.

---

# Current State

The Modular Intelligence Engine is operational.

Current capabilities include:

- Modular Discovery Orchestrator
- Problem Intelligence
- Solution Intelligence
- Founder Intelligence
- Decision Layer
- Quality Comparison
- Assisted Persistence Diagnostics
- Knowledge Evolution (legacy ownership)
- Diagnostic Shadow Comparison

Current production owner:

Legacy Discovery Pipeline

Current persistence mode:

Diagnostic Only

persistModular = false

productionBehaviorChanged = false

---

# Overall Roadmap

The implementation will be divided into independent phases.

```
Architecture

↓

Snapshot Engine

↓

Snapshot Validation

↓

Snapshot Persistence

↓

Knowledge Evolution Integration

↓

Memory Layer

↓

Learning Layer

↓

Recommendation Layer

↓

Predictive Intelligence
```

Each phase must be completed before the next begins.

---

# Phase 1

Snapshot Engine

Status:

Planned

Goal:

Create the Snapshot Engine responsible for constructing immutable Snapshot objects.

Scope:

Receive Discovery output.

Normalize intelligence.

Build Snapshot object.

No persistence.

No database writes.

No production changes.

Deliverables:

Snapshot Builder.

Snapshot Types.

Snapshot Metadata.

Snapshot Versioning.

Snapshot Diagnostics.

Exit Criteria:

Snapshot objects are deterministic.

No persistence occurs.

Tests pass.

---

# Phase 2

Snapshot Validation

Status:

Planned

Goal:

Validate every Snapshot before persistence.

Scope:

Required fields.

Metadata.

Version compatibility.

Confidence validation.

Evidence validation.

Identifier validation.

No persistence.

Deliverables:

Snapshot Validator.

Validation Diagnostics.

Validation Errors.

Exit Criteria:

Invalid Snapshots are rejected.

Valid Snapshots always pass.

---

# Phase 3

Snapshot Persistence

Status:

Planned

Goal:

Persist immutable Snapshots.

Scope:

Database persistence.

Idempotency.

Retry strategy.

Rollback safety.

No ownership changes.

Deliverables:

Snapshot Repository.

Persistence Layer.

Persistence Diagnostics.

Exit Criteria:

Snapshots are stored safely.

No duplicate history.

---

# Phase 4

Knowledge Evolution Integration

Status:

Planned

Goal:

Feed Knowledge Evolution using persisted Snapshots.

Scope:

SnapshotCreated event.

Observation extraction.

Knowledge updates.

No ownership migration.

Legacy remains authoritative.

Deliverables:

Snapshot Event.

Knowledge Integration.

Observation Pipeline.

Exit Criteria:

Knowledge Evolution consumes Snapshot events.

Legacy ownership remains unchanged.

---

# Phase 5

Memory Layer

Status:

Future

Goal:

Allow SaaSScout to remember historical market intelligence.

Scope:

Historical trends.

Repeated pain points.

Founder evolution.

Opportunity evolution.

Market evolution.

No LLM memory.

Only structured intelligence.

Deliverables:

Memory API.

Memory Queries.

Memory Context.

Historical Retrieval.

---

# Phase 6

Learning Layer

Status:

Future

Goal:

Allow SaaSScout to learn from accumulated observations.

Scope:

Pattern reinforcement.

Confidence evolution.

Signal weighting.

Market evolution.

Noise reduction.

Deliverables:

Learning Engine.

Learning Metrics.

Learning Diagnostics.

---

# Phase 7

Recommendation Layer

Status:

Future

Goal:

Generate recommendations using historical intelligence.

Examples:

Emerging opportunities.

Declining markets.

Repeated founder mistakes.

Opportunity validation.

Competition evolution.

Deliverables:

Recommendation Engine.

Recommendation Ranking.

Recommendation Diagnostics.

---

# Phase 8

Predictive Intelligence

Status:

Future

Goal:

Predict future opportunities using accumulated historical intelligence.

Examples:

Emerging trends.

Future niches.

Growing pain points.

Market acceleration.

Risk prediction.

Deliverables:

Predictive Engine.

Forecast Models.

Prediction Diagnostics.

---

# Pull Request Strategy

Every phase should be divided into small Pull Requests.

Example:

Phase 1

PR 1

Snapshot Types

PR 2

Snapshot Builder

PR 3

Snapshot Metadata

PR 4

Snapshot Diagnostics

PR 5

Tests

Only after all PRs pass should the next phase begin.

---

# Testing Strategy

Every implementation phase requires:

Unit Tests.

Integration Tests.

Regression Tests.

Diagnostic Tests.

No phase may proceed without passing all required tests.

---

# Safety Rules

The following rules are mandatory.

Never overwrite historical Snapshots.

Never modify immutable history.

Never enable modular persistence accidentally.

Never bypass validation.

Never change production behavior without explicit approval.

Never migrate ownership automatically.

Never remove rollback capability.

---

# Rollback Strategy

Every phase must support rollback.

Rollback must restore the previous stable state.

Rollback must never lose historical data.

Rollback must never corrupt the Data Moat.

---

# Production Gates

Before any production behavior changes, the following conditions must be satisfied.

Repeated-run stability.

Quality gates passing.

Shadow parity validated.

Knowledge Evolution verified.

Snapshot validation passing.

Persistence verified.

Explicit approval.

Until then:

persistModular remains false.

productionBehaviorChanged remains false.

Legacy remains authoritative.

---

# Success Criteria

The Data Moat implementation will be considered complete when:

Every Discovery creates an immutable Snapshot.

Historical intelligence is preserved.

Knowledge Evolution learns from Snapshots.

Memory retrieves historical context.

Learning continuously improves intelligence.

Recommendations use accumulated knowledge.

Predictions are based on historical evolution.

No production regressions occur.

No historical data is lost.

---

# Long-Term Vision

The Data Moat transforms SaaSScout from a system that analyzes today's market into a platform that understands how markets evolve over time.

Discovery finds opportunities.

Snapshots preserve history.

Knowledge Evolution extracts observations.

Memory remembers.

Learning improves.

Recommendations guide.

Prediction anticipates.

Together, these components create a compounding intelligence advantage that becomes stronger with every Discovery executed by the platform.
---

## Controlled Snapshot Persistence Integration Note

The first production Snapshot persistence integration is intentionally narrow and disabled by default.

- **First integrated producer:** `lib/intelligence/discover-opportunities-workflow.ts`, after external/Data Moat analysis completes and after the `opportunity_discoveries.id` row exists.
- **Feature flag:** `SNAPSHOT_PERSISTENCE_ENABLED`; persistence executes only when the value is exactly `1`.
- **Default rollout:** disabled in development, preview and production until a human explicitly configures the environment flag.
- **Identity invariant:** `discoveryId` is the persisted `opportunity_discoveries.id`; `snapshotId` is deterministically derived as `snapshot:discover-opportunities:${discoveryId}`; `createdAt` and processing timestamps come from the persisted discovery timestamp when available, with only the discovery execution start time as a pre-RPC fallback.
- **Idempotency invariant:** the persistence boundary retains `discoveryId:snapshotId:contractVersion` as the idempotency key through the existing Snapshot persistence contract.
- **Failure policy:** `inserted` and `replayed_identical` are successful; `rejected_conflict` is a hard integrity failure; transient infrastructure/RPC failures are logged with sanitized metadata and do not change the public discovery response during the initial controlled rollout.
- **Scope:** no UI changes, no schema changes, no migration changes, no remote Supabase SQL, and no automatic production activation.

Production Snapshot persistence is not active until `SNAPSHOT_PERSISTENCE_ENABLED=1` is explicitly configured by a human operator.

---

## Snapshot Retrieval Engine PR 1 — Foundational Contracts and Deterministic Ranking

Status: foundational implementation only; retrieval is **not active in production**.

This phase introduces the browser-safe Snapshot Retrieval core contracts, a deterministic lexical ranker, a redacted historical context builder, a pure repository boundary, and a server-only executor shell that only works with an injected repository. It does not include a Supabase repository, SQL, migrations, production data access, workflow integration, prompt influence, embeddings, vector search, UI behavior, public API behavior, or production retrieval activation.

### Deterministic V1 ranking formula

The V1 ranker computes normalized factors from 0 to 1 and combines them with fixed weights that sum to exactly 1:

```text
totalScore =
  0.30 * queryTextMatch
+ 0.20 * nicheOverlap
+ 0.15 * clusterOverlap
+ 0.15 * evidenceStrength
+ 0.10 * snapshotConfidence
+ 0.05 * provenanceDiversity
+ 0.05 * freshness
```

The ranker is deterministic: it uses lexical token overlap only, accepts an explicit reference timestamp for freshness, avoids randomness, avoids implicit wall-clock reads, and applies stable tie-breaking by total score, query text match, evidence strength, newer creation timestamp, then lexicographically smaller Snapshot ID.

### Ownership and influence limitation

The retrieval contracts preserve user, organization, and discovery scoping metadata, plus ownership diagnostics. However, influence mode remains a future contract value only. The current Snapshot persistence tables do not directly contain `user_id` or `organization_id`; ownership must be resolved through `snapshot_identities.discovery_id -> opportunity_discoveries.id -> opportunity_discoveries.user_id` in a later server-only repository PR before any production influence behavior can be considered.

### Next phases

1. Implement a server-only, user-scoped Supabase Snapshot Retrieval repository with explicit ownership enforcement and no global Snapshot influence.
2. Add production shadow-mode integration in a later PR after repository ownership validation.
3. Consider influence mode only after ownership, authorization, evaluation, and prompt-safety policies are approved.
