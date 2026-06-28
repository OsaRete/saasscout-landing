import { classifyProblemEvolution } from "./classifier.ts";
import type { ProblemEvolutionAssessment, ProblemEvolutionClassifierOptions, ProblemEvolutionObservation } from "./types.ts";
import {
  discoveredProblemRowToEvolutionObservation,
  problemIntelligenceRowToEvolutionObservation,
  weeklyDetectedProblemRowToEvolutionObservation,
  weeklySourceRowToEvolutionObservation,
  type EvolutionSourceTable,
  type RowLike,
} from "./adapters/index.ts";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export type KnowledgeEvolutionSupabaseClient = {
  from(table: EvolutionSourceTable): KnowledgeEvolutionQueryBuilder;
};

type QueryResult = {
  data?: RowLike[] | null;
  error?: unknown;
};

type QueryPromise = PromiseLike<QueryResult>;

type KnowledgeEvolutionQueryBuilder = QueryPromise & {
  select?(columns: string): KnowledgeEvolutionQueryBuilder;
  ilike?(column: string, pattern: string): KnowledgeEvolutionQueryBuilder;
  eq?(column: string, value: unknown): KnowledgeEvolutionQueryBuilder;
  gte?(column: string, value: unknown): KnowledgeEvolutionQueryBuilder;
  order?(column: string, options: { ascending: boolean }): KnowledgeEvolutionQueryBuilder;
  limit?(count: number): QueryPromise;
};

export type ProblemEvolutionRepositoryOptions = {
  problemTitle?: string;
  since?: string | Date;
  limit?: number;
  includeWeeklySources?: boolean;
  includeDiscoveredProblems?: boolean;
};

export type ProblemEvolutionSourceDiagnostic = {
  table: EvolutionSourceTable;
  attempted: boolean;
  succeeded: boolean;
  rowCount: number;
  warning?: string;
};

export type ProblemEvolutionRepositoryDiagnostics = {
  requestedTables: EvolutionSourceTable[];
  successfulTables: EvolutionSourceTable[];
  failedTables: EvolutionSourceTable[];
  totalRowsRead: number;
  observationCount: number;
  limit: number;
  filters: {
    problemTitle: string | null;
    since: string | null;
  };
  sources: ProblemEvolutionSourceDiagnostic[];
};

export type ProblemEvolutionObservationsResult = {
  observations: ProblemEvolutionObservation[];
  diagnostics: ProblemEvolutionRepositoryDiagnostics;
  warnings: string[];
};

export type ProblemEvolutionAssessmentResult = ProblemEvolutionObservationsResult & {
  assessment: ProblemEvolutionAssessment;
};

export type RecentProblemEvolutionAssessmentsResult = {
  assessments: Array<{
    problemTitle: string;
    observations: ProblemEvolutionObservation[];
    assessment: ProblemEvolutionAssessment;
  }>;
  diagnostics: ProblemEvolutionRepositoryDiagnostics & {
    assessedProblemCount: number;
  };
  warnings: string[];
};

const ADAPTERS: Record<EvolutionSourceTable, (row: RowLike) => ProblemEvolutionObservation> = {
  problem_intelligence: problemIntelligenceRowToEvolutionObservation,
  weekly_detected_problems: weeklyDetectedProblemRowToEvolutionObservation,
  weekly_sources: weeklySourceRowToEvolutionObservation,
  discovered_problems: discoveredProblemRowToEvolutionObservation,
};

function normalizeLimit(limit: number | undefined) {
  if (!Number.isFinite(Number(limit))) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(limit))));
}

function isoOrNull(value: string | Date | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error || "Unknown query failure");
}

function requestedTables(options: ProblemEvolutionRepositoryOptions): EvolutionSourceTable[] {
  return [
    "problem_intelligence",
    "weekly_detected_problems",
    ...(options.includeWeeklySources === false ? [] : ["weekly_sources" as const]),
    ...(options.includeDiscoveredProblems === false ? [] : ["discovered_problems" as const]),
  ];
}

