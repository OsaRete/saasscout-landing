# V8 B4.3-A — Current Evidence Authority Contract

**Status:** Approved restrictive contract for B4.3-B implementation review. Documentation only; this document adds no executable authority, restriction, read, or mutation path.

**Reviewed baseline:** `codex/b43-b-current-evidence-authority` at `87b9de268160bd5f3db31cee9aef44a024ea87bf`.

**Purpose identifier:** `qualified_validation_shared_evidence` (fixed by database code; never accepted from a caller).

## 1. Purpose and scope

This contract governs whether already-qualified, shared Validation evidence may be consumed as current evidence. It does not change whether a historical promotion was qualified or whether its immutable proof is intact. Those are separate predicates:

1. **Historical qualification:** the immutable B3.1 promotion ledger records the original source, classification, owner and canonical assignment.
2. **Historical proof integrity:** the B4.2 snapshot attests the exact persisted shared row under a supported version.
3. **Current consumption eligibility:** a private authority fact and current source/canonical checks permit use for the fixed purpose and exact scope.

A valid promotion and snapshot establish neither present consent nor present permission. The current-read request supplies only the persisted canonical UUID. The database fixes the purpose. Matching by canonical title, alias, normalized title, respondent prose, or a replacement UUID is prohibited.

The authority identity is the exact tuple:

`(purpose_id, promotion_id, owner_id, problem_observation_id, canonical_problem_id, promotion_fingerprint, projection_version)`

The v2 authority row must bind that tuple to the immutable promotion with database-enforced composite foreign keys/unique keys. The canonical UUID and projection identity/version must agree with both the promotion and its B4.2 snapshot. A mismatch is unavailable; no fallback identity is considered.

## 2. Persisted states and semantics

### Consumption authority

The only state B4.3-B may issue is `withheld`, in the fixed purpose `qualified_validation_shared_evidence`, atomically with a genuinely new v2 promotion, shared projection, and supported B4.2 snapshot. A duplicate promotion retry does not create authority. Historical promotions with no authority remain unavailable; there is no backfill, implicit active state, or successful empty result for a missing-authority population.

`withheld` is an explicit verified exclusion. It is never positive permission and must never be interpreted as active, qualified-current, cleared, or eligible. There is no positive authority issuance, restoration, clearance, or owner-withdrawal endpoint in B4.3-B. If a later phase proposes positive authority, it requires separate approval and a new contract version.

### Permanent source restriction

Restrictions are private, append-only facts recorded in the same transaction as the source mutation that caused them. They use fixed reason codes, exact source identities, database timestamps, and only the lineage keys needed for matching. They contain no consent text, rationale prose, or respondent details. A restriction is monotonic: restoring a participant/session/experiment/canonical row never removes or weakens it.

Normative reason codes for this contract are:

`participant_withdrawn`, `participant_archived`, `shared_use_revoked`, `consent_metadata_changed`, `session_cancelled`, `session_relevance_lost`, `experiment_cancelled`, `classification_superseded`, `canonical_deactivated`, and `canonical_merged`.

These are restriction reasons, not authority states. Every one excludes affected contributions. Restrictions are never used to infer that a source was independently human-verified or that consent was verified.

## 3. Source transition matrix

Restriction capture is an `AFTER` source-change trigger or an equivalent database-owned write in the same transaction. Any failure inserting the restriction aborts the source mutation. The trigger must run for all permitted SQL mutation paths, including service-owned RPC writes; application-only capture is insufficient. “Evidence exists” means a persisted `validation_evidence_observations` row is linked by the exact FK identity. Restriction matching uses persisted IDs and owner/lineage; it does not use prose or timestamps to infer identity.

