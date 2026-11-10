# Private Validation Capability Foundation — PR 1

This supersedes the blanket-disabled design previously recorded at this filename.
It is a local default-off foundation, not approval to activate Validation.

The subsequent adversarial review and merge-blocker remediation supersede the
original merge recommendation below. See
[the remediation report](./VALIDATION_PR1_MERGE_BLOCKER_REMEDIATION.md) and
[the owner Vercel checklist](./VALIDATION_VERCEL_DEFAULT_OFF_CHECKLIST.md).
Original verification counts below describe the preserved 55-file patch.

## A. Verified baseline, documentation and recovery

Repository: OsaRete/saasscout-landing. Local branch: `work`.
Local HEAD and remote main: `f5fefab6da62137472c4a465346c8afc52aea228`.
Initial state was the existing uncommitted 30-file patch, not a clean checkout.
PR #235 was inspected read-only: open, Draft, unmerged, head
`51814ade275b34c6b8aec9a48661babcb1e00768`. It is not part of this implementation.

The original patch, all 30 modified/new file contents and verification artifacts
were preserved at `/workspace/work/saasscout-validation/before-private-capabilities/`.
Original patch SHA-256:
`419a3e114722973356188ba97c5e872498af986eb914c1572a549f006cbb79a9`.
The original `review/` artifacts also remain intact. New review artifacts use
`/workspace/work/saasscout-validation/private-capabilities/`.

Documentation read/reviewed, including relevant security and release sections:

- PRODUCT_VISION.md, DATA_MOAT.md, SYSTEM_ARCHITECTURE.md, AI_PRINCIPLES.md,
  ENGINE_GUIDELINES.md, CODING_STANDARDS.md and repository AGENTS.md.
- IDEA_VALIDATION_DOMAIN_CONTRACT.md, IDEA_VALIDATION_SCHEMA.md,
  IDEA_VALIDATION_API.md, IDEA_VALIDATION_WORKSPACE.md,
  IDEA_VALIDATION_CUSTOMER_INTERVIEWS.md, IDEA_VALIDATION_SURVEYS.md,
  IDEA_VALIDATION_INTELLIGENCE.md and VALIDATION_DESIGN_ASSISTANT.md.
- DATA_MOAT_ARCHITECTURE.md, DATA_MOAT_AGGREGATION_LAYER.md and
  KNOWLEDGE_EVOLUTION_MIGRATION_PLAN.md (reviewed in the preceding reassessment).
- V8_B3_0_1_CUSTOMER_INTERVIEW_EVIDENCE_HARDENING.md,
  V8_B3_1_CONTROLLED_CUSTOMER_INTERVIEW_PROMOTION.md,
  V8_B4_1_TRUSTED_QUALIFIED_EVIDENCE_READ_BOUNDARY.md,
  V8_B42_QUALIFIED_EVIDENCE_INTEGRITY.md,
  V8_B43_A_CURRENT_EVIDENCE_AUTHORITY_CONTRACT.md,
  V8_B43_B_CURRENT_EVIDENCE_SAFETY_FOUNDATION.md and
  V8_B43_B_DISPOSABLE_DATABASE_VALIDATION.md.
- The previous VALIDATION_DISABLED_RELEASE_BOUNDARY.md, review/review-report.md,
  review/proposed.diff, saved verification/TypeScript records and preceding
  read-only reassessment in this task.
- Installed Next.js 16.2.4 route-handler/layout guidance and type-checker behavior.

Actual route/service/repository/UI code and effective migration definitions were
inspected, including V2/V3/V5/V6, intelligence, shareable-evidence hardening,
B3.1, both B4.2 migrations, required-answer integrity and B4.3. Documentation is
context, not proof of deployed objects or behavior. No deployed catalog was read.

Contradictions addressed or retained explicitly:

- The old universal disable contradicts the revised private Beta scope: replaced.
- The private workspace queried promotion history and offered sharing controls:
  removed from the Beta path without changing persisted history.
