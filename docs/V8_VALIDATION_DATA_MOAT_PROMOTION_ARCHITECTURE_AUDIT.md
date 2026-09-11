# V8-A — Validation → Data Moat Promotion Architecture Audit

**Status:** read-only architecture audit; no bridge, migration, deployment, or production behavior change is included.

**Audit basis:** repository state on 2026-09-11. This report distinguishes implemented behavior from target-only documentation. “V8-B” below means a future, separately approved implementation.

## 1. Existing Data Moat architecture

### `canonical_problems`

`canonical_problems` is the intended durable identity and current aggregate for a market problem. It has a stable `canonical_key`, normalized title, merge/status fields, aggregate counts/scores, and a self-reference for non-destructive merges. It is platform-owned: RLS is enabled, `anon` and `authenticated` have no table privileges, and `service_role` has all privileges.

The repository does **not** contain a production writer, resolver repository, RPC, trigger, or job that inserts or updates this table. Its migration explicitly says the table is additive and not used by production application logic. Current canonical identity is therefore schema and target architecture, not an active operational contract.

### `problem_aliases`

`problem_aliases` is the intended resolver-owned vocabulary. It stores normalized aliases, alias type, optional confidence, source trace, and metadata. Uniqueness is per `(canonical_problem_id, normalized_alias, alias_type)`, not globally per normalized alias; the same normalized alias may therefore point at several canonical problems. RLS/grants are service-role-only.

No application code currently reads or writes this table. The architecture document proposes exact alias lookup, exact canonical-title lookup, semantic candidates, high-confidence linking, and unresolved/review behavior, but that proposal is not an implemented resolver. In particular, there is no enforced confidence threshold, ambiguity rule, active/merged-target resolution rule, or canonical-creation authority.

### `problem_observations`

`problem_observations` is the correct intended append-only evidence ledger. Its nullable `canonical_problem_id` expressly permits unresolved observations. It stores source trace, evidence text, source metadata, market/niche context, score-shaped fields, observed/ingested times, and JSON metadata. A unique `observation_fingerprint` provides conflict-safe insertion, while `(source_table, source_row_id)` is only a non-unique trace index.

The implemented observation store builds deterministic fingerprints and upserts with `ignoreDuplicates` on `observation_fingerprint`. It deliberately omits `canonical_problem_id`, leaving rows unresolved. Two material gaps affect V8:

1. the table has no structured polarity, active/retracted contribution state, independence-unit identity, promotion-rule version, or representative-group identity; and
2. despite its “append-only” description, the migration installs no update/delete protection trigger for this table.

The generic fingerprint currently includes title/context, observed time, source descriptors, and evidence summary. It is not a V8 promotion identity and would change when representative text or mapping changes.

### `problem_intelligence`

`problem_intelligence` is the active legacy shared aggregate. Authenticated clients can read it but cannot mutate it; the service role owns writes. Discovery and Weekly services currently match by exact `problem_title`, then insert or overwrite/average aggregate score fields. A conversion endpoint also performs an exact-title lookup and increments a conversion count. This table does not retain observation-level provenance or polarity and is not a safe first destination for Validation evidence.

### `problem_feedback_events`

`problem_feedback_events` is an event ledger for user/system outcomes (`saved`, `validated`, `invalidated`, launch/revenue/failure and similar events). It may reference a canonical problem and a user, and authenticated users can read only their own rows. It represents feedback/outcomes rather than source evidence. A classified human statement is not a feedback event, so this table is not the V8 destination.

### `problem_evolution_snapshots`

`problem_evolution_snapshots` is service-role-only derived periodic state for a canonical problem. It is downstream state, not an evidence ingress. No production job currently derives these rows from `problem_observations`; current Knowledge Evolution diagnostics instead read legacy `problem_intelligence`, `weekly_detected_problems`, `weekly_sources`, and optionally `discovered_problems` directly.

### Current ingestion paths

The repository contains three materially different paths:

- Discovery/Weekly update the legacy `problem_intelligence` aggregate through service-role application services using exact title matching.
- A feature-flagged generic dual writer can project source inputs into unresolved `problem_observations` using a deterministic fingerprint. Discovery invokes this path; it does not create canonical problems or aliases.
- Knowledge Evolution diagnostics are read-only and adapt legacy rows directly. They do not consume `problem_observations` and do not persist snapshots.

