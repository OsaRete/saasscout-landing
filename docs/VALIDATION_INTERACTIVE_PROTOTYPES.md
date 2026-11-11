# Beta Validation — Interactive Prototypes

## Scope and source of truth

Fresh task based on main `4086b86` (PR #239 already merged), not a continuation
of Landing Pages. Foundation review covered AGENTS.md's product vision, Data
Moat, system architecture, AI principles, engine guidelines and coding standards;
PRODUCT_ROADMAP; Validation workspace, interviews, surveys, persistence/schema,
API and domain contracts; Landing Pages; the disabled-release/private capability
policy; current resource authorization, bearer auth, server admin factory,
additive migrations, UI primitives and installed Next 16 route documentation.
The current implementation takes precedence over older interviews/surveys-only
scope statements. No strategic architecture, advanced B4.3/F4 code or PR #235
is changed. This increment improves private founder research; shared knowledge
receives no automatic or manual promotion path from these records.

## Workflow and UX decisions

Use the existing **Validate this opportunity** entry to create an owner-verified
Validation subject from an owned opportunity, or open an existing workspace.
Define a testable hypothesis using the existing form. Create an **Interactive
Prototype** experiment; its default collection method describes a private concept
test. No new opportunity persistence or onboarding is introduced.

The experiment panel has Edit, Preview and Results sections. Start with Task
workflow, Project workspace or Booking journey. Each starts with three linked
screens. Edit the participant task, title, screen description, labels, CTA text
and destinations. Add/remove screens (2–6 total) and actions (1–3 per screen).
Every screen must be reachable from the first; deletion redirects affected links
to the first screen, and save validates the resulting graph. Three reusable
screen layouts provide cards, details and confirmation. No canvas, executable
HTML/JS, uploads, external assets, arbitrary URLs, AI calls or real transactions.

Preview is interactive in desktop/mobile widths and records nothing. Save uses
optimistic revision control. Mark ready/start through the existing lifecycle,
then publish explicitly. Copy and privately retain the secret link: only its
SHA-256 hash is stored, so the raw link is not recoverable later. A replacement
publication revokes the old token. Anyone holding a link can participate; this
is capability access, not participant authentication or invitation verification.

Participants see only published title/task/screens and fixed consent. No owner
navigation, results, identifiers, drafts or other responses are exposed. Consent
is required before any activity write and repeated server-side for feedback.
Participants can give feedback before completing the journey, including “no”
and “partly”; a nonempty raw comment is required. No name/email is requested.
The interface warns against personal or sensitive information. A signed HTTP-only
SameSite=Strict cookie lasts up to 30 days and groups activity for this publication.
Feedback retries retain the original request UUID and payload after uncertain
failure; identical submissions are accepted once, changed retries conflict.

Results show persisted interaction totals, publication-scoped browser identifiers,
self-reported outcomes, recorded screen views and the latest 100 raw responses
with exact publication revision attribution. Aggregates count all rows in SQL,
not a truncated API page. Screen labels reflect the current draft; underlying
screen IDs and immutable publication snapshots retain historical meaning.
There is no score, inferred sentiment, statistical significance or demand claim.
Events are unverified telemetry. Anonymous submissions are not verified humans
or independent respondents; repeated publications/devices/cookie clearing and
bots can inflate counts. Nothing enters observations, classifications, AI
interpretation, promotion ledgers, canonical knowledge or shared Data Moat.

Editing does not change published content. Remove revokes ingress and archives
the prototype while preserving publications/feedback; save restores authoring
with a new revision in a nonterminal experiment. Terminal experiments keep
read/remove/unpublish available but reject edits/publication. Removal means
archive, not erasure of the research history. There is no public self-service
withdrawal/export, contact collection or automated retention job in this Beta.
Accidentally supplied PII requires a separately approved owner privacy process;
never widen browser grants or delete unrelated Validation evidence.

## Database and security

One migration: `20261113000000_validation_interactive_prototypes.sql`.
It widens the existing experiment family CHECK by adding `interactive_prototype`
and creates five isolated, RLS-enabled service-only tables:

- `validation_prototype_pages`: current revision, bounded content, archive state.
- `validation_prototype_publications`: immutable revision/content/token hash.
- `validation_prototype_views`: consented screen/edge telemetry with request UUID.
- `validation_prototype_submissions`: immutable feedback and consent provenance.
- `validation_prototype_rate_buckets`: publication/network/minute write budget.

Composite owner foreign keys bind exact experiment versions, prototype roots and
publications. Browser roles have no table privileges or RPC execution. Narrow
security-invoker owner/public commands run through the existing server-only admin
client after capability admission and authenticated ownership/family lookup.
SQL independently verifies owner, family, lifecycle, revision, content graph,
active token, consent and navigation references. Feedback is bound to its exact
immutable publication; one response per signed browser/publication is retained.
Direct update/delete privileges on collected records are revoked.

Lock order follows the existing Landing Pages convention: experiment version,
prototype, publication. Owner commands serialize creation/revisions by advisory
lock. Public admissions hold shared locks until commit, so already admitted
requests finish before a waiting pause/unpublish/removal; later requests reject.

All API verbs fail closed before params, auth, body reads or DB access when
unadmitted. Unsupported verbs also receive the private 503/no-store contract.
Public POSTs require same-origin JSON, streamed 64 KB bodies, strict consent,
a honeypot, UUIDs and bounded fields. Navigation targets can only be authored
internal screen IDs. Cookies are signed per token; feedback requires a valid
cookie and a prior admitted event. Stored network/browser hashes are scoped to
the publication; raw IPs are not persisted. A durable 60-write/minute budget per
publication/network bucket is shared across instances, including retries.
Resolution is read-only and token-protected, without a durable GET rate budget.
This is bounded abuse protection, not proof of humanity or CAPTCHA. Deployment
must replace forwarded-IP headers; absent identity shares a conservative bucket.
Pages/APIs are private/no-store, noindex and no-referrer, with no third-party
assets. Public output is explicitly projected. Safe errors do not log raw
feedback, tokens, cookies or identities.

## Activation, deployment and rollback

Code-only merge does not authorize deployment, migration or activation.

1. Keep `VALIDATION_PRIVATE_MODE`, `VALIDATION_PRIVATE_PROTOTYPES` and
   `VALIDATION_PUBLIC_PROTOTYPES` disabled on every reachable artifact. Follow
   `VALIDATION_VERCEL_DEFAULT_OFF_CHECKLIST.md`, including old deployment URLs.
   Preview is not a disposable test database; do not run fixtures there.
2. Require final PR CI checks. In an isolated disposable Supabase, run the complete
   migration chain and real Auth/PostgREST integration: two owners, browser/RPC
   denials, token replacement/revocation, signed-cookie consent/navigation/
   feedback, rate controls, pause/removal and historical attribution. Local browser
   fixtures and bare PostgreSQL checks do not establish this integration.
3. Obtain separate owner migration approval. Verify intended project, backup/PITR,
   repair/landing migration history, grants and schema drift. Review migration
   list and dry-run; the only newly pending migration for this PR must be the
   reviewed prototype migration. Apply through the normal transactional runner
   only after approval. Its CHECK replacement takes a lock on experiment versions.
   Recheck history, RLS/grants and unchanged shared denials afterward.
4. Deploy the reviewed SHA with flags disabled. Smoke all new route verbs for
   503/private/no-store and unavailable participant pages before activation.
5. Private authoring requires an already approved exact private mode (`INTERVIEWS`,
   `SURVEYS` or `INTERVIEWS_AND_SURVEYS`) plus separately approved
   `VALIDATION_PRIVATE_PROTOTYPES=ENABLED`. It cannot override disabled private
   mode. Missing, lowercase, whitespace and unknown values deny.
6. Public participation requires private admission plus separately approved
   `VALIDATION_PUBLIC_PROTOTYPES=ENABLED` and a private stable server
   `VALIDATION_PROTOTYPE_COOKIE_SECRET` of at least 32 characters. Use genuine
   random material, never the local synthetic test value. Approve consent,
   privacy/retention/support and trusted-IP handling before real collection.
   Rotating the secret invalidates cookies and changes browser metrics.
   Existing landing/survey, AI and shared capability settings remain independent.

Rollback: disable public prototypes first, unpublish/remove through the private
capability if needed, then disable private prototypes. Recover to an artifact
containing the default-off boundary. Retain additive tables, immutable snapshots,
feedback and widened family CHECK: old application code filters unadmitted
families and has no new table dependency. Do not drop tables, rewrite collected
feedback, undo the private repair or enable shared paths as part of rollback.
Any data recovery/forward migration needs separate owner approval.

## Verification commands and limitations

Existing Node, SQL runner, Playwright and CI infrastructure is reused; no new
dependency. The database workflow adds prototype static and disposable SQL
steps, leaving B4.3/F4 authority algorithms and fixture loaders unchanged. Only
the fixture manifest hash of the widened contracts type union is refreshed.

- Prototype tests: `node --loader ./tests/support/server-only-loader.mjs --test tests/validation-prototypes.test.ts`.
- Release/resource/body/workspace/domain/schema/landing/fixture regressions use
  existing files with the same loader. The release inventory now includes 38
  routes and all seven explicit verbs, including default-off prototype routes.
- SQL: `VALIDATION_PROTOTYPE_DB_DISPOSABLE=1 node scripts/validation-prototypes-db.ts`
  uses the fixed local Supabase DB on port 54322. Optional
  `VALIDATION_PROTOTYPE_TEST_CONTAINER=saasscout-prototype-pr240-<task>` selects
  only a task-created local Docker database. Run against a fresh/reset disposable
  database. The integrity suite rolls back; concurrency lineage remains only
  in that disposable database. No remote connection input is accepted.
- UI: start the app locally with synthetic Supabase URL/key, exact private/public
  prototype flags and synthetic cookie secret, then run
  `VALIDATION_PROTOTYPE_UI_BASE=http://127.0.0.1:3001 VALIDATION_CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/validation-prototypes.spec.ts --project=chromium`.
  These fixtures cover owner edit/preview/save/share/results/unpublish/removal,
  mobile consent/navigation/feedback, safe retry and absence of owner navigation.
  They do not create customer evidence or test live authentication.

Execution results, exact changed files and merge recommendation are recorded in
this PR's delivery section below. No Production migration, deployment, feature
activation, PR #235 mutation or merge was performed.

## Delivery results

- PASS: production build (`npm run build`), including Next compilation and its
  application TypeScript gate.
- PASS: full repository lint, zero errors; four existing warnings in Discover,
  Saved Ideas and Scans. Focused new-source lint also passed without findings.
- PASS: 2,281 tests in the release/resource/body/workspace/domain/schema/landing/
  fixture regression batch; no skips. Prototype-only rerun after adding HTTP
  scenarios: seven passed, no skips.
- PASS: 52 focused interview, survey, required-answer and server-authority
  regressions, no skips.
- PASS: PostgreSQL 17 fresh isolated database installation of the Validation
  base/server commands plus the new migration, and rolled-back SQL acceptance.
  Also passed the runner's separate-connection duplicate-response, stale-edit,
  unpublish and pause races with observed lock waits. This local database was
  newly created for this task, without network ports or remote credentials.
- PASS: two Chromium browser scenarios with synthetic APIs: mobile participant
  consent/navigation/raw feedback/identical retry and complete owner workflow.
- PASS: default-off production server: all 56 verbs across eight new API routes
  return 503 with no-store; participant page is unavailable.
- PASS: `git diff --check`.
- NOT GREEN: repository-wide `npx tsc --noEmit` reports pre-existing unrelated
  test-file diagnostics (including canonical-bootstrap/discovery tests). New
  application diagnostics found during implementation were corrected. This is
  distinct from the passing Next production application build.
- NOT EXECUTED locally: complete Supabase migration-chain reset, real Supabase
  Auth/PostgREST integration, remote/Preview/Production tests, or full product
  E2E suite. Existing CI still applies the complete chain and now executes the
  prototype SQL runner; its result must be checked on the final PR SHA. No broad
  test rerun, dependency install or expensive Supabase stack was added locally.

**Recommendation: GO for code-only merge once required final-SHA CI is green.**
The additive database objects are not queried by default. Private/public
prototype flags are independently off and cannot bypass disabled private mode;
AI/shared authority remains denied. **NO-GO for migration deployment or feature
activation** until separate owner approval and the isolated full-stack acceptance
above. This is a Beta concept-testing workflow, not an application builder.

### Exact changed files

- `.github/workflows/validation-b31-database.yml`
- `app/api/public/validation/prototype/[token]/event/route.ts`
- `app/api/public/validation/prototype/[token]/route.ts`
- `app/api/public/validation/prototype/[token]/submit/route.ts`
- `app/api/validation/prototypes/[versionId]/publish/route.ts`
- `app/api/validation/prototypes/[versionId]/remove/route.ts`
- `app/api/validation/prototypes/[versionId]/route.ts`
- `app/api/validation/prototypes/[versionId]/save/route.ts`
- `app/api/validation/prototypes/[versionId]/unpublish/route.ts`
- `app/validation/[id]/page.tsx`
- `app/validation/layout.tsx`
- `app/validation/prototype/[token]/page.tsx`
- `app/validation/prototype/[token]/public-prototype.tsx`
- `components/app-shell.tsx`
- `components/validation/experiment-form.tsx`
- `components/validation/plan-draft-handoff.ts`
- `components/validation/prototype-preview.tsx`
- `components/validation/prototype-workspace.tsx`
- `components/validation/release-capabilities.tsx`
- `docs/VALIDATION_INTERACTIVE_PROTOTYPES.md`
- `e2e/validation-prototypes.spec.ts`
- `lib/validation/prototypes.ts`
- `lib/validation/server/contracts.ts`
- `lib/validation/server/prototype-http.ts`
- `lib/validation/server/prototypes.ts`
- `lib/validation/server/release-policy.ts`
- `lib/validation/server/resource-policy.ts`
- `lib/validation/server/service.ts`
- `lib/validation/types.ts`
- `next.config.ts`
- `scripts/validation-prototypes-db.ts`
- `supabase/migrations/20261113000000_validation_interactive_prototypes.sql`
- `tests/sql/validation-prototypes.sql`
- `tests/support/validation-database-fixtures.manifest.json`
- `tests/validation-prototypes.test.ts`
- `tests/validation-release-boundary.test.ts`