- B4.3's source-lock hook returns OLD on UPDATE, contradicting documented source
  transition persistence: NOT fixed here; activation blocker for PR 2.
- SQL survey idempotency is not sufficient when the browser regenerates its key
  after uncertain failure: retained as an acceptance/recovery blocker.
- Next's build checker filters test-file diagnostics; a passing build does not
  establish a passing repository-wide `tsc` check.

## B. Complete changed-file inventory

55 files relative to verified main, including the original patch's retained changes:

- `app/api/public/surveys/[token]/responses/route.ts`
- `app/api/public/surveys/[token]/route.ts`
- `app/api/validation/classifications/route.ts`
- `app/api/validation/design-assistant/route.ts`
- `app/api/validation/experiment-versions/[id]/transition/route.ts`
- `app/api/validation/experiments/[id]/versions/route.ts`
- `app/api/validation/hypotheses/[id]/versions/route.ts`
- `app/api/validation/interview-observations/route.ts`
- `app/api/validation/interview-plans/route.ts`
- `app/api/validation/interviews/[id]/route.ts`
- `app/api/validation/interviews/route.ts`
- `app/api/validation/observations/route.ts`
- `app/api/validation/participants/route.ts`
- `app/api/validation/promotions/route.ts`
- `app/api/validation/subjects/[id]/experiments/route.ts`
- `app/api/validation/subjects/[id]/hypotheses/route.ts`
- `app/api/validation/subjects/[id]/intelligence/route.ts`
- `app/api/validation/subjects/[id]/route.ts`
- `app/api/validation/subjects/route.ts`
- `app/api/validation/survey-plans/route.ts`
- `app/api/validation/survey-publications/[id]/revoke/route.ts`
- `app/api/validation/survey-publications/route.ts`
- `app/validation/[id]/page.tsx`
- `app/validation/layout.tsx`
- `app/validation/survey/[token]/page.tsx`
- `components/validation/experiment-form.tsx`
- `components/validation/hypothesis-form.tsx`
- `components/validation/interview-observation-form.tsx`
- `components/validation/release-capabilities.tsx`
- `components/validation/survey-workspace.tsx`
- `components/validation/unavailable.tsx`
- `docs/VALIDATION_DISABLED_RELEASE_BOUNDARY.md`
- `lib/validation/design-assistant/service.ts`
- `lib/validation/intelligence/service.ts`
- `lib/validation/promotion/current-qualified-evidence-reader.ts`
- `lib/validation/promotion/promotion-service.ts`
- `lib/validation/promotion/read-repository.ts`
- `lib/validation/promotion/trusted-qualified-evidence-reader.ts`
- `lib/validation/server/http.ts`
- `lib/validation/server/public-survey-http.ts`
- `lib/validation/server/release-policy.ts`
- `lib/validation/server/repository.ts`
- `lib/validation/server/resource-policy.ts`
- `lib/validation/server/service.ts`
- `lib/validation/server/surveys.ts`
- `scripts/validation-promotion-dry-run.ts`
- `tests/current-qualified-evidence-reader.test.ts`
- `tests/support/validation-module.ts`
- `tests/trusted-qualified-evidence-reader.test.ts`
- `tests/validation-capability-resources.test.ts`
- `tests/validation-customer-interview-shareable-evidence.test.ts`
- `tests/validation-design-assistant.test.ts`
- `tests/validation-intelligence.test.ts`
- `tests/validation-release-boundary.test.ts`
- `tests/validation-workspace-ui.test.ts`

No migration, F4/workflow, Discovery, Scan, Weekly Intelligence or Knowledge
Evolution implementation is changed. The extra files beyond the original 30
implement resource admission, private UI separation, direct-entry/shared-entry
coverage and test-only preservation of deferred algorithm regressions.

## C. Capability contract and operation matrix

Only server environment configuration is read. No client capability or role claim
is used as permission. Parsing is exact and case-sensitive; values are not trimmed
or interpreted as truthy.