A deterministic `ProblemDeduplicationEngine` exists, but its own comments describe future persistence. It groups in-memory candidates and emits `merge/link/review/separate` decisions from token/context/relationship signals. It neither queries `canonical_problems`/`problem_aliases` nor persists a canonical match. Discover also has a separate workflow-specific deduplicator, which is not a canonical Data Moat resolver.

**Finding:** the first-destination hypothesis is structurally correct—`problem_observations` is the intended evidence ledger—but “existing canonical matcher” and “existing downstream observation processing” are not operational today.

## 2. Existing Validation evidence architecture

### Interview evidence

A customer interview has an immutable plan version and a lifecycle-controlled session tied to one owner, participant, experiment version, hypothesis version, and plan version. Session notes are private working text, excluded from broad authenticated projections, and never automatically parsed or converted to evidence.

Only an explicit `validation_record_interview_observation` call creates evidence. That RPC requires an in-progress or completed session and creates an immutable observation with `origin = human_interview`, `modality = interview_observation`, exact session/participant/version lineage, and owner-scoped ingestion idempotency. Its content records a bounded category, statement kind, and text. This is the correct V8 candidate boundary; raw notes are not candidates.

### Survey evidence

A public survey submission is immutable, server-accepted under a hashed publication token, bound to an exact survey-plan/experiment/hypothesis lineage, and conflict-protected by `(publication_id, idempotency_key)` plus a payload-hash consistency check. One submission receives one generated `respondent_id`. Answers are immutable child rows unique by `(submission_id, question_id)`.

Survey submissions and answers are **not** projected into `validation_evidence_observations`, do not have `validation_evidence_classifications`, and have no participant row. V7 reads them directly into a deterministic evidence snapshot, grouping answers by submission. Therefore raw survey answers cannot enter the classification-before-promotion path without a new, deterministic normalization/classification step. V8 must not use V7 synthesis as that step.

The safe future boundary is an answer-level (or explicitly combined answer-set) `validation_evidence_observation` created by an authoritative deterministic service from the immutable submission, question definition, and raw answer. It must use `origin = survey_response`, `modality = survey_answer`, and a stable ingestion key derived from the submission and question/normalizer version. All projected observations from one submission share one opaque independence key. This is an extension of the existing generic evidence envelope, not a second Survey interpretation system.

### Classifications

`validation_evidence_classifications` is append-only and supports `supporting`, `contradicting`, `mixed`, `neutral`, and `inconclusive`. It records classification source, authority status, rationale, supersession, and server time. Database checks ensure an `ai_model_suggested` classification can only be suggested. The browser-facing command excludes `ai_model_suggested`, but it currently allows callers to request either `authoritative` or `suggested` for participant/user/deterministic/server sources after server ownership checks.

Current classification semantics are enough for **polarity authority and correction history**, so V8 must reuse them. They are not enough to establish all promotion-quality facts: no structured direct-experience, behavioral strength, workaround, commercial behavior, response depth, or promotion eligibility exists. V8 must not overload `rationale` or infer these facts from prose.

The smallest safe design is not a parallel evidence classification system. It is a narrowly versioned, deterministic promotion assessment stored in a promotion ledger, referencing the current authoritative classification and recording eligibility reason codes and representative-selection mechanics. Source facts must come from existing structured observation/session/survey fields; missing facts remain unknown and cannot be manufactured.

### Independence semantics

Validation already preserves useful but incomplete independence signals:

- a participant may have an owner-scoped unique `independence_key`;
- observations carry participant ID, an optional participant-independence key, relationship, and anonymous uncertainty;
- interview observations have an exact session ID and participant ID;
- V7 groups interview observations by participant ID, then participant-independence key, then observation ID;
- V7 groups survey answers by submission ID, and counts submissions as respondents.

For interviews, participant identity—not session—is the independent human unit. Re-interviewing the same participant in another session must not create a new independent source. Use the owner-scoped participant independence identity when present, otherwise the participant ID. Session IDs remain provenance. An observation without a participant or stable independence key is ineligible because independence cannot be proved.

