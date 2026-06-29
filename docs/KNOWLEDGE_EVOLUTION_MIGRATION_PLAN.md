# Knowledge Evolution Supabase Migration Plan

## Status and constraints

This document is the technical design for the future Supabase evolution layer. It intentionally does **not** create tables, does **not** define executable SQL, does **not** generate migrations, and does **not** modify production schema or application code. The migration is postponed until this architecture can be reviewed against SaaSScout's Data Moat, Intelligence Moat, Feedback Moat, and existing API compatibility requirements.

## 1. Current database architecture

The current Knowledge Evolution read model is assembled from legacy persistence tables rather than from a dedicated canonical knowledge schema.

### `problem_intelligence`

`problem_intelligence` is the current long-lived Data Moat memory for detected problems. Discovery and weekly intelligence write to it through exact `problem_title` lookups. When a title is new, a row is inserted with aggregate scores such as pain, revenue, urgency, buying signal, frequency, source quality, opportunity, intelligence score, prepared count, converted count, and seen timestamps. When a title already exists, the same row is updated with the newest aggregate scores and averaged opportunity or intelligence values.

Current role:

- Stores aggregated memory for a problem title.
- Is read by discovery experiences as ranked historical intelligence.
- Is queried by the Knowledge Evolution repository and adapted into transient evolution observations.
- Acts as a mixed concern: canonical memory, aggregate scoreboard, and last-seen cache.

### `weekly_detected_problems`

`weekly_detected_problems` stores problem-level outputs produced by weekly intelligence runs. Rows are linked to a weekly run by `run_id` and include problem title, summary, affected niches, suggested solutions, pain/revenue/urgency/trend scores, monetization angle, source evidence, buying signal score, frequency score, opportunity score, problem cluster, and source quality score.

Current role:

- Preserves the weekly report's generated problem objects.
- Feeds the weekly UI by run.
- Feeds `problem_intelligence` through the weekly write path.
- Provides historical source material for Knowledge Evolution diagnostics.

### `weekly_sources`

`weekly_sources` stores source-level signals collected for a weekly intelligence run. Rows are linked by `run_id` and include source title, URL, snippet, type, rank, author and engagement metrics, signal score, category, buying signal, frequency, opportunity score, problem cluster, and source quality score.

Current role:

- Preserves source evidence behind weekly reports.
- Feeds weekly UI evidence lists.
- Acts as source-granular context for Knowledge Evolution adapters.
- Is not currently connected to a canonical problem identity; association happens through `problem_cluster`, inferred titles, or run context.

### `discovered_problems`

`discovered_problems` stores problem rows generated during a user discovery session. Rows are linked to `opportunity_discoveries` through `discovery_id` and to the user through `user_id`. They contain a discovered problem shape compatible with the discovery UI and founder-match flow.

Current role:

- Stores per-discovery outputs for users.
- Provides discovery history for the UI.
- Provides input to founder matching.
- Is adapted into Knowledge Evolution observations as a legacy evidence source.

### `opportunity_discoveries`

`opportunity_discoveries` stores discovery session metadata: user, plan, source limit, total sources analyzed, summary, status, and timestamps. It is the parent table for `discovered_problems`.

Current role:

- Represents a user-initiated discovery run.
- Groups discovered problems under a single analysis event.
- Supports discover history and provenance for user-facing opportunity discovery.

### Current interaction model

1. Weekly intelligence collects external signals and writes a `weekly_intelligence_runs` row.
2. Weekly intelligence writes raw source signals to `weekly_sources`.
3. Weekly intelligence writes generated problem summaries to `weekly_detected_problems`.
4. Weekly intelligence updates `problem_intelligence` by exact `problem_title`.
5. Discovery creates an `opportunity_discoveries` row for the user session.
6. Discovery writes generated problems to `discovered_problems`.
7. Discovery and weekly paths both use `problem_intelligence` as the persistent aggregate memory.
8. Knowledge Evolution Phase 1 reads across `problem_intelligence`, `weekly_detected_problems`, `weekly_sources`, and `discovered_problems`, adapts rows into transient observations, and classifies evolution without changing persistence.

