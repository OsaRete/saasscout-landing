# Scan Solution Intelligence Contract

## Purpose

Solution Intelligence is the isolated foundation for moving Scan from SaaS-only opportunity generation toward evidence-grounded solution-category evaluation. It compares solution categories before recommending an approach and keeps the legacy public Scan UI and persistence unchanged.

## Repository audit and compatibility

The current public Scan flow remains temporarily compatible:

- `app/api/analyze-evidence/route.ts` is a compatibility tombstone that returns HTTP 410 and no longer validates or generates Analyze Evidence output.
- `app/api/generate-opportunities/route.ts` is a compatibility tombstone that returns HTTP 410 and no longer validates or generates opportunity output.
- `lib/scan/safe-prompt-builders.ts` still contains the legacy `Generate exactly 3 SaaS opportunities` instruction for the existing route.
- `lib/scan/output-validation.ts` still enforces exactly three legacy opportunities with the existing score, difficulty, field, and grounding shape.
- UI consumers in `app/scan/page.tsx`, `app/results/page.tsx`, `app/scans/page.tsx`, and `app/saved/page.tsx` continue to consume legacy opportunity fields and Supabase `opportunities` rows.
- Persistence remains unaffected because this contract is not persisted and no database migration is included.

## SaaS-only assumptions found

The legacy prompt identifies the model as a SaaS opportunity analyst, asks for practical SaaS products, and requires exactly three SaaS opportunities. The legacy output validator enforces exactly three opportunities. Current marketing and saved/results copy still references SaaS opportunities. These legacy direct-generation assumptions are no longer active at the HTTP route boundary; public Scan generation now flows through `/api/scan/workflow`.

## Architecture

`scan-solution-intelligence@1` is a versioned, strict, additive contract under `lib/scan/solution-intelligence.ts`. It is independent from legacy opportunity persistence and is safe for future Artifact mapping.

Expected future flow:

Scan server workflow
→ evidence normalization
→ problem intelligence
→ Solution Intelligence
→ validation plan
→ concrete proposals
→ Scan Intelligence Artifact
→ persistence
→ Retrieval
→ Knowledge Fusion

## Category taxonomy

The v1 taxonomy is:

- `software_product`
- `ai_enabled_software`
- `automation`
- `api_or_infrastructure`
- `productized_service`
- `consulting`
- `managed_service`
- `marketplace`
- `education_or_training`
- `physical_product`
- `operational_process`
- `data_product`
- `community`
- `hybrid_solution`
- `validate_first`
- `no_build_recommended`

Each execution evaluates 3 to 8 relevant categories, including at least one build-oriented category, one service/process-oriented category, and either `validate_first` or `no_build_recommended`.

## Suitability score semantics

Suitability is canonical on a 0–1 scale. It means how well a solution category fits the evidenced problem under current assumptions. It does not mean probability of business success, market size, profitability, certainty, founder-market fit, investment return, or opportunity score. It is not connected to existing legacy opportunity scoring. The validated Solution Intelligence artifact preserves both the numeric score and its server-derived band; legacy opportunity persistence derives any band-dependent projection from the numeric score again. No UI renders `suitabilityBand` directly today.

## Existing-solution assessment

The contract separates direct competitors, manual workarounds, services, spreadsheets, generic tools, category-level alternatives, and doing nothing. Named direct competitors require evidence references. When evidence is absent, alternatives should be category-level and claims must be marked as inference.

## Controlled innovation principles

Innovation must build on a verified problem or verified workflow. The contract separates verified foundations, proposed differentiation, unverified assumptions, feasibility constraints, and novelty risk. `no_innovation_needed` and `unproven_concept` are valid outcomes, and unsupported novelty must be inference-labeled.

## Validation readiness

Validation readiness prepares for future real-world validation without implementing campaigns or integrations. It captures readiness, known facts, critical unknowns, the cheapest next test, test rationale, success signal, and failure signal.

## Prompt safety and grounding

`buildSolutionIntelligencePrompt()` preserves the Untrusted Evidence Boundary, uses trusted user intent separately from untrusted evidence, labels derived analysis as non-independent context, requires strict JSON, forbids invented competitors/demand/willingness-to-pay/novelty, and permits citations only to allowed evidence IDs.

## Prompt-contract alignment audit

