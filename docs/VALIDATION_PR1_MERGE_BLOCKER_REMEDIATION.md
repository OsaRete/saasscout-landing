# PR 1 merge-blocker remediation

Latest stage: see **Final database harness corrections** below for the corrected
SQLSTATE/effective-identity/CLI contracts and the PR 1 versus PR 2 acceptance matrix.

The final acceptance-readiness correction below supersedes the earlier preflight
limitation and verification counts. Earlier stage artifacts remain preserved.

## Baseline and recovery

Repository OsaRete/saasscout-landing, branch `work`, HEAD and read-only remote main
`f5fefab6da62137472c4a465346c8afc52aea228`. Before edits, all 55 files matched the
saved 224,854-byte patch exactly, SHA-256
`79d0b2af2a90ac625047960a377747dabccbae3bd9bd429cf363ee99cd2c5689`.
There were 46 modified tracked files, nine untracked files and no staged changes.

Recovery copies of all 55 file contents, the exact patch/checksum, reports and
verification records are under
`/workspace/work/saasscout-validation/before-merge-blocker-remediation/`.
The latest adversarial review remains in this original task conversation; its
findings and verdicts were also preserved in a clearly labelled summary there.
Original artifacts were not overwritten. New verification records use
`/workspace/work/saasscout-validation/merge-blocker-remediation/`.

## Documentation and inspected contracts

Reviewed repository AGENTS.md; PRODUCT_VISION, DATA_MOAT, SYSTEM_ARCHITECTURE,
AI_PRINCIPLES, ENGINE_GUIDELINES, CODING_STANDARDS; Validation domain/schema/API,
workspace, interviews, surveys, intelligence and design-assistant documentation;
Data Moat architecture and aggregation; B3.0.1/B3.1, B4.1, B4.2 and B4.3 authority,
security and disposable-validation documentation; the release-boundary report,
saved implementation/review artifacts and latest adversarial review. Inspected
the actual runners, workflow triggers, production guards, request parser and
effective migration source, plus installed Next.js route-handler guidance.

Documentation is context, not deployed-state evidence. B4.3's RETURN OLD defect
contradicts documented source-transition persistence. The original conditional
merge recommendation omitted automatic-deployment verification and is superseded
by NO-GO pending the gates below. No migration bytes were changed.

## Acceptance separation

The new unconditional application guards correctly deny promotion/preparation and
qualified consumption. Older B4.2/B4.3 acceptance scripts imported those same
entry points for genuine positive integrity fixtures, so they could no longer
reach the underlying database acceptance assertions. Browser-reader negatives
could also fail at policy admission rather than prove actual database denial.

`tests/support/validation-database-fixtures.ts` now creates private, in-memory
instances of the retained promotion/preparation and historical-reader algorithms
using the existing test module loader. Its local admission replacement is limited
to three explicit module paths and the exact shared operation/method pairs.
It does not replace a production module, its cache, or the production policy.
It offers no environment switch and does not generate new SQL or alter ACLs.

Clients must be explicitly registered and retain the fixed B4.2 or B4.3 loopback
endpoint on every call. Missing, unregistered, remote and wrong-profile clients
are rejected. Ambient admin-client creation is prohibited. The runners construct
fixtures only after their existing identity/freshness prerequisites. These checks
do not independently prove a database is disposable: the runner's verified
infrastructure remains a mandatory prerequisite, not something an endpoint or
environment string can replace. No application module imports the fixture loader.

B3.1's SQL runner remains unchanged. B4.2/B4.3 positive promotion, proof,
historical-read and permission assertions remain. B4.3 positive current-authority
checks now use its existing trusted SQL reader, because application roles must
continue to lack EXECUTE. Its role-denial checks still use unchanged real clients.
The canonical fixture is created before the positive empty current read.
The production current-wrapper algorithm remains separately covered offline;
its actual application entry continues to deny before SQL.

The existing workflow retains all database jobs, reset rules and authorization
gates. Trigger coverage includes fixture/policy changes; static checks now include
the real application-denial tests and body/fixture regressions. No workflow ran.

## Body byte limit

Only the Validation HTTP body helper changes production parsing. It is reused by
private Validation commands and public survey submission. It retains at most
64,000 stream bytes, rejects overflow before JSON parsing, cancels the reader and
releases its lock. Declared Content-Length is only an early rejection; missing,
false or malformed headers cannot disable actual byte counting. Safe fixed 413
and 400 errors, valid JSON values and UTF-8 decoding are preserved. AI's separate
route parser remains unreachable because AI admission is permanently denied.

