# Idea Validation workspace (V4)

## Purpose and routes

V4 is the first product UI for testing an idea with evidence from real people or observed behavior before significant build investment. It adds authenticated `/validation`, `/validation/new`, and `/validation/[id]` destinations without changing the product vision or persistence schema.

The index explains the evidence boundary and lists grounded owner-scoped subject summaries: origin, date, latest hypothesis, experiment count/lifecycles, and observation count. Its zero state invites users to enter their own idea or begin with SaaSScout context.

## Creation and entry points

The lightweight create flow creates only a subject, then opens its workspace. A user-entered subject uses `user_entered`. The bounded source path supports `discover`, `scan`, `weekly`, `saved_idea`, and `opportunity`; V3 verifies ownership. Saved Ideas includes a query-parameter entry point. Dedicated selectors and entry buttons in Discover, Scan, Weekly, and Opportunities are intentionally deferred to avoid coupling those products in V4.

Source snapshots are labeled **Context — not validation evidence** before creation and in the workspace. They are provenance only and never become observations.

## Workspace behavior

The workspace shows subject provenance, immutable hypothesis history, experiment shells, factual evidence counts, existing safe observation metadata, recorded classifications, and the explicit interpretation deferral. Hypothesis revisions append a version through V3. Customer Interview and Survey are the only exposed experiment families. Material experiment design revision is not exposed in V4; a future simple flow must append through the V3 version command.

Lifecycle controls expose only valid transitions and send `expectedLifecycle` plus `targetLifecycle` to the V3 optimistic transition command. A conflict refreshes the projection. Terminal versions expose no actions and timestamps remain server-owned.

The UI has no participant/contact management. It displays no validation score, binary result, commercial probability, invented response, or browser-derived classification. Contradicting evidence is a legitimate classification, not an application failure.

## Authority and truthfulness boundary

All reads and writes use authenticated `/api/validation/**` endpoints. The enriched subject and index projections are owner-filtered server read models, not physical nine-table dumps. Browser payloads never provide ownership, versions, lineage, or authoritative timestamps. There are no direct browser Validation table mutations, model calls, Data Moat promotion, Knowledge Evolution writes, canonical problem writes, database migrations, or remote Supabase commands.

Evidence Alignment answers what SaaSScout already knows that aligns or conflicts with an idea. Idea Validation answers what real people and behavior have shown. Discover signals, Scan evidence, Weekly sources, Saved Ideas, Opportunities, AI output, and Evidence Alignment remain context—not Validation observations.

## Deferred work

V5 owns Customer Interview execution, participants, questions, notes, and consent workflows. V6 owns Survey building, distribution, response collection/import, and public ingress. V7 owns multidimensional interpretation; it must not equate volume or lifecycle with evidence quality. Later reviewed work owns promotion into the Data Moat and Knowledge Evolution.
