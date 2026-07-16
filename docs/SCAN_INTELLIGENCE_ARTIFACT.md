# Scan Intelligence Artifact

Version: `scan-intelligence-artifact@1`  
Status: Implemented as an additive, in-memory contract. Persistence is a future PR.

## Audit summary

The implementation audit treated Scan code/tests as behavioral truth, Scan docs as architectural intent, and Supabase migrations/RPCs as persistence truth.

Relevant implemented Scan behavior:

- `scan-workflow@1` is an isolated server workflow that returns a completed in-memory result with validated Problem Intelligence, deterministic diagnostics/calibration, validated Solution Intelligence, processing history, and technical context.
- Evidence ingestion already creates canonical evidence IDs, source kinds, trust classes, privacy classes, extraction status, character counts, truncation flags, and SHA-256 content hashes.
- Problem and Solution Intelligence validators preserve claim-level grounding and reject unknown evidence references.
- Score calibration is deterministic and separate from model confidence; it measures evidence-adjusted support, not success, profitability, product-market-fit, or company-outcome probability.
- Snapshot persistence uses Discover-specific canonical storage mapping, SHA-256 hashing, idempotency keys, append-only repository semantics, replay detection, conflict detection, Supabase RPC persistence, and ownership controls.

Schema/persistence audit:

- Existing Supabase migrations define Knowledge Evolution and Snapshot persistence schemas/RPCs.
- No Scan Artifact tables, rows, RPCs, inserts, updates, upserts, storage uploads, or usage-counter mutations exist or are added by this PR.
- Snapshot contracts are useful patterns but remain Discover-specific; Scan Artifact does not copy Snapshot storage records or persistence identity.

Discrepancies and decisions:

- The workflow previously exposed only aggregate evidence summary. This PR adds an internal content-free artifact mapping context to the workflow result while preserving the public route projection.
- Discover Snapshot canonicalization is reusable as a pattern, not as a contract. Scan Artifact has its own canonicalization version.
- Artifact persistence, `/results/{scanId}`, Retrieval Shadow Mode, Knowledge Fusion, validation campaigns, outcome capture, and UI migration remain planned future work.

## Purpose

The Scan Intelligence Artifact is the immutable, deterministic record of one successful Scan intelligence execution. It preserves evidence provenance, grounded/inferred claims, Problem Intelligence, deterministic diagnostics/calibration, Solution Intelligence, validation readiness, processing history, and safe technical versions.

It is designed to become the future unit for result display, historical comparison, Retrieval Shadow Mode, Knowledge Fusion, validation planning, and outcome capture, but this PR keeps it non-persistent.

## Contract

The implemented top-level contract is:

- `version`
- `artifactId`
- `execution`
- `intent`
- `evidence`
- `problemIntelligence`
- `solutionIntelligence`
- `validation`
- `quality`
- `provenance`
- `processingHistory`
- `integrity`

The contract is immutable, bounded by upstream validators/ingestion limits, JSON-serializable, stable-hashable, and versioned as `scan-intelligence-artifact@1`.

## Artifact ID policy

The Artifact ID is derived server-side from the workflow execution ID:

```text
scan-artifact-<workflow UUID or safe execution suffix>
```

It contains no user input, user ID, evidence content, evidence hash, timestamp-only identity, database primary key, authorization context, or persistence identity.

## Completed-workflow-only mapping

`mapCompletedScanWorkflowToArtifact()` accepts only a completed `scan-workflow@1` result. It rejects failed, partial, or wrong-version workflow objects. It performs no HTTP work, authentication, persistence, model invocation, re-ingestion, or recomputation of intelligence. Validation runs before return.

## Intent privacy

The Artifact preserves only the already validated submitted intent fields:

- `market`
- `niche`
- `audience`
- `region`
- `description`

Intent is classified as `private_user_context`. Inferred market/audience remain in Problem Intelligence and are not merged into trusted input. Future persistence must add user ownership and privacy protection.

## Evidence manifest decision

