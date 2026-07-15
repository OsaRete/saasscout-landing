# Scan Score Calibration Foundation

## Status

Scan score calibration is currently **Shadow Mode only**. It calculates deterministic engineering scores after strict JSON parsing, output validation, grounding validation, and Scan Quality Diagnostics computation. It does not replace model-generated scores, affect ranking, change API success responses, persist data, change UI values, modify prompts, or select models.

## Why calibration exists

The Scan model still returns `confidence_score` for Analyze Evidence and `score` for each generated opportunity on a 1-10 scale. Those values are useful model judgments, but they are not treated as calibrated truth because they may vary across executions and are not guaranteed to reflect the same evidence conditions. The calibration foundation creates a comparable, explainable, deterministic shadow measurement from validated grounding and diagnostics.

## Canonical range

The canonical internal range is **0-1**. Presentation equivalents are derived deterministically:

- `score10 = score01 * 10`
- `score100 = score01 * 100`

Presentation values are rounded consistently. The score is not a probability, not accuracy, and not market success probability.

## What the score measures

This score measures **evidence-adjusted support under the current Scan contract**.

It does **not** measure the probability that a business will succeed. It does not estimate real market size, willingness to pay, competition strength, founder-market fit, acquisition cost, retention, profitability, or implementation feasibility unless those concepts are directly supported by the current validated contract and diagnostics.

## Current input signals

Analyze Evidence calibration uses aggregate Scan Quality Diagnostics, including grounding coverage, evidence coverage, independent evidence count, source-kind diversity, specificity, contract completeness, topic coverage, evidence concentration, unsupported claims, invalid/missing references, inference share, contradictions, duplication, and genericity indicators.

Generate Opportunities calibration derives per-opportunity diagnostics from each opportunity grounding object, including grounded claim share, inference share, distinct valid evidence IDs, direct pain/customer support, rationale/pricing/score/difficulty support mode, concentration, invalid references, duplicate references, duplication with other opportunities, and specificity.

## Versioned policy

Weights and thresholds are centralized in the immutable `scan-calibration@1` policy. The weights are engineering policy, not statistically learned coefficients. Future versions must use a new version identifier and should be benchmarked before any controlled influence mode is considered.

## Reliability classification

Each score is paired with a deterministic reliability classification:

- `insufficient_evidence`
- `single_source`
- `limited_support`
- `corroborated`
- `contradicted`

The classifier considers valid evidence count, evidence concentration, source-kind diversity, evidence-vs-evidence contradictions, invalid references, and unsupported claims. A single pasted evidence block cannot produce high-confidence market validation by itself.

## Current limitations

Calibration uses only signals already available in the current Scan contract and diagnostics. It is intentionally conservative, does not use an LLM, does not learn from benchmarks yet, and does not create Knowledge Fusion, Retrieval, Scan Artifacts, migrations, or persistence. Before any user-facing or ranking influence, SaaSScout needs offline benchmark evaluation against stable evidence-quality and outcome datasets.
