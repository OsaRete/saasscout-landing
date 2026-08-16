# Weekly External Evidence Contract (PR W-B)

## Purpose and boundary

W-B turns owner-scoped `WeeklyMonitoringTopic` selections into fresh, server-collected public observations. A monitoring topic is historical context, never evidence. Internal activity, shared Problem Intelligence, and model output never receive `origin_class = raw_external`. W-B stores external observations; W-C will decide material historical change, trend scoring, and promotion semantics.

The authoritative flow is:

```text
owner-scoped historical Data Moat -> monitoring topics -> bounded public search
-> normalize -> in-run dedupe -> owner-scoped historical classification
-> persist current observation -> combine eligible observations with current internal evidence
-> existing grounded Weekly validation and synthesis
```

Completed-period reuse returns before aggregation, provider calls, source writes, or model calls. The button and Monday cron continue to call the same `runWeeklyGenerationForUser` service.

## Contract and identities

Every newly collected row has a deterministic `evidence_id`, run, monitoring-topic fingerprint, provider/type, original and canonical URLs, bounded title/snippet, provider-supplied publication time or NULL, collection/first/last-seen times, first-seen period, content fingerprint, freshness class, and `raw_external` origin.

Fingerprint contracts:

* `weekly-external-source@1`: SHA-256 of provider, source type, and canonical URL. It excludes user identity, secrets, private summaries, and timestamps. The API evidence reference is `weekly_external_<digest>`.
* `weekly-content-fingerprint@1`: SHA-256 of NFKC, whitespace-normalized, lower-cased bounded title and snippet. It excludes collection time and provider payload metadata.
* Monitoring fingerprints remain W-A's `weekly-monitoring-context@1`; they are query linkage, not evidence IDs.

One observation row is allowed per `(run_id, evidence_id)`. The same public source can legitimately have one immutable observation in each run. Previous rows are never mutated. This row-per-run lifecycle makes absence/reappearance observable for W-C.

## Query and collection policy

Queries use only a topic's bounded market, niche, and title. `problemSummary`, raw Data Moat summaries, emails, IDs, and private evidence are not sent. Three deterministic variants add pain/friction, manual-workflow/complaint, and cost/error/buying language.

Beta limits are: 5 topics, 3 queries per topic, 12 queries globally, 4 results per query, and 40 raw results per run. Each query has an 8-second abort deadline and the collection stage has a 25-second budget. The fixed server-side provider is the already configured SerpApi Google adapter; no browser URL or provider host is accepted. This reuses the existing `SERPAPI_API_KEY`, avoids a new dependency, and does not treat OpenRouter output as evidence. X remains deferred because the existing X adapter uses a generic global query rather than topic-specific collection.

Provider states are distinct: `healthy`, `degraded`, `unavailable`, `not_configured`, and `no_results`. Missing configuration or total provider failure cannot become a no-evidence claim when historical topics are the only basis. Partial coverage may continue with `sourceDegraded = true`. Healthy zero results produce the precise empty state, not a trend/no-change claim.

## Normalization and canonical URLs

Only valid HTTP(S) URLs are accepted. Scheme and host are lower-cased, default ports and fragments are removed, trailing path slashes are removed except at root, query parameters are sorted, and known tracking parameters (`utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`) are removed. Other query parameters and paths are preserved to avoid merging distinct documents. Whitespace is collapsed; title is capped at 300 characters and snippet at 1,000. Publication time is retained only when supplied and parseable. `collected_at` is never presented as publication time.

In-run dedupe uses canonical URL first and deterministically selects one provider observation. Different paths are not merged. A source found by multiple topics currently retains one deterministic topic fingerprint on the source row; the additional topic associations are not persisted in this Beta-sized design. A future join table is deferred unless evidence shows this limitation matters.

## Freshness

Classification is scoped to the same owner, canonical URL, and monitoring topic:

* `new`: never observed and a reliable provider publication time exists.
* `publication_unknown`: never observed and publication time is unavailable; no timestamp is invented.
* `changed`: the canonical source existed but its content fingerprint differs.
* `unchanged`: canonical source and content match an observation in the immediately preceding monitoring week.
* `resurfaced`: canonical source and content match, but the latest observation is older than the immediately preceding week.