Policy A is implemented: the workflow now carries an internal content-free Artifact mapping context generated during the same evidence ingestion execution.

Each manifest source preserves:

- evidence ID
- source kind
- trust class
- privacy class
- character count
- truncation flag
- extraction status
- content hash

It does not preserve normalized content, raw uploaded bytes, filenames, storage paths, signed URLs, prompts, or raw model output. Content hashes are internal integrity/deduplication signals only; they are not authorization and must not imply private files can be shared.

Evidence classes remain explicit:

- independent user evidence: private user evidence;
- public external snippets: public external evidence;
- Discover context: internal derived/private context, not independent current evidence;
- derived analysis: internal derived non-independent context.

## Problem Intelligence

The Artifact preserves the validated Analyze Evidence output including inferred market, audience summary, evidence summary, pain points, repeated patterns, workflow problems, willingness-to-pay signals, opportunity angles, model confidence score, grounding data, and grounding summary.

Inference claims remain inference claims. Model confidence remains a model score and is not treated as calibrated probability.

## Quality and calibration

Quality stores deterministic diagnostics/calibration separately from model-generated conclusions:

- diagnostics version and diagnostics;
- solution diagnostics;
- calibration version;
- calibrated support score;
- score10/score100/band;
- reliability classification;
- model score comparison.

The calibrated score measures evidence-adjusted support only. It is not success probability, profitability probability, product-market-fit probability, or a prediction of company outcome.

## Solution Intelligence

The Artifact preserves the full validated `scan-solution-intelligence@1` result, including evaluated categories, deterministic suitability bands, recommended/secondary category, existing-solution assessment, innovation assessment, validation readiness, assumptions, risks, and next validation action. Alternatives considered and rejected remain available for future Data Moat use.

## Validation readiness

Policy B is implemented: the Artifact stores a duplicated normalized validation projection and validates it against the Solution Intelligence source. This improves future indexing for validation workflows while preserving source consistency.

No campaign assets are generated.

## Processing history

Processing history must match the expected completed workflow stage order exactly. Validation rejects missing stages, duplicate/out-of-order stages, failed stages, negative durations, invalid timestamps, and a non-completed terminal stage.

## Technical provenance

Provenance preserves safe versions and model identifiers:

- workflow version;
- evidence ingestion version;
- Problem Intelligence prompt/model/validator versions;
- diagnostics version;
- calibration version;
- Solution Intelligence contract/prompt/model/validator versions;
- Artifact mapper version.

It excludes prompts, provider headers, API keys, provider request IDs, environment variables, user IDs, and authorization information. These versions support replay comparison; provider/model outputs are not guaranteed to be perfectly reproducible.

## Canonical serialization and integrity

`canonicalSerializeScanIntelligenceArtifact()` provides stable key ordering, array-order preservation, finite-number enforcement, and rejection of unsupported runtime values such as `undefined`, `Date`, `Buffer`, `Map`, `Set`, functions, symbols, and bigints.

Integrity hashing avoids self-reference:

1. Build payload without `integrity`.
2. Canonically serialize it.
3. Compute SHA-256.
4. Add `integrity.algorithm`, `integrity.canonicalizationVersion`, and `integrity.artifactHash`.

`verifyScanIntelligenceArtifactIntegrity()` verifies mutation detection. The hash is not authentication, ownership, or a public sharing primitive.

## Privacy guard

The structural privacy guard rejects forbidden key names such as `userId`, `email`, `authorization`, `authorizationMode`, `accessToken`, `refreshToken`, `apiKey`, `providerRequestId`, `rawModelOutput`, `rawOutput`, `prompt`, `fileBuffer`, `bytes`, `storagePath`, and `signedUrl`.

This is deterministic structural defense in depth, not semantic PII detection. It intentionally avoids scanning arbitrary claim text for generic words.

## Internal vs public projection

The internal Artifact may include private intent, evidence IDs, trust/privacy classes, and content hashes. `toPublicScanIntelligenceArtifact()` exposes user-useful intelligence while omitting content hashes, evidence privacy/trust internals, mapper diagnostics, user identity, authorization context, and integrity internals.

