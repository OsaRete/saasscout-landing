# B4.3-F4-B2.1 — local executable-contract preparation

Historical reviewed design input. B2.2 implements this contract in a separate,
unapplied migration; see [the implementation review](V8_B43_F4_B22_IMPLEMENTATION_REVIEW.md).
The B2.1 source manifest is retained unchanged. Its tests now explicitly exclude
the B2.2 migration when checking the baseline, and require the three reviewed
direct-DML callers to have been adapted. B2.2 tests reconcile the full effective
inventory separately rather than replacing this historical evidence.

Status: proposed design and offline source checks only. No migration or application
implementation in this phase. PR #235 and production migration remain NO-GO.

## Baseline and evidence limits

On 2026-11-07, `git ls-remote origin refs/pull/235/head` returned
`cdfa204ac1e911a5faf02ae0fc21025e149c0e45`. Fetching that ref and checking
`git merge-base --is-ancestor d346eeb14e920b78556e8b884faaed23885bbc1c HEAD`
confirmed ancestry after switching the initially clean checkout to that detached
HEAD. The previous reviewed SHA is still the current ref. GraphQL access was
denied; Draft/unmerged is the owner's supplied state, not a new API assertion.

[The source manifest](V8_B43_F4_B21_SOURCE_MANIFEST.json) records 53 effective
function definitions (full argument declarations, attributes, source locations,
definition hashes, explicit EXECUTE operations and owner evidence), 40 triggers,
101 relevant explicit ACL statements, 24 writer entries and 27 guarded tables.
It is a source manifest, not a live PostgreSQL catalog. The functions have no
overloads in this inventory; CREATE OR REPLACE retains prior ACL and ownership.
The manifest retains defaults in declarations rather than guessing regprocedure
identity from argument names. No database, production role graph or external
client inventory was accessed.

Run #48's 12 observed deadlocks across six schedule types and RR failures are
human-supplied F4 evidence. Their runtime artifacts were not independently
retrieved. Source confirms the early promotion reads, lower-lock entry paths,
incorrect classification assertion and reused retry SQL; it cannot establish
runtime counts or universal deadlock freedom.

## Effective access and ownership manifest

| Object group | Source-declared baseline | B2.2 disposition |
| --- | --- | --- |
| First 23 guarded tables, through intelligence runs in manifest order | service_role ALL; browser mutation revoked; authenticated SELECT only where already granted | Restrict application mutations/row-lock authority; preserve existing reads/RLS |
| Promotion ledger and qualified snapshots | service_role SELECT only after B4.2 revocation | Preserve; private writes only below promotion |
| Authority and restrictions | all application access revoked; FORCE RLS and no application policy | Preserve exactly |
| 24 entry writers | explicit service_role EXECUTE; PUBLIC/anon/authenticated revoked | Preserve signatures/returns/EXECUTE; fence and audit execution context |
| B3.1 lock helper | service_role EXECUTE | Revoke application EXECUTE; internal use only |
| B3.1/B4.2 read/proof helpers | see per-function explicit EXECUTE operations | Preserve read behavior; preparation is never authority |
| B4.3 private functions, including current reader | all application EXECUTE denied | Preserve denials; no reader activation |
| Other trigger functions | exact declarations/ACL operations in manifest | Preserve unless expressly restricting unused direct EXECUTE; never make an invoker entry a definer shortcut |

The Validation-domain loop grants/revokes and SELECT owner policies are in
`20260828000000_create_validation_domain.sql:357-379`; they are dynamic SQL and
are not represented as fabricated expanded ACL statements. Similar explicit
later table grants and policies remain in their source files. Existing trigger
attachments, timing, event columns and function names are stored verbatim in the
manifest. Preserve all 40; attach the new guard to all 27 tables.

Only the B4.2 guard and promotion have explicit `ALTER FUNCTION ... OWNER TO
postgres` in these sources. Other functions inherit their creation principal;
expected postgres ownership is an assertion to verify, not an observed fact.
B4.3 explicitly requires the trusted postgres principal with BYPASSRLS and denies
application reachability to it. Repository migrations do not provision the
Supabase role-membership graph or platform default privileges. Thus an exact live
effective ACL/inheritance/owner manifest is unavailable without catalog access.
Do not invent it or interpret missing GRANT text as proof of absence.