## 2. Problems with the current model

### Exact-title matching

The persistent memory key is `problem_title`. A problem titled “Client reporting takes too long” and another titled “Agencies waste hours preparing client reports” may represent the same market pain, but today they become separate memory tracks unless the title text matches exactly. Conversely, a generic title may collapse unrelated pains into one row.

### Overwritten history

`problem_intelligence` updates aggregate values in place. New scores overwrite or average with older values, but the system cannot reconstruct which observation caused a change, when the signal changed, which source supported it, or whether the previous value was more accurate.

### Lack of canonical identity

There is no stable problem identity independent from labels, source wording, user phrasing, or weekly run phrasing. Without canonical identity, the Knowledge Layer cannot safely connect evidence, aliases, feedback, evolution snapshots, founder matches, and recommendations around the same underlying market problem.

### Lack of append-only observations

Source observations are scattered across weekly and discovery tables. There is no single append-only observation ledger where each market signal can be recorded with provenance, normalized scores, confidence, source quality, deduplication fingerprint, and relationship to a canonical problem.

### Duplicated memory

The same signal can exist in weekly sources, weekly detected problems, discovered problems, and problem intelligence. Each table stores overlapping representations with different shapes. This creates duplicated memory and makes it difficult to know which row is evidence, which row is knowledge, and which row is a user-facing output.

### Inability to detect evolution

Evolution requires comparing observations over time. The current architecture mostly exposes latest aggregates and run-specific outputs. Because observations are not canonicalized and append-only, the system cannot reliably detect acceleration, decay, recurring pain, new niche expansion, source diversity growth, or changes in monetization confidence.

## 3. Proposed architecture

The future migration should introduce a dedicated evolution layer composed of append-only observations, canonical identities, aliases, temporal snapshots, and feedback events. These tables should be additive and should coexist with legacy tables until read and write paths are safely migrated.

### A. `problem_observations`

#### Purpose

`problem_observations` is the append-only evidence ledger for market problem signals. Every meaningful signal from external sources, weekly intelligence, discovery, user documents, or internal analysis should be represented as an immutable observation before it is consolidated into canonical knowledge.

#### Columns

Recommended columns:

- `id`: stable observation identifier.
- `canonical_problem_id`: nullable reference to `canonical_problems` once resolution occurs.
- `observation_fingerprint`: deterministic deduplication fingerprint built from normalized title, source URL or source text hash, source type, and observed date bucket.
- `problem_title`: original or generated problem title at observation time.
- `normalized_problem_title`: normalized title used for matching and search.
- `problem_summary`: concise statement of the pain.
- `source_table`: legacy source table name when backfilled, such as `weekly_sources` or `discovered_problems`.
- `source_row_id`: legacy row identifier when available.
- `source_url`: source URL when available.
- `source_type`: source category such as reddit, x, google, weekly_source, discovery, document, or user_feedback.
- `source_evidence`: evidence snippet or structured evidence summary.
- `source_author_id`: optional source author identifier where safe and permitted.
- `source_metrics`: structured engagement metrics.
- `affected_niches`: normalized niches or segments.
- `problem_cluster`: legacy or generated cluster label.
- `pain_score`, `revenue_score`, `urgency_score`, `trend_score`, `buying_signal_score`, `frequency_score`, `source_quality_score`, `opportunity_score`: normalized numeric signals.
- `confidence_score`: confidence in the observation as evidence.
- `evidence_quality`: low, medium, high, or numeric evidence quality rating.
- `observed_at`: when the market signal occurred or was collected.
- `ingested_at`: when SaaSScout stored the observation.
- `created_at`: row creation timestamp.
- `metadata`: structured JSON for source-specific details.

#### Indexes

Recommended indexes:

- Unique index on `observation_fingerprint` to prevent duplicate observations.
- Index on `canonical_problem_id, observed_at` for timeline queries.
- Index on `normalized_problem_title` for resolution and backfill.
- Index on `source_table, source_row_id` for traceability.
- Index on `source_type, observed_at` for source-diversity and freshness analysis.
- Index on `problem_cluster, observed_at` for legacy cluster analysis.

