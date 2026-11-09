# B4.3-F4-B2.2 — local coordination fence implementation

Proposed, unapplied code at reviewed baseline
`cdfa204ac1e911a5faf02ae0fc21025e149c0e45`. No database execution, workflow,
publication, merge, production activation or positive evidence authority.

## Reconciliation and complete coverage

The [B2.1 baseline manifest](V8_B43_F4_B21_SOURCE_MANIFEST.json) is unchanged.
The [effective manifest](V8_B43_F4_B22_EFFECTIVE_MANIFEST.json) records all **58**
effective functions, the **40** preserved triggers, **27** new statement guards,
and the complete ACL disposition. Its migration digest and function body digests
are checked offline. The baseline's 53 functions, argument declarations, 101
explicit ACL statements and 40 triggers remain independently characterized.

| Boundary | Function/trigger coverage | ACL disposition |
| --- | --- | --- |
| Subject/hypothesis/experiment | validation_create_subject, validation_create_hypothesis, validation_append_hypothesis_version, validation_create_experiment, validation_append_experiment_version, validation_transition_experiment_version | Existing service-only EXECUTE retained; entry first; explicit postgres definer audit |
| Interview | validation_create_interview_plan, validation_create_interview_session, validation_update_interview_session, validation_update_interview_relevance, validation_record_interview_observation, validation_record_interview_observation_v2 | Same; parent/session/participant reads and locks follow entry |
| Source/classification | validation_record_observation, validation_update_participant_status, validation_insert_classification | Same; source and terminal checks retained |
| Survey | validation_create_survey_plan, validation_publish_survey, validation_revoke_survey, validation_submit_public_survey | Same; publication/experiment FOR SHARE follows entry |
| Intelligence | validation_claim_intelligence_run, validation_complete_intelligence_run, validation_fail_intelligence_run | Existing definers fenced before early reads and subject locks |
| Bootstrap/promotion | apply_canonical_bootstrap_activation, validation_promote_customer_interview_evidence | Existing definers fenced before private advisory/registry locks, duplicate fast paths and source reads |
| Registry trigger | validation_b31_lock_registry_statement | Entry first; remains INVOKER; original ACL retained, including unspecified platform defaults |
| Three former direct writers | validation_add_subject_link, validation_create_participant, knowledge_insert_problem_observations | Individually typed service-only RPCs; no generic executor |
| Private fence | saasscout_private.b43_enter, saasscout_private.b43_guard_statement | Postgres-owned INVOKER functions; no application schema/table/EXECUTE access |
| Remaining 28 original functions | Exact retained definitions in effective manifest | Source/proof/restriction/reader logic unchanged; original ACL/security attributes retained |
| All 27 guarded tables | b43_00_entry BEFORE INSERT/UPDATE/DELETE/TRUNCATE STATEMENT | Direct mutation and column UPDATE authority removed; effective privilege assertions required |
| Existing 40 triggers | Exact attachments retained | No DROP/replacement; history, source integrity, B4.2 snapshots and B4.3 capture preserved |

Each of the 24 writer replacements retains its argument defaults and domain body.
Offline tests reverse only reviewed edits and compare the remainder against its
individual baseline definition. Dependencies were already public-qualified;
pgcrypto calls remain `extensions.digest`; built-ins resolve through explicit
pg_catalog-first search paths. All become/remain VOLATILE postgres-owned definers.
Registry coordination stays an invoker rather than gaining unnecessary privilege.
SQL-bearing declaration initializers are absent; timestamp/shareable normalization
initializers move after entry. No dynamic SQL is introduced in public RPC bodies.

## Freshness and retry behavior

The singleton is physically incremented before protected work, without a cached
entry flag. The private table has a checked singleton key, FORCE RLS, no application
policy or grants, and exactly one seeded row. Missing row, wrong owner/isolation,
overflow and privilege failures fail closed. Only RC/RR are supported; SERIALIZABLE
and READ UNCOMMITTED are rejected. The invoker statement guard rejects TRUNCATE,
including a trusted direct attempt; it cannot become a privileged entry shortcut.

