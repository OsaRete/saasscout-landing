# Scan Evidence Ingestion @1

`scan-evidence-ingestion@1` remains an experimental, server-only Ingestion Layer resource. PR 7.1 hardens the existing additive PR 7 foundation without introducing the Scan Server Workflow, persistence, retrieval, Knowledge Fusion, OCR, antivirus scanning, model/provider changes, UI migration, or legacy route replacement.

## Repository audit findings

The repository-visible ingestion path is `app/api/scan/evidence-ingestion/route.ts`, `lib/scan/evidence-ingestion.ts`, and `tests/scan-evidence-ingestion.test.ts`. `ingestScanEvidence()` is called by the experimental route and tests only. A repository search shows no current client consumer of `/api/scan/evidence-ingestion`; the Scan page submits evidence through `/api/scan/workflow`; `analyze-evidence`, `generate-opportunities`, and `solution-intelligence` are compatibility tombstones and no longer use the `scan-user-evidence` flow. `contentHash` is consumed internally by ingestion tests and unrelated Snapshot storage modules, but no authenticated client in this repository needs the ingestion route to return it. `normalizedContent` is still returned by the experimental route as private authenticated data for testability and future bridge work only; it should disappear from public intermediate responses once ingestion and analysis run in one server-side Scan Server Workflow execution. `byteLength` can be supplied by non-route canonical callers, so canonical ingestion treats it as declared metadata and verifies it against actual bytes. No framework-level multipart/body-size limit is configured in visible repository code; `next.config.ts` contains no body-size configuration, and Next route handlers use the Web `Request` API.

## Multipart metadata preflight

The route now performs defense-in-depth metadata preflight before reading any file bytes:

1. require authentication;
2. parse multipart form data;
3. collect `files` entries without `arrayBuffer()`;
4. reject non-file entries;
5. enforce `maxFilesPerRequest`;
6. validate each declared `File.size` is finite, integer, greater than zero, and at or below `maxFileBytes`;
7. sum declared sizes and enforce `maxTotalFileBytes`;
8. validate filename length, sanitized extension, and MIME compatibility via the reusable canonical type validator;
9. only then read `arrayBuffer()` for each accepted file;
10. invoke canonical ingestion.

`preflightScanEvidenceMultipartFiles()` is exported from the server ingestion module for deterministic tests. Canonical ingestion still independently enforces all byte, type, signature, and content limits.

## Actual-byte authority

Policy: declared `byteLength` must be a finite non-negative integer and must exactly match `Buffer.byteLength` after the input bytes are converted to a single `Buffer`. The actual buffer length is authoritative for per-file limits, total upload limits, canonical `byteCount`, and safe aggregate logs. A mismatch is rejected as `scan_evidence_request_invalid`; declared or actual byte values are not included in public error messages.

## Two-stage preparation and extraction

Canonical file handling is split into two private stages so future server-side callers cannot accidentally parse documents before upload totals are approved.

### Stage A: preparation

`prepareScanEvidenceFile()` performs only request validation and request-scoped byte preparation:

1. construct the `Buffer` once from caller-supplied bytes;
2. calculate `actualByteLength`;
3. verify declared `byteLength` exactly matches actual bytes;
4. enforce the per-file actual-byte limit;
5. sanitize the filename;
6. validate extension and MIME compatibility;
7. classify the upload as TXT, PDF, or DOCX.

Preparation does not decode TXT, validate binary signatures, invoke PDF/DOCX parsers, invoke any model, or mutate caller input. The prepared structure carries the same request-scoped `Buffer` forward only until extraction completes. Buffers are not retained in final canonical evidence items.

### Stage B: extraction

`extractPreparedScanEvidenceFile()` runs only after every file is prepared and the sum of actual bytes is approved. It validates PDF/DOCX signatures, applies TXT binary and strict UTF-8 checks, invokes the relevant parser with the cooperative timeout, maps parser failures to controlled public errors, and returns extracted text plus safe metadata.

Canonical ingestion order is now:

1. enforce file count;
2. prepare every file without parsing;
3. sum prepared `actualByteLength`;
4. reject totals above `maxTotalFileBytes`;
5. extract prepared files;
6. normalize;
7. enforce extracted-character and useful-content limits.

Required invariant: neither `extractPdf()` nor `extractDocx()` executes when the canonical sum of actual uploaded bytes exceeds `SCAN_DOCUMENT_INGESTION_POLICY_V1.maxTotalFileBytes`. TXT decoding also occurs only after total-byte approval for consistent ordering. Parsers are not invoked for oversized files, MIME mismatches, unsupported extensions, invalid filenames, invalid signatures, TXT binary content, malformed TXT UTF-8, or combined actual-byte overflow.

