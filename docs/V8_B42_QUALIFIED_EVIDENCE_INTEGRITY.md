# V8-B4.2-B1 — Qualified human evidence integrity

Status: implementation prepared; **NO-GO for merge/deployment until disposable
PostgreSQL/PostgREST verification and security review pass**. No migration was
executed against production or staging.

## Verified baseline

Repository: OsaRete/saasscout-landing. Initial local branch: `work`. Initial HEAD:
`fe5f4fd5b8e15d7be88500068eb9618e2c07ed24`. The initial working tree was clean.
Implementation branch: `codex/b42-b1-integrity`, created explicitly from that SHA.

The baseline reader blob was `8881ec87770147bad4db65dbecc69733dd527cb0`;
the B3.1 migration blob was `401d034eed08cede4cb0103c55796a42b1aab94a`.
Both working files matched their baseline Git objects before modification.
The B3.1 migration remains unchanged. Shell `git ls-remote` failed to connect
to proxy port 8080; fresh GitHub connector inspection resolved `main` to the
required SHA. That connector result does not establish shell Git connectivity.

## Narrow database boundary

`20261008000000_qualified_evidence_integrity.sql` adds the private, RLS-enabled
`validation_qualified_evidence_snapshots` table. Its immutable payload contains
only the approved shared projection, qualification fingerprint, version, and
private linkage IDs. It stores no raw interview text, review notes, AI drafts,
owner, participant, session, or classification data.

A composite foreign key binds the snapshot to the final ledger's ID, shared
result ID, canonical ID, promotion fingerprint and projection version. Another
composite FK binds the shared result/canonical pair. Exact FK-column uniqueness
supports an explicit one-to-one PostgREST reverse embed.

The existing postgres-owned SECURITY DEFINER promotion RPC receives one final
snapshot INSERT after its shared and ledger INSERTs. All three writes occur in
one transaction. A snapshot constraint/permission/trigger failure rolls back
all three. Both duplicate exits remain before snapshot creation. The complete
old RPC body, minus only the added INSERT block, is checked against the baseline
by `tests/qualified-evidence-integrity.test.ts`.

B3.1 eligibility, TypeScript exact resolution and representative selection,
policy/resolver/projection versions, fingerprint serialization, freshness proof,
and canonical -> sorted experiments -> participant -> representative-group lock
order are unchanged. A new shared row is invisible to competing writers until
the transaction also commits its snapshot. Exact concurrent retries serialize
on the existing locks/uniqueness and return the same result without a new snapshot.
No separate snapshot locking or caller-settable GUC authorization is introduced.

Runtime PUBLIC/anon/authenticated roles have no private table access. The
service role has SELECT only on ledger and snapshots; direct INSERT, UPDATE,
DELETE, TRUNCATE, REFERENCES and TRIGGER privileges are revoked. Only the
existing controlled RPC retains service EXECUTE and performs private writes as
its postgres owner. New guard EXECUTE is revoked from all runtime roles.

A postgres-owned SECURITY DEFINER row trigger checks private snapshot existence
before UPDATE/DELETE of a shared observation. It rejects any change to an
attested row with fixed SQLSTATE 55000, including canonical reassignment.
All existing shared-table grants remain unchanged. Its inbound ledger/snapshot
FKs prohibit TRUNCATE without CASCADE, and CASCADE requires TRUNCATE on the private
tables, which runtime roles do not have. No blanket shared privilege restriction
or shared INSERT restriction is added.
A source/prefix/metadata-only impersonation still cannot create private authority.

Administrators and migration owners remain trusted and can disable controls.
Snapshots are an immutable relational attestation, not a digital signature.
Other postgres-owned functions must not become arbitrary SQL/private-table
write gateways. No generic private writer or new promotion RPC is introduced.

## Read contract and history

The reader keeps its existing private ledger qualification and fingerprint
verification. It explicitly embeds the snapshot without an inner filter, so
unattested historical rows remain visible to exact candidate counting. Every
snapshot linkage/version and projected content field must match the ledger and
shared observation. Missing, malformed, unsupported or mismatched snapshots are
excluded without a shared-content fallback. The same eight output fields are
explicitly constructed/frozen; private IDs, metadata and snapshot internals never
leave the reader. Timestamps must match exact PostgREST serialization, including
microseconds; no lossy Date equality is used for snapshot verification.