| Source table | Column and transition | Restriction code and exact scope | Transaction/coordination boundary |
| --- | --- | --- | --- |
| `validation_participants` | `status`: `active` → `withdrawn` | `participant_withdrawn`; participant UUID plus owner; every promotion whose source observation names that participant | Same participant transaction; acquire the existing B3.1 `participant` advisory lock before changing state. |
| `validation_participants` | `status`: any different allowed value (`active` or `withdrawn`) → `archived` | `participant_archived`; same scope as above | Same participant transaction and lock. Source-status restoration may occur only through the existing authorized RPC and CHECK constraints; it never clears, expires, or bypasses this restriction. |
| `validation_customer_interview_shareable_evidence` or a future explicit revocation fact | Explicit applicable shared-use revocation | `shared_use_revoked`; exact source observation and owner, then every promotion from that observation | Same transaction as the database-authenticated revocation fact. No revocation endpoint or issuer is authorized by this contract; see unresolved policy. The append-only reviewed statement row is not itself a revocation record. |
| `validation_participants` | Any change to `consent_mode`, `consent_purpose`, or `consent_captured_at`, when at least one evidence observation exists for the participant | `consent_metadata_changed`; participant UUID plus owner; every linked promotion | Same participant transaction and lock. A change may restrict use but never grant permission, even if metadata changes toward a more permissive value. |
| `validation_interview_sessions` | `status`: `draft`/`in_progress` → `cancelled` | `session_cancelled`; session UUID and exact `(experiment_version_id, participant_id, owner_id)`; every linked promotion | Same session transaction; preserve existing experiment-version then participant lock order used by the B3.1 interview-relevance/promotion paths. |
| `validation_interview_sessions` | `participant_relevance`: `target_segment_match` → `adjacent_segment` or `unknown_relevance` | `session_relevance_lost`; same exact session scope | Same session transaction and source coordination locks. Relevance restoration cannot clear the fact. |
| `validation_experiment_versions` | `lifecycle`: any permitted nonterminal state → `cancelled` | `experiment_cancelled`; exact experiment-version UUID and owner; every promotion linked to that version | Same transaction as lifecycle transition; use the existing row update serialization and do not invert canonical-registry → sorted experiment-version → participant → representative-group ordering. |
| `validation_experiment_versions` | `lifecycle`: `running`/`paused` → `completed` | **No restriction** solely for completion | Existing lifecycle guard remains authoritative. Completion alone does not invalidate evidence. Other authority, proof, source, and canonical checks still apply. |
| `validation_evidence_classifications` | Insert of a successor whose `supersedes_classification_id` equals a classification used by a promotion | `classification_superseded`; exact predecessor classification UUID, observation UUID, and owner; affected promotion only | Same classification-insert transaction, after existing experiment/participant locks. Restrict even if successor is `ai_model_suggested`, suggested, nonterminal, or otherwise non-authoritative. |
| `canonical_problems` | `status`: `active` → `candidate`, `deprecated`, or `archived` | `canonical_deactivated`; exact canonical UUID; every promotion bound to that UUID | Same canonical mutation transaction. Existing statement-level `canonical-registry` advisory lock remains first. |
| `canonical_problems` | `status` → `merged`, or `merged_into_problem_id` changes from null to non-null | `canonical_merged`; exact old canonical UUID; every promotion bound to that UUID. Never retarget to merge target. | Same canonical mutation transaction and registry lock. |

The matrix is deliberately narrow. Participant operational status is not evidence consumption authority. Changes that are not named as restrictive transitions do not mint positive authority. Later observations after participant restoration are distinct evidence and receive no inherited consumption authority. Any unrecognized/malformed source state needed to assess a promotion makes the complete requested read unavailable.

## 4. Existing source contracts and exact compatibility

The executable schema uses text plus CHECK constraints, not PostgreSQL enums:

- Participant `status`: `active`, `withdrawn`, `archived`. The table prevents DELETE but has no update guard. The current participant status RPC acquires the B3.1 participant lock and updates status.
- Participant consent fields are nullable `consent_mode` (`not_required`, `acknowledged`, `explicit`), `consent_purpose`, and `consent_captured_at`; they have no update guard. This contract treats any post-evidence change as restrictive only.
- Interview session `status`: `draft`, `in_progress`, `completed`, `cancelled`; relevance: `target_segment_match`, `adjacent_segment`, `unknown_relevance`. A trigger prevents mutation of completed/cancelled sessions. Existing RPCs update status and relevance; B3.1 coordination uses experiment then participant locks.
- Experiment lifecycle: `draft`, `ready`, `running`, `paused`, `completed`, `cancelled`. The database transition guard makes `completed` and `cancelled` terminal. Promotion currently accepts `running`, `paused`, and `completed`; this contract preserves that behavior and adds a permanent restriction only for cancellation.
- Classifications are append-only. A composite self-FK binds successor to the same observation and owner; a partial unique index allows at most one successor per predecessor. Terminals are derived from the successor graph, not timestamps. Existing promotion requires exactly one non-AI authoritative terminal and rejects a superseded selected classification. B4.3-B additionally treats any supersession of the promoted predecessor as permanently restrictive, including an AI-suggested successor.
- Canonical status CHECK values are `candidate`, `active`, `merged`, `deprecated`, `archived`; `merged_into_problem_id` is nullable and cannot self-reference. Existing promotion requires an `active` canonical. Canonical and alias writes already take the B3.1 statement-level registry lock. Current schema does not constrain merged status and merge target to agree; B4.3-B must treat `status = 'merged'` with a null target, or a non-merged status with a non-null merge target, as conflicting authority and fail the complete read. It must never follow the target.
- B3.1 promotion and B4.2 v2 proof remain immutable. Existing exact retries return the original promotion and do not attest or otherwise upgrade historical rows.