RC authoritative reads are separate commands in VOLATILE PL/pgSQL after entry.
Outer SELECT arguments are not refreshed by a trigger or helper. Existing
representative-state, authority-snapshot, terminal-classification, canonical and
eligibility comparisons remain post-entry. New promotion identity checking hashes
the same sorted-key JSON used by production TypeScript and validates the exact
representative group from persisted source identity/polarity. It does not rank or
select a representative. Existing finalized duplicate behavior remains unchanged;
no historical rows or fingerprints are rewritten.

RR stale snapshots must conflict with the real fence UPDATE and propagate 40001.
Bootstrap's two broad exception handlers now rethrow serialization_failure and
deadlock_detected; otherwise they would hide retryability behind P0001. Other
existing error/return paths are preserved. Whole-transaction retry still requires
fresh preparation; no automatic application retry or savepoint-only recovery is
added. Savepoint rollback cannot leave a persistent entry marker because none
exists. B2.3 must implement/test genuinely fresh harness preparation separately.

## Application compatibility

Only the three approved production methods change:

- `ValidationRepository.addSubjectLink`: keeps owned/upstream prechecks and public
  return shape. SQL repeats ownership checks after entry using fixed table CASE
  branches. UUID lookup accepts the same UUID representations as the prior query;
  the original source-row text is retained. Duplicate DO NOTHING returns null,
  preserving the existing generic 409 rather than returning an existing link.
  Missing/foreign resources, including an SQL recheck failure, remain 404.
- `ValidationRepository.createParticipant`: keeps experiment precheck, return
  projection, database IDs/status/timestamps and owner-independence uniqueness.
  No idempotency guarantee is added. Extra owner/status/ID fields cannot cross
  the typed RPC. Constraint failures remain generic 409; no private errors leak.
- `persistProblemObservations`: keeps its exported method and result contract,
  validation, best-effort persistence, duplicate skips and diagnostics. It now
  sends the same 25-field rows through a named composite array; SQL explicitly
  lists columns and returns only newly inserted fingerprints. No canonical ID,
  qualification, polarity, private authority or internal timestamp input exists.

The persistence client's injected transport interface now requires the narrow
`.rpc()` capability. The real Supabase client supplies it; the two affected test
doubles are adapted. No fourth application caller changes. A composite-array SDK
payload is not proof of PostgREST server decoding: real schema-cache/type mapping
and returned JSON remain disposable compatibility gates. Known external direct
writers must migrate to an approved operation or receive explicit denial; owner
attestation remains required before release. No speculative canonical/consent RPC
is introduced for unknown clients.

## Unsupported and uncovered paths

**No supported allowlisted writer or known production DML caller is uncovered
by source inventory.** These paths remain deliberately outside certification:

| Path | Disposition and remaining evidence |
| --- | --- |
| Direct locking SELECT, including FOR UPDATE/NO KEY UPDATE/SHARE/KEY SHARE | All effective table/column UPDATE authority must be absent. Final assertions inspect both; real-role negative tests remain required. A table-level DML REVOKE alone is insufficient. |
| FK parent locks | Incoming protected-parent FK closure is asserted; all known child tables are guarded, including feedback/evolution tables. System RI locks do not rely on caller UPDATE privilege. Unexpected children abort the migration. |
| Pre-entry built-in advisory locks or explicit table locks | No arbitrary service-role SQL certification. Revoking validation_b31_lock does not disable pg_catalog advisory functions. |
| Arbitrary SQL composition, SQL savepoints, unrelated RPC/pre-request hooks | Supported transport is one allowlisted RPC per PostgREST transaction. Credentials/configuration must prove no pre-entry protected locks; ACLs cannot inspect arbitrary SQL statement history. |
| Trusted postgres SQL, auth-account administration, live DDL/cascades | Quiescent maintenance only; do not compose with protected RPC transactions. Implicit relation locks precede statement triggers. |
| Unknown external clients, rules, triggers, definers and inherited/default ACLs | Fail-closed catalog/configuration gates; not independently observed here. No claim of a complete deployed role graph. |
| Runtime snapshots, row conflicts, rollback, schedules and performance | Not executed. Static source checks do not establish these properties or universal deadlock freedom. |