The existing 100-candidate cap remains. Missing/inconsistent counts, server
truncation or any count exceeding the returned candidate length cause the same
generic read failure, with no partial evidence returned. Successful reads retain
`{ observations, complete: true }`; incomplete reads now throw. There are no
runtime callers or Knowledge Evolution consumers to migrate in this repository.

No historical rows are copied, changed, deleted or automatically attested.
Historical exact retries remain duplicate successes and create no snapshot.
Unattested historical human evidence is retained but excluded from this stricter
trusted reader. Historical shared rows retain their previous mutation behavior;
this phase supplies no integrity guarantee for them. Historical candidates can
still exhaust the cap and cause a generic incomplete-read failure.

## Disposable verification

`scripts/validation-b42-db.ts` accepts only explicit disposable opt-in and fixed
loopback Supabase CLI-discovered endpoints/credentials. It requires a fresh
reset and fails rather than skips when prerequisites are absent. It reuses the
B3.1 relational fixture, exercises the actual SDK, PostgREST, TypeScript promotion
service and SQL constraints. Synthetic invalid ledgers are inserted only by the
fixed disposable administrator; service attempts are separately required to fail.
The existing B4.1 command is retained as an alias to the upgraded suite because
its former mutable-content/incomplete-read expectations are superseded.

Coverage includes all three polarities and the exact output allowlist; browser
role reads; RLS/grants/owner/search_path; direct ledger/snapshot fabrication;
private mutation/truncation; scoped shared mutation rejection; actual Discovery
persistence/retries and canonical bootstrap/retries; injected snapshot-failure
rollback after the earlier writes; concurrent HTTP promotions/retries; concurrent
runtime UPDATE/DELETE with a retry; genuine historical B3.1 promotion followed by
restored B4.2 retries without attestation; administrator-only tamper simulation
followed by real reader exclusion; exact PostgREST cap failure. Test helper
functions are removed and the public RPC catalog is checked at completion.

The existing database workflow still resets a disposable local Supabase and
executes the unchanged B3.1 eight-scenario concurrency suite. It resets again
and executes B4.2 as a mandatory separate step. No production credentials or
URL overrides are accepted by the new runner.

## Actual local execution

- Focused reader/B3.1/bootstrap/Discovery checks: 130 passed, 0 failed/skipped.
- Complete B3.1 RPC preservation check: 1 passed, 0 failed/skipped.
- Final reader/integrity/observation-store regression run: 82 passed, 0 failed/skipped.
- `npm test`: 105 passing file-level results, 0 failed/skipped reported by the
  outer runner. This is not proof that live database tests ran.
- `npm run lint`: passed, 0 errors and 4 pre-existing warnings in Discover,
  Saved and Scans pages.
- Targeted strict TypeScript check using ESNext/bundler resolution: passed.
  An initial NodeNext invocation failed on module-mode/top-level-await diagnostics;
  the repository's bundler-compatible module mode corrected that invocation.
- `npm run build`: failed because Turbopack cannot bind a sandbox port while
  processing `app/globals.css` (Operation not permitted).
- `npm run build -- --webpack`: passed compilation, TypeScript and page generation.
- `git diff --check`: passed.
- Explicit `VALIDATION_B42_DISPOSABLE=1 npm run test:validation-b42-db`: exit 1
  at disposable prerequisites. **Database verification did not pass.**
- Explicit mandatory B3.1 DB invocation: exit 1 because the disposable URL is
  unavailable. No silent skip and no connection to an unverified database.
- Managed local Docker socket access: denied with Operation not permitted.
  Task UID is 1000; `psql` is absent. No environment recovery or remote database
  substitution was attempted.

## Remaining gate

Real PostgreSQL execution of the new migration, reverse-embed cardinality,
transaction rollback, runtime grants and concurrency behavior remains unverified
locally. The checked-in disposable suite must pass on the exact implementation
commit before GO. Security review must assess the postgres-owned writer boundary,
historical exclusion and incomplete-read behavior. Default Turbopack is still
blocked locally; the Webpack result does not claim that default build passed.

No production/staging writes, `supabase db push`, historical backfill, automatic
merge, correction/withdrawal workflow, canonical reassignment workflow, legacy
Knowledge Evolution changes or consumers are included.
