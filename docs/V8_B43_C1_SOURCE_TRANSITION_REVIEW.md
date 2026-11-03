# B4.3-C1 — Source Transition Integrity Remediation

Proposed patch only. Base `main`, verified through GitHub on 2026-11-03:
`d346eeb14e920b78556e8b884faaed23885bbc1c`; the preparation started at that commit.
The original five-file patch was preserved unchanged in local commit
`c719a5fc01e2017832a4ad8a08f66913998126b2` on dedicated branch
`codex/b43-c1-source-transition-integrity`. All five files were already in their
intended repository paths and matched the backup ZIP byte-for-byte; no transfer
from `work/` was needed. That original backup and commit remain preserved.
Subsequent changes in this continuation are review documentation only. Publication
is authorized as a draft PR for review, never as a merge or deployment. No
production connection, secret change or migration execution has occurred.

## Finding and proposed correction

The full applied `20261030000000_b43_current_evidence_authority.sql` was inspected.
Its BEFORE ROW lock function returns OLD on UPDATE. PostgreSQL proceeds with that
returned tuple: the proposed status, consent, notes and lifecycle timestamps can
all be replaced by their old values. This is not the NULL-return mechanism that
skips a row entirely; UPDATE/RETURNING and AFTER triggers may still run, reporting
the old state and finding no transition. Later guards can also see OLD and miss
invalid changes. An error-free RPC therefore does not establish persistence.

New migration `20261103000000_b43_source_transition_integrity.sql` replaces only
`validation_b43_lock_source_change()` and repeats its existing EXECUTE revocation.
All advisory-lock calls, domains, identities and order are byte-for-byte preserved.
It returns NEW for all four existing INSERT/UPDATE attachments. No DELETE trigger
uses it; a future DELETE attachment would require a separate reviewed contract.
CREATE OR REPLACE retains function identity, owner, dependent triggers and ACLs;
SECURITY DEFINER, PL/pgSQL and `pg_catalog,pg_temp` search path remain explicit.
The migration must run as the trusted postgres principal that owns the function;
actual catalog attributes must be verified in disposable Supabase.

No applied migration changes. No positive authority writer, authority backfill,
new production consumer, grants, RLS changes, evidence/snapshot mutability or
historical qualification changes. The only authority state remains `withheld`.
This preserves evidence integrity by making restrictive source facts capturable.

## Trigger and RPC interaction inventory

The B4.3 migration creates these 13 triggers; none is recreated by C1:

| Relation | BEFORE | AFTER |
| --- | --- | --- |
| consumption authority | `validation_b43_authority_immutable` (UPDATE/DELETE reject) | — |
| source restrictions | `validation_b43_restrictions_immutable` (UPDATE/DELETE reject) | — |
| promotions | — | `validation_b43_new_promotion_withheld_authority` (INSERT) |
| participants | `validation_b43_participant_change_lock` (UPDATE OF status/three consent fields) | `validation_b43_participant_restrictions` (same columns) |
| observations | `validation_b43_observation_source_lock` (INSERT) | `validation_b43_observation_participant_restriction` (INSERT) |
| sessions | `validation_b43_session_change_lock` (UPDATE OF status/relevance) | `validation_b43_session_restrictions` (same columns) |
| experiment versions | `validation_b43_experiment_change_lock` (UPDATE OF lifecycle) | `validation_b43_experiment_restriction` (same column) |
| classifications | — | `validation_b43_classification_restriction` (INSERT) |
| canonical problems | — | `validation_b43_canonical_restriction` (UPDATE OF status/merge target) |

Four of those BEFORE triggers attach to the corrected function. Participants use
OLD.id; sessions use OLD experiment then OLD participant; experiment versions use
OLD.id. Observations use NEW experiment then optional NEW participant (OLD is
undefined for INSERT). Returning NEW keeps all incoming changes available.
UPDATE OF fires even for `SET status=status`; capture functions use DISTINCT
checks, so a no-op takes locks but adds no restriction. Their unique index makes
repeated restrictions idempotent. Restrictions and source changes are atomic.

Existing source guards and B3.1 coordination were also inspected in migrations
20260828000000, 20260830000000 and 20260926000000. PostgreSQL runs same-kind
triggers alphabetically. The B4.3 session/experiment lock hooks precede their
existing row guards; those guards now receive NEW and can enforce lineage,
terminal state and transition rules again. The observation B4.3 lock hook runs
before the existing participant-scope guard and B3.1 observation coordinator;
B3.1 repeats the same transaction advisory locks reentrantly. Observation and
classification UPDATE/DELETE immutability remains in force. Canonical registry
BEFORE STATEMENT coordination still precedes the B4.3 AFTER ROW restriction hook.
Classification B3.1 BEFORE INSERT coordination precedes restriction capture.

