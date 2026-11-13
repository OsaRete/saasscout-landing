# Beta membership and access enforcement (PR 1)

## Approved scope and implementation plan

Continues the audit on verified main
`fcb77ea132a11f3ef1b121f2dc98b4a9a4feefb6`. The owner approved PR 1 only.
PR 2's spending controls are explicitly deferred; this is not launch approval.

The smallest change is to extend service-owned `application_user_access` with
`beta_admitted` (default false) and independent `beta_expires_at` fields. Add the
ordinary `beta_member` role without granting internal-tester capabilities.
Existing tester role, active/expiry and unlimited Scan fields remain independent.
No account, paid plan, OAuth provider, editable metadata or signup-table row
implicitly grants membership. Existing users require explicit owner admission.

One database predicate checks that persisted fact. A no-argument authenticated
RPC checks only the current JWT identity; a separate service-only predicate
supports scheduled execution. Missing/failed/malformed checks deny. `requireUser`
retains Auth verification first and adds membership before returning identity to
protected APIs. Weekly's shared execution entry checks scheduled users too.
Non-Production x-search gains the same authenticated membership boundary;
its existing Production 404 remains. No provider budgeting is added.

An explicit table inventory receives restrictive membership RLS policies,
conjoined with existing owner policies. No browser grant is widened. Include
private Validation tables that currently permit authenticated direct reads;
exclude public acquisition and service-only participant tables. Public
Validation handlers retain their separate release/token/publication model.
The six methods, Hub and permanent AI/shared-authority denials remain unchanged.
The migration covers 31 existing protected browser surfaces; acceptance checks
the effective catalog for any browser-readable/writable base table omitted from
that inventory, excluding public acquisition. It grants no new browser table
access. Membership is necessary, not sufficient: existing owner predicates,
Scan rollout/plan rules and Validation release capabilities still apply.

There is no bypass/legacy environment switch. Default-off means no membership
is seeded, and the new columns default to false. Application deployment requires
the migration; until then protected APIs fail closed. Login, signup, callback,
password reset/update and public participant release checks remain usable.
Owner-controlled SQL, not a browser administration endpoint, admits/revokes.

## Owner-controlled admission and revocation

Use the existing Auth user UUID verified in the intended project. Do not infer
membership from an email supplied by a browser or copy unknown UUIDs from a
request. The checked-in psql script requires the database owner, an existing
Auth UUID, an exact `admit`/`revoke` action and an optional future expiry:

```sh
psql "$OWNER_DATABASE_URL" -X -v beta_user_id=VERIFIED_UUID \
  -v beta_action=admit -v beta_expires_at=2026-12-01T00:00:00Z \
  -f scripts/beta-membership-owner.sql

psql "$OWNER_DATABASE_URL" -X -v beta_user_id=VERIFIED_UUID \
  -v beta_action=revoke -f scripts/beta-membership-owner.sql
```

These are owner instructions, not actions executed against Production here.
Keep connection secrets outside chat/logs. Omitting expiry admits indefinitely
until explicit revoke. The script preserves existing role, tester activity,
tester expiry, unlimited flag, reason and all profile/plan fields. A new ordinary
access row uses `beta_member`, with no tester entitlement. Revoking an absent
assignment is a no-op. Admission does not send invitations or create accounts.
Record the operator, verified UUID, reason, action and expiry in the owner's
existing access-management record. No user can execute this script through
PostgREST, and neither browser role can read/write the access table.

`application_beta_access()` accepts no parameters and returns only the current
authenticated identity's membership boolean. The service-only
`application_beta_member(uuid)` supports cron. A request-selected owner cannot
change either caller identity or table/RPC grants. No user-management endpoint
or secret-bearing admin UI is introduced.

Minimal UI checks membership before mounting protected workspace children and
shows a fixed access-denied/retry state. It is presentation only: API/RLS remain
the security boundaries. Public participant pages and account recovery bypass
the founder workspace check.

## Rollout and rollback constraints

Migration and application changes are additive, but applying the migration
intentionally blocks non-admitted browser access, including existing users.
The old service-role application can bypass RLS. Before any Production rollout,
the owner must restrict protected application/API and cron ingress across old
deployments, verify a safe rollback artifact, apply the migration, deploy the
new boundary and explicitly admit authorized accounts. Never open Beta until
PR 2 and integrated acceptance are separately approved. No such action is
performed in this task. Do not use the shared-credential Preview for acceptance.

Revocation is evaluated on each new API check and database statement; bearer
tokens remain valid for Auth/recovery and do not embed membership. Already
authorized in-flight work and existing statement/transaction snapshots may
finish, and data already downloaded cannot be recalled. No token revocation,
session termination or real-time subscription retroactive erasure is claimed.
Older service-role deployments must remain restricted after migration/revoke.
Founder membership revocation does not revoke published participant capability
links. Their existing release, publication and token/cookie checks remain
independent; closing those publications is a separate existing operation or
trusted owner support action. No public participation is activated here.

Rollback must retain the restrictive RLS/membership objects and close privileged
ingress before reverting application code. Never restore access by dropping
membership policies, widening grants, resetting quotas or deleting evidence.
Prefer a forward fix. Migration alone does not secure an old service-role API.

## Verification record

Verified on the PR 1 source before publication:

| Check | Result |
| --- | --- |
| Ten focused Node suites | 3,107 passed, zero failures/skips; includes the original 18 admission tests and preservation suites |
| Final admission suite after adding x-search coverage | 19 passed, zero failures/skips; 3,108 distinct focused cases covered in total |
| Real local upgrade acceptance | Passed: real users/tester row created under main, then new migration applied |
| Real local fresh acceptance | Passed: complete application migration chain including this migration, then real users |
| Chromium against the built local app | Three passed: recovery/signed-out behavior; denied/admitted/revoked same synthetic session; default-off Validation and public-page separation |
| Focused strict TypeScript | Exit 0, including changed runtime entrypoints, new helpers and acceptance/unit harnesses |
| Repository lint | Exit 0; four inherited Discover/Saved/Scans warnings, no errors |
| Production build | Exit 0, standard Next.js 16.2.4 build |
| Repository TypeScript | 175 inherited diagnostics, unchanged from the clean main baseline; no added diagnostics |
| Whitespace and preservation comparison | Passed; Discovery owner collector, Scan acceptance/orchestration, Weekly service and Validation release policy are byte-identical to main |

The real Auth/PostgREST checks cover normal account creation/login, unchanged
tester entitlements, no automatic admission, forged editable metadata, profile
entitlement-write denial, direct access-table read/write denial, arbitrary-user
membership RPC denial, protected RPC grants, admitted owner reads/writes,
cross-owner reads/writes, ordinary-role quota integrity, same-JWT revocation,
password update/new login after revoke, independent expiry and public signup
acquisition. Direct Scan service admission still enforces three ordinary Scans,
reuses duplicates without extra quota and admits exactly one concurrent claim.
The catalog check found only `application_beta_access` among non-trigger
public-schema SECURITY DEFINER functions executable by authenticated browsers.

Paid providers are mocked/trapped in offline tests; no actual paid call was made.
Local command records remain in `/workspace/work/beta-membership/`. The new
focused CI workflow reproduces offline plus disposable upgrade/fresh acceptance
with read-only GitHub permissions and no Production credentials. It has not been
represented as a completed hosted CI run.

Limitations: this is a real local PostgreSQL/Auth/PostgREST acceptance result,
not a remote or full Supabase-platform certification. No real Google OAuth
handshake, Production catalog/settings review, shared Preview exercise, email
delivery/recovery-link test or deployment occurred. Password update and login
after revocation were exercised; delivery remains an unchanged Auth concern.
Existing owner-only direct Validation reads remain governed by their database
grants/RLS, not server capability flags; this PR adds membership without claiming
those flags were a database-level release switch. Existing shared-authority
objects and all six method implementations remain unchanged.

## Deployment prerequisites and recommendation

1. Review this exact revision and hosted CI results. Record actual deployed
   migration history, old service-role artifacts/aliases and the rollback target.
   This task has not verified those Production facts.
2. Do not allow an automatic deployment to bypass the cutover plan. Before any
   deployment/migration, the owner must approve and restrict protected ingress
   and cron across all old privileged deployments. Login/recovery and separately
   admitted participant routes should retain their intended availability.
3. Verify all predecessor migrations through `20261115000000` are present, RLS
   is enabled on the 31 inventory tables and existing access roles satisfy the
   old role contract. Apply `20261116000000_beta_membership_access.sql` atomically
   through the reviewed migration process. It admits nobody and edits no
   historical evidence/profile/Scan rows. Refresh/verify PostgREST schema cache;
   a missing RPC makes the new application fail closed.
4. Deploy only the boundary-containing build. In the approved cutover, admit
   explicitly verified authorized accounts using the owner SQL; do not bulk-admit
   every Auth or paid-plan user. Test admitted/denied/revoked access with synthetic
   fixtures in the approved isolated environment. Keep older privileged builds
   restricted. An application rollback retains the new columns/functions/RLS
   but must close privileged ingress before reverting to pre-boundary code.
5. Keep Validation flags disabled and Beta launch closed. PR 2's spending controls
   and integrated acceptance still require separate authorization and completion.

**GO for owner code review of PR 1. NO-GO for unattended Production merge/deploy
or Beta launch until the cutover/rollback facts and required hosted checks are
accepted.** A code-only merge is conditional on held deployment or an explicitly
approved coordinated cutover. This PR is submitted as Draft for those owner gates;
passing local tests is not authority to modify Production. There is no reverse
migration that drops protective policies; recover through a forward fix while
retaining access restrictions and all data. PR 2 has not been started.

## Reproducing isolated database acceptance

The full local Supabase image exceeded this environment's disk during download.
The smaller fixture uses real PostgreSQL 17, GoTrue v2.192.0 and PostgREST
v14.14 behind local Kong, with real signed Auth sessions and database roles.
It is not a deployed Supabase acceptance claim. The fixture initializes the
modern Supabase `auth.uid()` JWT-claims fallback and pgcrypto, then applies the
repository's complete application migration chain unchanged. Google OAuth's
external provider handshake is not exercised; provider-neutral admission is
tested with mocked password/OAuth identities and real local password sessions.

```sh
export BETA_MEMBERSHIP_DISPOSABLE=1
export BETA_MEMBERSHIP_LOCAL_WORKDIR="$PWD/../work/beta-membership-local"
node scripts/beta-membership-disposable.mjs upgrade
node --loader ./tests/support/server-only-loader.mjs tests/beta-membership-db.ts upgrade

# Explicitly replace only the labeled fixture containers/data with a fresh chain.
node scripts/beta-membership-disposable.mjs fresh
node --loader ./tests/support/server-only-loader.mjs tests/beta-membership-db.ts fresh
node scripts/beta-membership-disposable.mjs stop
```

Upgrade first creates real users and an existing tester assignment under main's
schema, then applies the additive migration. Fresh applies all migrations before
users. The acceptance runner requires an empty Auth database at entry, the fixed
loopback API port 56321, a matching private fixture manifest/container label and
explicit phase/opt-in. It never accepts a remote URL, resets data or starts a
container. The prepare script can replace only its named, manifest-matching
containers after the explicit `fresh`/`stop` action. Tokens are random disposable
credentials in a private workdir file; never commit that file. No Production,
shared Preview, provider, F4 or promotion execution is part of these commands.
