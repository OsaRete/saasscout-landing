# V8-B3 — Controlled Interview Promotion Contract Review

## Decision

**Status: blocked before persistence by the mandatory privacy stop condition.**

This review was performed at repository HEAD
`90cccd537b5e9b66feb7394d8ab0df120d399d58`. No V8-B3 migration, RPC,
mutation repository, apply command, or production write was created.

The current Customer Interview creation path persists exactly this bounded JSON
shape in `validation_evidence_observations.observation_content`:

```ts
{
  category: InterviewObservationCategory;
  statementKind: "summary" | "direct_quote";
  content: string; // 1–4000 characters of interviewer-entered human prose
}
```

`category` and `statementKind` are safe structural descriptors, but neither is a
useful problem statement. `content` is the only evidence-bearing statement and
is deliberately free text. For a summary it is written by the interviewer; for
a direct quote it may be verbatim participant speech. The contract neither
separates a shareable problem statement nor proves that the text excludes names,
emails, phone numbers, URLs, company names, participant references, private
notes, or other identifying details.

Consequently, a useful `problem_observations` projection would have to copy
arbitrary private prose, while a projection that excludes `content` would not
contain the evidence it claims to promote. Blind redaction, AI paraphrasing, and
substitution of the hypothesis claim would each violate the B3 boundary. The
write implementation therefore stops here rather than inventing a projection.

## Effective `problem_observations` contract

The effective table is the additive Knowledge Evolution evidence ledger. It is
RLS-enabled and service-role-only. Its columns are:

| Column                                                                                                                                                                   | Effective type / behavior                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `id`                                                                                                                                                                     | `uuid`, primary key, `gen_random_uuid()`                              |
| `canonical_problem_id`                                                                                                                                                   | nullable `uuid`, FK to `canonical_problems(id)`, `ON DELETE SET NULL` |
| `observation_fingerprint`                                                                                                                                                | required `text`, globally unique                                      |
| `problem_title`                                                                                                                                                          | required `text`                                                       |
| `normalized_problem_title`                                                                                                                                               | required `text`                                                       |
| `problem_summary`                                                                                                                                                        | nullable `text`                                                       |
| `source_table`, `source_row_id`, `source_url`, `source_type`, `source_evidence`, `source_author_id`                                                                      | nullable `text` provenance/evidence fields                            |
| `source_metrics`                                                                                                                                                         | required `jsonb`, default `{}`                                        |
| `affected_niches`                                                                                                                                                        | required `text[]`, default `{}`                                       |
| `problem_cluster`                                                                                                                                                        | nullable `text`                                                       |
| `pain_score`, `revenue_score`, `urgency_score`, `trend_score`, `buying_signal_score`, `frequency_score`, `source_quality_score`, `opportunity_score`, `confidence_score` | nullable `numeric(4,2)`, each constrained to 0–10                     |
| `evidence_quality`                                                                                                                                                       | nullable `text`, constrained to `low`, `medium`, or `high`            |
| `observed_at`                                                                                                                                                            | nullable `timestamptz`                                                |
| `ingested_at`                                                                                                                                                            | required `timestamptz`, default `now()`                               |
| `metadata`                                                                                                                                                               | required `jsonb`, default `{}`                                        |
| `created_at`, `updated_at`                                                                                                                                               | required `timestamptz`, default `now()`                               |

The unique fingerprint is the idempotency boundary. Source trace
`(source_table, source_row_id)` is indexed but not unique. Other indexes cover
canonical/time, normalized title, source type/time, and cluster/time. The table
comment calls it append-only, although the current database has no generic
append-only trigger: the controlled canonical bootstrap is the known writer that
updates `canonical_problem_id` and `updated_at`.

The production insert writer is `persistProblemObservations`, which builds a
typed row and performs an idempotent upsert with
`onConflict: "observation_fingerprint"` and `ignoreDuplicates: true`. It derives
the current fingerprint from normalized problem identity, observation time,
source type, source URL/name, and evidence summary. This convention cannot be
reused blindly for B3 because human prose and mutable/reformatted timestamps
must not define the promotion identity.

## Effective Customer Interview source contract

### Creation and persistence path

1. `InterviewObservationForm` accepts a category, statement kind, and a text
   area capped at 4,000 characters.
2. `POST /api/validation/interview-observations` authenticates through the
   Validation handler and passes intent to `ValidationService`.
