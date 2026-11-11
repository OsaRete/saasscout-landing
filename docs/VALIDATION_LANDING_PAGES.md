# Beta PR 3 — Validation Landing Pages

## Scope and documentation review

Base: main after merged PRs #237 and #238. The owner confirms the private repair
migration was applied remotely; this task performs no remote verification/write.
Reviewed AGENTS.md's six foundation documents, PRODUCT_ROADMAP, Validation
engine/domain/schema/API/workspace, Surveys, private database repair, release
policy/resource admission, Vercel default-off checklist, Discovery/Scan/Results
entry patterns, migrations, UI primitives, AppShell, and installed Next 16 route
handler guidance. Older interviews/surveys-only statements describe prior scope;
this owner-authorized Beta increment admits the reserved `landing_waitlist`
family only behind an additional private capability. Architecture and philosophy
are unchanged. Advanced Data Moat/F4 remain deferred.

Reuse: subject/opportunity provenance verification, immutable hypothesis/experiment
versions, bearer `requireUser`, `server-only` admin factory, owned resource lookup,
lifecycle commands, streamed 64 KB body limit, private error/cache contracts,
existing UI primitives, Node tests, PostgreSQL runner pattern and Playwright.
Landing collection needs its own small tables because Survey answers and private
interview observations have different evidence/contact semantics. It does not
copy signups into participants, observations, classifications or shared tables.

## Owner and participant workflow

1. From an owned Opportunity report, choose **Validate this opportunity**. The
   existing create-subject flow verifies the source server-side. Alternatively,
   open an existing Validation subject/experiment. Define a hypothesis with its
   existing support, contradiction and inconclusive criteria.
2. Create a **Landing Page / Waitlist** experiment. Choose Spotlight, Benefits or
   Minimal; edit headline, description, up to five benefits and CTA. An optional
   built-in symbol adds visual content without uploads or third-party requests.
3. Set an interest-rate target and minimum browser sample (at least 20). Preview
   uses the public renderer with an inert CTA; it records nothing. Save the draft.
4. Mark the experiment ready and start it using existing lifecycle controls.
   Publish explicitly when public participation is separately admitted. Copy the
   secret URL; only its hash is persisted. Save it privately: it cannot be
   recovered after leaving the page. Republish replaces/revokes the old link.
5. Participants see only the immutable published offer and fixed consent text.
   They provide email and affirmative consent, with no name/company/phone fields.
   Success responses do not reveal whether an email was already registered.
6. The private experiment panel shows exact metrics, latest 100 consented contacts,
   an exploratory supporting/contradicting/inconclusive interest comparison, and
   next-step guidance. Refresh results when there are no unsaved edits. Remove a
   contact to honor withdrawal/erasure, including after experiment completion.
   Removal deletes the email/consent row, changes retained-contact/conversion
   counts, and preserves anonymous page-view records. No email is retained in an
   application evidence or shared table. Contact the creator through the channel
   that supplied the link; there is no outbound email or public deletion endpoint.

Editing appends a numbered draft revision through optimistic concurrency. Each
publication keeps an immutable content snapshot and its revision. Earlier
publications/submissions retain their attribution. Edits cannot silently rewrite
a live offer. Publication requires a running exact experiment version; pause,
completion and cancellation close ingress. Unpublish remains available with the
private capability even when public participation is disabled.

## Metrics and interpretation

- **Recorded views:** persisted view events, deduplicated by publication/request
  UUID. A browser records a view only after loading the public content. SSR,
  owner preview and failed/limited requests never count as visits.
- **Unique browser identifiers:** distinct server-assigned identifiers stored as
  publication-scoped hashes. The signed, HTTP-only, SameSite=Strict cookie lasts
  up to 30 days, is scoped to the public API token path, and is Secure on HTTPS.
  Link replacement, expiry, cookie clearing and another device create a new
  identifier. This is neither an exact count of people nor cross-link identity.
- **Valid retained submissions:** consented, bounded, syntax-valid emails,
  normalized to lowercase, unique across all publications of the same page.
  Email ownership and human identity are unverified. A same-email retry does not
  change timestamp, attribution or count. Removal permits later fresh opt-in.
