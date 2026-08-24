# PR W-B.5 — Bounded Weekly model-quality retry

## Boundary

Weekly permits at most two synthesis attempts: the initial generation and one regeneration. The shared authoritative service selects and persists evidence before entering this boundary. A retry calls only generation, parsing (inside the adapter), and authoritative validation, with the same run, execution ID, period, mode, monitoring context, historical context, shared context, and immutable selected evidence array. Collection, history loading, classification, source persistence, selection/ranking, problem persistence, Data Moat updates, and completion do not repeat. Problems remain unwritten until validation succeeds. Completed-run reuse returns before all of this work. Manual and cron entry paths both use this service.

The retry receives the original bounded prompt plus one deterministic corrective sentence. It never receives the prior response. The sentence names only the safe validation category, asks for complete regeneration, requires the same supplied evidence and valid IDs, and reiterates the schema. No prompt, response, title, snippet, URL, identity, credential, SQL, or private Data Moat content is logged.

## Validation taxonomy and retry policy

All locations below are branches in `validateWeeklyModelOutput`.

| Current validation branch | Safe reason | Retry? | Rationale |
|---|---|---:|---|
| top-level/problem shape | `malformed_output` | yes | Parsed JSON can still have a model-produced schema defect. |
| missing report summary | `missing_summary` | yes | Model completeness defect. |
| summary/title/prose/opportunity bound | `field_limit_exceeded` | yes | Model concision defect; bounds remain unchanged. |
| more than three problems | `problem_limit_exceeded` | yes | Model contract defect. |
| fallback asserts fresh-market facts | `unsupported_fresh_market_claim` | yes | Regeneration can honor the unchanged evidence-class boundary. |
| problems emitted with no eligible evidence | `problem_without_evidence` | **no** | Signals a server/evidence-envelope invariant, not a quality-only recovery. |
| title missing | `missing_problem_title` | yes | Model completeness defect. |
| known generic title | `generic_problem_title` | yes | Deterministic W-B.4 quality defect. |
| missing or unknown evidence ID | `invalid_evidence_reference` | **no** | Evidence identity mismatch fails closed and is never rewritten. |
| more than eight references | `evidence_reference_limit_exceeded` | yes | Model bound defect. |
| symptom/root cause missing or materially indistinct | `missing_or_indistinct_root_cause` | yes | Deterministic W-B.4 quality defect. |
| materially overlapping generated problems | `duplicate_problem` | yes | Deterministic W-B.4 quality defect. |
| commercial object/type/rationale missing | `missing_commercial_interpretation` | yes | Model completeness defect. |
| direct-buying classification lacks cited buying language | `unsupported_direct_buying_signal` | yes | Model interpretation defect; evidence rule remains authoritative. |
| required best opportunity missing | `missing_best_opportunity` | yes | Model completeness defect. |
| solution type outside taxonomy | `invalid_solution_type` | yes | Model taxonomy defect. |
| required opportunity fields/evidence basis missing | `incomplete_opportunity` | yes | Model completeness defect. |
| inferred direction has fewer than two references | `inferred_opportunity_insufficient_evidence` | yes | Model inference defect; two-reference rule remains unchanged. |
| alternatives are not an array or exceed two | `opportunity_alternative_limit_exceeded` | yes | Model bound defect. |

Transport, HTTP, credentials, empty/truncated output, parsing, authentication, authorization, database, collection, persistence, completion, and unexpected errors never enter this retry policy.

## Safe diagnostics and execution trace

Validation failures use code `weekly_model_quality_validation_failed`, stage `model_response_validated`, and a typed `validationReason`. Aggregate events include `model_validation_failed`, `model_retry_started`, `model_retry_generation_completed`, `model_retry_response_parsed`, `model_retry_response_validated`, and `model_retry_exhausted`, with attempt number (1 or 2), maximum attempts (2), eligibility, safe adapter metadata, and successful problem count where applicable. Both attempts retain one `weeklyExecutionId`.

Before: collection → persistence → selection → generation → parse → validation failure → failed run. After: the same path → validation failure → one regeneration from the same envelope → parse → validation → normal single persistence/completion, or closed failure after attempt two. A first-attempt success has no retry event.

## Production verification

1. Key logs by one `weeklyExecutionId`. For a healthy run confirm attempt 1, `model_response_validated`, `problems_persisted`, and `response_completed`, with no `model_retry_started`.
2. For a recoverable rejection confirm `model_validation_failed` with a listed reason, one `model_retry_started`, attempt 2 generation/parse/validation, one problem persistence, and one completion. Confirm there is no second `external_sources_collected` or `sources_persisted` event.
3. For two controlled invalid responses confirm exactly two model attempts, `model_retry_exhausted`, sanitized code/reason, no problem persistence, and failed parent state.
4. Refresh a completed period and confirm the same run is returned with no aggregation, collection, persistence, model, retry, replacement, or promotion event.

Use approved read-only access, replacing the parameter once:

```sql
-- Bind :run_id to the claimed Weekly run UUID.
select id,user_id,status,period_start,period_end,external_sources_persisted,
       total_sources_analyzed,execution_mode,external_provider_state,created_at
from public.weekly_intelligence_runs where id = :run_id;

select count(*) as weekly_source_count,
       count(*) filter (where origin_class = 'raw_external') as external_source_count
from public.weekly_sources where run_id = :run_id;

select run_id,evidence_id,count(*)
from public.weekly_sources where run_id = :run_id
group by run_id,evidence_id having count(*) > 1;

select count(*) as problem_count
from public.weekly_detected_problems where run_id = :run_id;

select id,status,external_sources_persisted,total_sources_analyzed
from public.weekly_intelligence_runs where id = :run_id and status = 'completed';

select user_id,period_start,period_end,count(*)
from public.weekly_intelligence_runs
where (user_id,period_start,period_end) =
      (select user_id,period_start,period_end from public.weekly_intelligence_runs where id = :run_id)
group by user_id,period_start,period_end having count(*) > 1;

select p.id,ref.evidence_id,
       exists (select 1 from public.weekly_sources s
               where s.run_id = p.run_id and s.evidence_id = ref.evidence_id) as durable_reference
from public.weekly_detected_problems p
cross join lateral jsonb_array_elements_text(coalesce(p.evidence_references,'[]'::jsonb)) ref(evidence_id)
where p.run_id = :run_id;
```

## Security, Data Moat, rollback, and deferred work

This is application-only; no migration, privilege, schema, RLS, or client authority changes. Invalid attempt output is neither logged nor persisted. Durable source observations remain unchanged and are never recursively amplified. Data Moat and Problem Intelligence writes remain after validation.

Rollback by reverting the W-B.5 application commit. Leave durable evidence intact; do not reopen completed runs or weaken validation. Prefer forward fixes to eligibility categorization, bounded corrective wording, or diagnostic mapping. Provider diversification, collection/query changes, W-C trends, scoring, canonical identity, promotion, UI, and unrelated aggregation errors remain untouched.
