# W-B.2 — Weekly model-output contract repair

## Root cause and exact call graph

Production had reached the model with all 38 eligible observations. The apparent contradiction was diagnostic, not an evidence-envelope loss: `source_counts` called `countWeeklyEvidence(userEvidence)`, the pre-external Data Moat array, and `data_moat_sources_loaded.sourceCount` likewise described only current internal evidence. `emptyEvidence` correctly used the later combined envelope. This was case **B**: fresh external evidence lived in the combined envelope but the legacy internal-only counter reported zero.

The path is:

1. `runAuthoritativeWeeklyGenerationForUser` (`lib/weekly-intelligence-service.ts`) receives an owner, period, and server dependencies; claims/reclaims the parent or returns completed/processing with no downstream work.
2. `collectWeeklyEvidenceFromDataMoat` (`lib/weekly-intelligence.ts`) returns current `userEvidence`, separated `priorUserContext`, and supplementary `sharedContext`. Read/normalization failure is a Data Moat diagnostic failure.
3. `classifyWeeklyExternalEvidence` produces provenance-bearing observations. Non-`unchanged` observations remain eligible; `persistExternalSources` durably upserts all observations on `(run_id,evidence_id)`. A persistence mismatch excludes external evidence rather than synthesizing from unpersisted data.
4. Eligible observations become `WeeklyEvidenceSource` entries with type `external`, their unchanged `evidenceId`, bounded title/summary, observation time, and `raw_external:<provider>:<freshness>` provenance. Historical monitoring topics separately become `historical_context` with `weekly_context_<fingerprint>` IDs and are used only in fallback mode.
5. The execution-mode envelope is fresh external only, mixed internal plus external, fallback internal plus historical context, or empty. `analyzeUserScopedWeeklySignals` receives that exact envelope as `userEvidence`; IDs remain unchanged.
6. `buildWeeklyIntelligencePrompt` serializes class, ID, title, observation time, and summary and states the authoritative output and grounding rules.
7. The server-only OpenAI SDK adapter calls `https://openrouter.ai/api/v1` using `openai/gpt-4.1-mini`, temperature `0.1`, `max_tokens: 2200`, no tools/functions or custom stops, and now requests `response_format: {type:"json_object"}`.
8. `extractWeeklyOpenRouterResponse` reads `choices[0].message.content`, rejects null/empty content, and maps `finish_reason` `length`/`max_tokens` to `weekly_response_truncated`.
9. `parseWeeklyModelResponse` accepts direct JSON, whitespace, one complete JSON/plain fence, or one deterministically bounded JSON object with short brace-free wrappers. It rejects malformed JSON, multiple objects, nested presentation wrappers, and never repairs or invents fields.
10. `validateWeeklyModelOutput` remains authoritative: required shape/title/grounding, eligible-reference membership, fallback freshness rules, and deterministic scoring all still apply before problem replacement.

Previously the route removed every ```json and ``` substring globally and passed the result directly to `JSON.parse`. The provider request did not request JSON mode, ignored `finish_reason`, and returned no safe response metadata. Thus harmless provider fencing could sometimes work, but commentary, ambiguous objects, null content, and token truncation were not precisely distinguished. The observed production parse code conclusively identifies invalid JSON after that global stripping; retained production diagnostics intentionally do not contain the raw response, so they cannot reconstruct which presentation/truncation variant occurred.

## Request, parser, envelope, and diagnostics contracts

JSON mode is the narrowest mechanism already proven in this repository's OpenRouter/OpenAI-compatible adapter. Text instructions reinforce it: exactly one JSON object, no Markdown/commentary, exact top-level and problem fields, eligible IDs only, historical context never fresh evidence, no unsupported trend/freshness assertions, and no model-owned scores. Schema validation remains application-authoritative.

The 2,200-token budget is unchanged because production did not record truncation and no evidence proves it insufficient. Truncation is now distinct and safe rather than being mislabeled parsing. Safe metadata is limited to content presence/length, finish reason, JSON-mode requested, parser strategy, and attempt count. No prompt, response, source content, URL, token, key, or header is logged.

