export type WeeklyPeriod = {
  period_start: string;
  period_end: string;
  timezone: "UTC";
  boundary: "[start,end)";
};

export type WeeklyEvidenceSourceType = "scan" | "discover" | "saved_idea" | "conversion";

export type WeeklyEvidenceSource = {
  type: WeeklyEvidenceSourceType;
  id: string;
  title: string;
  summary: string;
  created_at: string;
};

export type WeeklySharedSource = {
  type: "problem_intelligence" | "data_moat";
  id: string;
  title: string;
  summary: string;
  created_at?: string | null;
};

export type WeeklyReportProblem = {
  problem_title: string;
  problem_summary: string;
  affected_niches: string;
  suggested_solutions: string;
  pain_score: number;
  revenue_score: number;
  urgency_score: number;
  trend_score: number;
  monetization_angle: string;
  source_evidence: string;
  buying_signal_score: number;
  frequency_score: number;
  opportunity_score: number;
  problem_cluster: string;
  source_quality_score: number;
};

export type WeeklyModelOutput = {
  summary?: unknown;
  problems?: unknown;
};

export type WeeklyDiagnostics = {
  period: WeeklyPeriod;
  userEvidenceCounts: Record<WeeklyEvidenceSourceType, number>;
  sharedSourceCount: number;
  emptyEvidence: boolean;
  reusedExistingReport: boolean;
  validationFailed: boolean;
  persistenceOutcome: "reused" | "inserted" | "failed" | "not_attempted";
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function iso(date: Date) {
  return date.toISOString();
}

function startOfUtcWeek(date: Date) {
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday));
}

export function getWeeklyIntelligencePeriod(now = new Date()): WeeklyPeriod {
  const start = startOfUtcWeek(now);
  const end = new Date(start.getTime() + WEEK_MS);

  return {
    period_start: iso(start),
    period_end: iso(end),
    timezone: "UTC",
    boundary: "[start,end)",
  };
}

export function isInsideWeeklyPeriod(createdAt: string | null | undefined, period: WeeklyPeriod) {
  if (!createdAt) return false;
  const time = new Date(createdAt).getTime();
  return time >= new Date(period.period_start).getTime() && time < new Date(period.period_end).getTime();
}

function safeText(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function clamp(score: unknown, fallback = 5) {
  const value = Number(score);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(10, Math.max(0, Number(value.toFixed(1))));
}


export type WeeklyAggregationItem = {
  kind: string;
  source: string;
  id: string;
  title: string;
  summary: string;
  occurredAt: string;
  parentId?: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
};

export type WeeklyAggregationInput = {
  items: WeeklyAggregationItem[];
  sharedContext: WeeklyAggregationItem[];
  bySource?: Partial<Record<string, WeeklyAggregationItem[]>>;
  diagnostics?: {
    countsBySource?: Record<string, number>;
    skippedSources?: Array<{ source: string; reason: string }>;
    normalizationFailures?: Array<{ source: string; id: string; reason: string }>;
    durationMs?: number;
  };
};

const WEEKLY_CURRENT_KINDS: Record<string, WeeklyEvidenceSourceType> = {
  scan: "scan",
  opportunity: "discover",
  discover_run: "discover",
  discover_problem: "discover",
  saved_idea: "saved_idea",
  user_activity: "conversion",
};

function deterministicWeeklySort<T extends { created_at: string; type: string; id: string }>(a: T, b: T) {
  return a.created_at.localeCompare(b.created_at) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id);
}

function scalarText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isBeforeWeeklyPeriod(createdAt: string | null | undefined, period: WeeklyPeriod) {
  if (!createdAt) return false;
  const time = new Date(createdAt).getTime();
  const start = new Date(period.period_start).getTime();
  return Number.isFinite(time) && time < start;
}

export function mapAggregationItemToWeeklyEvidence(item: WeeklyAggregationItem): WeeklyEvidenceSource | null {
  const type = WEEKLY_CURRENT_KINDS[item.kind];
  if (!type) return null;
  const created_at = item.occurredAt;
  const actionType = scalarText(item.metadata?.actionType);
  const opportunityId = scalarText(item.metadata?.opportunityId);
  const problemId = scalarText(item.metadata?.problemId);
  const sourceCount = item.metadata?.sourceCount;

  if (item.kind === "saved_idea") {
    return { type, id: item.id, title: "Saved idea", summary: `User saved opportunity ${opportunityId || "unknown"}.`, created_at };
  }

  if (item.kind === "user_activity") {
    return { type, id: item.id, title: `Discover action: ${actionType || "unknown"}`, summary: `User action on discovery ${item.parentId || "unknown"} and problem ${problemId || "unknown"}.`, created_at };
  }

  if (item.kind === "discover_run") {
    return { type, id: item.id, title: "Discover generation", summary: item.summary || `Discover analyzed ${sourceCount || 0} sources.`, created_at };
  }

  return { type, id: item.id, title: item.title, summary: item.summary, created_at };
}

export function buildWeeklyEvidenceFromAggregation(aggregation: WeeklyAggregationInput, period: WeeklyPeriod) {
  const userEvidence = aggregation.items
    .filter((item) => isInsideWeeklyPeriod(item.occurredAt, period))
    .map(mapAggregationItemToWeeklyEvidence)
    .filter((item): item is WeeklyEvidenceSource => Boolean(item))
    .sort(deterministicWeeklySort);

  const priorUserContext = (aggregation.bySource?.weekly_reports || [])
    .filter((item) => isBeforeWeeklyPeriod(item.occurredAt, period))
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id))
    .slice(0, 3)
    .map((item) => ({
      type: "scan" as const,
      id: item.id,
      title: "Prior Weekly Intelligence summary",
      summary: item.summary.slice(0, 500) || "Prior weekly report.",
      created_at: item.occurredAt,
    }));

  const sharedContext = aggregation.sharedContext.map((item) => ({
    type: "problem_intelligence" as const,
    id: item.id,
    title: item.title,
    summary: item.summary || `Shared aggregate intelligence score: ${item.metadata?.score || 0}.`,
    created_at: item.occurredAt,
  }));

  return { userEvidence, priorUserContext, sharedContext };
}

