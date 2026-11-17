# Public participant integrity and bounded collection — PR 1

Baseline: `main` at `0722e5a045e9ac230e50c541ff93c2ae5a5356d0`, verified by remote fetch. Branch: `codex/public-participant-integrity`. The owner supplied the authoritative Comprehensive Public Beta Launch Audit findings in the task; no standalone audit file exists. PRs #245/#246 are already present and untouched.

## Repaired contracts

Survey, External MVP and Commercial Intent share a small in-memory request controller. It snapshots the serialized body, UUID and original publication URL synchronously, guards concurrent clicks, and reuses the exact bytes after lost or ambiguous responses. Editable controls stay locked while held. No answer/contact snapshot enters localStorage, sessionStorage or cookies. An accepted JSON response is required for success; malformed JSON, unexpected shapes/statuses and unrecognized 4xx responses retain the request. Success and terminal states prevent further sends.

A server-only error marker (`error.submissionRejected: true`, HTTP 400 / `invalid_request`) permits correction and a new UUID only for deterministic parsed-input validation or specifically recognized transactional SQL validation failures. JSON parsing/stream errors, unexpected SQL errors and transport failures cannot emit this marker. Known `P0002` closure and `23505` idempotency conflicts remain distinct; unknown RPC failures now return 500 rather than masquerading as closure. Rate limits retain the held request and enforce the Retry-After wait. Closure/conflict stop further submissions and explain the uncertainty; they do not claim prior non-persistence.

The additive `20261120000000_validation_public_collection_bounds.sql` migration:

- Replaces Survey's process-local resolve/submit budget with exact-publication PostgreSQL buckets. Full token-scoped network hashes replace truncated token/address keys; raw addresses are not retained. Existing ten/minute Survey, twenty/minute Landing and sixty/minute Prototype network budgets remain.
- Adds 600 aggregate operations/minute/publication before allocating a network bucket. Survey resolution shares its prior resolve/submit budget; Landing/Prototype resolution remains read-only and unmetered. These resource controls are independent of monthly Scan/Discovery admission and provider spending.
- Serializes public admissions on the exact experiment version using a transaction advisory lock after the existing publication/lifecycle locks. This covers different application instances and replacement publications without adding reverse owner lock dependencies.
- Adds private version-scoped durable usage: 1,000 submissions for Survey/Landing/Prototype; 10,000 events for Landing/Prototype. Only actual inserts consume cumulative units. Identical retries remain accepted at capacity, subject to rate admission; changed Survey/Prototype submission payloads retain their conflict semantics.
- Seeds usage from all retained historical records, including revoked publications, under evidence-table locks. Published content, evidence, answers, owner attribution and retained-row metrics are unchanged. Previously erased Landing contacts cannot be reconstructed: seeded historical consumption is a retained-data floor. All consumption after migration survives contact erasure and replacement; no application path refunds it.
- Prunes expired publication buckets before returning limited outcomes. Aggregate counters saturate at 601 and network counters at limit+1, avoiding integer overflow. At most 600 distinct network buckets can be created per active publication/minute; old active-publication buckets are pruned after one day. Revoked-publication buckets receive no new traffic and retain their last bounded window.
- Returns limited/capacity outcomes normally so PostgreSQL commits admission charges. Survey's inner validation/persistence subtransaction returns recognized rejection/conflict results without rolling back outer admission. Unexpected database faults still fail atomically.
- Retires service-role EXECUTE on the legacy four-argument Survey RPC: old applications cannot safely interpret limited results and now fail closed. The five-argument RPC and resolution admission RPC are service-only. New tables have RLS, no browser grants/policies, and no service-role DELETE grant on cumulative usage. Existing public/table/owner boundaries remain.

Landing and Prototype retain their signed-cookie, consent, navigation, contact uniqueness/removal and publication lifecycle contracts. Existing result metrics still describe retained records; consumption counters are resource accounting, not evidence or verified people. All six methods, private/shared separation, evidence polarity, B4.3 F4 denial, flags, authentication/admin boundaries and provider paths are preserved. No AI observations or shared promotion is added.

## Focused acceptance

Commands (no paid-provider calls):

```sh
node --loader ./tests/support/server-only-loader.mjs --test tests/validation-public-submission.test.ts tests/validation-surveys.test.ts tests/validation-survey-required-answers.test.ts tests/validation-external-mvp.test.ts tests/validation-commercial-intent.test.ts tests/validation-landing-pages.test.ts tests/validation-prototypes.test.ts tests/validation-release-boundary.test.ts tests/validation-capability-resources.test.ts tests/validation-database-fixtures.test.ts
npm run lint -- --ignore-pattern 'work/**'
npm run build
```

The focused TypeScript config extends repository tsconfig with ES2022, strict/noEmit and includes affected server/client/API entrypoints, new unit tests, browser tests and the DB runner. Repository-wide tsc is not claimed; the baseline has documented unrelated test diagnostics.

Database acceptance uses a task-created `postgres:17-alpine` Docker container with `--network none`, no host port and no production credentials. `scripts/validation-public-collection-db.ts` rejects all remote URLs and requires `VALIDATION_PUBLIC_COLLECTION_DISPOSABLE=1` plus an allowlisted task-container name. Start the container and wait for pg_isready before invoking:

```sh
VALIDATION_PUBLIC_COLLECTION_DISPOSABLE=1 \
VALIDATION_PUBLIC_COLLECTION_CONTAINER=saasscout-public-integrity-test-review \
node --loader ./tests/support/server-only-loader.mjs scripts/validation-public-collection-db.ts --prepare
# A different empty task container tests fresh installation with --prepare --fresh.
```