Regressions cover below/exact/above-limit bodies with absent, understated and
correct headers; split multibyte UTF-8; cancellation/read bounds; declared
oversize; invalid JSON; stream failures; malformed lengths and valid JSON scalars.
Fixture regressions exercise the actual retained promotion preparation/RPC path
with mocks, reader success and permission failure, rejected clients and unchanged
production denial before/after fixture construction. No offline mock is described
as a PostgreSQL/PostgREST result.

## Deployment facts and remaining gates

Repository `vercel.json` only declares the existing weekly cron. No linked Vercel
project metadata or authoritative account/environment evidence is available here.
See [the precise owner checklist](./VALIDATION_VERCEL_DEFAULT_OFF_CHECKLIST.md).
Every enabling value and scope is listed there, including older deployments and
the danger of rolling back to a build without the release boundary.

Remaining code-only merge gates:

- Independent review of this revised diff and actual required database acceptance
  results for the exact revision; source compatibility is not database proof.
- Authoritative Vercel project/branch/environment/older-deployment and safe rollback
  verification. Require explicit DISABLED in both capability variables.
- Explicit disposition of the unchanged repository-wide TypeScript baseline.

The earlier stage identified a B4.3 preflight serialization defect. It is now
corrected by the final acceptance-readiness change below, without modifying the
SQL query or privileges. Source-transition/concurrency assertions must still fail
rather than pretend acceptance of the known buggy migration chain.

Private/public activation additionally requires the source-transition forward fix,
effective database-level shared-track denial, fresh/upgrade and role/RLS/ACL tests,
source freshness and locking acceptance, survey publication/revocation/submission
races, retry recovery, bounded public abuse protection and completeness decisions.
Direct owner RLS reads and privileged SQL remain outside application flags.
No historical evidence/authority backfill or proof weakening is authorized.

No new critical/high source finding was identified in this remediation review;
the inherited high activation risks and unresolved operational facts remain.
This is not a production or database security certification.

## Verification and decision

Earlier 63-file stage verification completed:

| Check | Result |
| --- | --- |
| Focused offline tests, 25 files | 1,626 passed; zero failures/skips |
| New body/fixture regressions | 24 passed, included above |
| Strict focused ES2022 TypeScript | Exit 0 |
| Harness targeted TypeScript | Exit 0 |
| Full repository TypeScript | Exit 2; baseline 175, current 175; zero added/removed |
| Full lint | Exit 0; zero errors, four existing warnings |
| Production build | Exit 0 |
| Built local HTTP checks | 308 passed |
| Chromium deep-link/direct-entry checks | Six passed |
| Whitespace/scope checks | Passed; no migration, F4, unrelated product or Vercel changes |
| Production policy/shared-entry guards | Byte-identical to reviewed 55-file patch |
| Fixture loader in built server bundle | Absent |

Full diagnostics were compared with both verified main's saved baseline and the
reviewed 55-file patch, by file/code/complete message (positions excluded). All
175 remain test-file diagnostics; no exclusions, suppressions or project compiler
changes were introduced. Build success is not a passing full tsc result.

The HTTP checks used loopback-only built servers. Admitted private requests had
no bearer and stopped at 401; disabled requests stopped at the policy. Browser
checks prohibited external/data requests and performed no persistence. These are
application-boundary checks, not authenticated database workflow acceptance.

Final commands, exact results, diagnostic comparison, complete changed-file
manifest and proposed patch/checksum are recorded in the new artifact folder.
The original 55-file verification remains preserved separately. Repository-wide
TypeScript failures must be reported independently of build/focused checks.

- GO for independent review of the revised local diff.
- NO-GO for merge with automatic Vercel deployment until the gates above have evidence.
- NO-GO for private or public Validation activation; shared promotion/readers remain denied.

No commit, push, PR modification, workflow dispatch, database operation, migration,
Vercel settings change, deployment or activation is part of this work. PR #235 and
F4 were not modified or incorporated. No new Validation methods were implemented.

## Final acceptance-readiness correction

