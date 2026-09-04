# Idea Validation Surveys (V6)

## Purpose and evidence boundary

Surveys are a bounded Validation-domain experiment for testing an explicit hypothesis with structured responses from real people. A Survey provides breadth; a Customer Interview provides a private, conversational record with follow-up context. Neither experiment family creates a validation verdict. Human responses—not AI output—are the evidence.

Survey responses remain in the private Validation evidence layer. V6 performs no model calls, classification, sentiment analysis, validation scoring, Knowledge Evolution write, or Data Moat promotion. Interpretation is deferred to V7; reviewed promotion is deferred to V8/V9.

## Immutable plans

A plan contains a participant-safe title, purpose, and 1–15 user-authored questions; 5–10 high-value questions is recommended. Supported types are single choice, multiple choice, short text, long text, and bounded number. Branching, uploads, executable content, and contact fields are not supported. Creating an edit appends a version under a lock on the logical experiment root. Old responses stay linked to the exact plan and question IDs answered.

Choice authoring keeps visual examples separate from draft values. New single- and multiple-choice questions start with empty editable rows, and the participant-facing labels must be deliberately entered before saving. The authenticated command authoritatively requires 2–12 non-empty, distinct labels after whitespace and case normalization. This prospective authoring rule does not reinterpret or rewrite any prior plan, publication, submission, or answer.

## Public-link security

Publishing creates 32 random bytes and returns only the base64url token to the authenticated owner. The database stores its SHA-256 hash. The public route is `/validation/survey/<opaque-token>`. It exposes only title, purpose, questions, and a privacy notice—never owner or lineage IDs, founder notes, interview data, other respondents, or aggregate results. Publishing a replacement revokes the prior active link; revocation immediately prevents resolution and submission. All tables deny anonymous mutation. A narrow server endpoint uses the service-role client and derives lineage from the publication.

## Raw responses and respondent independence

One submission is one respondent interaction and owns zero or more raw structured answers. The database derives owner, subject, hypothesis/version, experiment/version, plan/version, publication, respondent ID, origin, and timestamp. Answers retain the question-local ID, question type, and exact JSON value. They are not copied into interpreted evidence observations, so eight answers never masquerade as eight independent respondents.

Direct PII is neither requested nor required. The public notice warns against sensitive personal information. V6 does not provide email, phone, contact, CRM, lead collection, manual entry, CSV import, or bulk import.

## Deterministic summaries

The authenticated workspace shows submission/respondent counts and literal choice counts from persisted responses. Free text remains raw and receives no automatic themes. Counts are factual summaries, not scores or commercial-success claims.

## Idempotency and abuse limitations

The browser generates a request UUID, not an authoritative record ID. The server hashes a canonical answer payload. The database uniqueness boundary is publication plus idempotency key: identical retries return the original submission; a changed payload conflicts. Request bodies, question/answer counts, text, options, and numeric ranges are bounded.

A small process-local limiter allows ten requests per minute for a truncated network-address/token bucket. High-entropy tokens resist guessing and malformed tokens fail safely. This limiter is intentionally modest: it is not distributed across instances, durable, CAPTCHA, or sophisticated bot detection. Production scale should move the same boundary to shared infrastructure without widening database grants.

## Database authority and concurrency

The public API is the first validator, but the submission RPC independently validates the authoritative answer array before inserting anything. It rejects malformed or duplicate question references, unknown or missing required questions, wrong JSON types, invalid or duplicate choice selections, bounded-text violations, numeric range violations, and unsupported plan question types. The question type written with each raw answer is always derived from the immutable plan rather than from public input. Submission and answer inserts share one database transaction, so any validation or persistence error leaves neither a partial submission nor partial answers.

Survey Plan history is intentionally linear. While holding the logical experiment-root lock, the first plan requires no predecessor and every later plan must supersede exactly the latest plan. The same root-lock convention serializes publication replacement: the command revalidates the owned plan after acquiring the lock, revokes the active publication, and inserts its replacement before commit.

Submission takes a `FOR SHARE` lock on the still-published capability row. Revocation and replacement require an update lock on that row. Therefore a submission that acquired the shared lock while the capability was valid may finish atomically before revocation; once revocation commits, later submissions cannot match the published capability. The partial unique index remains a second structural guarantee that only one publication is active per logical experiment.

## Experiment lifecycle admission

Public response collection is allowed only while the exact publication-bound experiment version is a `survey` in the `running` lifecycle. The public projection treats draft, ready, paused, completed, and cancelled experiments as unavailable without revealing internal lifecycle details.

Submission locks the published capability row first with `FOR SHARE`, then locks the exact running experiment-version row with `FOR SHARE`. V3 lifecycle transitions update only that experiment-version row and never acquire a publication lock, so there is no reverse lock order: an already-admitted submission may finish before a waiting transition, while a transition that commits first makes later submissions fail safely. Publication replacement continues to use the logical experiment-root lock before updating the publication row.

A publication's complete lineage is immutable: ID, owner, subject, experiment and version, hypothesis and version, Survey Plan version, token hash, and publication time cannot change. Only the database-controlled `published` to `revoked` state transition and its `revoked_at` timestamp are mutable.

Creating a newer linear Survey Plan does not revoke the currently published older plan. An explicit publish action must target the latest plan; only after that check succeeds does it atomically revoke the prior capability and publish a new token for the latest plan.
