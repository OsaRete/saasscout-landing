# Weekly Intelligence Beta stabilization

## Final architecture

`vercel.json` keeps Monday 08:00 UTC as the authority. Cron and the authenticated Beta refresh button both call `runWeeklyGenerationForUser`, which claims/reuses the owner-period run before aggregation, collection, persistence, synthesis, child replacement, and completion. Completed reuse returns before every downstream side effect.

The versioned server contract is `weekly-execution@1`. Historical records remain unchanged; new completed runs persist mode, provider state, persisted external count, and degradation on the parent.

## Execution modes

| Mode | Durable fresh evidence | owner context | Result |
|---|---:|---:|---|
| `fresh_market` | yes | no | completed, fresh evidence only |
| `mixed` | yes | yes | completed, fresh plus Data Moat |
| `data_moat_fallback` | no | yes | completed, explicitly historical/contextual |
| `insufficient_context` | no | no | completed, no fabricated problems/model call |

Mode is derived in server code, never accepted from the browser or model.

## Provider fallback matrix

| Provider state | usable persisted observations | trustworthy owner context | Policy |
|---|---:|---:|---|
| healthy | yes | any | fresh_market/mixed |
| degraded | yes | any | fresh_market/mixed, `source_degraded=true` |
| unavailable/not_configured | no | yes | data_moat_fallback |
| unavailable/not_configured | no | no | insufficient_context |
| no_results | no | yes/no | fallback/insufficient; never “no market change” |

If an external persistence attempt fails, external observations are removed from the synthesis envelope. A trustworthy historical envelope may continue in fallback mode; without it the precise persistence failure remains terminal.

## Persistence contract and root cause

The W-B writer used PostgREST `on_conflict=run_id,evidence_id`, while migration `20260816000000_weekly_external_evidence_contract.sql` supplied only a **partial** unique index (`WHERE evidence_id IS NOT NULL`). PostgreSQL cannot infer that partial index for an unqualified `ON CONFLICT (run_id,evidence_id)` and returns SQLSTATE `42P10` (“no unique or exclusion constraint matching”). This explains collection of 35 observations followed by zero rows.

Migration `20260821000000_weekly_beta_stabilization.sql` adds a non-partial unique index. PostgreSQL still allows multiple legacy NULL evidence IDs, while PostgREST can now infer the target. The writer performs an idempotent upsert and then verifies the durable evidence IDs; the returned persisted count means rows durably present for this run, including retry replays. Mapping is limited to effective columns: run/evidence identity, bounded source fields, rank, monitoring fingerprint, provider, canonical URL, publication/collection/seen times, period, content fingerprint, freshness, and `raw_external` origin. Database diagnostics contain operation/code/count metadata only.

Deployment order: application-independent migration first, PostgREST schema-cache reload if the platform does not do so automatically, then application. Dry-run with `npx supabase db push --dry-run`; do not apply from an agent.

## Data Moat fallback and no-fabrication rules

Fallback context comes through owner-scoped monitoring selection: completed grounded Scans, accepted Discover problems, saved ideas linked to owner concepts, grounded prior Weekly problems, and qualifying linked actions as relevance only. Failed/pending Scans, rejected Discover rows, unsaved opportunities, generic summaries, placeholders, shared Problem Intelligence alone, and arbitrary prior model prose are ineligible.

Each fallback item is typed `historical_context` and receives `weekly_context_<monitoring fingerprint>` as its reference ID. The monitoring fingerprint itself is never accepted as fresh evidence. Fresh sources remain `fresh_external`; current activity remains `current_internal`. Prompts prohibit freshness/trend claims without fresh evidence, and deterministic validation rejects common fresh-market claims in fallback/insufficient modes. Shared intelligence remains supplementary and cannot ground a personalized problem.

Fallback does not promote confidence merely because live collection failed. It never rewrites history, turns model output into evidence, invents publication dates, or treats unchanged repetition as independent evidence. Full W-C promotion/trend redesign is deferred.

## Source count semantics

* `currentPeriodInternalEvidenceCount`: eligible current owner activity.
* `monitoringTopicCount`: historical owner topics; never external sources.
* `externalSourcesCollected`: valid normalized provider results before canonical dedupe.
* `externalSourcesPersisted`: durable current-run observations.
* `externalSourcesEligible`: persisted non-unchanged observations eligible for synthesis.
* `externalSourcesNew/Changed/Resurfaced/Unchanged`: classified observations.
* `totalEvidenceUsed`: exact synthesis/validation envelope.
* `sourceDegraded`: partial provider coverage or discarded unpersisted external observations.
* `executionMode`: deterministic mode above.

Historical parent counts retain their legacy meaning and are not rewritten.

## Button/cron parity and UI

The button is a Beta verification surface, renamed “Refresh Weekly Intelligence.” It is not an alternate architecture. The UI exposes last update, automatic schedule, mode, live coverage, durable external count, problem count, fallback/insufficient messages, and reuse. A cron recipient failure is caught per user and does not abort later recipients. Safe cron/application diagnostics use execution IDs, run/period IDs, states, and aggregate counts only.

## Production read-only SQL

Replace `:user_id`, `:run_id`, and `:period_start` using approved read-only access.

