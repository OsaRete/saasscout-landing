# W-B.1 — Weekly external-history boundary repair

## Diagnosis

The failure is at the unguarded `loadExternalHistory` repository boundary. After
`external_sources_deduplicated`, the service ran two service-role PostgREST reads:

1. `weekly_intelligence_runs`: select `id,period_start`, restricted by `user_id`,
   `period_start < current period`, newest first, limit 52.
2. `weekly_sources`: select the seven W-B history fields for those run IDs, with
   `canonical_url=not.is.null`.

The second query's `.not("canonical_url", "is", null)` is a valid supabase-js /
PostgREST query. The effective additive migration supplies every selected field.
Legacy rows may have NULL provenance by design and are not history; they must be
discarded rather than rewritten. Supabase returns `timestamptz` values as strings,
but repository responses are an untrusted runtime boundary.

The exact application defect was that either raw repository error escaped without
an operation-specific diagnostic, while `currentStage` still named the preceding
deduplication stage, or malformed runtime history reached a classifier that called
`localeCompare` without validation. Production's sanitized trace cannot recover
the discarded PostgREST error code, so it cannot distinguish a stale PostgREST
schema cache from another history-read error after the fact. A stale cache remains
a possible deployment cause, not a schema-contract defect. The repaired boundary
logs only operation name, database code, and error-field-presence flags; maps read
and persistence failures to stable safe diagnostics; validates all provenance and
period fields; and treats zero valid rows as a successful empty history.

No migration is required. The service-role client is constructed exclusively with
`SUPABASE_SERVICE_ROLE_KEY`; RLS and grants are unchanged. Persistence remains an
idempotent insert-only upsert on `(run_id,evidence_id)` with duplicates ignored.

## Execution trace

Before: deduplicated → unlabelled history reads/classification/upsert → generic
failure reported at deduplicated.

After: deduplicated → history loading started → history loaded (safe count) →
classified (safe counts) → sources persisted (safe count) → evidence envelope →
model → children → immutable parent completion.

Completed-run reuse returns before provider collection, history loading, source
persistence, and model generation. Retrying the existing failed run uses the
existing claim contract: it reclaims the same parent, performs the normal flow,
inserts current-run observations idempotently, and completes that parent. No row
cleanup or special retry SQL is needed.

## Production read-only verification

Run only through an approved read-only production connection.

```sql
-- Failed/current parent before retry and final parent after retry.
select id, user_id, period_start, period_end, status,
       total_sources_analyzed, summary
from public.weekly_intelligence_runs
where id = '46848c76-97a8-4a34-ae20-25abf00aaf52';

-- Prior source history for the same owner (counts only).
select count(*) as prior_source_count
from public.weekly_sources s
join public.weekly_intelligence_runs r on r.id = s.run_id
join public.weekly_intelligence_runs current_run
  on current_run.id = '46848c76-97a8-4a34-ae20-25abf00aaf52'
where r.user_id = current_run.user_id
  and r.period_start < current_run.period_start;

-- Provenance-complete versus legacy/incomplete history.
select
  count(*) filter (where canonical_url is not null
    and content_fingerprint is not null and first_seen_at is not null
    and first_seen_period_start is not null and last_seen_at is not null
    and monitoring_topic_fingerprint is not null) as provenance_complete,
  count(*) filter (where canonical_url is null
    or content_fingerprint is null or first_seen_at is null
    or first_seen_period_start is null or last_seen_at is null
    or monitoring_topic_fingerprint is null) as legacy_or_incomplete
from public.weekly_sources;

-- Current-run count and freshness distribution after reclaim.
select count(*) as current_run_source_count
from public.weekly_sources
where run_id = '46848c76-97a8-4a34-ae20-25abf00aaf52';

select freshness_class, count(*)
from public.weekly_sources
where run_id = '46848c76-97a8-4a34-ae20-25abf00aaf52'
group by freshness_class order by freshness_class;

-- Must return zero rows.
select run_id, evidence_id, count(*)
from public.weekly_sources
where run_id = '46848c76-97a8-4a34-ae20-25abf00aaf52'
group by run_id, evidence_id having count(*) > 1;

-- Final parent and detected-problem count.
select r.id, r.status, r.total_sources_analyzed, count(p.id) as detected_problem_count
from public.weekly_intelligence_runs r
left join public.weekly_detected_problems p on p.run_id = r.id
where r.id = '46848c76-97a8-4a34-ae20-25abf00aaf52'
group by r.id, r.status, r.total_sources_analyzed;
```

## Rollback and unrelated diagnostics

Rollback is an application revert only; there is no database rollback. If a
deployment still reports the history-read code, use its safe database code and
operation name to forward-fix the boundary rather than mutating history. The
aggregation `query_error` results for `generated_opportunities`, `snapshots`,
`shared_problem_intelligence`, and `accepted_discover_problems` occur before topic
selection and are separate queries. They do not share this external-history
repository boundary and remain deliberately unchanged.