The helper is not integrated into the UI or routes in this PR.

## Safe logs

`buildSafeScanArtifactMapperLog()` returns aggregate-only diagnostics: counts, reliability classification, validation readiness, integrity verified, and mapping duration. It excludes claims, evidence IDs, hashes, intent text, alternatives, recommendations, competitors, filenames, and user identity. The pure mapper does not log automatically.

## Compatibility and non-persistence

This PR does not change the Scan page, legacy Analyze Evidence response, Generate Opportunities behavior, Solution Intelligence route response, Supabase writes, saved Scan behavior, usage counters, feature flags, model/provider selection, or public UI.

No migrations, tables, RPCs, inserts, updates, upserts, storage uploads, Artifact rows, or usage mutations are added.

## Known limitations

- The Artifact is in-memory only.
- Public projection is a helper only and is not route-integrated.
- Content hashes verify Artifact payload integrity/deduplication context but do not authorize access to private evidence.
- Replay comparison can compare versions and structured outputs, but exact provider reproduction is not guaranteed.
- Structural privacy scanning is not semantic PII detection.

## Future work

Planned later PRs may add:

- Scan Artifact Persistence Shadow;
- database ownership and privacy enforcement;
- `/results/{scanId}` route migration;
- Retrieval Shadow Mode;
- Knowledge Fusion;
- validation plans and validation outcome capture;
- historical comparison.

Future schema evolution must use a new mapper version and either versioned migrations or a new Artifact contract version.

## PR 9.1 durable-boundary validation hardening

`scan-intelligence-artifact@1` remains the active contract. The hardening in this phase is corrective and pre-persistence: no artifact rows, migrations, RPCs, Supabase writes, routes, retrieval, Knowledge Fusion, campaigns, usage mutation, or model/provider changes are introduced. Previously accepted experimental malformed objects may now be rejected because the validator is treated as a future JSON/JSONB read boundary rather than a mapper-only assertion.

### Durable validation threat model

The Artifact can eventually cross this boundary:

JSONB read → JSON parse → structural privacy scan → strict schema validation → semantic consistency validation → canonical serialization → SHA-256 integrity verification → use.

The mapper still constructs deterministic immutable Artifacts, but validation no longer assumes the current mapper produced the object. Objects parsed from untrusted JSON must be plain objects with bounded, exact schemas and controlled validation errors. `validateScanIntelligenceArtifact()` is an assertion-only validator; `parseAndValidateScanIntelligenceArtifact()` parses bounded JSON, validates semantics and integrity, and returns a deeply frozen Artifact.

### Mapper assumptions now independently enforced

The durable validator independently checks mapper-provided invariants:

- Structural: exact top-level keys; exact execution, intent, evidence, evidence summary, source manifest, quality, model score comparison, provenance, integrity, validation projection, and processing-history keys; no unknown nested keys in defined durable sections.
- Semantic: UUID-based Artifact/execution IDs; finite score, count, percentage, timestamp, duration, enum, hash, and version values; complete calibration projection invariants.
- Cross-section consistency: evidence summary versus source manifest; grounding references versus allowed independent evidence; validation projection versus Solution Intelligence; diagnostics versus Solution Intelligence; provenance versions versus section versions; execution timing versus processing history.
- Integrity: canonical JSON excludes `integrity`, preserves array order, sorts object keys lexically, and verifies the stored SHA-256 hash only after structural and semantic validation.
- Privacy: structural scanning rejects specific dangerous runtime/private fields while no longer banning the generic key `content`; strict schemas prevent generic content fields in defined Artifact sections. The scan is defense in depth, not semantic PII detection.
- Persistence-related: validation is ready for Persistence Shadow, but persistence remains a non-goal in this PR.

### Evidence manifest and consistency