- **Visitor signup rate:** distinct retained submitting browser identifiers that
  have a recorded view / distinct recorded browser identifiers. Multiple emails
  from one browser increase contacts but contribute at most one converted
  browser. Contacts and converted browsers are deliberately separate.

Dashboard totals include all revisions/publications of this page, without a
PostgREST row-limit truncation. Latest-contact display is explicitly limited to
100; it is never used as the aggregate denominator. Interpretation compares
these retained counts against the currently saved owner target only after the
minimum sample. It is descriptive and exploratory, especially after changing
content/targets; it is not significance testing or a verdict on every hypothesis
criterion. Selection bias, bots, irrelevant traffic, shared devices, cookie
behavior and removals remain limitations. Interest does not establish demand,
verified willingness to pay, purchases, independent people, or business success.
Next steps are audience/offer revision or customer interviews and a separately
designed concrete commitment test. No AI inference or evidence is fabricated.

## Security and migration

`20261112000000_validation_landing_pages.sql` adds five private RLS-enabled tables:
`validation_landing_pages`, `validation_landing_publications`,
`validation_landing_views`, `validation_landing_submissions`, and
`validation_landing_rate_buckets`. Browser roles have no table privileges or RPC
execution, including owner direct reads. Two narrow service-only invoker RPCs
perform transactional owner/public operations. Existing migrations are unchanged. The fixture manifest refreshes only the reviewed
`contracts.ts` type-union hash; promotion algorithms and fixture loaders are unchanged.
Composite owner foreign keys bind pages to exact existing experiment versions
and child records to their page/publication. Server commands authenticate and
verify the stored `landing_waitlist` family before invoking owner RPCs. Owner
and public SQL independently check family/lifecycle/ownership or active token.
The public projection explicitly lists participant-safe keys; it never returns
owner, subject, experiment/hypothesis IDs, drafts, targets, contacts or results.

Lock order is experiment version -> page -> publication. Owner mutation also
serializes first creation/edits with a version-scoped advisory lock. Public
admission takes shared locks through the transaction; unpublish/replacement and
lifecycle transitions wait for an already admitted submission, and subsequent
admissions reject after the closing transaction commits. No reverse lock order
is introduced into existing lifecycle transitions. Draft/publication identities
and published content are guarded against updates. Page-view/submission updates
are denied; only the scoped owner privacy operation deletes contact rows.

Public POSTs require same-origin application/json. Bounded streamed bodies,
strict consent/email/UUID checks and a honeypot precede persistence. Signed
server-generated browser IDs resist client-invented visitor identities. A durable
PostgreSQL budget admits at most 20 view/submission operations per publication,
network hash and minute across app instances; duplicates consume budget, too.
The network hash is publication-scoped; raw IPs are not stored. Expired buckets
are pruned on subsequent activity. Rate rejection commits its counter without
creating an event. The trusted deployment must replace forwarded network headers;
all clients fall into one conservative bucket if that identity is unavailable.
This is modest abuse protection, not CAPTCHA or proof of humanity; resolving a
secret URL is read-only and does not have a durable write-side rate counter.

Public pages exclude dashboard navigation, send private/no-store, noindex and
no-referrer headers, and contain no third-party visuals. APIs return stable safe
errors and private/no-store headers. The only new next.config entries are response
headers, not environment or hosting changes. No Production Vercel/Supabase
settings, migrations, deployment or activation are performed by this PR.

## Exact later deployment and activation requirements

1. Complete the owner-only deployment/old-artifact/recovery record in
   `VALIDATION_VERCEL_DEFAULT_OFF_CHECKLIST.md`. Preview shares Production
   credentials and is observation-only; do not run acceptance against it.
   Keep `VALIDATION_PRIVATE_MODE`, `VALIDATION_PUBLIC_SURVEYS`,
   `VALIDATION_PRIVATE_LANDING_PAGES` and `VALIDATION_PUBLIC_LANDING_PAGES`
   DISABLED in every reachable deployment until separately approved.
2. Require green checks for the final PR revision. Against an **isolated disposable**
   Supabase, execute SQL/concurrency acceptance plus full Auth/PostgREST owner and
   public integration. Browser tests in this PR use synthetic API fixtures and
   do not establish live Auth/PostgREST integration or actual customer evidence.