Verified starting state: branch `work`, baseline
`f5fefab6da62137472c4a465346c8afc52aea228`; the complete 63-file patch matched
SHA-256 `da190c5f63e3ca086d7b42f30c8afadfe5c5f3a2e5b85e0e7a5127f56dc158cd`.
All 63 file contents and current artifacts were copied before edits to
`/workspace/work/saasscout-validation/before-final-acceptance-correction/`.
New logs, complete patch, checksum and manifests use
`/workspace/work/saasscout-validation/final-acceptance-correction/`.
Relevant architecture/security/Validation/B4.2/B4.3 and release documentation,
this report, the source algorithms, loader and actual psql client contract were
reviewed. No missing work was reconstructed or previous artifact overwritten.

### Exact preflight correction

The query explicitly casts both boolean expressions to text and concatenates
four fields. PostgreSQL boolean::text is `true`/`false`, although native psql
boolean columns may display `t`/`f`. The old comparison to `f` therefore rejected
the valid `postgres|postgres|true|false` result. The SQL query is unchanged.

The pure `assertMigrationPrincipal` helper in the existing isolation module now
accepts exactly four fields with postgres login/effective principal, BYPASSRLS
`true` and application-role reachability `false`. No trimming, truthiness or
alternate spellings grant acceptance. Missing/extra fields, extra rows, unsafe
roles/privileges and malformed values throw a fixed error without raw contents.
The runner invokes it before returning successful identity preflight. Regression
cases prove that failed assertions cannot advance execution. These are offline
contract tests, not a newly observed database result.

### Fixture fidelity and residual risks

The adapter compiles the checked-out production algorithms themselves; it does
not maintain algorithm copies. It replaces only local admission at the three
explicit module paths, now restricted to each module's exact expected operation
and method. Real application modules and their cache are not changed.

A checked-in SHA-256 manifest pins all ten currently loaded production source
files plus the adapter and generic loader. The loader verifies the exact source
text it will compile before transpilation. Missing, changed or newly introduced
source dependencies fail closed, and both loader files are checked before fixture
construction. No test or CI step automatically refreshes these hashes: future
source/loader changes require explicit review and a deliberate manifest update.
CI path triggers cover every pinned dependency, including the existing Knowledge
deduplication helper reused by canonical resolution. That helper's implementation
and all Knowledge Evolution behavior remain unchanged.

Regression checks exercise real promotion preparation/RPC arguments with mocks;
compare nonempty historical-reader outputs for both profiles and every polarity;
reject corrupted attestation; reject simulated source drift/unlisted dependencies;
and retain permission/error/completeness checks and actual production denial.
Production source-import checks remain enforced, and the build is inspected for
fixture-adapter inclusion. There is no production environment switch or fallback.

The intentional isolated admission exception is test-only. The adapter is not a
sandbox for untrusted operator code, and endpoint checks cannot establish real
infrastructure identity. Existing disposable identity/freshness checks, real role
permissions and database acceptance are still required. Hash agreement proves
source identity, not PostgreSQL integrity or equivalence of mocked execution to
live SQL. Node/TypeScript dependency versions remain governed by package-lock and
npm ci. Current-authority positives still use the separately guarded trusted SQL
path; application reader EXECUTE is not restored.

### Current decision

GO for independent review and conditional merge consideration of the corrected
local diff. Actual merge with automatic Vercel deployment remains NO-GO without
required real acceptance evidence, Vercel project/scoped disabled configuration,
older-deployment/rollback verification and disposition of the TypeScript baseline.
Validation activation remains NO-GO pending source-transition correction,
database-level shared-track denial, source/role/locking acceptance and research
workflow recovery/abuse/completeness gates described above.

No database operation, migration, privilege change, workflow dispatch, Vercel
configuration change, deployment or activation was performed. No PR #235/F4 code
was fetched, incorporated or changed. Production policy/algorithms remain unchanged.

### Final correction verification results

| Check | Result |
| --- | --- |
| Focused offline tests, 25 files | 1,656 passed; zero failures/skips |
| Strict focused TypeScript | Exit 0 |
| Existing workflow TypeScript command | Exit 0 |
| Full repository TypeScript | Exit 2; 175 baseline, 175 reviewed patch, 175 current |
| Diagnostic delta | Zero added/removed by file, code and complete message |
| Full lint | Exit 0; zero errors, four existing warnings |
| Production build | Exit 0 |
| Production app/lib/component source comparison | Byte-identical to 63-file starting patch |
| Preflight SQL query | Byte-identical; only returned-text validation changes |
| Application-denial regression file | Byte-identical; passes in the focused suite |
| Fixture adapter in built server bundle | Absent |
| Migrations, privileges, Vercel, F4 and Knowledge implementations | Unchanged |

