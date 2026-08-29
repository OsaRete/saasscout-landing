# Idea Validation authenticated server API (V3)

## Decision and reused authority patterns

V3 adds the private command boundary between V2 persistence and a future V4 workspace. It reuses SaaSScout's `requireUser` bearer-token verification, the `server-only` admin-client factory, explicit owner predicates used by Saved Ideas and Discover actions, safe public errors, and narrow PostgreSQL RPCs used by Scan and Weekly. The user-context client authenticates; only afterwards does the server construct a service-role client. Browser code cannot import the repository because every server module imports `server-only`.

The internal design review rejected generic table CRUD, browser database writes, client ownership fields, process-local locking, unverified opaque provenance, raw database errors, and root-then-version multi-request creation. The chosen layers are route handler → `ValidationService` parsing/domain checks → `ValidationRepository` owner checks/projections → service-role PostgREST/RPC → V2 constraints.

## Commands and routes

All routes require `Authorization: Bearer <Supabase access token>`, derive the owner from `auth.getUser`, return `{data}` or a stable `{error:{code,message}}`, and are dynamic Node.js route handlers.

| Route | Operation |
| --- | --- |
| `GET/POST /api/validation/subjects` | List safe subject summaries; create a user-entered or verified upstream subject. |
| `GET/POST /api/validation/subjects/:id` | Read one owned subject; append a verified typed context link. |
| `POST /api/validation/subjects/:id/hypotheses` | Atomically create a logical hypothesis and version 1. |
| `POST /api/validation/hypotheses/:id/versions` | Append an immutable hypothesis version. |
| `POST /api/validation/subjects/:id/experiments` | Atomically create an experiment and version 1. |
| `POST /api/validation/experiments/:id/versions` | Append an immutable experiment version. |
| `POST /api/validation/experiment-versions/:id/transition` | Optimistically transition from `expectedLifecycle` to `targetLifecycle`. |
| `POST /api/validation/participants` | Create a privacy-minimized participant. |
| `POST /api/validation/observations` | Append raw evidence against an exact experiment version. |
| `POST /api/validation/classifications` | Append a user/deterministic/server classification or correction. |

There are no DELETE endpoints and no arbitrary PATCH endpoint. Read projections omit `owner_id`; V4 need not know table grants or service metadata.

## Authority and integrity

Public schemas reject ownership, version, lineage, persistence timestamp, and lifecycle timestamp fields. Strings, arrays, object JSON, and request bodies are bounded (4,000-character general text, 50 list members, 32 KB per JSON object, and 64 KB declared request body). Oversize data is rejected, never truncated.

Subject provenance supports the V2 typed set and verifies `user_id` on Saved Ideas, Opportunities, Discover items, Scans, and Weekly runs. Unknown/deferred provenance is rejected. A user-entered subject must have no source type, row ID, or source version. An upstream subject must have a nonblank row ID and its initial `source_type` must exactly equal `creation_origin`; supporting-context links remain a separate command. Context is never evidence.

Hypothesis validators reuse the V1 testability rules. Root plus first version and all later allocations use a database transaction. The append RPC locks the owned logical root before calculating the next number, making concurrent requests serialize. A predecessor must be in the same owner/subject/logical chain and is never updated.

Only Beta `customer_interview` and `survey` experiment designs are accepted publicly. Landing/waitlist and social execution remain deferred. Experiment versions derive the hypothesis and subject chain from the owned hypothesis-version row. Allocation locks the experiment root. Lifecycle uses compare-and-transition optimistic concurrency; stale requests safely conflict. Database time sets `started_at` once and terminal timestamps atomically, while the V2 trigger remains final authority.

Participants store no contact fields. Experiment-pseudonymous participants require an owned experiment. Evidence accepts only `experimentVersionId` for lineage; subject, hypothesis, hypothesis version, and experiment are loaded and inserted by the RPC. Participant ownership and experiment scope are checked before insertion. `observedAt` is explicitly a source assertion; collection and creation time remain database-owned.

An owner-scoped ingestion key makes retries deterministic. The RPC first attempts `INSERT ... ON CONFLICT DO NOTHING`; PostgreSQL waits for a concurrent winner, after which the retry loads that row. It returns the existing observation with `duplicate=true` only when experiment version, participant, origin, modality, behavioral event, observed time, source type/reference, collection authority, content, optional fingerprint, participant independence key, independence relationship, and anonymous-uncertainty flag are all NULL-safely identical. Any material difference is an `idempotency_conflict`. Database-generated ID/timestamps and lineage derived from the experiment version are excluded. Fingerprints are optional, not unique, not computed, and never interpreted as corroboration; identical content from different participants remains representable with different ingestion keys.

Classifications are append-only. The browser route intentionally excludes `ai_model_suggested`; V3 performs no model call. The DB constraint still prevents any future AI suggestion from being authoritative. Corrections reference a same-owner, same-observation predecessor. The unique successor constraint arbitrates concurrent corrections and is mapped to a safe conflict.

## Transaction and database security

Migration `20260829000000_validation_server_commands.sql` adds seven narrow functions for atomic subject creation, root/version creation, locked version appends, optimistic lifecycle transitions, and idempotent evidence creation. Each function has explicit arguments and a fixed `search_path`; none is `SECURITY DEFINER`. Execution is revoked from `public`, `anon`, and `authenticated`, then granted only to `service_role`. V2 tables, RLS, policies, and browser grants are unchanged.

Cross-owner references are owner-filtered and deliberately become `not_found`, avoiding existence disclosure. Repository failures never return SQL messages, constraint names, hints, keys, stack traces, or payloads. Operational logging emits only a command failure category; it does not log context snapshots, participant data, or evidence content.

## Explicit boundaries and deferrals

V3 has no UI/sidebar change, interview or survey workflow, CSV import, hosted survey, landing/waitlist, public endpoint, social ingestion, behavioral webhook, email/outreach, AI/model execution, interpretation, scoring, binary validation result, destructive deletion, Data Moat promotion, Knowledge Evolution write, canonical-problem write, or modification to Evidence Alignment, Scan, Discover, Weekly, Saved Ideas, or opportunity generation.

V4 can add browser workspace reads against these projections. V5/V6 should add specialized interview/survey execution, robust import fingerprinting, and separately reviewed public ingress rather than broadening these routes. V7 owns interpretation. V8/V9 own reviewed promotion. Participant contact protection, privacy deletion, richer read aggregates, dedicated rate limits, and expanded provenance adapters remain explicit future reviews.