Before later application, extend the existing `buildRoleBoundaryQuery` audit from
`scripts/validation-b43-isolation.ts` to every table/function/schema owner and
every privileged role. Check SET, inherited USAGE, MEMBER and ADMIN paths for
PUBLIC effects and anon/authenticated/service_role/authenticator, including
intermediate roles and roles with CREATEROLE/SUPERUSER/BYPASSRLS. Assertions must
also cover table and column ACLs, grant options, ownership, PUBLIC/default ACLs,
schema CREATE and effective helper/entry EXECUTE. Fail closed on extra overloads,
unexpected owners, foreign-key dependencies, rules, triggers or definer writers.

## Exact supported boundary

Application writes use one allowlisted public RPC per PostgREST request/transaction.
The service role remains trusted server infrastructure, never an end-user role.
Existing server authentication derives owner IDs; SQL rechecks owner and lineage.
An RPC parameter named owner_id is not end-user authentication. No browser EXECUTE
grant, role membership, generic mutation RPC or caller-controlled entry marker.

Reduce application INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
privileges and grant options on guarded tables, accounting for server version,
column grants and inherited roles. Keep existing SELECT and all RLS definitions.
No application owner/DDL path is acceptable. Revoke `validation_b31_lock(text,text)`
application EXECUTE as well as any accidental direct access to private helpers.

**Row-lock precision:** PostgreSQL SELECT locking clauses FOR UPDATE, FOR NO KEY
UPDATE, FOR SHARE and FOR KEY SHARE require SELECT plus UPDATE on at least one
column of each locked table. Removing *every effective table/column UPDATE grant*
prevents those direct locking SELECTs; a nominal table-level REVOKE alone does
not. Require disposable negative tests for all four forms under real application
identities. FK referential-integrity checks can still lock parents independently
of caller table UPDATE grants. Built-in advisory-lock functions are not disabled
by revoking the B3.1 helper. LOCK TABLE and unrelated privileged paths also need
their own privilege treatment. Do not certify arbitrary service-role SQL.

No service-role SQL credentials, generic SQL endpoint, PostgREST pre-request hook
or exposed RPC may acquire a protected lower lock before entry. A compromised
trusted SQL administrator can violate this contract; ACLs do not sandbox postgres.
Transport/configuration verification is a release gate. Supporting arbitrary SQL
would require a separate design; globally revoking pg_catalog advisory functions
is not proposed.

## Entry, statement, parent and indirect coverage

All 24 functions in `entry_writers` become/remain VOLATILE, postgres-owned,
SECURITY DEFINER with fixed `search_path=pg_catalog,pg_temp`. Schema-qualify tables,
types and application functions; qualify extension calls explicitly. Preserve
every current owner/lineage/precondition check. Reject dynamic SQL, search-path
resolution, user-named objects and SQL-bearing declaration initializers in the
conversion audit. Existing effective writer bodies contain no dynamic EXECUTE.
Move any data-dependent initialization after entry. No renamed wrapper overloads.

The first executable command is `PERFORM saasscout_private.b43_enter();`, before
even the promotion duplicate fast path or source-discovery lookup. This also
covers hypothesis, experiment and subject parents; interview/survey publication
FOR SHARE; bootstrap's private advisory lock; and intelligence complete/fail's
initial reads and subject locks. Keep lower advisory order and existing checks.

Create `b43_00_entry` BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE FOR EACH
STATEMENT on every guarded table, executing the invoker private guard below.
The name sorts before existing same-event statement triggers; assert actual
`pg_trigger` ordering, enabled state and all event bits. Also put entry first in
`validation_b31_lock_registry_statement()` so registry ordering is explicit.
Statement guards protect nested/indirect writes, zero-row statements, COPY and
ON CONFLICT paths; they do not refresh the outer command's snapshot. Preserve
row checks and all AFTER capture functions.