For surveys, submission ID/respondent ID is the available independent unit. The schema does not deduplicate the same real person across separate anonymous submissions, so `anonymous_independence_uncertain` must remain explicit and such evidence cannot be advertised as proven independent across submissions. Multiple answers in one submission are one unit.

Manual observations are supported by the generic evidence command, including nullable participants and browser-supplied origin/independence claims. A manual row is eligible only if it has an owner-scoped participant with a stable independence identity and an authoritative classification; a nullable participant or client assertion alone cannot prove independence or human origin.

### Provenance

Validation observations already retain subject, hypothesis/version, experiment/version/family (derivable through FK), participant, optional interview session, observed/collected times, origin, modality, source trace, immutable content, ingestion identity, and classification chain. Surveys retain exact publication/plan/submission/answer lineage and server submission time. All Validation rows are owner-scoped and browser-read-only; writes use the service role after server authentication.

## 3. First promotion destination

The first Data Moat table must be **`problem_observations`**.

It is the only existing platform table intended to hold append-only, source-level evidence with nullable canonical resolution and source provenance. Writing first to `problem_intelligence` would destroy lineage and mix an individual statement into a mutable aggregate. Writing to `problem_feedback_events` would misclassify evidence as an outcome. Writing to `canonical_problems` or `problem_evolution_snapshots` would skip the Evidence → Knowledge boundary.

V8-B must insert an accepted representative observation into `problem_observations` only after a high-confidence match to an existing canonical problem. Although the table technically accepts `canonical_problem_id = null`, unmatched V8 candidates should remain in the private promotion ledger rather than copying private raw evidence into the shared platform ledger prematurely.

## 4. Eligibility contract

### Eligible evidence

An observation is eligible only when every condition below is proven server-side:

1. **Allowed source envelope:** an immutable `validation_evidence_observations` row whose origin is human or actual behavioral evidence, never an interpretation table. For surveys, this means a deterministic projection row first exists in that table.
2. **Concrete origin proof:** interview evidence has a valid interview-session FK and `human_interview/interview_observation`; survey evidence has immutable submission/answer lineage encoded and verified by the projector; behavioral evidence has `behavioral_observation`, a permitted event type, and `collected_by = server_observed`.
3. **Current authoritative classification:** exactly the unsuperseded tip of the observation's classification chain is `authority_status = authoritative`. Suggested rows do not qualify. Polarity may be supporting, contradicting, or mixed.
4. **Useful evidentiary content:** non-empty bounded content tied to the hypothesis problem claim, with deterministic reason codes for at least direct/reported/observed experience, actual workaround/resource allocation, commercial behavior, or a concrete contradiction. Pure preference/opinion is insufficient by itself.
5. **Independence:** a server-derived stable unit exists; relationship is neither `duplicate` nor unresolvable `unknown`, and anonymous independence is not falsely claimed as certain.
6. **Relevance:** target-segment relevance is `target_segment_match`, or an explicit adjacent-segment reason is retained. Unknown relevance is deferred, not silently accepted.
7. **Canonical match:** exactly one non-merged/non-deprecated existing canonical problem meets the reviewed high-confidence matcher contract.
8. **Consent/status:** participant status and the experiment's consent/privacy contract permit aggregate learning. Withdrawn participants are not newly promoted.

### Ineligible evidence

Ineligible sources include V7 runs/dimension states/synthesis/recommendations, V7.1 drafts, generated hypotheses/questions/criteria/examples, founder assumptions, subject context, raw interview notes, raw unclassified survey answers, AI interpretations, suggested-only classifications, duplicates, unprovable anonymous/manual sources, empty or irrelevant content, and events lacking actual server-observed provenance.

`neutral` and `inconclusive` classifications remain preserved in Validation but are not promoted as claims about a canonical problem. They may become eligible in a future explicitly modeled uncertainty channel; V8-B must not coerce them into support or contradiction.

### Classification requirements

V8 reuses the current append-only classification chain for polarity. The current row is the unique chain tip (a classification with no successor). V8-B should harden authoritative creation so browser input cannot self-declare system authority; a user decision may remain `user_supplied/authoritative`, but deterministic/server authority is set only by server code.

