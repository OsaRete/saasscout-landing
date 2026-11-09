# B4.3-F4-B2.3 — prepared harness and static security review

Local preparation only. No PostgreSQL connection, migration application, reset,
workflow dispatch, commit, push, PR-state change or production operation occurred.
F4/F4-A runtime findings remain human-supplied context, not newly retrieved logs.

## Preserved implementation and actual finding

The complete 2,052-line B2.2 migration is unchanged and unapplied:
`20261107000000_b43_executable_concurrency_contract.sql`, SHA-256
`81b46d1c1e0d0f898f0f716faf17bb0c2a2f3f633f89cbd191315cd35735e279`.
All B2.1/B2.2 application, manifest, documentation and test changes are retained.

**Source-proven harness security gap, corrected here:** the existing F3
`local_revision` guard checked HEAD and tracked changes but ignored untracked
migrations/imported modules. An approved SHA could therefore accompany unreviewed
executable files. The smallest correction checks `git status --porcelain
--untracked-files=all` and requires empty output. Tests exercise rejection before
connection. Local dynamic imports disable bytecode generation so the guard does
not create its own untracked cache files. This is an inherited harness gap, not
a discovered privilege expansion in the B2.2 migration. No expectations were
weakened to accommodate it.

No additional repository-proven B2.2 security/compatibility defect was found by
this static review. That is not a PostgreSQL compilation or runtime-safety result.

Two harness-only corrections were completed during final verification. The test
that deliberately clears its environment restores the existing PATH only around
the pure Node preparation child; its integration check passes. Driver-call review
also found that parameterless fixture batches were supplied an empty bind tuple.
The SQL helper now calls `cursor.execute(sql)` for those batches and retains
`cursor.execute(sql, params)` for bound commands. An offline cursor-call negative
control verifies both forms. Neither correction changes the production migration.

## Historical evidence and new schedules

The exact historical source remains available at
`cdfa204ac1e911a5faf02ae0fc21025e149c0e45:scripts/validation-b43-f3.py`.
Offline tests compare its isolation/variant constants with all 24 retained case
identities. Existing F3 inversion/race interleavings remain readable; unsafe
prepared-command retry loops are removed. F3 now refuses a fenced schema before
fixture application. It is not the new acceptance entrypoint.

Its classification assertion now binds purpose, reason, classification scope,
predecessor classification UUID, exact owner and NULL contribution ID. Pure
negative controls change each identity component or omit the NULL field. Prepared
SQL runtime controls also test wrong owner and wrong predecessor against real facts.

`scripts/validation-b43-f4.py` prepares 19 cases under both RC and RR (**38**):

| Cases | Expected fresh outcome |
| --- | --- |
| Participant withdrawal/restoration | Restoration persists; withdrawal fact remains |
| Consent change | Restriction captured; any new promotion remains WITHHELD |
| Experiment pause/cancel | Pause permits qualification; cancellation defers |
| Session relevance/cancel | Fresh qualification defers; exact source restriction persists |
| Withdrawal→insertion, insertion→withdrawal | Both contributions receive permanent withdrawal facts |
| Promotion→AI successor | One historical ledger; exact predecessor restriction captured |
| AI successor→promotion | Fresh preparation defers, rather than repeatedly replaying stale classification |
| Human contradicting/mixed successor→promotion | New classification, polarity, group and fingerprint reconstructed |
| Canonical deactivation, alias addition/conflict | Exact production resolver decides current canonical eligibility |
| Duplicate promotion | Exactly one ledger/snapshot/WITHHELD fact; duplicate result true |
| Nested RPC expression, indirect FK child | Fence ownership retained through nesting/RI work |
| Stale outer-statement promotion arguments | Initial 40001, then genuinely fresh preparation defers |

Every concurrent case observes an actual waiter→holder blocking edge before
holder COMMIT. RR deliberately primes an old snapshot on the initial attempt and
requires entry-time 40001. A bounded, whole-transaction retry then begins anew,
enters the fence and reconstructs all inputs. RC positive factories read only
after entry; the separate stale-argument negative intentionally captures old
arguments for its first probe, never for retries. Command and COMMIT errors are
classified separately. No finite schedule result proves universal deadlock freedom.

Consent/canonical/alias/feedback writers have no application mutation RPC. Their
cases are explicitly `trusted_fenced_sql`, with entry as a prior command. Nested
SQL is a trusted mechanical probe, not certification of arbitrary application
composition. Ordinary `rpc` cases use existing allowed writer functions. These
scope labels are present in artifacts, not hidden in prose alone.

## Fresh attempt implementation and security controls

`validation-b43-f4-attempts.py` accepts immutable operation intents, not prepared
SQL. It requires an idle connection, begins a new transaction and physically
enters before source reads. Each attempt reloads owner-scoped source rows and the
global canonical registry, then invokes the **existing production TypeScript**
qualification, canonical resolution and representative-selection pipeline through
`validation-b43-f4-preparation.ts`. Current classification/polarity/fingerprint
are rebuilt; representative/authority snapshots are subsequently read in the same
fenced transaction. No second ranking algorithm is introduced in SQL or Python.
Deferred qualification is a distinct outcome, not a fabricated SQL success.

