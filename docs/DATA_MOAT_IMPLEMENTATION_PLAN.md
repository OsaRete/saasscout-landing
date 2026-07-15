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

---

# Snapshot Retrieval Engine — PR 2 Server-only Supabase Repository

Status:

Implemented, not active in production workflow.

Scope:

- Added a server-only Supabase Snapshot retrieval repository for internal user-scoped candidate retrieval.
- Ownership is enforced by resolving `opportunity_discoveries.id` rows where `opportunity_discoveries.user_id` matches the requested user, then reading Snapshots through `snapshot_identities.discovery_id` only for those owned discoveries.
- Discovery-scoped retrieval remains user-scoped: a provided discovery ID is only accepted when it belongs to the same requested user.
- Organization-scoped retrieval is explicitly unsupported until a verified organization ownership boundary exists in the schema.
- Global retrieval and global influence remain prohibited.

Production behavior:

- The repository is not integrated into `discover-opportunities-workflow.ts`.
- Retrieval does not influence prompts, LLM inputs, rankings, public API responses, or user-visible output.
- No production shadow mode or influence mode is activated by this phase.

Schema and operations:

- No schema migration is introduced in this phase.
- No Supabase migration, remote SQL, or database push is required.
- The repository performs read-only staged queries against existing Snapshot persistence tables and `opportunity_discoveries`.

Safety policy:

- The repository returns minimal safe candidate projections only.
- Raw Snapshot mappings, full diagnostics, provider payloads, prompts, AI responses, service credentials, and full provenance JSON are not returned.
- Malformed Snapshot rows are skipped with safe diagnostics rather than leaking raw payloads or failing the whole retrieval operation.

Next phase:

- Add controlled shadow-mode workflow integration behind explicit safeguards, without prompt influence, before any future production influence path is considered.

---

# Snapshot Retrieval Shadow Integration

Status:

Implemented in shadow mode only.

Scope:

- The Discovery workflow now has a server-side integration point for user-scoped Snapshot retrieval.
- Retrieval is disabled by default and controlled only by `SNAPSHOT_RETRIEVAL_MODE`.
- Accepted modes are `disabled` and `shadow`; `influence` is not enabled.
- In `shadow` mode, retrieval reads historical Snapshots scoped to the authenticated user.
- Retrieved historical context is used only for safe operational metrics.
- Retrieved context is discarded before AI analysis.
- Retrieved context is not injected into prompts.
- Retrieved context is not returned through public APIs.
- Retrieved context is not shown in the UI.
- Retrieved context is not persisted into legacy tables or attached to new Snapshots.
- Retrieval failures are non-disruptive and must not block Discovery or Snapshot persistence.

Operational behavior:

- Production remains unchanged while the mode is missing or set to any invalid value.
- `disabled` mode avoids creating the Supabase retrieval repository and avoids admin-client creation for retrieval.
- `shadow` mode logs only structured safe metrics: mode, query fingerprint, ownership scope, candidate count, result count, top scores, duration, status, and warning count.
- Raw query text, historical context, evidence claims, source URLs, service keys, prompts, and AI output must not be logged.

Next phase:

Before Knowledge Fusion or prompt influence is considered, the next phase must validate retrieval quality, ownership isolation, malformed-row behavior, and operational metrics in controlled review. This phase must not claim user-result improvement yet because retrieval remains diagnostic-only.

---

# Discover Opportunities Snapshot Lifecycle Alignment

Status:

Implemented for newly produced Discover Opportunities Snapshots only.

Scope:

- The Discover Opportunities Snapshot producer now explicitly marks its canonical Snapshot metadata lifecycle as `validated` after the producer-owned Snapshot pipeline accepts validation before persistence input is created.
- Retrieval eligibility remains limited to `validated` and `persisted` lifecycle states; `created` Snapshots remain excluded and must not become retrievable.
- Existing immutable Snapshot rows whose lifecycle was previously stored as `created` are not modified, backfilled, updated, deleted, or relabeled.
- Only newly produced Discover Opportunities Snapshots receive the corrected lifecycle value at the producer boundary.
- Remote smoke testing requires creating a new Discovery so the new immutable Snapshot identity is written with `validated` lifecycle from the beginning.