A promotion assessment records rule version, current classification ID, eligibility/defer reason codes, match decision, independence grouping, and ranking mechanics. It does not reclassify polarity and is not a new “truth score.”

### Negative evidence behavior

`contradicting` and `mixed` evidence follows the same eligibility, independence, quality, and matching rules as supporting evidence. Polarity is stored as a structured field on the promoted observation and in immutable promotion provenance. Representative selection is partitioned by `(independence unit, canonical problem, polarity bucket)`, so a strong contradiction cannot be displaced by supporting evidence from the same person. `mixed` remains mixed; it is not split or forced positive/negative without separate human-source observations.

## 5. Independence / strongest representative selection

### Interview unit

The independence unit is `(owner scope, participant independence identity)`, using `validation_participants.independence_key` when present and otherwise `validation_participants.id`. `interview_session_id` is provenance only. Multiple sessions with the same participant remain one independent person for the same canonical problem.

### Survey unit

The independence unit is the immutable `validation_survey_submissions.id` (with `respondent_id` retained privately as an integrity cross-check). Every answer-derived observation from a submission shares that unit. No answer count becomes a respondent count. Separate anonymous submissions remain “independence uncertain” unless a future privacy-safe anti-duplication mechanism proves otherwise.

### Multiple observations from the same respondent/problem

Group eligible candidates by:

`(owner scope, privacy-safe independence token, canonical_problem_id, polarity bucket)`.

Select at most one active representative per group. Preserve every candidate observation ID and its classification ID in the private promotion ledger, with one selected representative and non-selected reason `same_independence_group_weaker_representation`. Supporting, contradicting, and mixed buckets are separate so conflicting first-class evidence survives without multiplying within a polarity.

The platform observation receives a one-way HMAC independence token derived with a server secret and a scoped input (owner plus participant/submission unit). It must not receive raw owner, participant, session, respondent, submission, answer, or Validation IDs. Aggregators may count distinct tokens but cannot reverse or correlate them to private identities.

### Deterministic ranking/selection

Use a lexicographic ordering of explainable categories, not an averaged truth score:

1. concrete commercial behavior (`purchase/deposit` before `demo/pricing`, when server-observed);
2. observed behavior;
3. reported direct past behavior;
4. concrete workaround/resource allocation (`money_spent`, switching/attempted solution, time cost);
5. frequency/severity with concrete bounded detail;
6. structured/free-text opinion.

Within the same tier order by: target match before adjacent match; authoritative server/participant fact before user summary when the schema can prove it; direct quote before summary for interviews; greater bounded response depth; newer `observed_at`; finally stable observation ID ascending. Contradicting evidence uses the same ordering. Numeric ordinals may implement this lexicographic comparison, but they are internal mechanics, versioned, never persisted or exposed as confidence/truth/validation percentage, and never combined across respondents.

Only structured facts may affect ordering. A field that does not exist is `unknown`; the service must not NLP-infer it or use V7 output. This limitation means initial Survey ranking can use question type/response depth and server-authored question intent only if that intent is made structured and immutable.

## 6. Canonical problem matching

### Existing matcher

There is no production canonical matcher to reuse. The only generic engine is deterministic and provider-independent but operates on in-memory candidates, does not query aliases/canonical rows, and is explicitly marked for future persistence. The schema permits ambiguous duplicate aliases. Active legacy ingestion uses exact title matching against `problem_intelligence`, not canonical identity.

This is an architecture blocker to implementing promotion safely today.

### Reuse strategy

V8-B must first activate one **generic Knowledge Layer canonical resolver**, not a Validation-specific matcher. The resolver should own all future source types and use the existing normalization/deduplication primitives. Its V8 contract is read-only matching against existing canonical identities:

1. resolve merged canonical rows to their active survivor;
2. exact normalized canonical-title match;
3. exact normalized alias match;
4. if either step yields more than one distinct active survivor, return `ambiguous`;
5. otherwise evaluate deterministic candidate similarity using title/problem claim, target segment/niche, and existing aliases;
6. auto-match only under a reviewed threshold with a single winner and a required margin over runner-up; record candidate signals, resolver version, threshold, and margin;
7. never invoke a model.

The threshold and margin must be calibrated in resolver tests against real fixtures before V8-B is enabled; the existing engine's generic `merge >= 8` threshold cannot be blindly treated as match confidence.

