# V8-B0.1.2 Canonical Registry Bootstrap Identity Fragmentation Audit

## Purpose and boundary

This phase audits unresolved `problem_observations` and previews likely canonical identities. It strengthens the Knowledge Layer by making the existing observation ledger inspectable before registry activation. It does **not** create canonical problems, aliases, evidence, promotions, snapshots, or intelligence records, and it never updates observations.

The report is a decision aid for V8-B0.2, not an instruction to merge. Its source rows are fetched through an HTTP `GET`-only repository adapter, while clustering is a pure function over a deliberately narrow, non-PII observation shape. The local artifact is gitignored.

V8-B0.1.1 adds a second, read-only decision after clustering: **high confidence does not mean auto activatable**. High confidence describes the local identity relationship within a candidate. Activation eligibility asks whether that candidate is globally unambiguous and remains supported by safe evidence. The calibration changes neither membership nor candidate identity.

V8-B0.1.2 adds a third, post-cluster decision: **initially auto activatable does not mean globally distinct**. It asks only whether two candidate identities could plausibly be wording variants of one canonical problem. It never decides that they are equivalent. This distinction protects the Data Moat from fragmentation, where future evidence would be split across near-duplicate canonical records, without accepting the equally dangerous risk of an automatic false merge.

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

## Versioned cross-candidate identity audit

Audit rule version: `cross_candidate_identity_audit_v1`. Observation clustering remains exactly `canonical_bootstrap_v1`; the new audit runs only after B0.1.1 activation calibration and never changes candidate membership, candidate IDs, titles, aliases, semantic dispositions, or base activation results.

The comparison scope includes every pair of initially auto-activatable candidates and every pair between an initially auto-activatable candidate and a blocked high-confidence or review-required candidate. Blocked singletons are excluded as comparison partners because one unsupported observation is not enough to block an otherwise eligible cluster. A base activation gate therefore cannot hide a plausible identity split in a substantive candidate.

Candidate titles and alias previews are represented with the shared `normalizeProblemText`, `extractProblemTokens`, and `calculateOverlapScore` primitives. A deliberately tiny morphological equivalence table treats `inefficient`/`inefficiency`/`inefficiencies`, singular/plural `workflow`, and singular/plural `operation` as the same comparison token. This table is bounded to observed structural variants and is not a synonym dictionary. Broad tokens such as `manual`, `workflow`, `automation`, `operation`, `business`, and the normalized inefficiency token cannot provide the required distinctive shared token by themselves.

A pair is reported only when it has at least one conservative identity signal:

1. **Near identity:** title-token Jaccard is at least `8.0/10`, at least three title tokens are shared, and at least one shared token is not in the bounded generic-token set.
2. **Base plus consequence/modifier:** the smaller title has at least four tokens; all of those tokens occur in the larger title (`10.0/10` containment); the larger title adds at most six tokens; at least one shared token is distinctive; and either title contains the bounded connector `causing`, `leading`, or `resulting`.
3. **Strong alias identity:** the strongest cross-candidate alias Jaccard is at least `9.0/10`, while the candidate titles share at least three tokens including one distinctive token.
4. **Segment-qualified variant:** all additional title tokens occur in the longer candidate's trusted affected-niche representation, and matching problem-cluster or overlapping trusted-niche context corroborates the relationship.

Compatible or conflicting non-empty problem clusters and exact trusted-niche overlap are reported as context facts and stable reason codes. They make the diagnostic explainable but do not independently create a collision. `ignoredAffectedNiches` never corroborate identity. Scores for pain, revenue, urgency, trend, buying signal, opportunity, and confidence are absent from this audit.

Potential collision groups are deterministic connected components of reported pairs. Thus `A ↔ B` and `B ↔ C` produce one joint review group, but the group does **not** claim that A, B, and C are equivalent. No winning title, merged candidate, canonical ID, alias reassignment, or observation reassignment is produced.

Each candidate preserves B0.1.1's `activationDisposition` as its base result. The separate `crossCandidateAuditDisposition` is `clearly_unique`, `potential_canonical_collision`, or `not_applicable`, and `finalActivationDisposition` applies the additional safety gate. Any initially auto-activatable candidate in a collision becomes finally `blocked_for_review`; an already blocked candidate remains blocked. The summary therefore separately reports initial auto eligibility, final auto eligibility, newly blocked candidates, collision pairs, and review groups. The audit also lists initially eligible candidates that match an already blocked candidate.

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

The entire B0.1.2 path is deterministic, read-only, and model-free. It has no Supabase mutation client, write/apply mode, external API, OpenRouter or other model call, embeddings, clock input, randomness, or persistence path. Its output is local diagnostic JSON only.

## Running against production

With the repository's normal server environment configured, run:

```bash
npm run canonical-bootstrap:dry-run
```

The command performs paginated `GET` requests selecting only unresolved observations and writes `artifacts/canonical-bootstrap-dry-run.json`. It remains read-only: the separate B0.2 apply command described below is the only bootstrap mutation path. The credential is never included in output.

## V8-B0.2 — controlled registry activation

B0.2 is the first write-enabled bootstrap phase. It does not change B0.1 clustering, B0.1.1 calibration, or B0.1.2 identity auditing. It selects only `high_confidence_cluster` candidates whose base disposition is `auto_activatable`, whose cross-candidate disposition is `clearly_unique`, and whose final disposition remains `auto_activatable`. Blocked, review-required, singleton, and collision-group candidates remain unresolved.

