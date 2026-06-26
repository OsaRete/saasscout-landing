import type { DiscoveryPipelineState, DiscoveryStage } from "./types";

const pipelineOrder: DiscoveryStage[] = [
  "initialized",
  "evidence_collected",
  "evidence_normalized",
  "knowledge_updates_built",
  "knowledge_consolidated",
  "confidence_evaluated",
  "decision_context_prepared",
  "result_produced",
];

export type DiscoveryPipelineValidationResult = {
  valid: boolean;
  errors: string[];
};

export function getDiscoveryPipelineOrder() {
  return [...pipelineOrder];
}

export function canAdvanceDiscoveryStage(current: DiscoveryStage, next: DiscoveryStage) {
  return pipelineOrder.indexOf(next) === pipelineOrder.indexOf(current) + 1;
}

export function validateDiscoveryState(state: DiscoveryPipelineState): DiscoveryPipelineValidationResult {
  const errors: string[] = [];

  if (!state.context.runId.trim()) errors.push("Discovery context requires a runId.");
  if (Number.isNaN(Date.parse(state.context.requestedAt))) {
    errors.push("Discovery context requires a valid requestedAt timestamp.");
  }
  if (!pipelineOrder.includes(state.stage)) errors.push(`Unknown discovery stage: ${state.stage}.`);
  if (state.stage === "result_produced" && !state.result) {
    errors.push("Discovery result must be present when the result_produced stage is reached.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