No project TypeScript options, exclusions or suppressions changed. The unchanged
175 diagnostics remain test-file debt and must not be represented as a clean full
compilation. The earlier HTTP/browser results above belong to the preserved
63-file stage; no new HTTP/browser acceptance is claimed in this correction.
No real database suite was executed. Offline tests do not establish deployed
role/ACL state, PostgreSQL locking or persistence behavior.

### Final changed-file inventory

66 files relative to baseline: 51 modified tracked files and 15 untracked files.
The complete saved diff includes every untracked file. This correction touches
the following ten paths relative to the verified 63-file starting patch:

- `.github/workflows/validation-b31-database.yml`
- `docs/VALIDATION_PR1_MERGE_BLOCKER_REMEDIATION.md`
- `scripts/validation-b43-db.ts`
- `scripts/validation-b43-isolation.ts`
- `tests/support/validation-database-fixtures.manifest.json`
- `tests/support/validation-database-fixtures.ts`
- `tests/support/validation-module.ts`
- `tests/trusted-qualified-evidence-reader.test.ts`
- `tests/validation-b43-isolation.test.ts`
- `tests/validation-database-fixtures.test.ts`

Complete baseline-relative inventory:

```text
.github/workflows/validation-b31-database.yml
app/api/public/surveys/[token]/responses/route.ts
app/api/public/surveys/[token]/route.ts
app/api/validation/classifications/route.ts
app/api/validation/design-assistant/route.ts
app/api/validation/experiment-versions/[id]/transition/route.ts
app/api/validation/experiments/[id]/versions/route.ts
app/api/validation/hypotheses/[id]/versions/route.ts
app/api/validation/interview-observations/route.ts
app/api/validation/interview-plans/route.ts
app/api/validation/interviews/[id]/route.ts
app/api/validation/interviews/route.ts
app/api/validation/observations/route.ts
app/api/validation/participants/route.ts
app/api/validation/promotions/route.ts
app/api/validation/subjects/[id]/experiments/route.ts
app/api/validation/subjects/[id]/hypotheses/route.ts
app/api/validation/subjects/[id]/intelligence/route.ts
app/api/validation/subjects/[id]/route.ts
app/api/validation/subjects/route.ts
app/api/validation/survey-plans/route.ts
app/api/validation/survey-publications/[id]/revoke/route.ts
app/api/validation/survey-publications/route.ts
app/validation/[id]/page.tsx
app/validation/layout.tsx
app/validation/survey/[token]/page.tsx
components/validation/experiment-form.tsx
components/validation/hypothesis-form.tsx
components/validation/interview-observation-form.tsx
components/validation/release-capabilities.tsx
components/validation/survey-workspace.tsx
components/validation/unavailable.tsx
docs/VALIDATION_DISABLED_RELEASE_BOUNDARY.md
docs/VALIDATION_PR1_MERGE_BLOCKER_REMEDIATION.md
docs/VALIDATION_VERCEL_DEFAULT_OFF_CHECKLIST.md
lib/validation/design-assistant/service.ts
lib/validation/intelligence/service.ts
lib/validation/promotion/current-qualified-evidence-reader.ts
lib/validation/promotion/promotion-service.ts
lib/validation/promotion/read-repository.ts
lib/validation/promotion/trusted-qualified-evidence-reader.ts
lib/validation/server/http.ts
lib/validation/server/public-survey-http.ts
lib/validation/server/release-policy.ts
lib/validation/server/repository.ts
lib/validation/server/resource-policy.ts
lib/validation/server/service.ts
lib/validation/server/surveys.ts
scripts/validation-b42-db.ts
scripts/validation-b43-db.ts
scripts/validation-b43-isolation.ts
scripts/validation-promotion-dry-run.ts
tests/current-qualified-evidence-reader.test.ts
tests/support/validation-database-fixtures.manifest.json
tests/support/validation-database-fixtures.ts
tests/support/validation-module.ts
tests/trusted-qualified-evidence-reader.test.ts
tests/validation-b43-isolation.test.ts
tests/validation-body-limit.test.ts
tests/validation-capability-resources.test.ts
tests/validation-customer-interview-shareable-evidence.test.ts
tests/validation-database-fixtures.test.ts
tests/validation-design-assistant.test.ts
tests/validation-intelligence.test.ts
tests/validation-release-boundary.test.ts
tests/validation-workspace-ui.test.ts
```

