import type { DiscoveryContext, DiscoveryInput, DiscoveryPipelineState, DiscoveryStage } from "./types";

function normalizeDate(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function createRunId(input: DiscoveryInput, requestedAt: string) {
  return input.id || `discovery-${requestedAt}`;
}

export function createDiscoveryContext(input: DiscoveryInput): DiscoveryContext {
  const requestedAt = normalizeDate(input.requestedAt);

  return {
    runId: createRunId(input, requestedAt),
    requestedAt,
    metadata: input.context || {},
  };
}

export function createInitialDiscoveryState(input: DiscoveryInput): DiscoveryPipelineState {
  const context = createDiscoveryContext(input);

  return {
    input,
    context,
    stage: "initialized",
    rawEvidenceInputs: input.sources || [],
    collectedEvidence: [],
    normalizedEvidence: [],
    evidenceValidation: [],
    knowledgeUpdates: [],
    consolidation: null,
    confidenceScore: null,
    decisionContext: null,
    result: null,
    modularPipeline: null,
    warnings: [],
    completedStages: ["initialized"],
  };
}

export function advanceDiscoveryStage(
  state: DiscoveryPipelineState,
  stage: DiscoveryStage
): DiscoveryPipelineState {
  return {
    ...state,
    stage,
    completedStages: state.completedStages.includes(stage)
      ? state.completedStages
      : [...state.completedStages, stage],
  };
}

export function appendDiscoveryWarning(
  state: DiscoveryPipelineState,
  warning: string
): DiscoveryPipelineState {
  return {
    ...state,
    warnings: [...state.warnings, warning],
  };
}