### Ambiguity behavior

No match, weak match, duplicate exact aliases, merged-chain anomalies, or insufficient margin produces a private ledger state of `eligible_unmatched` or `ambiguous_match`. No `problem_observations` row is written. Replays may reconsider these states under a new resolver/rule version.

### Canonical creation policy

V8-B does not auto-create canonical problems from Validation. Only an already existing, active canonical identity may receive evidence. Canonical creation/merge remains a separately controlled generic Knowledge Layer operation. A wrong match is harder to unwind than a deferred candidate.

## 7. Idempotency and reclassification

### Stable identity

A new private promotion ledger is required. Its logical identity is the immutable source observation plus target plus semantic rule revision:

`(validation_observation_id, canonical_problem_id, promotion_rule_version, classification_id)`.

A separate representative-group identity is derived from `(owner, independence unit, canonical problem, polarity bucket, promotion rule version)`. The promoted platform observation has a stable `promotion_id` FK/opaque reference and a unique active representative per group enforced transactionally.

The fingerprint in `problem_observations` should be derived from the immutable promotion ledger ID (for example `sha256("validation-promotion-observation@1:" + promotion_id)`), not mutable text, timestamp, or classification prose.

### Duplicate prevention

The service evaluates, groups, selects, records the ledger decision, and inserts the platform observation in one database transaction. Unique constraints cover source/target/rule/classification evaluation, one current active representative per group/polarity, and one platform observation per promotion. Retrying the same request returns the existing disposition. Concurrent workers serialize on the group identity.

### Changed classification

Classifications are immutable successors. When the current authoritative chain tip changes, the old ledger record and old `problem_observations` row remain historical but are marked `superseded`/`inactive_for_aggregation` through append-only promotion events or a narrowly guarded lifecycle field. The service re-evaluates the new classification:

- same polarity and still eligible: keep the same representative when ranking is unchanged, attach a new evaluation event, and do not create a second active observation;
- different eligible polarity: deactivate the old contribution and create/select the representative in the new polarity bucket;
- neutral/inconclusive/ineligible: deactivate the old contribution without deleting it;
- canonical rematch under a new resolver rule: preserve the old target link as history, deactivate it, and create a new matched promotion only when the new match is unambiguous.

### Replay behavior

The internal job is at-least-once. Replaying the same rule/classification is a no-op. A new rule version creates a new assessment but must reconcile against the same source/group before changing the active contribution. Failed transactions leave no partial platform row. Unmatched/deferred records are safely replayable.

## 8. Provenance / privacy

### Retained lineage

The private owner-scoped ledger retains exact:

- Validation owner and subject;
- hypothesis and hypothesis version;
- experiment and experiment version/family;
- participant and interview session, or survey publication/plan/submission/answer;
- source observation;
- observed/submitted and collected times;
- origin, modality, and behavioral event type;
- authoritative classification ID, polarity, source, rationale, and chain tip;
- participant relevance and private independence unit;
- candidate set/match decision, canonical target, resolver version;
- eligibility reason codes, ranking tier/tie-break reasons, representative group;
- promotion rule version, disposition, promoted/superseded timestamps; and
- resulting `problem_observations.id`.

The platform `problem_observations` row retains only safe reusable knowledge: canonical problem ID, sanitized problem statement/evidence excerpt, origin/modality/source category, polarity, observed time (coarsened if required), non-identifying market/niche facts, HMAC independence token, promotion/rule/resolver versions, and opaque promotion reference.

### Owner/respondent privacy

Raw owner ID, participant ID, participant independence key, pseudonymous reference, respondent ID, submission/answer/session IDs, survey token/hash, consent text, source reference that can identify a person, private note, raw contact value, and unredacted free text must not cross into shared platform columns or metadata.

### Shared-intelligence boundaries

Validation remains owner-readable and platform writes remain service-role-only. `problem_observations` is currently service-role-only, so raw rows are not directly cross-user readable; nonetheless its contents should be treated as future shared-intelligence input. Aggregation may use polarity, source class, quality category, and distinct opaque independence tokens. It must never expose the token or private ledger joins to users.

### PII exclusions

