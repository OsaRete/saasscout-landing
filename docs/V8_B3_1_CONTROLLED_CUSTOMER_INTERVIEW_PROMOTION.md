# V8-B3.1 — Controlled Customer Interview Evidence Promotion

## Boundary

B3.1 adds one explicit server command after the existing B2 preparation pipeline. A successful command commits exactly one sanitized `problem_observations` row and one final private `validation_evidence_promotions` row in the same transaction. It does not invoke AI, create canonical records, or write downstream intelligence.

Canonical normalization and resolution remain in TypeScript under `v8-b3.0.2-exact.1`. PostgreSQL only compares the complete persisted subject, hypothesis, active/inactive canonical, and alias authority snapshot supplied by the server; it does not normalize or resolve canonical identity.

## Finality

A final source is unique by owner, source observation, policy, and non-null result. A final representative group is unique by owner, participant, canonical problem, polarity, and policy. The deterministic fingerprint binds source observation, authoritative classification, canonical problem, polarity, policy, resolver, and projection versions. Exact retries return the existing pair. A changed classification, polarity, or canonical result requires an explicit future correction workflow and cannot create a second pair.

## Lock order

The versioned global advisory order is:

1. `canonical-registry:v1`;
2. experiment-version UUID;
3. participant UUIDs in ascending textual UUID order if a command ever spans more than one participant;
4. owner + participant + canonical problem + polarity + policy representative group.

Canonical table mutations acquire the registry lock in `BEFORE STATEMENT` triggers, before any row tuple changes. Experiment lifecycle, session status/relevance, and participant status coordinators acquire their domain locks before issuing `UPDATE`. Observation and classification `BEFORE INSERT` triggers coordinate before a new tuple exists. No membership-changing `BEFORE ROW UPDATE` trigger waits for an advisory lock.

## Projection and privacy

The shared row contains only canonical identity/title, a domain-separated fingerprint, fixed Customer Interview source type, the approved shareable statement, structured polarity, authoritative observation time, and projection version. Owner, participant, session, experiment, hypothesis, classification, raw observation content, notes, review metadata, and command identifiers remain private.

## Merge gate

`.github/workflows/validation-b31-database.yml` is mandatory before merge. It starts disposable local Supabase, resets the complete migration chain, and executes the real SQL and independent-connection concurrency suite. A missing environment, skip, deadlock, statement timeout, child timeout, SQL assertion, or nonzero client result fails that gate.
