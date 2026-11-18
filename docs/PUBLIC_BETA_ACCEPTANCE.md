# Public Beta acceptance

Baseline `4a4f036888e376341c565edd88d63f7d704336db` includes PRs #245, #246 and #247. The mission and repository contracts supply the acceptance specification. The pre-implementation [admission audit](BETA_ADMISSION_SPENDING_AUDIT.md) describes historical gaps. The merged access, spending and public collection contracts supersede its implementation status.

This is a partial acceptance record. The follow-up starts at `cfb04e4a6b91789eeb25b514afe103ea80e2d86d`. Record the checkout SHA with `git rev-parse HEAD` before running the commands below. PASS applies to the indicated layer and assertions. NOT VERIFIED identifies missing evidence for an assertion or required integration. BLOCKED indicates an external dependency that prevented execution. Release decision is **NO-GO FOR MERGE** while critical browser-to-database and workflow cases remain open.

## Reproduction

Run from a clean checkout without Next.js environment files. The browser launcher takes fresh local fixture credentials from its ownership manifest and builds the app with a minimal environment. Docker must use its local socket. The browser and server use fixed loopback ports 3100 and 56321. Keep both free before running.

```bash
npm ci
npm run lint
npx playwright install --with-deps chromium
export BETA_MEMBERSHIP_DISPOSABLE=1
export BETA_MEMBERSHIP_LOCAL_WORKDIR="$(mktemp -d)"
trap 'node scripts/beta-membership-disposable.mjs stop' EXIT
for mode in upgrade fresh; do
  node scripts/beta-membership-disposable.mjs "$mode" || exit
  node --loader ./tests/support/server-only-loader.mjs tests/open-beta-db.ts "$mode" || exit
  node --loader ./tests/support/server-only-loader.mjs tests/provider-spending-db.ts || exit
done
node scripts/beta-acceptance-browser.mjs
```

With system Chromium, set `BETA_ACCEPTANCE_CHROMIUM=/usr/bin/chromium` for the last command. The launcher runs a production-mode build, creates browser contexts at desktop and 390×844, and restores the disposable release gate on exit. Run the public Validation SQL fresh/upgrade commands and existing participant browser commands from the [public participant integrity contract](VALIDATION_PUBLIC_PARTICIPANT_INTEGRITY.md).

The focused unit and route command passed 3,135 checks.

```bash
node --loader ./tests/support/server-only-loader.mjs --test \
  tests/open-beta.test.ts tests/beta-membership.test.ts tests/scan-acceptance.test.ts \
  tests/scan-status-aware-acceptance.test.ts tests/provider-spending.test.ts \
  tests/discovery-external-sources.test.ts tests/weekly-external-evidence.test.ts \
  tests/weekly-intelligence-quality.test.ts tests/weekly-intelligence-consolidation.test.ts \
  tests/discovery-weekly-owner-isolation.test.ts tests/validation-release-boundary.test.ts \
  tests/validation-public-submission.test.ts
```

The method and workflow contract command passed 134 checks.

```bash
node --loader ./tests/support/server-only-loader.mjs --test \
  tests/validation-customer-interviews.test.ts tests/validation-surveys.test.ts \
  tests/validation-survey-required-answers.test.ts tests/validation-landing-pages.test.ts \
  tests/validation-prototypes.test.ts tests/validation-external-mvp.test.ts \
  tests/validation-commercial-intent.test.ts tests/scan-server-orchestration.test.ts \
  tests/scan-evidence-ingestion.test.ts tests/scan-grounded-output-validation.test.ts \
  tests/weekly-monitoring-context.test.ts tests/weekly-intelligence-user-scoped.test.ts
```

The existing participant suite passed 13 browser checks using intercepted API
responses. It used a local production-mode app with all five public participation
capabilities enabled, two disposable cookie signing secrets for landing/prototype
and the five corresponding suite base URLs pointing to `http://127.0.0.1:3101`.

```bash
VALIDATION_CHROMIUM_PATH=/usr/bin/chromium npx playwright test \
  e2e/validation-public-integrity.spec.ts e2e/validation-landing-pages.spec.ts \
  e2e/validation-prototypes.spec.ts e2e/validation-external-mvp.spec.ts \
  e2e/validation-commercial-intent.spec.ts --grep 'participant|correction|retains held' \
  --project=chromium --workers=1 --reporter=line
```

## Acceptance matrix

