# Idea Validation Persistence and Security (V2)

## Decision record

V2 is the first persistence layer for real-world Idea Validation. It is deliberately private, additive, server-owned, and Beta-focused. It stores durable validation history without connecting that history to shared knowledge.

The repository patterns safe to reuse are: explicit `owner_id`, composite owner-aware foreign keys, RLS on every private table, owner-only authenticated reads, revoked browser mutations, service-role writes behind authenticated server code, text taxonomies with checks, server timestamps, partial owner-scoped idempotency indexes, and append-only/versioned records. Historical broad browser writes, unscoped/global Weekly reads, cascading application-history deletion, client-selected user IDs, and single JSON blobs containing authority or ownership are specifically **not** reused.

## Physical schema and Beta purpose

| Table | Responsibility |
| --- | --- |
| `validation_subjects` | Stable owner-scoped root and bounded historical context snapshot. |
| `validation_subject_links` | Zero or more typed upstream provenance references and their bounded snapshots. |
| `validation_hypotheses` | Logical hypothesis identity and archive/lifecycle metadata. |
| `validation_hypothesis_versions` | Immutable material hypothesis definitions. |
| `validation_experiments` | Logical experiment identity and visibility. |
| `validation_experiment_versions` | Versioned design, exact hypothesis version, and execution lifecycle. |
| `validation_participants` | Optional privacy-minimized participant reference, never a contact record. |
| `validation_evidence_observations` | Immutable human or actual behavioral source observation. |
| `validation_evidence_classifications` | Append-only polarity classification and correction provenance. |

Interpretations, experiment runs, interview sessions, survey-response specializations, behavioral-event child tables, ingestion ledgers, public tokens, contact/PII vaults, promotion ledgers, and canonical links are deferred. They have no required V2 Beta write path. In particular, an interpretation table is deferred until an interpretation feature needs persistence; this prevents conceptual completeness from becoming unused schema.

## Ownership chain and foreign-key graph

Every table carries `owner_id` as a structured column. Child foreign keys include `owner_id`, so a service-role mistake cannot join rows from different owners:

```text
auth.users <-RESTRICT- validation_subjects
validation_subjects(id, owner_id) <-RESTRICT- validation_subject_links
validation_subjects(id, owner_id) <-RESTRICT- validation_hypotheses
validation_hypotheses(id, subject_id, owner_id) <-RESTRICT- validation_hypothesis_versions
validation_subjects(id, owner_id) <-RESTRICT- validation_experiments
validation_experiments(id, subject_id, owner_id) <-RESTRICT- validation_experiment_versions
validation_hypothesis_versions(id, hypothesis_id, subject_id, owner_id) <-RESTRICT- validation_experiment_versions
auth.users <-RESTRICT- validation_participants
validation_experiments(id, owner_id) <-RESTRICT- validation_participants (optional)
validation_experiment_versions(id, experiment_id, hypothesis_version_id, hypothesis_id, subject_id, owner_id)
  <-RESTRICT- validation_evidence_observations
validation_participants(id, owner_id) <-RESTRICT- validation_evidence_observations (optional)
validation_evidence_observations(id, owner_id) <-RESTRICT- validation_evidence_classifications
```

Hypothesis-version and experiment-version supersession foreign keys also include their logical parent, subject, and owner. The experiment-version target has the exact matching unique tuple `(id, experiment_id, subject_id, owner_id)`; supersession deliberately does not require both versions to test the same hypothesis version. Classification supersession includes the observation and owner. These constraints prevent cross-owner links, cross-hypothesis version chains, cross-experiment version chains, and corrections of another observation. Self-supersession is rejected.

No FK targets an upstream Discover, Scan, Weekly, Saved Idea, or Opportunity row. A provenance link stores a typed opaque row reference plus a snapshot instead. Upstream deletion therefore cannot erase or change Validation history. `RESTRICT` is used throughout the Validation graph: removal must be an explicit future privacy workflow, never an accidental cascade. Reverting application code after deployment leaves these inaccessible/inert additive tables in place.

## Subject and typed provenance

