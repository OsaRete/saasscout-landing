# V8-B3.0 — Shareable Customer Interview Evidence Contract

## Decision and boundary

B3.0 adds a private Validation-side child record rather than extending arbitrary
`observation_content`, adding a mutable observation column, or writing shared
Data Moat rows. The child is the smallest contract that keeps raw evidence
immutable while binding human review to one exact, bounded statement and its
source observation. B3.0 does not write `problem_observations`,
`validation_evidence_promotions`, canonical registry, intelligence, evolution,
opportunity, recommendation, or Weekly Intelligence data.

## Audited existing flow

`InterviewObservationForm` previously held category, `statementKind`, content,
and optional polarity state. It POSTed an observation, then optionally POSTed a
classification. Content was required and limited to 4,000 characters. There was
no private/shareable distinction, observation editing, or replacement command.
The workspace displayed observation counts and non-sensitive lineage, not saved
observation prose. Errors from the outer workspace were bounded, while the
observation form itself did not previously surface its own command errors.

`POST /api/validation/interview-observations` authenticates before constructing
the admin-backed service. The owner is the authenticated user, not request data.
The service allowlists category and statement kind, constructs the three-key
`observation_content`, and calls a narrow repository method. The database then
rereads an owned interview session and derives subject, hypothesis, experiment,
participant, session, origin, modality, source type, collector, and timestamps.
The browser cannot select those fields, canonical identity, or promotion state.

The effective schema uses owner-scoped composite foreign keys throughout
subjects, hypothesis/experiment versions, participants, sessions, observations,
and classifications. Observations and classifications have update/delete
rejection triggers. Interview plans are immutable; sessions permit only guarded
lifecycle and notes updates before terminal state. RLS protects all Validation
tables. Browser access is read-only and owner-scoped where granted; trusted
commands use service-role-only, invoker-security RPCs with fixed `public`
`search_path`.

## Existing private content contract

The authoritative Customer Interview creation shape remains:

```ts
{
  category: InterviewObservationCategory;
  statementKind: "summary" | "direct_quote";
  content: string; // human prose, 1–4,000 characters
}
```

This object remains private evidence. Neither `summary` nor `direct_quote`
implies that `content` is appropriate to share. Historical rows receive no new
meaning and no backfill.

## `CustomerInterviewShareableEvidenceV1`

The optional browser intent is:

```ts
type CustomerInterviewShareableEvidenceV1 = {
  statement: string;
  reviewedForSharedEvidenceUse: true;
};
```

The persisted record is server/database controlled:

| Field | Contract |
| --- | --- |
| `id` | Database UUID; required; immutable. |
| `owner_id` | Authenticated owner derived by the server; required; private; immutable. |
| `source_observation_id` | Exact private observation; required; owner-scoped FK; one record per source; immutable. |
| `statement` | Trimmed human-authored/reviewed text; required when the optional record is requested; 1–500 characters; immutable. |
| `statement_sha256` | Database-derived lowercase SHA-256 of the exact stored UTF-8 statement; required; 64 hex characters; immutable. It binds review to content, but is not a privacy detector. |
| `contract_version` | Fixed `customer_interview_shareable_evidence_v1`; required; immutable. |
| `review_confirmation` | Fixed `human_reviewed_for_shared_evidence_use`, persisted only after explicit `true` intent; required; immutable. |
| `reviewed_at`, `created_at` | Database timestamps; required; immutable. |

Five hundred characters is intentionally much smaller than private evidence's
4,000-character bound: it is enough for a useful problem observation while
discouraging transcript, narrative, and excess contextual disclosure. No
participant/session IDs, notes, classification rationale, arbitrary metadata,
or duplicated experiment lineage are columns in the record. Authoritative
lineage remains reachable through the source observation.

## Review, privacy, and history

The UI makes the field optional and resets confirmation whenever its text
changes. The server rejects a supplied statement without literal positive review.
The database accepts statement and review together in the same transaction that
creates the immutable source observation, derives the fingerprint itself, and
rejects a retry whose shareable portion is added, removed, or changed. Exact
retries reuse exactly the previously accepted private-only or private-plus-shareable
result. A stored record cannot be updated or deleted. V1 deliberately does not support corrections or supersession; a
changed statement cannot reuse approval. Adding reviewed representations to
historical observations, or adding append-only supersession, requires a later
bounded authority path and is not inferred or backfilled here.

The response preserves the original observation command's `duplicate` meaning:
`false` only for the insert winner and `true` for an exact replay. The additive
`shareableEvidenceCreated` field is `true` only when that same command newly
created the child record; it is `false` on exact replay. Current UI code requires
only successful observation identity and does not branch on either diagnostic.

## V1 to V2 authority parity

V2 retains V1 owner/session authorization, session lifecycle, required
participant join, complete derived lineage, observed time, fixed origin,
modality, source type/reference, collector, content and ingestion idempotency,
participant independence fields, invoker-security model, grants, error codes,
and observation response shape. Like V1, it does not independently require a
currently active participant or an experiment lifecycle during evidence capture;
the owned session and its preserved lineage remain authoritative. V2 has only
three intentional differences: it explicitly fails closed unless the derived
experiment family is `customer_interview`, atomically accepts the optional V1
shareable contract, and adds `shareableEvidenceCreated` while keeping truthful
V1 `duplicate` semantics.

Users are instructed to exclude names, company names, contact details, personal
addresses, private URLs, participant/session/authentication identifiers,
secrets/tokens, pseudonymous references, and uniquely identifying private
details. The implementation makes no “PII-free” or legal-compliance claim. It
uses no regex or AI detector: those cannot prove prose safe. Human review is the
meaningful gate; the structural allowlist and concise bound reduce exposure.

## Compatibility fixes

The B1 audit was correct: eligibility received but did not require
`experimentFamily`. Policy `v8-b1.2` now requires the repository's existing
`customer_interview` family in addition to origin, modality, source type, and
session lineage. Other families fail closed with
`unsupported_experiment_family`. This intentionally changes B2 semantic report
hashes wherever previously misclassified non-interview rows are present; old
dry-run hashes remain review artifacts, not authority.

The B2 audit was also correct: creation persists canonical camel-case
`statementKind`, but adaptation read only legacy snake-case `statement_kind`.
The adapter now reads camel-case first and falls back to snake-case for historical
compatibility. New creation continues to write only `statementKind`. No rows are
rewritten, and direct quotes again receive the intended deterministic
representative-selection preference.

## Deferred work

B3.1 promotion, promotion-ledger evaluation, Data Moat projection/fingerprints,
canonical resolution during writes, shared independence tokens, surveys,
behavioral evidence, V9, intelligence aggregation, and automatic/background
promotion remain deferred. The migration must be reviewed and applied through
the normal controlled deployment process before the new UI command is released;
it was not applied to production during B3.0.
