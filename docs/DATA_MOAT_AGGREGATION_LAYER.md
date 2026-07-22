# Data Moat Aggregation Layer

## Purpose

The Beta Data Moat Aggregation Layer is a server-owned, read-only contract for gathering user-owned product intelligence into one normalized shape.

It gathers existing SaaSScout signals without learning from them. It does not call LLMs, compute embeddings, update Problem Intelligence, score users, generate recommendations, or activate future Data Moat learning.

## First production consumer: Weekly Intelligence

Weekly Intelligence is the first production workflow that consumes the aggregation layer. The server-owned Weekly route authenticates the request, calculates the UTC weekly reporting period, calls `aggregateUserDataMoat` with the authenticated user ID, maps normalized aggregation items into Weekly evidence, and then applies Weekly interpretation, validation, and report persistence outside the aggregation layer.

The browser does not supply or control the user ID, reporting period, evidence records, ownership fields, or shared-context selection.

## Current duplicated retrieval flows

Before this layer, retrieval was distributed across product workflows:

- Dashboard independently reads `scan`, `opportunities`, `saved_ideas`, `weekly_reports`, and `weekly_niches`.
- Results independently reads `scan`, `opportunities`, `saved_ideas`, `evidence_analysis`, and `scan_sources`.
- Discover independently reads `opportunity_discoveries`, `discovered_problems`, `problem_intelligence`, and `founder_problem_matches`.
- Weekly Intelligence formerly read completed `scan` rows, completed `opportunity_discoveries`, `saved_ideas`, `discovery_actions`, prior `weekly_intelligence_runs`, and supplementary `problem_intelligence` directly. It now uses the aggregation layer for those evidence reads.
- Weekly UI independently reads `weekly_intelligence_runs`, `weekly_detected_problems`, and `weekly_sources` for display compatibility.
- Snapshot retrieval reads immutable Snapshot storage through the Snapshot retrieval repository.
- Knowledge Evolution reads historical observations separately from the user-facing workflows.

Common patterns were repeated: authenticate a user, filter user-owned tables by `user_id` or `owner_id`, filter lifecycle states such as `completed` or accepted Discover problems, order by recency, and then transform database rows into workflow-specific evidence objects.

## Aggregation contract

The aggregation service returns:

- `userId`: the authenticated server user whose data is being aggregated.
- `items`: normalized user-owned records, excluding shared context.
- `bySource`: normalized records grouped by source.
- `sharedContext`: optional supplementary shared aggregate records.
- `diagnostics`: server-side diagnostics describing queried sources, counts, skipped sources, duration, and normalization failures.

Each normalized item contains:

- `kind`
- `source`
- `id`
- `ownerId`
- `title`
- `summary`
- `occurredAt`
- optional `parentId`
- bounded scalar `metadata`

## Weekly source mapping

Weekly consumes normalized aggregation records as follows:

- `scan` from `completed_scans` becomes Weekly `scan` evidence.
- `opportunity` from `generated_opportunities` becomes Weekly `discover` evidence because it represents a generated opportunity signal.
- `discover_run` from `discover_history` becomes Weekly `discover` evidence.
- `discover_problem` from `accepted_discover_problems` becomes Weekly `discover` evidence.
- `saved_idea` from `saved_ideas` becomes Weekly `saved_idea` evidence.
- `user_activity` from `historical_user_evidence` becomes Weekly `conversion` evidence.
- `weekly_report` records are used as prior user-owned context only when they occurred before the active reporting period.
- `shared_problem_intelligence` remains in `sharedContext` and is never merged into user-owned evidence.

## Reporting-period filtering

Weekly applies its existing centralized period contract after aggregation:

- timezone: UTC;
- week starts Monday at 00:00 UTC;
- `period_start` is inclusive;
- `period_end` is exclusive.

Only normalized user-owned items whose `occurredAt` is inside `[period_start, period_end)` become current-week evidence. Items before the period, at `period_end`, after `period_end`, with invalid dates, or belonging to another user are excluded from current-week evidence.

Prior Weekly context is selected from aggregated user-owned Weekly reports before `period_start` and is passed to the prompt for continuity only.

## Separation between aggregation and interpretation

The aggregation layer gathers and normalizes evidence only. Weekly Intelligence interprets normalized evidence by building the Weekly prompt, validating model output, enforcing empty-evidence behavior, and persisting the weekly report.

