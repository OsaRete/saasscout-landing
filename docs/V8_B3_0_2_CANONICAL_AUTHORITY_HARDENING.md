# V8-B3.0.2 — Canonical Authority Hardening

## Decision and boundary

Validation subject context is context, not canonical authority. Resolver
`v8-b3.0.2-exact.1` never reads `validation_subjects.context_snapshot`, including
`canonical_problem_id` and `canonicalProblemId`. Historical JSON remains stored
and readable through the Validation workspace; no row is rewritten. This change
adds no migration, canonical mapping, mutation command, promotion, model call,
embedding, or external API call. B3.1 promotion remains unimplemented.

## Subject creation authority trace

The browser posts `creationOrigin`, `label`, `contextSnapshot`, and, for a sourced
subject, `provenance.sourceType`, `sourceRowId`, optional `sourceVersion`, and
`provenance.contextSnapshot` to `POST /api/validation/subjects`. Authentication
runs before the admin-backed `ValidationService` receives the authenticated owner.
The service validates the origin, label, object shape, and 32 KB JSON bound.
`rejectAuthorityFields` rejects server-owned fields at the command root, but
nested context is not allowlisted. The repository verifies an owned upstream row
for sourced subjects, then calls the service-role-only `validation_create_subject`
RPC. The RPC derives no canonical identity: it persists the supplied subject and
link context JSON unchanged in `validation_subjects` and
`validation_subject_links`.

The shipped UI currently constructs only `label` and optional `description` in
both context objects. That UI shape is not a security boundary: a stale or
malicious client can send either canonical-looking key. Ownership verification
of an upstream reference proves access to the referenced row, not the truth of
browser-supplied nested JSON.

## Producer and provenance audit

| Producer                      | Persisted destination                         | Authority classification                                | Finding                                                                                                   |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| New Validation page           | subject/link context                          | Browser-controlled / untrusted                          | Current UI emits label/description only, but the API accepts other bounded JSON keys.                     |
| Subject creation API clients  | subject/link context                          | Browser-controlled / untrusted                          | Both canonical key spellings can enter nested JSON.                                                       |
| Subject-link API clients      | link context                                  | Browser-controlled / untrusted                          | Owned source verification does not verify supplied context. B2 does not consume link context.             |
| Validation design assistant   | reads subject context description             | Historical/unknown as stored context                    | It does not produce or consume canonical IDs.                                                             |
| B2 adapter before this repair | read subject context canonical keys           | Server-derived/unverified interpretation                | The adapter elevated untrusted stored JSON to purported provenance; it was not an authoritative producer. |
| Canonical bootstrap           | canonical registry/alias/observation mappings | Trusted for its separately controlled registry boundary | It creates no Validation subject mapping and never places canonical IDs in subject context.               |

Repository-wide inspection found no trusted producer of a subject-context
canonical ID and no independently verifiable subject-to-canonical provenance
mapping. Creating a new table would therefore preserve no authoritative workflow.

## Repaired resolution contract

Only active Canonical Registry rows participate. Subject label and hypothesis
problem claim are the only identity signals; respondent prose, observation
content, interview notes, shareable evidence, AI output, context JSON, IDs in
context, embeddings, similarity, and fuzzy matching are excluded.

For every non-blank identity signal, the resolver normalizes with the shared
Knowledge normalizer and forms the union of exact normalized canonical-title and
exact normalized alias matches. Resolution then proceeds in this order:

1. no non-blank identity signal: `insufficient_identity`;
2. more than one candidate for either signal: `ambiguous`;
3. subject and hypothesis resolve to different candidates: `ambiguous` with
   `canonical_identity_conflict`;
4. one candidate remains (or both agree): `resolved`; subject label is the
   diagnostic source when both agree, otherwise the matching signal is used;
5. no candidate: `unmatched`.

A canonical-title/alias collision is ambiguous rather than silently preferring a
title. An unmatched secondary text does not override a single exact match because
it supplies no competing canonical candidate. Inactive entries never resolve.
These pure resolver semantics are the single contract used by B2 preparation and
available for future B3.1 authoritative re-evaluation.

## Versioning and B2

The eligibility policy remains `v8-b1.2`: eligibility semantics did not change.
The resolver changes from `v8-b1-exact.1` to `v8-b3.0.2-exact.1`. B2's read
projection no longer selects subject context, so unsafe values cannot reach its
resolution input. The semantic report includes the new resolver version; because
that version is included in the deterministic hash input, repaired reports cannot
appear equivalent to old reports. Resolution counts, representatives, and hashes
may legitimately change.

## Future subject creation and compatibility

Subject creation continues to accept bounded benign context and does not strip or
reject historical key shapes. This is the smallest backward-compatible choice:
canonical-looking keys have no authority at the server resolver boundary even if
a malicious or stale client submits them. Client filtering is therefore neither
required nor relied upon. The Validation workspace retains its existing context
read contract, and preparation does not mutate caller-owned rows.

## Production and Data Moat safety

No database migration or production action is required. The repair has no write
method and performs no write to `problem_observations`,
`validation_evidence_promotions`, `canonical_problems`, `problem_aliases`,
`canonical_bootstrap_activations`, intelligence/evolution data, opportunities,
recommendations, or Weekly Intelligence. Historical subjects are not backfilled,
cleaned, or reinterpreted as trusted provenance.
