# Open Free Beta global provider spending controls

This independent change depends on PR #245 at
`08e6bac3d00cf437650686c234e7bd54e1bb108b`. Production main was verified at
`fcb77ea132a11f3ef1b121f2dc98b4a9a4feefb6`. Branch:
`codex/beta-global-spending-controls`. No publication, deployment, Production SQL,
provider request or public/Validation activation is authorized by this document.
The public launch gate remains closed.

## Accounting and authority

The database-owner-controlled `application_spending_policy` singleton defaults to
**disabled with zero ceilings**. Missing policy/RPCs, invalid settings, failed
admission and exhausted limits deny dispatch. Service role can read policy and
reservations and execute the three narrowly scoped RPCs; it cannot edit policy or
insert/update/delete ledger rows directly. Browsers have no ledger/policy/RPC
privileges. Existing account checks also run in reserve and dispatch. Owner status
and Scan tester privileges provide no global or provider-budget exception.

All usage limits below apply to **reserved outbound requests per UTC calendar
month** across all users and application instances. One OpenRouter generation,
one SerpAPI search, or one X recent-search request is one unit in the combined
ceiling. Provider limits and search limits are independent necessary conditions.
Per-user AI/search ceilings include owners and scheduled Weekly work. They are
abuse/spending ceilings, separate from the unchanged three Scan and three
Discovery admissions per ordinary user/month. This introduces no paid plan.

These units are deliberately not dollars or tokens. OpenRouter pricing, input
size, actual usage and upstream routing can vary; SerpAPI credits/cache behavior
and X per-post billing can differ from request counts. Every reservation counts
in full, even on errors, empty results, cache hits, unused Scan capacity and lost
responses. No usage refund or estimated currency reconciliation is performed.
Provider invoices remain the financial source of truth. Before activation the
owner must review the actual provider plans/pricing, including maximum cost for
the bounded request envelopes, and accept concrete usage ceilings. No exact
monetary cap is claimed.

The only allowed model is the existing `openai/gpt-4.1-mini`, with at most 3,200
output tokens and 128 KiB serialized request body. Existing prompts/output limits
remain lower where applicable. SerpAPI requests permit at most ten results and X
at most twenty; URLs are bounded to 8 KiB. Responses are bounded to 2 MiB and the
transport has a 60-second local timeout (Weekly retains its shorter aborts).
Redirects are denied. A timeout does not prove remote processing stopped.

## Durable execution rules

A singleton row lock makes admission atomic across workflows/providers/users.
Reservations are unique by trusted user, workflow, durable request/attempt ID,
provider and slot. A second irreversible RPC claims dispatch; a duplicate or lost
claim response never grants another dispatch. Reservation/claim failures happen
before network I/O. AsyncLocalStorage carries these server-created identities
through existing services; missing context denies at the actual transport.
Transport sequence numbers distinguish initial/replacement/corrective attempts.

- **Scan:** the existing fingerprint/status/quota matrix stays intact. A new or
  failed-retry admission atomically reserves two OpenRouter slots using the new
  Scan ID before incrementing usage or inserting `pending`. Budget denial returns
  503 and changes neither individual quota nor Scan rows. The existing exclusive
  execution claim still decides the executor. Reuse reserves no new capacity.
  Pending rows predating this migration have no reservations and fail closed at
  provider dispatch; do not fabricate reservations or replay them automatically.
- **Discovery:** the existing user/UUID admission remains first. The same durable
  identity scopes up to four prioritized SerpAPI searches run sequentially,
  optional one X request and each initial or replacement AI call. Discovery stops
  SerpAPI collection if a search fails or is denied and reports limited live
  search coverage when fewer searches complete. Individual admitted failures stay charged as before,
  including failure caused by a later provider budget denial. Source failures may
  still degrade collection under the existing contract, but cannot dispatch for
  free. Optional X budget denial yields no X evidence, matching its existing
  unsuccessful-HTTP behavior. Output provenance, owner filtering and persistence
  are unchanged.