A subject has one creation origin and an immutable-at-creation bounded object snapshot. A user-entered subject needs no link. Each upstream origin is a row in `validation_subject_links`; multiple origins are supported, while a unique constraint prevents a duplicate role for the same typed reference. This avoids one nullable FK column per upstream product and allows new provenance types through a reviewed check-constraint migration. Upstream context is provenance only: none of the context origins are accepted by the evidence-origin constraint.

Opaque `source_row_id` is text because existing upstream identifiers are not one uniform physical type and because there is intentionally no live referential dependency. `source_version` and the link snapshot preserve historical meaning. Neither creates canonical-problem linkage.

## Versioning and lifecycle

Logical roots are separate from version rows. Version numbers are positive and unique per logical parent. An experiment version references the exact hypothesis version it tested, including matching subject and owner. Material changes append a new version; convenience “latest” pointers are deliberately absent. Hypothesis lifecycle status exists only on the mutable logical root. Immutable hypothesis versions have no status: whether a version was superseded is derived from a successor's `supersedes_version_id`, preventing a permanently stale `active` or `superseded` label.

Hypothesis-version updates and deletes are rejected by a narrow DB trigger. Experiment-version design and lineage columns are immutable. Only lifecycle and its timestamps may update, and the DB trigger implements the V1 transition graph. `started_at` must be null in `draft`/`ready`, must be present in `running`/`paused`/`completed`, and cannot change after first assignment. It may be null on `cancelled` when cancellation happened before a run. `completed` and `cancelled` are terminal and cannot reopen; their authoritative terminal timestamps are required by checks. Evidence is attached to an exact experiment-version tuple, so design changes cannot detach its historical meaning. Root visibility/status can later be maintained by the server; roots remain protected from destructive removal by downstream `RESTRICT` references.

## Participants and privacy

V2 stores identity mode, an optional pseudonymous reference, optional owner-scoped independence key, optional experiment scope, consent metadata, status, and system creation time. `experiment_pseudonymous` requires an experiment; identified-interview, manual-imported, and other modes may also be experiment-scoped, while owner-pseudonymous and anonymous references may remain owner-scoped. When evidence names an experiment-scoped participant, a narrow trigger requires the evidence to use the same experiment; an owner-scoped participant may be reused within that owner. Anonymous observations may omit a participant entirely. It stores no name, email, phone, social handle, address, raw contact value, or global fingerprint. Beta modes are anonymous, experiment-pseudonymous, owner-pseudonymous, identified-interview, and manual-imported; future waitlist/social identity modes remain deferred with their execution families.

An optional future protected contact table can reference the stable participant ID without changing evidence identity or raw observation lineage. Participant removal does not cascade evidence; withdrawal/archive status can record privacy handling until a dedicated workflow is reviewed.

## Evidence, classifications, and future behavior

`validation_evidence_observations` accepts only human origins or actual `behavioral_observation`. It contains no polarity, AI summary, validation result, score, narrative, or upstream context. One generic observation envelope is sufficient for interview and survey Beta and can represent future actual behavior. A specialized behavioral event table can be added later if public-ingress volume or event integrity requires it; V2 creates no ingress.

The raw content and source-specific fields are a JSON object because response shapes vary by experiment version. Origin, modality, optional behavioral event type, collection authority, lineage, timestamps, and independence are structured because they are integrity/security/query semantics. Raw observations are update/delete protected.

Classifications are separate append-only rows. Polarity preserves supporting, contradicting, mixed, neutral, and inconclusive results. Source and authority are explicit. An AI/model suggestion is constrained to `suggested`; it cannot masquerade as authoritative. A correction references the prior classification for the same observation; the successor's immutable `classified_at` is the unambiguous supersession event time. No misleading timestamp is written to or named for the old row, and evidence is never rewritten. V2 makes no model call and stores no interpretation.

## JSONB and taxonomy strategy

JSONB is limited to bounded-shape snapshots and genuinely version-specific content: subject/link context objects, criteria/scope arrays, experiment audience/design/screening, and observation-content objects. Shape checks prevent scalar/null envelopes. V3 must add request-size limits at its authenticated server boundary; V2 does not invent a database byte limit without an evidenced product limit.