## Timeout architecture and limitation

PR 7.2 keeps the PR 7.1 `extractionTimeoutMs` behavior active through `withExtractionTimeout()`. This is a cooperative wait timeout: it limits how long the request awaits a parser and maps timeout to `scan_evidence_extraction_timeout`. It does **not** guarantee cancellation of CPU work already running in the same Node process. Strong parser termination requires future worker-thread or process isolation. Raw timeout or parser errors are not returned to clients.

## PDF and DOCX extraction coverage

Tests now include deterministic synthetic fixtures created specifically for this repository:

- a minimal extractable PDF containing `SaaSScout synthetic PDF extraction evidence` that is generated entirely in TypeScript, uses no shell command, produces stable bytes, passes extension, MIME, and `%PDF-` signature validation, and exercises the real installed PDF parser;
- a minimal real DOCX/ZIP package containing `SaaSScout synthetic DOCX extraction evidence` as an embedded deterministic base64 fixture that exercises the real installed Mammoth parser.

The DOCX fixture is self-contained and does not create temporary directories or call operating-system utilities such as `mkdir` or `zip`. Corrupt PDF/DOCX and renamed-ZIP rejection coverage remains.

## PDF error classification

Encrypted PDF detection is conservative and library-message-dependent. It only maps parser messages containing password/encryption indicators to `scan_evidence_pdf_encrypted`; unknown parser failures remain `scan_evidence_extraction_failed`. Raw parser messages, paths, stack traces, filenames, hashes, IDs, and content are never logged or returned publicly.

## TXT UTF-8 policy

TXT evidence is UTF-8 only. UTF-8 BOM is accepted and removed during normalization. Valid UTF-8 is accepted. Materially malformed UTF-8 byte sequences are rejected with `scan_evidence_text_encoding_invalid` rather than silently replacing large sections with replacement characters. Binary-looking TXT and HTML/script-looking TXT remain rejected.

## Collection-count limits

The centralized policy now bounds non-file collections before processing:

- `maxPastedEvidenceItems: 1`
- `maxExternalSnippets: 20`
- `maxDiscoverContextItems: 20`
- `maxDerivedAnalysisItems: 1`

Per-item and total normalized-character limits still apply. Excessive counts are rejected; sources are not silently discarded.

## Route response minimization

Because no current repository client consumes `/api/scan/evidence-ingestion`, the route remains experimental and returns only:

- `version`
- `evidenceItems[].evidenceId`
- `evidenceItems[].sourceKind`
- `evidenceItems[].normalizedContent`
- `evidenceItems[].characterCount`
- `evidenceItems[].truncated`
- `evidenceItems[].extractionStatus`
- `allowedEvidenceIds`
- `derivedContextIds`
- `totals`

It does not return hashes, filenames, byte counts, MIME details, trust/privacy internals, provenance internals, or parser diagnostics.

## Filename privacy policy

Canonical items keep a sanitized `originalFilename` only as private in-memory provenance. Filenames are Unicode-normalized, path components are removed, control characters are stripped, and maximum length is enforced. Filenames are never included in IDs, hashes, prompt adapter output, public route responses, or safe logs. This PR does not broaden persistence.

## HTTP status policy

The route uses deterministic status mapping:

- `400`: malformed request, empty evidence, unsupported type, MIME mismatch, invalid signature, binary or invalid TXT encoding, and request-content count/character problems;
- `413`: per-file size, total upload size, or total normalized-content limit exceeded;
- `422`: structurally accepted document extraction problems, encrypted PDF, no-text PDF, invalid DOCX, extraction failure, or extraction timeout;
- `500`: internal configuration failure.

## Safe logging

Accepted-request logs use actual canonical file byte totals. Preflight rejection logs use only safe aggregate metadata available before reading bytes, such as file count, total declared bytes, error code, and duration. Logs intentionally omit filenames, evidence IDs, hashes, normalized content, raw content, user identifiers, paths, parser messages, and stack traces.

## Contract version decision

The contract remains `scan-evidence-ingestion@1` because the module is experimental, non-persisted, not integrated into the legacy UI, and not consumed by artifact persistence. This is pre-release hardening of `@1`. Some previously accepted internal inputs are now rejected when declared byte length mismatches actual bytes, TXT bytes are malformed UTF-8, or external/Discover context counts exceed policy.

## Known limitations and future work

The route still parses multipart form data through the framework before route-level metadata preflight; no repository-visible framework body-size configuration is present. Cooperative parser timeout is not hard cancellation. Future work should add worker/process-isolated parsing, remove intermediate public `normalizedContent` once Scan Server Workflow performs ingestion and analysis in one server-side execution, and consider antivirus/OCR only in separate scoped PRs.