No Weekly-specific prompt logic exists in the aggregation layer.

## Ownership guarantees

All private sources are filtered with the authenticated user identifier supplied by the server. The aggregation layer never accepts browser-provided ownership fields as authority.

Private rows whose owner does not match the authenticated user are excluded during normalization as a defensive second check.

## Shared context

Shared aggregate context is supplementary. It is returned separately from user-owned `items` and can be disabled by the caller. Shared context currently supports read-only Problem Intelligence summaries where repository rules permit authenticated shared reads.

Weekly obtains shared Problem Intelligence through `sharedContext`, labels it as optional shared aggregate context in the prompt, and must never treat it as private user activity. Shared context alone does not create personalized weekly problems.

## Read-only boundary

The aggregation layer performs only read queries. It does not insert, update, delete, call write RPCs, update Problem Intelligence, generate recommendations, call LLMs, compute embeddings, or activate Data Moat learning.

Weekly report persistence remains outside the aggregation layer.

## Compatibility and remaining independent reads

This PR keeps Scan, Discover, Results, Dashboard, Weekly UI, existing public API contracts, and current UI compatibility unchanged.

Weekly Intelligence no longer duplicates user-owned evidence reads for its generation workflow. Dashboard, Results, Discover, Weekly UI display reads, Snapshot retrieval, and Knowledge Evolution still use their existing independent read paths and can migrate incrementally in later PRs.

## Weekly Intelligence consolidation update — 2026-07-21

Weekly Intelligence now has a single authoritative generation and persistence contract:

1. authenticated `/api/weekly-intelligence` request;
2. server-owned `aggregateUserDataMoat()` call for all user-owned evidence;
3. Weekly generation and validation;
4. idempotent persistence to `weekly_intelligence_runs` keyed by `user_id`, `period_start`, and `period_end`;
5. idempotent problem persistence to `weekly_detected_problems` keyed by `run_id` and `problem_title`.

The legacy `generate-weekly-report` endpoint is retained only as a deprecated compatibility endpoint and performs no Weekly writes. `weekly_reports` and `weekly_niches` are deprecated legacy tables and are no longer active Weekly generation or Dashboard read models.

Dashboard Weekly cards preserve the existing UI shape by deriving their display model from `weekly_intelligence_runs` and `weekly_detected_problems`; Dashboard must not read legacy weekly tables.

## Weekly scheduling and concurrency update — 2026-07-21

Weekly Intelligence supports both manual generation from the authenticated product route and automatic generation from the protected cron route configured in `vercel.json`. The scheduler is server-owned: it authenticates with `CRON_SECRET`, reads eligible `user_profiles` where `weekly_intelligence_enabled` is true, and invokes the same authoritative Weekly generation service used by manual requests.

Manual and scheduled generation share the same atomic claim contract. A run is reserved in `weekly_intelligence_runs` for the authenticated/scheduled `user_id` and UTC reporting period before evidence aggregation or model generation starts. A duplicate request for the same user and period receives either the completed run or the current processing state, and does not invoke a second model request. Failed or stale processing claims may be reclaimed by the same claim function without holding a database transaction open across model execution.

Completed Weekly runs are reused. When a stale or failed processing run is reclaimed, completion replaces the child `weekly_detected_problems` set for that run before inserting the new validated set, so the persisted children match exactly one authoritative report output.

Detected-problem identity is normalized through `problem_title_key`, which trims leading/trailing whitespace, collapses repeated internal whitespace, and lowercases the model title. The migration backfills this key, removes historical duplicates deterministically by preserving the row with the strongest score tuple, then creates the unique index on `(run_id, problem_title_key)`.

## Results request-local aggregation reuse — 2026-07-22

The Results Idea Validation API now treats Data Moat aggregation as an evidence-acquisition step that is owned by the authenticated server route and performed once per valid batch request. The route then derives a bounded immutable validation context containing normalized user-owned evidence, source counts, shared-context metadata when requested by the caller, and server diagnostics required by deterministic validation.

No cross-request cache is introduced. The aggregation output is reused only inside the current request so evidence freshness, user isolation, ownership filtering, and serverless deployment boundaries remain unchanged. Deterministic per-idea validation may scale with the number of ideas, but Data Moat source reads do not scale linearly with the batch size.