Before promotion, deterministic redaction/allowlisting must reject rather than model-transform content containing disallowed contact or sensitive identifiers. Prefer a minimal sanitized excerpt assembled from approved structured fields. Do not copy interview notes, survey tokens, aliases, or arbitrary `source_reference`. No model may perform redaction because the model output would then become the stored evidence wording.

## 9. Security / authority

### RLS

Validation tables are owner-scoped, authenticated-read-only, and service-role writable. Data Moat canonical/observation/alias/snapshot tables are service-role-only. This is the correct broad boundary. The new ledger must enable RLS, revoke `public/anon/authenticated`, grant service role, and—if founder visibility is needed—expose only an owner-scoped redacted view rather than raw platform linkage.

### Service role

Only a narrow transactional database RPC callable by service role should write ledger state and `problem_observations`. Composite FKs and constraints must validate all lineage. The application worker authenticates/authorizes the originating owner only when enqueueing/re-evaluating; the internal job itself derives every decision from database rows.

### Browser authority

The browser supplies none of: owner, origin proof, canonical ID, eligibility, classification authority, independence key/token, ranking, representative, provenance, disposition, rule version, or timestamps. A future UI may request “re-evaluate,” but it cannot send authoritative decisions.

### RPC/service ownership

Choose an internal server/job trigger. A generic server-only `ValidationPromotionService` loads candidates and calls a service-role-only transactional RPC such as `promote_validation_evidence_batch`. The generic Knowledge canonical resolver is a separate Knowledge Layer dependency. The RPC rechecks current classification tip, source lineage, group identity, expected resolver result, and unique constraints before writing.

Promotion should be an **internal service/job**, queued after authoritative classification/projection commits and replayable by operators. It should not run synchronously inside classification transactions (which would couple private workflow latency/failure to shared ingestion), and it should not require founder action (which biases the shared moat toward selectively positive evidence).

## 10. AI contamination analysis

The enforceable origin allowlist begins at database lineage, not labels supplied by prompts:

- Candidate queries start only from `validation_evidence_observations`; they never union `validation_intelligence_runs`, design-assistant output, hypothesis prose, plan questions, or subject context as observations.
- Interview candidates require the exact session FK and fixed human-interview origin/modality.
- Survey candidates require a deterministic projection from immutable raw submission/answer rows; the question may provide context but is never evidence by itself.
- Behavioral candidates require a permitted event and server-observed collector.
- `ai_model_suggested` classifications are always non-authoritative and ineligible.
- V7 outputs may reference evidence IDs for user interpretation but cannot create a participant, independence unit, source observation, promotion assessment, or platform observation.
- V7.1/V7.2 output may become a founder-edited hypothesis or plan, but hypotheses/plans are experiment design, never evidence origin.
- No promotion matching, redaction, quality assessment, or normalization model call is introduced.
- Database constraints/RPC checks should reject any unapproved `source_table`, origin/modality/collector combination, missing source FK, or promotion whose source is a derived/intelligence table.

AI interpretation of a human statement remains interpretation. It may never mint a new independent observation. Only the original immutable human/behavioral row supplies independence and evidentiary content.

## 11. Knowledge Evolution boundary

V8 ends after creating an auditable, active/inactive `problem_observations` contribution. It does not update `canonical_problems` aggregates, `problem_intelligence`, `problem_evolution_snapshots`, opportunities, scores, confidence, or recommendations.

The repository currently proves no automatic trigger from `problem_observations` into evolution machinery. V9 must explicitly teach aggregation/evolution to read only active promoted observations, count distinct independence tokens, separate polarity, and generate snapshots/aggregate state. Until V9, V8 rows accumulate safely without changing product intelligence.

## 12. Required schema impact

V8-B requires **one forward migration**; this audit creates none. The migration should:

1. create a private, owner-scoped `validation_evidence_promotions` ledger (and append-only promotion-event/history representation, either as rows in that table or one tightly related event table) with exact Validation FKs, canonical target, current classification, resolver/rule versions, eligibility/match/ranking reason codes, representative-group identity, disposition, platform observation reference, and lifecycle timestamps;
2. add structured `polarity`, `contribution_status`, `independence_token`, and `promotion_id` (or equivalent constrained provenance link) to `problem_observations`;
3. add unique/partial indexes for evaluation idempotency, one active representative per group/polarity, and one platform row per promotion;
4. add guarded immutability/lifecycle triggers so evidence and lineage cannot be rewritten or deleted; and
5. add service-role-only grants/RLS and the narrow transactional promotion RPC.