`VALIDATION_PRIVATE_MODE` accepts DISABLED, INTERVIEWS, SURVEYS, or
INTERVIEWS_AND_SURVEYS. Missing, empty, malformed, unknown or unsupported values
resolve to DISABLED. The old VALIDATION_RELEASE_MODE flag grants nothing.

`VALIDATION_PUBLIC_SURVEYS` accepts ENABLED or DISABLED. Only exact ENABLED,
combined with admitted private surveys, admits public participation/publication.
Unknown or missing public configuration disables public participation while
preserving independently admitted private authoring/revocation.

| Capability | Policy |
| --- | --- |
| Private interviews | INTERVIEWS or INTERVIEWS_AND_SURVEYS |
| Private surveys | SURVEYS or INTERVIEWS_AND_SURVEYS |
| Public survey participation | Private surveys AND public ENABLED |
| Private AI design | Constant false in this Beta foundation |
| Private AI interpretation | Constant false in this Beta foundation |
| Shared preparation | Constant false in Beta |
| Shared promotion | Constant false in Beta |
| Qualified shared consumption | Constant false in Beta |
| Generic observation ingestion | Denied; not an approved specialized ingress |
| Unknown operations/future families | Denied |

There is no environment setting, test flag, allowlist or request parameter that
turns on promotion, qualified consumption or AI in the production policy.
These denied operation classes remain denied even with a forged policy projection.

Coarse operation/method admission occurs at each original route entry before
parameters, auth, body parsing or privileged construction, and again in the
shared HTTP wrappers. Admitted owner operations authenticate before admin-client
construction; services/repositories then verify owner-scoped persisted versions,
families and lineage before mutation. The resource helper admits only its fixed
private-table allowlist; it cannot be used to query shared proof or arbitrary
tables. On creation, family is a bounded requested
design, admitted by policy and bound to an owned hypothesis; for existing
resources the persisted family is authoritative. Unknown families never gain
execution through arbitrary design JSON or client capability claims.

| Route | Original method | Operation | Admission |
| --- | --- | --- | --- |
| `/api/public/surveys/[token]/responses` | POST | `survey.submit` | Private surveys + public ENABLED; token-bound running survey |
| `/api/public/surveys/[token]` | GET | `survey.resolve` | Private surveys + public ENABLED; token-bound running survey |
| `/api/validation/classifications` | POST | `classification.create` | Private interviews; owned interview lineage |
| `/api/validation/design-assistant` | POST | `ai.design` | Denied in Beta |
| `/api/validation/experiment-versions/[id]/transition` | POST | `experiment.transition` | Either private capability; persisted family checks for existing experiments |
| `/api/validation/experiments/[id]/versions` | POST | `experiment.version` | Either private capability; persisted family checks for existing experiments |
| `/api/validation/hypotheses/[id]/versions` | POST | `hypothesis.version` | Either private capability; persisted family checks for existing experiments |
| `/api/validation/interview-observations` | POST | `interview.observation` | Private interviews; owned interview lineage |
| `/api/validation/interview-plans` | POST | `interview.plan` | Private interviews; owned interview lineage |
| `/api/validation/interviews/[id]` | POST | `interview.update` | Private interviews; owned interview lineage |
| `/api/validation/interviews` | POST | `interview.create` | Private interviews; owned interview lineage |
| `/api/validation/observations` | POST | `observation.generic` | Denied in Beta |
| `/api/validation/participants` | POST | `participant.create` | Private interviews; owned interview lineage |
| `/api/validation/promotions` | POST | `shared.promote` | Permanently denied in Beta |
| `/api/validation/subjects/[id]/experiments` | POST | `experiment.create` | Either private capability; persisted family checks for existing experiments |
| `/api/validation/subjects/[id]/hypotheses` | POST | `hypothesis.create` | Either private capability; persisted family checks for existing experiments |
| `/api/validation/subjects/[id]/intelligence` | GET | `ai.status` | Denied in Beta |
| `/api/validation/subjects/[id]/intelligence` | POST | `ai.analyze` | Denied in Beta |
| `/api/validation/subjects/[id]` | GET | `subject.read` | Either private capability; persisted family checks for existing experiments |
| `/api/validation/subjects/[id]` | POST | `subject.link` | Either private capability; persisted family checks for existing experiments |
| `/api/validation/subjects` | GET | `subject.list` | Either private capability; persisted family checks for existing experiments |
| `/api/validation/subjects` | POST | `subject.create` | Either private capability; persisted family checks for existing experiments |
| `/api/validation/survey-plans` | POST | `survey.plan` | Private surveys; owned survey version |
| `/api/validation/survey-publications/[id]/revoke` | POST | `survey.revoke` | Private surveys; owned survey publication; public flag irrelevant |
| `/api/validation/survey-publications` | POST | `survey.publish` | Private surveys + public ENABLED; owned survey plan |