- **Standalone sources:** `/api/collect-sources` now requires a UUID-v4
  `Idempotency-Key`, scoped to the authenticated user, and a streamed JSON body of
  at most 2 KiB. A caller must keep that key across ambiguous transport retries.
  Each of its four searches reserves/claims separately. Replaying a previously
  dispatched key returns 503 without another search; inspect the original result
  or usage before explicitly starting new work. No report cache/queue is added.
  Non-Production `/api/x-search` uses the same key contract and metered transport;
  its Production 404 is retained. There is no current collect-sources UI caller
  requiring a new browser flow.
- **Weekly:** completed/processing reports return through the existing reuse paths,
  even with budgets disabled. New/reclaimed work requires an enabled policy and
  `weekly_max_executions`; a cumulative per-run counter increments atomically on
  failed/stale reclaim. Existing rows conservatively begin at one; unknown past
  retries are not reconstructed. Each claim's run ID/counter scopes its search
  and model attempts. The existing one corrective generation remains separate
  paid work and never recollects sources. Ordinary users remain read-only;
  scheduled generation also requires a valid cron bearer and the deployment's
  `WEEKLY_SCHEDULED_GENERATION_ENABLED=true`. Keep this flag unset and
  `weekly_max_executions=0` for a Discovery/Scan-only spending approval. The
  deployment flag guards new builds. Contain historical artifacts separately.
- **SDKs:** the installed OpenAI SDK defaults to two retries; every inventoried
  constructor now explicitly uses `maxRetries: 0` and the guarded fetch. This
  includes the still-disabled Validation clients. HTTP/transport errors never
  gain an unmetered retry. Retired endpoints remain retired.

Live concurrency includes **dispatched, unfinished reservations across all
months**. Unused Scan slots retain their monthly charge. The dispatch RPC
counts live work under the same singleton lock it holds through the irreversible
claim. Reserve and dispatch require Read Committed, the PostgREST default, so a
waiting claim sees the preceding transaction's ledger writes. Previously
reserved work can only dispatch in its reservation's UTC month.

Only a fully read successful HTTP response settles the slot through the
existing transport. HTTP errors, timeouts, body failures, crashes and uncertain
claims retain both charge and slot, including across month boundaries. Provider
incidents can still stop new dispatches. Any manual recovery requires verified
cessation and a separately reviewed forward operation.

## Required owner configuration

Only a database owner may set these integer fields; all must be explicitly
reviewed. Zero denies the corresponding work. Missing/unset policy never means
unlimited. No limits are enabled by this migration.

| Field | Meaning | Conservative proposal, not approved |
| --- | --- | ---: |
| `total_requests` | All monthly AI/search reservations | 600 |
| `openrouter_requests` | Monthly AI requests | 200 |
| `serpapi_requests` | Monthly SerpAPI searches | 400 |
| `x_requests` | Monthly X searches | 0 (leave off pending pricing review) |
| `search_requests` | Combined monthly SerpAPI/X searches | 400 |
| `user_ai_requests` | Monthly AI reservations per user, including owner/Weekly | 15 |
| `user_search_requests` | Monthly searches per user, including owner/Weekly | 60 |
| `max_concurrent` | Dispatched, unfinished reservations project-wide | 8 |
| `weekly_max_executions` | Cumulative executions per user-period, including initial | 2 |
| `enabled` | Global dispatch permission | false until separately approved |

These are a small trial proposal, not sufficient capacity for an arbitrary
public audience or an approved financial budget. Two slots are required for a
new Scan. Weekly alone can use twelve searches and two model attempts per
execution; user search caps may degrade its collection. Choose actual limits
against the expected population/provider plans before opening public access.

For a separately authorized change, use trusted owner SQL in the intended
project, record operator/reason/before/after values and commit all fields
atomically. Example parameterized shape (values must come from owner approval):

```sql
begin;
update public.application_spending_policy
set enabled=false,
    total_requests=:total_requests, openrouter_requests=:openrouter_requests,
    serpapi_requests=:serpapi_requests, x_requests=:x_requests,
    search_requests=:search_requests, user_ai_requests=:user_ai_requests,
    user_search_requests=:user_search_requests, max_concurrent=:max_concurrent,
    weekly_max_executions=:weekly_max_executions
where singleton;
commit;
```