B3.1 lifecycle RPCs are unchanged: `validation_update_participant_status` locks
participant before UPDATE; `validation_update_interview_session` and
`validation_update_interview_relevance` discover lineage, lock experiment then
participant before UPDATE; `validation_transition_experiment_version` locks the
experiment before UPDATE. CAS predicates and 40001 stale failures remain.
Session and experiment RPCs set lifecycle timestamps in the same update: these
must persist as well as status. Session terminal guards reject even terminal
no-op updates; experiment terminal timestamp rewriting can also reject a retry.
C1 deliberately does not change these existing retry semantics.

B4.2 contracts reviewed: whole-row v2 immutable attestations, actual persisted
shared-row codec/schema, fail-closed complete historical reads, atomic snapshot
creation, and unchanged B3.1 promotion critical section in both B4.2 replacement
RPC migrations. C1 touches neither those functions nor proofs. The existing
B4.3 suite checks new WITHHELD facts, v2 proofs, eight-field historical reads,
polarity, fact immutability and role/ACL/RLS boundaries. These remain required
runtime regressions, not guarantees established by source review alone.

## F3 lock analysis — residual risk, no deadlock-freedom claim

Source-level evidence: lifecycle RPCs explicitly acquire advisory locks before
UPDATE (B3.1 migration lines 980, 1049, 1142, 1187). The B4.3 fallback hooks acquire
those locks inside BEFORE ROW UPDATE triggers, after the executor can have locked
the target tuple. Direct service-role source writes are therefore materially
different from coordinated RPC calls. Consent updates have no new coordinator in
this patch. A concrete potential wait cycle is:

1. A holds participant advisory lock P (or experiment E).
2. B directly updates that participant (or experiment), locks its tuple, then its
   BEFORE hook blocks acquiring P (or E).
3. A calls the corresponding lifecycle RPC, reenters its advisory lock and waits
   for B's tuple. A waits for B; B waits for A.

This is a credible tuple/advisory inversion, not an observed deadlock in this
session. The correction retains it; even the OLD-returning function acquires the
same locks. A successful participant lock-wait test alone cannot rule it out.
Session updates have an analogous risk. Multiple commands per transaction can
also take participant then experiment locks in reverse order, and multirow direct
updates can visit distinct lock identities in different orders. Foreign-key tuple
locks, participant contribution inserts, unique-index conflict waits, canonical
coordination and sorted multi-experiment promotion locks enlarge the graph.
Hash collisions can add contention. No lock elision or broad ordering redesign
is included because that would exceed this minimal behavior correction.

Required F3 disposable evidence: two independent backends plus a third observer,
backend PID markers, explicit barriers and `pg_blocking_pids`/`pg_locks` evidence;
set bounded statement/lock timeouts and a short deadlock timeout. Reproduce the
schedule above with A holding advisory lock, observe B waiting on A's advisory
lock, then have A execute UPDATE. Record 40P01 separately from timeout/cancellation,
which is not deadlock success evidence. Verify victim rollback leaves no partial
restriction/source change; a whole-transaction retry must capture exactly once.
Exercise participant consent/status, session status/relevance and experiment
lifecycle direct UPDATE versus RPC, and competing promotion/observation INSERT,
classification INSERT, sorted multi-experiment promotions, reversed multirow and
multi-command transactions, under READ COMMITTED and REPEATABLE READ. Record both
commit orders and restriction contribution sets. Do not infer snapshot freshness
from locking alone; repeatable-read capture visibility needs specific validation.
Any remaining reachable cycle requires an explicit separate F3 disposition before
production approval; remediation could require a coordinated write boundary or
statement-level strategy, with independent authorization/design review.

## Patch files and tests

| File | Change |
| --- | --- |
| `supabase/migrations/20261103000000_b43_source_transition_integrity.sql` | Minimal function replacement and unchanged revocation |
| `tests/sql/validation-b43-source-transitions.sql` | Transactional runtime regression and restriction-failure injection |
| `scripts/validation-b43-db.ts` | Run SQL only after existing disposable preflight/fixtures, verify rollback, fix missing cancellation fixture UUID |
| `tests/validation-b43-source-transition-migration.test.ts` | Static scope/lock/security preservation comparison to applied function |
| `docs/V8_B43_C1_SOURCE_TRANSITION_REVIEW.md` | Review, test gates and risk record |