All other Next-supported methods on these routes retain explicit fixed denial.
There are 22 routes, 25 original handlers and 154 supported route/method
combinations. Other HTTP verbs are rejected by Next.js without entering handlers.
No broad catch-all admission was introduced.

Owner revocation depends on the private Survey capability, not public ENABLED.
It still checks the owned publication's exact persisted survey lineage and can
revoke a link after its experiment becomes terminal. DISABLED private mode does
not permit commands; it also disables all public ingress.

Allowed private responses and all wrapper error/disabled responses use
`Cache-Control: private, no-store, max-age=0`, CDN no-store headers and noindex.
Denied responses have fixed HTTP 503 and exactly:
`{"error":{"code":"validation_disabled","message":"Validation is unavailable in this release."}}`.
They interpolate no IDs, tokens, evidence, configuration or exception details.

The server layout supplies only safe UI capability booleans and remains dynamic.
The token page independently checks public admission before reading params or
mounting its client. Private AI controls, sharing controls and historical
shared-authority badges are omitted. Publication controls follow the public
capability; revocation remains available. These UI decisions are not the security
boundary: APIs and server entry points enforce it independently.

## D. Direct-entry Validation

Both journeys remain supported by the architecture:

1. Discovery/Scan/Solution may provide verified typed context to Validation.
2. `/validation/new` can create a user_entered subject from the user's idea with
   no upstream reference, Discovery, Scan or model call. An owned hypothesis and
   admitted experiment can then be created against that subject.

The existing user-entered flow is reused; provenance is optional and context is
never evidence. Offline tests prove direct subject creation makes no upstream
read and experiment creation binds the owned hypothesis/subject.
Professional development is a separately contracted downstream service. No
billing, professional-service execution or full application generator is added.
Landing pages, interactive prototypes, external MVP tests and commercial-intent
experiments remain future private methods; their unknown families/operations
are denied rather than represented as an enabled arbitrary JSON workflow.

## E. Private/shared separation and residual bypasses

The private workspace no longer reads validation_evidence_promotions or returns a
promotion-history field. It reads only admitted experiment versions and their
owned children. Classifications and raw survey answers are narrowed through the
selected owned observations/submissions. Owner-local interview participants
remain reusable; unrelated study-scoped participants are excluded. Existing
survey result caps remain and do not establish exhaustive counts.

Promotion controls, shared-authority badges and new shared-use statement
preparation are absent from the private editor. Server commands independently
reject shareableEvidence preparation. Historical private/shareable/promotion
records are not deleted or rewritten.

Server-only promotion execution, global/owner preparation data readers, both
qualified readers, the promotion CLI and direct AI service methods explicitly
deny before DB/provider work. Default admin-client initializers in deferred
entry points were moved behind admission. Injected clients do not bypass denial.
There is no historical-reader fallback. Pure qualification/integrity/ranking
algorithms remain unchanged and are not an exposed privileged entry point.

Source inventory found no production Validation server action, scheduled job or
background consumer requiring another integration. Weekly cron and legacy
Knowledge Evolution/Evidence Alignment remain separate. Administrative database
harnesses and trusted direct SQL are not application release-policy consumers;
none was run. The F4 implementation was not incorporated.