Only 40001/40P01 retry, at most three complete transactions. Entry failures cannot
read source or invoke the factory. Nonretryable and exhausted attempts fail.
Offline controls force command- and COMMIT-time failures and verify new BEGIN,
entry, source/factory invocation and changed parameters, with no savepoint replay.

Prepared database controls include:

- Direct DML/zero-row INSERT, all four locking SELECT forms, private/B3.1 helper
  calls, reader calls, DDL and TRUNCATE as service/anon/authenticated roles: 42501.
  Forged session markers are set first and must not confer authority.
- Effective relation/column privileges, explicit EXECUTE/PUBLIC denials, all 58
  function definitions, all 67 user triggers, expected SELECT grants, RLS flags,
  fence FORCE RLS, and explicit role-owner reachability audits. The existing full
  security preflight retains SET/USAGE/MEMBER/ADMIN and stand-in negative controls.
  Restoring session_user=postgres via SET ROLE is not an escalation-denial proof.
- Trusted TRUNCATE rejects with 55000. Private entry rejects unsupported isolation
  with 0A000. Built-in advisory locking remains callable by service_role and is
  recorded as an **unsupported capability**, not falsely claimed blocked.
- Savepoint rollback releases the rolled-back fence entry; another writer commits;
  renewed RR entry must conflict. A surviving forged marker cannot skip entry.
- Transaction-local authority-capture failure injection (ZX004) and an actual
  deferred-unique COMMIT failure (23505) must leave complete row/fence digests
  unchanged. Injected DDL must also disappear on rollback.
- Historical ledger, whole-row snapshot, authority and shared projection bytes
  remain unchanged after supersession/withdrawal. Trusted no-op UPDATE attempts
  on actual immutable rows must raise 55000. Changed finality intent raises P0001.
- `validation-b43-f4-rpc.ts` prepares actual SDK/PostgREST checks for all three
  typed RPCs, exact return decoding, duplicate/null behavior, wrong-owner P0002,
  composite-array insertion/duplicate/atomic batch failure, AI-authoritative
  rejection, browser execution denials, current-reader denials and owner/foreign
  RLS reads. Credentials are role/signature-verified for fixed IPv4 loopback.

RPC credentials and source rows pass only through captured stdin/stdout, never
command arguments or public artifacts. Only fixed labels, validated SQLSTATE/
PostgREST codes, numeric HTTP statuses, PIDs/counts and booleans reach artifacts.
No raw exception, SQL, evidence, token, response body or preparation snapshot is
published. The final artifact always says `deadlock_freedom_proven: false`.

## Static review of the entire migration

| Lines | Reviewed boundary and conclusion |
| --- | --- |
| 1–250 | Explicit transaction, complete baseline source/owner/attribute/ACL/trigger checks, incoming FK closure, SELECT/RLS snapshot; metadata only |
| 251–292 | Private schema/checked singleton, physical version UPDATE, owner/isolation/row-count rejection, invoker statement guard; no application entry grant |
| 294–1026 | All 22 early writer replacements; entry precedes source/parent locks and fast paths; individual domain bodies/signatures preserved by reverse-delta checks |
| 1027–1217 | Bootstrap entry precedes advisory lock; both handlers rethrow 40001/40P01; existing diagnostic mapping otherwise retained |
| 1218–1775 | Promotion entry, post-entry source/terminal/canonical checks, exact sorted-key fingerprint, atomic projection/ledger/v2 snapshot; no new authority state |
| 1776–1792 | Registry remains an invoker; entry before registry lock; no extra definer capability |
| 1793–1892 | Three typed RPCs/type; owner checks, fixed dependencies, explicit insert columns and narrow projections; no generic executor |
| 1893–1952 | All 27 statement guards, relation/column REVOKE RESTRICT, exact implementation hashes; existing 40 triggers retained |
| 1953–2052 | Effective role/owner/ACL/SELECT/RLS/order assertions and COMMIT; no historical DML, role provisioning, concurrent/nontransactional DDL or consumer activation |

No search-path widening, new role membership, historical backfill, AI qualification,
polarity rewrite or positive authority was found. Existing private capture and
reader definitions remain untouched. Runtime default/inherited ACLs, unmodelled
objects and exact PostgREST decoding still need execution evidence; assertions
must fail closed, not be weakened to match a fixture.

Bootstrap's existing broad error translation can turn non-concurrency helper
errors (including unsupported isolation) into P0001; only 40001/40P01 have explicit
passthrough. Do not infer privilege defects from that generic code or promise
uniform 0A000 across every RPC. The direct private-helper negative requires 0A000.

## Completed offline verification

- 67 Python tests: 66 passed, one skipped. The skip is the existing offline libpq
  option-parsing control because pinned psycopg/binary 3.2.10 is not installed.
  No diagnostic packages were installed in this phase.
- 115 focused TypeScript tests passed, with no failures or skips; these are pure
  preparation, source and mocked SDK checks, not PostgreSQL schedule results.
