# Modular Assisted Persistence Readiness Audit

Date: 2026-07-07  
Status: diagnostic-only audit; modular persistence remains disabled.

## Scope and non-goals

This audit evaluates whether the latest Bruno diagnostic result is sufficient to begin planning a future guarded assisted-persistence phase for the modular discovery pipeline.

The audit does **not** enable modular persistence, change production behavior, change API responses, change database schema, change prompts, change UI, change legacy fallback, or change the Knowledge Evolution dual-write path.

## Current diagnostic snapshot

Latest reported Bruno diagnostic run:

| Metric | Value |
| --- | ---: |
| `overallWinner` | `modular` |
| `decision` | `use_modular` |
| `modularOverallQualityScore` | 95.21 |
| `legacyOverallQualityScore` | 88.95 |
| `modularVsLegacyScoreDelta` | 6.26 |
| `planned_row_count` | 5 |
| `qualityGateAcceptedRows` | 5 |
| `qualityGateRejectedRows` | 0 |
| `marketCoverageScore` | 100 |
| `fallbackUsageScore` | 92 |
| `rowLevelSynthesisReadinessScore` | 100 |
| `persistModular` | `false` |
| `productionBehaviorChanged` | `false` |

## Readiness conclusion

The run is a strong positive signal, but it is **not sufficient by itself** to consider modular ready for persistence activation.

It is enough to justify a guarded readiness track because:

- the decision layer can already recommend `use_modular` while hard-coding `persistModular: false` and `productionBehaviorChanged: false`;
- the planned rows all passed quality gates in this run;
- modular beat legacy by more than the current minimum score delta;
- market coverage and row-level synthesis readiness were perfect in this run;
- fallback usage was low enough to avoid the fallback-usage blocker.

It is not enough to enable persistence because:

- the evidence is a single successful run, not a stability window;
- shadow parity is still partial and must not be treated as full production equivalence;
- two rows still used `build_difficulty` fallback, meaning a persisted value would still contain deterministic defaulting rather than fully attributed engine intelligence;
- `warning_count` is 2, which is inside the current threshold but leaves no buffer before becoming a guarded-readiness concern;
- Solution Intelligence remains diagnostic-only and has not been proven as a persistence-owner input;
- Knowledge Evolution dual-write currently observes the legacy-selected rows, so changing row ownership would alter what knowledge is learned even if the API response looked unchanged.

## Required repeated-run stability criteria

Before any persistence activation PR is proposed, require a repeated-run stability window across representative Bruno diagnostics.

Recommended minimum gate:

1. At least 10 consecutive successful Bruno diagnostic runs across at least 3 distinct source mixes or discovery scenarios.
2. No run with `productionBehaviorChanged !== false` or `persistModular !== false` during readiness validation.
3. No run where modular loses the overall comparison when legacy rows are available.
4. No run where persistence quality gates reject any planned row.
5. No run where shadow parity is `divergent`.
6. No run where orchestrator warnings exceed the existing maximum threshold.
7. No run where `fallbackUsageScore` materially regresses below the readiness floor.
8. No run where `planned_row_count` drops below the decision layer minimum candidate count.
9. No run where Knowledge Evolution dual-write diagnostics fail or report an unexpected legacy write failure.
10. Metrics must be collected from the same diagnostic payload fields, not manually inferred from logs.

Suggested readiness floors:

| Metric | Required stability floor |
| --- | ---: |
| `modularOverallQualityScore` | >= 90 in every run; >= 93 average |
| `modularVsLegacyScoreDelta` | >= 5 in every run with legacy rows; >= 6 average |
| `qualityGateRejectedRows` | 0 in every run |
| `rowLevelSynthesisReadinessScore` | 100 in every run |
| `marketCoverageScore` | >= 90 in every run; 100 preferred |
| `fallbackUsageScore` | >= 90 in every run |
| `buildDifficultyFallbackOnlyRowCount` | 0 preferred; maximum 1 temporary only if explicitly justified |
| `warning_count` | <= 1 preferred; <= 2 maximum with stable warning codes |
| `shadowParityStatus` | never `divergent`; `partial` must trend toward explicit parity dimensions |
| `planned_row_count` | >= 3 and stable relative to available high-quality candidates |