async function readTable(client: KnowledgeEvolutionSupabaseClient, table: EvolutionSourceTable, options: ProblemEvolutionRepositoryOptions, limit: number): Promise<{ rows: RowLike[]; diagnostic: ProblemEvolutionSourceDiagnostic; warning?: string }> {
  try {
    let query = client.from(table);
    if (query.select) {
      query = query.select("*");
    }
    const since = isoOrNull(options.since);

    if (options.problemTitle?.trim() && query.ilike) {
      query = query.ilike("problem_title", `%${options.problemTitle.trim()}%`);
    }

    if (since && query.gte) {
      query = query.gte("created_at", since);
    }

    if (query.order) {
      query = query.order("created_at", { ascending: false });
    }

    const result = query.limit ? await query.limit(limit) : await query;

    if (result.error) {
      const warning = `${table} read failed: ${messageFor(result.error)}`;
      return { rows: [], warning, diagnostic: { table, attempted: true, succeeded: false, rowCount: 0, warning } };
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    return { rows, diagnostic: { table, attempted: true, succeeded: true, rowCount: rows.length } };
  } catch (error) {
    const warning = `${table} read failed: ${messageFor(error)}`;
    return { rows: [], warning, diagnostic: { table, attempted: true, succeeded: false, rowCount: 0, warning } };
  }
}

function buildDiagnostics({ options, limit, diagnostics, observationCount }: { options: ProblemEvolutionRepositoryOptions; limit: number; diagnostics: ProblemEvolutionSourceDiagnostic[]; observationCount: number }): ProblemEvolutionRepositoryDiagnostics {
  return {
    requestedTables: diagnostics.map((item) => item.table),
    successfulTables: diagnostics.filter((item) => item.succeeded).map((item) => item.table),
    failedTables: diagnostics.filter((item) => !item.succeeded).map((item) => item.table),
    totalRowsRead: diagnostics.reduce((sum, item) => sum + item.rowCount, 0),
    observationCount,
    limit,
    filters: {
      problemTitle: options.problemTitle?.trim() || null,
      since: isoOrNull(options.since),
    },
    sources: diagnostics,
  };
}

export async function getProblemEvolutionObservations(client: KnowledgeEvolutionSupabaseClient, options: ProblemEvolutionRepositoryOptions = {}): Promise<ProblemEvolutionObservationsResult> {
  const limit = normalizeLimit(options.limit);
  const warnings: string[] = [];
  const observations: ProblemEvolutionObservation[] = [];
  const sourceDiagnostics: ProblemEvolutionSourceDiagnostic[] = [];

  for (const table of requestedTables(options)) {
    const result = await readTable(client, table, options, limit);
    sourceDiagnostics.push(result.diagnostic);
    if (result.warning) warnings.push(result.warning);
    observations.push(...result.rows.map((row) => ADAPTERS[table](row)));
  }

  if (sourceDiagnostics.length > 0 && sourceDiagnostics.every((item) => !item.succeeded)) {
    throw new Error(`Knowledge Evolution repository could not read any Data Moat source: ${warnings.join("; ")}`);
  }

  return {
    observations,
    warnings,
    diagnostics: buildDiagnostics({ options, limit, diagnostics: sourceDiagnostics, observationCount: observations.length }),
  };
}

export async function assessProblemEvolution(client: KnowledgeEvolutionSupabaseClient, options: ProblemEvolutionRepositoryOptions & { classifierOptions?: ProblemEvolutionClassifierOptions } = {}): Promise<ProblemEvolutionAssessmentResult> {
  const result = await getProblemEvolutionObservations(client, options);
  return {
    ...result,
    assessment: classifyProblemEvolution({ observations: result.observations }, options.classifierOptions),
  };
}

export async function getRecentProblemEvolutionAssessments(client: KnowledgeEvolutionSupabaseClient, options: ProblemEvolutionRepositoryOptions & { classifierOptions?: ProblemEvolutionClassifierOptions } = {}): Promise<RecentProblemEvolutionAssessmentsResult> {
  const result = await getProblemEvolutionObservations(client, options);
  const grouped = new Map<string, ProblemEvolutionObservation[]>();

  for (const observation of result.observations) {
    const title = observation.problem_title?.trim() || "Untitled problem";
    grouped.set(title, [...(grouped.get(title) || []), observation]);
  }

  const assessments = Array.from(grouped.entries()).slice(0, normalizeLimit(options.limit)).map(([problemTitle, observations]) => ({
    problemTitle,
    observations,
    assessment: classifyProblemEvolution({ observations }, options.classifierOptions),
  }));

  return {
    assessments,
    warnings: result.warnings,
    diagnostics: {
      ...result.diagnostics,
      assessedProblemCount: assessments.length,
    },
  };
}