3. Separately approve a migration deployment. Verify intended project, backup /
   PITR, repair migration history and effective catalog/grants. Review
   `supabase migration list` and `supabase db push --dry-run`; require exactly the
   reviewed new landing migration pending. Only then may an authorized owner
   apply it through the normal transactional runner. Recheck history and RLS,
   browser denials, service-only grants and unchanged shared/F4 denials. Never run
   fixture tests on Production. DDL takes locks; abort on unexpected drift.
4. Deploy the reviewed code with all capabilities still disabled. Smoke-test the
   503/no-store contract on every new API verb and unavailable public page with
   synthetic tokens. Verify the deployment SHA, aliases and old artifacts.
5. Separately approve private authoring: select an existing exact admitted
   `VALIDATION_PRIVATE_MODE` (`INTERVIEWS`, `SURVEYS`, or
   `INTERVIEWS_AND_SURVEYS`) and set `VALIDATION_PRIVATE_LANDING_PAGES=ENABLED`.
   Keep `VALIDATION_PUBLIC_LANDING_PAGES=DISABLED` and public surveys disabled.
   Missing/unknown/case-changed values fail closed. Private authoring does not
   require a cookie secret. This extends the existing boundary, not an independent
   release switch that can override DISABLED private mode.
6. Before any real public collection, separately approve public participation,
   data retention/removal operations, consent/privacy copy and participant support.
   Verify same-origin behavior, HTTPS cookies, trusted forwarded-IP replacement,
   durable rate limits, unknown/revoked tokens, duplicate handling, live metrics,
   publication replacement and lifecycle races in isolated integration acceptance.
   Configure a stable, private random `VALIDATION_LANDING_COOKIE_SECRET` of at
   least 32 characters in the intended server scope, then separately enable
   `VALIDATION_PUBLIC_LANDING_PAGES=ENABLED`. Public admission requires private
   admission, both landing switches and that secret. Never use the synthetic
   test secret. Secret rotation invalidates old browser cookies and affects
   visitor counts. No shared promotion/consumption or F4 switch is enabled.

Rollback: disable the public landing flag first; owner unpublish/privacy removal
remain possible while private capability is enabled. A boundary-containing,
disabled application artifact is the recovery target. Retain additive tables and
historical data; do not drop/reset them or roll back the private database repair.
Any data recovery or forward migration requires separate owner approval.

## Focused verification

Use existing infrastructure, no new dependency or framework:

- `node --loader ./tests/support/server-only-loader.mjs --test tests/validation-landing-pages.test.ts`
  exercises authoring limits, interpretation, exact capability matrix, owner
  authorization, safe publication token hashing, consent/email/honeypot checks,
  HTTP auth order, same-origin enforcement and cookie signature/tampering.
- Existing release-boundary inventory covers all 30 private/public Validation
  API routes and verbs with default landing admission denied, plus existing
  interview/survey capability-resource and focused workspace/schema regressions.
- `VALIDATION_LANDING_DB_DISPOSABLE=1 node scripts/validation-landing-db.ts`
  uses only the existing fixed local Supabase PostgreSQL endpoint. An optional
  `VALIDATION_LANDING_TEST_CONTAINER=saasscout-landing-pr3-<task-name>` selects
  docker exec psql for a task-created local container. Never supply Preview or
  Production connections. The SQL suite rolls back; race fixtures persist only
  in the disposable database. Run once against a fresh/reset local database.
- `VALIDATION_LANDING_UI_BASE=http://127.0.0.1:3000 npx playwright test e2e/validation-landing-pages.spec.ts --project=chromium`
  exercises public mobile consent/submission, absent owner navigation and the
  owner edit/preview/publish/share/results/unpublish UI with API fixtures. Start
  the app with explicit synthetic local Supabase settings and landing flags.
  A system browser can be selected with `VALIDATION_CHROMIUM_PATH=/usr/bin/chromium`.
  Other runs skip this local-only file rather than probing real deployments.

Final execution results and merge/activation verdict are recorded in the PR.
Known limits: no double opt-in, outbound delivery, export, uploaded media, CAPTCHA,
public self-service erasure, or statistical inference. Privacy removal is owner
mediated. All-revision results are exploratory; start a separate experiment for
cleanly separated offer/hypothesis tests. No automatic shared evidence exists.
