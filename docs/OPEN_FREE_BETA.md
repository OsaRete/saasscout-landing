# Open Free Beta and owner administration — PR #245 continuation

This document supersedes invitation-only product decisions in BETA_MEMBERSHIP_ACCESS.md and BETA_ADMISSION_SPENDING_AUDIT.md. Their original verification records remain historical evidence. Open Beta does not authorize Validation, AI Validation, shared promotion, qualified consumption or B4.3-F4.

## Baseline and release status

Remote main and PR #245 were verified unchanged before implementation:
`fcb77ea132a11f3ef1b121f2dc98b4a9a4feefb6` and
`709fa8772b6fedcd395a104187e8ba67f499d199`. PR #245 was open, Draft and mergeable. Latest membership, Playwright and Validation workflows on that reviewed HEAD succeeded. Those results are historical, not CI for this local continuation.

The owner confirmed no verified deployment hold and explicitly requested local changes only. No push, new PR, merge, remote migration, Vercel/environment/credential change, real account operation or deployment is authorized/performed. Continue the existing PR after a separately verified hold covers automatic Preview as well as Production.

Read the existing audit, membership rollout/rollback guide, Validation release/default-off/Hub documents, migration sequencing, Discovery Weekly isolation, Scan acceptance/execution and authentication/access contracts before implementation. The actual migration and runtime contracts were inspected; old design descriptions were not assumed current.

## Access and owner authority

`application_beta_member(uuid)` now checks persisted Auth state: confirmed email, nonanonymous identity, no Auth deletion, no current Auth ban, no application suspension and no deletion-review hold. It serves authenticated `application_beta_access()`, all 31 existing restrictive browser policies, protected APIs and scheduled Weekly recipients. Owner predicates/grants remain necessary. Email/OAuth user metadata, payment, signup and frontend state cannot confer administration. OAuth must result in a confirmed Auth identity; an external provider handshake is not claimed by local tests. Password recovery remains independent.

There is one database-owner-controlled, default-false `application_beta_release.open_free_beta` launch gate. It prevents the incomplete spending boundary from becoming public. Once separately authorized launch requirements are satisfied and this single gate is opened, every eligible verified user is admitted automatically, including new registrations: no invitation, individual admission row or subscription is necessary. Missing gate state denies. The application service role can read, but cannot change, this gate.

`application_user_access.owner_administrator` is a separate default-false bit. It preserves existing internal-tester role/activity/expiry/unlimited fields and the founder's existing Auth identity. Administrator assignment bypasses individual Scan and Discovery limits only; it never bypasses ownership, account status, Validation release gates or the required dependent global provider budget. Existing unexpired tester unlimited Scan entitlements remain independent.

### Offline owner bootstrap, after separate Production authorization

Independently verify the founder's existing Auth UUID in the intended Supabase project. Record operator, UUID, reason and source/deployment/migration IDs in the existing owner record; keep connection strings out of chat/logs. As the database owner:

```sh
psql "$OWNER_DATABASE_URL" -X -v owner_user_id=VERIFIED_EXISTING_FOUNDER_UUID \
  -f scripts/open-beta-owner.sql
```

The script checks confirmed active Auth state, rejects suspended/deletion-held accounts, serializes owner assignment and refuses to replace another owner. It changes only the owner bit and update timestamp on an existing access row; no Auth identity, evidence, profile, quota or entitlement is reset. Signup and the web API cannot call it. The historical admit/revoke script now exits without changes; invitation booleans are retained for compatibility/history but no longer grant or deny access. Do not treat an old revoke command as suspension.

## Minimal owner management

`/admin/users` and `/api/admin/users` provide bounded 50-account pages of UUID, email, account dates/status, owner status, deletion-review status, historical Scan counter/plan limit and current-month Scan/Discovery admissions. No tokens, arbitrary Auth metadata, evidence, IPs, provider secrets or private content are projected.

Every API call verifies bearer identity/account access, then independently checks database-owned owner authority. Database management/list RPCs are service-only and recheck the trusted session actor; the browser cannot supply an authoritative actor. POST requires same-origin JSON, bounded streamed input, an allowlisted action and exact UUID confirmation. Owner/self changes are blocked; no web endpoint assigns administrators. Status transitions and a minimal audit record commit together, serialized with offline bootstrap. Reactivation never overrides an Auth ban or pending deletion review.

