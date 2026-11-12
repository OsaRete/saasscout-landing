# Beta Validation — Commercial Intent Experiments

Fresh task from main `39a94d7` after merged PR #241; this does not continue
External MVP Testing. Documentation-first review covered AGENTS.md's six
foundation documents, PRODUCT_ROADMAP, Validation workspace/domain/schema/API,
Customer Interviews, Surveys, Landing Pages, Interactive Prototypes, External
MVP Testing, release/resource policy, private database repair, Vercel deployment
and recovery checklist, B4.3 shared-evidence restrictions, Supabase bearer auth,
server admin factory, effective migrations, existing components and installed
Next 16 route-handler guidance. Historical interviews/surveys-only descriptions
reflect earlier scope. No strategic architecture or philosophy changes.

## Workflow and interpretation

Use **Validate this opportunity** on an owned Opportunity; the existing subject
command verifies provenance. Context remains context, never participant evidence.
Define a hypothesis, create **Commercial Intent Experiments**, then choose:

- Request a product demonstration.
- Request a quote or pricing information.
- Express interest in a pilot program.
- Join an early-access or commercial-interest list.
- Express nonbinding willingness to pay.

Describe the offer, availability and conditions, including proposed price,
currency and period where relevant. Author 1–5 questions. Save a draft revision,
preview desktop/mobile, mark ready/start with existing lifecycle controls, publish
explicitly and copy the secret link. The UI requires preview after edits before
publication; the server independently validates content and running lifecycle.
Preview is inert and makes no public request. Share through your own channel;
there is no recruitment, email sender or automated outreach.

Participants choose the displayed nonbinding action or **Not interested at this
time**, answer the questions and affirm fixed research consent. An optional email
requires separate offer-specific follow-up consent. Requests without email remain
intent statements; follow-up cannot be delivered through SaaSScout. No email
verification, availability promise or financial agreement exists. Explicit fixed
copy explains that no purchase, payment, reservation, subscription or financial
commitment is created. No payment provider, checkout, charge or AI call exists.
Authored content and responses render as escaped text, never executable HTML.

Private Results distinguishes recorded page-load events, response interactions,
retained contacts, each positive objective and negative responses. Objective and
question attribution come from the immutable publication, even after edits or
objective changes. Aggregates include all retained rows; raw display is the latest
100 with revision attribution. Page loads are POSTed only after content renders;
resolution/SSR/owner preview do not count. Request UUID retries count once. There
are no cookies, unique visitor claims, conversion rates, inferred quality scores,
significance tests, verified people, independence, purchases, revenue or guaranteed
demand. Reloads, devices and bots can inflate counts. Willingness to pay is a
conditional self-statement, never proof of payment. Review conflicting responses
and exact conditions before follow-up or further investment.

Draft edits use optimistic revision checks and never rewrite published content.
Publication replacement revokes the prior secret. Unpublish remains available
when public admission is off. Pause/completion/cancellation close ingress;
terminal experiments retain read/unpublish/contact-removal but reject edits and
publication. Remove contact permanently nulls email while preserving the response,
consent provenance and attribution. Same-request retry cannot restore an erased
email. New deliberate submissions can opt in again. Erasure support is through
the channel that supplied the link. Personal information accidentally supplied
in answers needs the existing owner privacy/support process. No automated
retention job or public self-service erasure is introduced.

## Security and storage

Migration: `20261115000000_validation_commercial_intent.sql`. It preserves every
existing family and admits `commercial_intent` in the experiment CHECK. Five new
private tables hold pages, immutable publications, anonymous page-load events,
responses/consented email and durable rate buckets. Composite owner foreign keys
bind the exact experiment version, page and publication. All five have RLS and
no browser table privileges/policies, including owner direct reads. Narrow
service-only SECURITY INVOKER RPCs have fixed search paths. Owner commands use
`requireUser`, derive ownership and verify the persisted family before RPC; SQL
repeats ownership/family/lifecycle/revision checks. Raw tokens, responses, email,
SQL errors and network identities are not logged or returned as error detail.

32 random bytes generate each 43-character base64url token. Only its SHA-256 hash
is persisted; save the raw link when published. Tokens grant participation only.
The explicit public projection contains title, objective, offer, conditions,
questions and consent; never owner IDs, lineage, drafts, contacts or results.
Public pages hide owner navigation and send private/no-store, noindex and
no-referrer. Unsupported API verbs explicitly deny. All admission checks precede
params/auth/body/DB when disabled. APIs require same-origin JSON POSTs, streamed
64 KB body limit, UUID v4, honeypot and bounded validated text. SQL repeats content,
consent, objective, exact answer count/type and optional contact checks.

Lock order: exact experiment version -> page -> publication. Owner edits serialize
with version-scoped advisory locking; public admission serializes on publication.
An already admitted action can finish before waiting pause/unpublish; once closure
commits later actions fail. Identical publication/request UUID retries return one
accepted interaction; changed response retries conflict. Publication snapshots and
response bodies are immutable; only scoped contact nulling is permitted.

Durable budgets cover resolution, page loads and responses: 60 operations per
publication/network/minute, 600 per publication/minute, 1,000 responses and 10,000
recorded page loads per experiment version. Global admission precedes network
bucket creation to bound rotating-IP growth. Retries consume budget; expired
buckets are pruned during admitted traffic after one day. Raw IPs are not stored;
network hashes are token-scoped. Trusted hosting must replace forwarded network
headers; missing network identity falls into conservative `unknown` bucket. These
are bounded Beta controls, not proof of humanity or sophisticated bot prevention.

