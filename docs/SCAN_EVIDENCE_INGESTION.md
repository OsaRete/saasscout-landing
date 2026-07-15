# Scan Evidence Ingestion

## Architecture

PR 7 adds a server-only Ingestion Layer foundation in `lib/scan/evidence-ingestion.ts`. It is additive: legacy Scan UI and API routes can continue passing a single combined evidence string while future Scan Server Workflow code can ingest granular evidence sources before prompt construction.

## Repository ingestion audit

Verified from repository code:

- `app/scan/page.tsx` accepts one selected file, restricts extensions to `.txt`, `.pdf`, and `.docx`, and caps the browser-selected file at 5 MB.
- TXT extraction currently happens client-side through `File.text()` before the text is merged into `cleanEvidence`.
- PDF and DOCX extraction currently happen server-side through `app/api/extract-file-text/route.ts` using `pdf-parse` and `mammoth`.
- The legacy extraction route accepts only PDF and DOCX MIME types and exposes raw parser failure messages through generic catch handling.
- External source snippets and raw text are formatted client-side into the same `cleanEvidence` string.
- `cleanEvidence` is truncated to 6,000 characters before legacy analysis/generation routes.
- `analyze-evidence`, `generate-opportunities`, and `solution-intelligence` currently build prompts with one evidence ID: `scan-user-evidence`.
- Supabase storage upload happens after Scan row creation and after analysis/source insertion. The client uploads original files to bucket `evidence-files` under `${userId}/${scanId}/${Date.now()}-${safeFileName}`.
- Repository code does not show a storage bucket migration or policy for `evidence-files`; public/private status, RLS, lifecycle deletion, and signed URL behavior remain externally configured/unknown.
- Failed scans after upload failure may leave the already-created `scan`, `evidence_analysis`, and `scan_sources` rows. Failed scans before upload do not upload the selected file. The code does not delete already-uploaded files after a later failure.
- Extracted text is persisted in the `scan.evidence` legacy combined string; external sources are persisted in `scan_sources`; evidence analysis is persisted in `evidence_analysis`.
- No temporary files are written to disk by the audited code.

## Versioned contract

The canonical contract is `scan-evidence-ingestion@1`. Each source becomes a `ScanNormalizedEvidenceItem` with stable `evidenceId`, `sourceKind`, trust class, privacy class, normalized content, SHA-256 content hash, bounded counts, extraction status, and provenance ordinal. Canonical items retain no `File`, `Buffer`, storage URL, bucket path, or mutable upload state.

## Supported formats and limits

The immutable policy `SCAN_DOCUMENT_INGESTION_POLICY_V1` supports only TXT, PDF, and DOCX. Conservative limits are: 5 files/request, 5 MB/file, 12 MB total uploaded bytes, 12,000 extracted characters/file, 24,000 total normalized characters, 120-character filenames, 12,000 pasted-evidence characters, 4,000 external-snippet/discover/derived characters, 20 minimum useful characters, and a 10 second extraction policy target. These limits keep prompt-ready evidence bounded, prevent large parser inputs, and preserve compatibility with current product usage.

## Trust and privacy classes

- User pasted evidence and uploaded TXT/PDF/DOCX are `user_supplied_untrusted` and `private_user`.
- External snippets are `external_public_untrusted` and `public_external`.
- Discover context and derived analysis are `internal_derived_non_independent`; derived analysis is not independent evidence.

## Evidence ID policy

IDs are deterministic request-local counters using safe lowercase source prefixes, for example `pasted-evidence-001`, `uploaded-pdf-001`, `uploaded-docx-001`, `uploaded-txt-001`, `external-snippet-001`, `discover-context-001`, and `derived-analysis-001`. IDs never include filenames, user names, emails, company names, hashes, or content. Duplicate files remain separate items by ordinal.

## Extraction behavior

TXT extraction is server-side in the canonical module. It handles UTF-8 BOM, normalizes line endings, rejects null-byte/binary-looking content and obvious HTML/script payloads, enforces limits, and never returns raw binary data.

PDF extraction is server-side through the existing `pdf-parse` dependency. It validates bytes before parsing, checks the `%PDF-` signature, bounds input and extracted text, maps encrypted/password-protected and no-text cases to controlled public errors, and does not render pages or perform OCR.