Suspension takes effect on subsequent API checks and direct database statements with the same issued token. Scan acceptance/claim and Discovery admission also recheck account access in SQL. Already-authorized in-flight work/snapshots may finish; cached/downloaded data cannot be recalled. Auth identity is retained for recovery. Independently published Validation participant links remain under their existing capability/revocation rules; suspension is not participant-link revocation.

### Account deletion: explicitly blocked pending lifecycle review

`request_deletion` suspends the account and records a deletion-review hold and audit event. Its response explicitly says `deleted: false`; it calls no Auth deletion API, cascade, truncate or evidence mutation. Reactivation is blocked until offline review resolves the hold. No erasure completion is claimed.

Reviewed dependencies include Auth-user CASCADE links in historical application tables, RESTRICT owner/evidence links in Validation, append-only Snapshots/qualified attestations/current authority, public participant contacts/tokens, private source content and provenance. The new audit/admission history also restricts Auth deletion. A blanket Auth delete is unsafe even when it happens to succeed for an empty account.

Owner manual procedure: independently verify the request/account and required retention/legal basis; inventory all user-linked rows, nested JSON/source content, contact-removal/publication paths, storage objects, provider copies, logs/exports and backup retention; revoke separately published links using existing authorized operations; identify immutable/shared supporting/contradicting/mixed evidence requiring retention or an approved pseudonymization design. Execute only proven per-domain erasure/anonymization under a separately reviewed procedure. Reconcile residual personal data and backup expiry before reporting completion. Until that lifecycle is proven, retain the suspension/hold and report the blockers; do not delete Auth, disable integrity triggers, cascade, truncate or claim compliance by deleting a profile alone.

## Quota and execution semantics

All months are half-open UTC calendar months, starting at 00:00 UTC on day 1. No scheduled reset or historical counter rewrite is required. Database time is authoritative for admission.

- **Scan:** the existing workflow-enabled feature gate remains. After persisted account verification, Open Beta/owner accounts no longer need the legacy individual rollout allowlist; that list is not a quota or admin grant. At most three admitted new/retry execution attempts per Free Beta user/month, bounded further by any lower configured Free plan limit. Existing lifetime `scans_used` remains cumulative and increments at admission; paid/custom plan limits remain independently enforced. Free-plan exhaustion is evaluated against the current month rather than the lifetime counter, which corrects the missing monthly rollover. Profile locks serialize distinct requests; fingerprints, pending reuse, completed/processing reuse, failed retry lineage and the one-executor claim are preserved. Reuse consumes nothing. As in the established contract, an accepted attempt that later fails remains charged; a failed retry needs another available admission. This is an admission limit, not three free completed successes with unlimited failure retries. Existing current-month Scan rows count without migration rewrites. Historical status/output rows are not edited.
- **Discovery:** service-only admission reserves one `(user_id, request_id)` before collection/model work. A user lock makes distinct-key concurrent admission bounded at three/month. The browser supplies a UUID v4 idempotency key, never identity; key scope includes trusted user ID. An existing key returns 409 without dispatch, including in later months. Confirmed requests resolve the browser key; transport failures retain it. Admitted, failed and ambiguous/crashed attempts remain charged; no lease/reclaim automatically redispatches. Completed output stays in existing owner-scoped Discovery history rather than being duplicated in the ledger. Status updates are diagnostic, not permission to retry. This does not change analysis quality or PR #244 context filtering.
- **Owner:** individual Scan/Discovery quotas are exempt. Existing Scan tester entitlement remains independent; neither authority grants a global budget exception.
- **Weekly:** GET remains owner-scoped reading. POST requires owner administration; ordinary-user UI does not offer manual generation. Cron schedule, profile recipient selection, shared generation service, period claim/reuse and per-recipient account checks remain. Scheduled generation is not activated or manually invoked here.
- **Validation:** preserve all existing method limits and private/public consent/publication gates. No capability is enabled. AI, preparation/promotion and qualified consumption remain denied.