| Journey | Status | Evidence and remaining work |
| --- | --- | --- |
| Account admission, admin authority, account status | PASS | Real disposable Auth/PostgREST on fresh and upgrade. Password signup with autoconfirm, unconfirmed identity and login denial, verified admission, founder admin versus ordinary owner, metadata forgery denial, suspension/reactivation, ban, deletion hold, profile ownership. |
| Browser account and recovery | PASS | Real Auth browser signup, unconfirmed login denial, verified login, desktop dashboard, narrow profile isolation, ban, logout and generated recovery link with durable password update. Invalid bearer gets HTTP 401. |
| Session callback and expiry | PASS | Local GoTrue magic-link handoff exercises the callback route. A browser-clock expiry with a revoked local refresh session returns to login. |
| Remaining identity journeys | NOT VERIFIED | Browser suspension and deletion hold, Google-specific identity callback exchange, and live email delivery. |
| Dashboard and saved opportunities | PASS | Real browser dashboard/empty state, recoverable save error, save/reopen/remove, ownership denial and durable row assertions. |
| Dashboard loading and failure states | NOT VERIFIED | Full loading and error recovery and user-specific intelligence widgets remain open. |
| Knowledge Evolution | PASS | Browser launcher explicitly selects dual-write and diagnostics off. Focused tests check shared Validation preparation, promotion and consumption denial. B4.3 F4 stays deferred. |
| Scan admission and claim | PASS | Fresh and upgrade DB checks cover three admissions, duplicate fingerprint, concurrent submissions, exclusive claim, charged failed retry, UTC rollover, lower Free-plan quota and owner individual exemption. Spending SQL asserts atomic two-slot reserve and zero Scan usage/pending rows on budget denial. |
| Scan browser generation | PASS | Chromium, actual workflow HTTP, both mocked OpenRouter stages, result reopening, completed replay, failed retry and fourth denial. Database assertions verify the result, three opportunities and six reservations with exactly four dispatches. |
| Remaining Scan integration | NOT VERIFIED | Browser concurrency against a pending request, and ambiguous provider outcomes. The Chromium account journey verifies budget exhaustion returns 503 and creates neither a Scan nor its reservation. Existing DB checks cover pending reuse, exclusive claim and atomic budget denial. |
| Discovery admission and private context | PASS | Fresh and upgrade DB checks cover durable UUID replay, distinct-key races, three admissions, fourth denial, rollover and owner individual exemption. Focused route tests assert source collection/replacement behavior and owner-scoped Weekly context. |
| Discovery zero-result generation | PASS | Chromium, actual API, mocked SerpAPI and initial/replacement OpenRouter, durable zero-result success, committed response loss, same-key HTTP 409, charged budget denial and fourth admission denial. A second real bearer receives zero rows through PostgREST. |
| Remaining Discovery integration | NOT VERIFIED | Positive problem persistence, foreign-owner browser read, provider failure after dispatch and persistence failure. |
| Weekly claims and retries | PASS | DB asserts processing/completed reuse, failed/stale cumulative two-execution ceiling and concurrent reclaim. Focused tests cover evidence, quality and corrective-generation contracts. |
| Weekly browser reads and denial | PASS | Chromium renders an owned PostgreSQL report, shows no report to a second founder, and hides manual generation for ordinary users. Real HTTP returns 404 for foreign run and 403 for ordinary manual generation. Missing cron configuration fails closed. |
| Weekly configured cron and owner reuse | PASS | The disposable launcher restarts the same app with a synthetic cron secret and an evidence-free recipient. Invalid bearer denies, valid bearer creates one durable insufficient-context report, and owner Chromium reads and reuses it without dispatch. |
| Weekly paid generation | NOT VERIFIED | Initial and corrective provider transport, evidence reuse and budget exhaustion through the full HTTP journey. Existing SQL verifies claim/reclaim limits and completed/processing reuse. |
| Spending ceilings and safety | PASS | Existing fresh and upgrade DB groups cover total, OpenRouter, SerpAPI, X, combined search, per-user ceilings including owner, final-unit race, unfinished reservations including previous-month rows, UTC rollover, disabled/missing policy, dispatch uniqueness and guarded SerpAPI mock. Focused SDK test asserts one HTTP attempt on retryable failure and production constructors use guarded transport. |
| Interviews, private observations | PASS | Seeded subject and hypothesis, then Chromium creates the plan, participant and session, records supporting, contradicting and mixed observations, and completes the session. PostgreSQL verifies lineage and explicit polarity. Foreign HTTP read denies. |
| Remaining interview integration | NOT VERIFIED | Subject/hypothesis authoring through UI, question-level evidence links and append-only correction. |
| Surveys, DB integrity | PASS | Concurrent final units at publication and aggregate scope, identical retry at capacity, definitive reject/conflict accounting, cumulative consumption across replacement, per-network resolution and submission, trusted roles and lifecycle closure. |
| Surveys, integrated participant | PASS | The plan is seeded via real RPCs. Authenticated HTTP publishes it, rejects foreign revocation and accepts owner revocation. Anonymous Chromium exercises required fields and all five answer types, loses the committed response, retries the identical payload and verifies one submission and five answers in PostgreSQL. The revoked link is unavailable and history is retained. |
| Remaining Survey integration | NOT VERIFIED | Owner drafting through browser UI, changed-payload conflict, malformed/definitive response correction and pause through the same integrated path. |
| Landing pages, DB integrity | PASS | SQL checks isolation, snapshot immutability, lifecycle, duplicate contacts, consent, metrics, concurrency ceilings, retained consumption and removal. |
| Landing pages, integrated participant | PASS | Real owner HTTP saves and publishes. Anonymous Chromium renders the signed-cookie waitlist, consents and persists one signup. Owner removes it and unpublishes. Foreign owner read denies. |
| Landing pages, remaining integration | NOT VERIFIED | Owner editing and preview in browser, cookie tampering and token replacement. |
| Prototypes, DB integrity | PASS | SQL checks authored navigation, invalid paths, consent, feedback, retry, metrics, snapshot and limits, closure, replacement, removal and owner isolation. |
| Prototypes, integrated participant | PASS | Real owner HTTP saves and publishes. Anonymous Chromium consents, navigates to completion, and persists feedback. Unpublishing closes the link. Foreign owner read denies. |
| Prototypes, remaining integration | NOT VERIFIED | Owner editing and preview in browser, invalid navigation, tampering and retry. |
| External MVP, DB integrity | PASS | SQL checks URL, snapshots, revision, owner isolation, consent, retry, contact removal and closure. |
| External MVP, integrated participant | PASS | Real owner HTTP saves and publishes. Anonymous Chromium displays the external link without following it, submits consented not-tried feedback, and observes closure. Owner contact removal retains the feedback payload, and foreign owner read denies. |
| External MVP, remaining integration | NOT VERIFIED | Owner editing in browser, tried outcome, invalid email correction and lost-response retry through real HTTP. |
| Commercial intent, DB integrity | PASS | SQL checks revision attribution, consent, retry, contact removal, lifecycle and isolation. |
| Commercial intent, integrated participant | PASS | Real owner HTTP saves and publishes. Anonymous Chromium displays the no-purchase language and persists one consented nonbinding response attributed to the publication. Owner contact removal retains the response payload. Foreign owner read denies and the link closes. |
| Commercial intent, remaining integration | NOT VERIFIED | Owner editing in browser, negative response, view deduplication, correction and retry through real HTTP. |
| Privacy and Data Moat | PASS | SQL verifies public table/RPC and cross-owner denials, lifecycle, consent and removal. Focused release checks deny AI and shared preparation, promotion and qualified consumption. |
| Full privacy and Data Moat integration | NOT VERIFIED | Public projection minimization, signed-cookie integrity, preserved contradictory observations, unverified public feedback require additional evidence. The launcher compares the three shareable/promotion/qualified evidence table counts before and after the integrated suite. |
| UI failure simulation | NOT VERIFIED | Durable lost-response and repeated-click recovery in the same browser/DB run, unsaved edits, expired authentication, forbidden and quota UX, and pause/revocation remain open across the product. |
| Infrastructure | PASS | Local opt-in, fixed loopback app and backend, labeled fixture, clean child environment, targeted egress trap and explicit fresh/upgrade coverage. The acceptance CI step fails on startup, build, browser test or detected external fetch failure. |
| Production operations | NOT VERIFIED | Deployment provenance and effective configuration, verified-mail delivery and live Google OAuth, approved provider allowance and live provider acceptance, approved financial tolerance, trusted proxy headers, scheduling, privacy/support procedures and rollback readiness require separate owner-authorized release work. |