The production prompt example uses the first ID from the runtime evidence envelope; it never contains a fixed example ID. “Populated” below describes the production JSON example after the claim-shape reliability fix. Optional arrays may still be empty in a real response when no claim is justified.

| JSON path | Type | Mode | Evidence refs | Inference reason | Prompt instruction | Example | Populated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `problemFraming` | `ScanGroundedClaim` | evidence required | required | prohibited | factual field | evidence object | yes |
| `evaluatedCategories[].rationale` | `ScanGroundedClaim` | flexible | required in evidence mode | required in inference mode | other material claim | evidence and inference objects | yes |
| `evaluatedCategories[].advantages[]` | `ScanGroundedClaim[]` | flexible | required in evidence mode | required in inference mode | claim arrays are objects; local grounding | evidence and inference objects | yes |
| `evaluatedCategories[].limitations[]` | `ScanGroundedClaim[]` | flexible | required in evidence mode | required in inference mode | claim arrays are objects; local grounding | evidence object | yes |
| `evaluatedCategories[].prerequisites[]` | `ScanGroundedClaim[]` | flexible | required in evidence mode | required in inference mode | claim arrays are objects; local grounding | inference object | yes |
| `knownAlternatives[]` | `ExistingAlternative` | entity-local evidence for a named direct competitor | required for `direct_competitor` | n/a on entity | direct competitor needs its own allowed ref | named direct competitor with local ref | yes |
| `knownAlternatives[].observedStrengths[]` | `ScanGroundedClaim[]` | flexible | required in evidence mode | required in inference mode | child claims need local grounding | evidence object | yes |
| `knownAlternatives[].observedWeaknesses[]` | `ScanGroundedClaim[]` | flexible | required in evidence mode | required in inference mode | child claims need local grounding | inference object | yes |
| `whatAppearsValidated[]` | `ScanGroundedClaim[]` | evidence required | required | prohibited | factual field | evidence object | yes |
| `whatAppearsPoorlySolved[]` | `ScanGroundedClaim[]` | flexible | required in evidence mode | required in inference mode | other material claim | evidence object | yes |
| `replacementRisk` | `ScanGroundedClaim` | flexible | required in evidence mode | required in inference mode | other material claim | inference object | yes |
| `verifiedFoundation[]` | `ScanGroundedClaim[]` | evidence required | required | prohibited | factual field; required for most innovation modes | evidence object | yes |
| `proposedDifferentiation[]` | `ScanGroundedClaim[]` | flexible | required in evidence mode | required in inference mode | separate proposed innovation | inference object | yes |
| `unverifiedAssumptions[]` | `ScanGroundedClaim[]` | inference required | prohibited | required | inference-required item | inference object | yes |
| `feasibilityConstraints[]` | `ScanGroundedClaim[]` | flexible | required in evidence mode | required in inference mode | other material claim | evidence object | yes |
| `knownFacts[]` | `ScanGroundedClaim[]` | evidence required | required | prohibited | factual field | evidence object | yes |
| `criticalUnknowns[]` | `ScanGroundedClaim[]` | inference required | prohibited | required | required at higher readiness | inference object | yes |
| `testRationale` | `ScanGroundedClaim` | flexible | required in evidence mode | required in inference mode | proposed tests normally use inference | inference object | yes |
| `successSignal` | `ScanGroundedClaim` | flexible | required in evidence mode | required in inference mode | proposed tests normally use inference | inference object | yes |
| `failureSignal` | `ScanGroundedClaim` | flexible | required in evidence mode | required in inference mode | proposed tests normally use inference | inference object | yes |
| `recommendation` | `ScanGroundedClaim` | inference required | prohibited | required | recommendation field | inference object | yes |
| `keyAssumptions[]` | `ScanGroundedClaim[]` | inference required | prohibited | required | inference-required item | inference object | yes |
| `risks[]` | `ScanGroundedClaim[]` | flexible | required in evidence mode | required in inference mode | other material claim | evidence object | yes |
| `nextValidationAction` | `ScanGroundedClaim` | inference required | prohibited | required | recommendation/action field | inference object | yes |

Deterministic non-claim fields remain aligned as well: `suitabilityBand` is derived from `suitability`; `recommendedCategory` must tie for the highest evaluated suitability; `secondaryCategory`, when supplied, must be the highest-suitability non-recommended category; and `cheapestNextTest` must be a contract enum value. These fields do not accept evidence references or inference reasons.

