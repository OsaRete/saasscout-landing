# V8-B4.1 — Trusted qualified evidence read boundary

**B4.1-A implementation only. BLOCKED — DATABASE VERIFICATION REQUIRED.**
Do not merge or deploy until the independent B4.1-B disposable database gate
below passes. Mocked responses are not proof of PostgreSQL security.

## Architecture and scope

`lib/validation/promotion/trusted-qualified-evidence-reader.ts` is a dedicated
`server-only` repository using the existing `createSupabaseAdminClient` pattern.
`readTrustedQualifiedValidationEvidence(canonicalProblemId, db?)` issues one
SELECT for one exact persisted canonical UUID, with at most 100 final candidates,
ordered by `problem_observation_id`. The injected client is for trusted server
code/tests, never browser input. There are no callers, endpoints or integrations
in this phase.

The cap applies **before** application qualification. This is a bounded subset,
not an exhaustive export or count: invalid candidates can reduce the output,
and more than 100 candidates are truncated. Empty output means no qualified
evidence in that subset, not proof that no qualified evidence exists elsewhere.
Missing, malformed, incomplete or unsupported candidate proof is excluded.
Database errors, invalid response envelopes, oversized responses and duplicate
qualified result IDs fail the whole read with a fixed generic error. The reader
does not silently fall back to unjoined shared data.

No generated Supabase `Database`/`Relationships` types exist in this repository;
the existing `SupabaseAdminClient` is an unparameterized `SupabaseClient`.
Relationship and column definitions were inspected in the migrations rather
than inferred from an SDK type or a constraint name. SDK results are treated as
untrusted input and narrowed at runtime.

## Exact persisted proof

The query starts from private `public.validation_evidence_promotions` and uses
the explicit PostgREST embed:

```text
shared:problem_observations!validation_promotions_result_canonical_fk!inner(...)
```

The actual B3.1 migration defines that FK on
`(problem_observation_id, canonical_problem_id)` referencing
`problem_observations(id, canonical_problem_id)`, with `ON DELETE RESTRICT`.
The referenced pair has a unique constraint. An older single-column result FK
also exists; implicit relationship selection is deliberately avoided.
The TypeScript verifier independently requires exact equality of both IDs,
including the requested canonical UUID, even when mocked query filters or join
semantics are bypassed.

The ledger has **no promotion status column**. B3.1 finality is a non-null
`problem_observation_id` written atomically with the shared projection. The
supported final row must have:

- valid UUID `observation_id`, `classification_id`, `participant_id` and
  `problem_observation_id`;
- `eligible = true`, `eligibility_reasons = ['eligible']`, and
  `representative_selected = true`;
- `resolution_status = 'resolved'` and
  `resolution_reason = 'server_exact_authority_snapshot'`;
- `policy_version = 'v8-b1.2'`;
- `resolver_version = 'v8-b3.0.2-exact.1'`;
- `projection_version = 'v8-b3.1-projection.1'`;
- `independence_kind = 'participant'` and
  `independence_private_id = participant_id`;
- exact `representative_group_key` equal to
  `participant:<participant_id>|<canonical_problem_id>|<polarity>`;
- null `supersedes_promotion_id` and `deactivation_reason` (only the original
  B3.1 contract is supported; no correction workflow is introduced).

The shared row must have the same result ID, canonical ID and structured
polarity, fixed `source_type = 'customer_interview_human_reviewed'`, and exact
`metadata.projectionVersion = 'v8-b3.1-projection.1'`. It must have a nonempty
display title, a nonempty shareable statement of at most 500 Unicode code
points, and a finite, calendar-valid timestamp with an explicit zone.

The reader recomputes the promotion-service SHA-256 contract using sorted-key
JSON, with exactly these keys and their persisted values:

```text
canonicalProblemId, classificationId, observationId, polarity,
policyVersion, projectionVersion, resolverVersion
```

It requires `promotion_fingerprint` to equal that digest, and
`observation_fingerprint` to equal `validation-promotion:<digest>` exactly.
No fuzzy matching, classification, eligibility reevaluation, representative
ranking or canonical resolution occurs during the read.

`source_type`, a fingerprint prefix and projection metadata are descriptive
consistency checks, **not authorization**. A shared row with all those markers
but no valid final private ledger cannot qualify. The authority is the private
ledger produced by B3.1's atomic controlled promotion, including its persisted
eligibility, representative and exact resolver proof.

## Sanitized output allowlist

The exported readonly type and explicitly constructed output objects contain
only:

| Field | Authority |
| --- | --- |
| `id` | Exact linked shared observation ID |
| `canonical_problem_id` | Exact B3.1 persisted canonical ID |
| `problem_title` | B3.1 shared canonical display title at promotion |
| `source_evidence` | B3.1 shared approved shareable statement |
| `source_type` | Fixed qualified source family |
| `evidence_polarity` | Exact persisted structured polarity |
| `observed_at` | Shared timestamp projected from authoritative observation by B3.1 |
| `projection_version` | Verified B3.1 qualification/projection contract |

No `SELECT *`, row spread, private ledger ID, owner, participant, session,
experiment, hypothesis, classification, private source observation, command,
private notes, raw text, review metadata or AI drafts enter the output.
Private source/classification/participant IDs are selected only to verify the
contract and never returned. Metadata is inspected internally and never copied
to output. The module has no logger or telemetry; DB error messages and thrown
causes are discarded. Callers must not instrument DB transport with payload
logging that could capture the internal qualification projection.

## Canonical, polarity and independence behavior

`canonical_problems.status` is mutable (`candidate`, `active`, `merged`,
`deprecated`, `archived`). B3.1 required an active registry entry at promotion.
This reader preserves that exact persisted identity and display title without
looking up a replacement or asserting the registry remains active today.
The policy for subsequent archival, merging or deprecation remains unresolved
for downstream consumption. No title, context, respondent prose, embedding,
AI output or alias is used to infer or reassign identity. No canonical records
are created.

