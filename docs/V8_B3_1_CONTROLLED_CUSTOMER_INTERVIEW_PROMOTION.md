# V8-B3.1 — Controlled Customer Interview Evidence Promotion

## Boundary and singular canonical authority

B3.1 is an explicit authenticated command for one source observation. The browser supplies only the observation ID. The database returns one statement-level, owner-and-participant-scoped projection of the exact persisted rows consumed by the existing TypeScript B1/B2 preparation pipeline. `resolveValidationCanonicalProblem` and the shared Knowledge `normalizeProblemText` implementation remain the sole canonical normalization/resolution authority (`v8-b3.0.2-exact.1`). PostgreSQL does not normalize identity or implement a second resolver.

The server passes the exact raw authority snapshot with the derived observation, classification, canonical ID, and polarity. Inside the write transaction, the RPC acquires registry and private participant/group coordination locks, rebuilds the same raw database projection, and fails if it differs. It also rechecks the immutable raw subject/hypothesis identity and current active canonical row. Thus context JSON, browser IDs, respondent/shareable prose, fuzzy matching, embeddings, and AI never become authority, while drift between server resolution and commit fails closed.

## Membership-changing writer audit and locks

The private lock order is: canonical registry domain, participant membership domain, then representative group domain (`owner + participant + canonical + polarity + policy`). Promotion acquires all three before comparing the authority snapshot or relying on representative selection. The participant ID is never projected into shared storage.

The following writers can change representative membership and coordinate through database triggers: observation insertion; authoritative classification insertion/supersession; participant status updates; interview session status/relevance updates; and experiment lifecycle updates. Experiment transitions acquire affected participant locks in UUID order. Canonical problem or alias inserts/updates/deletes acquire the registry lock through statement triggers, including controlled bootstrap without changing bootstrap semantics. Immutable subject labels, hypothesis versions, observations after insertion, classifications after insertion, shareable evidence, and terminal session history cannot independently mutate group membership.

## Eligibility, shareable evidence, and projection

Only Customer Interview observations with complete lineage, eligible lifecycle and target relevance, one terminal non-AI authoritative supporting/contradicting/mixed classification, current B1 representative status, and an immutable B3.0 V1 statement approved with `human_reviewed_for_shared_evidence_use` can pass. The statement hash is recomputed in the transaction.

The shared allowlist is canonical ID/title/normalized title, the exact approved statement in schema-required summary/evidence fields, fixed source type `validation_customer_interview_promotion_v1`, source observation time, structured polarity, and deterministic fingerprint. No Validation IDs, owner, participant identity/PII, session, experiment, hypothesis, classification, raw observation, notes, context, rationale, arbitrary metadata, AI material, or review metadata enters `problem_observations`. Exact lineage remains private in `validation_evidence_promotions`. No shared independence token is introduced.

## Atomicity, identity, finality, and consistency

The fingerprint is SHA-256 over the domain prefix, source observation ID, terminal classification ID, canonical problem ID, polarity, B1 policy, resolver, and projection versions. It excludes prose, participant identity, timestamps, randomness, and B2 hashes.

A successful V1 promotion is final for `owner + source observation + policy`. Before creating a shared row, the RPC reads any existing final promotion for that identity. Exact current authority returns the same IDs. Changed classification, polarity, canonical identity, fingerprint, or approved projection returns `promotion_correction_required`; it creates neither P2 nor L2 and does not use ledger supersession. Correction/withdrawal is deferred to a future reviewed contract.

An older non-final preparation-ledger row for the same observation/policy also fails closed before the shared insert because V1 deliberately does not reinterpret or supersede preparation history.

The first request inserts one observation and one already-final ledger row in one PostgreSQL statement transaction. A composite result/canonical FK proves canonical consistency, a unique result index prevents shared-result reuse, and a final-group unique index prevents a later source observation from contributing a second row for the same owner-private participant/canonical/polarity/policy group. Partial, mismatched, or colliding state fails closed. The generic conflict-ignoring writer is not used.

## Manual UI and downstream stop

The existing Evidence region shows the action only for a server-prepared plausible candidate or prior success. Click-time revalidation remains authoritative. Pending, success, and bounded failure are local and accessible; success follows authoritative refresh. There is no promotion on create, classify, lifecycle transition, save, analysis, page load, B2 dry-run, or background work.

B3.1 writes only `problem_observations` and `validation_evidence_promotions`. It does not create/change canonical registry state, bootstrap state, Problem Intelligence, evolution snapshots, opportunities, recommendations, or Weekly Intelligence. Surveys and non-Customer-Interview evidence remain unsupported.

## Database verification and rollout

Migration `20260923000000_controlled_customer_interview_promotion.sql` is undeployed and is repaired in place. The dedicated test uses only `B31_PROMOTION_TEST_DATABASE_URL`, requires an explicit disposable confirmation, rejects hosted Supabase endpoints, and accepts loopback hosts only. CI starts local Supabase, applies all repository migrations with `supabase db reset --local`, and runs `npm run test:validation-b31-db`.

Deploy only after the disposable database suite passes. Apply the migration before application code, verify grants/constraints and concurrency in staging, then release the manual UI. No production migration or promotion is part of this change.