IMPORTANT remaining boundary: SQL privileges are unchanged. The existing service
credential can still directly invoke the promotion SECURITY DEFINER RPC and can
read historical proof tables outside these guarded application functions. Owner
RLS reads also do not obey server environment flags. An administrator can alter
objects. This PR makes no database-level promotion-denial or deployed-security
claim; those are explicit PR 2 gates. Broad private DML privileges are not revoked.

Immutable source/proof checks, restriction facts, source coordination, qualified
contracts and WITHHELD-only authority are unchanged. Safety-trigger restriction
writes during private operations are not shared promotion or positive authority.

## F. Local verification

- Focused offline suite: **1,602 tests passed**, zero failures/skips, across 23
  test files. Includes 1,232 route/method/configuration matrix cases, capability
  parsing/dependencies, unsupported operations/families, side-effect traps,
  persisted ownership/family/lineage checks, owner revocation with public off,
  workspace isolation/participant reuse, direct entry and retained regressions.
- Strict focused TypeScript: exit 0 using the review tsconfig (ES2022, strict,
  no emit; all changed TypeScript files plus generated route contracts).
- Full lint: exit 0, zero errors, four existing Discover/Saved/Scans warnings.
- `npm run build`: exit 0, default Next.js 16.2.4 Turbopack compilation,
  TypeScript stage, prerendering and route generation.
- Built local servers: **308 HTTP route/method checks passed** across default-off
  and private-capability/public-off profiles. An admitted private operation was
  requested without a bearer and returned 401 before client/database access;
  denied/unsupported methods returned fixed 503. Private/no-store and exact safe
  envelopes were checked. No authenticated database workflow was executed.
- **Six Chromium checks passed**: four default-off deep links, public token-page
  denial with private surveys admitted/public off, and the manual user-idea
  editor. No external or Validation API requests/persistence were allowed.
- Unrelated home, login, privacy and dashboard returned HTTP 200; Results kept
  its normal unauthenticated HTTP 401. Existing Results/Evidence Alignment tests
  also pass in the focused suite.
- `git diff --check` passed; migration/workflow/Knowledge/Scan/Weekly source
  comparisons against HEAD were unchanged. Exact proposed diff apply-checks
  against pristine verified main are recorded in the review artifacts.

Commands, logs, focused test-file list, route inventory and temporary strict
TypeScript configuration are preserved in the private-capabilities review folder.
Local capability profiles were test-process settings only, not production
configuration or feature activation.

Offline tests use mock databases/transports only. Original historical-reader and
AI design algorithm regressions remain, but run in isolated test-only modules
with admission mocked and real admin construction prohibited. This exercises
the retained deferred algorithms without claiming they are admitted in Beta.
Separate tests invoke the actual production entry guards, including injected
clients, and require denial before data/provider access. There is no production
bypass or environment override for those tests.

The opt-in database test file is not included in the offline suite. No database
operation, migration/reset, provider request, F4 run or workflow dispatch occurs.

## G. TypeScript diagnostic baseline

Repository-wide `npx tsc --noEmit --incremental false` exits 2 with exactly
**175 baseline diagnostics and 175 current diagnostics; zero added or removed**
when compared by file, code and message. `typescript-comparison.json` and both
complete outputs are preserved. No diagnostic in changed production code remains.
An earlier concurrent build/typecheck briefly observed Next regenerating its
routes file; that failure is retained as `typescript-build-race.log`. The final
full check was rerun after build completion, without exclusions or suppression.

The preserved baseline is 175 diagnostics in 26 test files, including nine in
Validation tests (seven regex target errors and two obsolete Survey fixtures).
Next's checker filters *.test.*/*.spec.* diagnostics; the build pass is distinct
from the retained full-tsc failure. The focused check uses strict ES2022 for the
supported Node test runtime, not suppression of repository errors. No
ignoreBuildErrors, broad exclusion, ts-ignore, target change or compiler-option
change was added to the project.

## H. Remaining activation blockers

- B4.3 returns OLD on UPDATE and can suppress lifecycle, status, consent, notes
  and timestamp changes; no correction is present here.