## Migration safety and recovery

New unapplied file:
`supabase/migrations/20261107000000_b43_executable_concurrency_contract.sql`.
The name was unused. No applied migration changes.

One explicit BEGIN/COMMIT covers baseline checks, private objects, audited
replacements, typed RPCs/type, statement guards, privilege reductions and final
assertions. Before modification, every original source body, expected owner,
security/volatility/strictness/language/search-path/configuration and explicit
EXECUTE declaration is checked. Table ownership, all 40 trigger attachments,
event columns, enabled state, absence of rules and incoming FK closure are checked.
Unknown objects are not adopted through IF NOT EXISTS or ownership takeover.

Final assertions check all 30 implemented function bodies/attributes; retained
original function definitions and ACLs; guard coverage/order; role SET/USAGE/MEMBER/
ADMIN escape paths; browser reachability to service_role; relation and column
privileges; helper/reader denials; public-schema CREATE; and preserved effective
SELECT/RLS/policies. Revokes use RESTRICT rather than silently cascading unknown
dependent grants. The migration targets the reviewed PostgreSQL 17 environment
and fails on other majors. These catalog assertions have not been executed.

On any pre-commit error, roll back the complete migration. After commitment, use
a separately reviewed forward migration; never automatically restore unsafe DML
grants. Retain the fence and historical evidence. Drain protected writers before
later application and coordinate the client cutover; old invokers/direct writers
cannot remain active across permission reduction. Validate the deployment runner's
transaction/ledger handling in disposable infrastructure first.

No evidence backfill, guessed restriction, positive authority, consumer activation,
AI qualification, canonical fallback or polarity rewrite is present. Existing
WITHHELD capture, permanent restriction, immutable ledger/snapshot and denied
reader functions are not replaced.

## Validation and approval boundary

Offline source tests and mocked SDK tests check the whole effective inventory,
body-preservation deltas, entry ordering, real write shape, column/role/ACL guards,
canonical fingerprint format and adapter ownership/idempotency/error behavior.
They do not compile PL/pgSQL or exercise PostgreSQL locking. No SQL parser package
was available; SQL was reviewed statically without installing dependencies.

Validation results:

- 21 Python source checks passed, including the reconciled B2.1 tests.
- 74 focused TypeScript tests passed (66 evidence/adapter checks plus 8 dual-writer
  checks), with no failures or skips. The newly added adapter checks use an
  intercepted SDK fetch; they make no network or database requests.
- `npm run lint` passed with four existing page warnings.
- `NEXT_TELEMETRY_DISABLED=1 npm run build -- --webpack` passed, including Next's
  TypeScript checking.
- `node_modules/.bin/tsc -p tests/tsconfig-b43-rpc.json` is the focused strict ES2022
  check. A broader `tsc --noEmit --incremental false` failed with existing test
  errors: an in-memory baseline comparison recorded 176 baseline and 176 current
  diagnostics, with no added diagnostics after adapting the dual-writer mock.
  Initial local test/mock failures were corrected; repository-wide tsc remains
  failing and is not reported as clean.

Runtime SQL compilation, PostgREST composite decoding, catalog assertions and
all PostgreSQL schedules remain unexecuted, rather than successful or skipped
database tests. No dependencies were installed or changed.

**GO for separate F4-B2.3 local harness work after human review. NO-GO for database
execution now.** Before any separately authorized disposable validation, repair
classification restriction identity and true fresh retry preparation, adapt
fixture DML/cleanup and privilege assertions to the new boundary, and add real RC,
RR, direct-lock, role, indirect-write, savepoint, atomicity and failure controls.
Do not weaken catalog guards to pass a fixture. Provisional performance targets
remain future disposable measurements, not release criteria already achieved.
Merge and production migration remain NO-GO. Stop for human review.