Supporting, contradicting and mixed remain distinct. Neutral, inconclusive,
legacy and null-polarity records are excluded. No weights, quality scores or
confidence scores are added. Representative selection establishes only the
persisted participant/group contract within B3.1. It does not prove distinct
real humans across participants, tenants, canonical IDs or polarity groups.
Returned row count must never be interpreted as an independent-human count.
No participant identity is copied downstream.

## Privileges and trusted writers

Source review found RLS enabled and all ledger privileges revoked from
`PUBLIC`, `anon` and `authenticated` in the B1 foundation migration, with
existing grants to `service_role`. The ledger has an append-only trigger.
The Knowledge Evolution schema grants shared observation reads/writes to
`service_role`; browser roles cannot use this module to read the private
ledger. Existing shared-row SELECT exposure is unchanged and does not imply
qualification. No grants, policies, views, functions, RPCs or routes are added.

B3.1 atomically projects `share.statement`, `o.observed_at` and canonical titles
with the final ledger. The reader relies on that existing controlled-writer
contract; it does not reread private interview or review records. The promotion
fingerprint binds qualification identity and versions, **not** statement text,
display title or observed timestamp. The shared table is not made immutable by
this phase. Trusted service-role writers must preserve those projected fields;
the reader cannot detect their arbitrary replacement on an already linked row.
This is a trusted-writer boundary, not content attestation or a PII classifier.

Other service-role writers and database administrators are trusted. A writer
able to arbitrarily mutate both shared and private authority tables can forge
the proof; SHA-256 provides deterministic integrity identity, not a signature
or cryptographic provenance. Existing append-only/FK/unique constraints help
normal workflows but do not authenticate arbitrary privileged insertions.
Future withdrawal/supersession semantics are not defined by B3.1: this reader
verifies original final linkage, not current classification eligibility or an
unimplemented correction chain. Such workflows need their own reviewed contract.

## Non-goals and deployment

No Knowledge Evolution repository/classifier, scoring, lifecycle, legacy
adapter, Weekly Intelligence, Discovery, opportunity, recommendation, snapshot,
UI or background job is changed. No automatic promotion, canonical creation,
backfill, history rewrite or writes of any kind occur. No migration is required
or supplied. No production credentials are needed for B4.1-A.
The existing B1/B3.1 migrations must already be applied in an eventual deployment;
this phase neither executes them nor deploys the reader. There is no new runtime
consumer to enable. Merge and deployment remain prohibited pending B4.1-B.

## Tests and mandatory B4.1-B gate

Focused tests use the actual Supabase SDK with an injected mock fetch transport.
They exercise output construction, query encoding, the candidate cap, exact
qualification checks, source impersonation, fingerprint/metadata impersonation,
unsupported versions, malformed/nonfinal proof, privacy, generic errors,
distinct polarity, legacy exclusion, empty results, duplicate-response rejection
and SELECT-only operation. A browser-condition import executes the existing
`server-only` guard. These tests do not execute PostgreSQL or prove its grants.

Before merge, independently run the real migration chain and boundary against
a disposable PostgreSQL/Supabase instance, including PostgREST. Record:

1. Explicit composite-FK embedding resolves correctly despite the older result
   FK, returns one shared object per ledger, matches both columns, and observes
   the atomic committed B3.1 projection/ledger state.
2. A valid controlled B3.1 promotion is returned in all three polarities;
   shared source/prefix/metadata impersonation without final linkage is excluded.
3. The actual server-role SELECT permissions succeed; `anon`/`authenticated`
   cannot read the private ledger or obtain the privileged join. Inspect grants,
   RLS, existing RPC EXECUTE grants, ownership and actual PostgREST exposure.
4. Nonfinal and unsupported ledger data is excluded; FK/eligibility/representative
   constraints reject invalid inserts where applicable. Fingerprint and result
   uniqueness, source/group uniqueness, append-only behavior and duplicate
   promotion idempotency remain intact.
5. The real SDK response shape, timestamp serialization, limits, projection and
   relationship errors match the runtime narrowing contract. Check actual
   responses/errors for private lineage leaks through the reader.

No live database verification was performed in B4.1-A. The original environment
had no disposable database URL or PostgreSQL tools and denied Docker socket
access. Database security is therefore **unverified**, and this implementation
is not merge-ready.

### B4.1-A validation record

- `node --test tests/trusted-qualified-evidence-reader.test.ts`: exit 0,
  one passing file-level result. Running with `--test-isolation=none` exposed
  all 53 focused tests: 53 passed, 0 failed/skipped.
- `npm test`: exit 0, 104 passing file-level results, 0 failed/skipped as
  reported by the outer runner. This is not a live database verification result.
- `npm run lint`: exit 0, 0 errors, 4 existing warnings in
  `app/discover/page.tsx`, `app/saved/page.tsx` and `app/scans/page.tsx`.
- `npm run build`: exit 1; Turbopack failed to bind a local port while evaluating
  `app/globals.css` (`Operation not permitted` in the sandbox).
- `npm run build -- --webpack`: exit 0; compilation, Next TypeScript checking,
  static page generation and build tracing completed. No build configuration
  changed to obtain this fallback result.
- Additional `npx tsc --noEmit`: exit 2; existing diagnostics in unrelated test
  files (including duplicate fixture keys and ES2017 regex-target diagnostics).
  No diagnostics named the new reader or focused test. Those unrelated files
  were not modified.
- `git diff --check`: exit 0.

The default Turbopack build remains blocked by the sandbox; the successful
Webpack fallback does not claim that default invocation passed. No database,
production or migration commands were run.