## Reproduced application defect

On the baseline migration chain, seed an owned opportunity and use **Save Idea**
as its founder. The API returns an error and zero saved rows persist. The upsert
targets `(user_id, opportunity_id)`, but the migration chain only defines a
unique index on the saved row ID. The additive index migration supplies the
required conflict target and preserves existing rows. Before a separately
authorized release, check for existing duplicate non-null key pairs. Any
duplicates require review before the migration can be applied. The migration
contains no data cleanup.

## Reproduced Discovery defects

With actual Chromium, server handlers and disposable persistence, return zero
problems from both OpenRouter mock calls. The old workflow writes a completed
Discovery row and then returns HTTP 500 because a problem snapshot requires a
nonempty input. Guard the snapshot and empty problem insert so a zero-result
run returns success and persists its history without fabricating problem rows.

After two successful runs, reserve the remaining two AI units for that founder
and submit a third Discovery run. The SDK wraps the spending denial in a
connection error. The route now unwraps only a typed `ProviderBudgetError`
cause and returns 503. The third admission remains charged and no AI dispatch
occurs for it. Other connection failures keep their prior response behavior.

## Reproduced interview defect

Click **Start interview** on a newly created session with its optional working
notes blank. The UI sent an empty string and the API rejected it as a required
field. The request now omits blank notes so the existing optional field and
lifecycle rules apply. Nonblank notes remain in the private working record.