The focused SQL asserts returned and stored withdrawal, archive, restoration,
contribution restrictions, INSERT while withdrawn, repeated restriction
idempotency, each consent column independently, no-op status/consent/relevance,
notes persistence, relevance loss/restoration, session cancellation timestamps,
experiment pause/resume/completion/cancellation timestamps, terminal guards and
stale CAS errors. Nested consent/completion subtransactions prove rollback;
outer rollback restores fixture state. Injected restriction failure tests all six
restrictive mutation categories, checks the exact injected error, and compares
complete source tuples and restriction counts after subtransaction rollback.
The runner verifies outer rollback removed changes and the inserted contribution.
Existing B4.3 coverage additionally tests observations after restoration and
permanent restrictions on promoted evidence. SQL tests are integration tests;
the static comparison is not a PostgreSQL behavioral test.

## Disposable database release gates

Use only the generated temporary B4.3 Supabase project and its existing
schema-v2 manifest, loopback network/container/cluster identity checks in
`docs/V8_B43_B_DISPOSABLE_DATABASE_VALIDATION.md`. Never substitute a linked or
ordinary project. This session did not start/reset any database. Follow the
repository's separately authorized startup/reset procedure during validation.

Before production review, require all of the following:

1. Full fresh migration-chain application and upgrade rehearsal with B4.3 already
   applied; verify its bytes/history unchanged and only the new migration added.
   Check migration transaction behavior and postgres owner/BYPASSRLS/ACL/search
   path attributes before and after. Verify all four attachments in pg_trigger.
2. Full unchanged B3.1 and B4.2 suites on their designated fresh disposable setup,
   plus the updated B4.3 suite on its independently verified fresh setup. Record
   exact patch SHA, PostgreSQL/Supabase versions, command exits, no skipped gates.
3. Focused SQL tests must fail on the buggy baseline and pass with C1. For the
   negative control, use a separate disposable copy with only C1 omitted and
   execute the focused SQL after its fixtures; do not bypass the normal runner's
   exact migration-chain checks or mutate any applied migration in place.
4. Exercise direct source DML and service-role lifecycle RPCs; check persisted
   complete tuples and restriction scope/reason/owner/contribution, stale errors,
   terminal/no-op behavior, rollback on restriction failure and restoration with
   permanent restrictions. Validate all consent fields, null transitions,
   participant without observations and owner-scoped contributions.
5. Execute the controlled F3 schedules above. Existing independent-backend
   participant waiting and all B3.1 promotion races are necessary but insufficient.
6. Verify no positive authority accepted, only WITHHELD for new promotion, failed
   authority/snapshot insert rolls back, old proofs immutable/unchanged, current
   reader fail closed, historical reader and polarity unchanged; application roles
   still cannot read/write facts, invoke B4.3 functions or escalate privileges.
7. Assess incident impact separately: prior suppressed update intent is not
   recoverable from current rows alone. Review trusted operational records and
   missing consent/withdrawal intent through an approved incident process. No
   speculative backfill, replay, evidence rewrite or positive reauthorization.

## Verification and recommendation

Local verification (2026-11-03):

| Check | Result |
| --- | --- |
| `npm test` | PASS: 111 file-level results, zero failures/skips |
| Focused B3.1/isolation tests | PASS: 2 file-level results |
| C1 migration scope comparison | PASS: 1 file-level result |
| `npm run lint` after final runner edit | PASS: 0 errors, 4 existing page warnings |
| `npm run build -- --webpack` | PASS: production compilation, TypeScript and route generation |
| Targeted strict ES2022 TypeScript (runner and new static test) | PASS |
| Broad TypeScript, exact base versus patch comparison | FAIL on both: identical 175 diagnostics in 26 test files; zero added or removed diagnostics |
| `git diff --check` | PASS |
| Supabase SQL, upgrade rehearsal, F3 schedules | NOT RUN / UNVERIFIED |

No PostgreSQL/Supabase runtime pass is claimed: `psql` is absent and no disposable
project was provisioned or reset. F3 schedules and runtime SQL remain unverified.

**GO for separate code/security review of this proposed minimal patch. NO-GO for
production migration, merge or deployment until disposable behavioral/security
checks, F3 disposition, and incident-impact review are complete and independently
approved.** Retaining OLD is not a safe rollback strategy: it restores suppressed
source transitions. If deployment later fails, stop and investigate rather than
rewriting history or removing immutable restriction facts.


