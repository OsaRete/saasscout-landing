# V8-B3.1 — Controlled Customer Interview Promotion Review

## Decision

**BLOCKED — PREREQUISITE REQUIRED.** No promotion mutation was implemented.

The B3.0/B3.0.1 shareable-evidence work removes the former textual privacy
blocker: an immutable, human-reviewed statement can now be read without using
raw `observation_content`. The mandatory B3.1 inspection nevertheless found a
different authority blocker in canonical resolution.

The read-only B2 adapter treats `validation_subjects.context_snapshot` keys
`canonical_problem_id` / `canonicalProblemId` as an explicit provenance
canonical ID. The resolver gives that value precedence over exact subject-title
and hypothesis-claim matching whenever it names an active canonical problem.
However, the subject creation API accepts `contextSnapshot` as bounded arbitrary
browser JSON. The service does not derive or validate a nested canonical ID,
and `validation_create_subject` persists that JSON unchanged. A browser can
therefore select any active canonical problem and make B2 report
`provenance_id_match`.

B3.1 cannot reuse this resolution as write authority without violating the
requirements that browser intent is not authority and that incorrect canonical
assignment must fail closed. Silently ignoring the value only in the write RPC
would also violate the requirement to rerun the existing resolver and would
make B2 preparation disagree with mutation-time authority. The repository does
not currently contain a trusted, server-derived subject-to-canonical mapping
that can disambiguate this value or prove conflicts safely.

## Inspected effective contracts

### `problem_observations`

The table is service-role-only under RLS. It requires a globally unique textual
`observation_fingerprint`, `problem_title`, and `normalized_problem_title`.
Canonical identity is a nullable FK with `ON DELETE SET NULL`. Evidence and
provenance text fields, metrics, niches, scores, evidence quality, timestamps,
and metadata are otherwise nullable or have neutral empty defaults. It has no
polarity column. The table comment says append-only, but no rejection trigger
enforces that statement; controlled canonical bootstrap is an existing update
writer.

The generic application writer builds fingerprints from title, observation
time, source fields, and evidence prose, then uses conflict-ignoring upsert. It
is intended for public/external observations and is not safe for private
Validation promotion because its fingerprint includes prose/time and it cannot
atomically insert the private ledger row.

### `validation_evidence_promotions`

The service-role-only, RLS-enabled ledger is append-only. Owner-scoped composite
FKs bind observation, classification, experiment/hypothesis/subject lineage,
participant, and interview session. Checks require promotable polarity for an
eligible row and a selected, resolved representative before a result may be
referenced. Idempotency is unique by owner, observation, classification, and
policy version with nulls not distinct; roots and successors are also bounded.

The current schema can reference a final `problem_observation_id`, but it does
not prove that the referenced observation has the same canonical problem as the
ledger row, nor is the result reference unique. Because updates are rejected,
a final B3.1 row must be inserted in its final state in the same transaction as
the shared observation. An additive migration would be required for stronger
final-edge constraints and first-class shared polarity.

### Shareable Customer Interview evidence

`validation_customer_interview_shareable_evidence` is private,
service-role-only, RLS-enabled, and append-only. Its owner-scoped source FK binds
one immutable record to one observation. The trimmed statement is 1–500
characters. `statement_sha256` is database-derived with
`extensions.digest`; fixed contract and review values are
`customer_interview_shareable_evidence_v1` and
`human_reviewed_for_shared_evidence_use`. The source-observation RPC creates the
observation and optional reviewed statement atomically and treats any changed
shareable payload on retry as an idempotency conflict. Historical observations
are not backfilled and V1 has no correction/supersession path.

This contract is sufficient to obtain the exact approved statement without
copying raw observation prose. It does not resolve the canonical-authority
blocker.

### Customer Interview and classification authority

The authoritative lineage is observation → session → participant → experiment
version/experiment → hypothesis version/hypothesis → subject → owner.
Observation creation and B1 eligibility explicitly require the
`customer_interview` family. B1 also requires human-interview origin,
interview-observation modality, customer-interview source type, an active
participant, eligible session/experiment lifecycle, target relevance, useful
content, and exactly one terminal non-AI authoritative classification.
Supporting, contradicting, and mixed are promotable; neutral and inconclusive
are deferred. Multiple terminal authoritative roots fail closed.

### Representative selection

B2 groups by private participant, canonical problem, and polarity. It ranks by
specificity, target relevance, direct quote over summary, content length,
observed time, and observation ID. Camel-case `statementKind` with legacy
`statement_kind` fallback is implemented. A write path would have to lock/read
the relevant participant/canonical/polarity candidate set and recompute this
selection; a report hash or browser flag cannot authorize promotion.

## Stop-condition evaluation

The exact approved statement, human review, Customer Interview family,
classification authority, polarity, representative algorithm, atomic RPC
capability, deterministic fingerprint inputs, private participant lineage, and
append-only ledger are all structurally available or can be strengthened with
additive changes.

Stop condition 7 is met: canonical identity cannot currently be resolved for a
write using the existing safe deterministic rules because the resolver's
highest-precedence purported provenance ID is browser-controlled. This also
implicates stop conditions 13 and 18: committing a ledger/result pair against
that choice could preserve internal equality while still binding evidence to
the wrong canonical problem and weakening the browser-authority guarantee.

## Smallest prerequisite PR

Create and review a narrowly scoped canonical-authority repair before B3.1:

1. Define a trusted, server-derived canonical provenance source, or remove
   arbitrary subject `context_snapshot` canonical IDs from resolution authority.
2. Version the resolver and B1/B2 policy if semantics change.
3. Specify conflict behavior between trusted provenance, subject label, and
   hypothesis claim; conflicts must defer rather than silently choose an
   untrusted value.
4. Prevent future subject commands from claiming canonical authority inside
   arbitrary nested JSON, while preserving historical JSON without rewriting
   it.
5. Add tests proving browser JSON cannot select canonical identity, conflicting
   identities defer, inactive IDs defer, and B2/write-time resolution can share
   one authoritative contract.
6. Re-run and review B2 dry-run output after the versioned repair.

After that prerequisite, B3.1 can add a nullable constrained shared polarity,
an allowlisted `CustomerInterviewPromotionProjectionV1`, a domain-separated
fingerprint over immutable IDs (not prose, participant, or time), and one
service-role-only transactional RPC that revalidates and locks authoritative
state before atomically inserting/reusing the observation and inserting the
final ledger row.

## Production safety and deferred scope

No migration, RPC, route, UI action, or Data Moat writer was added. No
production data was read or mutated, no remote SQL was executed, and
`supabase db push` was not run. Surveys, behavioral evidence, social evidence,
automatic promotion, downstream Problem Intelligence aggregation, and
Knowledge Evolution/V9 remain deferred.