## Metrics that must remain stable

The following metrics should be tracked across Bruno runs before any persistence activation:

### Decision and ownership metrics

- `decision`
- `reasons`
- `confidence`
- `recommendation.persistModular`
- `recommendation.productionBehaviorChanged`
- `recommendation.allowFallback`

### Quality comparison metrics

- `overallWinner`
- `overallModularScore`
- `overallLegacyScore`
- `modularVsLegacyScoreDelta`
- category winners and per-category scores
- `modularMetrics.averageTitleSpecificity`
- `modularMetrics.averageSummaryQuality`
- `modularMetrics.averageEvidenceQuality`
- `modularMetrics.averageScoreConsistency`
- `modularMetrics.averageEvidenceCompactness`
- `modularMetrics.qualityGateScore`

### Persistence-plan metrics

- `planned_row_count`
- `valid_row_count`
- `invalid_row_count`
- `row_sources`
- `fallback_fields_by_row`
- `field_sources_by_row`
- `build_difficulty_by_row`
- `affected_niche_enrichment_by_row`
- `warnings`

### Quality-gate metrics

- `allRowsPass`
- `accepted_row_count`
- `rejected_row_count`
- `issue_count`
- `warning_count`
- `error_count`
- `issue_counts_by_code`
- `fallback_field_count`
- `rows_with_fallback_fields`

### Shadow and cross-layer metrics

- Discovery shadow parity status and row-level comparison diagnostics.
- Solution Intelligence shadow diagnostics while it remains diagnostic-only.
- Knowledge Evolution dual-write report outcome and whether legacy row ownership was preserved.

## Remaining risks

### Shadow parity remains partial

Partial parity means the modular pipeline may be high quality without yet proving that it preserves all production-relevant semantics of the legacy path. This is acceptable for diagnostics, but not for persistence activation.

Guardrail: require explicit non-divergent parity dimensions and document which fields are intentionally allowed to differ before modular rows can own persistence.

### Two `build_difficulty` fallbacks

`build_difficulty` fallback is low-risk in dry-run diagnostics but higher-risk for persistence because it converts missing attribution into a persisted default.

Guardrail: future activation should require zero `build_difficulty` fallbacks or an allowlisted exception with row-level attribution explaining why `Medium` is acceptable.

### `warning_count` is 2

The current warning count is inside the current maximum threshold, but it is at the edge of the default decision tolerance.

Guardrail: repeated readiness should prefer <= 1 warning and require stable warning codes. New or fluctuating warnings should reset the stability window.

### Solution Intelligence is diagnostic-only

Solution Intelligence diagnostics are useful for shadow comparison but are not yet a persistence authority.

Guardrail: do not let Solution Intelligence-selected outputs become persisted values until there is a separate readiness gate proving stable solution-category attribution, evidence linkage, and fallback behavior.

### Knowledge Evolution dual-write interaction

The dual-write path learns from the selected `discovered_problems` rows. If modular assisted persistence changes those rows, Knowledge Evolution would learn different observations, which is a production behavior change even if response shape and database schema remain the same.

Guardrail: preserve legacy row ownership for dual-write until modular persistence is explicitly activated. Any future activation must include a rollback mode that immediately returns dual-write inputs to legacy-selected rows.

## Safest future feature flag

If a future PR scaffolds a feature flag, the safest shape is a server-only environment flag with explicit staged values rather than a boolean.

Recommended future flag name:

```text
DISCOVERY_ASSISTED_PERSISTENCE_MODE
```

Recommended values:

- `off`: default; legacy owns persistence; modular diagnostics may run only through existing diagnostic controls.
- `diagnostic`: diagnostics and readiness summaries only; no persistence ownership.
- `shadow_select`: compute decision-gated modular rows and log whether they would be selected, but still persist legacy rows and feed Knowledge Evolution from legacy rows.
- `canary`: only after explicit approval; decision-gated modular rows may own persistence for a tightly scoped internal canary, with legacy fallback preserved.

Do not implement `canary` until the stability criteria above are met and tests exist.

## Rollback and fallback behavior that must be preserved

A future activation must preserve these invariants:

1. Legacy prompt-derived persistence remains the default path.
2. Modular errors must fail closed to legacy rows.
3. Invalid planned rows must never be persisted.
4. Quality-gate rejection must fall back to legacy rows.
5. Decision outcomes other than `use_modular` or an explicitly approved guarded mode must fall back to legacy rows.
6. Shadow divergence must block modular persistence.
7. Knowledge Evolution dual-write must be able to revert immediately to legacy-selected row inputs.
8. API response shape must remain unchanged unless a separate API contract PR is approved.
9. Database schema must remain unchanged unless a separate migration PR is approved.
10. All diagnostic logging must remain safe and avoid secrets or raw sensitive source payloads.

## Tests required before persistence activation

Before any activation PR, add or confirm tests for:

1. Decision layer keeps `persistModular: false` and `productionBehaviorChanged: false` in diagnostic modes.
2. Assisted persistence selection returns `null` when the feature mode is `off` or `diagnostic`.
3. Invalid planned rows are never selected.
4. Any quality-gate rejection blocks modular row selection.
5. Fallback usage above threshold blocks modular selection or requires legacy fallback.
6. Shadow `divergent` blocks modular selection.
7. Orchestrator warning count above threshold blocks or downgrades selection.
8. `build_difficulty` fallback diagnostics are counted and exposed.
9. Knowledge Evolution dual-write receives legacy-selected rows while mode is `off`, `diagnostic`, or `shadow_select`.
10. API response contract remains unchanged under diagnostics.
11. Database write count and target tables remain unchanged under diagnostics.
12. Rollback from any future canary mode to `off` immediately restores legacy persistence and dual-write inputs.

## Small PR roadmap

### PR 1: Diagnostic readiness report only

- Add or refine a diagnostic-only readiness report that aggregates the metrics listed above.
- Keep `persistModular` false.
- Keep production behavior unchanged.
- Include Bruno-run stability checklist fields so reviewers can compare runs without manual log interpretation.

### PR 2: Guarded feature flag scaffold with persistence still disabled

- Add the staged server-only mode parser.
- Support `off`, `diagnostic`, and `shadow_select` only.
- Explicitly reject or ignore `canary` until a later approved PR.
- Keep persistence and Knowledge Evolution dual-write on legacy rows.

### PR 3: Parity improvement

- Reduce `build_difficulty` fallback count to zero through deterministic attribution improvements.
- Improve shadow parity from partial to explicit field-level parity or documented accepted differences.
- Stabilize warning count to <= 1 across representative runs.

### PR 4: Activation-readiness tests

- Add tests covering all activation blockers, rollback behavior, Knowledge Evolution row ownership, and API-contract stability.
- Still do not enable persistence.

### PR 5: Internal canary activation proposal

- Only after the stability window passes.
- Requires explicit approval because it changes production behavior and Data Moat learning ownership.

## Recommendation: exact next implementation PR

The next implementation PR should be **diagnostic readiness report only**.

Rationale:

- The latest Bruno result is promising but represents one run, not repeated stability.
- The architecture should not move to persistence ownership until parity, warning stability, fallback attribution, and Knowledge Evolution interactions are measured over time.
- A readiness report strengthens the Intelligence Moat by making migration evidence structured and comparable without changing production behavior.
- It creates the evidence base needed for a later feature-flag scaffold while preserving legacy fallback and Data Moat safety.