## Continuation review evidence and disposable test authorization

### Exact TypeScript baseline comparison

A tracked-file archive of base `d346eeb14e920b78556e8b884faaed23885bbc1c` was
extracted to `/workspace/work/b43-c1-main-typecheck`, outside the patch checkout.
Both runs used Node 24.19.0, TypeScript 5.9.3, the same installed dependencies and
copied Next generated type inputs. Each ran:

```sh
./node_modules/.bin/tsc --noEmit --incremental false --pretty false
```

Both exited 2. Full diagnostic output was byte-identical: 175 diagnostics across
26 test files, none in either changed TypeScript file. This establishes the broad
failures as pre-existing relative to the requested base in this environment;
it does not claim all repository typing is healthy. Examples include duplicate
object keys (TS1117), ES2018 regex features with the ES2017 project target
(TS1501), outdated test fixture shapes (TS2322/2345), missing properties
(TS2339/2551), and 73 unknown-value errors in scan artifact tests (TS18046).
No unrelated typing or target changes were made. The explicit ES2022
infrastructure type-check passed, as did 97 focused tests with the CI-style
server-only loader and test isolation disabled, including the new migration test.
The initial 111 file-level tests, lint and webpack build results above remain
preparation evidence; the broad failing check is retained, not hidden by them.

### Replacement semantics and attachment verification

The zero-argument identity and `RETURNS trigger` type are unchanged. PostgreSQL
CREATE OR REPLACE updates the existing function rather than dropping it, preserving
its OID, ownership, dependent `tgfoid` references and existing privileges. The
same language, SECURITY DEFINER and search path are restated; omitted properties
remain the same defaults as the original (VOLATILE, non-strict, parallel unsafe).
The repeated REVOKE reasserts the original denial; there is no intended net ACL
change relative to main. No DROP/CREATE trigger or evidence rewrite is necessary.

A complete migration-source search finds exactly these four attachments and no
later replacement of the function beyond C1: participant change lock, session
change lock, experiment change lock, and observation INSERT source lock. This is
source verification only. Before and after disposable upgrade, record the
function OID, `pg_get_functiondef`, proowner, proacl, proconfig, prosecdef,
provolatile, proparallel and these catalog rows; require the same OID/attachments
and enabled triggers, with only the reviewed body correction:

```sql
select t.tgname, t.tgrelid::regclass, t.tgfoid, t.tgenabled,
       pg_get_triggerdef(t.oid)
from pg_trigger t
where not t.tgisinternal
  and t.tgfoid='public.validation_b43_lock_source_change()'::regprocedure
order by t.tgname;
```

### Concrete F3 schedules (proposed, not executed)

Use three independently verified disposable PostgreSQL connections A, B and O.
Use the existing B3.1 fixture's owner `10000000-0000-0000-0000-000000000001`,
participant `90000000-0000-0000-0000-000000000001`, session
`a0000000-0000-0000-0000-000000000001`, experiment version
`70000000-0000-0000-0000-000000000001`. Require active participant,
in-progress/matching session and running experiment before each schedule.
Record A/B PIDs first. In each transaction set statement_timeout to 10s,
lock_timeout to 8s and, with the disposable principal's permission,
deadlock_timeout to 100ms. Wait on observed blocking barriers, never blind sleeps.

1. **Participant tuple/advisory inversion:** A begins and calls
   `validation_b31_lock('participant', participant_uuid::text)`. B begins and
   directly updates that participant's status to withdrawn. O must see B blocked
   by A on the advisory lock, while B has entered the row update. A then calls
   `validation_update_participant_status(owner_uuid, participant_uuid,
   'active','archived')`. Record any 40P01 with the two wait edges; 55P03/57014
   is timeout/cancellation and does not prove deadlock detection. Repeat with B
   changing consent_purpose and A withdrawing the participant.
2. **Session inversion:** A preholds the experiment advisory lock. B directly
   changes session relevance to adjacent_segment. After O observes B blocked on
   A's experiment lock, A calls `validation_update_interview_relevance` with
   target_segment_match to unknown_relevance on the same session. Repeat using
   a valid direct session cancellation (including cancelled_at) versus
   `validation_update_interview_session` cancellation. A's RPC takes experiment,
   participant, then tuple; B's trigger takes tuple then experiment, participant.
3. **Experiment inversion:** A preholds the experiment advisory lock. B directly
   changes lifecycle to cancelled with cancelled_at. After O observes B blocked
   on A, A calls `validation_transition_experiment_version` running to paused.
   Capture the tuple/advisory cycle or explicitly report failure to reproduce.