The guard list includes **problem_evolution_snapshots and problem_feedback_events**:
their canonical FKs were missing from F4-B1's table list. Restrict their direct
writes; no current production caller was found, so no speculative writer is added.
Their existing SELECT behavior stays intact. Recursive FK closure must be checked
against pg_constraint, including system RI triggers and incoming dependencies.
Auth-account deletion/DDL/cascade maintenance is outside the application contract
and requires quiescence. FK locks on auth.users occur only after protected entry;
do not compose account administration and protected RPCs into one transaction.
Implicit relation locks precede statement triggers; live DDL is not certified.

## Private objects and execution privilege

Proposed additive objects (not implemented here):

```sql
-- All owned by postgres; schema not exposed through PostgREST.
saasscout_private
saasscout_private.b43_coordination(
  singleton boolean PRIMARY KEY CHECK (singleton),
  version bigint NOT NULL CHECK (version >= 0)
)
saasscout_private.b43_enter() RETURNS void
saasscout_private.b43_guard_statement() RETURNS trigger
```

Seed exactly `(true,0)` once. Never ON CONFLICT-repair a missing/changed singleton.
Both helpers are VOLATILE SECURITY INVOKER, with fixed pg_catalog,pg_temp path;
schema/table/function privileges are revoked from PUBLIC and all application
roles, and explicitly owned by postgres. Enable and FORCE RLS on the fence table
with no application policies; this relies on the already documented postgres
BYPASSRLS model, not a new grant. The invoker helpers work because audited entry
definers execute as postgres. Invoker application functions cannot enter: convert
each approved writer explicitly, never grant the helper to service_role instead.

`b43_enter` rejects non-postgres effective current_user (42501), accepts only read
committed/repeatable read (0A000 otherwise), physically executes
`UPDATE saasscout_private.b43_coordination SET version=version+1 WHERE singleton`,
and requires ROW_COUNT=1 (55000 otherwise). Arithmetic overflow fails closed.
Never swallow 40001/40P01. No no-op UPDATE, SELECT FOR UPDATE substitute, GUC,
advisory-only version, temporary marker or transaction-local entry cache.
Repeated entry updates are safe and intentionally allowed. The statement guard
checks current_user before calling entry and returns NULL. Never make that guard
SECURITY DEFINER: doing so would defeat its effective-role rejection.

Effective current_user=postgres is an internal trust check, not proof that a
specific RPC ran. Auditing every reachable definer and denying role/DDL escape
paths is necessary; the guard cannot replace that audit. No generic privileged
mutation surface is introduced.

## RC/RR and transaction composition

RC entry's UPDATE may wait. Authoritative reads must be later PL/pgSQL commands
in a VOLATILE writer, obtaining post-entry command snapshots. Do not combine
entry and reads in one SQL command/CTE. Recompute classification terminals, source
state, complete membership, canonical identity and authority after entry. Caller
arguments and earlier application reads are hints/preconditions; promotion must
compare representative/authority snapshots and recompute its identity/fingerprint
from post-entry source facts before writing. Arguments evaluated by the calling
SELECT, including STABLE helper calls, retain that outer statement's snapshot.
Never use those arguments to bypass revalidation. The STABLE current reader stays
unchanged, single-snapshot and denied to application roles.

RR retains its transaction snapshot. Entry's physical UPDATE encounters a write
conflict (40001) when another transaction committed a newer fence row after that
snapshot. Do not claim every RR entry aborts or use a snapshot-age heuristic.
Reject SERIALIZABLE pending separate tests; READ UNCOMMITTED is outside this
explicit support contract too. A fresh RR transaction may proceed normally.

Rollback the WHOLE transaction on 40001/40P01, begin again, acquire entry, reread
source/preparation and rebuild arguments/fingerprint. Savepoint retry is not
supported. Rollback to a savepoint can release fence changes/locks acquired after
it; no persistent entry flag may survive. A subsequent write must execute real
entry again; stale prepared inputs must still be rejected. PL/pgSQL exception
subtransactions must not catch concurrency errors and continue with old facts.
No RPC performs transaction control. Supported API clients cannot supply SQL
savepoints or concatenate RPCs; any future composition needs a separate review.