## Saved-opportunity production preflight

Provide this query to the owner for a separately authorized read-only preflight.

```sql
SELECT user_id, opportunity_id, count(*) AS saved_row_count
FROM public.saved_ideas
WHERE user_id IS NOT NULL AND opportunity_id IS NOT NULL
GROUP BY user_id, opportunity_id
HAVING count(*) > 1;
```

Require zero rows before applying the index. Run the preflight under the
approved release write hold so the result cannot race a saved-idea mutation.
If any row is returned, hold the migration and have the owner review the
affected saved rows and their references and authorize a retention decision.
Preserve rows until that decision is approved and run the query again before
continuing. PostgreSQL's ordinary unique index permits multiple null keys.

## GitHub publication and Vercel

Repo history records an earlier “Only build production” setting, and GitHub
reports a Vercel success status for a prior PR-head commit. Neither establishes
the effective current configuration for this branch. A Git push updates the
GitHub ref. The Vercel integration can create a deployment record from that
event, and an ignored build can leave a skipped or canceled record. A successful
build can create an immutable artifact, and alias promotion separately changes
which artifact serves the production domain. Holding builds or disconnecting
Git leaves existing immutable deployments and aliases in place.

Publication is blocked pending current owner evidence. In Vercel, open the
owner team, select the SaaSScout project, and open **Settings → Git**. Verify
the linked repository, Production Branch and **Ignored Build Step**. To enforce
a hold that also prevents automatic deployment records, the owner can disconnect
the Git integration during the publication window and confirm no other linked
project or GitHub deploy workflow handles this repository. The owner should
provide confirmation for the exact acceptance branch and Draft PR window.
This task made no setting change.

## Spending and release boundaries

Provider requests exercised by the contract/DB tests use injected transports. The browser launcher supplies dummy paid-provider values. Explicit OpenRouter and SerpAPI mocks run at the transport boundary after durable dispatch claims. Unknown requests, including optional X, hit the egress trap. Browser contexts deny external origins. The browser compares mock invocations with committed dispatch rows for Scan and Discovery. The candidate policy is a disposable fixture only. Request units do not cap dollars, input tokens, output tokens or billed credits. Pricing, balances, financial exposure and acceptable losses remain operational decisions.

No production SQL, paid-provider call, production or shared Preview test, feature-flag change, deployment, merge or activation is part of the acceptance commands.

## Changed files

- `.github/workflows/beta-membership-access.yml` invokes the browser suite after the existing real Auth and DB checks.
- `e2e/beta-disposable-scan.spec.ts`, `e2e/beta-disposable-discovery.spec.ts` and `e2e/beta-disposable-survey.spec.ts` exercise integrated Scan, Discovery and public Survey journeys.
- `e2e/beta-disposable-validation.spec.ts` and `e2e/beta-disposable-weekly.spec.ts` cover the public methods, private interviews and local cron/owner reuse.
- `app/api/discover-opportunities/route.ts` and `lib/intelligence/discover-opportunities-workflow.ts` repair the two reproduced Discovery defects.
- `components/validation/customer-interview-workspace.tsx` omits blank optional notes during session transitions.
- `tests/support/beta-acceptance-provider.mjs` provides explicit disposable Scan and Discovery provider responses.
- `e2e/beta-disposable-account.spec.ts` drives real Auth, dashboard and profile journeys and verifies the durable profile, saved-opportunity state, isolation and Scan quota denial.
- `scripts/beta-acceptance-browser.mjs` validates fixture identity, builds and launches the test app and restores the local release gate.
- `tests/support/beta-acceptance-egress.mjs` records and denies unexpected server fetch destinations.
- `supabase/migrations/20261121000000_saved_ideas_owner_opportunity_unique.sql` adds the unique index required by the saved-idea upsert.
- `tests/open-beta-db.ts` verifies the saved-idea upgrade preserves an existing row.
- `tests/provider-spending-db.ts` adds the candidate configuration test while retaining deterministic boundary tests.
- `docs/PUBLIC_BETA_ACCEPTANCE.md` records commands, evidence and remaining release decisions.
