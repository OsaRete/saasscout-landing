# Private Validation database repair (PR 2)

Baseline: merged PR #237, `be650dfba73afeab5e381431f0309964700c2aa7`.
Beta targets six functional private Validation methods; advanced Data Moat,
F4 and shared qualified consumption remain deferred. Landing Pages is next.

Reviewed the actual repository AGENTS.md, PRODUCT_VISION, DATA_MOAT,
SYSTEM_ARCHITECTURE, AI_PRINCIPLES, ENGINE_GUIDELINES, CODING_STANDARDS,
PRODUCT_ROADMAP, Validation domain/schema/API and lifecycle contracts,
B3.1 promotion, B4.2 integrity, B4.3 authority/safety/disposable contracts,
private release-boundary/remediation and Vercel checklist documents; inspected
all 37 historical migrations, their effective triggers/grants, acceptance runners,
fixture loader and both CI workflows. Older interviews/surveys-only scope and
service-role shared grants are historical contracts superseded by this task.
No historical migration is edited.

## Exact repair

One migration: `20261111000000_private_validation_database_repair.sql`.

1. Replace `validation_b43_lock_source_change` with the same body and advisory
   lock calls, returning NEW for INSERT/UPDATE and OLD for DELETE. The existing
   participant/session/experiment guards and restriction triggers remain in place.
2. Revoke all application-role access to shareable preparation rows, promotion
   ledger and qualified snapshots, and execution of promotion, B3.1 preparation,
   B4.2 proof helpers and the already-denied B4.3 reader. PUBLIC, anon,
   authenticated, service_role and authenticator are covered.

Private source DML, ownership FKs, RLS, append-only history and immutable
attestations remain. Shared `problem_observations` access used by Discovery/Scan
is retained: historical sanitized rows are not erased or hidden from ordinary
shared-table reads. Such rows alone do not prove qualification or grant current
consumption authority; application roles cannot access the qualifying proof.
Private source reads needed for private work also remain; denial of shared
preparation means its dedicated statements, SQL helpers and promotion access,
not concealment of an owner's own source material.

The existing v2 capture RPC becomes a postgres-owned SECURITY DEFINER with fixed
`pg_catalog,pg_temp` search path and the same service-only EXECUTE grant. It
rejects any non-null shared statement or anything other than false review input
before source work. Its only privileged shared-table access is the existing
historical retry-conflict check; private capture/retry and persisted owner/lineage
checks remain. It cannot insert a shared statement. This is the existing trusted
server executor model, not independent end-user identity at SQL. Database owners
remain trusted and can alter enforcement objects.

## Acceptance and CI

The focused SQL runner reuses the existing B3.1 relational fixture. Positive proof
fixtures use postgres only. It checks populated upgrade and fresh install, complete
source tuples, private capture/retry, wrong-owner and illegal/terminal transitions,
shared role/ACL denial, unchanged proofs, permanent restrictions, injected-failure
rollback, and an observed independent-backend wait on the original domain lock.
Upgrade compares historical shared/preparation/ledger/snapshot/authority rows.

The existing B3.1 and B4.2 suites remain required. B3.1 now expects denied runtime
promotion/preparation grants. B4.2/B4.3 positive fixtures use an explicit local
postgres transport after the existing disposable preflight; actual TypeScript
qualification/integrity algorithms and their source pins remain. Role-denial
probes retain real PostgREST clients. No application grant is restored and no
production module uses this transport. Its source is pinned with the fixture
adapter. This changes positive proof transport, so native SQL positives are not
claimed as successful application-role PostgREST reads.

The existing database job first starts the historical chain without the new
migration, restores the file and runs populated upgrade, resets the full chain,
runs B3.1/B4.2, then resets and runs independent fresh repair acceptance. The
isolated B4.3 job retains its manual dispatch and environment protection.

Local execution uses a uniquely created PostgreSQL 17 container with no network,
no published ports and synthetic auth roles/schema from the existing bootstrap.
All historical migrations and the repair execute; this is real PostgreSQL,
not a full Supabase Auth/PostgREST installation. Local psql is transported through
`docker exec`; CI uses its existing native psql and disposable Supabase.
Final test/CI results and any merge blocker are recorded in the PR report.

## Separate owner-approved production deployment

No remote migration, production data change, Vercel change or activation occurred.
After code merge and separate owner approval:

1. Keep both capability variables DISABLED. Verify the intended Supabase project,
   migration history and approved backup/PITR recovery point. Confirm all earlier
   migrations through B4.3 are present and no unrelated migration is pending.
2. Inspect deployed function ownership, application-role reachability and effective
   grants/column grants/wrappers against the reviewed baseline. Unexpected drift
   stops deployment; this repository is not evidence of deployed catalog state.
3. Run `supabase migration list`, then `supabase db push --dry-run` from the merged
   revision against the explicitly verified project. Require exactly this pending
   migration. Owner reviews the target and plan before the write.
4. Run `supabase db push` once. Apply the migration transactionally through the
   normal migration runner; never paste partial sections or disable triggers.
5. Run `supabase migration list`; read-only catalog checks must confirm the fixed
   function, ownership/search paths and effective application denials. Verify
   historical counts/proof integrity using approved administrative read-only
   checks, without exposing private data. Do not run fixture tests in production.

Risk: function/table DDL takes brief locks and may wait behind active work; grants
intentionally break any undiscovered shared-track caller. Schedule an appropriate
maintenance window and stop on lock/error or unexpected consumers. No rows are
rewritten, backfilled or deleted. A failed transaction rolls back its DDL/ACLs.
After commit, retain the repair during application rollback: old shared callers
must fail closed. Do not restore shared grants or RETURN OLD. Recover with a
reviewed forward migration; restore backup/PITR only for an independently verified
incident under separate owner approval, accounting for intervening writes.

Private/public activation remains blocked by Beta integration acceptance, stable
survey retry identity, publication/revocation/submission races, abuse protection,
and completeness decisions documented in PR 1. Neither private/public activation
nor shared/AI authority follows from this database repair. PR #235 is untouched.

## Local execution record

- PostgreSQL 17: complete 37-migration baseline and 38-migration fresh chain,
  populated upgrade, historical row preservation, source/restriction atomicity,
  private interview retries and private survey cancellation pass.
- Observed source-lock waiting and committed restrictions pass in both paths.
- Existing B3.1 static SQL and all eight independent-connection scenarios pass.
- Focused offline run: 1,514/1,516 initially; two missing transport-mock failures
  corrected. B4.3/fixture rerun: 67/67 pass; remaining 1,449 passed unchanged.
  Final B4.3 orchestration rerun after fixture correction: 58/58 pass. No skips.
- Native SQL fixture transport: concurrent RPCs, three polarities, composite joins,
  native proof and exact count pass. The positive B4.3 fixture now includes its
  fourth reviewed statement; B3.1's intentionally unapproved negative stays intact.
- Full lint passes (four existing warnings); focused TypeScript no-emit passes;
  production build passes. Full repository tsc was not rerun; the accepted PR #237
  175-diagnostic baseline is not claimed fixed.
- Full Supabase/PostgREST CI is tracked on PR #238. Isolated B4.3 remains manual;
  it is not a local pass or an activation approval.