4. **Coordinated positive control:** A starts a participant withdrawal through
   the RPC and keeps its transaction open. B attempts restoration using the RPC.
   Observe B waiting for A before its UPDATE; commit A, then allow B to commit.
   Assert status active and exactly one permanent withdrawal fact per original
   contribution. Run analogous controls for experiment pause/resume and session
   relevance loss/restoration, asserting returned and persisted states.
5. **Membership and snapshot visibility:** A locks participant and withdraws in
   an uncommitted transaction. B inserts a new valid observation, which takes
   experiment then waits on participant. Commit A; commit B only after asserting
   the inserted contribution receives its withdrawal restriction. Reverse the
   order by having A insert/hold both advisory locks before B withdraws. Assert
   B captures every committed contribution. Repeat under REPEATABLE READ with
   B's snapshot established before A's commit; document restriction completeness
   or expected serialization failures rather than assuming locking refreshes a
   snapshot. Use distinct ingestion keys and disposable contribution IDs.
6. **Promotion and multi-command coverage:** replay existing B3.1 promotion
   helpers against participant/session/experiment mutations, observation and
   classification inserts. Include a participant represented in two experiments
   and deterministic promotion experiment ordering. Then deliberately compose
   A participant-status RPC followed by a session RPC, while B holds experiment
   and waits for participant: this tests cross-command inversion even when each
   individual RPC has consistent order. Repeat opposite participant/multirow
   visitation orders. A single-key wait test does not cover these graphs.

O records `pg_stat_activity`, `pg_blocking_pids(A/B)` and relevant advisory,
transactionid and tuple entries from `pg_locks`. Tuple ownership is not always
shown as a granted tuple lock, so retain the blocking graph and SQLSTATE rather
than requiring a misleading pg_locks shape. For inversion tests, issue ROLLBACK
on the victim before retrying and inspect survivor source state and restriction
facts. Roll back the survivor too and compare the full baseline; then retry the
whole intended command in a new transaction and assert exactly-once restriction
capture. Commit-order controls intentionally commit disposable fixture changes;
use a separately authorized fresh setup before the next destructive suite.
None of these schedules has been run in this session.

### Exact workflow and manual gates

Workflow: `.github/workflows/validation-b31-database.yml`, display name
**Validation B3.1 Database**. The B4.3 runtime job is
`b43-disposable-database` / **isolated B4.3-B database**. It requires:

- Manual `workflow_dispatch` on this review branch with required boolean
  `authorize_disposable_reset=true` (default false). Do not dispatch on main.
- GitHub environment `b43-disposable-database-validation`, with required human
  reviewers configured and verified by a repository administrator. YAML names
  the environment but cannot prove reviewer protection is configured.
- The generated temporary project/manifest and unique loopback network; pinned
  CLI 2.118.0; Docker labels, exclusive network attachment, loopback published
  ports, independent PostgreSQL system_identifier and principal preflight before
  reset. Startup itself applies migrations to the new disposable project, so
  startup authorization must cover that effect, not only fixture execution.
- Explicit workdir plus `db reset --local --no-seed` only for the generated
  project, followed by the runner's repeated identity/hash/freshness checks and
  `npm run test:validation-b43-db`. No linked or remote-target command.

An ordinary draft PR also triggers the separate `database` job automatically:
it starts fresh Supabase on a GitHub-hosted ephemeral runner and runs B3.1 and
B4.2 with local resets. This is not the strongly verified, generated B4.3 job and
is not evidence that C1's focused SQL ran. The `b43-static` PR job runs its fixed
four existing test files; the new migration test needs the explicit command used
in this review (or a later reviewed workflow update). Playwright's current tests
visit playwright.dev and provide no SQL security evidence. No workflow edits or
manual dispatches were made in this five-file patch.

For local testing, the existing disposable-validation document separately requires
explicit authorization to create the unique Docker network, start the generated
project and reset that project. Preparation/code-review approval in this task is
not startup/reset approval. No such action was taken here. Exact workflow
configuration and environment reviewer settings must be checked at execution time.

**GO to request/approve testing in the generated disposable environment after
those manual gates and tooling checks. NO-GO to execute a destructive test now:**
there is no verified disposable target, psql is absent, and startup/reset approval
has not been given. Even a green ordinary PR database job leaves the manual B4.3,
upgrade, negative-control and F3 schedule gates open. Production remains NO-GO.
