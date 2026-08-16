# Weekly Monitoring Context (`weekly-monitoring-context@1`)

## Problem and boundary

Before W-A, authoritative Weekly reduced the owner-scoped Data Moat to records in the current Monday-to-Monday UTC period. If that evidence set was empty, it completed an empty report. Historical Weekly summaries and shared Problem Intelligence were prompt supplements, not a personalized decision about what to keep watching.

W-A adds a read-only selection branch:

```text
historical user-owned Data Moat -> monitoring topic selection
current-period user evidence    -> existing Weekly generation
```

The branches remain semantically separate. A historical monitoring topic means “the user previously demonstrated interest in this concept.” It is **not fresh market evidence**, cannot be referenced by the Weekly model, cannot satisfy the no-evidence gate, and is never counted in `total_sources_analyzed`, `sources_saved`, or `weekly_sources`.

## Owner and provenance policy

The server passes the authenticated user ID to Data Moat aggregation and the selector rechecks every record's `ownerId`. Browser-supplied identity is not accepted. Eligible anchors are:

- completed Scans with a meaningful market/problem description;
- accepted Discover problems, retaining their derived-intelligence origin;
- saved ideas only when their owner-owned underlying opportunity can be resolved (the save is preference, not evidence);
- prior Weekly problems only when the completed owner-owned run reports at least one analyzed source and the problem retains at least one evidence reference.

`prepare_deep_scan`, `save`, and `convert` actions can raise a linked topic's relevance but cannot establish a topic. Shared/global Problem Intelligence, Discover run summaries, generated opportunities without a save, snapshots, failed/pending Scans, rejected Discover problems, and ungrounded/placeholder Weekly rows cannot establish personalized context. Problem Intelligence and Snapshot/Knowledge Evolution reads are intentionally excluded because W-A needs neither global authority nor a new provenance interpretation.

## Time and bounds

Selection considers records in `[period_end - 180 days, period_end)`. Six months captures durable founder intent across monthly and quarterly exploration while preventing abandoned interests and unlimited history from controlling bounded future collection. Existing aggregation reads are capped per source; prior Weekly loading is additionally capped at 26 runs and 100 child problems. At most five topics are returned, matching the existing maximum Weekly problem output and bounding W-B search fan-out.

Historical records may select, name, and prioritize a topic. They never affect current evidence counts, freshness, trend direction, corroboration, or evidence references.

## Identity and conservative deduplication

The canonical key is an explicit linked concept ID when one exists; otherwise it is normalized `market | niche | title`. Normalization uses Unicode NFKC, lowercase alphanumeric tokens, collapsed whitespace, and no model call. Exact keys merge; merely similar language does not. False separation is preferred to joining unrelated markets.

The fingerprint is `wmt_` plus a deterministic 64-bit-style hexadecimal hash of the versioned canonical key. It contains no raw summary, owner ID, secret, current time, random UUID, or input-order material. It is in memory only. Equivalent input ordering produces the same topic order and fingerprints.

## Ranking

Priority is deterministic:

```text
30 * accepted Discover count
+ 24 * saved idea count
+ 18 * completed Scan count
+ 12 * grounded prior Weekly count
+  5 * linked qualifying action count
+  8 * distinct eligible workflow kinds
+ recency bonus (18 down to 0, decreasing every 10 days)
```

Ties resolve by latest observation and fingerprint. Model scores and global Problem Intelligence popularity have no authority.

## Diagnostics and writes

The safe `monitoring_context_selected` stage preserves `weeklyExecutionId` and reports only `monitoringTopicCount`, per-kind aggregate counts, `historicalContextAvailable`, `monitoringSelectionVersion`, and `currentPeriodEvidenceCount`. It excludes titles, summaries, evidence, prompts, identities, tokens, and secrets.

Selection performs no writes. It does not touch `weekly_sources`, Weekly children, Problem Intelligence, observations, canonical problems, Knowledge Evolution, or Snapshots. Completed-period reuse returns before aggregation and remains write-free.

## Known debt and W-B

The pre-existing `total_sources_analyzed` / `sources_saved` naming currently reflects eligible current-period user activity rather than persisted external sources. W-A does not change that contract and never adds monitoring topics to it. W-B will use selected topic fingerprints to perform bounded fresh external evidence collection, persist genuine source records, and repair source-count semantics without converting historical context into evidence.

## Read-only production verification

Substitute the authenticated internal user's UUID for `:user_id`. These queries do not mutate data:

```sql
select id, market, audience, region, status, created_at
from public.scan
where user_id = :user_id and status = 'completed'
  and created_at >= now() - interval '180 days'
order by created_at desc limit 100;

select id, discovery_id, problem_title, problem_summary, affected_niches, status, created_at
from public.discovered_problems
where user_id = :user_id and status = 'accepted'
  and created_at >= now() - interval '180 days'
order by created_at desc limit 100;

select si.id, si.created_at, o.id as opportunity_id, o.title, o.problem_summary
from public.saved_ideas si
join public.opportunities o on o.id = si.opportunity_id and o.user_id = si.user_id
where si.user_id = :user_id and si.created_at >= now() - interval '180 days'
order by si.created_at desc limit 100;

select wdp.id, wdp.problem_title, wdp.evidence_references, wir.total_sources_analyzed, wir.period_end
from public.weekly_detected_problems wdp
join public.weekly_intelligence_runs wir on wir.id = wdp.run_id
where wir.user_id = :user_id and wir.status = 'completed'
  and wir.period_end >= now() - interval '180 days'
  and jsonb_array_length(coalesce(wdp.evidence_references, '[]'::jsonb)) > 0
  and wir.total_sources_analyzed > 0
order by wir.period_end desc limit 100;
```

For a not-yet-completed period, run Weekly through its existing authenticated button or cron path and inspect the safe `monitoring_context_selected` log for `currentPeriodEvidenceCount = 0`, `monitoringTopicCount > 0`, and `historicalContextAvailable = true`. The completed report must still contain zero generated problems when no current evidence exists. If the period is already completed, do not reopen or delete it: completed-run reuse intentionally skips selection. Verify through automated tests/log fixtures, or wait for the next period.