3. `ValidationService.recordInterviewObservation` allowlists the category and
   statement kind and constructs the three-key JSON object shown above. It does
   not accept arbitrary JSON from this endpoint.
4. `ValidationRepository.recordInterviewObservation` invokes the narrow
   service-role RPC.
5. `validation_record_interview_observation` rereads an owned session in
   `in_progress` or `completed`, derives all lineage, and persists fixed origin
   `human_interview`, modality `interview_observation`, source type
   `customer_interview`, source reference equal to the private session ID, and
   collector `manual`.

The generic Validation observation command can persist arbitrary JSON objects,
but it is not the Customer Interview creation path and must not be treated as a
B3 source merely because values happen to resemble interview fields.

### Privacy-bearing data

The evidence `content` can contain participant-entered or interviewer-entered
prose, including quotes and any PII typed into them. Session `notes` are a
separate private field and are not copied into `observation_content` by the
interview command. Classification `rationale` is also separate. Participant
identity mode, pseudonymous reference, independence key, consent fields, owner,
session, and complete lineage remain in private Validation tables. No
AI-generated field is added by the interview-observation command.

## Classification and lineage authority

Classifications are append-only. A current authoritative classification is
exactly one terminal classification whose `authority_status` is
`authoritative` and whose source is not `ai_model_suggested`. Zero terminal
authorities is missing; multiple terminal authorities is ambiguous. A successor
must reference the same owner and observation, and the one-successor index makes
each supersession edge linear without pretending that multiple roots are
ordered by time.

The effective private lineage is:

```text
observation -> authoritative classification
            -> interview session -> active participant
            -> customer_interview experiment version -> experiment
            -> hypothesis version -> hypothesis
            -> subject -> owner
```

The existing B1 policy additionally requires exact interview origin/modality/
source type, non-empty content, target-segment relevance, an `in_progress` or
`completed` session, a `running`, `paused`, or `completed` experiment, and a
promotable polarity. A B3 implementation must also check `experimentFamily ===
"customer_interview"` explicitly; the current eligibility function receives the
field but does not test it. That correctness gap is documented, not patched in
isolation, because no write path is safe yet.

## Existing B1/B2 boundaries

- Exact canonical resolution considers only active canonical rows, then uses
  explicit provenance, exact normalized canonical title, or exact normalized
  alias. It has no fuzzy matching, AI, embeddings, external call, canonical
  insertion, or alias mutation.
- Representatives are deterministic per private participant, canonical problem,
  and polarity. Specificity, target relevance, statement kind, content length,
  observed time, and observation ID form the stable ordering.
- The persisted interview key is camel-case `statementKind`, while the B2 adapter
  currently reads `statement_kind`. Consequently persisted interview rows are
  adapted with a null statement kind and the direct-quote preference is not
  applied. Current interview content also carries no structured specificity
  field, so it falls back to `structured_opinion`. Both facts must be resolved or
  explicitly versioned before write-time representative parity can be claimed.
- B2 reads selected columns only, adapts persisted rows, reconciles the report,
  and computes a deterministic semantic snapshot hash. Its report is review
  material, never write authority.
- `validation_evidence_promotions` is service-role-only, RLS-enabled, and
  append-only through a rejection trigger. Its composite foreign keys preserve
  owner/observation/classification/lineage/session/participant relationships.
  Its existing checks permit a final `problem_observation_id` only for an
  eligible, selected, canonically resolved row. No final-edge equality currently
  proves that the referenced observation has the same canonical problem, so a
  future atomic RPC must add or enforce that invariant.

## `CustomerInterviewPromotionProjectionV1` decision

No executable `CustomerInterviewPromotionProjectionV1` can safely be defined
from the current authoritative source contract. The only honest candidate table
is therefore a **blocked projection analysis**, not an implementation contract:

| Destination                           | Candidate authority                 | Transformation / maximum                    | Nullable         | Human prose             | Decision and privacy rationale                                                |
| ------------------------------------- | ----------------------------------- | ------------------------------------------- | ---------------- | ----------------------- | ----------------------------------------------------------------------------- |
| `canonical_problem_id`                | exact active B1 resolution          | identity; UUID                              | no for B3        | no                      | Safe, but insufficient alone                                                  |
| `problem_title`                       | canonical registry title            | exact stored title; existing registry bound | no               | curated registry text   | Safe canonical context, but not source evidence                               |
| `normalized_problem_title`            | canonical registry normalized title | exact stored value                          | no               | normalized curated text | Safe canonical context                                                        |
| `source_type`                         | fixed promotion contract            | literal `validation_customer_interview`     | no               | no                      | Safe namespace                                                                |
| `observed_at`                         | immutable source observation        | exact timestamp                             | no for B3        | no                      | Safe event time, not fingerprint input                                        |
| `source_evidence` / `problem_summary` | `observation_content.content`       | would require trim and length cap ≤ 4,000   | yes in schema    | **yes**                 | **Prohibited:** arbitrary private prose has no shareability/PII guarantee     |
| `source_table`, `source_row_id`       | private Validation source identity  | direct copy                                 | yes              | no                      | **Prohibited for B3:** leaks private Validation lineage into shared payload   |
| `source_url`, `source_author_id`      | none                                | `NULL`                                      | yes              | no                      | Must remain null                                                              |
| `source_metrics`, `metadata`          | none needed                         | fixed empty objects only                    | no               | no                      | Arbitrary Validation JSON is prohibited                                       |
| score fields / `evidence_quality`     | none                                | `NULL`                                      | yes              | no                      | No AI or invented scoring                                                     |
| polarity                              | authoritative classification        | exact supporting/contradicting/mixed        | migration needed | no                      | Semantically safe, but cannot justify a migration without a viable projection |

Prohibited inputs include raw `observation_content`, participant and owner IDs,
session ID/reference/notes, participant name or pseudonym, email, phone, URL,
company name, transcript/quote, classification rationale, consent/auth/survey
tokens, arbitrary source metadata or nested JSON, AI analysis/drafts/questions/
recommendations, and all private Validation lineage IDs in the shared row.

## Smallest upstream contract change required

Before B3 can resume, Customer Interview evidence creation needs a distinct,
versioned, human-authored **shareable problem statement** contract. It should be
captured explicitly at evidence creation or through a new append-only human
review record—not inferred later from `content` and not produced by AI. At
minimum the contract needs:

1. a dedicated bounded statement (recommended maximum 500 characters) separate
   from quote/transcript/notes;
2. an explicit statement version and purpose identifying it as a shared Data
   Moat projection;
3. positive human confirmation that it is a faithful projection of the evidence
   and contains no person, company, contact, URL, participant, session, or
   authentication identifiers;
4. database constraints that enforce the shape and append-only provenance;
5. a product/privacy decision for handling false attestations (deterministic
   allowlisting alone cannot prove arbitrary prose is PII-free);
6. fixtures and integration tests covering names, emails, phones, URLs, company
   names, quotes, notes, and nested input rejection.

Only after that upstream contract is reviewed should B3 define the executable
projection, add a nullable constrained first-class polarity column for new
promotions (leaving legacy nulls uninterpreted), define the versioned fingerprint,
and create the service-role-only atomic RPC.

## Deferred write design (not implemented)

The future fingerprint should be a SHA-256 digest over a domain-separated,
versioned serialization of immutable source observation ID, terminal
authoritative classification ID, active canonical problem ID, and polarity. It
must exclude prose, participant identity, timestamps, and random values. The
exact namespace/version cannot be finalized until the projection version exists.

The future RPC should accept only owner plus requested observation intent,
serialize concurrent attempts with database locking, reread and validate every
lineage and lifecycle edge, recompute exact canonical resolution and the current
representative, construct the allowlisted projection, insert-or-reuse by the
fingerprint, insert one final immutable promotion row, verify canonical and
fingerprint consistency, and commit both rows atomically. Public, anon, and
authenticated execution must be revoked; only service role may execute it.

Participant identity remains private in the promotions ledger. No shared HMAC or
other independence token is required for the first promotion write and none
should be added speculatively.

## Scope and production safety

No migration is required by this review and none was created or applied. No
production action was performed. The canonical registry and aliases were not
modified, and canonical bootstrap was not run.

AI is not Validation evidence. AI analyses, drafts, questions, and
recommendations must never become independent Data Moat observations. Negative
and contradictory human evidence is first-class, but neutral and inconclusive
remain deferred. Survey and behavioral promotion remain deferred. B3 does not
activate V9 Knowledge Evolution, intelligence aggregation, opportunities,
recommendations, Weekly Intelligence, UI controls, automatic promotion, or any
browser write path.
