# Scan Solution Intelligence Contract

## Purpose

Solution Intelligence is the isolated foundation for moving Scan from SaaS-only opportunity generation toward evidence-grounded solution-category evaluation. It compares solution categories before recommending an approach and keeps the legacy public Scan UI and persistence unchanged.

## Repository audit and compatibility

The current public Scan flow remains temporarily compatible:

- `app/api/analyze-evidence/route.ts` returns `{ analysis }` and validates the legacy Analyze Evidence contract.
- `app/api/generate-opportunities/route.ts` returns `{ success, opportunities, grounding }` and still validates exactly three opportunities.
- `lib/scan/safe-prompt-builders.ts` still contains the legacy `Generate exactly 3 SaaS opportunities` instruction for the existing route.
- `lib/scan/output-validation.ts` still enforces exactly three legacy opportunities with the existing score, difficulty, field, and grounding shape.
- UI consumers in `app/scan/page.tsx`, `app/results/page.tsx`, `app/scans/page.tsx`, and `app/saved/page.tsx` continue to consume legacy opportunity fields and Supabase `opportunities` rows.
- Persistence remains unaffected because this contract is not persisted and no database migration is included.

## SaaS-only assumptions found

The legacy prompt identifies the model as a SaaS opportunity analyst, asks for practical SaaS products, and requires exactly three SaaS opportunities. The legacy output validator enforces exactly three opportunities. Current marketing and saved/results copy still references SaaS opportunities. These remain active until a later migration replaces the public Scan behavior.

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

Suitability is canonical on a 0–1 scale. It means how well a solution category fits the evidenced problem under current assumptions. It does not mean probability of business success, market size, profitability, certainty, founder-market fit, investment return, or opportunity score. It is not connected to existing legacy opportunity scoring and is not persisted or exposed in the UI in this PR.

## Existing-solution assessment

The contract separates direct competitors, manual workarounds, services, spreadsheets, generic tools, category-level alternatives, and doing nothing. Named direct competitors require evidence references. When evidence is absent, alternatives should be category-level and claims must be marked as inference.

## Controlled innovation principles

Innovation must build on a verified problem or verified workflow. The contract separates verified foundations, proposed differentiation, unverified assumptions, feasibility constraints, and novelty risk. `no_innovation_needed` and `unproven_concept` are valid outcomes, and unsupported novelty must be inference-labeled.

## Validation readiness

Validation readiness prepares for future real-world validation without implementing campaigns or integrations. It captures readiness, known facts, critical unknowns, the cheapest next test, test rationale, success signal, and failure signal.

## Prompt safety and grounding

`buildSolutionIntelligencePrompt()` preserves the Untrusted Evidence Boundary, uses trusted user intent separately from untrusted evidence, labels derived analysis as non-independent context, requires strict JSON, forbids invented competitors/demand/willingness-to-pay/novelty, and permits citations only to allowed evidence IDs.

## Dedicated server boundary

`app/api/solution-intelligence/route.ts` is authenticated, bounded, non-persistent, and isolated from legacy Scan routes. It parses strict JSON, validates the v1 contract, computes aggregate diagnostics, and never returns raw model content on failure.

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

The model must still return `suitabilityBand` for contract compatibility, but validation rejects mismatches against the deterministic derived band.

### Recommendation ranking rules

`recommendedCategory` must be one of the evaluated categories and must tie for the highest suitability score. `secondaryCategory`, when present, must be evaluated, must differ from `recommendedCategory`, and must tie for the highest suitability among non-recommended categories. Ties are valid; the model is not silently reordered.

### Existing-alternative and competitor policy

Alternative `evidenceRefs[]` are strict and bounded. Each reference must contain a non-empty bounded `evidenceId` from the current evidence envelope, may include only `primary`, `supporting`, or `contradicting` relevance, must not duplicate another ref inside the same alternative, and must not include unknown fields. Invalid refs are rejected and are not retained in validated output.

`direct_competitor` represents a named competitor only when at least one valid evidence reference supports the competitor existence or identity. Inferred named competitors are not allowed; no evidence means no named competitor. `category_level_alternative` may have no refs when represented as a category and observed claims are correctly inference-labeled. Manual workarounds, spreadsheets, services, generic tools, and doing nothing may use descriptive category names. The contract does not perform web search or competitor verification.

### Public error and diagnostics response policy

The authenticated experimental API route returns only `{ success: true, solutionIntelligence }` on success. Aggregate diagnostics are retained for safe server logs, not returned publicly, because no repository consumer currently depends on them.

Unexpected route failures return the controlled generic public error `solution_intelligence_failed`; provider, network, SDK, stack, environment, prompt, raw output, evidence, private input, and configuration details are not exposed. Missing provider configuration returns a generic temporary-unavailable response that does not name the provider, environment variable, or API key. Safe logs contain aggregate metadata only: event, route, prompt version, model identifier, validation status, duration, category count, recommendation presence, validate-first consideration, grounding percentages, independent evidence-reference counts, alternative counts, innovation counts, critical unknown counts, readiness, cheapest next test, contradiction counts, and safe error category/name/status class.

### Known limitations

- Solution Intelligence remains isolated from legacy Analyze Evidence and Generate Opportunities.
- The route still uses a single pasted-evidence envelope ID and does not retrieve, crawl, persist, or map artifacts.
- Competitor semantics are contract-validation only; no external verification is performed.
- The validator hardens the experimental v1 contract but does not introduce `scan-solution-intelligence@2`.
