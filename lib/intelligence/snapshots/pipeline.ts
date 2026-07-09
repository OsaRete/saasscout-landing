import { buildSnapshot } from "./builder.ts";
import {
  mapDiscoveryToSnapshotInput,
  type DiscoverySnapshotAdapterInput,
} from "./discovery-adapter.ts";
import type { Snapshot } from "./types";
import {
  validateSnapshot,
  type SnapshotValidationIssue,
  type SnapshotValidationResult,
} from "./validator.ts";

export type SnapshotPipelineStage = "mapping" | "building" | "validation";
export type SnapshotPipelineStatus = "completed" | "failed";

export type SnapshotPipelineDiagnostic = Readonly<{
  stage: SnapshotPipelineStage;
  status: SnapshotPipelineStatus;
  message: string;
}>;

export type SnapshotPipelineSummary = Readonly<{
  completedStages: readonly SnapshotPipelineStage[];
  failedStage?: SnapshotPipelineStage;
  snapshotCreated: boolean;
  validationIncluded: boolean;
}>;

export type SnapshotPipelineResult = Readonly<{
  snapshot?: Snapshot;
  validation?: SnapshotValidationResult;
  valid: boolean;
  errors: readonly SnapshotValidationIssue[];
  warnings: readonly SnapshotValidationIssue[];
  diagnostics: readonly SnapshotPipelineDiagnostic[];
  summary: SnapshotPipelineSummary;
}>;

function pipelineFailure(
  stage: SnapshotPipelineStage,
  error: unknown,
  completedStages: readonly SnapshotPipelineStage[],
): SnapshotPipelineResult {
  const issue: SnapshotValidationIssue = Object.freeze({
    severity: "error",
    code: `SNAPSHOT_PIPELINE_${stage.toUpperCase()}_FAILED`,
    path: stage,
    message: error instanceof Error ? error.message : `Snapshot pipeline ${stage} failed.`,
  });

  return Object.freeze({
    valid: false,
    errors: Object.freeze([issue]),
    warnings: Object.freeze([]),
    diagnostics: Object.freeze([
      ...completedStages.map((completedStage) =>
        Object.freeze({
          stage: completedStage,
          status: "completed" as const,
          message: `Snapshot pipeline ${completedStage} completed.`,
        }),
      ),
      Object.freeze({
        stage,
        status: "failed" as const,
        message: issue.message,
      }),
    ]),
    summary: Object.freeze({
      completedStages: Object.freeze([...completedStages]),
      failedStage: stage,
      snapshotCreated: false,
      validationIncluded: false,
    }),
  });
}

function pipelineSuccess(
  snapshot: Snapshot,
  validation: SnapshotValidationResult,
): SnapshotPipelineResult {
  const completedStages: readonly SnapshotPipelineStage[] = Object.freeze([
    "mapping",
    "building",
    "validation",
  ]);

  return Object.freeze({
    snapshot,
    validation,
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    diagnostics: Object.freeze(
      completedStages.map((stage) =>
        Object.freeze({
          stage,
          status: "completed" as const,
          message: `Snapshot pipeline ${stage} completed.`,
        }),
      ),
    ),
    summary: Object.freeze({
      completedStages,
      snapshotCreated: true,
      validationIncluded: true,
    }),
  });
}

export function runSnapshotPipeline(
  input: DiscoverySnapshotAdapterInput,
): SnapshotPipelineResult {
  let builderInput;

  try {
    builderInput = mapDiscoveryToSnapshotInput(input);
  } catch (error) {
    return pipelineFailure("mapping", error, []);
  }

  let snapshot: Snapshot;

  try {
    snapshot = buildSnapshot(builderInput);
  } catch (error) {
    return pipelineFailure("building", error, ["mapping"]);
  }

  const validation = validateSnapshot(snapshot);
  return pipelineSuccess(snapshot, validation);
}