`--prepare` applies the complete application migration chain with a minimal synthetic Auth schema. Upgrade mode seeds actual Survey answers, Landing views/contacts and Prototype events/feedback before the new migration, compares complete historical row JSON and verifies retained usage. Fresh mode applies the whole chain before the same tests. Independent PostgreSQL connections race for the last cumulative units and verify retries, publication-wide exhaustion without rejected-network allocation, exact per-network limits, pruning, rejection/conflict commit accounting, replacement, contact removal, pause/revocation, RLS, actual role/table/RPC denials and retirement of the legacy Survey entry. The four existing method SQL suites run in rolled-back transactions to check original consent/navigation/owner/history/metric contracts.

The fixture manifest changes only the reviewed hash for the error-contract helper; qualification and promotion implementations are untouched.

Nine Chromium scenarios run against a local production build with synthetic API fixtures: all three forms exercise definitive correction/new identity, two synchronous clicks, a persisted response followed by an aborted HTTP response, identical retries, malformed success, rate-limit wait and valid accepted completion; each also exercises closed and conflicting publications. The fixtures assert one simulated persisted response and no answer snapshots in browser storage. The dedicated CI workflow runs these checks and fresh/upgrade database jobs.

These checks do not establish live Supabase Auth/PostgREST/schema-cache behavior, real hosting forwarded-IP provenance or Preview/Production acceptance. Preview is documented as sharing Production credentials and was not used. Local test-process capabilities are unrelated to production configuration.

## Verified local results

- 3,127 focused Node tests passed, zero failures/skips; final renamed test binding rechecked separately.
- Eleven Chromium participant tests passed: nine new recovery/closure/conflict scenarios and two existing mobile consent/contact/retry scenarios.
- Complete application migration chain and all collection acceptance assertions passed for both populated upgrade and fresh installation on isolated PostgreSQL 17. Both paths also passed all four existing method SQL suites.
- Normal production Next build passed, including application TypeScript. Focused strict TypeScript passed for affected APIs/server/client modules, tests and runner.
- Repository ESLint passed with zero errors and four pre-existing unrelated warnings; final changed-file lint and whitespace check passed.
- No live Auth/PostgREST, Preview/Production requests, paid-provider calls, merge, production migration, deployment or activation. Remote final-head CI remains separate from these local results.

## Deployment and recovery requirements

No deployment, merge, production SQL, environment edit or public activation is authorized by this PR.

1. Obtain normal owner approval for the exact reviewed migration/application artifact. Verify intended project identity, migration history, backup/PITR, grants and the existing default-off release checklist.
2. Keep all public Validation collection disabled and drain any in-flight public requests/old artifacts before migration. Old servers must not write between usage seeding and the new deployment. The migration takes evidence-table locks and scans retained history; plan an appropriate maintenance window.
3. Apply this one new migration transactionally, after existing migrations through `20261119000000`. Do not replay/edit older migrations. It sends a PostgREST schema-reload notification; verify the new five-argument RPC, resolution RPC, retired four-argument permission and table/RLS grants through the intended catalog/API.
4. Deploy the reviewed application disabled. Old Survey artifacts fail closed after migration. Older Landing/Prototype application artifacts can misinterpret capacity results, so retire them before any separately authorized activation. Smoke the disabled routes, then perform isolated real two-owner Auth/PostgREST and participant acceptance before enabling anything.
5. Retain the migration and cumulative counters on recovery. Never delete/refund counters, widen grants or restore the legacy Survey entry. Keep ingress off if reverting application code; prefer a reviewed forward fix.

Remaining launch blockers include final-head CI/review, approved operational deployment/default-off verification, live isolated Auth/PostgREST two-owner acceptance, trusted forwarded headers, and existing method/privacy/retention/support and Beta activation gates. This PR supplies neither activation nor paid-spending approval. Recommendation: GO for review and default-off code merge only with green final-head CI and the existing release checklist; NO-GO for public activation on local tests alone.

## Exact changed files

- `.github/workflows/validation-public-integrity.yml`
- `app/api/public/surveys/[token]/responses/route.ts`
- `app/api/public/surveys/[token]/route.ts`
- `app/validation/survey/[token]/public-survey.tsx`
- `components/validation/commercial-intent-experience.tsx`
- `components/validation/external-mvp-experience.tsx`
- `components/validation/use-public-submission.ts`
- `docs/IDEA_VALIDATION_SURVEYS.md`
- `docs/VALIDATION_PUBLIC_PARTICIPANT_INTEGRITY.md`
- `e2e/validation-commercial-intent.spec.ts`
- `e2e/validation-external-mvp.spec.ts`
- `e2e/validation-public-integrity.spec.ts`
- `lib/validation/public-submission.ts`
- `lib/validation/server/commercial-intent-http.ts`
- `lib/validation/server/commercial-intent.ts`
- `lib/validation/server/contracts.ts`
- `lib/validation/server/external-mvp-http.ts`
- `lib/validation/server/external-mvp.ts`
- `lib/validation/server/landing-pages.ts`
- `lib/validation/server/prototypes.ts`
- `lib/validation/server/public-survey-http.ts`
- `lib/validation/server/surveys.ts`
- `scripts/validation-public-collection-db.ts`
- `supabase/migrations/20261120000000_validation_public_collection_bounds.sql`
- `tests/support/validation-database-fixtures.manifest.json`
- `tests/validation-capability-resources.test.ts`
- `tests/validation-public-submission.test.ts`
- `tests/validation-survey-required-answers.test.ts`
- `tests/validation-surveys.test.ts`