export async function collectWeeklyEvidenceFromDataMoat(input: {
  userId: string;
  period: WeeklyPeriod;
  aggregate: (userId: string) => Promise<WeeklyAggregationInput>;
}) {
  if (!input.userId) throw new Error("Weekly Data Moat evidence requires an authenticated user.");
  const aggregation = await input.aggregate(input.userId);
  return { aggregation, ...buildWeeklyEvidenceFromAggregation(aggregation, input.period) };
}

export function countWeeklyEvidence(sources: WeeklyEvidenceSource[]): Record<WeeklyEvidenceSourceType, number> {
  return sources.reduce<Record<WeeklyEvidenceSourceType, number>>(
    (counts, source) => ({ ...counts, [source.type]: counts[source.type] + 1 }),
    { scan: 0, discover: 0, saved_idea: 0, conversion: 0 }
  );
}

export function hasMeaningfulWeeklyEvidence(sources: WeeklyEvidenceSource[]) {
  return sources.some((source) => source.type === "scan" || source.type === "discover" || source.type === "saved_idea" || source.type === "conversion");
}

export function buildEmptyWeeklyReport(period: WeeklyPeriod) {
  return {
    summary: `No eligible user-owned activity was found for ${period.period_start} through ${period.period_end}. SaaSScout is not fabricating personalized weekly insights from shared trends.`,
    problems: [] as WeeklyReportProblem[],
  };
}

export function buildWeeklyIntelligencePrompt(input: {
  period: WeeklyPeriod;
  userEvidence: WeeklyEvidenceSource[];
  priorUserContext: WeeklyEvidenceSource[];
  sharedContext: WeeklySharedSource[];
}) {
  return `You are SaaSScout's Weekly Intelligence engine.

Reporting period:
- period_start inclusive: ${input.period.period_start}
- period_end exclusive: ${input.period.period_end}
- timezone: ${input.period.timezone}

User-owned evidence for this period:
${input.userEvidence.map((source, index) => `${index + 1}. [${source.type}] ${source.title}\nCreated: ${source.created_at}\nSummary: ${source.summary}`).join("\n") || "None"}

Prior user context, outside the reporting period, for continuity only:
${input.priorUserContext.map((source, index) => `${index + 1}. [${source.type}] ${source.title}\nCreated: ${source.created_at}\nSummary: ${source.summary}`).join("\n") || "None"}

Optional shared aggregate context. This is supplementary only and must never be presented as private user activity:
${input.sharedContext.map((source, index) => `${index + 1}. [${source.type}] ${source.title}\nSummary: ${source.summary}`).join("\n") || "None"}

Generation constraints:
- Ground primary conclusions in user-owned evidence.
- Clearly distinguish observed user evidence from inference.
- Do not claim week-over-week change unless prior user context supports it.
- Do not present shared aggregate context as the user's own activity.
- Do not fabricate metrics or sources.
- Return ONLY valid JSON with { "summary": string, "problems": [] } using the existing problem fields.`;
}

export function validateWeeklyModelOutput(output: WeeklyModelOutput, evidence: WeeklyEvidenceSource[]) {
  if (!output || typeof output !== "object") throw new Error("Malformed weekly intelligence output.");
  const summary = safeText(output.summary, "Weekly intelligence generated from user-owned activity.");
  if (!Array.isArray(output.problems)) throw new Error("Malformed weekly intelligence output.");

  const hasEvidence = hasMeaningfulWeeklyEvidence(evidence);
  if (!hasEvidence && output.problems.length > 0) {
    throw new Error("Weekly intelligence output included personalized problems without user evidence.");
  }

  const problems = output.problems.slice(0, 5).map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Malformed weekly intelligence problem.");
    const row = raw as Record<string, unknown>;
    const sourceEvidence = safeText(row.source_evidence);
    if (hasEvidence && !sourceEvidence) throw new Error("Weekly intelligence problem is missing source evidence.");

    return {
      problem_title: safeText(row.problem_title, "Untitled weekly pattern"),
      problem_summary: safeText(row.problem_summary, "Observed from user-owned weekly activity."),
      affected_niches: safeText(row.affected_niches, "User explored market"),
      suggested_solutions: safeText(row.suggested_solutions, "Validation follow-up"),
      pain_score: clamp(row.pain_score),
      revenue_score: clamp(row.revenue_score),
      urgency_score: clamp(row.urgency_score),
      trend_score: clamp(row.trend_score),
      monetization_angle: safeText(row.monetization_angle, "Validate willingness to pay before building."),
      source_evidence: sourceEvidence || "No eligible user evidence available this period.",
      buying_signal_score: clamp(row.buying_signal_score, 0),
      frequency_score: clamp(row.frequency_score, 0),
      opportunity_score: clamp(row.opportunity_score, 0),
      problem_cluster: safeText(row.problem_cluster, "user_weekly_activity"),
      source_quality_score: clamp(row.source_quality_score, 0),
    };
  });

  return { summary, problems };
}