```sql
-- Current parent and execution outcome.
select id, user_id, period_start, period_end, status, created_at,
       execution_contract_version, execution_mode, external_provider_state,
       external_sources_persisted, source_degraded, total_sources_analyzed
from public.weekly_intelligence_runs
where user_id = :user_id
order by period_start desc limit 5;

-- Durable source count and distributions.
select count(*) as persisted_sources from public.weekly_sources where run_id = :run_id;
select source_provider, source_type, freshness_class, origin_class, count(*)
from public.weekly_sources where run_id = :run_id
 group by source_provider, source_type, freshness_class, origin_class order by 1,2,3;

-- Provenance completeness.
select count(*) filter (where evidence_id is null or monitoring_topic_fingerprint is null
 or source_provider is null or canonical_url is null or collected_at is null
 or first_seen_at is null or last_seen_at is null or first_seen_period_start is null
 or content_fingerprint is null or freshness_class is null or origin_class <> 'raw_external') as incomplete,
 count(*) as total from public.weekly_sources where run_id = :run_id;

-- Must return no rows.
select run_id, evidence_id, count(*) from public.weekly_sources
where run_id = :run_id group by run_id, evidence_id having count(*) > 1;

-- Current problems and grounding references.
select id, problem_title, evidence_references, created_at
from public.weekly_detected_problems where run_id = :run_id order by created_at;

-- Parent/source-count mismatch (external count is authoritative for new-contract rows).
select r.id, r.external_sources_persisted, count(s.id) as actual
from public.weekly_intelligence_runs r left join public.weekly_sources s on s.run_id=r.id
where r.id=:run_id group by r.id, r.external_sources_persisted
having r.external_sources_persisted is distinct from count(s.id)::integer;

-- Eligible historical monitoring/fallback context.
select 'completed_scans' kind, count(*) from public.scan where user_id=:user_id and status='completed' and created_at < :period_start
union all select 'accepted_discover', count(*) from public.discovered_problems where user_id=:user_id and status='accepted' and created_at < :period_start
union all select 'saved_ideas', count(*) from public.saved_ideas where user_id=:user_id and created_at < :period_start
union all select 'grounded_weekly', count(*) from public.weekly_detected_problems p join public.weekly_intelligence_runs r on r.id=p.run_id where r.user_id=:user_id and r.status='completed' and r.period_start < :period_start and jsonb_array_length(coalesce(p.evidence_references,'[]'::jsonb)) > 0;

-- Completed reuse: one owner-period row; compare timestamps before/after a repeat request.
select user_id, period_start, count(*), min(created_at), max(created_at)
from public.weekly_intelligence_runs where user_id=:user_id and period_start=:period_start
group by user_id, period_start;

-- Conflict indexes, RLS, policies, grants, and migration history.
select indexname, indexdef from pg_indexes where schemaname='public' and tablename='weekly_sources' order by indexname;
select relrowsecurity, relforcerowsecurity from pg_class where oid='public.weekly_sources'::regclass;
select policyname, roles, cmd, qual, with_check from pg_policies where schemaname='public' and tablename in ('weekly_sources','weekly_intelligence_runs');
select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('weekly_sources','weekly_intelligence_runs') order by table_name,grantee,privilege_type;
select version from supabase_migrations.schema_migrations where version in ('20260816000000','20260821000000') order by version;
```

## Safe Vercel diagnostics and end-to-end checklist

Inspect `weeklyExecutionId`, entry path, period key, run ID, provider attempts/successes/failures, normalized/deduplicated/classified/persisted counts, provider state, degradation, execution mode, problem count, stage, and stable database/PostgREST code. Never inspect logged URLs, content, queries, prompts, tokens, headers, email, or model/provider payloads.

1. Run the migration preflight and dry-run; verify only the new migration.
2. Apply through the reviewed production process and confirm `20260821000000` history.
3. Deploy the application; refresh PostgREST schema cache if required.
4. Retry the existing failed parent; confirm the same ID is reclaimed and 35 rows persist.
5. Confirm parent completion, mode/provider metadata, provenance, no duplicates, and count parity.
6. Repeat the request; confirm the same completed row and zero provider/source/model/problem/promotion work.
7. Exercise a provider outage for a mature internal user; confirm completed fallback and no external refs.
8. Exercise an empty user; confirm completed insufficient context with zero problems.
9. Invoke the cron with its secret; confirm later recipients run after one recipient failure.
10. Confirm browser table access remains denied and the API projection remains owner-filtered.

## Rollback / forward-fix and remaining W-C risks

The additive index and nullable columns need no data rollback. Application rollback leaves them inert. Do not remove evidence, rewrite historical rows, reopen completed runs, or widen browser grants. If the index build finds unexpected duplicate non-NULL identities, stop deployment and forward-fix the conflicting producer/identity after read-only diagnosis; do not clean production rows in this PR. If PostgREST remains stale, reload its schema cache. Constraint or mapping errors should be forward-fixed additively using the safe database code.

Deferred to W-C: material week-over-week change, multi-topic source associations, canonical problem redesign, trend scoring, recursive promotion safeguards beyond the current boundary, provider diversification, and full Knowledge Evolution promotion/calibration.