## Final database harness corrections

### Verified input, documentation and preservation

This stage started from the exact 66-file patch, SHA-256
`c071d68a7e4b8ce4d4419ebde40f2c40f119cc4f914b2a2519dbb9c692f9d661`,
on branch `work`, baseline `f5fefab6da62137472c4a465346c8afc52aea228`.
All 66 source contents, patch and verification records plus the latest acceptance
runbook were preserved in
`/workspace/work/saasscout-validation/before-final-database-harness/` before edits.
New results, complete patch/checksum and revised runbook use
`/workspace/work/saasscout-validation/final-database-harness/`.

Reviewed AGENTS.md, the six foundational product/Data Moat/architecture/AI/engine/
coding documents, Validation API/schema/security documentation, B4.2 integrity,
B4.3 authority/safety/disposable-validation contracts, existing release and final
correction reports, the latest acceptance runbook, actual runner/workflow/config
and effective migration source. Documentation is not proof of deployed behavior.

### Three narrow harness corrections

1. **SQL error contract.** The shared offline-testable helper requires a failed,
   unsignaled process, exactly one SQLSTATE-only ERROR line with the expected code,
   and exactly the expected stdout. Correct P0001 no longer requires suppressed
   message prose. Unexpected success/state, missing/malformed/extra output,
   connection/FATAL errors and process failures reject with a fixed safe error.
   PostgreSQL functions, query semantics and grants were not changed.
2. **Effective identity and privilege evidence.** The trusted SQL connection now
   begins a transaction, selects a whitelisted effective role with SET LOCAL ROLE,
   emits exact session_user/current_user and SET-postgres/table-privilege/reader-
   EXECUTE evidence, then attempts denied DDL. A denial before the identity SELECT
   cannot pass; unexpected privileges, missing evidence and successful DDL fail.
   Unexpected success still rolls back. No SET ROLE postgres escalation attempt
   is used: the role graph is checked directly. This is explicitly an effective-
   privilege probe with session_user=postgres, NOT an application login. Actual
   PostgREST application-role denials remain separate and require null data,
   structured 42501 and HTTP 401/403. Valid UUID filters and nonempty updates avoid
   confusing request parse errors with privilege denial. Owner RLS/login workflow
   acceptance is still a separate real-database requirement.
3. **Explicit CLI selection.** B4.2/B4.3 require VALIDATION_SUPABASE_CLI to identify
   an absolute, real, executable file returning exactly version 2.118.0. No PATH or
   npm-binary fallback exists. CI captures/verifies the selected executable after
   setup-cli and persists its resolved path; startup, reset, tooling and runner
   status calls use it explicitly. npm's existing 2.109.1 dependency/lock remain
   unchanged and cannot shadow that selected path. Tests inject only offline
   inspection mocks; actual runners use filesystem/version checks. No CLI binary
   was installed or executed during this task. Version checking is not binary
   provenance or target-disposability proof; verify the approved release and host.

Production app/lib/component code, release policy, fixture algorithms and their
12 pinned source hashes, historical migrations/privileges, dependencies, Vercel,
Knowledge Evolution and F4 remain unchanged. The new helper is acceptance-script
code, not an application policy bypass. No production credentials, new role,
identity RPC, grant or elevated login shortcut is introduced.

### Lowest-cost safe execution option

| Candidate | Incremental cost | Isolation / complexity | Recommendation |
| --- | --- | --- | --- |
| Existing owner-controlled isolated local Linux VM with a running Docker engine | No new hosting charge; existing resource/electricity use | Moderate: verify daemon identity, no production secrets/network/mounts, fresh project/volumes, free ports, exact images/roles and owned cleanup | Preferred when independently verified |
| Shared developer Docker/Desktop engine | Low monetary cost | Higher data and binding ambiguity; legacy B42 checks alone are insufficient | Not the default; reject if ownership/loopback/ports cannot be proved |
| Existing GitHub-hosted runner quota | Included or billable minutes, account-dependent | Fresh host helps; exact source revision, reviewer settings and secret-safe logs still required | Fallback; this uncommitted patch is not remotely selectable |
| Newly provisioned cloud VM | Additional compute/storage and teardown cost | Strong dedicated boundary but extra provisioning/credential/cleanup work | Only if existing safe capacity is unavailable |

