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