No inspected executable rule conflicts with the product decisions above. The B2.1/B2.2 files are **proposals**, not executable lifecycle features; their proposed `active` initial authority and administrative/restoration transitions are explicitly superseded for this scope by B4.3-A's `withheld`-only, no-restoration contract. This does not authorize implementing those B2 capabilities.

## 5. Classification and canonical ambiguity

For each otherwise supported promotion, current classification authority must be recomputed from the persisted predecessor graph under the read snapshot. Exactly one current terminal may be authoritative and non-AI to satisfy the historical qualification contract. Zero or multiple such terminals, malformed/cross-lineage edges, a superseded promoted classification, or any missing classification needed to prove the chain makes the **entire canonical-scoped read unavailable**. A successor that supersedes a promoted classification permanently restricts that contribution regardless of successor authority or polarity. Classification history and original promotion polarity are never rewritten.

The exact canonical UUID must exist, have `status = 'active'`, have no merge target, and have internally consistent merge state. Deactivation/merge inserts a permanent restriction. Conflicting merge state, missing target, unsupported canonical schema, or identity disagreement is an unavailable assessment, never an empty success. Aliases, titles, and merge targets are not fallback identities. A same-UUID title edit does not change identity or the old proof; title text is not a matching key.

## 6. Snapshot, completeness, and concurrency contract

The database exposes one narrow service-role-only RPC as the current-evidence boundary. Its entire assessment—including candidate discovery and exact count/cap, B3.1 promotion proof, B4.2 v2 whole-row verification, authority binding/state, every relevant restriction, source lineage/current state, classification graph, and canonical identity—must use one PostgreSQL statement snapshot (or an equivalently proven stronger transaction snapshot). A sequence of ordinary READ COMMITTED PostgREST reads is not equivalent.

The request supplies only one canonical UUID. Purpose is the fixed server constant. Candidate assessment is bounded and complete: a missing count, count/data mismatch, cap overflow, truncated page, unexpected row shape, unsupported schema/version, malformed relationship, or inability to prove that all matching candidates were considered fails the whole assessment. No partial subset may be returned as complete. A valid explicit `withheld` authority is an exclusion, but a population containing missing authority is unavailable. Corrupt/unsupported historical proof remains a whole-read failure when the promotion is otherwise a candidate; it cannot be hidden by withholding or restriction.

The public TypeScript result is sanitized to the existing allowlisted shared fields, including original polarity (`supporting`, `contradicting`, or `mixed`). No participant/respondent identity, private lineage, consent details/text, restriction reason, or internal/excluded counts may leave the boundary or appear in logs/errors. Generic errors carry no SQL detail or cause.

Restrictions and source changes commit atomically. Reads linearize at their PostgreSQL snapshot: a read snapshot acquired after a restriction transaction commits must observe it and exclude affected evidence. A read already executing on an earlier snapshot may observe the prior state. Source mutation and promotion must serialize through the B3.1 lock order—canonical registry, sorted experiment versions, participant, representative group—extended without inversion. Canonical writers retain the registry lock; participant, session, experiment and classification writers coordinate on their existing keys before writing both state and restriction. Lock and row rechecks occur after waiting where current mutable state is used.

## 7. Privacy and privilege boundary

