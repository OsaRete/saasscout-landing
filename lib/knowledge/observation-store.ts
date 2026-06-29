import {
  buildProblemObservationBatch,
  validateProblemObservation,
  type ProblemObservation,
  type ProblemObservationInput,
} from "./problem-observations.ts";

export type ProblemObservationPersistenceClient = {
  from(table: "problem_observations"): {
    upsert(rows: ProblemObservationRow[], options: { onConflict: string; ignoreDuplicates: boolean }): {
      select(columns: string): PromiseLike<{ data?: Array<{ observation_fingerprint?: string | null }> | null; error?: unknown; count?: number | null }>;
    };
  };
};

export type ProblemObservationRow = {
  observation_fingerprint: string;
  problem_title: string;
  normalized_problem_title: string;
  problem_summary: string | null;
  source_table: string | null;
  source_row_id: string | null;
  source_url: string | null;
  source_type: string | null;
  source_evidence: string | null;
  source_author_id: string | null;
  source_metrics: Record<string, unknown>;
  affected_niches: string[];
  problem_cluster: string | null;
  pain_score: number | null;
  revenue_score: number | null;
  urgency_score: number | null;
  trend_score: number | null;
  buying_signal_score: number | null;
  frequency_score: number | null;
  source_quality_score: number | null;
  opportunity_score: number | null;
  confidence_score: number | null;
  evidence_quality: "low" | "medium" | "high" | null;
  observed_at: string | null;
  metadata: Record<string, unknown>;
};

export type ProblemObservationPersistenceDiagnostics = {
  attempted_observation_count: number;
  inserted_count: number | null;
  skipped_count: number | null;
  failed_count: number;
  warnings: string[];
  persistence_errors: string[];
};

export type PersistProblemObservationsResult = {
  observations: ProblemObservation[];
  rows: ProblemObservationRow[];
  diagnostics: ProblemObservationPersistenceDiagnostics;
};

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "Unknown problem observation persistence error.";
}

function emptyDiagnostics(overrides: Partial<ProblemObservationPersistenceDiagnostics> = {}): ProblemObservationPersistenceDiagnostics {
  return {
    attempted_observation_count: 0,
    inserted_count: null,
    skipped_count: null,
    failed_count: 0,
    warnings: [],
    persistence_errors: [],
    ...overrides,
  };
}

function evidenceQualityFor(observation: ProblemObservation): "low" | "medium" | "high" | null {
  const quality = observation.source_quality_score ?? observation.source_quality ?? 0;
  if (quality >= 8) return "high";
  if (quality >= 5) return "medium";
  if (quality > 0) return "low";
  return null;
}

export function problemObservationToRow(observation: ProblemObservation): ProblemObservationRow {
  const validation = validateProblemObservation(observation);
  if (!validation.valid) {
    throw new Error(`Invalid problem observation: ${validation.errors.join(" ")}`);
  }

  return {
    observation_fingerprint: observation.observation_fingerprint,
    problem_title: observation.problem_title!,
    normalized_problem_title: observation.normalized_title,
    problem_summary: observation.evidence_summary,
    source_table: observation.provenance.source_table,
    source_row_id: observation.provenance.source_id ?? observation.provenance.row_id ?? observation.provenance.discovery_id ?? null,
    source_url: observation.provenance.source_url ?? null,
    source_type: observation.source_metadata.sourceType,
    source_evidence: observation.evidence_summary,
    source_author_id: null,
    source_metrics: {
      source_rank: observation.provenance.source_rank ?? null,
      source_count: observation.source_count ?? 0,
      evidence_count: observation.evidence_count ?? 0,
      source_types: observation.source_types ?? [],
    },
    affected_niches: observation.niche_metadata.affectedNiches,
    problem_cluster: observation.problem_cluster ?? observation.niche_metadata.problemCluster,
    pain_score: observation.pain_score ?? null,
    revenue_score: observation.revenue_score ?? null,
    urgency_score: observation.urgency_score ?? null,
    trend_score: observation.trend_score ?? null,
    buying_signal_score: observation.buying_signal_score ?? null,
    frequency_score: observation.frequency_score ?? null,
    source_quality_score: observation.source_quality_score ?? null,
    opportunity_score: observation.opportunity_score ?? null,
    confidence_score: observation.confidence,
    evidence_quality: evidenceQualityFor(observation),
    observed_at: observation.timestamps.observed_at,
    metadata: {
      source_name: observation.source_metadata.sourceName ?? null,
      market: observation.market_metadata.market,
      audience: observation.market_metadata.audience,
      niche_category: observation.niche_metadata.nicheCategory,
      prepared_count: observation.prepared_count ?? 0,
      converted_count: observation.converted_count ?? 0,
      first_seen_at: observation.timestamps.first_seen_at,
      last_seen_at: observation.timestamps.last_seen_at,
    },
  };
}

export async function persistProblemObservations(
  client: ProblemObservationPersistenceClient,
  observationInputs: ProblemObservationInput[]
): Promise<PersistProblemObservationsResult> {
  const attemptedCount = observationInputs.length;
  const warnings: string[] = [];
  const persistenceErrors: string[] = [];
  const observations: ProblemObservation[] = [];

  for (const [index, input] of observationInputs.entries()) {
    try {
      observations.push(...buildProblemObservationBatch([input]));
    } catch (error) {
      warnings.push(`Observation ${index + 1} validation failed: ${messageFor(error)}`);
    }
  }

  const rows = observations.map((observation) => problemObservationToRow(observation));

  if (rows.length === 0) {
    return {
      observations,
      rows,
      diagnostics: emptyDiagnostics({
        attempted_observation_count: attemptedCount,
        inserted_count: 0,
        skipped_count: attemptedCount,
        failed_count: attemptedCount,
        warnings,
      }),
    };
  }

  try {
    const result = await client
      .from("problem_observations")
      .upsert(rows, { onConflict: "observation_fingerprint", ignoreDuplicates: true })
      .select("observation_fingerprint");

    if (result.error) {
      persistenceErrors.push(messageFor(result.error));
      return {
        observations,
        rows,
        diagnostics: emptyDiagnostics({
          attempted_observation_count: attemptedCount,
          inserted_count: 0,
          skipped_count: attemptedCount - rows.length,
          failed_count: rows.length,
          warnings,
          persistence_errors: persistenceErrors,
        }),
      };
    }

    const insertedCount = Array.isArray(result.data) ? result.data.length : result.count ?? null;
    const validationSkippedCount = attemptedCount - rows.length;
    const skippedCount = insertedCount === null ? validationSkippedCount : Math.max(0, attemptedCount - insertedCount);

    return {
      observations,
      rows,
      diagnostics: emptyDiagnostics({
        attempted_observation_count: attemptedCount,
        inserted_count: insertedCount,
        skipped_count: skippedCount,
        failed_count: validationSkippedCount,
        warnings,
      }),
    };
  } catch (error) {
    persistenceErrors.push(messageFor(error));
    return {
      observations,
      rows,
      diagnostics: emptyDiagnostics({
        attempted_observation_count: attemptedCount,
        inserted_count: 0,
        skipped_count: attemptedCount - rows.length,
        failed_count: rows.length,
        warnings,
        persistence_errors: persistenceErrors,
      }),
    };
  }
}