Text plus `CHECK` is used instead of PostgreSQL enums. This follows the repository's evolvable migration style and makes future additive taxonomy review straightforward. Ownership, IDs, versions, statuses, origin, modality, polarity, authority, lifecycle, and timestamps never hide in JSONB.

## Idempotency, independence, and timestamp authority

The schema stores but does not compute `content_fingerprint`, `ingestion_key`, and `participant_independence_key`. A non-null ingestion key is unique per owner; a participant independence key is unique per owner. Content fingerprints are indexed per owner but not unique because repeated/contradictory observations must remain representable. No value is globally unique, preventing cross-tenant correlation. Anonymous uncertainty and the relationship (`unknown`, `independent`, `duplicate`, `repeat_participant`) remain explicit.

`created_at`, defaulted `collected_at`, `classified_at`, and lifecycle transition timestamps are server-authoritative persistence facts. `observed_at` is a distinct source assertion and never substitutes for creation/collection time. Classification and version supersession are represented by immutable successor references; the successor's timestamp records when that relationship was created.

## RLS, grants, and authority matrix

All nine tables have RLS enabled. `authenticated` receives `SELECT` only; each policy requires `owner_id = auth.uid()`. `anon` and `public` have no grants or policies. There are no authenticated insert/update/delete policies, so browser clients cannot choose or change ownership or attach cross-owner rows. `service_role` retains table privileges and bypasses RLS as expected; V3 must authenticate first and derive `owner_id` from that user rather than request content. Composite FKs remain effective even for service-role writes.

| Role | Read | Insert/update/delete |
| --- | --- | --- |
| `anon` / `public` | None | None |
| `authenticated` | Own rows only | None |
| `service_role` | Privileged | Privileged, still subject to constraints/triggers |

Future public ingress must use separately reviewed token/claim tables and a narrow server/RPC boundary. It must not grant anonymous writes to these authoritative tables or weaken current policies.

## Immutability and delete semantics

DB triggers reject updates/deletes of hypothesis versions, subject links, raw observations, and classifications. Experiment-version lineage/design is immutable; lifecycle is narrowly mutable through valid non-terminal transitions, and deletion is rejected. Browser grants independently deny every mutation. Root and participant metadata are server-owned and V3 repositories must expose only explicit archive/status operations. All history-bearing FKs use `RESTRICT`; no upstream FK exists; account deletion requires a future dedicated privacy workflow rather than cascade loss.

## Indexes

Indexes cover owner/time subject and participant reads, subject children, parent/version ordering, experiment observation time, classification history, typed provenance uniqueness, version uniqueness, owner-scoped idempotency, owner-scoped participant independence, and owner/content-fingerprint lookup. Composite unique keys also serve integrity FKs.

## Boundaries, future work, and deployment

V2 contains no API, repository, mutation, UI/sidebar, interview/survey execution, CSV import, public endpoint/form, hosted survey/landing page, social/email integration, AI generation/interpretation, scoring, automated execution, Data Moat promotion, Knowledge Evolution write, canonical problem link, or change to Evidence Alignment, Scan, Discover, Weekly, Saved Ideas, or Opportunities.

V3 must add authenticated server-owned repositories/APIs, derive the owner server-side, validate payload sizes/content, issue version numbers transactionally, serialize classification supersession, and map constraint errors safely. Later versions may add import algorithms, execution/run specialization, interpretations, public ingress, protected contacts, and separately reviewed promotion. No Validation table writes `problem_observations`, `problem_intelligence`, `canonical_problems`, or Knowledge Evolution.

Before deployment, a normal commit revert removes the migration from the release. After deployment, prefer an additive forward-fix: never edit historical migrations, delete evidence, or weaken RLS. An application rollback simply leaves the tables private and inert. Security corrections must be new migrations.

Safe operator workflow (run against the intended linked project only after review):

```bash
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

No remote command is run as part of V2 implementation.
