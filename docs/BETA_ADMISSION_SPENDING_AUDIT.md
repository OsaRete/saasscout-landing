# Beta admission and spending: pre-implementation audit and proposed split

Status: investigation and baseline verification only. No security or spending
fix is implemented by this document. This is not Beta activation approval.

Continuation: the owner approved the two-PR split and PR 1 implementation only.
See [Beta membership and access enforcement](BETA_MEMBERSHIP_ACCESS.md) for the
implementation, acceptance record and current merge/deployment recommendation.
The findings and initial proposal below are retained as the pre-code audit;
their "not implemented" statements describe that earlier checkpoint. PR 2 has
not been authorized or implemented.

## A. Verified baseline and documentation

Remote `refs/heads/main` was read with `git ls-remote` before changes and was
`fcb77ea132a11f3ef1b121f2dc98b4a9a4feefb6`, matching the requested PR #244 merge.
The initial clean local checkout was older (`d346eeb`); it was not used as the
implementation baseline. After fetching, the new branch
`codex/beta-admission-spending-controls` starts at verified `origin/main`.
PR #244 and PR #235 were not changed.

Review covered the six foundation documents required by AGENTS.md, in order:
PRODUCT_VISION, DATA_MOAT, SYSTEM_ARCHITECTURE, AI_PRINCIPLES,
ENGINE_GUIDELINES and CODING_STANDARDS. Additional security/release sections
reviewed: SCAN_ACCEPTANCE_INTEGRITY, SCAN_SERVER_WORKFLOW,
DISCOVERY_WEEKLY_OWNER_ISOLATION, WEEKLY_INTELLIGENCE_BETA_READINESS,
WEEKLY_BETA_STABILIZATION, WEEKLY_RUN_CLAIM_RPC_REPAIR,
WEEKLY_MODEL_QUALITY_RETRY, VALIDATION_DISABLED_RELEASE_BOUNDARY,
VALIDATION_PR1_MERGE_BLOCKER_REMEDIATION,
VALIDATION_VERCEL_DEFAULT_OFF_CHECKLIST, VALIDATION_HUB,
IDEA_VALIDATION_DOMAIN_CONTRACT/API/SCHEMA, the four newer private method
documents, and V8_B43_B_CURRENT_EVIDENCE_SAFETY_FOUNDATION.
Historical two-method Validation descriptions are superseded by the actual
six-method implementation and current release policy.

Implementation inspection covered password/signup/OAuth/callback/recovery,
bearer verification, application_user_access, profile privileges and signup
trigger, browser Supabase reads/writes, Scan acceptance/claim/orchestration,
Discovery generation and external collection, Weekly API/service/claim/cron,
collect-sources, x-search, retired Scan/Weekly endpoints, internal dry-run,
Validation private/public HTTP helpers and release policy, installed AI SDK
retry defaults, relevant migrations and focused test infrastructure.
Repository source is evidence of intended behavior, not the deployed catalog.

## B. Existing protections to reuse

| Boundary | Existing effective repository protection |
| --- | --- |
| Authentication | `requireUser` verifies a bearer token using Supabase `auth.getUser`; server routes derive identity from the verified user. |
| Entitlements | Browser profile mutations are revoked; the postgres-owned signup trigger installs fixed defaults. User metadata cannot set the plan or Scan quota. |
| Exceptional access | `application_user_access` is RLS-enabled and service-role-only, with active/expiry checks. Its existing role is `internal_tester`; it is not yet general Beta membership. |
| Scan | Server-derived evidence-inclusive fingerprint, advisory transaction lock, locked profile quota, status-aware duplicate/retry matrix, unique active attempt and atomic pending-to-processing claim. Browser roles cannot execute the admission/claim RPCs. |
| Scan rollout | Existing feature flag and server allowlist remain separate from quota entitlements. |
| Weekly | Service-only user-period claim, durable uniqueness and advisory lock, completed reuse and fresh-processing early return. One corrective model retry per execution; collection is not repeated by that corrective retry. |
| Discovery ownership | PR #244 supplies the authenticated owner, filters Weekly children through joined parents and verifies parent/child ownership before projection. |
| Validation | Exact default-off capability parsing; six private methods and Hub; separate token/publication/cookie participant policies. AI, preparation/promotion and qualified consumption remain denied. |
| Diagnostics | Existing operational events are best-effort records, intentionally unsuitable as admission counters. |

