# Scan Server Workflow

`scan-workflow@1` is the experimental server-only Scan orchestration contract. PR 8.2 is the final planned workflow-hardening step before the Scan Intelligence Artifact contract. It corrects pre-release processing-history semantics before any durable consumer, UI integration, or Artifact mapping exists, so the contract remains `scan-workflow@1`.

## PR 8.2 audit findings

The PR 8.2 audit found a discrepancy between intended workflow history and implemented behavior. Before this change, `generateProblemIntelligence()` performed provider generation, strict JSON parsing, output validation, grounding validation, quality diagnostics, and deterministic calibration inside one service call, while the workflow recorded that whole duration as `problem_intelligence_started` and then emitted empty synchronous `problem_intelligence_validated`, `problem_diagnostics_computed`, and `problem_calibration_computed` stages. `generateSolutionIntelligence()` similarly performed provider generation, JSON parsing, validation, grounding, and diagnostics inside one call while the workflow recorded later Solution Intelligence stages as empty boundaries.

The audit also confirmed that `ScanWorkflowRecorder.fail(stage)` could fabricate a failed record for a stage that was never started by using the failure timestamp as a fallback start timestamp. That could silently remove the actually active generation stage when a later validation stage was chosen for attribution. PR 8.2 removes that behavior and requires every complete/fail transition to target the currently active stage.

## Current workflow architecture

The route `app/api/scan/workflow/route.ts` remains the only HTTP boundary for this experimental workflow. It performs feature availability checks, authentication, server-side allowlist access checks, request parsing, multipart metadata preflight, and then calls `executeScanWorkflow()`. The workflow itself receives an explicit `ScanWorkflowAuthorizationContext`, validates safe intent, ingests evidence, runs Problem Intelligence in truthful phases, derives a bounded internal problem context, runs Solution Intelligence in truthful phases, and returns an experimental in-memory response.

The workflow does not persist data, write to Supabase, upload files, enqueue work, mutate usage counters, perform Retrieval, run Knowledge Fusion, start validation campaigns, or integrate with the public Scan UI. Legacy Analyze Evidence, Generate Opportunities, and dedicated Solution Intelligence routes keep their existing public shapes.

## Access policy and authorization boundary

Access remains conservative: feature flag + authenticated user + server-side allowlist. Denial happens before request parsing, file reads, evidence ingestion, or model calls.

The route performs the actual identity and access checks. The workflow receives only a verified non-identifying authorization context with `authenticated: true` and an internal authorization mode. The `authenticated` processing-history stage records acceptance of that already-verified context; it does not represent an external authentication request. Authorization mode, user identity, plan, allowlist membership, and tokens are not returned in public workflow results or safe logs.

## Evidence propagation and derived-context boundary

Canonical evidence ingestion is still the authority for evidence IDs, normalization, source counts, independent-source counts, content limits, and file extraction behavior. The workflow passes only the current evidence envelope and allowed evidence IDs into the intelligence phases.

Problem Intelligence output is transformed into a bounded derived problem context for Solution Intelligence. That derived context is internal, non-independent, and not treated as fresh evidence. It exists to help Solution Intelligence understand validated problem framing without inflating evidence coverage.

## Real phase definitions

PR 8.2 splits reusable intelligence services into small server-only phase functions while preserving high-level service compatibility:

Problem Intelligence phases:

1. `generateProblemIntelligenceModelOutput()` builds the prompt and invokes the provider. It returns raw model text only inside server code.
2. `validateProblemIntelligenceModelOutput()` performs strict JSON parsing, Analyze Evidence contract validation, and grounding validation.
3. `computeProblemIntelligenceDiagnostics()` computes deterministic quality diagnostics.
4. `computeProblemIntelligenceCalibration()` computes deterministic confidence calibration.

Solution Intelligence phases:

1. `generateSolutionIntelligenceModelOutput()` builds the prompt and invokes the provider.
2. `validateSolutionIntelligenceModelOutput()` performs strict JSON parsing, contract validation, and grounding validation.
3. `computeValidatedSolutionIntelligenceDiagnostics()` computes deterministic aggregate diagnostics.

The legacy high-level `generateProblemIntelligence()` and `generateSolutionIntelligence()` functions remain available and compose these phase functions. Their service-level `durationMs` remains for legacy route logging and compatibility only; workflow phase durations come from processing history.

## Stage-to-operation mapping

A successful workflow contains exactly one completed record for each stage in this order:

1. `received` — request accepted by the workflow boundary.
2. `authenticated` — verified authorization context accepted.
3. `input_validated` — workflow intent validated and client-control fields excluded by route/input policy.
4. `evidence_ingested` — canonical evidence ingestion completes.
5. `problem_intelligence_started` — Problem Intelligence provider generation completes.
6. `problem_intelligence_validated` — Problem Intelligence strict JSON, contract, and grounding validation completes.
7. `problem_diagnostics_computed` — Problem Intelligence quality diagnostics complete.
8. `problem_calibration_computed` — deterministic Problem Intelligence calibration completes.
9. `solution_intelligence_started` — Solution Intelligence provider generation completes.
10. `solution_intelligence_validated` — Solution Intelligence strict JSON, contract, and grounding validation completes.
11. `solution_diagnostics_computed` — Solution Intelligence diagnostics complete.
12. `completed` — workflow terminal success boundary.

