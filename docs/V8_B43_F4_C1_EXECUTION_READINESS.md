# B4.3-F4-C1 — disposable execution binding

Local preparation only. No database/HTTP validation, migration, reset, workflow
execution, commit, push, PR-state change, merge or production operation occurred.
HEAD remains `cdfa204ac1e911a5faf02ae0fc21025e149c0e45`; ancestry from that
baseline was verified locally. All B2.1/B2.2/B2.3 artifacts were present before
editing. Their source/manifest tests still pass. Human-supplied F4/F4-A findings
remain context, not independently retrieved runtime evidence.

## Exact execution path

New manual-only workflow: `.github/workflows/validation-b43-f4-disposable.yml`.
Job: `f4-disposable-database`, Ubuntu 24.04, environment
`b43-disposable-database-validation`, timeout 60 minutes. It has no PR, push,
schedule, reusable-workflow, deployment or production job. Both boolean dispatch
inputs must be true: `authorize_f4` and `authorize_disposable_reset`.
`expected_b43_sha` must be the full reviewed executable SHA.

Order:

1. Checkout exactly `github.sha`, without persisted credentials. Before installs,
   authorize exact repository/ref/workflow/SHA and live Draft/unmerged PR #235.
2. Install Node 22 and lockfile dependencies; run F3/F4 offline Python tests,
   typed preparation/adapter tests and strict targeted TypeScript checking.
   Install the pinned diagnostic venv outside the checkout (Python 3.12,
   psycopg and psycopg-binary 3.2.10, typing-extensions 4.15.0).
3. Install Supabase CLI 2.118.0. Reauthorize source/inventory/live PR after all
   offline work and tooling installs, before preparing or starting infrastructure.
4. Existing `prepare-validation-b43-disposable.ts` copies the complete chain to
   a uniquely generated directory outside the repository. Create the unique
   bridge with IPv4-loopback-only publication. Start only that project/network;
   **start may initialize/apply migrations**. Capture CLI output privately.
5. Verify generated manifest/config, complete migration hashes, Docker labels,
   ports and matching host/container PostgreSQL identity. Reauthorize live PR
   and source again, then reset only that project/network, without seed.
6. Invoke F4 on the fresh full schema, without first running a legacy fixture
   suite. Its own security prefix checks fresh tables, migration ledger,
   ACL/RLS, role inheritance/escalation and real browser/service RPC denials.
   Then run catalog assertions, 38 schedules and supplemental negative controls.
7. Always run existing identity-scoped cleanup. Cleanup failure fails the job;
   it never authorizes global prune, guessed targets or unrelated resets.
8. Always attempt upload of only the sanitized F4 JSON, with three-day retention.
   Missing output before runner startup is not fabricated into a successful run.

Exact runner command, after the workflow binds all required environment inputs:

```sh
PYTHONDONTWRITEBYTECODE=1 timeout --signal=TERM --kill-after=10s 1380s \
  "$RUNNER_TEMP/b43-f4-python/bin/python" scripts/validation-b43-f4.py
```

The workflow obtains `F3_CLUSTER_ID` from the verified generated DB container;
`F3_SOURCE_SHA=github.sha`; F3_EXPECTED_SHA and F4_EXPECTED_SHA both equal the
reviewed input SHA. F3_AUTHORIZED is an internal compatibility alias of the
F4 boolean, not permission to run historical F3. F3_RESET_AUTHORIZED carries the
reset authorization. The F4 dispatch event must authorize F4 and must not carry
an `authorize_f3` input. F4 rejects the historical workflow, and historical F3
rejects F4 authorization before any connection.

## SHA, executable inventory and credentials

The common read-only authorizer accepts exactly two separately bound contexts:
old F3 workflow with its old event inputs; new F4 workflow with its F4 inputs.
It accepts no caller-selected workflow path. Repository must be
`OsaRete/saasscout-landing`; branch must be
`codex/b43-c1-source-transition-integrity`; expected SHA must equal GITHUB_SHA,
GITHUB_WORKFLOW_SHA, local HEAD and live PR #235 HEAD. PR must remain open,
Draft, unmerged, same repository and base `main`. Every reauthorization rechecks
tracked/staged/untracked cleanliness. Source SHA cannot be supplied merely as an
artifact label.

`docs/V8_B43_F4_C1_EXECUTION_INVENTORY.json` enumerates 60 required workflow,
Python, TypeScript, fixture, config, manifest, lockfile and test inputs, plus all
39 migrations in sorted filename order. F4 admission requires each to be a
tracked regular file at stage zero with the exact Git blob bytes. Symlinks,
missing files, ignored executable files under governed source roots, and a
changed migration inventory fail closed. Offline checks cover the static local
TS import closure. This is a repository-input inventory, not a claim that npm,
actions, CLIs or the operating system are hermetic. npm uses the existing lockfile;
no dependency version or production package change is introduced. Setup actions
retain the existing major-version tags; artifact upload retains its pinned SHA.
Action/tool supply-chain review remains distinct from repository SHA validation.