#### Relationships

- Many observations may resolve to one canonical problem.
- Observations may originate from legacy weekly, discovery, or intelligence rows.
- Observations feed canonical problem aggregate updates and evolution snapshots.
- Observations are the evidence base for decision-layer explanations.

#### Lifecycle

1. A source is ingested or a legacy row is backfilled.
2. The system computes a fingerprint and inserts the observation append-only.
3. A resolver links the observation to an existing canonical problem or marks it unresolved.
4. Canonical aggregates are recalculated from observations, not manually overwritten.
5. Snapshots periodically preserve derived state.
6. Observations are never updated except for safe resolution metadata such as `canonical_problem_id`; evidence content remains immutable.

### B. `canonical_problems`

#### Purpose

`canonical_problems` stores the stable identity and current consolidated knowledge for a real market problem. It is the durable Knowledge Layer representation that survives title changes, source phrasing differences, and repeated discoveries.

#### Columns

Recommended columns:

- `id`: stable canonical problem identifier.
- `canonical_key`: deterministic or semi-deterministic identity key.
- `canonical_title`: preferred human-readable title.
- `normalized_title`: normalized canonical title.
- `summary`: current consolidated problem summary.
- `primary_niche`: primary affected segment.
- `affected_niches`: normalized segment list.
- `problem_cluster`: canonical cluster or taxonomy node.
- `status`: candidate, active, merged, deprecated, or archived.
- `merged_into_problem_id`: reference used when duplicates are merged.
- `first_seen_at`: earliest observation time.
- `last_seen_at`: latest observation time.
- `observation_count`: number of linked observations.
- `source_count`: number of distinct evidence sources.
- `source_type_count`: number of distinct source types.
- `avg_pain_score`, `avg_revenue_score`, `avg_urgency_score`, `avg_trend_score`, `avg_buying_signal_score`, `avg_frequency_score`, `avg_source_quality_score`, `avg_opportunity_score`: derived current aggregates.
- `intelligence_score`: derived current intelligence score.
- `confidence_score`: derived confidence score.
- `evolution_state`: emerging, accelerating, stable, declining, recurring, or insufficient_evidence.
- `created_at`, `updated_at`: lifecycle timestamps.
- `metadata`: structured taxonomy, resolver, and audit metadata.

#### Indexes

Recommended indexes:

- Unique index on `canonical_key`.
- Index on `normalized_title` for title search.
- Index on `status, intelligence_score` for ranked active problems.
- Index on `evolution_state, updated_at` for trend monitoring.
- Index on `primary_niche, intelligence_score` for niche-specific opportunity discovery.
- Index on `last_seen_at` for freshness.

#### Relationships

- One canonical problem has many observations.
- One canonical problem has many aliases.
- One canonical problem has many evolution snapshots.
- One canonical problem has many feedback events.
- Future opportunity, founder-match, and decision-layer objects should reference canonical problem identity while legacy tables continue to operate during rollout.

#### Canonical identity strategy

Canonical identity should be resolver-driven, not title-driven. The resolver should use:

1. Normalized title similarity.
2. Problem summary similarity.
3. Shared affected niches.
4. Shared source evidence semantics.
5. Shared problem cluster or taxonomy.
6. Score pattern similarity.
7. Existing aliases.
8. Human or service-role merge decisions for ambiguous cases.

The `canonical_key` should be stable after creation. If two canonical problems are later determined to be duplicates, do not delete either immediately. Mark the weaker record as `merged`, set `merged_into_problem_id`, and redirect future resolution to the surviving canonical problem.

### C. `problem_aliases`

#### Purpose

`problem_aliases` maps alternate titles, phrases, clusters, and legacy labels to a canonical problem. It prevents title drift from fragmenting memory.

#### Columns

Recommended columns:

- `id`: alias identifier.
- `canonical_problem_id`: reference to the canonical problem.
- `alias_text`: original alias.
- `normalized_alias`: normalized alias for lookup.
- `alias_type`: title, cluster, source_phrase, legacy_title, user_phrase, or resolver_generated.
- `confidence_score`: confidence that the alias maps to the canonical problem.
- `source_table`: optional legacy source table that produced the alias.
- `source_row_id`: optional legacy row identifier.
- `first_seen_at`, `last_seen_at`: alias lifecycle timestamps.
- `created_at`, `updated_at`: row timestamps.
- `metadata`: resolver details and review flags.

#### Indexes

Recommended indexes:

- Unique index on `canonical_problem_id, normalized_alias, alias_type`.
- Index on `normalized_alias` for resolution.
- Index on `alias_type, confidence_score` for review queues.
- Index on `source_table, source_row_id` for backfill traceability.

#### Alias resolution strategy

1. Normalize incoming title and phrases.
2. Check exact normalized alias matches first.
3. Check canonical normalized title matches second.
4. Use semantic similarity and niche overlap for candidates.
5. Auto-link high-confidence matches.
6. Insert low-confidence candidates as review metadata or leave observations unresolved.
7. When a canonical merge occurs, reassign aliases to the surviving canonical problem.

### D. `problem_evolution_snapshots`

#### Purpose

`problem_evolution_snapshots` stores periodic derived state for canonical problems. It lets SaaSScout compare current state to prior state without recalculating from every observation each time and preserves decision-time context.

#### Snapshot cadence

Recommended cadence:

- Daily snapshots for active or accelerating problems.
- Weekly snapshots for stable problems.
- On-demand snapshots after large backfills, merge events, or major feedback events.
- Monthly compaction or archival strategy can be considered later, but only after the append-only observation ledger is validated.

#### Columns

Recommended columns:

- `id`: snapshot identifier.
- `canonical_problem_id`: reference to canonical problem.
- `snapshot_period`: daily, weekly, backfill, merge_event, or manual.
- `snapshot_at`: timestamp the snapshot represents.
- `window_start`, `window_end`: observation window.
- `observation_count`: observations in the window.
- `cumulative_observation_count`: total observations through the snapshot.
- `source_count`, `source_type_count`: evidence diversity measures.
- `avg_pain_score`, `avg_revenue_score`, `avg_urgency_score`, `avg_trend_score`, `avg_buying_signal_score`, `avg_frequency_score`, `avg_source_quality_score`, `avg_opportunity_score`: window aggregates.
- `intelligence_score`: derived score at snapshot time.
- `confidence_score`: confidence at snapshot time.
- `velocity_score`: rate of new evidence.
- `acceleration_score`: change in velocity versus prior comparable window.
- `persistence_score`: recurring evidence over time.
- `evolution_state`: emerging, accelerating, stable, declining, recurring, or insufficient_evidence.
- `decision_summary`: compact explanation of why state changed.
- `created_at`: row creation timestamp.
- `metadata`: calculation version and diagnostic context.

#### Indexes

Recommended indexes:

- Unique index on `canonical_problem_id, snapshot_period, snapshot_at`.
- Index on `canonical_problem_id, snapshot_at` for timelines.
- Index on `evolution_state, snapshot_at` for trend feeds.
- Index on `intelligence_score, snapshot_at` for ranked opportunity discovery.
- Index on `window_start, window_end` for backfill validation.

#### Relationships

- Each snapshot belongs to one canonical problem.
- Snapshots are derived from observations and feedback events.
- Decision Layer and Weekly Intelligence should read snapshots for trend context once compatibility is enabled.

### E. `problem_feedback_events`

#### Purpose

`problem_feedback_events` records real-world feedback that strengthens the Feedback Moat. It captures user validation, dismissals, saves, founder matches, built products, revenue outcomes, failed attempts, pivots, and qualitative feedback tied to canonical problems.

#### Columns

Recommended columns:

- `id`: feedback event identifier.
- `canonical_problem_id`: reference to canonical problem.
- `user_id`: user who created or triggered the event when applicable.
- `related_discovery_id`: optional reference to a discovery session.
- `related_discovered_problem_id`: optional legacy problem reference.
- `event_type`: saved, dismissed, validated, invalidated, founder_matched, built, launched, revenue_reported, failed, pivoted, qualitative_feedback, or system_inferred.
- `event_value`: numeric value where applicable, such as rating, revenue, or confidence delta.
- `event_text`: optional user-provided explanation.
- `event_metadata`: structured context such as market, niche, founder profile, or outcome details.
- `occurred_at`: when the event happened.
- `created_at`: when SaaSScout recorded it.