`first_seen_at` is when SaaSScout first collected the owner/topic observation. `last_seen_at` is the current observation time. `published_at` is the source's provider-supplied publication time and may be NULL. Existing history remains immutable. Current observations, including unchanged observations, are persisted once per run so W-C can reason about continuity; unchanged observations are excluded from the synthesis evidence envelope. New, publication-unknown, changed, and resurfaced observations are eligible.

## Counts and projection

New generation responses expose `currentPeriodInternalEvidenceCount`, `monitoringTopicCount`, `externalSourcesCollected` (valid normalized provider results before canonical dedupe), `externalSourcesEligible`, `externalSourcesPersisted` (actual inserted observations), freshness counts, `totalEvidenceUsed` (internal current-period evidence plus eligible external evidence passed to validation/synthesis), and `sourceDegraded`.

Legacy `sources_saved` now means actual current-run external rows persisted; it never means internal evidence. `weekly_intelligence_runs.total_sources_analyzed` means the evidence envelope actually available to synthesis, not raw search results. Historical values are not rewritten and therefore retain legacy meaning. Completed legacy reports can be read without pretending their missing provenance fields exist.

The authenticated browser still cannot query `weekly_sources`. `GET /api/weekly-intelligence` authenticates, owner-filters runs, and returns an allowlisted server projection. The migration re-revokes `public`, `anon`, and `authenticated`, retains RLS, and grants only `service_role` the required table operations.

## Safe diagnostics

Stages include monitoring selection, external collection, classification, persistence, model validation, and completion. Diagnostics contain execution ID, entry path, period key, counts, provider success/failure counts, classification counts, status, and degradation only. They exclude queries, URLs, snippets, provider responses, prompts, tokens, keys, authorization values, and emails.

## Read-only production preflight SQL

Run against production **before** applying the migration:

```sql
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='weekly_sources' order by ordinal_position;
select indexname, indexdef from pg_indexes where schemaname='public' and tablename='weekly_sources' order by indexname;
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.weekly_sources'::regclass order by conname;
select relrowsecurity, relforcerowsecurity from pg_class where oid='public.weekly_sources'::regclass;
select policyname, roles, cmd, qual, with_check from pg_policies where schemaname='public' and tablename='weekly_sources';
select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='weekly_sources' order by grantee, privilege_type;
select source_url, count(*) from public.weekly_sources group by source_url having count(*) > 1 order by count(*) desc limit 50;
select lower(regexp_replace(split_part(coalesce(source_url,''),'?',1), '/+$', '')), count(*) from public.weekly_sources where source_url is not null group by 1 having count(*) > 1 order by 2 desc limit 50;
select run_id, count(*) from public.weekly_sources group by run_id order by count(*) desc;
select count(*) filter (where source_url is null) as null_urls, count(*) as total from public.weekly_sources;
select source_type, category, count(*) from public.weekly_sources group by source_type, category order by count(*) desc;
select r.id, r.total_sources_analyzed, count(s.id) as persisted_sources from public.weekly_intelligence_runs r left join public.weekly_sources s on s.run_id=r.id group by r.id, r.total_sources_analyzed having r.total_sources_analyzed <> count(s.id) order by r.created_at desc;
select version from supabase_migrations.schema_migrations order by version desc limit 20;
```

## Deployment and production verification

1. Merge the reviewed PR; update local `main`.
2. Run `npx supabase db push --dry-run` and verify only `20260816000000_weekly_external_evidence_contract.sql` appears.
3. Run the read-only preflight above.
4. Apply the migration, then repeat column/index/constraint/RLS/grant checks.
5. Wait for application deployment.
6. Run Weekly for a mature internal user with zero current activity and at least one topic.
7. Inspect count-only diagnostics and verify the stored `weekly_sources` rows have external provenance.
8. Repeat the completed request and verify zero provider calls, source writes, and model calls.

Do not apply this migration to production from an agent or test. The PostgreSQL test harness requires `WEEKLY_EXTERNAL_EVIDENCE_TEST_DATABASE_URL` and must point only to a disposable database.

## Forward-fix

If collection is unhealthy, remove/disable the server-side `collectExternal` dependency or fail it closed while retaining all observation rows and historical Results reads. Do not restore browser privileges, delete observations, rewrite historical rows, or weaken grounding. W-C remains responsible for true week-over-week material change, trend scoring, and Problem Intelligence promotion.
