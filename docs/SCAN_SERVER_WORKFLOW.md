# Scan Server Workflow

## PR 8.1 hardening audit findings

PR 8 correctly isolated the experimental `scan-workflow@1` server orchestration, but the hardening audit confirmed eight workflow-only gaps before Artifact mapping: multipart file bytes were read before reusable metadata preflight, processing history used zero-duration records, authentication was implied inside workflow execution, provider/validation failures could be attributed to broad started stages, feature-flag plus login was too permissive for model-cost exposure, Analyze Evidence unexpected errors returned raw messages, JSON and multipart inputs did not accept the same logical evidence fields, and route-boundary tests did not cover enough rejection paths.

## Canonical HTTP parser and multipart preflight

The workflow route now uses a single canonical validation policy for JSON and multipart requests. Both transports support `intent`, `pastedEvidence`, `externalSnippets`, and `discoverContext`; only multipart supports `files` because JSON cannot safely carry browser `File` objects. Multipart `externalSnippets` and `discoverContext` are bounded strict JSON strings and reject malformed JSON, unknown item fields, non-string fields, and client-control fields. Unknown top-level or multipart fields are rejected, including `userId`, `executionId`, `status`, `allowedEvidenceIds`, `derivedAnalysis`, `calibration`, `diagnostics`, workflow version fields, technical context, and authorization fields.

Multipart processing now inspects entries first, calls `preflightScanEvidenceMultipartFiles()`, enforces file count, declared file size, total declared size, filename, extension, and MIME type, and only then reads `arrayBuffer()`. Canonical evidence ingestion still validates actual bytes, signatures, extraction, normalization, and total content independently.

## Authorization and experimental access policy

`executeScanWorkflow()` requires an explicit `ScanWorkflowAuthorizationContext` separate from user-controlled input. The context contains only `authenticated: true` and a non-identifying authorization mode. It intentionally excludes user ID, email, plan name, tokens, and allowlist membership details from workflow results and logs.

Route access order is fixed: feature availability check, authentication, server-side experimental access check, request parsing, file preflight, and workflow execution. During this experimental phase the conservative policy is feature flag + authenticated user + server-side user allowlist configured by environment. Denials use the same generic unavailable response and occur before file reads or model calls. The feature flag remains default-off.

## State machine, timing, and terminal policy

`scan-workflow@1` remains the contract version because it is experimental, non-persisted, feature-flagged, not used by the UI, and not mapped to an Artifact. Stage semantics are hardened before the first durable consumer rather than creating `@2`.

The centralized immutable order is: `received`, `authenticated`, `input_validated`, `evidence_ingested`, `problem_intelligence_started`, `problem_intelligence_validated`, `problem_diagnostics_computed`, `problem_calibration_computed`, `solution_intelligence_started`, `solution_intelligence_validated`, `solution_diagnostics_computed`, `completed`. `failed` is terminal from any active stage. Boundary stages such as `received` and `authenticated` are represented as normal start/complete pairs so every record has a real started/completed timestamp and non-negative duration.

Successful executions end with one completed `completed` record. Failed executions keep previous completed records and add exactly one failed record for the semantic stage that failed; there is no duplicate terminal `failed` history record. The result `status: "failed"` is the terminal state.

## Exact failure attribution and service timing

Evidence ingestion failures map to `evidence_ingested`. Problem provider generation maps to `problem_intelligence_started`; problem JSON, contract validation, and grounding failures map to `problem_intelligence_validated`; diagnostics and calibration stages are explicit workflow boundaries. Solution provider generation maps to `solution_intelligence_started`; solution JSON, validation, and grounding failures map to `solution_intelligence_validated`; solution diagnostics has its own boundary.

The smallest architecture was chosen: the workflow records real duration around the existing reusable services and records the immediate validation/diagnostic/calibration boundaries as distinct start/complete pairs. This avoids duplicating intelligence logic and does not expose private model content or raw provider metadata.

## Public HTTP and response policy

Workflow failure HTTP status mapping is centralized. Malformed input and evidence request errors return 400-class evidence statuses, model output/provider validation failures return 502, configuration/internal failures return 500, and disabled or unauthorized experimental access returns 503 with a generic unavailable response. Public failure bodies contain only controlled workflow code, semantic stage, generic message, execution ID, status, and processing history.

The experimental success response still returns complete Problem Intelligence, Solution Intelligence, evidence summary with evidence IDs, processing history, and technical context for workflow evaluation. It does not return normalized evidence content, hashes, filenames, raw provider output, user identity, plan, allowlist identity, or authorization mode.

## Analyze Evidence error hardening

Unexpected Analyze Evidence errors now return a generic public message. Safe logs include only event, route, category, error name, and no complete Error object, provider message, stack, SDK details, parser internals, or environment details.

## Safe logging

`buildSafeScanWorkflowLog()` remains privacy-minimized and now uses real stage durations. Allowed fields are workflow version, execution correlation ID, status, failed stage, error code, total duration, per-stage durations, completed-stage count, source counts, source-kind counts, independent source count, grounding coverage, reliability classification, solution category count, validation readiness, and prompt/model versions. It does not log authorization context, user identity, plan, allowlist identity, intent text, evidence IDs, content, filenames, hashes, claims, recommendations, competitor names, inference reasons, or raw errors.

## Persistence and readiness

This PR adds no persistence, migrations, Supabase writes, storage uploads, retrieval, queues, retries, model/provider changes, usage-counter mutation, or UI migration. The workflow is safer for future Scan Intelligence Artifact mapping, but Artifact persistence should wait until response minimization, durable schema design, and knowledge/fusion ownership are explicitly approved.
