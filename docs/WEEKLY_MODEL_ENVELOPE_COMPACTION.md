# PR W-B.3 — Weekly model-envelope compaction

## Repair boundary and root cause

Production collected, classified, and durably upserted 40 external observations, then sent all 40 to `openai/gpt-4.1-mini`. The provider returned `finish_reason=length` at the 2,200-output-token limit. The request previously asked for as many as five problems with 14 prose fields each and no field bounds. This made a response larger than 2,200 tokens valid under the prompt contract. The parser correctly reported `weekly_response_truncated`; collection and persistence were not defective.

This is an application-only repair at the persisted-evidence/model-synthesis boundary. It does not alter collection, query limits, normalization, canonical identity, fingerprinting, freshness, persistence, claims, scoring, promotion, or authorization.

## Before-size trace

The production-shaped input contained 40 external items. Each model item contained ID, class, type, title, full `WeeklyEvidenceSource.summary`, observed/known timestamp, and provenance-derived type. The durable normalization boundary allows titles up to 300 characters and snippets up to 1,000 characters. The model mapping did not add another bound. It did not serialize URLs directly, but a missing title fell back to canonical URL. Provider and freshness were embedded in application provenance but provenance itself was not serialized; monitoring-topic context was absent. Up to three prior Weekly summaries of 500 characters each were included with title, type, timestamp, and summary. All shared-context title/summary rows were unbounded at this prompt boundary.

The static user-prompt instructions/schema were about 3,400 characters, and the system message was 53 characters. A worst-case 40-source external section alone could exceed 57,000 characters (roughly 14,250 tokens at the safe diagnostic estimate of four characters/token), before history, shared context, and instructions. Production values vary and source contents are intentionally not logged. The old output contract permitted five problems × 14 model prose/reference fields without character bounds; therefore its maximum output was effectively the provider's 2,200-token cutoff rather than an application schema maximum. The 40-source synthesis envelope was unnecessarily verbose.

## Selection policy

All observations continue to be upserted first. The persisted observation set and model evidence set are deliberately different. The model subset has a maximum of **20 external observations**, plus at most eight current internal items or four fallback historical items. The external limit was chosen because four monitored topics receive up to five corroborating items each while the production-shaped compact prompt remains bounded (about 19,000 characters/~4,750 estimated tokens for 20 maximum-sized external items plus compact context).

Selection is deterministic and provider/model independent:

1. partition eligible external evidence by monitoring-topic context;
2. rank within each topic: `changed`, then `new`/`publication_unknown`, then `resurfaced`;
3. prefer known publication recency (descending);
4. break ties by unchanged evidence ID;
5. round-robin topics in stable lexical order until 20 observations are selected.

Round-robin selection represents every topic that has evidence before taking a second item from any topic. With more than 20 topics, lexical topic order is the deterministic bound; Beta currently supports four topics. Canonical deduplication upstream already provides source-identity diversity. Evidence IDs pass through unchanged. Omitted IDs never enter the validation envelope and therefore fail authoritative reference membership validation.

## Compact evidence and context

A model-visible external observation contains only:

- unchanged `evidenceId` and `evidenceClass=fresh_external`;
- monitoring topic/market context, normalized and bounded to 100 characters;
- title bounded to 140 characters;
- excerpt bounded to 360 characters;
- source type and freshness class;
- publication date only when known.

Whitespace is deterministically normalized and overflow ends with an ellipsis. The prompt excludes URL, database/run ID, provider implementation, fingerprint, collection/seen timestamps, and other persistence metadata. Missing titles no longer fall back to a URL.

Prior user context is independently capped at four entries: title 100 characters and theme 240 characters. Shared aggregate context is capped at two entries: title 100 and theme 180. Neither includes IDs or timestamps, and both are labeled non-citable. Historical context in the fallback evidence envelope retains its historical class; it is never reclassified as fresh.

## Output contract and budget

The model may return at most three high-value problems. It must synthesize rather than restate sources, avoid repeated prose, return one JSON object with no Markdown/commentary/additional scores, and cite only supplied IDs. Report summary is capped at 500 characters; title at 100; each other prose field at 360; each problem has at most eight evidence references. Authoritative validation rejects excess problems, text, references, unknown/omitted IDs, unsupported fallback freshness claims, and ungrounded problems. Deterministic application scoring remains unchanged.

The output budget moves from **2,200 to 3,000 tokens** only after compaction. Three bounded problems with schema keys, up to 13 compact prose values, and eight IDs each are expected to fit below roughly 2,700 tokens in the conservative pathological case; normal responses should be materially smaller. The remaining headroom protects valid JSON closure without making the budget unbounded. `finish_reason=length|max_tokens` still fails closed as `weekly_response_truncated`; there is no repair, partial acceptance, or automatic retry.

