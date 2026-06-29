import {
  buildProblemObservationBatch,
  serializeProblemObservation,
  type ProblemObservation,
  type ProblemObservationInput,
} from "../problem-observations.ts";

export type DualWriteFailure = {
  stage: "legacy" | "knowledge_evolution";
  message: string;
};

export type DualWriteReport = {
  legacy_success: boolean;
  knowledge_success: boolean;
  knowledge_skipped: boolean;
  execution_time_ms: number;
  observation_count: number;
  skipped_observations: number;
  validation_failures: string[];
  persistence_failures: DualWriteFailure[];
};

export type LegacyWriteResult<T> = {
  result: T;
  persistedCount?: number;
};

export type KnowledgeEvolutionWriteResult = {
  observations: ProblemObservation[];
  serializedObservations: ReturnType<typeof serializeProblemObservation>[];
  report: DualWriteReport;
};

export type DualWriteResult<T> = {
  legacyResult: T;
  knowledgeResult: KnowledgeEvolutionWriteResult | null;
  report: DualWriteReport;
};

export type WriteLegacyOptions<T> = {
  write: () => Promise<T> | T;
};

export type WriteKnowledgeEvolutionOptions = {
  observationInputs?: ProblemObservationInput[];
  getObservationInputs?: () => ProblemObservationInput[];
  write?: (options: { observationInputs: ProblemObservationInput[] }) => Promise<KnowledgeEvolutionWriteResult> | KnowledgeEvolutionWriteResult;
};

export type WriteDualOptions<T> = {
  legacy: WriteLegacyOptions<T>;
  knowledgeEvolution: WriteKnowledgeEvolutionOptions;
  featureFlag?: string | null;
  now?: () => number;
  logger?: Pick<Console, "info" | "warn">;
};

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "Unknown dual-write error.";
}

function emptyReport(overrides: Partial<DualWriteReport> = {}): DualWriteReport {
  return {
    legacy_success: false,
    knowledge_success: false,
    knowledge_skipped: false,
    execution_time_ms: 0,
    observation_count: 0,
    skipped_observations: 0,
    validation_failures: [],
    persistence_failures: [],
    ...overrides,
  };
}

export function shouldWriteKnowledgeEvolution(flagValue: string | null | undefined = process.env.KNOWLEDGE_EVOLUTION_DUAL_WRITE) {
  return flagValue === "1";
}

export function createDualWriteReport(input: Partial<DualWriteReport> = {}): DualWriteReport {
  return emptyReport(input);
}

export async function writeLegacy<T>({ write }: WriteLegacyOptions<T>): Promise<T> {
  return await write();
}

export async function writeKnowledgeEvolution({
  observationInputs = [],
}: WriteKnowledgeEvolutionOptions): Promise<KnowledgeEvolutionWriteResult> {
  const validationFailures: string[] = [];
  const observations: ProblemObservation[] = [];

  for (const [index, input] of observationInputs.entries()) {
    try {
      observations.push(...buildProblemObservationBatch([input]));
    } catch (error) {
      validationFailures.push(`Observation ${index + 1}: ${messageFor(error)}`);
    }
  }

  const serializedObservations = observations.map((observation) => serializeProblemObservation(observation));

  return {
    observations,
    serializedObservations,
    report: emptyReport({
      legacy_success: true,
      knowledge_success: validationFailures.length === 0,
      observation_count: observations.length,
      skipped_observations: validationFailures.length,
      validation_failures: validationFailures,
    }),
  };
}

export async function writeDual<T>({
  legacy,
  knowledgeEvolution,
  featureFlag = process.env.KNOWLEDGE_EVOLUTION_DUAL_WRITE,
  now = () => Date.now(),
  logger = console,
}: WriteDualOptions<T>): Promise<DualWriteResult<T>> {
  const startedAt = now();
  let legacyResult: T;

  try {
    legacyResult = await writeLegacy(legacy);
  } catch (error) {
    const report = emptyReport({
      execution_time_ms: Math.max(0, now() - startedAt),
      knowledge_skipped: true,
      skipped_observations: (knowledgeEvolution.observationInputs || knowledgeEvolution.getObservationInputs?.() || []).length,
      persistence_failures: [{ stage: "legacy", message: messageFor(error) }],
    });
    throw Object.assign(error instanceof Error ? error : new Error(messageFor(error)), {
      dualWriteReport: report,
    });
  }

  if (!shouldWriteKnowledgeEvolution(featureFlag)) {
    return {
      legacyResult,
      knowledgeResult: null,
      report: emptyReport({
        legacy_success: true,
        knowledge_skipped: true,
        execution_time_ms: Math.max(0, now() - startedAt),
        skipped_observations: (knowledgeEvolution.observationInputs || knowledgeEvolution.getObservationInputs?.() || []).length,
      }),
    };
  }

  try {
    const observationInputs = knowledgeEvolution.observationInputs || knowledgeEvolution.getObservationInputs?.() || [];
    const knowledgeResult = await (knowledgeEvolution.write || writeKnowledgeEvolution)({
      observationInputs,
    });
    const report = {
      ...knowledgeResult.report,
      legacy_success: true,
      execution_time_ms: Math.max(0, now() - startedAt),
    };

    if (!report.knowledge_success) {
      logger.warn("Knowledge Evolution dual-write completed with validation failures:", report);
    } else {
      logger.info("Knowledge Evolution dual-write report:", report);
    }

    return { legacyResult, knowledgeResult: { ...knowledgeResult, report }, report };
  } catch (error) {
    const report = emptyReport({
      legacy_success: true,
      execution_time_ms: Math.max(0, now() - startedAt),
      skipped_observations: (knowledgeEvolution.observationInputs || knowledgeEvolution.getObservationInputs?.() || []).length,
      persistence_failures: [{ stage: "knowledge_evolution", message: messageFor(error) }],
    });
    logger.warn("Knowledge Evolution dual-write failed after legacy persistence succeeded:", report);
    return { legacyResult, knowledgeResult: null, report };
  }
}