One admitted generation is not one paid provider request. Replacement/corrective generations, source searches and transport retries remain separately relevant. See the mandatory dependent scope below.

## Required dependent spending PR — precise scope, not implemented here

The independent implementation and operating policy are now documented in
[GLOBAL_PROVIDER_SPENDING.md](GLOBAL_PROVIDER_SPENDING.md). This section records
the access PR dependency contract; it does not activate budgets or public access.

The original PR 2 spending work spans independent provider/workflow state machines and is not folded into this access/admin adaptation. No dependent PR was created/pushed because deployments are forbidden and the owner requested local work only. Public launch stays blocked until it is implemented and accepted.

1. Use additive PostgreSQL service-owned reservations/claims; no new queue, Redis or external platform. Reserve before every paid dispatch, with stable server-bound workflow/owner/request/attempt identity and durable uniqueness. Make denied/missing/malformed budget state fail closed. Count all outgoing requests, including replacements, corrective calls, retries, external searches and ambiguous failures.
2. Define owner-approved project-wide provider unit/cost ceilings and per-user AI/search ceilings; default missing budgets to denial. The prior 15 AI attempts/60 search requests proposal is not an implemented or newly approved product entitlement. Owner exemption applies only to individual Scan/Discovery limits, never project-wide ceilings, concurrency/abuse controls or authority gates. Bound payload/output sizes as part of the cost contract.
3. Integrate Scan global reservation transactionally with existing admission/claim; budget denial must not charge a new individual attempt or create a false pending Scan. Preserve ordinary quota/fingerprint/reuse/terminal semantics and existing entitlements.
4. Reuse Discovery's admission identity for initial/replacement model and source reservations. Meter `/api/collect-sources` with durable request idempotency and each actual search, including its up-to-four-search fanout; it must not remain an alternate unmetered ingress. Retain x-search's Production 404 and meter any permitted non-Production path.
5. Preserve Weekly automatic schedule and completed/processing reuse. Add a durable cumulative per-period retry/execution ceiling, including failed/stale reclamation, plus global/provider reservations. The prior two-executions/period proposal needs explicit acceptance. Count the one corrective generation separately; do not recollect for it.
6. Set SDK automatic retries to zero or charge each actual outgoing retry. A high-level reservation must never silently finance multiple uncounted transport attempts. Do not refund ambiguous dispatched work or allow a lost lease/crash to replay for free.
7. Test concurrent distinct workflows at the last shared budget unit, same-key races, crash/timeout ambiguity, failure/reclaim ceilings, exhausted-budget provider traps, administrator global-cap enforcement and unchanged output/ownership/Validation contracts. Use disposable DB and mocked providers. Keep the launch gate closed until these checks and abuse/Auth/provider configuration are accepted.

## Migration, maintenance and rollback

Keep `20261116000000_beta_membership_access.sql` unchanged: remote application state has not been authoritatively inspected, and preserving it supports both main-to-final and invitation-schema-to-final upgrades. Apply additive `20261117000000_open_free_beta_access.sql`, then `20261118000000_free_beta_monthly_admission.sql`. No existing data, migration history, credentials or backups are deleted. New metadata defaults to no owner/no suspension and a closed public release; no founder UUID or owner assignment is seeded.

Before separately authorized execution, inspect live migration history/predecessors through `20261115000000`, historical Knowledge Evolution/Snapshot ordering, the original 31 RLS tables, access-role/constraint contract, Auth columns/principal permissions and relevant function ownership/grants. Do not blindly push or repair history. Apply the three pending migrations in order in an atomic reviewed migration operation (or verify already-applied predecessor bytes); refresh/verify PostgREST cache. The account-list function depends on the admission table from the last migration: do not deploy or bootstrap halfway through the chain.

Use the existing coordinated maintenance plan: verified deployment hold including Preview; All Deployments protection across old domains/artifacts with bypasses controlled; cron/scheduler suspension; in-flight drain; migration verification; explicit approved bootstrap of the existing founder; deploy final boundary; bounded non-paid checks; restore scheduling/automation only after acceptance. Keep the public launch gate false. Do not perform acceptance against shared-credential Preview. Email confirmation must be enabled for password signup in the hosted Auth project; do not mistake Auth autoconfirm for proof of a user-controlled mailbox. Effective provider settings and credential isolation remain owner-only deployment facts.

