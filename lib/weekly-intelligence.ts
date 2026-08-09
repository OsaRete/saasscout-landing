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
  provenance?: string;
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
  problem_summary: string | null;
  affected_users?: string | null;
  affected_niches: string | null;
  observed_evidence?: string | null;
  repeated_patterns?: string | null;
  business_impact?: string | null;
  why_existing_tools_fail?: string | null;
  suggested_solutions: string | null;
  suggested_mvp?: string | null;
  monetization_angle: string | null;
  recommended_validation?: string | null;
  recommended_deep_scan?: string | null;
  evidence_references?: string[];
  pain_score: number | null;
  revenue_score: number | null;
  urgency_score: number | null;
  trend_score: number | null;
  intelligence_score?: number | null;
  confidence_score?: number;
  evidence_strength?: "limited" | "moderate" | "strong";
  source_evidence: string;
  buying_signal_score: number;
  frequency_score: number;
  opportunity_score: number;
  problem_cluster: string;
  source_quality_score: number;
};


export type AuthoritativeWeeklyRun = {
  id: string;
  period_start: string;
  period_end: string;
  summary: string | null;
  total_sources_analyzed: number | null;
};

export type AuthoritativeWeeklyProblem = {
  id: string;
  run_id: string;
  problem_title: string;
  affected_niches: string | null;
  pain_score: number | null;
  trend_score: number | null;
};

export type DashboardWeeklyReport = {
  id: string;
  week_start: string;
  week_end: string;
  summary: string | null;
  strongest_trend: string | null;
  total_sources_analyzed: number | null;
  average_trend_score: number | null;
  average_pain_intensity: number | null;
};

export type DashboardWeeklyNiche = {
  id: string;
  weekly_report_id: string;
  niche: string;
  trend_score: number | null;
  pain_intensity: number | null;
  source_volume: number | null;
  movement: string | null;
};

function averageScore(values: Array<number | null | undefined>) {
  const scores = values.map(Number).filter(Number.isFinite);
  if (scores.length === 0) return null;
  return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1));
}

export function mapAuthoritativeWeeklyToDashboard(run: AuthoritativeWeeklyRun | null, problems: AuthoritativeWeeklyProblem[]) {
  if (!run) return { weeklyReport: null, weeklyNiches: [] as DashboardWeeklyNiche[] };

  const orderedProblems = problems
    .slice()
    .sort((a, b) => Number(b.trend_score || 0) - Number(a.trend_score || 0) || a.problem_title.localeCompare(b.problem_title));

  const weeklyReport: DashboardWeeklyReport = {
    id: run.id,
    week_start: run.period_start,
    week_end: run.period_end,
    summary: run.summary,
    strongest_trend: orderedProblems[0]?.problem_title || null,
    total_sources_analyzed: run.total_sources_analyzed,
    average_trend_score: averageScore(problems.map((problem) => problem.trend_score)),
    average_pain_intensity: averageScore(problems.map((problem) => problem.pain_score)),
  };

  const weeklyNiches = orderedProblems.slice(0, 5).map((problem) => ({
    id: problem.id,
    weekly_report_id: run.id,
    niche: problem.affected_niches || problem.problem_title,
    trend_score: problem.trend_score,
    pain_intensity: problem.pain_score,
    source_volume: 1,
    movement: "Stable",
  }));

  return { weeklyReport, weeklyNiches };
}

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