A ledger is necessary. Existing provenance cannot safely represent eligible-unmatched/ambiguous state, non-selected candidates, reclassification history, representative replacement, owner-private lineage, or reversibility. `problem_observations.metadata` plus its current fingerprint is unconstrained, platform-scoped, and insufficient for atomic state/idempotency. Reusing it would mix private orchestration state into shared evidence and make audit guarantees convention-only.

Survey normalization also needs schema support to bind projected `validation_evidence_observations` to exact `(submission_id, answer_id)` lineage and to enforce stable owner-scoped ingestion identity. Prefer nullable explicit FKs/checks on the existing evidence table over a second survey-evidence table.

## 13. Recommended V8-B architecture

Use this one end-to-end design after resolving the blocker:

1. **Deterministic survey projection:** an internal service creates immutable `validation_evidence_observations` only from immutable survey answers/definitions, preserving one submission independence unit. Interview candidates already enter through explicit evidence observations; notes remain excluded.
2. **Authoritative classification:** use the current unsuperseded `validation_evidence_classifications` row for polarity. Require authoritative, non-AI classification; append corrections only.
3. **Deterministic assessment:** the internal job evaluates structured source proof, relevance, content category, consent/status, and independence. It writes reason-coded eligible/ineligible/deferred state to the private ledger.
4. **Generic canonical resolution:** the shared Knowledge resolver matches only an existing active canonical problem using exact canonical/alias stages followed by a calibrated deterministic single-winner stage. No model and no Validation-specific matcher.
5. **Safe defer:** unmatched/ambiguous candidates remain private ledger records and create no shared observation.
6. **Grouping:** group matched candidates by private independence unit, canonical problem, and polarity bucket.
7. **Representative selection:** choose one active representative per group/polarity with the versioned lexicographic ordering above; retain all non-selected source/classification references privately.
8. **Atomic promotion:** a service-role-only RPC locks/rechecks source, chain tip, resolver result, and group, then records the ledger transition and inserts one `problem_observations` row with structured polarity/status, stable promotion fingerprint, sanitized evidence, opaque HMAC independence token, and non-identifying provenance.
9. **Reclassification/replay:** append a new assessment, deactivate superseded contributions without deletion, and select/reuse a new representative deterministically. Same input is a no-op.
10. **Stop at evidence:** do not mutate legacy intelligence, canonical aggregates, or evolution snapshots. V9 owns downstream aggregation.

This design answers A–T: first destination `problem_observations`; reuse current polarity classifications plus a promotion ledger assessment; strict human/behavioral eligibility; participant/submission independence; one representative per problem/polarity; negative evidence retained; generic high-confidence existing-canonical matching; safe defer; constraint-backed idempotency; split private/shared provenance; no raw owner/participant identity crossing; one necessary ledger migration; service-role RPC; internal job; append-only reclassification handling; source-FK AI exclusion; and inactive/superseded reversibility without deletion.

## 14. Rejected alternatives

- **Write directly to `problem_intelligence`:** loses source lineage/polarity and mutates active aggregates before V9.
- **Treat `problem_feedback_events.validated/invalidated` as evidence:** confuses founder outcome events with respondent statements and collapses mixed/contradictory evidence.
- **Put all state in `problem_observations.metadata`:** cannot safely track unmatched candidates, private owner lineage, representative changes, or uniqueness; guarantees remain unenforced.
- **Promote every observation and deduplicate during V9:** permanently inflates the evidence ledger and makes independent-source counts easy to misuse.
- **One representative regardless of polarity:** can erase a person's concrete contradiction or support; separate polarity buckets preserve both without multiplying corroboration.
- **Use V7 synthesis to normalize/classify Surveys:** turns model interpretation into evidence and introduces recursive contamination.
- **Use raw survey answers directly:** bypasses the required classification contract and creates a second evidence path.
- **Auto-create canonical problems from weak Validation matches:** makes founder wording a shared identity and increases fragmentation/mislink risk.
- **Reuse exact-title `problem_intelligence` matching:** it is legacy aggregate matching, ignores aliases/ambiguity, and has no canonical target.
- **Synchronous classification hook or browser promotion:** couples transactions or delegates authority to an untrusted/selective client.
- **No migration:** current schema cannot encode polarity, active contribution state, private promotion lineage, or representative uniqueness safely.