No configured secret is required. Only the ephemeral `github.token` is exposed
as GH_TOKEN to authorization steps and the runner's live reauthorization/typed
probe child, with `contents: read` and `pull-requests: read`. No secret expression,
OIDC/write permission, linked Supabase project, deployment token, production DB
URL or inherited secrets are configured. Existing libpq, Supabase credential
and remote Docker override denials remain enforced. Disposable service/anon
credentials and JWT secret are read from verified local CLI status into captured
memory; never command arguments, uploaded files or explicit environment keys.

Expected artifact: `$RUNNER_TEMP/b43-f4-diagnostic.json`, uploaded as
`b43-f4-${github.run_id}-${github.run_attempt}`. It contains source SHA, success,
fixed case/stage/failure labels, sanitized SQLSTATE/COMMIT outcomes and bounded
blocking/count diagnostics. It always says `deadlock_freedom_proven: false`.
Private CLI logs, captured status/credentials, preparation payloads and raw
exceptions are never uploaded. Runner failure, timeout, authorization/preflight
failure and cleanup failure propagate; there is no continue-on-error path.

## Legacy compatibility disposition

The historical workflow remains `.github/workflows/validation-b31-database.yml`.
Its `b43-disposable-database` job installs the pinned F3 client only after the
independent B4.3 suite, reauthorizes, resets the same verified project, requires
the complete fresh security prefix, obtains cluster identity, and executes
`timeout ... scripts/validation-b43-f3.py` in “Execute all 24 isolated F3
schedules”. Its F3 diagnostic path/upload and all original schedules remain
separate. Historical F3 cannot certify the fenced contract.

The two historical database jobs now explicitly refuse a checkout containing
the F4 migration **before infrastructure setup**. This prevents the ordinary
PR database job from incidentally applying F4 through its old unisolated entry.
Their original suite commands are unchanged. Historical offline regressions
still run. Historical DB execution requires an unfenced, independently reviewed
source/workflow revision and matching authorization; there is no new bypass of
live-PR/SHA checks or schema projection that pretends the current chain is old.
These guards intentionally leave those legacy database checks failing at an F4
revision. They are not skipped/passed or grounds for merge approval.

| Source/path | Classification | F4 disposition |
| --- | --- | --- |
| B3.1 promotion, source status/relevance/lifecycle and classification RPCs; B2.2 three typed adapters | Supported production operations | Actual RPCs retained in F4 factories/probes, with original authorization, qualification, polarity, selection, idempotency and finality contracts |
| `tests/sql/validation-b31.sql`, prefix before `b31_test_promote` | Trusted disposable fixture setup | F4 extracts only the exact counted prefix, begins a fresh transaction, enters the private fence, inserts synthetic rows, commits; no PUBLIC helper created |
| `scripts/validation-b31-db.ts` session/participant/experiment lower-lock-first competitors and independent peer inserts | Unsupported legacy composition/fixture assumptions | Not invoked by F4. Production mutations use RPC entry; trusted fixture writers must enter first in each transaction. Original schedules remain historical, not relabelled successes |
| `scripts/validation-b42-db.ts` `historicalPromotion`, `oldRpc`/`newRpc` replacement | Trusted historical upgrade fault injection, incompatible with effective F4 definitions | Never invoked on F4: restoring older invoker/unfenced function bodies would invalidate the catalog and contract. A separate upgrade regression needs explicit design/review |
| B4.2 trigger disabling, row corruption/deletion and raw insertion probes | Trusted disposable fault injection, not production support | Historical suite retained unchanged; not granted runtime DML or silently executed on F4. F4 has its own fenced atomic rollback and immutable-proof probes; these do not replace every corruption/upgrade test |
| B4.2 service-role `TRUNCATE problem_observations` expects `0A000` | Intentional negative with obsolete SQLSTATE expectation | F4 independently requires permission denial `42501` for application TRUNCATE and `55000` for trusted guarded TRUNCATE. Historical expectation is not edited to manufacture a pass |
| `validation-b43-db.ts --preflight-only/--security-preflight-only` | Identity/security checks | Reused fully; no legacy fixture/concurrency body runs. Trusted positive-authority forgery probe now enters the fence in its own transaction when present and still requires `23514` |
| `tests/sql/validation-b43-source-transitions.sql` and full B4.3 runner | Mixed supported RPCs, trusted direct fixtures and pre-entry advisory-lock competitor | Excluded as a whole on F4. Exact authority/restriction/rollback semantics are exercised by F4; a full port must separate trusted fenced setup from production RPCs, not prepend a fence to every old statement |
| F4 service/anon/authenticated helper, direct DML, row-lock SELECT, marker, TRUNCATE and role-escape probes | Intentional privilege negatives | Execute under explicit effective roles; require specific denial and unchanged data. Never widen grants to satisfy fixture code |
| Canonical/alias/consent/indirect-FK schedules without production RPCs | Trusted fenced SQL diagnostic scope | Labelled explicitly; no general service-role SQL permission or application mutation path inferred |