Migration plus a closed gate intentionally denies ordinary workspace access until later launch. Founder continuity requires approved offline owner assignment during the protected window before service restoration; do not infer ownership from email or automatically promote an old tester. Login/recovery remains intact.

Rollback retains new policies, suspension/deletion state, usage/admission history, all evidence and the closed gate. Select an immutable artifact with these access/admin/monthly/Weekly boundaries and disabled Validation; verify its Production environment and supported recovery action. The previous invitation HEAD is not a boundary-preserving rollback for this continuation: its Discovery/Weekly paths can bypass the new product rules. Close privileged/paid ingress and cron before reverting incompatible code; prefer protected downtime and forward repair. Never delete ledgers, reset counters, drop membership policies, widen grants or restore an old privileged application publicly. Physical backups are disaster recovery, not routine app rollback.

Stop for revision drift, missing containment/recovery, unexpected migration history/catalog/grants, incorrect owner identity, missing RPC/cache, quota/claim failure, or enabled Validation/shared authority. No Production execution or public launch is approved by this local work.

## Verification record

Retain original PR evidence rather than rerunning thousands of unchanged cases: 3,109 focused cases, local fresh/upgrade membership acceptance, three membership and three Hub browser checks, strict focused TypeScript, lint/build and successful reviewed-HEAD CI. Original repository-wide TypeScript had 175 inherited diagnostics; a production build is not proof of a clean full-repository tsc.

Continuation verification uses `tests/open-beta-db.ts` with the existing fixed-loopback labeled PostgreSQL 17/GoTrue 2.192.0/PostgREST 14.14 fixture. Upgrade creates existing accounts/tester assignment under main before applying the three migrations. Fresh installs the complete chain first. Both prove real verified signup, nonverified denial, metadata/grant forgery rejection, owner bootstrap/entitlement preservation, cross-owner RLS, same-bearer suspension/reactivation, concurrent three-admission limits, duplicate/claim behavior, UTC rollover without lifetime resets, owner quota exemption and non-destructive deletion blocking. `tests/open-beta.test.ts` covers admin request guards, real owner helper, provider traps on denied Discovery admission and owner-only Weekly POST. Browser checks cover recovery, suspension, unsaved-input preservation, disabled Validation and minimal administration. No paid/provider call or external OAuth handshake is claimed.

Use explicit local opt-ins; never point this runner at Production or shared Preview:

```sh
export BETA_MEMBERSHIP_DISPOSABLE=1
export BETA_MEMBERSHIP_LOCAL_WORKDIR="$PWD/work/open-beta-local"
node scripts/beta-membership-disposable.mjs upgrade
node --loader ./tests/support/server-only-loader.mjs tests/open-beta-db.ts upgrade
node scripts/beta-membership-disposable.mjs fresh
node --loader ./tests/support/server-only-loader.mjs tests/open-beta-db.ts fresh
node scripts/beta-membership-disposable.mjs stop
```

The original `tests/beta-membership-db.ts` CLI now forwards to `open-beta-db.ts` for compatibility; obsolete invitation assertions remain in git history, not in the active acceptance contract. CI invokes the new runner directly. The static/algorithm preservation suites and pinned loaders remain. The workflow adds new tests without Production credentials. A final local verification summary and exact changed-file inventory accompany this continuation; hosted checks must run after an authorized push under deployment hold.

### Completed local results