## Safe diagnostics

`model_evidence_selected` reports only aggregate values: `modelEvidenceAvailableCount`, `modelEvidenceSelectedCount`, `modelEvidenceOmittedCount`, `availableExternalEvidenceCount`, `selectedExternalEvidenceCount`, `omittedExternalEvidenceCount`, `selectedMonitoringTopicCount`, `historicalContextSelectedCount`, and `totalEvidenceUsed`. Model completion metadata adds `promptCharacterCount`, `promptApproxTokenCount`, `maxOutputTokens`, `requestedProblemCount`, `finishReason`, and `responseContentLength`. No prompt, output, title, snippet, URL, provider payload, private Data Moat text, key, header, or credential is logged.

## Retry, reuse, security, and Data Moat

Retrying failed parent `46848c76-97a8-4a34-ae20-25abf00aaf52` for `[2026-08-17, 2026-08-24)` reclaims the same run. The unchanged `(run_id,evidence_id)` upsert reconfirms all durable sources without duplication. Selection then exposes at most 20 external IDs to one model generation; valid parsed/validated problems are replaced and the parent completes. No source deletion occurs.

A completed claim returns before aggregation, collection, persistence, model generation, problem replacement, or promotion. The second refresh remains zero-work reuse.

No migration is required. RLS, browser privileges, authentication, service-role authority, persistence authority, provenance identity, and provider choice are untouched. Durable evidence remains the Data Moat observation layer; selection is transient synthesis input; omitted observations remain durable. Historical context stays historical and model output stays derived intelligence. No recursive evidence amplification is introduced.

## Production verification

1. Deploy through the reviewed process; do not run production changes from this PR.
2. Refresh Weekly once and capture the Network response and Vercel logs keyed by `weeklyExecutionId`.
3. Confirm available evidence is at least 40, selected evidence is no greater than available and no more than 20 external items, and prompt estimated tokens are bounded.
4. Confirm stages `model_generation_completed`, `model_response_extracted`, `model_response_parsed`, and `model_response_validated`.
5. Confirm `problems_persisted`, `completion_transitioned`, and `response_completed`; confirm the parent is completed.
6. Confirm durable source count and `(run_id,evidence_id)` uniqueness.
7. Refresh again and confirm completed reuse with zero provider, source, model, replacement, or promotion work.

Use approved read-only access only:

```sql
select id,status,period_start,period_end,execution_contract_version,execution_mode,
       external_provider_state,external_sources_persisted,source_degraded,
       total_sources_analyzed,created_at
from public.weekly_intelligence_runs
where id='46848c76-97a8-4a34-ae20-25abf00aaf52';

select count(*) as durable_source_count,
       count(*) filter (where origin_class='raw_external') as durable_external_count
from public.weekly_sources
where run_id='46848c76-97a8-4a34-ae20-25abf00aaf52';

select run_id,evidence_id,count(*)
from public.weekly_sources
where run_id='46848c76-97a8-4a34-ae20-25abf00aaf52'
group by run_id,evidence_id having count(*) > 1;

select count(*) as problem_count
from public.weekly_detected_problems
where run_id='46848c76-97a8-4a34-ae20-25abf00aaf52';

select id,problem_title,evidence_references
from public.weekly_detected_problems
where run_id='46848c76-97a8-4a34-ae20-25abf00aaf52'
order by created_at,id;

select p.id,ref.evidence_id,
       exists(select 1 from public.weekly_sources s
              where s.run_id=p.run_id and s.evidence_id=ref.evidence_id) as durable_reference
from public.weekly_detected_problems p
cross join lateral jsonb_array_elements_text(coalesce(p.evidence_references,'[]'::jsonb)) ref(evidence_id)
where p.run_id='46848c76-97a8-4a34-ae20-25abf00aaf52';
```

Execution-stage logs are the authoritative read-only evidence for execution mode details, provider state, `external_sources_persisted`, and completed reuse; the parent projection above verifies their durable counterparts.

## Rollback / forward fix and deferred issues

Rollback is an application revert; durable rows remain intact. Prefer a measured forward fix if safe aggregate diagnostics show a repeated size failure: lower prose bounds or selection count before considering a small token adjustment. Never delete observations, widen privileges, weaken validation, repair incomplete JSON, or reopen completed runs.

Unrelated Data Moat aggregation errors for `generated_opportunities`, `accepted_discover_problems`, `snapshots`, and `shared_problem_intelligence` remain out of scope, as do W-C trend architecture, Knowledge Evolution promotion, canonical identity, and scoring changes.