- `tsc -p tests/tsconfig-b43-f4.json` passed. The full project diagnostic comparison
  reconstructed the recorded 176 B2.2 diagnostics and found 176 current diagnostics,
  with no new diagnostics. Repository-wide tsc is still not clean. A comparison
  taken while the build regenerated .next was discarded and repeated against
  stable generated files; the stable comparison is the reported result.
- Lint passed with four existing page warnings. The webpack production build and
  its TypeScript checking passed. These completed results were retained across
  continuation; unchanged TypeScript/build work was not repeated unnecessarily.
- All 23 baseline SQL source hashes, the unchanged migration hash/line count,
  Python syntax and final whitespace checks passed.

The 38 live schedules, PostgreSQL SQLSTATE/COMMIT probes, migration compilation,
catalog assertions and real PostgREST decoding are **unexecuted**. They are not
counted as passed or as the one skipped offline test. Existing B3.1/B4.2/B4.3
integrity and WITHHELD-only authority contracts remain unchanged.

## Separately authorized disposable execution plan

1. Human reviews this complete diff and separately authorizes an executable
   revision. It must be committed/published through a separately authorized action
   and pinned by full SHA; `cdfa204` does not contain this harness. Working tree,
   staged changes and untracked files must all be clean. Live PR #235 must still
   be the exact authorized Draft/unmerged branch/SHA; failed API verification stops.
2. Review an execution binding for the new runner. **Do not dispatch the unchanged
   workflow's “Execute all 24” step for F4.** It invokes historical F3 and now fails
   closed on the fence. Existing full B3.1/B4.2/B4.3 SQL fixtures/concurrency paths
   have not all been adapted to new permissions. Preserve their baseline evidence;
   do not suppress failures or call the new runner a replacement for every suite.
3. In an ephemeral runner, use the existing generated `saasscout-b43-disposable-*`
   project/manifest/config/migration-hash checks. No linked project, ordinary local
   stack, credentials from production, remote Docker context or PG* overrides.
   Require the verified labelled bridge, IPv4-loopback bindings 55431/55432,
   matching container/host PostgreSQL cluster identity, trusted non-superuser
   postgres/BYPASSRLS principal and PostgreSQL 17. Install only the already pinned
   psycopg/binary 3.2.10 diagnostic packages in that separately authorized runner.
4. Only after explicit reset/migration authorization, create/reset that disposable
   project using the same verified network and apply the complete unmodified
   migration chain. Capture sanitized compilation/catalog outcomes before fixtures.
   Any 42501/55000 baseline/assertion failure, migration-ledger mismatch or partial
   DDL is a stop; verify complete rollback. No retries that remove security checks.
5. Supply the existing dispatch authorization context (including reviewed full
   F3_EXPECTED_SHA/GITHUB_SHA/GITHUB_WORKFLOW_SHA/F3_SOURCE_SHA), exact project/API/
   DB/network/cluster inputs, `F3_AUTHORIZED=true`, `F3_RESET_AUTHORIZED=true`,
   and the real dispatch event's authorize_f3/authorize_disposable_reset=true and
   expected_b43_sha fields. Also require `F4_AUTHORIZED=true`, `F4_EXPECTED_SHA` equal to that
   reviewed SHA, and `F4_ARTIFACT=$RUNNER_TEMP/b43-f4-diagnostic.json`. Omit
   F3_ARTIFACT; use no service keys in the environment. Run from repository root:
   `PYTHONDONTWRITEBYTECODE=1 python scripts/validation-b43-f4.py`.
   The runner verifies live authorization and full fresh security preflight before
   connecting; it never starts/resets a project or applies migrations itself.
6. Require all 38 deterministic cases and all supplemental controls. Expected RR
   40001 must be followed by fresh success/qualification deferral, never exhaustion
   accepted as success. Unexpected 40P01, lock/statement timeout (55P03/57014),
   unclassified driver/transport failure, unexpected success, PGRST schema/cache
   errors, proof mutation, owner/role escape or positive authority stops acceptance.
   Observe command and COMMIT separately. Successful finite schedules remain
   bounded evidence; provisional performance budgets are unmeasured release gates.
7. Always cancel/close actor connections. Use only existing manifest/project/label/
   network-verified `validation-b43-f3-cleanup.py`; no global prune or unscoped
   stop/reset. Identity failure means no guessed cleanup target: retain a fixed
   failure classification and destroy the ephemeral runner. Publish only sanitized
   diagnostic artifacts; discard private CLI logs/status/preparation buffers.

**NO-GO for disposable execution through the current workflow.** The harness is
prepared, but a reviewed F4 execution binding and exact executable SHA are still
required. No runtime safety, migration compilation, upgrade-path or full legacy
SQL-regression approval is claimed. After those prerequisites and separate human
authorization, the narrowly scoped F4 run above is the next validation step.
PR merge, production migration and positive authority remain NO-GO. Stop for review.

Subsequent C1 local preparation adds a dedicated F4 workflow and an adapted
trusted authority-negative preflight probe. See
`docs/V8_B43_F4_C1_EXECUTION_READINESS.md` for the current binding, historical-suite
compatibility disposition and execution gates. The B2.3 results above are retained.