The preflight authority-probe correction is a harness integration issue, not a
migration defect. Without it the new statement guard would reject before the
intended authority constraint. The correction preserves the invalid-row oracle,
uses no trigger disabling, and changes no production SQL object or permission.
No B2.2 migration change was required or made. Whole-transaction retries still
prepare anew; RC freshness/RR conflicts and unsupported composition remain the
B2.2/B2.3 contract. No positive authority or reader activation is introduced.

## Verification and execution gates

Completed offline checks:

- Python F3/F4 suites: **76 tests, 75 passed, one skipped** (existing pinned
  psycopg option-parser test; driver unavailable in this offline environment).
  Includes nine new C1 binding, inventory, authority-probe and negative tests.
- Focused TypeScript SDK/preparation/adapter/isolation/harness tests: **60 passed**,
  no skips. All SDK transport probes use mocked fetch; no live HTTP occurred.
- Strict F4 TypeScript configuration and separate DB/isolation/preparer targeted
  typecheck passed. Lint passed with four existing page warnings and no errors.
- `NEXT_TELEMETRY_DISABLED=1 npm run build -- --webpack` passed.
- Both workflow YAML documents parsed locally; their run blocks passed offline
  `bash -n`. No parser/tool dependency was added. Manifest/source hash, complete
  effective writer/trigger/ACL source checks and final whitespace checks passed.

The 2,052-line migration still has SHA-256
`81b46d1c1e0d0f898f0f716faf17bb0c2a2f3f633f89cbd191315cd35735e279`.
No PostgreSQL compilation, SQLSTATE, concurrency, live authorization or PostgREST
result is claimed from these checks.

C1 changed files only (earlier B2 changes are retained, not attributed to C1):

- `.github/workflows/validation-b43-f4-disposable.yml` — new isolated binding.
- `.github/workflows/validation-b31-database.yml` — two historical-schema guards.
- `scripts/validation-b43-f3-authorize.py` — separately bound F4 admission/inventory.
- `scripts/validation-b43-f3.py` — refuse borrowing F4 authorization.
- `scripts/validation-b43-f4.py` — require the dedicated F4 workflow identity.
- `scripts/validation-b43-db.ts` — trusted fenced authority-negative fixture.
- `tests/test_validation_b43_f4_c1.py` — focused offline integration controls.
- `docs/V8_B43_F4_C1_EXECUTION_INVENTORY.json` — exact repository-input inventory.
- `docs/V8_B43_F4_C1_EXECUTION_READINESS.md` — this report.
- `docs/V8_B43_F4_B23_DISPOSABLE_VALIDATION_PLAN.md` — appended C1 cross-reference.

Before a separate run:

- Review this complete cumulative diff; separately authorize publication of an
  executable revision. This local dirty checkout and baseline cdfa204 are not
  runnable F4 source. Publish/verify the exact full SHA without rewriting the
  migration or inventory; both dispatch and workflow source must use that SHA.
- Confirm GitHub has registered the new manual workflow. GitHub requires the
  workflow_dispatch workflow to exist on the default branch; availability was
  not queried or changed here. A separately approved workflow-only registration
  may be needed. Do not merge the migration or bypass SHA/ref checks to obtain it.
- Confirm the named disposable environment allows this reviewed branch/run and
  carries no production dependencies; provide both explicit boolean approvals.
- Use only the fixed generated-project manifest/ports/network/cluster checks.
  No ordinary stack, remote Docker selector, PG* override, linked project or
  production credential is allowed. Failure means stop, not fall back.
- Treat compilation/catalog/ACL/owner/RLS mismatch, positive authority, proof
  mutation, unexpected RPC decode/HTTP error, unexpected SQLSTATE, 40P01,
  timeout, retry exhaustion or COMMIT error as failed acceptance. Expected RR
  40001 must lead to a new transaction and fresh success/qualification deferral.
- Always use identity-scoped cleanup. If identity cannot be proved, do not guess
  a target: fail and destroy the ephemeral runner. Upload only sanitized JSON.

**Current execution NO-GO:** the changes are uncommitted and no exact executable
SHA or registered F4 dispatch capability is verified. The code binding is ready
for human review; after those publication/registration gates and separate human
run authorization, a first narrowly scoped F4 disposable diagnostic run is the
recommended next step. Full legacy/upgrade acceptance, merge, production
migration, positive authority and reader activation remain NO-GO. Static tests
and 38 finite schedules cannot establish universal deadlock freedom. Provisional
performance budgets remain unmeasured and require owner approval before release.