No new data enters participants, observations, classifications, AI interpretation,
promotion ledgers, shared Data Moat, canonical knowledge or Knowledge Evolution.
B4.3/F4 remains deferred and denied. Only the type-union hash in the existing
fixture manifest is refreshed; no shared algorithms or fixture loaders change.
Discovery, Scan, Results, Weekly and all five existing methods are preserved.

## Deployment, activation and recovery

Code-only merge does not authorize migration, deployment, activation or merge by
this agent. Keep `VALIDATION_PRIVATE_MODE`, `VALIDATION_PRIVATE_COMMERCIAL_INTENT`
and `VALIDATION_PUBLIC_COMMERCIAL_INTENT` explicitly DISABLED in every reachable
artifact. Missing/unknown/whitespace/case-changed values fail closed. No new
environment settings, production database or Vercel deployment were changed.
Follow `VALIDATION_VERCEL_DEFAULT_OFF_CHECKLIST.md`, including aliases and old
artifacts. Preview shares Production credentials per existing documentation;
it is not a disposable integration environment.

Before production migration: require final-SHA CI and separate owner approval;
verify project identity, backup/PITR, repair/history/catalog/grants, migration list
and dry-run. Exactly the reviewed additive migration must be newly pending.
Apply via the normal transactional runner only after approval; CHECK replacement
takes a lock on experiment versions. Recheck RLS/grants and shared denials.
Deploy the reviewed code disabled and smoke every new route verb and public page.

Private authoring requires an existing admitted exact private mode (`INTERVIEWS`,
`SURVEYS`, `INTERVIEWS_AND_SURVEYS`) plus separately approved
`VALIDATION_PRIVATE_COMMERCIAL_INTENT=ENABLED`. It cannot override disabled mode.
Public publish/resolve/view/submit additionally requires separately approved
`VALIDATION_PUBLIC_COMMERCIAL_INTENT=ENABLED`. No new secret or service is needed.
Before real collection require isolated full migration-chain acceptance, real
Supabase Auth/PostgREST two-owner isolation and anonymous/table/RPC denials,
consent/contact/retry/rate/lifecycle integration, trusted-IP verification and
owner-approved privacy, retention, support and participant copy.

Rollback: disable public commercial intent first; unpublish/remove contacts while
private admission remains available, then disable private admission. Recover to
an artifact containing the default-off boundary. Retain additive tables and
historical snapshots and the widened family CHECK; do not drop/reset collected
data or undo the private repair. Any recovery migration requires separate owner
approval. Forward recovery uses a reviewed additive migration after reconciling
catalog/history; never edit the applied migration or reconstruct human evidence.

## Verification

Local fixtures do not establish live Supabase authentication or PostgREST
integration and are not customer evidence. Commands:

```
node --loader ./tests/support/server-only-loader.mjs --test tests/validation-commercial-intent.test.ts
VALIDATION_COMMERCIAL_INTENT_DB_DISPOSABLE=1 node scripts/validation-commercial-intent-db.ts
VALIDATION_COMMERCIAL_INTENT_UI_BASE=http://127.0.0.1:3001 VALIDATION_CHROMIUM_PATH=/usr/bin/chromium npx playwright test e2e/validation-commercial-intent.spec.ts --project=chromium
```

The DB runner accepts only fixed loopback Supabase port 54322 or an explicitly
opted-in task-created `saasscout-commercial-intent-test-*` Docker database. It
requires trusted postgres. Use a fresh disposable DB; rolled-back acceptance
and independent-connection race fixtures never belong on Preview/Production.
Existing database CI runs the new suite after the complete migration reset.
A focused CI job builds and runs synthetic owner/mobile browser fixtures locally.
Full product E2E remains the existing separate workflow.

Actual execution results, exact changed-file inventory and final commit SHA are
recorded in the PR. Merge recommendation is conditional on final required CI:
GO for default-off code-only merge with green checks and deployment checklist;
NO-GO for migration/activation until separate approval and full-stack acceptance.
Next planned product work: Validation Hub UX/UI Integration and Onboarding,
then Beta-wide integration, security and user-experience acceptance.

### Local execution results

- PASS: final production Next build, full repository lint (zero errors; four
  existing warnings in Discover, Saved Ideas and Scans), focused new-source lint,
  and application plus new test/runner/browser-fixture TypeScript check.
- PASS: 3,063 release/resource/fixture/feature tests, zero failures/skips; 114
  focused existing-method/workspace/domain/body regressions, zero failures/skips.
- PASS: fresh network-isolated PostgreSQL 17 with Validation base/server commands
  and the new migration; rolled-back integrity/consent/objective/retention suites
  and independent-connection retry, stale-edit, observed pause/unpublish races.
  Concurrency holding uses explicit transaction release rather than fixed sleeps.
- PASS: two Chromium production-server scenarios using synthetic API fixtures:
  mobile consent/contact/identical retry/no overflow and owner objective/edit/
  preview/save/publish/share/results/contact removal/unpublish with unsaved edits.
  Forms are operated through accessible labels and roles; no full WCAG audit is
  claimed.
- PASS: actual default-off production server: all 56 verbs across eight new API
  routes return 503/private/no-store; participant page is unavailable/no-referrer.
- PASS: `git diff --check` and the reviewed contract fixture hash.
- NOT GREEN: repository-wide `tsc --noEmit` reports existing unrelated test-file
  diagnostics (canonical-bootstrap/discovery/weekly tests). The focused scope and
  Next application TypeScript gate pass; this is not a repository-wide TS pass.
- NOT EXECUTED locally: full Supabase migration-chain reset, live Supabase
  Auth/PostgREST integration, full product E2E, Preview or Production acceptance.
  CI applies the complete migration chain; final-SHA remote outcomes are in the PR.

No production migration, feature activation, deployment, PR merge, real-user
interaction or production AI consumption was performed.
