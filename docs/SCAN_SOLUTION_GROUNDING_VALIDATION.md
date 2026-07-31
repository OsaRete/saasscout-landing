# Scan Solution Grounding Validation Audit

## Root cause

The production error code did not identify one validator predicate: `SolutionIntelligenceValidationError` selected the first issue whose code contained `grounding`, and the service/workflow collapsed every such issue into `scan_workflow_solution_grounding_failed`. The prompt also contradicted the runtime evidence envelope by hard-coding `scan-user-evidence` in its example while production supplied IDs such as `pasted-evidence-001`. Therefore the available production telemetry cannot prove which predicate rejected the discarded response. The contradictory example is a concrete contract defect and the broad error collapse is the reason the exact historical predicate is unknowable.

The observed `relevance: "supporting"` is valid and is not, by itself, the failure.

## Audited validation conditions

The grounding error family covers:

- a missing or non-object claim;
- an unknown claim property, empty/oversized text, invalid `groundingMode`, or a non-array/malformed/oversized `evidenceRefs` value;
- an empty, unknown, duplicate, or overlong evidence ID;
- relevance outside `primary`, `supporting`, and `contradicting`;
- an evidence claim with no references;
- an inference claim with references or without a bounded `inferenceReason`;
- an inference in a factual field (`problemFraming`, `whatAppearsValidated`, `verifiedFoundation`, or `knownFacts`) or an evidence claim in an inference-required field (`recommendation`, `keyAssumptions`, `unverifiedAssumptions`, or `nextValidationAction`);
- a direct competitor without an evidence reference;
- a category-level alternative masquerading as a named company;
- an innovation mode requiring a verified foundation when none is provided;
- readiness above `not_ready` without known facts, or advanced readiness without critical unknowns;
- a suitability band inconsistent with its numeric score;
- a recommended or secondary category inconsistent with deterministic ranking.

There is no aggregate grounding-coverage threshold. Required coverage is enforced per factual entity.

## Repair

The prompt now uses an ID from the actual evidence envelope, enumerates exact field names and relevance values, and states the per-entity contract. Before validation, normalization only trims IDs, lowercases documented relevance values, and removes byte-for-byte equivalent references after normalization. It never creates a reference or substitutes an unknown ID.

Failures now retain a safe reason, path, optional category index, reference counts, unknown IDs, and allowed-ID count. No evidence content, prompt, full response, token, or secret is retained. Grounding/schema output failures use HTTP 422 and the established JSON envelope; provider generation failures remain upstream failures. No corrective retry was added because the production workflow already approaches 60 seconds.

## Production verification

1. Deploy with existing Scan flags and entitlement/quota configuration unchanged.
2. Submit pasted, uploaded, and multi-source Scans and confirm the prompt-listed IDs match ingestion IDs.
3. Confirm valid outputs complete and persist exactly once.
4. For a forced invalid fixture, confirm HTTP 422 JSON with `scan_workflow_solution_grounding_failed` and no HTML body.
5. Confirm the `scan_solution_grounding_validation_failed` event contains only safe structured fields.
6. Confirm the browser shows the controlled retry message.
