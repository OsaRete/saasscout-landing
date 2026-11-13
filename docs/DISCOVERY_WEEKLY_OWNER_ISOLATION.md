# Beta security: Weekly context isolation in Discovery

## Root cause and demonstrated exposure

Remote `main` was verified as `9219f0f943e1727ce1df50c459b5f14de336cf35`.
This fix starts from that commit in a separate worktree and focused branch.

The existing path was:

1. `POST /api/discover-opportunities` calls `requireUser`, which validates the
   bearer token with Supabase `auth.getUser`. The route passes `user.id` to
   `discoverOpportunitiesWorkflow`; it does not take identity from the body.
2. The workflow scoped the profile and Discovery history to that user, but called
   `collectDataMoatSources()` without identity.
3. The collector used `SUPABASE_SERVICE_ROLE_KEY` to read the newest 15
   `weekly_detected_problems` and newest 20 `weekly_sources` globally. Service-role
   access bypasses owner RLS. Both child tables inherit ownership from
   `weekly_intelligence_runs.user_id` through their `run_id` foreign keys.
4. Child titles, summaries, evidence and snippets became `moatSources`. These
   entered the initial and replacement `analyzeSignals` model prompts. Source
   URLs also traveled into downstream source adapters/Snapshot input.
5. Generated summaries and problems were saved under the caller's Discovery and
   returned by the API. The same source collection reached optional modular and
   Snapshot paths; generated problems retained the existing aggregate and
   Knowledge Evolution write paths.

The regression uses synthetic owners A/B, real API/auth/workflow code and real
supabase-js query/header construction. Database/auth transport, external
collection and the AI provider are mocked. A deterministic provider echoes its
actual context into summary/evidence so downstream contamination is observable.
Against the original two implementation files, the A regression fails with:

```text
{ modelInput: true, apiOutput: true, persistedWrites: true, snapshotInput: true }
```

Each value means B's private synthetic marker reached that stage. The response
was HTTP 200. Snapshot input is captured at its adapter boundary; this does not
claim an actual Snapshot database write or production incident. With the fix,
all four values are false for both owners. No production rows or paid AI calls
were used.

## Security invariant and implementation

A private Weekly child can enter Discovery context only when its joined parent
has `user_id === authenticated user.id` and its `run_id` matches that parent's ID.

The workflow now supplies its server-authenticated identity to the collector.
Both child queries use
`select("*,weekly_intelligence_runs!inner(id,user_id)")` and
`eq("weekly_intelligence_runs.user_id", userId)`. The parent predicate is applied
before the existing child ordering and limits, avoiding foreign rows consuming
the same-owner budget. Each returned child is checked again against the joined
parent before projection. Missing identity rejects before client construction;
missing, malformed or mismatched ownership excludes the row; query errors stop
generation rather than retrying without ownership constraints.

Ownerless/global historical Weekly rows are not treated as private owner context.
The current Weekly GET projection likewise requires an explicit matching owner;
legacy permissive RLS is not used to infer Discovery authorization. Separately
authorized shared `problem_intelligence` reads retain their existing query,
shape, ordering, scores and limits. The final 30-source cap is unchanged.

The boundary stays in the existing collection layer. No architecture, RLS,
grants, service-role permissions, qualification, promotion or shared-consumption
policy changes are required. This protects the Data Moat from fresh cross-owner
input contamination without changing its learning rules.

## Exact files changed

- `lib/knowledge/discovery-data-moat-sources.ts`: require caller identity and
  enforce parent/child ownership at data access and projection.
- `lib/intelligence/discover-opportunities-workflow.ts`: pass authenticated ID.
- `tests/discovery-data-moat-sources.test.ts`: preserve query/shape/rank/score/cap
  coverage; add missing-identity, mixed-parent and shared-only regressions.
- `tests/discovery-weekly-owner-isolation.test.ts`: API-to-model-to-output
  regressions with synthetic transports and mocked AI.
- `docs/DISCOVERY_WEEKLY_OWNER_ISOLATION.md`: reproduction, contract and delivery
  considerations.

## Verification

- Original-code reproduction: expected failure, proving all four exposure stages.
- Focused compatibility run: 120 tests passed, zero failures/skips, across the
  collector, API isolation, Discovery deduplication/source/response/assisted
  persistence, Weekly ownership/quality/consolidation/external evidence/model
  output/monitoring, and Knowledge Evolution Discovery/Weekly diagnostics suites.
- Final security run, after adding the shared-only case: 13 tests passed across
  `discovery-data-moat-sources.test.ts` and
  `discovery-weekly-owner-isolation.test.ts` (121 distinct tests covered overall).
- `npm run lint -- --ignore-pattern 'work/**'`: passed, zero errors; four existing
  warnings in unrelated Discover/Saved/Scans pages. Changed-file ESLint: passed.
- Affected route, workflow, collector, their imported dependencies and both
  security test files: strict TypeScript check passed using a temporary config
  extending repository `tsconfig.json` with those entrypoints.
- `npm run build`: passed with the repository's normal Next.js 16.2.4 settings.
- Repository-wide `tsc --noEmit --incremental false`: 175 diagnostics, identical
  byte-for-byte to a clean copy of verified main after route type generation;
  no diagnostics in changed files. The production build's test-file diagnostic
  filtering does not establish a clean repository-wide TypeScript baseline.
- `git diff --check`: passed.

Coverage includes A-owned context, reciprocal B isolation, malicious client
owner fields, missing/empty/invalid bearer credentials, missing collector
identity, query failures on either Weekly table, foreign/ownerless/orphaned and
mismatched parent/child projections, shared-only context, both initial and
replacement model inputs, persisted mock writes, Snapshot adapter input and
returned output. No broad database/paid-provider suites were run.

## Remaining risks, deployment and rollback

No migration or production configuration change is required. The joins use
existing foreign keys. A missing/stale PostgREST relationship or query failure
fails closed with a generic API error; no unscoped fallback exists. Actual
production catalog and data were not inspected. Query construction and synthetic
transport behavior are tested; a live PostgREST integration was not exercised.

This is preventive. Historical discoveries, aggregates and Snapshots were not
audited, sanitized or rewritten. Any investigation of past contamination needs
separate authorization. Existing optional Knowledge Evolution historical
diagnostics remain independent and unchanged; they do not feed this model input
or Discovery API response. Existing shared aggregate semantics remain intact.

Deploy the reviewed application code through the normal release process after
required PR checks/review. Use synthetic owners for an independently authorized
post-deployment isolation check; never log tokens or private prompt content.
Keep Validation configuration unchanged. No Validation activation, PR #235
change, B4.3-F4 work, merge or deployment is included here.

Rollback requires no schema reversal, but reverting this fix restores the known
leak. Prefer a forward fix; if rollback is unavoidable, restrict Discovery access
through the separately approved operational process until isolation is restored.
Do not widen RLS or grants as a workaround.

Recommendation: **GO for a code-only merge of this focused fix**, subject to
normal required CI/review, with the unchanged 175-diagnostic repository TypeScript
baseline explicitly recorded. This is not deployment or Validation-activation
approval.
