# Server-Owned Idea Validation Engine

## Investigation findings

### Current opportunity representations

- Results represents opportunities from completed Scan output and generated `opportunities` rows. Existing display logic uses legacy score fields and scan evidence, but it does not own a reusable validation contract.
- Discover represents opportunities as accepted `discovered_problems`, discovery runs, Problem Intelligence summaries, and founder matches. It includes product-facing heuristic scores such as pain, revenue, urgency, buying signal, frequency, source quality, and opportunity score.
- Saved ideas represent user intent through `saved_ideas` rows linked to an opportunity identifier. They are a user-owned signal but are not evidence by themselves unless connected to Scan, Discover, Weekly, or opportunity context.
- Weekly Intelligence represents opportunities as weekly detected problems and source evidence derived from the Data Moat Aggregation Layer. Weekly interpretation and persistence remain outside aggregation.
- Problem Intelligence is shared market knowledge. It may be read as supplementary shared context through aggregation, but it must not become private user evidence or be modified by validation.

### Duplicated evaluation logic and heuristics

- Results, Discover, and Weekly each compute or present confidence-like labels independently.
- Discover combines persisted score fields and founder-fit weighting for presentation ranking.
- Scan and Discover normalize legacy opportunity scores separately from engine confidence scoring.
- The reusable gap was an objective, server-owned read-side validation engine that consumes normalized user-owned evidence before any LLM explanation.

### Aggregated evidence available today

`aggregateUserDataMoat()` already exposes completed scans, generated opportunities, Discover history, accepted Discover problems, saved ideas, Weekly reports, snapshots, and historical user evidence as normalized user-owned items. It also returns shared Problem Intelligence separately as supplementary context with server diagnostics.

### Conservative metadata extensions

The aggregation item metadata now preserves bounded scalar Discover score fields and `problemCluster` for accepted Discover problems. These fields are reusable evidence metadata and do not change ownership, persistence, learning, or UI contracts.

## Validation architecture before

Idea validation was implicit and distributed across UI/workflow-specific score presentation. No reusable server-owned engine evaluated a proposed idea against the user's normalized evidence corpus.

## Validation architecture after

The Beta validation engine is a read-only server module. It calls the Data Moat Aggregation Layer, filters normalized user-owned evidence, calculates supporting and contradictory signals deterministically, derives confidence from measurable inputs, and returns a normalized validation result. Internal diagnostics are available to server callers and can be stripped before public exposure.

## Evidence model

The engine evaluates:

- independent related mentions;
- diversity across normalized Data Moat sources;
- recurrence across UTC month windows;
- supporting Scan, Discover, opportunity, saved idea, Weekly, snapshot, and user activity signals;
- contradictory language or rejected status signals;
- freshness from the latest related evidence timestamp;
- bounded signal strength derived from source weight, textual overlap, and normalized score metadata.

## Confidence calculation

Confidence is deterministic. Supporting evidence count, source diversity, recurrence, freshness, and signal strength increase confidence. Contradictory signal count and contradictory strength reduce confidence. Empty evidence returns `insufficient_evidence` with zero confidence.

## Read-only boundary

The engine does not insert, update, delete, upsert, call LLMs, compute embeddings, activate Data Moat learning, persist validation outcomes, or modify Problem Intelligence.

## Compatibility

This implementation does not redesign Dashboard, Results, Discover, Weekly UI, saved ideas UI, Scan workflow, or Data Moat learning. Existing consumers can migrate incrementally in future PRs.
