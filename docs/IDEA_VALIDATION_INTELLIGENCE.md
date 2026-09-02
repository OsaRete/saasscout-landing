# Idea Validation Intelligence (V7)

## Purpose and boundary

V7 adds an Intelligence-layer interpretation of real-world Validation evidence already collected by Customer Interviews and Surveys. Human observations and raw survey answers are evidence; deterministic counts are derivations; model output is interpretation. The three are stored and presented separately. AI interpretation is never an independent observation and V7 writes nothing to Data Moat or Knowledge Evolution tables.

The six product dimensions are exactly: **Problem Evidence**, **Target Customer Evidence**, **Problem Frequency / Severity**, **Existing Behavior / Workarounds**, **Behavioral Intent**, and **Commercial Evidence**. Each uses `strong`, `moderate`, `limited`, or `insufficient`; no score, probability, statistical claim, or binary validation verdict exists. The overall label is bounded to `promising`, `mixed`, `weak`, or `inconclusive` and cannot replace the dimensions.

## Deterministic evidence snapshot

The authenticated server resolves the owned subject and current hypothesis version, then constructs schema version 1 with:

- subject ID/label and exact hypothesis ID, root ID, version, target segment, claim, expected behavior, commercial assumption, and three criteria lists;
- factual respondent, participant, observation, plan-version, experiment-version, completed-session, and participant-relevance counts;
- interview experiment-version provenance and pseudonymous participant groups containing only explicit `validation_evidence_observations` plus current authoritative classifications;
- survey plan definitions and version provenance, with each submission represented as one pseudonymous respondent group containing its version-linked answers.

Interview session `notes`, participant aliases, contact details, and private working notes are never queried. Multiple observations for a participant remain one participant group. Multiple answers in a submission remain one respondent group. All reads include the authenticated owner scope; child rows are fetched only through owner-scoped observation/submission IDs. Discover, Scan, Weekly, Evidence Alignment, and other internal intelligence are excluded.

Canonical JSON compares object keys with locale-independent lexical ordering while preserving semantically ordered arrays. Snapshot construction sorts every unordered collection first: experiment versions and Survey Plan Versions by version number then ID; sessions by `created_at` then ID; observations by `observed_at` then ID; classifications by `classified_at` then ID; submissions by `submitted_at` then ID; answers by submission ID, question reference, then answer ID; and independence groups and provenance IDs lexically. Survey question order and answer-internal array order remain untouched because they are product-significant. SHA-256 over the canonical snapshot is the snapshot hash. A second full-evidence digest inside the snapshot means changes outside the selected excerpts still change that hash. A deterministic GET may rebuild this snapshot to compare its hash, but it never invokes a model. New evidence changes the hash and produces “New evidence available”; an equal hash is “Up to date.”

The snapshot keeps full authoritative totals while bounding model/persistence material deterministically to 20 interview participant groups × 6 observations, 20 Survey respondent groups × 6 answers, 10 Survey Plan Versions × 15 questions, 320 canonical characters per evidence/question excerpt, and 50 provenance version IDs per family. `selection` reports selected totals and `truncated`; `counts` always describes the full owned evidence state. `evidenceStateDigest` covers the complete normalized evidence state, including material excluded by selection. A final 220,000-byte application guard remains below the 262,144-byte database constraint and returns a controlled snapshot error before claim/model invocation rather than an opaque persistence failure.

## Runs, authority, history, and cost

`validation_intelligence_runs` stores immutable lineage, snapshot/hash, server-allocated analysis version, provider/model audit names, status, validated result sections, bounded failure code, and timestamps. Completed and failed history cannot be changed or deleted. Browser projections omit the snapshot, provider/model metadata, and failure diagnostics.

Only an explicit authenticated POST means Analyze/Update. The browser supplies only the subject route ID. A security-definer claim locks the owned subject, verifies exact hypothesis lineage, and uses database time to grant a 10-minute running lease. A fresh identical running run returns `in_progress`; a completed identical run is reused; a failed identical run permits a deliberate new version; and a stale running run is atomically retired as `failed` with `running_lease_expired` before one replacement version is allocated. The subject lock serializes both normal claims and stale recovery, while the partial unique index remains a second invariant. The provider request has an eight-minute application timeout, leaving two minutes for persistence/transport before lease recovery. There is no heartbeat, scheduler, or cleanup job. There are no calls on page load, refresh, interview observation, or survey submission. V7 performs one model attempt and no automatic quality retry (maximum attempts: 1).

The model path reuses the established OpenRouter-compatible OpenAI client and `openai/gpt-4.1-mini` convention without coupling to Weekly Intelligence. The compact input is `{ contract, evidenceSnapshot }`; the contract lists required dimensions, state taxonomy, overall labels, and required synthesis/recommendation sections. No unrelated internal intelligence or unnecessary PII is sent.

## Output quality contract

The required JSON contains all six `{ state, summary, evidenceBasis[] }` assessments, `whatSupportsHypothesis`, `whatContradictsHypothesis`, `whatRemainsUncertain`, bounded `overallAssessment`, and `recommendedNextExperiment { goal, reason, suggestedFamily, targetEvidenceGap }`. The authoritative parser rejects malformed/missing sections, invalid states or labels, oversized/non-text entries, numeric validation-score fields, success-probability fields, and forbidden probability/statistical/market-validation claims. Invalid or partial output is never persisted as completed.

A provider or validation failure marks only the run failed with a safe code. It does not mutate human evidence, hypothesis, experiment lifecycle, or knowledge tables. Diagnostics contain IDs, counts, hashes, states, and provider lifecycle only—never raw evidence, notes, PII, public tokens, or full model output.

The provider boundary also emits one bounded internal failure category for operations: missing configuration, rejected/rate-limited/server responses, timeout/transport failure, empty or unparsable response, authoritative output-contract failure, or completion-persistence failure. It may include the provider HTTP status and elapsed milliseconds, but never an exception message or provider response body. The persisted/public failure remains `analysis_unavailable`; this diagnostic taxonomy does not change the API or run-state contract.

## UI and recommendation semantics

The workspace first shows authoritative evidence counts, staleness, explicit Analyze/Update action, and bounded history. The report carries the visible **AI interpretation — not human evidence** boundary, six compact qualitative cards, and first-class supporting, contradicting, and uncertainty sections. Sparse/empty evidence is named without claiming representativeness. Failure stays local and retryable.

“Recommended next experiment” is advice about the most material evidence gap only. V7 never creates an experiment or changes a hypothesis. AI-assisted experiment/question generation remains V7.1; shadow and controlled Data Moat promotion remain V8 and V9.