## Direct-DML clients and exact proposed replacements

The repository has three production direct-DML methods in this boundary. Scanning
lib/app also found SELECT-only canonical readers; bootstrap writes already use an
RPC. `lib/knowledge/dual-writer/index.ts` delegates to the observation method.
Test/fixture SQL and scripts are separate trusted tooling, not application clients.

| Existing method | Proposed public SQL signature, RETURNS jsonb unless specified | Compatibility behavior |
| --- | --- | --- |
| ValidationRepository.addSubjectLink(ownerId,subjectId,row) | validation_add_subject_link(p_owner_id uuid,p_subject_id uuid,p_source_type text,p_source_row_id text,p_source_version text,p_link_role text,p_context_snapshot jsonb) | Preserve method/API; return only id,subject_id,source_type,source_row_id,source_version,link_role,context_snapshot,created_at |
| ValidationRepository.createParticipant(ownerId,row) | validation_create_participant(p_owner_id uuid,p_experiment_id uuid,p_identity_mode text,p_pseudonymous_reference text,p_independence_key text,p_consent_mode text,p_consent_purpose text,p_consent_captured_at timestamptz) | Generate ID/status/timestamps in DB; return exactly current selected fields, omitting owner_id and independence_key |
| persistProblemObservations(client,observationInputs) | knowledge_insert_problem_observations(p_rows public.b43_market_observation_input[]) RETURNS TABLE(observation_fingerprint text) | Preserve exported method, validation, rows/observations/diagnostics and best-effort failure behavior; return inserted fingerprints only |

New typed RPCs are postgres-owned VOLATILE definers, entry-first, PUBLIC/anon/
authenticated/authenticator EXECUTE denied, service_role EXECUTE only. Existing
24 signatures/defaults and result shapes remain verbatim from the manifest.

Link RPC rechecks subject ownership and upstream source ownership with a fixed
CASE over discover/scan/weekly/saved_idea/opportunity and their current user_id
columns, not dynamic SQL. Keep current server prechecks and errors: missing or
foreign resources 404; duplicate/constraint failure generic 409 constraint_conflict.
Current ignoreDuplicates+single does **not** return an existing link on duplicate;
preserve that behavior by returning JSON null for DO NOTHING and retaining the
wrapper's generic 409. Do not silently improve it into successful idempotency.
The internal PostgREST PGRST116 envelope disappears with RPC; only the existing
public method/API error contract is preserved, not raw SDK equivalence.

Participant RPC rechecks experiment ownership, identity/consent constraints and
owner-independence uniqueness. Preserve lack of an idempotency key: repeated
independence-null submissions can create separate rows; do not invent retries.
Foreign/missing experiment remains 404; 23505/constraints map to existing generic
409 constraint_conflict. Never accept status, IDs, created_at or authority fields.

Create `public.b43_market_observation_input` as a named composite containing only
the 25 fields of `ProblemObservationRow` in `lib/knowledge/observation-store.ts:16`:
text scalars for observation_fingerprint,problem_title,normalized_problem_title,
problem_summary,source_table,source_row_id,source_url,source_type,source_evidence,
source_author_id,problem_cluster,evidence_quality; jsonb source_metrics,metadata;
text[] affected_niches; numeric pain_score,revenue_score,urgency_score,trend_score,
buying_signal_score,frequency_score,source_quality_score,opportunity_score,
confidence_score; timestamptz observed_at. The source type
is authoritative and offline tests verify this exact list. Do not use the full
table row type: it would admit canonical IDs, internal IDs and timestamps.
Grant only the type USAGE needed by service_role, no private-schema USAGE.
Use explicit-column INSERT, ON CONFLICT(observation_fingerprint) DO NOTHING,
no UPDATE and no attestation/authority/qualification writes. Keep existing B4.2
guards. This ordinary market ingestion does not qualify human evidence or gain
access to private source tables. SQL atomic batch failure remains an all-batch
persistence failure as with the current upsert. Composite-array PostgREST mapping
is a disposable compatibility check, not an assumed offline result.

