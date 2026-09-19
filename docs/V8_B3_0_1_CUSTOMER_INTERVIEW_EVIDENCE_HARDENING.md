# V8-B3.0.1 — Customer Interview Evidence Production Hardening

## Incident and root cause

The production report was a private-only observation followed by an approved-shareable observation in the same interview. The browser did **not** retain or reuse the first command key: B3.0 generated a new UUID and observation timestamp inside every click handler invocation. The owner-scoped unique index on `(owner_id, ingestion_key)` therefore did not make distinct observations in one interview collide.

The actual difference between the two requests was the approved shareable statement. The B3.0 RPC has the intentionally fixed `search_path=public`, but invoked `digest(...)` without a schema. Managed Supabase installs pgcrypto in `extensions`; the private-only path never evaluates `digest`, while the approved-shareable insert does. PostgreSQL therefore returned undefined-function error `42883`. The repository mapped every RPC error—including `42883`—to HTTP 409 `idempotency_conflict`, obscuring the database configuration fault.

This defect was introduced by B3.0's shareable-evidence hashing path. The underlying observation idempotency contract predates B3.0 and remains valid.

## Request and authority trace

1. `InterviewObservationForm` collects private content, category, statement kind, optional classification, and optional exact reviewed shareable statement.
2. The authenticated client POSTs intent to `/api/validation/interview-observations`; it supplies no owner, lineage, participant authority, canonical identity, or promotion state.
3. The route parses JSON only after `validationHandler` authenticates the bearer and constructs the server service with the authenticated user ID.
4. The service allowlists category and statement kind, validates the exact-review contract, constructs the bounded private `observation_content`, and maps browser command identity to RPC parameters.
5. The repository verifies that the session is owned and calls `validation_record_interview_observation_v2` with server-derived `p_owner_id`.
6. The RPC re-reads the owned Customer Interview session, derives all subject/hypothesis/experiment/participant lineage, inserts the immutable private observation, then optionally inserts the separately bounded private shareable projection.
7. The partial unique index `validation_evidence_ingestion_uidx` protects `(owner_id, ingestion_key)` whenever the command key is non-null.
8. On conflict, the RPC accepts only the same session, observed time, complete private JSON payload, and exact shareable presence/content/hash. Changed private content, shareable presence, or shareable text fails closed. A false approval with a statement fails before insertion.
9. The route returns only the bounded server response/error contract. It does not expose PostgreSQL details.

## Corrected command lifecycle

A command UUID and observed time are now created once, on the first submission attempt, and retained through failures. This makes an uncertain network retry the same command with the same immutable payload. Controls are disabled while pending. The identity rotates only after the observation, optional classification, authoritative refresh, and completion path confirm success; then every observation-specific field resets for the next logical command.

The database semantics remain:

- same owner + command key + identical private and shareable payload: return the existing observation as an exact retry;
- same owner + command key + any immutable payload difference: raise `23505` and roll back;
- a new command key in the same or another interview: insert a new observation;
- a shareable statement without literal exact-statement review: reject before persistence.

The client command UUID is intent, not authority. It cannot select owner, participant, experiment/hypothesis lineage, canonical identity, classification authority, or promotion state.

## Atomicity

`validation_record_interview_observation_v2` is one PostgreSQL function invocation with no internal transaction boundary. PostgreSQL executes the observation insert, exact retry checks, and optional shareable insert in the caller's single statement transaction. Any exception—including the former `42883`, an idempotency `23505`, review `23514`, constraint failure, or hash failure—rolls back all writes made by that invocation. The source/shareable owner-scoped foreign key and unique source constraint additionally prevent orphan or duplicate projections.

Consequently, the reported failed approved-shareable request could not leave a second observation: its observation insert was rolled back when unqualified `digest` failed. It could not mutate the first immutable observation. The repair qualifies `extensions.digest` in a new additive `CREATE OR REPLACE FUNCTION` migration and changes no data, table, constraint, RLS policy, or grant.

## Read-only production verification

After deployment, an operator may run the following read-only query for the reported subject. It reveals identifiers and private statements, so run it only in the authorized Supabase SQL editor and do not paste results into public logs.

```sql
select
  o.id as observation_id,
  o.interview_session_id,
  o.ingestion_key,
  o.observed_at,
  o.collected_at,
  o.observation_content,
  s.id as shareable_id,
  s.statement,
  s.statement_sha256,
  s.review_confirmation,
  s.reviewed_at
from public.validation_evidence_observations o
left join public.validation_customer_interview_shareable_evidence s
  on s.source_observation_id = o.id
 and s.owner_id = o.owner_id
where o.subject_id = 'a6265774-665c-45a0-90e0-8645770a14cf'::uuid
  and o.origin = 'human_interview'
  and o.modality = 'interview_observation'
order by o.collected_at, o.id;
```

Expected pre-repair incident state: one successful observation and no partial row from the failed shareable request. Expected after each successful regression command: exactly one new observation and at most one matching shareable child.

## UX and responsive findings

Observation submission now disables all command inputs and the action, shows a compact spinner with “Recording immutable observation…”, preserves all entered fields and approval on failure, maps genuine idempotency conflicts to bounded recovery guidance, refreshes authoritative data on success, and resets content/category/kind/classification/shareable/review/command identity afterward.

Interview transition errors now have operation-local state. A later successful start/update clears the stale notes error without clearing unrelated workspace failures.

The two areas observed during DevTools docking are the single `Evidence` and `Classifications` aside. At `xl` the two-column grid places that aside beside the interview workspace; below `xl` the grid becomes one column, placing the same aside between the workspace and Validation Intelligence. There is one render branch, no `hidden`/visibility rule, no viewport JavaScript, no clipping, and no duplicated data. This is intentional responsive repositioning with identical semantic availability, so B3.0.1 makes no layout change.

## Boundaries

The repair performs no AI/model/embedding/external call and does not write or add write paths to `problem_observations`, `validation_evidence_promotions`, canonical registry, Problem Intelligence, evolution snapshots, opportunities, recommendations, or Weekly Intelligence. Customer Interview family enforcement and camel-case `statementKind` plus legacy `statement_kind` adaptation remain unchanged and covered by regression tests. No production mutation or migration execution was performed while preparing this change.