## C. Confirmed gaps; none fixed yet

1. A valid account is enough for `requireUser`. No Beta admission lookup occurs.
   Signup and Google OAuth establish identity, not an invitation. Existing
   non-invited accounts therefore pass this common authentication boundary.
   `beta-signups` is public acquisition data, not a trustworthy allowlist.
2. Browser pages directly query protected tables, including Discovery, Scan,
   results and founder profiles. Existing ownership RLS isolates owners but does
   not distinguish invited founders. An API-only gate leaves direct PostgREST
   access open to non-invited accounts for their permitted rows/shared reads.
3. Discovery performs external collection and initial/replacement AI generation
   without durable monthly admission or an execution claim. Simultaneous or
   repeated requests can independently spend before persistence/deduplication.
   Problem deduplication is output quality control, not execution admission.
4. `collect-sources` authenticates but can execute up to four SerpAPI searches
   for each request. It has no durable budget or request deduplication.
5. Weekly's one corrective retry limits one execution, but failed/stale runs can
   be reclaimed repeatedly. There is no durable cumulative paid-attempt ceiling
   for that period and no shared monthly AI admission. Cron selects profiles
   with Weekly enabled without Beta admission.
6. Existing Scan admission is durable, but its profile counter is not the
   requested cross-workflow monthly budget. Explicit unlimited tester access
   exists. Replacing it or resetting it would change an existing contract.
7. The installed OpenAI SDK defaults to `maxRetries = 2`. Current paid client
   constructors do not override that default. One application generation can
   issue additional eligible transport retries; counting high-level calls alone
   does not bound provider attempts correctly.
8. `/api/x-search` is hidden in Production, but its non-Production provider path
   has no authentication or durable usage admission. Production 404 must remain;
   Preview/development is still relevant when credentials are present.

Retired `analyze-evidence`, `generate-opportunities`, `solution-intelligence` and
`generate-weekly-report` endpoints return 410 and need no replacement generation
system. Internal discovery dry-run has a server secret and does not expose the
paid generation paths found by the provider inventory. Founder Match, Evidence
Alignment and Opportunity Intelligence must not be counted as paid model calls
merely because their names include intelligence.

## D. Smallest safe implementation split and file scope

The user's section 8 split condition applies: membership authorization spans API
and RLS boundaries, while durable spending admission spans independent workflow
state machines. Propose two small PRs against main, implemented and reviewed in
order. The second is rebased onto main after the first is merged through owner
review. Neither PR constitutes activation; launch remains blocked until both pass.

### PR 1: Beta founder admission

- Extend the existing service-owned `application_user_access` model to represent
  ordinary Beta membership without granting internal-tester/unlimited privileges.
  Do not use mutable auth metadata, user_profiles, email-domain guessing or the
  public signup table as membership authority. Preserve active/expiry semantics.
- Add one reusable server admission helper after identity verification. Apply it
  to protected owner APIs and the shared Weekly scheduled entry. Missing policy,
  unavailable required membership or malformed state must deny, with safe errors.
- Add restrictive membership RLS conditions to the explicitly inventoried
  browser-accessible protected tables. Retain existing owner predicates, grants,
  FK/trigger contracts and shared/private authority boundaries. Existing
  permissive ownership policies alone must not bypass the new restriction.
- Keep login, signup identity creation, OAuth and password recovery usable.
  None grants membership. Add a clear access-denied presentation using existing
  application primitives; UI does not authorize API or database access.
- Keep public Validation participant handlers on their independent release and
  publication/token rules. They must not call the founder-membership helper.
  Preserve all six owner workspaces, Hub, current flags and default-off behavior.

Expected file areas: `app/api/_utils/auth.ts`, `lib/auth/`, the Weekly scheduled
entry, existing access-denial UI, one additive migration, focused auth/RLS tests
and deployment documentation. Do not rewrite private method implementations.

### PR 2: Durable spending admission

