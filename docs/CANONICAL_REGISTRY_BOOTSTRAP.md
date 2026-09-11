# V8-B0.1.1 Canonical Registry Bootstrap Activation Calibration

## Purpose and boundary

This phase audits unresolved `problem_observations` and previews likely canonical identities. It strengthens the Knowledge Layer by making the existing observation ledger inspectable before registry activation. It does **not** create canonical problems, aliases, evidence, promotions, snapshots, or intelligence records, and it never updates observations.

The report is a decision aid for V8-B0.2, not an instruction to merge. Its source rows are fetched through an HTTP `GET`-only repository adapter, while clustering is a pure function over a deliberately narrow, non-PII observation shape. The local artifact is gitignored.

V8-B0.1.1 adds a second, read-only decision after clustering: **high confidence does not mean auto activatable**. High confidence describes the local identity relationship within a candidate. Activation eligibility asks whether that candidate is globally unambiguous and remains supported by safe evidence. The calibration changes neither membership nor candidate identity.

## Existing deduplication audit

The generic `ProblemDeduplicationEngine` already provides model-free text normalization, stable token extraction, Jaccard overlap on a 0–10 scale, and a merge/link/review/separate vocabulary. The bootstrap reuses those generic normalization, token, and overlap primitives.

The operational engine is intentionally not called wholesale. Its candidate inputs describe live engine outputs rather than observation-ledger rows; its grouping is seed-based rather than complete-link; its ranking uses confidence scores; its default run time is nondeterministic; and its generic `8 / 6.5 / 4.5` aggregate thresholds include signals unavailable in the ledger. Discover deduplication is also not reused because it is product-flow-specific, includes solution wording, and optimizes generation diversity rather than durable identity.

## Versioned clustering contract

Rule version: `canonical_bootstrap_v1`.

* **High confidence:** exact normalized titles with no conflicting non-empty `problem_cluster`; or title-token Jaccard of at least `8.0/10` with no cluster conflict and at least one corroborator: matching non-empty cluster, overlapping affected niche, or summary-token Jaccard of at least `5.0/10`. Every member must be high-confidence against every existing member (complete-link), preventing transitive bridge merges.
* **Review required:** exact wording with conflicting clusters; title-token Jaccard of at least `4.5/10`; or some title overlap plus summary overlap of at least `5.0/10`, when the high-confidence contract is not met.
* **Singleton:** no bounded high-confidence or review relationship. A singleton remains a separate candidate for audit purposes.

These bootstrap thresholds are deliberately more conservative than the engine's generic aggregate score. Opportunity, pain, revenue, urgency, trend, buying, frequency, source-quality, and confidence scores never participate in identity decisions.

## Candidate titles and aliases

The candidate title is always an existing observation title. Selection orders by normalized-title recurrence, total title overlap with all cluster members, token specificity, shorter original length, byte-wise title, then observation ID. No prose is synthesized.

Alias previews contain distinct original titles and stored normalized titles, normalized in memory for comparison. They are sorted and never persisted. If one normalized alias appears under multiple output candidates, the report lists an `ambiguousAliasCollision`; it does not force global uniqueness or merge those candidates.

## Versioned activation eligibility contract

Activation rule version: `canonical_activation_eligibility_v1` (separate from `canonical_bootstrap_v1`). Every candidate retains its bootstrap `disposition` and additionally receives an `activationDisposition`, sorted `activationBlockReasons`, and sorted trusted/ignored affected-niche diagnostics.

Only a `high_confidence_cluster` can be `auto_activatable`. Review-required clusters and singletons are always `blocked_for_review`. A high-confidence cluster is blocked when any of these gates fails:

1. **Global alias uniqueness:** a normalized alias owned by distinct candidates blocks every owner with `ambiguous_alias_collision`. No winner is selected and no alias is persisted.
2. **Global identity uniqueness:** a normalized candidate title or identity-defining normalized observation title owned by distinct candidates blocks every owner with `duplicate_normalized_identity_across_candidates`. This stronger identity collision is reported separately; candidates are not auto-merged.
3. **Cluster compatibility:** conflicting non-empty `problem_cluster` values block eligibility.
4. **Trusted corroboration and complete link:** every near-duplicate pair must retain its original complete-link relation using matching cluster, summary corroboration, or overlapping *trusted* affected niches. If filtering contaminated niches removes the only corroborator, `insufficient_trusted_context` blocks the candidate.

Exact normalized-title duplicates are the safest initial bootstrap candidates because their identity does not depend on context corroboration. They are normally auto activatable only when globally unique, cluster-compatible, and free of every activation blocker. “Auto activatable” remains a dry-run recommendation, never an activation action.

### Conservative trusted-context filter

Historical `affected_niches` values remain unchanged and remain visible in observation audits. In memory only, the calibration normalizes and classifies each value for whether it may corroborate identity. It accepts a short category label (for example `agencies`, `freelancers`, `small businesses`, `professional services`, `sales teams`, `operations teams`, `retail`, `saas companies`, `b2b companies`, or `independent consultants`). It rejects empty or long phrases, numeric/debug strings, product and pipeline vocabulary, and sentence-like claim vocabulary.

Thus values such as `data moat`, `weekly intelligence`, `evidence multiple signals sources 1 5 7 8`, and prose such as `manual workflows lead to errors delays poor visibility` are ignored for corroboration. This is deliberately a bounded safety heuristic rather than a general niche ontology: uncertainty is ignored, never cleaned, rewritten, deleted, or written back.

The summary separates auto-activatable high-confidence candidates from blocked high-confidence candidates and reports observation counts for both. Its `blockedBy...` fields count affected high-confidence **candidates**, not exclusive buckets. A candidate with multiple reasons contributes once to each applicable reason total, so reason totals may overlap.

## Determinism and report interpretation

Candidate IDs are SHA-256 prefixes over the rule version plus sorted observation IDs and fingerprints. Input rows, members, niches, aliases, reasons, collisions, and clusters are explicitly sorted with code-point comparisons rather than locale-sensitive ordering. There are no clocks, UUIDs, random values, model calls, or database ordering assumptions.

Before V8-B0.2, reviewers should inspect:

1. every `auto_activatable` high-confidence cluster, beginning with globally unique exact duplicates;
2. every blocked high-confidence cluster and all of its potentially overlapping reasons;
3. every `review_required` cluster for materially different jobs or affected users;
4. both collision indexes for phrases that cannot safely identify one canonical problem;
5. trusted versus ignored niche diagnostics, especially near-duplicate candidates;
6. the singleton volume for under-clustering caused by sparse summaries, niches, or clusters;
7. exact-title groups whose context conflict prevented a high-confidence disposition.

No percentage in the report represents canonical confidence.

## Running against production

With the repository's normal server environment configured, run:

```bash
npm run canonical-bootstrap:dry-run
```

The command performs paginated `GET` requests selecting only unresolved observations and writes `artifacts/canonical-bootstrap-dry-run.json`. There is no apply, write, or commit mode. The credential is used only as authorization for these reads and is never included in output.