export function normalizeWeeklyProblemTitleKey(title: string | null | undefined) {
  return String(title || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function clamp(score: unknown, fallback: number | null = null) {
  const value = Number(score);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(10, Math.max(0, Number(value.toFixed(1))));
}

const SCORE_SIGNALS = {
  pain: ["pain", "friction", "manual", "wasting", "difficult", "broken", "error", "complaint"],
  urgency: ["urgent", "immediately", "blocked", "deadline", "now", "critical", "cannot"],
  revenue: ["pay", "paid", "price", "revenue", "cost", "customer", "client", "business"],
} as const;

function signalScore(texts: string[], signals: readonly string[]) {
  if (texts.length === 0) return null;
  const matches = texts.reduce((total, text) => total + signals.filter((signal) => text.toLowerCase().includes(signal)).length, 0);
  return clamp(2 + Math.min(8, matches * 2));
}

/** Deterministic scores derived only from references to eligible evidence. */
export function calculateWeeklyProblemScores(references: string[], evidence: WeeklyEvidenceSource[], priorUserContext: WeeklyEvidenceSource[] = []) {
  const referenceSet = new Set(references);
  const matched = evidence.filter((item) => referenceSet.has(item.id));
  const texts = matched.map((item) => `${item.title} ${item.summary}`);
  const uniqueTypes = new Set(matched.map((item) => item.type)).size;
  const confidence = matched.length === 0 ? 0 : clamp(matched.length * 1.6 + uniqueTypes * 1.2, 0) || 0;
  const trend = matched.length < 2 ? null : clamp(2 + Math.min(8, (matched.length - 1) * 2 + (priorUserContext.length > 0 ? 1 : 0)));
  const pain = signalScore(texts, SCORE_SIGNALS.pain);
  const urgency = signalScore(texts, SCORE_SIGNALS.urgency);
  const revenue = signalScore(texts, SCORE_SIGNALS.revenue);
  const scored = [pain, urgency, revenue, trend].filter((value): value is number => value !== null);
  const intelligence = scored.length < 2 ? null : Number((scored.reduce((sum, value) => sum + value, 0) / scored.length).toFixed(1));
  return {
    pain_score: pain,
    urgency_score: urgency,
    revenue_score: revenue,
    trend_score: trend,
    intelligence_score: intelligence,
    confidence_score: confidence,
    evidence_strength: matched.length >= 4 && uniqueTypes >= 2 ? "strong" as const : matched.length >= 2 ? "moderate" as const : "limited" as const,
  };
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
  return sources.some((source) => Boolean(source.id) && (source.type === "scan" || source.type === "discover" || source.type === "saved_idea" || source.type === "conversion"));
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
- Every problem must include a specific title and evidence_references containing only IDs shown above.
- A problem requires at least one evidence reference. Do not output a problem that cannot be traced to eligible evidence.
- Do not assign numeric scores. SaaSScout calculates scores deterministically after validation.
- Optional fields must be null when evidence does not support them; never use generic filler.
- Return ONLY valid JSON with { "summary": string, "problems": [{ "problem_title": string, "problem_summary": string|null, "affected_users": string|null, "affected_niches": string|null, "observed_evidence": string|null, "repeated_patterns": string|null, "business_impact": string|null, "why_existing_tools_fail": string|null, "suggested_solutions": string|null, "suggested_mvp": string|null, "monetization_angle": string|null, "recommended_validation": string|null, "recommended_deep_scan": string|null, "evidence_references": string[] }] }.`;
}

export function validateWeeklyModelOutput(output: WeeklyModelOutput, evidence: WeeklyEvidenceSource[], priorUserContext: WeeklyEvidenceSource[] = []) {
  if (!output || typeof output !== "object") throw new Error("Malformed weekly intelligence output.");
  const summary = safeText(output.summary);
  if (!summary) throw new Error("Weekly intelligence output is missing a summary.");
  if (!Array.isArray(output.problems)) throw new Error("Malformed weekly intelligence output.");

  const hasEvidence = hasMeaningfulWeeklyEvidence(evidence);
  if (!hasEvidence && output.problems.length > 0) {
    throw new Error("Weekly intelligence output included personalized problems without user evidence.");
  }

  const problems = output.problems.slice(0, 5).map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Malformed weekly intelligence problem.");
    const row = raw as Record<string, unknown>;
    const title = safeText(row.problem_title);
    if (!title) throw new Error("Weekly intelligence problem is missing a title.");
    const references = Array.isArray(row.evidence_references) ? [...new Set(row.evidence_references.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))] : [];
    const eligibleIds = new Set(evidence.map((item) => item.id));
    if (references.length === 0 || references.some((id) => !eligibleIds.has(id))) throw new Error("Weekly intelligence problem has invalid evidence references.");
    const matchedEvidence = evidence.filter((item) => references.includes(item.id));
    const sourceEvidence = matchedEvidence.map((item) => item.summary).filter(Boolean).join(" ");
    const scores = calculateWeeklyProblemScores(references, evidence, priorUserContext);
    const optionalText = (key: string) => safeText(row[key]) || null;

    return {
      problem_title: title,
      problem_summary: optionalText("problem_summary"), affected_users: optionalText("affected_users"), affected_niches: optionalText("affected_niches"),
      observed_evidence: optionalText("observed_evidence"), repeated_patterns: optionalText("repeated_patterns"), business_impact: optionalText("business_impact"),
      why_existing_tools_fail: optionalText("why_existing_tools_fail"), suggested_solutions: optionalText("suggested_solutions"), suggested_mvp: optionalText("suggested_mvp"),
      monetization_angle: optionalText("monetization_angle"), recommended_validation: optionalText("recommended_validation"), recommended_deep_scan: optionalText("recommended_deep_scan"),
      evidence_references: references, ...scores, source_evidence: sourceEvidence,
      buying_signal_score: 0, frequency_score: clamp(matchedEvidence.length * 2, 0) || 0, opportunity_score: scores.intelligence_score || 0,
      problem_cluster: normalizeWeeklyProblemTitleKey(title), source_quality_score: scores.confidence_score,
    };
  });

  return { summary, problems };
}