A newly purchased VM is not inherently required. An existing isolated local VM
can run fresh disposable Supabase projects without restarting its Docker engine.
Do not reuse an existing database or volume. Preserve PostgreSQL 17, Auth schema,
PostgREST/Kong, all 37 migrations and exact role/RLS/RPC/grant fidelity. Run the
B31/B42 default-port and B43 55431/55432 profiles sequentially; do not remap a
hardcoded profile or stop another project's services to obtain its ports.

This task did not inspect any Docker daemon, VM, database, external CLI executable
or remote target. No existing local candidate is certified safe by this report.
Before future startup, independently verify project/config/migration/volume/network
identity, local daemon selection, port ownership and absence of production inputs.
Then use B43's actual container/cluster/principal preflight before reset/fixtures.
For B42, the owner-reviewed equivalent checks remain mandatory. Startup may itself
apply migrations, so authorization must cover bootstrap writes as well as later
explicit resets. Existing source docs require separate startup/reset authorization.

### Concise acceptance matrix

| Gate | Required evidence | PR 1 / PR 2 disposition |
| --- | --- | --- |
| PR 1 default-off merge | Independent review; offline route/method/config/body/privacy/early-denial suite; focused checks/lint/build and explicit 175-diagnostic disposition; real full-chain B31/B42 integrity/roles/proofs through isolated fixtures; B43 target/catalog/effective-role/PostgREST/WITHHELD/current-read boundary evidence; populated historical-data default-off smoke; actual Vercel scopes/older deployment/rollback checks | Required PR 1 evidence, currently no live acceptance run |
| Known B43 source transition failures | Complete persisted participant/consent/session/lifecycle tuples, exact restriction facts, injected-failure rollback and observed concurrent commit-order checks | Genuine PR 2 failures when reached; do not call PASS or infer later coverage from an early exit |
| Shared-track SQL denial | Effective application-role promotion execution and historical qualified-proof consumption denied without weakening private DML or WITHHELD/integrity contracts | PR 2; existing service-role grants are deliberately unchanged in PR 1 |
| Private interviews activation | Source-transition forward fix plus fresh/upgrade acceptance; owner and persisted-family/lineage checks; valid lifecycle/session/consent persistence, idempotency/classification recovery, RLS and concurrency; no shared/AI authority | Activation NO-GO until proven; public ingress remains off |
| Public survey activation | Private survey acceptance plus explicit public admission; token/publication lineage and safe projection, replacement/revocation/submission races, required answers, stable retry identity, real streamed-byte bounds and abuse/completeness controls | Separate activation NO-GO; owner revocation with public participation off must remain |

F4 completion is not required by this plan and no F4 implementation is imported.
A full B43 run may still fail at the known PR 2 RETURN OLD defect. Preserve the
nonzero exit and exact phase; earlier boundary evidence is not a full-suite PASS.
If repository policy requires the whole job green before merge, obtain explicit
scope/gate disposition or remain blocked; do not skip assertions to fabricate green.
Future PR 2 grant denial will require reviewed administrator-only positive fixture
transport, not restoration of application RPC authority for tests.

### Execution and release decisions

GO to seek separately scoped authorization for staged disposable acceptance after
independent source and target verification. This is not authorization to execute
here, not a guarantee that a candidate local Docker host is safe, and not evidence
that any database assertion passes. The three source-level inconsistencies are
corrected and covered offline; real runtime results remain unverified.

Merge/automatic Vercel deployment remains NO-GO until required PR 1 evidence and
operational gates are satisfied. Private interviews and public surveys remain
NO-GO pending their separate matrix gates. Known PR 2 failures remain failures.
No database, Docker/VM/remote service, workflow, production configuration or
feature was started, connected, reset, changed or activated in this task. No commit,
push, PR modification, migration or deployment occurred. PR #235 remains untouched.

### Final database harness verification

| Check | Result |
| --- | --- |
| Relevant offline suite, 26 files | 1,696 passed; zero failures/skips |
| New SQLSTATE/identity/PostgREST/CLI contract regressions | 40 passed, included above |
| Strict focused TypeScript | Exit 0 |
| Workflow-style targeted TypeScript | Exit 0 |
| Full repository TypeScript | Exit 2; baseline 175, starting patch 175, current 175 |
| Complete diagnostic delta | Zero added/removed by file, code and full message |
| Lint | Exit 0; zero errors, four existing warnings |
| Build | Exit 0 |
| Production sources / fixture source pins | Unchanged; all 12 pins match |
| Harness and fixture modules in deployed server bundle | Absent |
| Database / Docker / VM / CLI / workflow operations | None executed |