- Source-transition correction requires real persisted-state, upgrade, rollback,
  role/ACL/RLS and concurrency acceptance. Relevant private admission/freshness
  paths cannot be certified by this capability matrix or by a C1 source edit alone.
- The survey browser retry key is regenerated on retry. Lost-response recovery,
  interview observation/classification multi-request recovery, public abuse bounds
  require targeted follow-up acceptance/hardening. Actual streamed-body limits
  are now enforced by the PR 1 remediation; see its regression results.
- Public publication/replacement/revocation and submission concurrency, required
  answers, owner isolation, safe projections and no shared side effects require
  real full-chain PostgreSQL/PostgREST evidence.
- Survey summary truncation/completeness and prior suppressed source-change
  intent require explicit release dispositions; do not invent backfills.
- Effective deployed SQL privileges/objects have not been inspected. Existing
  application promotion authority must be denied at the database boundary.
- Full TypeScript baseline debt needs explicit review/disposition; no clean
  whole-repository compilation is claimed.

Interviews and Surveys need not adopt the whole F4 program, but they cannot skip
real acceptance of their overlapping source, privilege and locking paths. No
private or public production capability is activated by this local work.

## I. Proposed PR 2

1. New forward migration correcting validation_b43_lock_source_change() to return
   NEW for its existing INSERT/UPDATE attachments. Preserve applied migration
   bytes, ownership/security attributes, ACL denial, lock identities/order and
   immutable/restrictive contracts. Do not merge/cherry-pick PR #235 or import F4.
2. Separate narrow forward SQL denial of effective application EXECUTE on the
   exact existing promotion function:
   validation_promote_customer_interview_evidence(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text).
   Cover PUBLIC, anon, authenticated, service_role, authenticator and inherited,
   column/overload/default/role reachability where relevant; verify effective
   privilege, not just nominal REVOKE text.
3. Preserve denial of validation_b43_read_current_evidence(uuid). Remove effective
   application SELECT on validation_evidence_promotions and
   validation_qualified_evidence_snapshots where it enables historical qualified
   consumption; review relevant proof/helper EXECUTE grants. Preserve postgres
   trigger operation and owner private research reads; do not blanket-revoke
   private DML or lock helpers used by existing invoker-rights private RPCs.
4. On separately authorized disposable infrastructure, test fresh chain AND
   upgrade from B4.3 already applied, plus a buggy-baseline negative control.
   Verify stored complete tuples/timestamps, source restrictions and atomic
   rollback, exact grants/owners/search paths/trigger attachments, no positive
   authority, unchanged historical proofs and real application-role denials.
5. Exercise actual private RPC/ingestion/publication/transition races with
   independent connections, observed blocking and both commit orders. Test stale
   admission (e.g. observation eligibility read versus session cancellation), CAS,
   duplicate commands and rollback. A reachable unresolved cycle/freshness defect
   blocks activation and needs a narrow reviewed repair; a timeout is not a pass.
6. Keep promotion/reader activation disabled and stage interview/survey recovery
   and browser/PostgREST acceptance separately. Existing F4 exact-source manifests
   would need separate future reconciliation with any new migration; do not weaken
   them or restore revoked privileges to make historical fixtures pass.

No SQL change or execution from this proposal is part of PR 1.

## J. Decision and restrictions

- **GO for diff review.** The local foundation is implemented and verified to
  the offline/application-boundary extent above.
- **NO-GO for merge with automatic Vercel deployment** until operational
  configuration/older-deployment verification and actual required acceptance
  evidence are available. This supersedes the original conditional merge
  recommendation following the adversarial review.
- **NO-GO for production activation/public Beta publication with Validation.**
  Private and public activation still require the database/source-transition,
  effective-privilege and workflow acceptance gates in H/I. No capability is
  asserted safe because a prior mocked test or older migration suite passed.

No commit, push, PR creation/merge, workflow dispatch, database operation,
migration application, deployment, production capability change or reader
activation was performed. PR #235 remains Draft/unmerged and untouched.