Its write boundary is deliberately limited to creating `canonical_problems`, inserting observed-title `problem_aliases`, linking exact member rows through `problem_observations.canonical_problem_id`, and recording the private `canonical_bootstrap_activations` identity mapping. It never writes Validation, Weekly Intelligence, `problem_intelligence`, or `problem_evolution_snapshots`. V8 Validation evidence promotion and V9 Knowledge Evolution consumption are still **not implemented**.

### Schema safety audit and migration

The existing schema already used database-owned UUID canonical IDs, a canonical-key unique index, an observation foreign key, RLS, and service-role-only table grants. It did not provide a durable bootstrap candidate mapping, global normalized canonical/alias ownership constraints, or an atomic multi-table operation. Migration `20260912000000_controlled_canonical_bootstrap_activation.sql` therefore adds only:

- the private, RLS-enabled `canonical_bootstrap_activations` ledger;
- global unique normalized-title and normalized-alias indexes;
- the transaction-scoped `apply_canonical_bootstrap_activation` RPC.

The RPC is `SECURITY DEFINER` with a fixed `pg_catalog, public` search path. Execute is revoked from `public`, `anon`, and `authenticated`, and granted only to `service_role`. There is no route, browser API, anon grant, cron, trigger, or automatic production execution. B0.1/B0.1.1/B0.1.2 eligibility and activation-plan legitimacy are recomputed by the trusted operator CLI. The RPC is the transactional database-integrity boundary: it validates bounded structural and ownership invariants but does not independently execute the TypeScript analyzer or prove semantic eligibility. Direct service-role invocation is therefore privileged, trusted infrastructure access rather than a public authority boundary.

### Reviewed plan and drift guard

Every dry-run now emits `activationPlan`, sorted by candidate ID. Each candidate snapshot hashes stable bounded identity fields: candidate ID/title/normalized title, sorted observation IDs, deduplicated and sorted observed aliases, all three dispositions, and all three rule versions. It excludes timestamps, evidence bodies, PII, scores, and display diagnostics. The overall `activationPlanHash` hashes the rule versions plus every sorted candidate ID/snapshot hash pair.

An operator must review that report and pass the exact hash back; candidate lists or uploaded JSON are not accepted as authority:

```bash
npm run canonical-bootstrap:dry-run
CANONICAL_BOOTSTRAP_APPLY=1 \
CANONICAL_BOOTSTRAP_PLAN_HASH=<reviewed-64-character-hash> \
npm run canonical-bootstrap:apply
```

Apply immediately rereads unresolved observations, reruns the deterministic pipeline, rebuilds the snapshots, and compares the reviewed plan hash before calling the private RPC. A changed plan fails closed. The acknowledgement variable makes accidental execution harder; neither variable substitutes for service-role authorization.

### Atomicity, conflicts, and idempotency

The RPC is one PostgreSQL transaction. It takes one transaction advisory lock before checking any candidate, then checks candidates in sorted order; this global-first lock order prevents two bootstrap applies from creating duplicate state. Global preflight rejects duplicate candidate IDs and any observation ID repeated either within one candidate or across candidates. All candidates are preflighted before mutation. A failure rolls back canonical creation, aliases, observation links, and ledger rows together.

The ledger maps analysis IDs to database-owned canonical UUIDs and stores the snapshot hash and exact observation IDs. Identical existing mappings are reused; a different hash fails with `canonical_bootstrap_candidate_snapshot_mismatch`. Canonical normalized identity and normalized alias ownership are globally unique and conflicts fail closed. Before B0.2, `canonical_problems(normalized_title)` and `problem_aliases(normalized_alias)` had non-unique lookup indexes only; their existing unique indexes covered `canonical_key` and `(canonical_problem_id, normalized_alias, alias_type)` respectively, so neither was equivalent to the global ownership constraints added here. Observation updates affect only recomputed member IDs that are null (or, on a database-level repeat, already reference the mapped canonical); another canonical is never overwritten. After every update, exact ownership of every expected member is verified before already-linked rows are counted. Aliases come only from normalized observed title variants—no semantic synonym is generated.

Stable operator-safe errors include `canonical_bootstrap_apply_not_authorized`, `canonical_bootstrap_preflight_failed`, `canonical_bootstrap_candidate_snapshot_mismatch`, `canonical_bootstrap_identity_collision`, `canonical_bootstrap_alias_collision`, `canonical_bootstrap_observation_conflict`, and `canonical_bootstrap_transaction_failed`. Reports contain bounded counts and safe IDs/hashes, never credentials or source evidence.

### Production runbook

1. Pull the merged branch and confirm a clean `git status`.
2. Review `supabase migration list`, run `supabase db push --dry-run`, apply the migration, and verify the list again.
3. Run `npm run canonical-bootstrap:dry-run` against production.
4. Manually review the current final eligible candidates and copy the emitted `activationPlanHash`.
5. Run the explicit acknowledged apply command above with that exact hash.
6. Run the read-only dry-run and registry verification queries again. Check ledger-to-canonical uniqueness, alias ownership, exact member links, and that blocked/non-member observations remain unresolved.

Do not treat merge or migration application as approval to apply. Production activation is a separate operator decision. B0.2 creates only a conservative registry seed; it does not complete a resolver, resolve ambiguous candidates, aggregate the Data Moat, promote Validation evidence, or enable Knowledge Evolution consumption.