#### Indexes

Recommended indexes:

- Index on `canonical_problem_id, occurred_at` for feedback timelines.
- Index on `user_id, occurred_at` for user-owned history.
- Index on `event_type, occurred_at` for learning workflows.
- Index on `related_discovery_id` and `related_discovered_problem_id` for compatibility tracing.

#### Relationships

- Many feedback events belong to one canonical problem.
- Events may connect to legacy discoveries during rollout.
- Feedback events influence confidence, monetization, founder-match, and evolution snapshots.

## 4. Data flow

Future end-to-end flow:

1. **External Sources**: Reddit, X, Product Hunt, Hacker News, GitHub, app stores, reviews, blogs, news, user documents, and internal history are collected through modular ingestion.
2. **Evidence**: Raw content is normalized into evidence with source, time, snippet, metrics, market context, and quality signals.
3. **Knowledge**: Evidence is filtered, scored, deduplicated, and prepared for durable storage.
4. **Problem Observations**: Each accepted evidence item becomes an append-only `problem_observations` row with provenance and normalized scores.
5. **Canonical Problems**: The resolver links observations to an existing `canonical_problems` row or creates a candidate canonical problem when no safe match exists.
6. **Evolution Snapshots**: Snapshot jobs calculate velocity, acceleration, persistence, confidence, and current intelligence state from observations and feedback.
7. **Decision Layer**: Decision engines consume canonical problems and snapshots to produce explainable recommendations with evidence-backed confidence.
8. **Discover Opportunities**: Discovery uses canonical knowledge as context while continuing to write legacy discovery outputs during compatibility rollout.
9. **Weekly Intelligence**: Weekly intelligence uses snapshots to highlight emerging, accelerating, or recurring problems and writes legacy outputs until migration is complete.
10. **UI**: Existing UI continues reading legacy tables initially; later phases can add canonical trend explanations, source timelines, and feedback controls.

## 5. Backfill strategy

The backfill must be additive, idempotent, and reversible.

1. **Inventory legacy rows** from `problem_intelligence`, `weekly_detected_problems`, `weekly_sources`, `discovered_problems`, and `opportunity_discoveries` without changing them.
2. **Generate observation candidates** for each legacy row:
   - `weekly_sources` becomes source-granular observations.
   - `weekly_detected_problems` becomes weekly problem summary observations.
   - `discovered_problems` becomes user-discovery observations linked to `opportunity_discoveries`.
   - `problem_intelligence` becomes aggregate historical seed observations with lower provenance specificity.
3. **Compute deterministic fingerprints** from source table, source row ID, normalized title, source URL or evidence hash, and observed timestamp bucket.
4. **Insert observations idempotently** by fingerprint so repeated backfills do not duplicate data.
5. **Create canonical candidates** from grouped normalized titles, aliases, clusters, and semantic similarity.
6. **Attach aliases** for all distinct legacy titles and clusters that map to a canonical problem.
7. **Resolve ambiguous groups conservatively**. If similarity is uncertain, keep separate canonical candidates rather than incorrectly merging unrelated problems.
8. **Create initial snapshots** only after observation and canonical resolution counts are validated.
9. **Compare derived aggregates** against existing `problem_intelligence` scores to detect large divergences before using the new read model.
10. **Keep legacy tables as source of truth** until parity checks and product review confirm the new layer is reliable.

Historical safety rules:

- Never delete or mutate legacy rows during backfill.
- Preserve source provenance in every observation.
- Prefer unresolved observations over unsafe canonical merges.
- Track backfill batch identifiers in metadata for audit and rollback.
- Use service-role controlled jobs only.

## 6. Rollback strategy

Rollback must be safe because the first migration is additive.

