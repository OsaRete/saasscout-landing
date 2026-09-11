# V8-B0.1 Canonical Registry Bootstrap Dry Run

## Purpose and boundary

This phase audits unresolved `problem_observations` and previews likely canonical identities. It strengthens the Knowledge Layer by making the existing observation ledger inspectable before registry activation. It does **not** create canonical problems, aliases, evidence, promotions, snapshots, or intelligence records, and it never updates observations.

The report is a decision aid for V8-B0.2, not an instruction to merge. Its source rows are fetched through an HTTP `GET`-only repository adapter, while clustering is a pure function over a deliberately narrow, non-PII observation shape. The local artifact is gitignored.

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

## Determinism and report interpretation

Candidate IDs are SHA-256 prefixes over the rule version plus sorted observation IDs and fingerprints. Input rows, members, niches, aliases, reasons, collisions, and clusters are explicitly sorted with code-point comparisons rather than locale-sensitive ordering. There are no clocks, UUIDs, random values, model calls, or database ordering assumptions.

Before V8-B0.2, reviewers should inspect:

1. every `high_confidence_cluster`, especially context spanning multiple niches;
2. every `review_required` cluster for materially different jobs or affected users;
3. `ambiguousAliasCollisions` for phrases that cannot safely identify one canonical problem;
4. the singleton volume for under-clustering caused by sparse summaries, niches, or clusters;
5. exact-title groups whose context conflict prevented a high-confidence disposition.

No percentage in the report represents canonical confidence.

## Running against production

With the repository's normal server environment configured, run:

```bash
npm run canonical-bootstrap:dry-run
```

The command performs paginated `GET` requests selecting only unresolved observations and writes `artifacts/canonical-bootstrap-dry-run.json`. There is no apply, write, or commit mode. The credential is used only as authorization for these reads and is never included in output.