## Additive migration sequence and assertions

Reserve `supabase/migrations/20261107000000_b43_executable_concurrency_contract.sql`
for B2.2; no migration file is added now. One BEGIN/COMMIT, no concurrent DDL:

1. Assert reviewed baseline catalog, creation principal, expected owners, role
   reachability, complete dependent FK/rule/trigger/definer closure and no extra
   overloads. Fail rather than taking ownership of unknown objects.
2. Create private schema/table/helpers, seed singleton, restrict ACL/RLS immediately.
3. Create named market input type and the three typed RPCs; revoke default PUBLIC
   EXECUTE/USAGE in the same transaction before any grant. Set owners explicitly.
4. Replace all 24 effective writer definitions and registry statement function;
   entry-first, definer audit, schema qualification, unchanged domain semantics.
5. Add b43_00_entry on all 27 tables; preserve existing 40 triggers. Assert firing
   order and enabled state; account for internal RI triggers separately.
6. Revoke effective direct mutation/row-lock authority and B3.1 helper access.
   Preserve SELECT/RLS, private denials and every existing writer EXECUTE boundary.
7. Assert singleton cardinality/version, owners, VOLATILE/security attributes,
   exact regprocedure signatures, ACL/column ACL/role graph, search paths, all
   guard event bits and expected dependency closure. Commit only if all pass.

Later rollout drains protected writers and coordinates client cutover; applying
permission reductions before adapters would break existing clients. Do not deploy
an intermediate state with old invokers and a private inaccessible helper.
Pre-commit errors roll back everything. Post-commit recovery uses a reviewed
forward migration, never automatic regrant of unsafe direct SQL. Retain singleton
and historical rows; monitor wait/hold time, retries, dead tuples and vacuum.

## Offline checks, later validation and decision

`python -m unittest discover -s tests -p test_validation_b43_f4_b21.py` verifies
source completeness, latest definitions/attributes, ACL declarations, parent-FK
closure, exact input fields and tamper negatives. These are source characterization
tests, not execution, SQL parser, privilege or concurrency proofs.

Local validation: 9 new offline tests and 27 related existing tests passed;
lint passed with four existing page warnings; webpack build and TypeScript
checking passed. No dependency changes or database execution were needed.

B2.2 must add executable acceptance coverage for RC waiters with stale outer
arguments; RR 40001 then genuinely fresh retry; early-return and SQL-initializer
ordering; all four direct locking SELECTs with column/inherited grants; direct
DML/COPY/ON CONFLICT/TRUNCATE denial; parent FK paths; indirect writes; attempted
helper/GUC/role escape; savepoint rollback; atomic failure; immutable proofs,
permanent restrictions, exactly-once capture and WITHHELD-only authority. Preserve
the classification-identity and retry harness repairs as a separate change.

Provisional future targets, approved for disposable measurement only: fence p95
overhead <=5ms; hold p95/p99 <=100/500ms; at 10 writers wait p95/p99 <=250ms/1s;
>=10 commits/s for 10 minutes; <1% timeouts/errors excluding injected stale RR;
zero observed deadlocks in supported schedules. Owner release approval and measured
workload/resources remain required. Finite schedules never prove universal freedom.

**GO for B2.2 local code/test preparation after human review of this document.**
There is no unresolved source-level blocker to preparing the additive change.
Actual catalog owners/default ACLs/role inheritance, unexpected dependents and
transport configuration are fail-closed validation gates, not facts established
here. If any gate fails, stop application and propose a narrow correction; do not
expand privileges or support arbitrary SQL to make tests pass. Existing direct
writers and any unreported external ones must adapt or accept explicit denial.
No production dependency change, historical backfill, guessed restriction,
positive authority, polarity change, AI qualification, reader activation or unsafe
fallback is authorized. Disposable execution, merge and production remain NO-GO.