1. Disable feature flags that write to or read from the evolution layer.
2. Stop backfill and snapshot jobs.
3. Keep existing APIs pointed at legacy tables.
4. If data cleanup is required, remove only rows created by the specific backfill batch identifiers in the new tables.
5. Do not modify `problem_intelligence`, `weekly_detected_problems`, `weekly_sources`, `discovered_problems`, or `opportunity_discoveries` during rollback.
6. If canonical merges were exposed to application logic, revert resolver routing to legacy exact-title behavior until review is complete.
7. Re-run parity diagnostics before attempting rollout again.

Because legacy tables remain unchanged, application rollback should be immediate: disable flags and return to existing read/write paths.

## 7. RLS strategy

All proposed tables should have RLS enabled by default.

### `problem_observations`

- Ownership: system-owned Data Moat records, optionally linked to a user for user-provided sources.
- Service-role writes: allowed for ingestion, backfill, resolver, and diagnostics jobs.
- Public access: no direct public access.
- Authenticated access: users may read observations only when exposed through approved application APIs and only for observations tied to their own discoveries or public/system-safe evidence. Direct client writes should be denied.

### `canonical_problems`

- Ownership: system-owned global knowledge.
- Service-role writes: allowed for resolver, merge, aggregate, and snapshot jobs.
- Public access: no unrestricted direct access.
- Authenticated access: read access may be allowed through server APIs for ranked opportunities and UI summaries. Client-side direct writes must be denied.

### `problem_aliases`

- Ownership: system-owned resolution metadata.
- Service-role writes: allowed for resolver and merge jobs.
- Public access: none.
- Authenticated access: generally no direct access; aliases may be exposed indirectly as explanations if safe.

### `problem_evolution_snapshots`

- Ownership: system-owned derived intelligence.
- Service-role writes: allowed for scheduled snapshot and backfill jobs.
- Public access: none by default.
- Authenticated access: read through application APIs for allowed UI features. Direct writes denied.

### `problem_feedback_events`

- Ownership: mixed. User-created feedback belongs to the user; system-inferred feedback belongs to the system.
- Service-role writes: allowed for server-side feedback capture, founder-match outcomes, and learning jobs.
- Public access: none.
- Authenticated access: users may create allowed feedback events for themselves through server-validated APIs and may read their own feedback. Global feedback aggregates should be exposed only after anonymization and aggregation.

## 8. Performance strategy

### Expected query patterns

- Resolve an incoming observation by normalized alias or canonical title.
- Read recent observations for one canonical problem.
- Rank active canonical problems by intelligence score, niche, and freshness.
- Generate evolution timelines by canonical problem and snapshot date.
- Find accelerating or emerging problems in the last weekly window.
- Retrieve feedback history for one user or one canonical problem.
- Backfill by source table and source row ID.

### Recommended indexes

Critical indexes are listed in each table section. The highest priority indexes are:

- `problem_observations(observation_fingerprint)` unique.
- `problem_observations(canonical_problem_id, observed_at)`.
- `problem_observations(source_table, source_row_id)`.
- `canonical_problems(canonical_key)` unique.
- `canonical_problems(status, intelligence_score)`.
- `problem_aliases(normalized_alias)`.
- `problem_evolution_snapshots(canonical_problem_id, snapshot_at)`.
- `problem_feedback_events(user_id, occurred_at)`.
- `problem_feedback_events(canonical_problem_id, occurred_at)`.

### Potential bottlenecks

- Semantic resolution can become expensive if it scans all canonical problems. It should first narrow candidates by normalized tokens, aliases, niche, and cluster.
- Snapshot generation can become expensive for high-volume observations. Use incremental windows and canonical problem batches.
- Backfill can create write amplification. Run in batches and validate fingerprints before insertion.
- JSON metadata filters can be slow if overused. Promote frequently queried metadata to first-class columns.
- UI queries should avoid reading raw observations directly for large timelines; use snapshots and paginated evidence APIs.

## 9. Compatibility strategy

The new tables must be introduced without changing existing APIs.