Every source manifest entry is content-free and must contain exactly `evidenceId`, `sourceKind`, `trustClass`, `privacyClass`, `characterCount`, `truncated`, `extractionStatus`, and `contentHash`. IDs must follow the ingestion ID shape, content hashes must be `sha256:<64 lowercase hex>`, character counts must be non-negative integers, and source/trust/privacy/extraction values must use the canonical ingestion enums. Source IDs must be unique.

The summary must exactly match manifest-derived values: `sourceCount`, `sourceKindCounts`, `truncatedSourceCount`, `independentSourceCount`, and `derivedSourceCount`. `allowedEvidenceIds` must be duplicate-free, must exist in the manifest, must contain every independently referenceable source, and must exclude derived sources. Source independence is classified by the ingestion policy and is not inferred from privacy class alone.

### Grounding, calibration, diagnostics, and validation projection

The validator continues to delegate Problem Intelligence and Solution Intelligence shape/grounding checks to their owning validators, then verifies that all discovered references resolve to allowed independent evidence. Evidence-grounded claims require references; inference claims must not carry references.

Quality validation treats the Artifact score fields as a versioned calibration projection of `scan-calibration@1`: `calibratedSupportScore`, `score10`, `score100`, `scoreBand`, `reliabilityClassification`, `modelScore10`, and `absoluteDelta10` are all checked for valid ranges and deterministic relationships. Diagnostics remain aggregate-only; deterministic Solution diagnostics are checked against Solution Intelligence for category counts, uniqueness, recommendation presence, validation readiness, cheapest next test, existing alternative count, and critical unknown count.

Because PR 9 intentionally duplicated validation readiness in the Artifact, the mapper and validator now use one projection helper. The Artifact-level validation projection must be structurally equal to the projection of `solutionIntelligence.validationReadiness` plus `solutionIntelligence.nextValidationAction`, including readiness, known facts, critical unknowns, cheapest next test, rationale, success/failure signals, and next action.

### Execution, provenance, IDs, and mapper diagnostics

Execution IDs are accepted only as `scan-workflow-<UUID>` and Artifact IDs as `scan-artifact-<same UUID>`. The relationship is deterministic and rejects whitespace, path-like strings, arbitrary suffixes, and user identifiers.

Processing history must contain the exact completed workflow stage order once, with no failed or started records. Stage timestamps must be ISO millisecond timestamps, monotonic, non-overlapping, within execution bounds, and each duration must equal `completedAt - startedAt`. Execution duration must equal the execution timestamp delta.

Provenance versions are exact where the contract is known: workflow, evidence ingestion, diagnostics, calibration, solution intelligence, mapper, and Artifact versions must align with their sections. Prompt, validator, and model identifiers are bounded safe identifiers; environment-variable syntax, URLs, secret-like names, whitespace-only strings, provider request IDs, and excessive values are rejected. Model ID is provenance for interpretation and diagnostics, not a guarantee of exact replay.

The pure mapper no longer measures its own timing. `buildSafeScanArtifactMapperLog()` accepts externally measured `mappingDurationMs`, validates it as finite and non-negative, and emits aggregate diagnostics only. It omits Artifact hashes, evidence IDs, content hashes, claim text, intent, alternatives, recommendations, competitor names, authorization, and user identifiers.

### Public projection and test fixtures

Public projection validates the Artifact before projecting and continues to omit content hashes, trust/privacy internals, internal integrity, the private evidence manifest, submitted private intent, user/authorization data, and mapper internals.

The test-only workflow authorization fixture is no longer exported from production workflow code. Tests define their own local authorization fixture so route authorization behavior remains production-owned.

### Adversarial test strategy and Persistence Shadow readiness

Tests now include parsed-JSON/adversarial cases that mutate independently of the mapper: missing keys, unknown keys, wrong primitive types, duplicate and derived evidence IDs, summary/manifest mismatches, invalid enums and hashes, calibration mismatches, diagnostics mismatches, validation projection drift, processing timestamp overlaps and duration mismatches, provenance/version drift, malformed Artifact/execution IDs, forbidden structural fields, integrity mismatches, oversized JSON parsing, and nested immutability after parse. A valid claim mentioning the word “content” remains accepted.