Inspect usage/outstanding work first. Changes never reset counters or grant new
monthly entitlements. Lower limits can immediately deny existing reservations:
dispatch rechecks policy against already reserved usage. To stop new dispatch
immediately, set `enabled=false` as database owner. Already committed dispatches
can still finish; no remote cancellation is claimed. Re-enable only after the
incident, unresolved slots and approved limits are understood. Never delete the
ledger or mark uncertain work successful to regain capacity. Any manual slot
repair needs independently verified cessation and a separately reviewed forward
operation. Increasing a ceiling expands financial exposure and needs approval.
Opening `application_beta_release.open_free_beta` is a separate owner decision.

Read-only operating queries (no dashboard needed):

```sql
select * from public.application_spending_policy;
select date_trunc('month',reserved_at at time zone 'UTC') as utc_month,
       provider, count(*) as reserved,
       count(*) filter(where dispatched_at is not null) as claimed,
       count(*) filter(where finished_at is not null) as settled
from public.application_provider_reservations group by 1,2 order by 1 desc,2;
select workflow,provider,count(*) filter(where dispatched_at is not null) as active,
       count(*) filter(where dispatched_at is null) as unused_reserved
from public.application_provider_reservations where finished_at is null
 group by 1,2;
select user_id,provider,count(*) from public.application_provider_reservations
where reserved_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'
group by 1,2;
select id,user_id,period_start,status,spending_execution_attempts
from public.weekly_intelligence_runs order by period_start desc limit 50;
```

`dispatched_at` means a durable dispatch claim, not proof that a provider received
or billed the request. `finished_at IS NULL` can mean pending, in flight, failed
or uncertain. These conservative states are intentionally not automatically
reclassified. Queries project metadata only; no prompts, queries, credentials or
evidence are added to this ledger.

## Migration and publication order

Keep all historical migrations unchanged. Apply dependency migrations
`20261116000000_beta_membership_access.sql`, then
`20261117000000_open_free_beta_access.sql`, then
`20261118000000_free_beta_monthly_admission.sql`, before the single new additive
`20261119000000_global_provider_spending.sql`. The new migration adds two tables,
three service-only RPCs, one Weekly counter column, and replaces only existing
Scan admission and Weekly claim bodies. It seeds no user, budget or activation.
Install transactionally through the reviewed process; verify owners/ACLs and
refresh PostgREST schema cache. Do not use blind migration push/history repair.

### P1-1 dispatch-concurrency rollout

Production rollout is **NO-GO** until the operator verifies that older
deployments with active provider credentials cannot bypass the guarded
dispatcher, or contains them. Check immutable URLs, aliases, protection bypasses
and scheduled ingress. Ready status and Standard Protection alone leave
effective reachability unknown.

After exact-head review and CI, verify the active artifact's claim-before-fetch
boundary, the installed spending predecessor, RPC owners/grants and the
PostgREST Read Committed default. Hold paid ingress and cron through the
cutover and let outstanding requests drain where possible. Retain all uncertain
claims. Apply `20261124000000_provider_dispatch_concurrency.sql` as one
transaction. It replaces two RPC bodies and preserves signatures, grants and
ledger data. The guarded dispatcher at `2a43b8031f8216b8eec4d0eb801fd9fbd00f9633`
uses the same RPCs before and after the migration, so this fix requires no
application deployment. Verify the installed bodies, service-only privileges
and no-paid-call denial behavior before restoring ingress. A guarded
application rollback can use the same RPCs. For a database regression, hold
ingress and use a reviewed forward repair that preserves the ledger.

Before any approved cutover, follow OPEN_FREE_BETA's coordinated maintenance and
rollback plan: contain all older service-role deployments/aliases, suspend cron,
drain in-flight work, inspect actual migration history, install the reviewed
chain, deploy only the reviewed boundary, then verify non-paid behavior before
restoring scheduled work. **Older deployed code can still make unmetered calls**
with shared credentials; this database ledger cannot intercept arbitrary provider
traffic from those artifacts. Retain a compatible rollback artifact or close
paid ingress and forward-fix. Never delete ledgers, reset quotas/evidence, widen
RLS or publicly restore a pre-boundary build. Validation, qualified promotion and
consumption, and B4.3-F4 remain disabled.