- Keep current writes to `problem_intelligence`, `weekly_detected_problems`, `weekly_sources`, `discovered_problems`, and `opportunity_discoveries` unchanged during the additive phase.
- Add evolution-layer writes behind feature flags only after the migration is approved.
- Keep existing UI reads on legacy tables until canonical parity is proven.
- Use dual-write only after observation fingerprints and resolver behavior are validated in staging.
- Use diagnostics to compare legacy rankings with canonical rankings.
- Preserve legacy IDs in observation metadata so old outputs can be traced to new canonical knowledge.
- Do not require existing API consumers to know `canonical_problem_id` during early rollout.

## 10. Incremental rollout

### Phase A: Design and review

- Land this documentation-only plan.
- Review schema design, RLS posture, resolver rules, and backfill safety.
- Define acceptance criteria for parity with existing legacy memory.

### Phase B: Additive schema migration

- Create only additive tables and policies in a later PR.
- No application behavior changes.
- Validate RLS, indexes, and service-role access in staging.

### Phase C: Backfill and diagnostics

- Backfill observations and canonical candidates in batches.
- Generate aliases and initial snapshots.
- Compare new canonical aggregates against `problem_intelligence` and weekly/discovery histories.
- Keep all production reads and writes on legacy paths.

### Phase D: Controlled dual-write and read shadowing

- Enable dual-write from weekly and discovery flows to `problem_observations` behind flags.
- Shadow-read canonical problems and snapshots in diagnostics.
- Compare decisions, rankings, and explanations without changing user-visible output.

### Phase E: Gradual product adoption

- Add canonical IDs to server-side decision workflows.
- Use snapshots for weekly trend context.
- Expose canonical evidence timelines where appropriate.
- Continue writing legacy tables for compatibility.

### Phase F: Legacy memory deprecation

- After parity, stability, and user-facing validation, deprecate `problem_intelligence` as the primary memory table.
- Keep legacy tables as historical output records or archived provenance.
- Remove exact-title memory dependence only after all critical flows use canonical identity.

## 11. Risks

Major technical risks:

- Incorrect canonical merges could combine unrelated market pains and corrupt knowledge.
- Overly conservative resolution could preserve fragmentation and reduce the value of the Data Moat.
- Backfill fingerprints could miss duplicates if legacy rows lack stable source identifiers.
- Existing aggregate scores may not be directly comparable across weekly, discovery, and intelligence contexts.
- RLS mistakes could expose system intelligence or user feedback across tenant boundaries.
- Dual-write failures could create divergence between legacy and evolution layers.
- Snapshot jobs could become expensive as observations grow.
- JSON-heavy metadata could create hidden performance problems.
- Feedback events could bias intelligence if user actions are not weighted and normalized carefully.
- Product teams may be tempted to switch reads too early before parity is proven.
- Legacy rows may contain incomplete timestamps, weak provenance, or inconsistent title formats.
- Service-role jobs require careful auditing because they bypass user-level RLS.

## 12. Final recommendation

SaaSScout should postpone the actual Supabase migration until this design is reviewed and accepted because the evolution layer changes the foundation of the Knowledge Layer. Creating tables before aligning identity, evidence, RLS, backfill, rollback, and compatibility would risk turning duplicated legacy memory into permanent architectural debt.

This architecture aligns with `PRODUCT_VISION.md` because it treats AI output as a means to build persistent market intelligence, not as the product itself. It aligns with `DATA_MOAT.md` because it stores reusable, evidence-backed knowledge rather than raw duplicated data. It aligns with `SYSTEM_ARCHITECTURE.md` because it separates Evidence Layer observations, Knowledge Layer canonical identity, Intelligence Layer snapshots, Decision Layer consumption, and Feedback Moat events. It aligns with the Knowledge Evolution roadmap because it moves SaaSScout from exact-title transitional diagnostics toward canonical identity, append-only observations, measurable evolution, and continuous learning from real outcomes.

The recommended next step is a separate additive migration PR only after this document is reviewed. That future PR should contain schema, indexes, and RLS policies, but no behavior change. Application dual-write and read adoption should happen only in later phases after backfill diagnostics prove that canonical knowledge is safer and more intelligent than the current exact-title model.