This prepares the Artifact for a future Persistence Shadow phase by making validation durable and deterministic without adding persistence.

## PR 9.2 canonical classification, diagnostics, and error-boundary hardening

`scan-intelligence-artifact@1` remains the active contract. This phase is the final planned pre-persistence semantic hardening step before Scan Artifact Persistence Shadow. No Artifact rows, migrations, RPCs, Supabase writes, result routes, UI integration, Retrieval, Knowledge Fusion, validation campaigns, outcome capture, usage mutation, provider/model changes, or background jobs are introduced.

### Audit findings closed by this phase

The pre-implementation audit confirmed these durable-boundary gaps in the experimental parsed-JSON validator:

- `intent.submitted` was only required to be a plain object, so unknown keys, non-string values, oversized values, and empty submitted intent could pass until integrity or downstream checks.
- Evidence enum values were individually checked, but contradictory `sourceKind`, `trustClass`, and `privacyClass` combinations were not rejected as non-canonical ingestion classifications.
- `extractionStatus` could contradict `sourceKind` and `truncated` metadata.
- Problem diagnostics used generic recursive non-negative-number scanning rather than the exact `ScanQualityDiagnostics` contract.
- Solution diagnostics checked only a subset of deterministic relationships and did not fully validate primitive types, integer counts, percentage ranges, enums, or unknown fields.
- Owning Problem/Solution validators could throw their own validation errors through the Artifact validator.
- Prompt and validator versions were bounded as safe identifiers but were not all cross-checked against known internal constants.
- Adversarial tests did not cover all semantic contradictions with rehashed payloads.

### Canonical trusted-intent policy

Trusted Scan intent is now validated through one reusable trusted-intent validator shared by workflow validation and Artifact durable validation. The canonical keys are exactly:

- `market`
- `niche`
- `audience`
- `region`
- `description`

Unknown keys are rejected. Present values must be strings, already trimmed, non-empty, and within canonical bounds: `market`, `niche`, and `audience` are limited to 120 characters, `region` to 80 characters, and `description` to 600 characters. At least one canonical intent value is required. Artifact validation never silently truncates parsed JSON. Invalid Artifact intent maps only to `scan_artifact_intent_invalid`, not `ScanWorkflowError`.

### Canonical evidence classification

Evidence Ingestion owns the canonical classification helper. Given a `sourceKind`, it returns the only valid `trustClass`, `privacyClass`, `independence`, and `origin` combination. Ingestion uses this helper when creating items, source-independence classification delegates to it, and Artifact validation calls it for parsed JSON.

Canonical classifications are:

- `pasted_evidence`, `uploaded_txt`, `uploaded_pdf`, and `uploaded_docx`: user-supplied, private, independent evidence.
- `external_snippet`: public external, independent evidence.
- `discover_context`: internal derived private context, not independent current evidence.
- `derived_analysis`: internal derived private context, not independent current evidence.

Artifacts are rejected when `trustClass` or `privacyClass` disagrees with `sourceKind`, or when manifest-derived independence disagrees with summary counts or `allowedEvidenceIds`.

### Extraction-status semantics

Extraction status describes content-processing state, not evidence reliability. The canonical policy is:

- Uploaded TXT/PDF/DOCX with `truncated: false` must be `extracted`.
- Uploaded TXT/PDF/DOCX with `truncated: true` must be `partially_extracted`.
- Pasted evidence, external snippets, Discover context, and derived analysis with `truncated: false` must be `not_required`.
- Those non-file sources with `truncated: true` must be `partially_extracted`.

Impossible combinations are rejected while current ingestion behavior is preserved.

### Owning diagnostics validators

Problem diagnostics validation is owned by the Scan Quality Diagnostics module. The Artifact validator reuses `validateScanQualityDiagnostics()` instead of recursively scanning numbers. The validator enforces exact durable keys, primitive types, non-negative integer counts, 0-1 percentages/rates, string-list arrays, boolean fields, nested quality-summary shape, and deterministic relationships such as total grounded/inference/unsupported claim counts and quality-summary alignment.