The owner's saved Vercel “Only build production” setting is evidence about
automatic Preview builds. Manual/API/CLI deployment paths, custom integrations,
old aliases and shared Production credentials remain separate risks. No Preview
was opened or exercised. Before publication obtain explicit owner authorization
for the exact branch/commit, current automatic build rule and handling of manual
paths. No push or dependent PR is part of this local implementation approval.
Git refs are verified; unavailable GitHub PR metadata must not be invented.

## Focused acceptance

The existing manifest-labeled fixed-loopback PostgreSQL 17/GoTrue/PostgREST
fixture supplies fresh-chain and main-to-dependency-to-spending upgrade checks.
Upgrade retains a historical Scan byte-for-byte. `tests/open-beta-db.ts` retains
its access/RLS/three-admission/owner/rollover checks under disposable-only test
limits. `tests/provider-spending-db.ts` exercises cross-workflow last-unit races,
duplicate dispatch, concurrency, provider/user caps, owner denial, ambiguous
failures, Scan transactionality, Weekly cumulative retry/reuse and ACLs. Actual
provider transports are mocked, including when using real admission RPCs.

```sh
export BETA_MEMBERSHIP_DISPOSABLE=1
export BETA_MEMBERSHIP_LOCAL_WORKDIR="$PWD/work/spending-local"
node scripts/beta-membership-disposable.mjs upgrade
node --loader ./tests/support/server-only-loader.mjs tests/open-beta-db.ts upgrade
node --loader ./tests/support/server-only-loader.mjs tests/provider-spending-db.ts
node scripts/beta-membership-disposable.mjs fresh
node --loader ./tests/support/server-only-loader.mjs tests/open-beta-db.ts fresh
node --loader ./tests/support/server-only-loader.mjs tests/provider-spending-db.ts
node scripts/beta-membership-disposable.mjs stop
```

The membership CI workflow adds these focused tests without Production secrets.
Broad prior CI evidence remains historical evidence for unchanged functionality;
no hosted success is claimed before an authorized push. No real provider pricing,
remote catalog, OAuth handshake, email delivery or hosting containment is proven
by these local checks.

## Local verification result for this implementation

- Nine focused Node suites: **102 passed**, zero failures/skips. Includes the actual
  SDK retryable-error transport test, four-search route metering/replay/streamed
  body rejection, optional X denial and existing admission/Weekly preservation.
- Complete-chain fresh install: Open Beta acceptance passed; **11 spending
  acceptance groups passed** against real PostgreSQL/Auth/PostgREST.
- Main-to-access-dependency-to-spending upgrade: the same acceptance passed,
  including preservation of pre-existing synthetic Scan evidence/identity.
- Strict focused TypeScript across changed runtime and test entrypoints: passed.
- Repository lint: passed, zero errors, the same four inherited warnings in
  Discover/Saved/Scans. Production build: passed with Next.js 16.2.4.
- Whitespace check passed. Historical migrations, fingerprint/workflow contracts,
  Weekly authoritative service, Auth policy and Validation release policy retain
  their dependency-baseline bytes. Broad historical CI/175-diagnostic repository
  TypeScript evidence is reused; whole-repository TypeScript was not rerun or
  claimed clean. No new focused diagnostic remains.

The disposable fixture containers were stopped. No real paid provider request,
Production operation, Preview exercise, push, hosted workflow or PR was performed.
Git refs also resolve the intended dependent PR base branch to
`codex/beta-admission-spending-controls` at the exact authorized dependency SHA;
no GitHub metadata or mergeability claim is inferred from that Git fact.

GO for owner code review. NO-GO for publication without explicit authorization
and a current automatic-build safety check. NO-GO for merge, Production migration
or public Beta activation pending exact-revision CI/review, approved provider
ceilings/pricing, dependency integration and coordinated older-deployment
containment/cutover/recovery. Validation retains its separate NO-GO.