- Use the existing PostgreSQL facility, service-owned admission RPCs, uniqueness
  constraints and transaction locks. No Redis or new queue is justified.
- Add a separate configurable Beta ceiling: at most five paid Scan executions
  and fifteen AI provider attempts per user per calendar month across workflows.
  Retain existing plan checks as independent necessary conditions. Specify UTC
  month boundaries in the contract; never reset or rewrite profile counters.
- Reserve durable usage before provider dispatch, with stable server-bound
  execution/request identity and ownership. Concurrent requests for different
  workflows must contend on the same user's monthly budget. Duplicate, exhausted
  or unverifiable admission must exit before external calls.
- Integrate Scan's additional ceiling transactionally with its existing
  acceptance/claim flow. A Beta denial must not accidentally consume ordinary
  plan quota, leave a fabricated pending attempt or reopen terminal attempts.
  Reuse the existing fingerprint and claim; do not build another Scan engine.
- Add durable Discovery/source-collection request claims and a separately
  bounded external-provider budget. Provider units must count outgoing searches,
  not returned result rows. An initial proposed ceiling is 60 search requests per
  user/month, separately configurable and subject to pricing/review.
- Keep Weekly's current period, completed reuse and processing early return.
  Add a cumulative period execution ceiling, proposed two admitted executions
  per period, plus the shared monthly attempt budget. The existing single model
  correction is charged as another provider attempt, never a free retry.
- Disable hidden SDK retries for Beta execution or admit each actual retry
  separately. Bound output/input sizes and provider query counts; a generation
  quota alone is not a universal dollar-cost ceiling.
- Preserve durable charges for ambiguous provider failures/timeouts; never
  refund an execution merely because the response failed to reach the caller.
  A claimed execution lost to a crash cannot be replayed for free. Any lease or
  reclaim path must account for the previous owner's possible in-flight spend.
- Guard x-search before credentials/dispatch in allowed environments, retaining
  its Production 404. Keep retired endpoints retired and Validation AI denied.

Expected file areas: additive spending migration and server admission helper,
Scan acceptance integration, Discovery workflow/route, collect-sources, Weekly
production dependency adapter/claim integration, paid client configuration,
x-search, focused provider/admission tests and deployment documentation.

No runtime file or migration is changed at this audit stage. The only repository
change is this document.

## E. Authentication/admission acceptance contract

PR 1 must prove admitted password and OAuth identities can use permitted APIs;
existing non-invited accounts receive server denial; direct PostgREST reads and
founder-profile writes cannot bypass membership; signup/user metadata/profile
requests cannot grant admission; revoked/expired users fail closed; recovery
remains usable. Missing/invalid identity still fails before membership checks.
Public Validation participants remain independent, and default-off Validation
must reject before privileged/provider work as it does today.

Default-off rollout must be explicit across application and database boundaries.
A server environment flag alone cannot govern direct PostgREST RLS. The PR must
define one authoritative rollout policy and compatibility behavior, with no
missing/malformed-state fallback to public Beta access. Do not activate that
policy or seed Production users as part of implementation.

## F. Spending/plan compatibility contract

Fresh profiles currently receive `plan = free`, `scan_limit = 3`, zero usage,
external source limit 5 and Weekly enabled. No monthly reset implementation was
found in the inspected Scan quota path. A maximum-five Beta overlay must not
silently grant five Scans to those profiles or reset their existing usage.
Apply the lower independently applicable bound; existing billing/plan semantics
stay intact outside explicit Beta controls. Internal tester unlimited behavior
also stays unchanged outside Beta; no ordinary Beta role receives it.

Test at the actual dispatch boundary: one admitted Scan can make two AI
generations; Discovery can make two including replacement; Weekly can make two
including corrective regeneration. Each actual admitted attempt counts toward
the same fifteen-unit budget. Source searches need their own durable units.
An optional conservative up-front reservation is safe only if documented as such
and it never undercounts ambiguous/in-flight work or permits duplicate dispatch.

## G. Baseline verification and limitations

Executed on unchanged runtime source at the verified main baseline:

- Nine focused Node suites: **3,089 passed**, zero failures/skips. Suites:
  scan-acceptance, scan-status-aware-acceptance,
  user-profile-entitlement-privileges, discovery-data-moat-sources,
  discovery-weekly-owner-isolation, weekly-intelligence-user-scoped,
  weekly-intelligence-consolidation, weekly-intelligence-quality and
  validation-release-boundary. Paid/auth/database transports are mocked or
  contract-tested; these do not prove future membership or quota enforcement.
- Repository lint: exit 0; four existing hook-dependency warnings in
  Discover/Saved/Scans, zero errors.
- Production build: exit 0 with normal Next.js 16.2.4 settings.
- Repository TypeScript: exit 2, **175 existing diagnostics**, on unchanged
  source. This independently reproduces the count documented by PR #244.
  The build's passing TypeScript stage does not imply repository-wide tsc passes.
- Focused strict TypeScript for inspected auth/admission/paid entrypoints and
  selected Scan/Discovery regressions: exit 0. The temporary ES2022 config extends
  repository tsconfig and includes auth, capabilities, Scan acceptance/server
  orchestration, Discovery workflow, Weekly API, collect-sources and the selected
  Scan/Discovery test entrypoints. No TypeScript file was modified.
- Final remote main recheck still returned the same full `fcb77ea` SHA.
  `git diff --check` passed. The audit document is the sole untracked change.

No Supabase/PostgREST acceptance, OAuth browser flow, new membership enforcement,
cross-workflow quota race or migration fresh-install/upgrade acceptance has been
executed. No claim that the requested ten new-control demonstrations pass is
made. The focused baseline only establishes existing preservation coverage.
Local command logs are retained under `/workspace/work/beta-admission-audit/`.

For implementation, use disposable database fixtures with concurrent sessions,
real role/RLS/ACL checks and mocked provider dispatch counters. Required races
include both same-key duplicates and distinct-workflow requests at the final
remaining budget unit. Fresh and upgrade paths must run against the full
effective migration chain, separately from mocked RPC unit tests.

## H. Production and rollback prerequisites

Do not apply a migration, alter Production settings/users, activate Validation,
open admission, run Preview against Production credentials, deploy or merge here.
The repository's Vercel checklist records shared Production Supabase credentials
in Preview; this audit made no Preview requests.

Each implementation PR needs additive migration compatibility with the currently
deployed application, fresh-install/upgrade acceptance, documented schema cache
handling and explicit deployment ordering. Old deployments with privileged keys
must not bypass activated policy; either enforce at the DB admission boundary or
retire/restrict those paths through a separately approved operational action.
Actual deployed catalog/flags/hosting facts remain unverified.

Rollback must retain membership RLS and durable charges/history. Reverting only
application code can restore unmetered provider paths; name a verified compatible
rollback artifact or stop paid ingress before rollback. Prefer additive forward
fixes. Never delete evidence, reset profile quotas, clear admission ledgers or
widen grants as recovery. Activation and rollback operations need owner approval.

## I. Remaining blockers versus optional work

Blockers: implement both boundaries; pass the required auth/direct-API/RLS,
membership-forgery, quota/concurrency/duplicate, Weekly failure/retry, Scan,
Discovery isolation and Validation separation tests; execute disposable migration
acceptance; establish safe Production/Preview/old-deployment rollout and recovery;
review the inherited TypeScript disposition. Validation activation retains all
its separate existing gates and is excluded from this Beta task.

Optional: dashboards/alerts, an invitation email sender, richer owner tooling,
provider diversification and unrelated inherited TypeScript cleanup. None should
replace durable admission or expand these two PRs.

## J. Recommendation

**NO-GO for a Beta-controls code merge or Beta launch at this stage.** There is
only an audit, not a verified fix. Existing passing baseline tests cannot justify
opening admission or claim bounded spending. A later default-off code merge can
be recommended only for the actual implementation revision after its focused
checks, database acceptance and deployment compatibility gates are satisfied.

## K. Smallest next action

Resolve the proposed two-PR split, then implement PR 1's shared membership and
restrictive RLS boundary using the existing access model. Keep it default-off;
complete PR 2 and integrated acceptance before any separately approved Beta
activation. No PR has been opened, since implementation verification has not
occurred.