No TypeScript exclusion, suppression, project option or dependency update was
introduced. This task's verification is offline; the CLI inspection is mocked in
unit tests and SQL strings are never sent to a database. No live assertion result
or installed/selected CLI binary is claimed. Previous HTTP/browser records remain
historical evidence, not a new acceptance run here.

### Complete current inventory

68 baseline-relative paths: 51 modified tracked and 17 untracked. Seven paths
changed in this task relative to the verified 66-file patch:

- `.github/workflows/validation-b31-database.yml`
- `docs/VALIDATION_PR1_MERGE_BLOCKER_REMEDIATION.md`
- `scripts/validation-acceptance-contracts.ts`
- `scripts/validation-b42-db.ts`
- `scripts/validation-b43-db.ts`
- `tests/validation-acceptance-contracts.test.ts`
- `tests/validation-b43-isolation.test.ts`

Full inventory (untracked contents are included in the saved diff):

```text
.github/workflows/validation-b31-database.yml
app/api/public/surveys/[token]/responses/route.ts
app/api/public/surveys/[token]/route.ts
app/api/validation/classifications/route.ts
app/api/validation/design-assistant/route.ts
app/api/validation/experiment-versions/[id]/transition/route.ts
app/api/validation/experiments/[id]/versions/route.ts
app/api/validation/hypotheses/[id]/versions/route.ts
app/api/validation/interview-observations/route.ts
app/api/validation/interview-plans/route.ts
app/api/validation/interviews/[id]/route.ts
app/api/validation/interviews/route.ts
app/api/validation/observations/route.ts
app/api/validation/participants/route.ts
app/api/validation/promotions/route.ts
app/api/validation/subjects/[id]/experiments/route.ts
app/api/validation/subjects/[id]/hypotheses/route.ts
app/api/validation/subjects/[id]/intelligence/route.ts
app/api/validation/subjects/[id]/route.ts
app/api/validation/subjects/route.ts
app/api/validation/survey-plans/route.ts
app/api/validation/survey-publications/[id]/revoke/route.ts
app/api/validation/survey-publications/route.ts
app/validation/[id]/page.tsx
app/validation/layout.tsx
app/validation/survey/[token]/page.tsx
components/validation/experiment-form.tsx
components/validation/hypothesis-form.tsx
components/validation/interview-observation-form.tsx
components/validation/release-capabilities.tsx
components/validation/survey-workspace.tsx
components/validation/unavailable.tsx
docs/VALIDATION_DISABLED_RELEASE_BOUNDARY.md
docs/VALIDATION_PR1_MERGE_BLOCKER_REMEDIATION.md
docs/VALIDATION_VERCEL_DEFAULT_OFF_CHECKLIST.md
lib/validation/design-assistant/service.ts
lib/validation/intelligence/service.ts
lib/validation/promotion/current-qualified-evidence-reader.ts
lib/validation/promotion/promotion-service.ts
lib/validation/promotion/read-repository.ts
lib/validation/promotion/trusted-qualified-evidence-reader.ts
lib/validation/server/http.ts
lib/validation/server/public-survey-http.ts
lib/validation/server/release-policy.ts
lib/validation/server/repository.ts
lib/validation/server/resource-policy.ts
lib/validation/server/service.ts
lib/validation/server/surveys.ts
scripts/validation-acceptance-contracts.ts
scripts/validation-b42-db.ts
scripts/validation-b43-db.ts
scripts/validation-b43-isolation.ts
scripts/validation-promotion-dry-run.ts
tests/current-qualified-evidence-reader.test.ts
tests/support/validation-database-fixtures.manifest.json
tests/support/validation-database-fixtures.ts
tests/support/validation-module.ts
tests/trusted-qualified-evidence-reader.test.ts
tests/validation-acceptance-contracts.test.ts
tests/validation-b43-isolation.test.ts
tests/validation-body-limit.test.ts
tests/validation-capability-resources.test.ts
tests/validation-customer-interview-shareable-evidence.test.ts
tests/validation-database-fixtures.test.ts
tests/validation-design-assistant.test.ts
tests/validation-intelligence.test.ts
tests/validation-release-boundary.test.ts
tests/validation-workspace-ui.test.ts
```
