# F3 integration: Gates 5, 6 and 7 remediated

Repository: OsaRete/saasscout-landing; Draft PR #235.
Exact baseline: `08302eb99ed76b0682975b1442381885ba641314`.
Branch: `codex/b43-c1-source-transition-integrity`.
Main baseline: `d346eeb14e920b78556e8b884faaed23885bbc1c`.

Independent GitHub PR metadata access succeeded again during this remediation:
open, Draft, correct repository/branch and exact expected HEAD. All 619 retained
source blobs were reverified against the exact HEAD tree. The owner's independent
verification was not substituted for this check. Reverify live HEAD again at any
future publication; it is a point-in-time observation, not an enduring lease.

## Recommendation and scope

GO for owner review and separately authorized publication of this amended
test-only proposal once offline checks pass. Publication and execution are not
performed or authorized by this report. Runtime/merge/production remain NO-GO
until the relevant evidence and dispositions are reviewed.

The original seven-file proposal becomes eight files because the complete existing
security prefix must be exposed in the existing test harness rather than copied
or replaced with a weaker audit. Changes relative to the exact baseline:

- `.github/workflows/validation-b31-database.yml`
- `scripts/validation-b43-db.ts` (test harness only; new full-preflight exit mode)
- `scripts/validation-b43-f3-authorize.py`
- `scripts/validation-b43-f3.py`
- `scripts/validation-b43-f3-cleanup.py`
- `tests/test_validation_b43_f3.py`
- `tests/validation-b43-isolation.test.ts`
- `docs/V8_B43_F3_EXISTING_WORKFLOW_REVIEW.md`

No migration, production application, RLS/ACL, credentials, business behavior or
new workflow is introduced. Existing catalog and permission tests are reused,
including their rollback-only negative controls. No production grant changes.
Main and PR Draft state are untouched. The prior unrevised patch is retained
locally as f3-existing-workflow.before-gates.patch.

## Gate 5: all manual jobs verify their actual revision

Every job in this amended branch workflow (static, B3.1/B4.2 database, isolated
B4.3) checks out github.sha explicitly with credential persistence disabled.
Immediately after checkout, before setup/install/test/start/reset commands, each
manually dispatched job runs the same read-only authorization helper. It requires:

- Exact repository, workflow path, PR branch and workflow_dispatch event.
- Nonempty lowercase 40-hex expected_b43_sha matching github.sha,
  github.workflow_sha, actual git HEAD, and the live open/Draft PR #235 HEAD.
- A clean tracked working tree and the expected head/base repository identities.
- authorize_disposable_reset=true in both normalized context and event inputs.
- A valid explicit F3 boolean; F3 execution additionally requires authorize_f3=true.
- No inherited PG*, alternative database credentials, or remote Docker selectors.

Both authorization inputs still default false. Missing, malformed or mismatched
SHA fails every manual job before work, including non-F3 dispatches. This is an
intentional manual-operation restriction. PR-event jobs retain their existing
coverage and skip only the manual authorization step. No legacy job is skipped:
all original B3.1/B4.2 commands and the original B4.3 suite remain present.
The workflow token is read-only contents/pull-requests; no write/OIDC credential.
Guards apply to this amended branch version; no claim is made that the unchanged
older workflow on main has been retroactively modified.

A branch update between operator precheck and dispatch cannot silently select new
code: the selected workflow SHA and checkout SHA must both match the operator's
reviewed SHA. The GitHub ref remains the explicit PR branch, not a floating default
or an undocumented commit-SHA ref. Live PR state is checked again before F3 reset.

## Gate 6: documented CLI/API interface

Web UI input-schema behavior is no longer a prerequisite or fallback assumption.
The existing workflow is already registered on main and previously ran on the PR
branch (workflow ID 366258508, historical dispatch run 41719165554). No new
registration or main change is necessary. Official documentation specifies:

- [GitHub CLI workflow run](https://cli.github.com/manual/gh_workflow_run): --ref
  selects the branch/tag containing the workflow version; --json accepts inputs.
- [REST workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event):
  request body ref selects branch/tag and inputs supplies explicit workflow values.

The following is a future operator procedure, NOT executed here. It requires
separate execution authorization and an appropriately authorized operator login.
Use the *future reviewed published SHA containing this patch*, not this patch's
old parent SHA. Do not derive approval by automatically trusting whatever HEAD
happens to be current. The default placeholder deliberately fails validation.

```bash
set -euo pipefail
reviewed_sha='REPLACE_WITH_REVIEWED_PUBLISHED_40_HEX_SHA'
pr_branch='codex/b43-c1-source-transition-integrity'
[[ "$reviewed_sha" =~ ^[a-f0-9]{40}$ ]]
gh api repos/OsaRete/saasscout-landing/pulls/235 | \
  jq -e --arg sha "$reviewed_sha" --arg branch "$pr_branch" '
    .state == "open" and .draft == true and .merged_at == null and
    .head.sha == $sha and .head.ref == $branch and
    .head.repo.full_name == "OsaRete/saasscout-landing" and
    .base.ref == "main" and .base.repo.full_name == "OsaRete/saasscout-landing"
  ' >/dev/null
```

Choose the following CLI dispatch only after separate execution authorization:

```bash
jq -n --arg sha "$reviewed_sha" '{
  authorize_disposable_reset: true,
  authorize_f3: true,
  expected_b43_sha: $sha
}' | gh workflow run validation-b31-database.yml \
  --repo OsaRete/saasscout-landing --ref "$pr_branch" --json
```

Alternatively, after the same explicit approval and precheck, use the REST endpoint
through gh api instead of the final CLI pipeline above. Choose ONE method, never
both (which would create two runs):

```bash
jq -n --arg branch "$pr_branch" --arg sha "$reviewed_sha" '{
  ref: $branch,
  inputs: {
    authorize_disposable_reset: true,
    authorize_f3: true,
    expected_b43_sha: $sha
  }
}' | gh api --method POST \
  repos/OsaRete/saasscout-landing/actions/workflows/366258508/dispatches --input -
```

Neither method changes environment protection. Complete the existing
b43-disposable-database-validation environment approval; do not disable or bypass
it. Confirm the resulting run's head_sha equals the reviewed SHA before reviewing
its evidence. If the branch moves, inputs are rejected, authorization is missing
or metadata is unavailable, stop and re-review; do not fall back to main or remove
guards. The producer job's token does not gain dispatch/write authority.

## Gate 7: complete fresh security proof before F3

The original suite result remains independent and cannot be masked. F3 may still
collect diagnostics after a suite failure, but only following a new reset on the
same generated local project/network and a successful *fresh complete* audit.

The test-only --security-preflight-only mode executes the existing run() prefix:
identity/principal/network/isolation; full migration chain and empty application
state; complete catalog/RLS/ownership/ACL/function-security audit; effective-role
escalation denials and rollback-only negative controls; signed local role credential
checks; PostgREST EXECUTE denials; trusted missing-canonical reader control.
Only after every awaited check succeeds does it emit the exact full-security
success marker and return before fixtures. It does not relax, skip or duplicate
SQL audit logic. Conflicting lightweight/full flags fail before identity access.

After F3 reset, a separate bounded workflow step invokes full security preflight
and checks its exact success marker. F3 execution requires that step's outcome to
be success. Failure, skipped/cancelled step, missing marker or incomplete results
cannot qualify. The Python harness independently repeats full security preflight
and accepts only exit 0 plus the complete exact marker before opening its fixture
connection; identity-only output never qualifies. Its per-case lightweight checks
still bind ongoing container/network/principal identity after fixtures exist.

This reuses all relevant pre-fixture checks. Fixture-dependent immutability and
post-promotion controls remain in the original complete B4.3 suite and are not
claimed as part of an empty-database security preflight. An original suite failure
still fails the job even if fresh security audit and F3 diagnostics succeed.

## Preserved confinement, bounds and evidence limits

Random unique temporary project, path/manifest/config/migration hashes, exclusive
loopback network, local workdir and --local --no-seed resets remain. F3 connects
only to its literal 127.0.0.1:55432 DSN with explicit hostaddr, checks each backend's
postgres/postgres/database/port/cluster identity and PostgreSQL 17 before mutation,
and rejects libpq service/host redirects. Node 22/CLI 2.118.0 remain; the isolated
runner is ubuntu-24.04/Python 3.12, with pinned binary-only psycopg dependencies.

All 24 schedules retain observed blocking barriers, bounded statement/lock/idle
waits, SQLSTATE capture, full-row rollback comparisons and whole-transaction
retries. Full security steps/processes and the job have finite limits. Cleanup
remains always-run, identity-scoped and bounded, with ephemeral runner teardown as
containment if cancellation/host loss prevents cleanup. No global prune.
Diagnostics remain fixed labels, numeric PIDs/blockers, validated protocol codes
and allowlisted lock/wait metadata; no raw errors, SQL text, credentials, private
rows or manifest/digest values. No F3 outcome suppresses any prior failure. Expected
40P01 reproduction is evidence of a reachable cycle, not evidence of safety;
deadlock_freedom_proven remains false.

## Offline validation and remaining gates

Security regressions cover all-job manual SHA guards, explicit CLI/API booleans,
malformed/mismatched SHAs, missing authorizations, wrong branch/identity/destination,
actual run-prefix ordering, failure injection at each reused security gate,
identity-only/incomplete marker rejection, no fixture connection after audit
failure, sanitized diagnostics and foreign/malformed cleanup identity rejection.
The run-prefix tests execute actual checked-in orchestration with mocked database
and SDK dependencies; they do not claim real PostgreSQL/privilege execution.

Current offline results: 25 security regressions, 123 focused Node cases and
114 offline test files passed. Full lint passed with four existing page warnings;
targeted TypeScript no-emit and webpack build passed. Python compilation with
warnings treated as errors, YAML and all workflow/runbook shell syntax passed. Full source/patch
applicability, Node/TypeScript/lint/build, Python security tests and YAML/shell
validation are checked. Runtime installation, Docker/SQL isolation, full security
preflight, cleanup and all 24 F3 schedules remain unexecuted. Local Node is 24.19.0;
hosted workflow Node remains 22. Packages are version-pinned rather than fully
hash-locked; inherited action tags remain. actionlint/psycopg are unavailable locally.

Before merge: full B4.3 runtime/upgrade/negative-control evidence, all F3 artifacts,
and explicit remediation/disposition of reachable cycles or RR completeness
failures remain required. Broader multi-experiment/opposite multirow schedules and
production current-reader activation remain separate unresolved gates. These finite
tests cannot prove universal deadlock freedom. No push, merge, dispatch or production
access occurred while preparing this remediation.