## 15. V8-B implementation scope

Expected future changes, not changes made by this audit:

- **Migration:** one new `supabase/migrations/<timestamp>_validation_data_moat_promotion.sql` containing the ledger, Survey lineage FKs, `problem_observations` additions/guards, indexes, RLS/grants, and transactional RPC.
- **Knowledge resolver:** extend `lib/knowledge/deduplication/` with a repository-backed generic canonical resolver; add a small server-only repository for `canonical_problems` and `problem_aliases`. Do not create `lib/validation/.../canonicalizer`.
- **Validation promotion:** add server-only modules under `lib/validation/promotion/` for source eligibility, Survey projection, independence derivation/HMAC, deterministic representative ordering, safe content projection, orchestration, and repository/RPC client.
- **Job boundary:** add one protected internal job/route consistent with existing server/cron patterns; it accepts no authoritative promotion fields.
- **Types:** extend `lib/knowledge/observation-store.ts` and `problem-observations.ts` only for the new structured platform fields; do not map Validation truth to legacy scores.
- **Tests:** SQL integrity tests for cross-owner/source-FK failures, AI-origin rejection, append-only history, uniqueness/concurrency, reclassification and RLS; unit tests for all eligibility reasons, survey grouping, interview grouping across sessions, polarity partitioning, deterministic ties, redaction, stable fingerprints, ambiguity/margin, replay, and inactive replacement; integration tests proving service-role-only writes and no writes to intelligence/evolution tables.
- **Docs:** update Validation schema, customer interview/survey architecture, Knowledge Evolution migration plan, and this V8 contract after implementation details are approved.

No UI change, model call, canonical auto-creation, `problem_intelligence` write, snapshot write, opportunity write, or production rollout belongs in V8-B.

## 16. Risk register

| Risk | Concrete failure | Required control |
| --- | --- | --- |
| Double counting | Several observations/answers/sessions from one person appear as several corroborators. | Owner-private independence unit; group by canonical problem and polarity; one active representative; distinct opaque token downstream. |
| Wrong canonical match | A founder claim is attached to an unrelated shared problem. | Generic existing-only resolver; exact ambiguity detection; calibrated threshold/margin; no auto-create; defer on uncertainty. |
| Shared/private leakage | Owner, respondent, session, tokens, raw notes, or identifying free text enter platform evidence. | Private ledger; strict allowlist/redaction; HMAC token; service-role-only joins; no raw IDs/PII in shared row. |
| Negative-evidence loss | Contradictions are filtered or displaced by supportive evidence. | Structured polarity; equal eligibility; polarity-partitioned representative selection; V9 separate aggregation. |
| AI contamination | V7 synthesis/drafts/questions or AI classification become observations. | Source-table/FK allowlist; authoritative non-AI chain tip; deterministic Survey projection; no model calls; DB/RPC checks. |
| Replay/idempotency | Retries or concurrent jobs create duplicate observations/representatives. | Stable ledger identity, partial unique indexes, group locks, atomic RPC, fingerprint from promotion ID. |
| Reclassification drift | Old polarity remains counted after an immutable successor classification. | Chain-tip recheck; append-only assessment; deactivate old contribution; deterministic reselection; no deletion. |

## 17. Recommendation

**ARCHITECTURE BLOCKER FOUND**

Do not write the V8-B implementation prompt as though it can merely connect existing services. The repository lacks an operational canonical resolver/creation authority, Survey-to-observation classification path, structured Data Moat polarity/contribution state, and private promotion ledger. These are genuine correctness boundaries, not optional refinements.

The blocker is resolvable without changing product vision: first approve/calibrate the generic existing-canonical resolver contract and the minimal one-migration ledger/polarity/Survey-lineage design described above. After that approval, V8-B can be scoped as one small, service-owned, model-free bridge that stops at `problem_observations`.