Solution diagnostics validation is owned by the Solution Intelligence module. `validateSolutionIntelligenceDiagnostics()` enforces the exact diagnostics fields, rejects unknown fields, validates non-negative integer counts, booleans, 0-1 percentages, readiness/test enums, and deterministic relationships with the validated Solution Intelligence result. It also enforces `uniqueCategoryCount <= categoryCount`, `namedAlternativesWithEvidence <= existingAlternativeCount`, zero invalid references for a validated Artifact, and the current grounded-plus-inference percentage policy.

### Calibration ownership

Calibration threshold and projection checks are owned by `lib/scan/score-calibration.ts`. The Artifact validator calls the canonical calibration projection validator instead of maintaining a second independent threshold table. The mapper still preserves the existing Artifact quality projection: calibrated support score, `score10`, `score100`, score band, reliability classification, and model score comparison.

### Unified Artifact error boundary

`validateScanIntelligenceArtifact()` now catches validation failures from Analyze Evidence, Solution Intelligence, diagnostics, solution diagnostics, and calibration helpers and maps invalid parsed Artifact input into the Artifact taxonomy. Invalid Problem shape or grounding maps to `scan_artifact_grounding_invalid`; invalid Solution Intelligence maps to `scan_artifact_solution_invalid`; invalid diagnostics or calibration maps to `scan_artifact_quality_invalid`; invalid intent maps to `scan_artifact_intent_invalid`.

Owning-validator messages, raw objects, claim text, evidence IDs, private intent values, and evidence content are not embedded in Artifact validation errors. Programmer/runtime failures remain internally distinguishable in owning modules, but parsed invalid Artifact payloads cross the durable boundary as `ScanIntelligenceArtifactValidationError`.

### Exact provenance constants

Stable internal versions are now cross-checked exactly:

- workflow version;
- evidence ingestion version;
- Problem prompt version;
- Problem validator version;
- diagnostics version;
- calibration version;
- Solution Intelligence contract version;
- Solution prompt version;
- Solution validator version;
- Artifact mapper version;
- Artifact version.

Model identifiers remain bounded flexible provenance values for interpretation and diagnostics. They are not exact replay guarantees and must not be treated as proof that a provider will reproduce identical output.

### Final validation order

The durable Artifact validation order is:

1. plain-object and structural privacy scan;
2. top-level required keys and primitive section types;
3. trusted intent;
4. execution IDs and timing;
5. provenance basics and exact stable-version checks;
6. evidence manifest canonical classification and extraction consistency;
7. Problem/Solution contract and grounding validation behind the Artifact error boundary;
8. diagnostics and calibration through owning validators;
9. validation projection consistency;
10. processing history;
11. canonicalization eligibility;
12. SHA-256 integrity verification.

Semantic validation intentionally runs before integrity verification in adversarial tests by rehashing mutated payloads. This proves contradictions are rejected semantically rather than merely by stale hashes.

### Focused adversarial coverage

Tests now cover trusted-intent unknown keys, non-string values, oversized values, and empty intent; impossible evidence classifications; extraction-status contradictions; strict Problem diagnostics fields, types, counts, percentages, and summary relationships; strict Solution diagnostics counts, booleans, percentages, enums, and deterministic mismatches; owning-validator error taxonomy; exact Problem/Solution prompt and validator versions; canonical calibration projection mismatches; and mapper-produced projection compatibility.

### Readiness for Persistence Shadow

This hardening makes the in-memory Artifact validator suitable as the future JSON/JSONB read boundary for Persistence Shadow. Previously accepted contradictory experimental objects may now be rejected without a contract-version bump because no Artifact has been persisted, no UI consumes the contract, and the conceptual schema remains unchanged. Future Persistence Shadow work should add storage ownership, privacy enforcement, idempotent writes, read validation, and safe shadow diagnostics without changing the Artifact contract unless the conceptual schema changes.
