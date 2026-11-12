# Beta Validation — External MVP Testing

Fresh task and dedicated branch from main `78595ae` (PR #240 already merged).
This does not continue or change that PR. Documentation-first review covered
AGENTS.md's six foundation documents, PRODUCT_ROADMAP, Validation workspace,
domain/schema/API, Customer Interviews, Surveys, Landing Pages, Interactive
Prototypes, disabled-release policy, Vercel checklist, B4.3 evidence restrictions,
auth/admin/resource lookup, migrations, UI primitives and installed Next 16 route
handler guidance. Existing source takes precedence over older interviews/surveys
scope statements. No product philosophy or strategic architecture change.

## Workflow

Use the existing **Validate this opportunity** action on an owned opportunity.
The existing subject command verifies provenance; its snapshot is context, not
participant evidence. Open its Validation workspace, define a testable hypothesis
and create **External MVP Testing**. Configure title, HTTPS URL, objective,
instructions and 1–5 short text questions. Preview desktop/mobile without opening
the destination or writing activity. Save with optimistic revision checking.

Mark ready/start using existing lifecycle controls, then publish explicitly.
Copy and keep the secret participant link; only its SHA-256 hash is stored.
Share through the channel you use to invite participants. There is no email
sender, recruitment automation or verified invitation/identity claim. Replacing
a publication revokes the prior link. Editing never changes published content.
Unpublish closes resolution/submission, including after completion. Paused or
terminal experiments cannot admit public requests; terminal authoring is closed.

Participants see only the published title, objective, URL, instructions, questions
and fixed privacy/consent copy. A plain anchor opens the external MVP in a new tab
with `noopener noreferrer nofollow` and no referrer. No redirect endpoint,
iframe, automatic fetch, DNS probe, crawl, deployment, execution, asset import,
MVP generation or modification exists. Preview contains no working external link.
The destination is displayed with a separate-site/privacy notice.

Feedback asks whether the task was completed (**self-reported**), including
“partly”, “no” and “I did not try it”, plus the authored questions. No link opening
is required or recorded. Explicit feedback consent is required. Optional email
requires a second, affirmative follow-up consent; there is no name/phone/profile
collection. UI and SQL enforce consent. Consent text and database collection time
are retained with the submission. Questions/answers retain the exact immutable
publication revision. All content is escaped text; no authored HTML executes.

Owner Results shows total submissions, retained contacts, literal self-report
counts and latest 100 raw responses with historical questions. Counts include
all retained rows, not only the displayed page. Guidance recommends inspecting
blockers, conflicting responses and follow-up before revising the hypothesis.
There is no score, inferred theme, AI interpretation, market-demand verdict,
verified identity, verified use, independence or actual-human claim. Submission
IDs represent interactions, not verified people. Bots/repeats can inflate counts.
No import or synthetic/AI generation path exists. Untrusted responses stay labeled
self-reports; they never become qualified participant observations automatically.

**Remove contact** clears the email permanently, also after completion. It keeps
raw feedback, fixed consent provenance and revision attribution. A matching retry
cannot restore a removed email. Contact erasure does not silently change feedback
counts. PII accidentally included in raw answers needs an approved privacy/support
process; there is no general answer erasure/export UI or retention job. Creator
contact is through the channel that supplied the link, as stated to participants.

## Security and storage

One additive migration: `20261114000000_validation_external_mvp.sql`. It adds
`external_mvp` to the existing family CHECK and four RLS-enabled service-only
tables: `validation_external_mvp_pages`, `validation_external_mvp_publications`,
`validation_external_mvp_submissions`, `validation_external_mvp_rate_buckets`.
Composite foreign keys bind owner, exact experiment version, page and publication.
No browser role receives table access or RPC execution. Narrow security-invoker
RPCs use fixed search paths and the established server-only admin client.
Owner HTTP commands authenticate before body/client creation and verify persisted
ownership/family before RPC. SQL repeats owner/family/lifecycle/revision checks.
Publication identity/content is immutable; feedback is immutable except restricted
email nulling/contact removal. Error output omits SQL details, tokens and feedback.

Private authoring requires an admitted exact `VALIDATION_PRIVATE_MODE` plus
`VALIDATION_PRIVATE_EXTERNAL_MVP=ENABLED`. Public publish/resolve/submit additionally
requires `VALIDATION_PUBLIC_EXTERNAL_MVP=ENABLED`. Missing, malformed, lowercase,
whitespace and unknown flag values deny. No NEXT_PUBLIC activation flag exists.
Every new API verb denies with 503/private/no-store before params/auth/body/DB
when disabled, including unsupported verbs. Participant pages are noindex,
no-referrer and unavailable when disabled; AppShell hides owner navigation.
Existing methods retain independent admission. AI, shared preparation/promotion,
qualified consumption and B4.3-F4 remain unconditionally off and unchanged.

Tokens contain 32 cryptographic random bytes (43 base64url characters); raw tokens
are returned only on publication and are not persisted. Each resolves only one
immutable publication. Owner commands lock exact experiment, page and publication
in that order; public requests follow the same order. Already admitted requests
can finish before a waiting pause/unpublish; after closure commits later access
fails. Concurrent identical publication/request UUID retries persist once; changed
payloads conflict. Network budget and idempotency checks are database-serialized.

Public POSTs require same-origin JSON, streamed body <=64 KB, UUID v4, honeypot,
strict consent, 1–5 answers <=2,000 characters each and optional email <=254.
SQL independently checks exact published question count, types, consent and
bounds; feedback JSON is capped at 44 KB, authored JSON at 24 KB. SQL projects
public fields explicitly. Rate control covers GET and POST: 60 admitted requests
per publication/network/minute, 600 per publication/minute across networks,
and 1,000 total feedback records per experiment version across publications.
Identical retries consume budget. Global budget is checked before creating a
network bucket, bounding rotating-IP growth. Old buckets are cleaned on admitted
traffic after one day; there is no scheduled retention task. Raw IPs are not
stored; hashes are scoped to the token. Deployment must replace untrusted
forwarded-IP headers; absent IP shares a conservative `unknown` bucket. These
limits bound Beta resources, not sophisticated bots or proof of humanity.

URL validation admits canonical HTTPS DNS hostnames, bounded length, no userinfo,
custom ports, fragments, IP literals, local/reserved suffixes, control characters
or backslashes. SQL repeats checks on canonical content. It does not resolve DNS
or certify the destination: an allowed hostname can resolve privately or later
redirect/change content. SaaSScout never follows it server-side, so there is no
server-side request/redirect path. Participants must assess the displayed site.

No new table writes into participants, observations, classifications, promotion
ledgers, canonical knowledge, Data Moat or Knowledge Evolution. Shared eligibility
still only supports the established interview projection; external feedback is
neither consumed nor promoted. No Discovery/Scan/Results/Weekly algorithm changed.

## Verification and activation gates

Local verification uses synthetic data only, no real participant evidence:

- Production Next build and full ESLint (four existing unrelated warnings).
- 2,574 release/route, resource, fixture and new-method regression assertions;
  149 focused existing method/workspace/body/domain regressions; six focused
  External MVP tests including the final consent-mode check.
- Local PostgreSQL 17: base Validation/server migration plus this additive
  migration, rolled-back SQL acceptance; independent connections test identical
  retries, conflicting draft revisions and observed pause/unpublish lock waits.
- Two Chromium browser fixtures: mobile participant privacy/consent/contact,
  safe retries and no external auto-request; owner edit/preview/save/publish,
  results/contact removal/unpublish. These mock HTTP, not real auth/database.
- Default-off production server smoke: all 49 verbs across seven new API routes
  return 503/no-store; participant page is unavailable/private/no-referrer.
- Existing database CI now includes the new focused tests and disposable SQL
  runner. Its final-SHA remote status must be checked separately.

Commands:

```
node --loader ./tests/support/server-only-loader.mjs --test tests/validation-external-mvp.test.ts
VALIDATION_EXTERNAL_MVP_DB_DISPOSABLE=1 node scripts/validation-external-mvp-db.ts
VALIDATION_EXTERNAL_MVP_UI_BASE=http://127.0.0.1:3001 VALIDATION_CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/validation-external-mvp.spec.ts --project=chromium
```

The database runner accepts only fixed loopback Supabase port 54322 or a task-created
`saasscout-external-mvp-test-*` local Docker container, explicit disposable opt-in
and trusted postgres role. Run on a fresh/reset disposable database; concurrency
fixtures remain there. No remote database URL is accepted. Browser fixtures need
local synthetic Supabase settings and the two exact MVP flags plus private mode.

**Before activation:** require required final-SHA CI, full migration-chain reset in
an isolated disposable Supabase, real Auth/PostgREST two-owner and anonymous/RPC
denials, contact/retry/token/rate/lifecycle integration, deployment trusted-IP
verification, privacy/retention/support review and owner-approved migration plan.
Bare PostgreSQL and mocked browsers do not establish these checks. Preview shares
Production Supabase credentials per existing docs and is not a disposable DB.

Do not apply Production migrations, enable flags, deploy, change credentials or
merge as part of this PR. Migration deployment needs separate owner approval,
project identity/history/drift review, backup/PITR, list/dry-run and normal
transactional migration runner. CHECK replacement locks experiment versions.
Deploy reviewed code disabled, verify all route verbs and old deployment URLs
using the Vercel default-off checklist, then approve activation separately.
Rollback disables public MVP first, unpublishes if necessary, then private MVP;
retain private tables/history and widened CHECK. Use an artifact containing the
release boundary. No destructive rollback or shared-path activation.

**Code-only merge recommendation:** GO only with required final-SHA CI green and
the existing default-off deployment checklist satisfied. Migration/activation is
NO-GO until the separate gates above. No live Supabase, Production or remote
Preview acceptance is claimed.

## Exact changed files

- `.github/workflows/validation-b31-database.yml`
- `app/api/public/validation/external-mvp/[token]/route.ts`
- `app/api/public/validation/external-mvp/[token]/submit/route.ts`
- `app/api/validation/external-mvp/[versionId]/publish/route.ts`
- `app/api/validation/external-mvp/[versionId]/remove/route.ts`
- `app/api/validation/external-mvp/[versionId]/route.ts`
- `app/api/validation/external-mvp/[versionId]/save/route.ts`
- `app/api/validation/external-mvp/[versionId]/unpublish/route.ts`
- `app/validation/[id]/page.tsx`
- `app/validation/external-mvp/[token]/page.tsx`
- `app/validation/external-mvp/[token]/public-external-mvp.tsx`
- `app/validation/layout.tsx`
- `components/app-shell.tsx`
- `components/validation/experiment-form.tsx`
- `components/validation/external-mvp-experience.tsx`
- `components/validation/external-mvp-workspace.tsx`
- `components/validation/plan-draft-handoff.ts`
- `components/validation/release-capabilities.tsx`
- `docs/VALIDATION_EXTERNAL_MVP.md`
- `e2e/validation-external-mvp.spec.ts`
- `lib/validation/external-mvp.ts`
- `lib/validation/server/contracts.ts`
- `lib/validation/server/external-mvp-http.ts`
- `lib/validation/server/external-mvp.ts`
- `lib/validation/server/release-policy.ts`
- `lib/validation/server/resource-policy.ts`
- `lib/validation/server/service.ts`
- `lib/validation/types.ts`
- `next.config.ts`
- `scripts/validation-external-mvp-db.ts`
- `supabase/migrations/20261114000000_validation_external_mvp.sql`
- `tests/sql/validation-external-mvp.sql`
- `tests/support/validation-database-fixtures.manifest.json`
- `tests/validation-external-mvp.test.ts`
- `tests/validation-release-boundary.test.ts`