Count semantics are now independent:

- `currentPeriodInternalEvidenceCount`: eligible current-period owner activity.
- `eligibleExternalEvidenceCount`: persisted, non-unchanged external observations exposed to synthesis.
- `historicalContextCount`: historical monitoring context, never fresh evidence.
- `totalEvidenceUsed`: exact execution-mode synthesis/validation envelope.

Existing collection and persistence counters retain their meanings. Persisted unchanged observations are not counted as evidence used.

Stages are `model_generation_started`, `model_generation_completed`, `model_response_extracted`, `model_response_parsed`, and `model_response_validated`. Stable empty, parse, validation, provider, and configuration codes remain; explicit token exhaustion is `weekly_response_truncated` at the provider response boundary.

## Security and Data Moat guarantees

The model and service-role operations remain server-only. Keys, raw responses, snippets, private Data Moat contents, and URLs never reach browser diagnostics. Authentication, authorization, RLS, grants, provider selection, collection, persistence schema, claim lifecycle, scoring, promotion, and Knowledge Evolution are unchanged.

Malformed output cannot be promoted. Provenance and evidence IDs are unchanged; historical context cannot become fresh evidence; deterministic scores remain authoritative; synthesis failure leaves durable raw observations intact and marks the parent failed before any valid replacement/promotion. No recursive evidence path is added.

## Retry, verification, and read-only SQL

Retry run `46848c76-97a8-4a34-ae20-25abf00aaf52` for `2026-08-17T00:00:00Z`–`2026-08-24T00:00:00Z` once after deployment. The claim RPC should reclaim the same failed parent. Existing source writes are reconfirmed by the unchanged `(run_id,evidence_id)` upsert, so 38 rows remain 38; no cleanup is required. Confirm the five model stages, valid problems, completed parent, mode/count metadata, then refresh again and verify completed reuse causes no collection, source write, model call, problem replacement, or Data Moat update.

Run only through approved read-only production access:

```sql
select id,status,period_start,period_end,execution_mode,external_provider_state,
       external_sources_persisted,source_degraded,total_sources_analyzed,summary
from public.weekly_intelligence_runs
where id='46848c76-97a8-4a34-ae20-25abf00aaf52';

select count(*) as durable_source_count,
       count(*) filter (where freshness_class <> 'unchanged') as eligible_source_count
from public.weekly_sources
where run_id='46848c76-97a8-4a34-ae20-25abf00aaf52';

select evidence_id,count(*)
from public.weekly_sources
where run_id='46848c76-97a8-4a34-ae20-25abf00aaf52'
group by evidence_id having count(*) > 1;

select count(*) as problem_count
from public.weekly_detected_problems
where run_id='46848c76-97a8-4a34-ae20-25abf00aaf52';

select id,problem_title,evidence_references
from public.weekly_detected_problems
where run_id='46848c76-97a8-4a34-ae20-25abf00aaf52'
order by created_at;

select p.id,ref.evidence_id,
       exists(select 1 from public.weekly_sources s where s.run_id=p.run_id and s.evidence_id=ref.evidence_id) as is_durable_external
from public.weekly_detected_problems p
cross join lateral jsonb_array_elements_text(coalesce(p.evidence_references,'[]'::jsonb)) ref(evidence_id)
where p.run_id='46848c76-97a8-4a34-ae20-25abf00aaf52';
```

Compare approved count-only deployment logs before/after the second refresh to prove zero work; database rows alone cannot prove absence of a provider call.

## Rollback / forward-fix

No migration is required. Rollback is an application revert, leaving all source rows intact. Prefer a forward fix keyed by safe finish reason/parser strategy metadata. If `weekly_response_truncated` occurs repeatedly, first compact bounded evidence text while preserving IDs/class/provenance; increase output tokens only with measured evidence. Never delete production evidence, weaken validation, or silently fall back after model failure.