Boundary stages can be short or instantaneous depending on the clock source, but intelligence validation, diagnostics, and calibration stages now wrap the real operation they name. The workflow no longer executes empty functions solely to create semantic records.

## Recorder invariants

`ScanWorkflowRecorder` is a strict state machine:

- `start(stage)` requires the exact next stage in the immutable central order.
- `complete(stage)` requires that same stage to be active.
- `fail(stage, code)` requires that same stage to be active.
- Only one stage may be active at a time.
- An active stage cannot be silently cleared.
- Stages cannot start twice, complete twice, or fail after completion.
- Completed and failed workflows are terminal.
- Transitions after terminal state are rejected.
- Returned history is an immutable snapshot.
- Failures never fabricate a zero-duration record for a stage that was not started.

## Failure policy and examples

When a stage operation throws, the workflow fails the currently active stage, preserves its real start timestamp, computes duration from the same workflow clock source, maps the controlled public error code to that real phase, and terminates. It does not start a later semantic stage merely to attribute an error.

Problem validation failure example:

```text
received completed
authenticated completed
input_validated completed
evidence_ingested completed
problem_intelligence_started completed
problem_intelligence_validated failed
```

Problem diagnostics failure example:

```text
received completed
authenticated completed
input_validated completed
evidence_ingested completed
problem_intelligence_started completed
problem_intelligence_validated completed
problem_diagnostics_computed failed
```

Solution generation failure example:

```text
received completed
authenticated completed
input_validated completed
evidence_ingested completed
problem_intelligence_started completed
problem_intelligence_validated completed
problem_diagnostics_computed completed
problem_calibration_computed completed
solution_intelligence_started failed
```

Failed workflow responses contain previous completed records plus exactly one failed record. They contain no later stages, no duplicate terminal `failed` record, no partial success result, and status `failed`.

## Error taxonomy

The workflow retains existing public codes for request, evidence, generation, JSON, validation, grounding, configuration, timeout, and internal failures where possible. PR 8.2 adds phase-specific controlled codes for deterministic post-validation work:

- `scan_workflow_problem_diagnostics_failed`
- `scan_workflow_problem_calibration_failed`
- `scan_workflow_solution_diagnostics_failed`

Raw causes are not exposed. Diagnostics and calibration exceptions are not mapped to provider generation failures.

## Raw model output boundary

Raw model output is server-only intermediate data. It is not returned in workflow success, workflow failure, legacy route responses, safe logs, technical context, evidence summaries, diagnostics, calibration, or persistence. It is not included in Error messages and is released after validation where practical. Provider response size remains bounded by the existing provider `max_tokens` settings used by the services.

## Timing policy

Processing history is the canonical source for workflow phase durations. `technicalContext.startedAt`, `technicalContext.completedAt`, and `technicalContext.totalDurationMs` describe overall workflow timing. Service-level total durations remain available only for legacy high-level service compatibility and are not used as workflow phase truth. Durations are non-negative and reflect the configured clock source; the workflow does not claim precision beyond that source.

## Safe logging and public responses

`buildSafeScanWorkflowLog()` logs only aggregate workflow metadata: version, execution ID, status, failed stage, controlled error code, total duration, per-stage durations, completed-stage count, evidence source counts, source-kind counts, independent evidence count, grounding coverage, reliability classification, solution category count, validation readiness, prompt versions, and model identifiers. It omits user identity, authorization mode, plan, allowlist details, intent text, evidence IDs, normalized content, filenames, hashes, claims, recommendations, competitor names, inference reasons, raw model output, raw provider errors, stack traces, and private evidence.

Experimental success responses still include complete Problem Intelligence and Solution Intelligence for workflow evaluation. Failure responses include only controlled error metadata, execution ID, status, and processing history.

## Behavioral tests

PR 8.2 adds behavioral workflow coverage for successful ordering and determinism, real phase dependency invocation, recorder invariants, evidence failure short-circuiting, generation/validation/diagnostics/calibration failure attribution, terminal failure shape, privacy of failures, legacy route compatibility guards, and no persistence/migration guards. Route parser/access tests remain focused on strict JSON/multipart parsing, forbidden client fields, multipart preflight before file byte reads, malformed nested JSON rejection, access ordering before parsing/file reads, and generic Analyze Evidence unexpected errors.

## Contract version decision

`scan-workflow@1` is retained because the workflow is experimental, default-off, non-persisted, not consumed by the UI, and not mapped to an Artifact. PR 8.2 hardens stage-history semantics before the first durable consumer rather than introducing `scan-workflow@2`.

## Known limitations and non-goals

Known limitations: multipart parsing still relies on framework form parsing before route-level file metadata preflight; parser timeouts in evidence ingestion remain cooperative; workflow responses are not yet minimized for a durable Artifact consumer; and route helpers are still part of an experimental boundary.

Non-goals for this PR: Scan Intelligence Artifact, persistence, database migrations, Supabase writes, storage uploads, UI integration, legacy flow removal, Retrieval, Knowledge Fusion, queues, retries, provider/model changes, validation campaigns, outcome capture, and usage mutations.

## Readiness for Artifact mapping

After PR 8.2, the workflow has truthful phase history, strict recorder invariants, phase-specific dependency injection for tests, protected raw output boundaries, safe failure transitions, and deterministic behavioral tests. This makes it ready for a separately scoped Scan Intelligence Artifact mapping design, but no Artifact behavior is implemented here.