## Manual production verification

For each production run, record total duration plus the Problem Intelligence and Solution Intelligence durations, then verify the persisted Scan and artifact rather than relying only on the HTTP response.

1. Run a pasted single-source Scan and an uploaded-file Scan.
2. Run another Scan with different evidence and a different market.
3. Confirm each complete workflow reaches persistence and the Scan status becomes `completed`.
4. Inspect every generated `evaluatedCategories[].advantages[]` item and confirm it is an object with the contract fields, never a scalar.
5. Confirm all cited IDs belong to that run's allowed evidence set and no unknown evidence IDs appear.
6. Confirm persisted `evidence_analysis` and `opportunities` records exist.
7. For an internal tester, compare usage before and after and confirm `scans_used` does not increase.
8. Record total, Problem Intelligence, and Solution Intelligence duration for each run.

No database migration is required for this prompt-contract-only change.

## Dedicated server boundary

`app/api/solution-intelligence/route.ts` is now a compatibility tombstone, not a generation boundary. It returns HTTP 410 with `legacy_scan_generation_route_gone`, points callers to `/api/scan/workflow`, and performs no model execution, diagnostics calculation, persistence, or client-evidence trust. Solution Intelligence generation remains available only inside the authoritative server-owned Scan workflow and server-only Scan modules.

## Shadow-mode decision

Automatic shadow execution from legacy Generate Opportunities is deferred. Serverless request lifecycles can terminate fire-and-forget work, and delaying the legacy route would change latency. This PR therefore implements only the dedicated boundary and documents future shadow comparison for a reliable server-side Scan workflow.

## Diagnostics and privacy

Diagnostics are deterministic aggregate metrics only: category counts, recommended-category presence, validate-first consideration, grounding percentages, referenced evidence count, invalid references, alternative count, named alternatives with evidence, innovation foundation/assumption counts, critical unknown count, validation readiness, cheapest next test, and contradiction reference count. They do not include claim text, evidence content, alternative names, inference reasons, or private inputs.

## Current limitations and risks

This PR does not replace legacy Scan behavior, persist Solution Intelligence, map it to Artifacts, execute validation campaigns, crawl competitors, or alter providers. The main risk is that the dedicated route is available before UI integration; strict validation intentionally rejects uncertain model output instead of repairing it.

## Example output patterns

- Software: software can win when evidence supports repeatable structured workflow and validate-first is still evaluated.
- Service-first: productized service or consulting can win when customization, trust, or human judgment dominates.
- Automation: automation can win when the workflow is repetitive and deterministic without needing a full software product.
- Validate-first/no-build: validate-first or no-build can win when evidence is insufficient or existing alternatives may already satisfy the need.

## PR 6.1 semantic and error-boundary hardening

`scan-solution-intelligence@1` remains the contract version for this hardening because the route is still isolated, experimental, non-persistent, and not mapped into a public UI or Scan Artifact. Some previously accepted model outputs are now invalid; this is treated as pre-release v1 correction rather than a persisted contract break.

### Claim semantic classes

Evidence-required factual fields must use `groundingMode: "evidence"`, include at least one current-envelope evidence reference, and omit `inferenceReason`:

- `problemFraming`
- `existingSolutionAssessment.whatAppearsValidated[]`
- `innovationAssessment.verifiedFoundation[]`
- `validationReadiness.knownFacts[]`

Flexible fields may be evidence-grounded or inference-labeled under the shared grounding validator:

- category `rationale`
- `advantages[]`
- `limitations[]`
- `prerequisites[]`
- `whatAppearsPoorlySolved[]`
- `replacementRisk`
- `feasibilityConstraints[]`
- `risks[]`

Inference-expected recommendation, action, or future-unknown fields are validated as inference in v1 unless a future contract explicitly promotes them:

- `recommendation`
- `unverifiedAssumptions[]`
- `criticalUnknowns[]`
- `nextValidationAction`
- `keyAssumptions[]`

The prompt still asks normally inferred fields such as `proposedDifferentiation[]`, `testRationale`, `successSignal`, and `failureSignal` to be labeled as inference when they are proposed future actions or tests; the validator leaves these flexible so directly evidenced validation designs can still be represented without a v2 break.