DOCX extraction is server-side through the existing `mammoth` dependency. It validates a ZIP signature, relies on successful DOCX extraction to reject malformed/renamed ZIP containers, bounds extracted text, and does not expose embedded media or raw library errors.

## MIME and signature validation

Validation combines normalized extension, reported MIME type, size, filename hardening, and basic signatures: `%PDF-` for PDF, `PK` ZIP signature plus successful Mammoth extraction for DOCX, and binary/null-byte heuristics for TXT. Unsupported, mismatched, executable, script, archive, image, HTML, unknown, empty, oversized, and malformed files are rejected with controlled public codes. Antivirus scanning is not included and is a recommended production follow-up.

## Normalization and hashing

`normalizeScanEvidenceContent()` deterministically converts CRLF/CR to LF, removes unsafe controls except useful whitespace, collapses excessive spaces/tabs, limits blank lines, trims boundaries, preserves paragraphs, and never summarizes or calls an LLM. Hashing uses SHA-256 over a stable JSON representation containing contract version, source kind, normalized content, and safe MIME metadata. Hashes are not authentication or authorization tokens.

## Prompt adapter

`toEvidenceEnvelopeInputs()` converts independent canonical items to existing Untrusted Evidence Boundary envelope inputs while preserving granular IDs and source kinds where supported. Derived context is returned separately as non-independent `DerivedAnalysisContext` and is excluded from `allowedEvidenceIds`.

## Route/service-boundary decision

A new authenticated isolated route exists at `app/api/scan/evidence-ingestion/route.ts` for future integration and tests. It accepts multipart form data and returns normalized contents only because the current client would need contents for a follow-up legacy request. It does not persist files or extracted text. Current legacy routes are not rewired in this PR to avoid breaking response shapes and UI flow.

## Public errors

Public errors use controlled codes: `scan_evidence_request_invalid`, `scan_evidence_file_count_exceeded`, `scan_evidence_file_too_large`, `scan_evidence_total_size_exceeded`, `scan_evidence_type_unsupported`, `scan_evidence_mime_mismatch`, `scan_evidence_signature_invalid`, `scan_evidence_text_binary`, `scan_evidence_empty`, `scan_evidence_extraction_failed`, `scan_evidence_pdf_encrypted`, `scan_evidence_pdf_no_text`, `scan_evidence_docx_invalid`, `scan_evidence_total_content_exceeded`, and `scan_evidence_configuration_failed`. Responses must not expose parser messages, stack traces, contents, paths, buckets, provider details, or environment data.

## Logging policy

`buildSafeScanEvidenceIngestionLog()` returns aggregate diagnostics only: version, counts, input bytes, normalized characters, truncation count, rejected/failure counts, duration, error code, file count, and boolean source presence. It intentionally excludes filenames, evidence IDs, hashes, contents, pasted evidence, user IDs, document titles, storage paths, and raw parser messages.

## Current retention behavior

Verified from code: original files are uploaded only after the scan row and analysis/source records are created; upload target is bucket name `evidence-files`; file paths include user ID, scan ID, timestamp, and sanitized original filename; extracted text is stored in `scan.evidence`; external sources and analysis are stored separately; no temp files are written. Unknown external configuration: whether `evidence-files` is public/private, storage RLS/policies, lifecycle retention, signed URL requirements, and bucket deletion automation. Known risks: failed post-upload operations can leave uploaded files, paths contain sanitized user-controlled filenames, and legacy combined evidence stores private extracted text. Required future changes before public document-heavy usage: private bucket verification, lifecycle cleanup, server-only upload/extraction orchestration, removal of filename from storage paths, artifact retention policy, antivirus scanning option, and granular artifact persistence.

## Compatibility mode and migration path

This PR keeps legacy UI, extraction route, Analyze Evidence request shape, Generate Opportunities request shape, Solution Intelligence request shape, Supabase inserts, and file upload UX unchanged. Migration path: legacy evidence aggregation → canonical granular ingestion → Scan Server Workflow adoption → Artifact persistence → legacy removal.

## Known limitations and non-goals

No OCR, no antivirus scanning, no persistence changes, no database migrations, no Retrieval, no Knowledge Fusion, no UI redesign, no provider/model changes, no external crawling, and no Scan Server Workflow are implemented in this PR.