---

## Snapshot Retrieval Quality Calibration and Shadow Observability

Status:

Implemented as diagnostic-only Shadow Retrieval support.

Scope:

- Adds deterministic relevance diagnostics over existing Snapshot Retrieval score breakdowns.
- Adds duplicate candidate diagnostics after repository retrieval and before/after ranking observation.
- Adds score distribution diagnostics for ranked shadow results.
- Adds a safe top-result aggregate breakdown for operator review.
- Adds a deterministic non-reversible `discoveryExecutionFingerprint` for shadow-run correlation.
- Adds a pure calibration summary helper for tests and future operator tooling.

Production behavior:

- Retrieval remains shadow-only and non-influential.
- No candidate filtering is introduced.
- No ranking weights are changed.
- Knowledge Fusion remains disabled.
- Historical Snapshot context is not injected into prompts.
- Public API responses and UI behavior remain unchanged.
- Snapshot persistence inputs remain unchanged.

Diagnostic relevance gate:

```text
hasThematicRelevance =
  queryTextMatch > 0
  || nicheOverlap > 0
  || clusterOverlap > 0
```

Evidence strength, Snapshot confidence, provenance diversity and freshness may explain quality-score lift, but they cannot create thematic relevance by themselves. This rule is diagnostic-only in this phase and must not filter or mutate retrieval candidates.

Classification thresholds:

- `strongly_related`: thematic relevance is present, total score is at least `0.60`, and at least one thematic factor is at least `0.50`.
- `partially_related`: thematic relevance is present and total score is at least `0.35`.
- `weakly_related`: thematic relevance is present and total score is greater than `0`.
- `not_relevant`: thematic factors are all `0`, including cases where evidence, confidence, provenance or freshness create quality-score lift.
- `empty`: no ranked result exists.

Safe aggregate observability fields:

Shadow logs may include only aggregate diagnostic fields:

- `event`
- `mode`
- `queryFingerprint`
- `discoveryExecutionFingerprint`
- `ownershipScope`
- `candidatesRead`
- `uniqueSnapshotCount`
- `duplicateCandidateCount`
- `resultsReturned`
- `topScores`
- `topResultBreakdown`
- `qualityClassification`
- `scoreDistribution`
- `durationMs`
- `status`
- `warningsCount`

Shadow logs must not include raw query text, raw user IDs, raw discovery IDs, Snapshot IDs, titles, summaries, claim snippets, source URLs, prompts, provider payloads, credentials or full historical context.

Discovery execution fingerprint limitation:

When a current discovery ID is not available at retrieval time, `discoveryExecutionFingerprint` is derived from the query fingerprint, reference timestamp and safe user scope material. It is deterministic for the same execution inputs but is not a database identity and must only be used for safe operational correlation.

Controlled benchmark protocol:

Run a controlled review set before considering any Knowledge Fusion or prompt influence:

- 3 strongly related Discoveries.
- 3 partially related Discoveries.
- 3 unrelated Discoveries.
- 1 near-duplicate Discovery.

For each run, record:

- `candidatesRead`
- top score
- `qualityClassification`
- `topResultBreakdown`
- `durationMs`
- duplicate count

Knowledge Fusion readiness must not be claimed until benchmark evidence exists and operator review is complete.

Future readiness criteria:

- No cross-user retrieval is observed.
- Critical warning count remains `0`.
- p95 retrieval latency is acceptable for the deployment target.
- Strongly related benchmark runs score and classify higher than unrelated runs.
- Unrelated top results classify as `not_relevant` or remain below an approved future threshold.
- `duplicateCandidateCount` remains `0` under normal retrieval.
- Public behavior parity remains intact.
- Operator review is completed and documented.

These criteria are future readiness criteria only. They are not production gates activated by this PR.

---

# Scan Safety and Quality Program — PR 2 Strict Structured Output Validation

Status:

Implemented for the existing Scan AI routes only.

Scope:

- Added a reusable strict validation boundary for `analyze-evidence` model output.
- Added a reusable strict validation boundary for `generate-opportunities` model output.
- Added a shared strict JSON extraction helper that accepts plain JSON or one complete fenced JSON block and rejects surrounding prose, multiple fences, malformed JSON, and empty responses.
- Removed route-level conversion of incomplete model output into plausible business intelligence defaults.
- Preserved the existing public successful response shapes for valid model output.
- Preserved the existing Untrusted Evidence Boundary prompt builders, model provider, model names, temperatures, token limits, authentication, route names, persistence consumers, and UI behavior.

Canonical Scan score range:

- The canonical API range for the current Scan AI routes remains **1 to 10**.
- This matches the existing Scan prompts, generated examples, opportunity detail display, and `confidence_score` usage.
- The results list currently renders opportunity scores with a `/100` presentation convention. This PR does not redesign UI score presentation; score-range UI harmonization remains a follow-up because this milestone is limited to server-side structured-output safety.
- The validation boundary rejects non-finite values and any confidence or opportunity score outside `1..10`.

Invalid-output failure policy:

- Invalid or incomplete model output is treated as a controlled model-output failure.
- The routes must not invent missing critical business intelligence.
- The routes must not return raw model content, prompts, evidence, source text, provider secrets, or private content to clients.
- Safe machine-readable categories are used for invalid output: `model_empty_response`, `model_invalid_json`, `model_schema_validation_failed`, and `model_output_out_of_range`.
- Sanitized server logs may include aggregate validation metadata such as route, prompt version, model, status, error code, invalid field count, and invalid field names only.

Fallback policy:

- Unsafe generic route fallbacks such as default confidence `7`, default opportunity score `7`, generic opportunity titles, generic MVPs, fixed `$19/mo` pricing, generic validation questions, generic roadmaps, and generic acquisition channels were removed from the Scan AI output boundary.
- Presentation-only UI fallbacks that operate after persisted data is already loaded are unchanged in this milestone and do not alter model-output validation.

Explicit non-goals for this milestone:

- No schema changes.
- No migrations.
- No remote SQL or database push.
- No UI redesign.
- No Scan Retrieval.
- No Knowledge Fusion.
- No Scan Snapshots.
- No server-side Scan orchestration migration.
- No claim-level grounding, evidence citations, confidence-calibration algorithm, solution-neutrality redesign, competitor analysis, or prompt-quality redesign.

Next milestone:

Grounding and evidence-reference contracts should define how Scan outputs cite and bind claims to evidence without exposing untrusted content as instructions. Scan output is safer after this milestone, but it is not yet fully Data-Moat-ready until grounding, evidence references, and later canonical Scan Artifact work are completed.

---

# Scan Grounding and Evidence Reference Milestone

Status:

Implemented as a compatibility-layer milestone for the Scan Safety and Quality Program.

Goal:

Establish a route-level and validation-level grounding contract for Scan AI outputs before any Scan result can be considered safe for canonical Data Moat knowledge.

Scope:

- Analyze Evidence and Generate Opportunities outputs now distinguish evidence-grounded claims from inference claims.
- Evidence-grounded claims must cite evidence IDs from the current prompt envelope.
- Inference claims must not cite evidence IDs and must include a short reason.
- Prior Analyze Evidence model output used by opportunity generation is treated as derived analysis context, not independent evidence.
- Grounding metadata is additive to existing route response shapes so existing UI and persistence mappings can continue using legacy fields.

Out of scope for this milestone:

- No database schema changes.
- No migration changes.
- No UI citation rendering.
- No Retrieval.
- No Knowledge Fusion.
- No Scan Snapshot persistence.
- No persistence of claim-level grounding metadata.

Current persistence position:

Grounding metadata is validated and may be returned by Scan AI routes, but it is not persisted as canonical Data Moat knowledge in this milestone. This protects the Data Moat from unsupported model-generated claims while preserving existing production behavior.

Next milestone:

Scan response quality diagnostics, confidence calibration, and solution neutrality should build on top of these grounding contracts without claiming that Scan output is Data-Moat-ready yet.