### Factual-array policy and readiness requirements

- `problemFraming` is required and evidence-grounded.
- `whatAppearsValidated[]` may be empty when no existing-solution fact is established.
- `verifiedFoundation[]` may be empty only for `unproven_concept` and `no_innovation_needed`; all other innovation modes require at least one evidence-grounded foundation.
- `knownFacts[]` may be empty only when readiness is `not_ready`.
- `problem_validation_ready`, `solution_validation_ready`, and `demand_test_ready` require at least one evidence-grounded known fact.
- `solution_validation_ready` and `demand_test_ready` require non-empty inference-labeled `criticalUnknowns[]`.
- `demand_test_ready` also requires the concrete test contract fields already present in the schema: `cheapestNextTest`, `testRationale`, `successSignal`, and `failureSignal`.

### Suitability-band policy

Suitability is a 0-to-1 fit score under current evidence and assumptions. It is not success probability, market size, profitability, certainty, founder fit, or investment return. The v1 immutable threshold policy is:

- `[0, 0.20)` => `poor`
- `[0.20, 0.40)` => `weak`
- `[0.40, 0.65)` => `possible`
- `[0.65, 0.85)` => `strong`
- `[0.85, 1]` => `best_fit`

The model generates the numeric `suitability` only. The server owns the derived `suitabilityBand`: after strict JSON parsing and numeric validation it applies the thresholds above, while preserving the numeric score. Derived fields are not authoritative model outputs because accepting two representations of the same decision permits deterministic contradictions.

For compatibility, responses from older prompts may still contain `suitabilityBand`. The property is optional and non-authoritative: normalization overwrites it with the server-derived value before contract validation. A missing band is populated. An inconsistent band does not invalidate an otherwise valid response. Invalid, missing, non-finite, or out-of-range `suitability` remains a controlled contract failure; it is never clamped into validity.

### Recommendation ranking rules

`recommendedCategory` must be one of the evaluated categories and must tie for the highest suitability score. `secondaryCategory`, when present, must be evaluated, must differ from `recommendedCategory`, and must tie for the highest suitability among non-recommended categories. Ties are valid; the model is not silently reordered.

### Existing-alternative and competitor policy

Alternative `evidenceRefs[]` are strict and bounded. Each reference must contain a non-empty bounded `evidenceId` from the current evidence envelope, may include only `primary`, `supporting`, or `contradicting` relevance, must not duplicate another ref inside the same alternative, and must not include unknown fields. Invalid refs are rejected and are not retained in validated output.

`direct_competitor` represents a named competitor only when at least one valid evidence reference supports the competitor existence or identity. Inferred named competitors are not allowed; no evidence means no named competitor. `category_level_alternative` may have no refs when represented as a category and observed claims are correctly inference-labeled. Manual workarounds, spreadsheets, services, generic tools, and doing nothing may use descriptive category names. The contract does not perform web search or competitor verification.

### Public error and diagnostics response policy

The authenticated experimental API route returns only `{ success: true, solutionIntelligence }` on success. Aggregate diagnostics are retained for safe server logs, not returned publicly, because no repository consumer currently depends on them.

Unexpected route failures return the controlled generic public error `solution_intelligence_failed`; provider, network, SDK, stack, environment, prompt, raw output, evidence, private input, and configuration details are not exposed. Missing provider configuration returns a generic temporary-unavailable response that does not name the provider, environment variable, or API key. Safe logs contain aggregate metadata only: event, route, prompt version, model identifier, validation status, duration, category count, recommendation presence, validate-first consideration, grounding percentages, independent evidence-reference counts, alternative counts, innovation counts, critical unknown counts, readiness, cheapest next test, contradiction counts, and safe error category/name/status class.

### Known limitations

- The legacy Analyze Evidence, Generate Opportunities, and Solution Intelligence HTTP routes are retired as generation boundaries and return HTTP 410.
- Solution Intelligence HTTP generation must flow through `/api/scan/workflow`; no legacy route may use a single browser-pasted evidence envelope as trusted Scan evidence.
- Competitor semantics are contract-validation only; no external verification is performed.
- The validator hardens the experimental v1 contract but does not introduce `scan-solution-intelligence@2`.