Authority and restriction records are private, immutable/append-only, RLS-enabled, and inaccessible to `anon` and `authenticated`. Runtime roles, including `service_role`, receive no direct INSERT/UPDATE/DELETE/TRUNCATE on authority or restriction tables. Only narrow database-owned functions/triggers can create facts. The current-read RPC is executable only by `service_role`; revoke default/PUBLIC/anon/authenticated execution and audit overloads/wrappers. Functions use fixed, safe `pg_catalog`-first search paths, schema-qualified names, least privilege, and generic failures.

The current-read RPC returns only sanitized shared evidence. It does not expose private source lineage, respondent details, consent purpose/text/capture time, restriction reasons, or counts. No claim of independent human verification or consent verification is made. This contract does not claim protection against a database/schema administrator who can replace functions, triggers, grants, or proof records.

## 8. Historical compatibility and explicit exclusions

- Preserve B3.1 promotion proofs, B4.2 snapshots, fingerprints, lineage, canonical UUIDs, original polarity, and all historical rows byte-for-byte.
- Do not grant eligibility to historical promotions without explicit authority; do not backfill authority or restrictions based on guessed historical state.
- Keep the historical reader unchanged and distinguish it from the new current reader. No consumer activation or fallback from current-read failure to the historical reader is permitted.
- No positive authority issuance, restoration/clearance, owner-withdrawal endpoint, privacy erasure, survey promotion, scoring, AI calls, Knowledge Evolution integration, historical backfill, or production consumer activation.
- No production database access or mutation is authorized by this contract.

## 9. Acceptance criteria for B4.3-B

Implementation is reviewable only when all are true:

1. A new promotion writes exactly one bound `withheld` authority fact atomically; injected authority-write failure rolls back the shared row, promotion, and snapshot.
2. Duplicate retries create no new proof or authority. Historical promotion rows remain unchanged and unavailable without authority.
3. Every transition in the matrix captures an exact permanent restriction in the same source transaction; restoration cannot delete, overwrite, or bypass it. Experiment completion alone creates none.
4. Classification zero/multiple terminals and canonical/merge conflicts fail the whole read. No alias/title/target fallback occurs. Three polarities pass unchanged.
5. One database snapshot establishes complete candidates, proof, authority, restrictions, source state and canonical state. Cap/truncation/schema/proof/authority failures return one generic unavailable error, never successful empty/partial evidence.
6. Effective grants, RLS, function ownership/search paths, wrappers, direct DML/TRUNCATE and service-role-only RPC execution are checked in disposable PostgreSQL/PostgREST tests.
7. Concurrent mutation/read tests demonstrate post-commit exclusion, deterministic lock ordering, rollback atomicity, no resurrection, and no deadlocks against the B3.1 promotion path.
8. Focused TypeScript tests verify server-only import, request canonical UUID only, fixed purpose, sanitized output, all polarity values, and generic failure behavior.
9. Existing historical reader and B3.1/B4.2 proof tests remain unchanged and pass. Documentation and migration contract versions agree.

## 10. Unresolved policy decisions and implementation gate

1. **Shared-use revocation issuer and persisted source:** the existing reviewed shareable-evidence table is append-only and has no revocation field/event or revocation RPC. The product decision requires a future explicit applicable revocation to restrict, but does not authorize an owner-withdrawal endpoint or identify another issuer. B4.3-B may define the database fact and ensure that any approved source mutation is captured, but must not create an HTTP endpoint, infer revocation, or treat metadata as positive permission. A separate human decision is required before any revocation-producing operation is exposed.
2. **Positive authority:** issuer, evidence standard, consent/authorization proof, and approval workflow are intentionally unspecified and disabled. `withheld` cannot be upgraded or cleared by any B4.3-B function.
3. **Historical restrictions:** no reliable source-state snapshot is present for all historical promotions. Do not synthesize restrictions or authority from current values; missing authority already makes historical evidence unavailable.
4. **Administrator threat model:** database/schema administrators can replace the enforcement boundary. Independent authority external to such administrators is not designed here.
5. **Retention/erasure:** permanent restrictions may retain opaque identifiers. Their retention and any legal erasure exception require separate privacy review; B4.3-B must not weaken proof immutability or introduce deletion.

**Implementation gate:** GO for a separate B4.3-B design/review against this restrictive contract. NO-GO for exposing any shared-use revocation operation until item 1's issuer and mutation authority are separately approved. No positive authority or consumer activation is approved.
