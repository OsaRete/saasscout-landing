# Scan Server Workflow Foundation

PR 8 introduces an isolated, server-only workflow foundation for experimental Scan execution. It does not replace the legacy Scan UI or persist a Scan Intelligence Artifact.

## Current browser orchestration audit

The current browser-controlled flow starts in `app/scan/page.tsx`: the client extracts file text through `/api/extract-file-text`, calls `/api/analyze-evidence`, then `/api/generate-opportunities`, optionally calls `/api/solution-intelligence`, and performs existing Supabase writes for scans, evidence analyses, sources, and opportunities. The legacy routes remain public-contract compatible and continue to own their current response shapes.

Known partial-state risks:

- The browser can complete evidence analysis but fail before opportunity generation.
- Opportunity persistence can succeed after a scan row exists while later solution intelligence fails.
- File extraction, analysis, generation, and persistence do not share one processing history.
- Legacy route logs are route-local, so stage timing cannot be reconstructed as one execution.
- Derived analysis can be passed by the client in legacy paths, so PR 8 keeps the server workflow isolated and internally derives the Solution Intelligence context.

## Architecture

Target future architecture:

`authenticated request → plan enforcement → evidence ingestion → Problem Intelligence → diagnostics → calibration → Solution Intelligence → Scan Intelligence Artifact → atomic persistence → reproducible result`

PR 8 implements only the request-memory orchestration through Solution Intelligence.

## Versioned contract

The workflow version is `scan-workflow@1`. A completed result includes a server-generated execution ID, explicit status, timestamps, evidence summary, validated Problem Intelligence, diagnostics, deterministic calibration, validated Solution Intelligence, Solution Intelligence diagnostics, safe processing history, and technical context. It contains no raw file buffers, prompts, raw model outputs, provider request IDs, user IDs, filenames, hashes, or provider raw errors.

## State machine

Stages are ordered as:

1. `received`
2. `authenticated`
3. `input_validated`
4. `evidence_ingested`
5. `problem_intelligence_started`
6. `problem_intelligence_validated`
7. `problem_diagnostics_computed`
8. `problem_calibration_computed`
9. `solution_intelligence_started`
10. `solution_intelligence_validated`
11. `solution_diagnostics_computed`
12. `completed`
13. `failed` only on controlled failure

Each transition is recorded by one state recorder. Stage records include only stage, status, timestamps, duration, and controlled error code.

## Dependencies

`ScanWorkflowDependencies` provides `now`, `createExecutionId`, `ingestEvidence`, `generateProblemIntelligence`, and `generateSolutionIntelligence`. Production defaults use `crypto.randomUUID()`, hardened evidence ingestion, and existing OpenRouter configuration. Tests inject deterministic fakes and make no network calls.

## Evidence propagation

Evidence enters through `ingestScanEvidence()`, then `toEvidenceEnvelopeInputs()` adapts independent evidence into the Untrusted Evidence Boundary. Granular evidence IDs remain available for grounding, but the public response exposes only a content-free evidence summary.

## Problem Intelligence service

`generateProblemIntelligence()` extracts model invocation, strict JSON parsing, `AnalyzeEvidenceOutput` validation, grounding validation, quality diagnostics, and deterministic confidence calibration from the route-level concern space. It does not authenticate, parse HTTP requests, persist, or return raw model output.

## Diagnostics and calibration

Problem diagnostics are computed with `computeScanQualityDiagnostics()`. Confidence calibration uses `scan-calibration@1` in shadow-compatible deterministic form and is included as compact public workflow metadata.

## Derived-context boundary

Validated Problem Intelligence is serialized by a deterministic internal adapter labeled `internal_derived_problem_intelligence`. This context is passed to Solution Intelligence as non-independent derived analysis. It is never appended as source evidence, receives no evidence ID, and is excluded from allowed independent evidence IDs.

## Solution Intelligence service

`generateSolutionIntelligence()` extracts model invocation, strict JSON parsing, Solution Intelligence contract validation, grounding enforcement, and aggregate diagnostics. It does not authenticate, persist, or return raw model output.

## Failure taxonomy

Controlled workflow errors include request invalid, evidence failed, problem generation/json/validation/grounding failures, solution generation/json/validation/grounding failures, configuration failure, timeout, and internal failure. Public failures return a safe code, failed stage, generic message, status class, and safe processing history only.

## Feature flag, authentication, and cost protection

The experimental route is authenticated and disabled by default behind `SCAN_SERVER_WORKFLOW_ENABLED`. The route does not accept `userId` in the body. User identity is used only for authorization. Because this PR does not introduce an atomic scan-usage increment, the route is not exposed unless the server-side flag is enabled. This prevents it from becoming an unrestricted costly model endpoint.

## Public response policy

Success returns `success: true` and a compact workflow object with validated intelligence, compact calibration, evidence summary, processing history, and safe technical context. Failure returns `success: false`, safe error metadata, and safe execution history. Neither shape returns evidence content, filenames, hashes, prompts, raw model text, provider errors, or user identity.

## Safe logs

`buildSafeScanWorkflowLog()` emits only operational metadata: event, workflow version, execution ID, status, failed stage, error code, total duration, completed stage count, source counts, diagnostics aggregates, validation readiness, stage durations, prompt versions, and model identifiers. It intentionally omits intent text, evidence IDs, content, filenames, hashes, claims, inference reasons, competitors, recommendations, user identity, prompts, and raw output.

## No persistence status

PR 8 performs no inserts, updates, uploads, migrations, usage increments, snapshots, or artifacts. Persistence and atomic write semantics belong to PR 9 — Scan Intelligence Artifact Contract and PR 10 — Scan Artifact Persistence Shadow, or the repository's final roadmap numbering after review.

## Compatibility mode

Legacy Scan UI, `/api/extract-file-text`, `/api/analyze-evidence`, `/api/generate-opportunities`, `/api/solution-intelligence`, current Supabase writes, exactly-three legacy opportunities, UI rendering, and usage counters remain unchanged.

## Known limitations and future work

- No Scan Intelligence Artifact is persisted.
- No atomic persistence exists yet.
- No Retrieval, Knowledge Fusion, queues, retries, UI migration, model changes, validation campaigns, or Feedback Moat capture are implemented.
- Future PRs should map the completed workflow result to a versioned artifact and persist it atomically before migrating the browser lifecycle.
