# B4.3 isolated harness review — 2026-11-05

## Identity and evidence limits

Reviewed repository: OsaRete/saasscout-landing; draft PR #235;
branch `codex/b43-c1-source-transition-integrity`;
GitHub HEAD verified before review: `50d2b63aa73044968936c4bcb39178ea90fb3e00`.
Base: `d346eeb14e920b78556e8b884faaed23885bbc1c`.

The environment checkout initially contained base rather than PR HEAD. The first
Git fetch failed in the sandbox. Review began in a separate reconstruction of the
base archive plus all ten changed files obtained at the exact HEAD through the
connected GitHub reader; all ten baseline blob IDs matched. After approved
network access, Git fetched the real commit and the original repository switched
to the requested branch at the exact verified SHA. The coherent patch was then
applied there. The delivered commit therefore uses the actual PR HEAD as parent;
the temporary reconstruction's synthetic history is not published.

[Run 41719165554](https://github.com/OsaRete/saasscout-landing/actions/runs/41719165554),
job `126207056093`, explicitly fetched and checked out that HEAD. Retained safe
observations: preflight passed; both fresh migration applications included C1;
RPC permission denials passed; then the WITHHELD/history phase failed with the
unchanged fallback `test assertion failed`. The run's `database` job passed B3.1
and B4.2. These are prior-run results, not validation of this patch.

## Primary defect and exact attribution boundary

At reviewed HEAD, `scripts/validation-b43-db.ts:627` calls the real promotion
service for observations 1, 2, 3 and 4 before any named assertion in that phase.
Its fixture transformation expands counts and fixes participant assignment but
retains `tests/sql/validation-b31.sql:315`: `where i <> 4`. Thus observation 4 has
no approved shareable-evidence row. B3.1 deliberately uses it as a negative;
B4.3 accidentally treats it as a positive.

The active RPC replacement is
`supabase/migrations/20261008010000_qualified_evidence_snapshot_v2.sql`:
line 373 selects the approved row; line 483 checks `share.id is null`; lines
500–502 raise `23514` (`approved shareable evidence required`).
`lib/validation/promotion/promotion-service.ts:356` maps an RPC error to an
application `constraint_conflict` exception and discards the original SQLSTATE.
The harness catch does not inspect this exception, leaving its fallback unchanged.
The desired successful fourth promotion therefore contradicts the migration.
The correct database behavior is to reject missing human approval and commit no
promotion, shared row, snapshot or authority. No production invariant is relaxed.

**This is a source-proven harness defect, not evidence of an authority or integrity
bypass. The old log does NOT identify the exact loop iteration or observed
SQLSTATE.** It establishes an exception escaped without reaching a named failing
check; the loop is its first possible throwing path, followed by awaited historical
reader/retry calls. An earlier unexpected API/read failure cannot be excluded
retrospectively. In particular, do not report `23514` as observed in the old run,
or claim the historical-reader assertion failed. Exact retrospective attribution
is unavailable without persisted per-operation evidence or a faithful runtime
reproduction. The new code supplies that evidence going forward.

B4.3 now approves observation 4 and reserves observation 18 as an explicit
missing-review negative requiring HTTP 400 / SQLSTATE 23514 and no final ledger.
The original B3.1 fixture and all applied migrations remain unchanged.

## Assertion dependency map and review inventory

Each row is an execution dependency. The fault-ready identity marker is emitted
only after injected setup completes, so an earlier fixture P0001 cannot satisfy
the expected reader rejection. A failure in its prerequisites is not a
security violation proved by that row. All negative reader probes need a healthy
positive read immediately before and after; injected changes roll back.

| Gate / assertions | Required setup and expected behavior | Defects or remaining limits |
| --- | --- | --- |
| Identity, migration chain, freshness | Generated path/manifest/hash, dedicated loopback network/container/cluster, postgres login/effective BYPASSRLS, empty application tables | Existing guards retained. No arbitrary URL, linked target or reset path added. |
| Catalog / escalation | Private tables FORCE RLS and postgres ownership; application/PUBLIC ACL denial; eleven precise function identities, fixed search paths and definer flags; membership/admin audits and rollback stand-ins | Existing effective-role identity controls retained. SET ROLE does not impersonate session_user. ALL-trigger DDL in application denial tests remains intentional. |
| RPC execution denial | Signed local role tokens; service_role/anon/authenticated; null data + structured 42501 + HTTP 401/403 | PGRST/schema-cache errors, other SQLSTATEs, broken envelopes, unexpected success or transport errors remain failures. Token checks establish configured role, not independent API-session identity evidence. |
| Pre-fixture reader | Trusted postgres/postgres; canonical absent | Exactly P0001 required. No success is synthesized. |
| Core fixture | One canonical; owner lineage; 120 distinct participants/sessions/observations/classifications; 119 approvals, missing only 18 | Old inherited omission 4 fixed; replacement counts and marker changes now fail closed. Runtime cardinalities asserted. IDs and per-participant selection must exist before promotions. |
| C1 source SQL | Fixture participant/session/version 1; active/in-progress/matching/running; two contributions inside rollback | No-ops, withdrawal, archive, restore, insertion while withdrawn, each consent field, relevance, cancel, pause/resume/complete, stale and terminal errors; injected restriction failure rollback. Assertion failures now have fixed ZC SQLSTATE categories. |
| Four real promotions | Full reviewed source, exact canonical, unique authoritative classification, representative freshness | Actual returned promotion/shared UUIDs validated; nonduplicate required. WITHHELD count=4, B4.2 v2 snapshot count=4; current complete empty, history count=4 and original supporting/contradicting/mixed; exact retry must not add authority. |
| Missing-review control | Valid source 18 but no approval | HTTP 400/23514 plus no ledger. Detects a wrongly permissive promotion boundary; no approval bypass. |
| Candidate bound | Four baseline promotions, 96 additional valid reviewed distinct participants in ONE transaction | Old synthetic ledgers had no B4.2 snapshots and could fail for missing proof. New gate proves complete empty at exactly 100, then P0001 at 101, and rolls back all additions. Runs before lifecycle/classification/canonical changes; separate bounded bulk process budget. |
| Fact access / DML | Existing authority UUID and promotion UUID | Old unqualified joined `select id` is ambiguous (source-supported 42702). Qualify `a.id`. Wrong promotion_id fixture corrected. Empty-string UUID filters risk 22P02; empty UPDATE bodies can become SDK/PostgREST no-ops. Use valid UUID filters/nonempty payloads. Every actual denial still requires 42501, never any error. Some restriction filters match no rows; their purpose is table ACL denial, not row-policy proof. |
| Authority-write rollback | Reviewed eligible observation 17, synthetic rejection trigger and sequence counter | Require observed HTTP400/23514 AND nontransactional sequence hit, then no ledger/snapshot/new shared state. An unrelated application constraint cannot satisfy reachability. Temporary helpers remain only in verified disposable DB. |
| Missing authority | Actual fourth promotion; one authority deletion | Old ALL-trigger disable reaches internal FK triggers under non-superuser postgres (42501 risk). Disable USER only, keep FK checks, assert exactly one affected row, require P0001 in same transaction, connection rollback restores original fact rather than recreating its id/time. |
| Three proof corruptions | Actual second promotion's returned shared UUID and valid baseline | Old synthetic `d...2` was never assigned to a real promotion: UPDATE could affect zero rows. Use actual UUID, one-row guard, USER-only fault injection, expected P0001. Compare full private-table digests before/after rollback; never rebuild historical proofs from current rows. |
| Fault negative controls | Same baseline facts | Zero-target and multi-target mutations must produce dedicated ZX002, not count as expected reader rejection. These statements also roll back. |
| Participant restore / consent | Source 1; withdrawal restriction exists; add a second observation after restore | Four immutable-fact UPDATE/DELETE operations require 55000; restore retains withdrawal fact; later contribution does not inherit prior restriction; consent change captures both existing contributions. |
| Session transitions | Sessions 1 and 2 still in progress; restored relevance 1 | Relevance loss creates one permanent scoped fact, restoration retains it; cancellation creates one fact for session 2. Existing C1 SQL independently checks actual returned/persisted state. |
| Experiment transitions | Version 1 running; new valid version with separate experiment | Completion must not create cancellation restriction; cancellation of separate version creates exactly one. IDs/lineage match owner and subject. Source mutation SQL retains transaction rollback gates. |
| Independent backend wait | Participant 3 active; baseline classification/proofs valid; known PIDs | Marker formerly accepted partial PID lines; exit listener installed late could miss exit; no bounded final exit and competitor cleanup. Require full lines, register exit completion first, bounded processes, close/drain stdout, cleanup both backends. Existing wait only establishes serialization on one key, not F3 safety. |
| Classification ambiguity | Healthy baseline, observation 2 authoritative terminal | Old second terminal persisted and poisoned later tests. Now rollback-only; require P0001 then exact baseline restoration. |
| Classification supersession | Classification 1 promoted; AI-suggested successor supersedes it | Old successor persisted, leaving zero authoritative terminals and masking later failures. Now transaction asserts exactly one supersession restriction, expects reader failure, then rolls back. |
| Canonical transitions | Healthy reader after classification probes; target/conflict canonicals exist | A consistent merged canonical with restriction is a COMPLETE EMPTY read under this migration, not P0001. Old expected failure was wrong and could pass due to prior classification faults. Inconsistent active+merge-target still must be P0001; target deactivation must append its scoped fact. |
| Final history preservation | Same four original shared/ledger/snapshot/authority tuples | New full-row digest comparison across the complete run and historical reader after restrictions. Digest never printed; source changes cannot rewrite historical proofs or imply positive authority. |

### Remaining coverage gaps (not claimed fixed or executed)

- Full newly patched SQL/PostgREST suite, exact fault rollback and bulk boundary
  timing have not run in PostgreSQL here. SQL source/static tests cannot prove them.
- Fresh migration plus upgrade rehearsal (B4.3 already applied, C1 only additive),
  catalog OID/attachment preservation, and separate buggy-baseline negative control
  remain runtime requirements from the existing C1 review.
- Source SQL covers consent NULL-to-value and each independent field. Explicit
  value-to-NULL, participant with zero contributions, additional owner-scoped
  isolation controls and alternate multi-experiment membership schedules still
  need dedicated runtime evidence. Existing FK/owner checks do not replace it.
- Immutable snapshot failure rollback is covered by B4.2's independent suite;
  a new snapshot-write injection in this B4.3 suite has not been added or run.
- Ordinary workflow execution is sequential/fail-fast; a blocked fixture must be
  repaired before dependent assertions. It does not aggregate independent
  failures or execute the manual F3/upgrade matrices automatically.
- Service-side current-reader availability remains deliberately unresolved:
  runtime application roles still lack EXECUTE. No positive issuer or consumer
  is enabled by using a trusted fixture-only SQL path.

## F3 disposition: unresolved runtime gate

The C1 RETURN NEW correction leaves lock placement unchanged. PostgreSQL row
UPDATE reaches the BEFORE-row trigger after acquiring the tuple. Direct DML can
hold tuple T then wait for advisory A; an RPC/promotion preholding A can then
wait for T. There is a source-supported inversion, not a measured deadlock in
this review. The existing participant waiting test never closes this cycle.

A narrowly scoped candidate is to replace ONLY the source-row trigger's blocking
advisory acquisitions with `pg_catalog.pg_try_advisory_xact_lock` using the exact
existing `hashtextextended('v8-b3.1:' || domain || ':' || identity, 0)` key. On
false, raise 40001 before any mutation/capture commits and require retry of the
entire transaction. Keep experiment-before-participant order and all caller
ACL/definer/search-path boundaries. Existing RPC prelocks are reentrant; direct
DML with no contention still takes the same locks. A contended direct updater
would abort and release its tuple, allowing the advisory-first peer to proceed.

This changes direct-DML contention behavior and requires runtime review before
any additive migration. It is **proposed, not implemented** here. It addresses
that trigger's waiting edge only. It does not eliminate cross-command RPC cycles,
multiple participant/experiment visitation inversions, or stale REPEATABLE READ
snapshots. Do not replace blocking with an unlocked best-effort path, suppress
withdrawal, remove restrictions, restore RETURN OLD, or retry only the last
statement inside a failed transaction.

Controlled schedules must use verified disposable connections A/B/observer O,
record PIDs, use observed pg_blocking_pids/pg_stat_activity barriers, and bound
both statement/lock waits. Follow the exact fixtures and six schedules already
specified in `docs/V8_B43_C1_SOURCE_TRANSITION_REVIEW.md`, covering:

1. A holds participant advisory; B directly withdraws or edits consent and waits;
   A calls participant RPC against B's tuple. Record both wait edges/40P01 or
   explicitly report no reproduction. Repeat with the proposed try-lock patch;
   require immediate B 40001, rollback, A progress, then whole-B retry.
2. Repeat experiment/session tuple inversions for relevance and cancellation,
   and experiment lifecycle transitions. No timeout counts as deadlock evidence.
3. RPC-only commit-order controls: returned/persisted state and exactly-once
   permanent restrictions after restoration.
4. Observation insert versus withdrawal both orders, including membership
   visibility under READ COMMITTED and REPEATABLE READ/serialization failure.
5. Promotion races, multi-experiment participant membership, deterministic lock
   ordering, and deliberately opposed multirow visitation.
6. Cross-command participant RPC followed by session RPC versus a peer holding
   experiment and waiting for participant. A trigger-only change cannot certify
   this composition; capture remaining cycle and disposition separately.

Rollback victims AND survivors before comparing baseline; retry whole commands
in new transactions. Separate 40P01 from 55P03/57014 and 40001. Retain only safe
schedule/PID/edge/code metadata, no row contents. No deadlock-freedom claim is made.

## Patch and authorization disposition

Patch is harness/workflow/test/documentation only; no application code, applied
migration, ACL, RLS policy, SECURITY DEFINER boundary, historical evidence rewrite,
positive authority or consumer change. Workflow adds the omitted C1 SQL/migration
and new harness files to its path/static coverage; manual dispatch/reset gates
are unchanged. Publishing may trigger Preview/automatic PR jobs and was NOT done.

**GO for one separately authorized disposable diagnostic run of the reviewed
patch after it is applied to and verified on the PR branch.** This is a diagnostic
recommendation, not dispatch authorization or a promise of a final green run.
The run must execute B3.1/B4.2 independently, the complete patched B4.3 suite,
and retain each invariant/code result. Calling that run comprehensive also
requires scheduling the manual upgrade/negative-control/F3 matrix above; the
current workflow alone does not perform those schedules. No existing/unverified
database may be reset. No Actions run has been dispatched in this review.

**NO-GO for merge and NO-GO for production migration/deployment.** Full patched
runtime evidence, exact latest-failure attribution limits, F3 disposition,
upgrade/negative-control evidence and source coverage gaps remain open.

## Runtime attempt and local verification

Initial sandbox probes could not reach Git or the Docker socket. Automatically
approved access subsequently fetched the actual PR HEAD and established a local
Docker 28.4.0 daemon with no existing containers/images. The first Docker-absence
inference was incorrect; socket access, not installation, was the restriction.

The installed Supabase launcher tried to write CLI state to a read-only home.
Downloaded release v2.118.0 into work/, verified the archive SHA256 against its
published checksums (`f6089a86fb9d9221c958193a277338daddd6822f706929943812fa32e106c86d`),
used its complete launcher plus companion Go binary, and set SUPABASE_HOME to
workspace-local state without changing HOME. Downloaded/extracted Debian's psql
17.11 client into work/, verifying its published package SHA256
`9d8558f8dd57c8e92e218a20698383575d53742ca3f9e7c2b7fe5f246d5216ae`.

Generated a new isolated project using the repository script and verified its
manifest/config hash and unique empty loopback bridge network. The first
companion-only CLI invocation rejected the start command and created no database.
The complete pinned launcher then attempted image acquisition and Docker returned
`Get "https://public.ecr.aws/v2/": Forbidden`. Startup ended before database
creation; no preflight/reset/migrations/tests were run against that target.
No alternative registry, host-network bypass, remote database or production
credential was used. The unused generated network was inspected and removed
only if still empty and its recorded identity matched.

Final local validation: `npm test` 112 passing file results, zero failures/skips;
focused six-file run 123 passing assertions, zero failures/skips; full lint zero
errors/four existing page warnings; strict ES2022 targeted TypeScript and exact
workflow type/lint commands passed; webpack build passed; whitespace check passed.
Process-helper tests used local shell children to exercise split marker output,
clean premature exit and bounded termination. They are not PostgreSQL lock tests.

**Still untested:** all patched live SQL and PostgREST controls, migration/upgrade
rehearsal, buggy-C1 negative runtime, full 100/101 boundary timing, fault rollback
on non-superuser Supabase postgres, and every F3 controlled schedule. Prior-run
B3.1/B4.2 successes do not establish patched B4.3 success. ECR access must be
restored by the supported environment configuration before local runtime can
continue; a separately authorized Actions runner is another execution venue.

The final response records the exact local commit and changed files; verification
results and untested infrastructure are recorded above. Publication requires the user’s approval because branch updates can trigger
Vercel Preview and automatic PR checks; manual Actions dispatch is separately gated.