| Check | Result |
| --- | --- |
| Focused access/admin/Discovery/Scan orchestration tests | 55 distinct cases passed, zero failures/skips in final passing runs; unchanged broad suites reused |
| Real PostgreSQL/Auth/PostgREST main-to-final upgrade | Passed, including existing founder tester assignment and same-bearer RLS/status checks |
| Real complete-chain fresh install | Passed, including automatic verified registration, nonverification/Auth bans, concurrent admission and UTC rollover |
| Chromium membership/recovery/unsaved-input/default-off checks | Three passed |
| Chromium ordinary Weekly and owner deletion-review checks | Two passed on final built application |
| Focused runtime/page TypeScript and new acceptance/unit test TypeScript | Passed |
| Expanded targeted check including legacy Scan orchestration test | Three inherited fixture diagnostics remain; existing problematic assertions were not changed |
| Repository lint | Passed with four inherited warnings, zero errors |
| Production build with synthetic public Auth configuration | Passed |
| Preservation comparison | Original membership migration, PR #244 collector/workflow, Scan acceptance library, Weekly service, Validation implementation/release policy and pinned test loader unchanged |
| Whitespace | Passed |

No Production or shared Preview request, migration, real-account action, paid AI/search call, external OAuth handshake, Validation activation or B4.3-F4 execution occurred. Fixture state was explicitly disposable and removed only through the existing ownership/label guards. A fixture-start timing mistake was corrected with an explicit prepared marker and schema-cache readiness check; final fresh/upgrade runs passed. The new browser assertion initially used the wrong existing Weekly heading; it was corrected without weakening the read-only assertion. Prior passing CI is reused as baseline evidence, not represented as CI for the unpushed continuation.

### Exact continuation file inventory

```text
.github/workflows/beta-membership-access.yml
app/admin/users/page.tsx
app/api/_utils/auth.ts
app/api/admin/users/route.ts
app/api/discover-opportunities/route.ts
app/api/user/capabilities/route.ts
app/api/weekly-intelligence/route.ts
app/discover/page.tsx
app/scan/page.tsx
app/weekly/page.tsx
components/beta-workspace-access.tsx
docs/BETA_ADMISSION_SPENDING_AUDIT.md
docs/BETA_MEMBERSHIP_ACCESS.md
docs/OPEN_FREE_BETA.md
e2e/beta-membership.spec.ts
e2e/open-beta-admin.spec.ts
lib/auth/beta-membership.ts
lib/auth/owner-administrator.ts
lib/auth/workspace-path.ts
lib/scan/server-orchestration.ts
scripts/beta-membership-disposable.mjs
scripts/beta-membership-owner.sql
scripts/open-beta-owner.sql
supabase/migrations/20261117000000_open_free_beta_access.sql
supabase/migrations/20261118000000_free_beta_monthly_admission.sql
tests/beta-membership-db.ts
tests/beta-membership.test.ts
tests/discovery-weekly-owner-isolation.test.ts
tests/open-beta-db.ts
tests/open-beta.test.ts
tests/scan-server-orchestration.test.ts
```

## Named acceptance before public release

Migration `20261125000000_named_beta_admission.sql` adds database-owner-issued,
expiring admission for a verified Supabase Auth UUID. The existing predicate
applies it to app routes, PostgREST RLS, and workflow admission. Grants start
empty. Existing owner, suspension, deletion, entitlement, and public release
rules continue to apply. The grant gives ordinary access with the account's
existing quotas. Keep paid dispatch and Weekly generation closed during the
non-paid acceptance window. Named users with Weekly enabled can become eligible
if the separate scheduler and spending gates are later opened.

After separate approval for the account and migration, confirm the tester's
verified identity in Supabase Auth Users, leave `open_free_beta=false`, and run
the following as database owner using the independently confirmed UUID. Expect
one returned row. The database grant itself sends no email.

```sql
insert into public.application_beta_invitations (user_id, expires_at)
select user_id, statement_timestamp() + interval '24 hours'
from (values ('<verified-auth-uuid>'::uuid)) as tester(user_id)
where public.application_account_verified(user_id)
  and not exists (
    select 1 from public.application_user_access a
    where a.user_id=tester.user_id
      and (a.owner_administrator or a.account_suspended or a.deletion_requested_at is not null)
  )
on conflict (user_id) do update set expires_at=excluded.expires_at
returning user_id, expires_at;
```

Revoke early with
`update public.application_beta_invitations set expires_at=statement_timestamp() where user_id='<verified-auth-uuid>'::uuid;`.
With public Beta closed, the same session loses workspace access on its next
admission check. Auth and previously created records remain available to their
respective recovery and retention processes. Revoke test publications separately.
