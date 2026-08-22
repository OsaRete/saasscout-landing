# PR W-B.4 — Weekly Intelligence quality contract

## Product intelligence goal and boundary

Weekly turns eligible current evidence into at most three distinct, commercially useful opportunity briefs. Its reasoning path is **observation → problem → root cause → workaround → solution gap → monetizable direction → validation action**. It should reveal a useful cause, wedge, or combination of signals rather than paraphrase broad pain.

This is an interpretation and presentation change only. Collection, queries, limits, persistence infrastructure, claims/reclaims, cron, RLS, scoring, evidence selection/compaction, the 3,000-token budget, provider, parser, JSON mode, promotion, and Knowledge Evolution are unchanged. No migration is required.

## Problem, root-cause, and solution-gap contract

For current live-market modes, a problem has a specific symptom summary and a distinct, non-generic `underlying_cause`. The cause should identify structural, workflow, trust, coordination, information, incentive, integration, compliance, pricing, distribution, switching-cost, visibility, or behavior friction supported by the evidence.

`existing_workaround` describes current behavior only when supplied evidence supports it. `why_existing_solutions_fail` explains the remaining gap without inventing named competitors. Unsupported workaround/gap values remain null. The validated persistence projection stores root cause/novelty in the existing `repeated_patterns` field and workaround/gap in `why_existing_tools_fail`; this preserves queryable Beta storage without schema churn.

## Observation versus inference

Observed evidence is a concise synthesis of eligible evidence and retains strict `evidence_references`. An opportunity direction declares `evidence_basis` as `observed` or `inferred`. An inferred direction is derived intelligence, never raw evidence, and deterministically requires at least two eligible references. Historical and shared context remain non-citable; fallback historical IDs retain their historical class and cannot establish fresh demand.

Validation continues to reject missing, unknown, omitted-envelope, or otherwise ineligible evidence IDs. It also rejects unsupported fallback freshness language. No model output can recursively support itself.

## Solution taxonomy and commercial-signal semantics

The controlled solution types are: `saas`, `software_product`, `startup`, `plugin`, `extension`, `api`, `marketplace`, `productized_service`, `digital_product`, `data_product`, `ai_agent`, `automation`, `infrastructure`, `mobile_app`, `physical_product`, `hybrid`, and `other`. Weekly asks for the best monetizable answer rather than defaulting to software. One best direction is required for current modes; zero to two alternatives are allowed and should appear only when strong.

Commercial evidence is classified as:

- `direct_buying_signal`: current cited evidence contains explicit payment, price, budget, purchase, spend, subscription, invoice, contract, cost, or revenue language;
- `indirect_commercial_signal`: economic impact or costly behavior exists, but direct willingness to pay is not established;
- `no_monetization_evidence_yet`: the problem may merit validation, but supplied evidence does not establish monetization.

The rationale must state the evidence boundary. Validation rejects a direct-buying classification when referenced evidence contains no direct buying language. Market size, adoption, named competitors, and willingness to pay must never be invented.

## Novelty and Data Moat interpretation

Weekly prefers a new problem, new angle on a known problem, stronger evidence, or a meaningful recurring problem over generic repetition. Prior user and shared aggregate context may help interpret continuity, root-cause changes, subproblems, or a different monetizable wedge. That context does not become current evidence, inflate source counts, establish trend movement, or create a fresh-market fact. True week-over-week trend architecture remains deferred to W-C.

## Output and deterministic quality checks

The model schema contains concise problem identity/summary, underlying cause, affected user/niche, impact, workaround, solution gap, observed evidence, repeated pattern, commercial signal, novelty framing, one best and up to two alternative opportunity directions, monetization, validation/deep-scan action, and evidence references. Existing W-B.3 character, problem, reference, evidence-envelope, and output-token bounds remain authoritative.

Deterministic validation:

1. enforces the maximum of three problems and eight references per problem;
2. rejects missing or unknown references and unsupported fallback freshness;
3. rejects known generic title forms;
4. requires symptom and root cause to be present and materially distinct in fresh/mixed modes;
5. rejects materially duplicate generated problems using normalized significant-word overlap;
6. validates controlled solution types and complete opportunity objects;
7. requires multiple references for an inferred opportunity;
8. rejects unsupported direct-buying claims;
9. limits alternatives to two and preserves null unsupported gaps;
10. retains deterministic application scoring and ignores model-owned scores.

## Prepare Deep Scan handoff

The compact URL payload continues to carry Weekly problem ID, concise summary, niche, scores, evidence summary/IDs, external source references, and Data Moat context. It now explicitly carries the persisted root-cause/novelty projection, workaround/solution gap, selected opportunity direction, alternative directions, monetization hypothesis, and validation angle. Scan itself is unchanged.

## Reuse and source/coverage presentation

A completed current-period reuse remains a backend zero-work return. The UI keeps the report in place and says it is already up to date and that no new analysis was required; it does not reload or imply a provider/model run.

For `weekly-execution@1`, the UI distinguishes **external sources collected** (`external_sources_persisted`) from **strongest signals used** (`total_sources_analyzed`). Legacy runs retain their readable historical count. Historical Data Moat context is described separately and is not counted as collected external evidence.

Coverage is selected from final current-run metadata: explicit `healthy` wins over a stale degradation flag; explicit `degraded` displays Degraded; fallback displays Data Moat fallback; unavailable/no-results have precise labels; rows without the execution contract display Legacy / unknown.

## Beta verification for one internal account

1. Refresh a completed current-period report; confirm the explicit up-to-date notice and compare safe stage logs to prove no provider/model/source/problem/promotion work.
2. On the next fresh run, inspect all (up to three) problems for distinct grounding, specific symptoms and causes, supported gaps, differentiated solution classes, commercial-signal honesty, and no fabricated buying claims.
3. Confirm collected-versus-used labels match parent/source projections and live coverage matches final run metadata.
4. Prepare Deep Scan from a problem and inspect the URL payload for identity, root cause, gap, selected direction, monetization, references/context, and validation angle; complete the normal Scan preparation flow.
5. Confirm normal parent/problem/source persistence and then repeat refresh to reconfirm zero-work reuse.

Safe diagnostics must remain aggregate-only. Do not log prompts, responses, titles, snippets, URLs, source content, headers, secrets, or provider payloads.

## Security, integrity, rollback, and deferred issues

There are no auth, authorization, RLS, grant, ownership, service-role, browser table-access, source persistence, or production-data changes. Only validated grounded problems persist; inference remains derived intelligence; history remains context; confidence and scoring are not inflated; completed reuse remains write-free.

Rollback is an application revert of prompt/validation/presentation code; existing rows remain readable. Prefer a bounded forward fix if measured output rejection rises: refine generic/duplicate language checks or compact prose, without weakening grounding or changing the W-B.3 envelope/token budget. Do not edit migrations or production rows.

Out of scope and documented only: Data Moat aggregation `query_error` results for `generated_opportunities`, `accepted_discover_problems`, `snapshots`, and `shared_problem_intelligence`; W-C trend architecture; canonical identity; Discover/Scan/Results behavior; provider diversification; promotion; and Knowledge Evolution.
