export type WeeklyPeriod = {
  period_start: string;
  period_end: string;
  timezone: "UTC";
  boundary: "[start,end)";
};

export type WeeklyEvidenceSourceType = "scan" | "discover" | "saved_idea" | "conversion" | "external" | "historical_context";

export type WeeklyExecutionMode = "fresh_market" | "mixed" | "data_moat_fallback" | "insufficient_context";
export const WEEKLY_EXECUTION_CONTRACT_VERSION = "weekly-execution@1" as const;

export type WeeklyEvidenceSource = {
  type: WeeklyEvidenceSourceType;
  id: string;
  title: string;
  summary: string;
  created_at: string;
  provenance?: string;
  monitoring_topic?: string;
  source_type?: string;
  freshness?: string;
  published_at?: string | null;
};

export const WEEKLY_MODEL_ENVELOPE_LIMITS = Object.freeze({ externalEvidence: 20, currentInternalEvidence: 8, historicalContext: 4, titleCharacters: 140, excerptCharacters: 360, topicCharacters: 100, historicalTitleCharacters: 100, historicalSummaryCharacters: 240, sharedContext: 2, sharedTitleCharacters: 100, sharedSummaryCharacters: 180, problems: 3, reportSummaryCharacters: 500, problemTitleCharacters: 100, problemFieldCharacters: 360, evidenceReferences: 8, maxOutputTokens: 3000 } as const);

function boundedPromptText(value: unknown, maximum: number) {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return normalized.length <= maximum ? normalized : normalized.slice(0, Math.max(0, maximum - 1)).trimEnd() + "…";
}

const freshnessRank: Readonly<Record<string, number>> = { changed: 0, new: 1, publication_unknown: 1, resurfaced: 2 };

/** Stable round-robin selection represents every available topic before adding corroboration. */
export function selectWeeklyModelEvidence(evidence: readonly WeeklyEvidenceSource[], limit = WEEKLY_MODEL_ENVELOPE_LIMITS.externalEvidence) {
  const historical = evidence.filter((item) => item.type === "historical_context").sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)).slice(0, WEEKLY_MODEL_ENVELOPE_LIMITS.historicalContext);
  const internal = evidence.filter((item) => item.type !== "external" && item.type !== "historical_context").sort((a, b) => b.created_at.localeCompare(a.created_at) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id)).slice(0, WEEKLY_MODEL_ENVELOPE_LIMITS.currentInternalEvidence);
  const external = evidence.filter((item) => item.type === "external");
  const compare = (a: WeeklyEvidenceSource, b: WeeklyEvidenceSource) => (freshnessRank[a.freshness || ""] ?? 9) - (freshnessRank[b.freshness || ""] ?? 9) || (b.published_at || b.created_at).localeCompare(a.published_at || a.created_at) || a.id.localeCompare(b.id);
  const groups = new Map<string, WeeklyEvidenceSource[]>();
  for (const item of external.slice().sort(compare)) { const topic = item.monitoring_topic || "unassigned"; groups.set(topic, [...(groups.get(topic) || []), item]); }
  const topics = [...groups.keys()].sort();
  const selected: WeeklyEvidenceSource[] = [];
  while (selected.length < limit && topics.some((topic) => (groups.get(topic)?.length || 0) > 0)) for (const topic of topics) { const item = groups.get(topic)?.shift(); if (item) selected.push(item); if (selected.length === limit) break; }
  return [...internal, ...historical, ...selected];
}

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

export const WEEKLY_SOLUTION_TYPES = ["saas", "software_product", "startup", "plugin", "extension", "api", "marketplace", "productized_service", "digital_product", "data_product", "ai_agent", "automation", "infrastructure", "mobile_app", "physical_product", "hybrid", "other"] as const;
export type WeeklySolutionType = (typeof WEEKLY_SOLUTION_TYPES)[number];
type WeeklyOpportunityDirection = { solution_type: WeeklySolutionType; title: string; short_description: string; why_it_fits: string; monetization_model: string | null; rationale: string; evidence_basis: "observed" | "inferred" };


export type AuthoritativeWeeklyRun = {
  id: string;
  period_start: string;
  period_end: string;
  summary: string | null;
  total_sources_analyzed: number | null;
  external_sources_persisted?: number | null;
  execution_mode?: WeeklyExecutionMode | null;
  external_provider_state?: string | null;
  execution_contract_version?: string | null;
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
  external_sources_persisted: number | null;
  execution_mode: WeeklyExecutionMode | null;
  external_provider_state: string | null;
  execution_contract_version: string | null;
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
    external_sources_persisted: run.external_sources_persisted ?? null,
    execution_mode: run.execution_mode ?? null,
    external_provider_state: run.external_provider_state ?? null,
    execution_contract_version: run.execution_contract_version ?? null,
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
    movement: null,
  }));

  return { weeklyReport, weeklyNiches };
}

export type WeeklyModelOutput = {
  summary?: unknown;
  problems?: unknown;
};

export type WeeklyModelValidationReason =
  | "malformed_output"
  | "missing_summary"
  | "field_limit_exceeded"
  | "problem_limit_exceeded"
  | "unsupported_fresh_market_claim"
  | "problem_without_evidence"
  | "missing_problem_title"
  | "generic_problem_title"
  | "invalid_evidence_reference"
  | "evidence_reference_limit_exceeded"
  | "missing_or_indistinct_root_cause"
  | "duplicate_problem"
  | "missing_commercial_interpretation"
  | "unsupported_direct_buying_signal"
  | "missing_best_opportunity"
  | "invalid_solution_type"
  | "incomplete_opportunity"
  | "inferred_opportunity_insufficient_evidence"
  | "opportunity_alternative_limit_exceeded";

export class WeeklyModelValidationError extends Error {
  readonly reason: WeeklyModelValidationReason;

  constructor(reason: WeeklyModelValidationReason, message: string) {
    super(message);
    this.name = "WeeklyModelValidationError";
    this.reason = reason;
  }
}

const validationFailure = (reason: WeeklyModelValidationReason, message: string): never => {
  throw new WeeklyModelValidationError(reason, message);
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

export function countWeeklyEvidence(sources: WeeklyEvidenceSource[]): Record<Exclude<WeeklyEvidenceSourceType, "historical_context">, number> {
  return sources.filter((source): source is WeeklyEvidenceSource & { type: Exclude<WeeklyEvidenceSourceType, "historical_context"> } => source.type !== "historical_context").reduce<Record<Exclude<WeeklyEvidenceSourceType, "historical_context">, number>>(
    (counts, source) => ({ ...counts, [source.type]: counts[source.type] + 1 }),
    { scan: 0, discover: 0, saved_idea: 0, conversion: 0, external: 0 }
  );
}

export function hasMeaningfulWeeklyEvidence(sources: WeeklyEvidenceSource[]) {
  return sources.some((source) => Boolean(source.id));
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
  executionMode?: WeeklyExecutionMode;
}) {
  const historical = input.priorUserContext.slice(0, WEEKLY_MODEL_ENVELOPE_LIMITS.historicalContext);
  const shared = input.sharedContext.slice(0, WEEKLY_MODEL_ENVELOPE_LIMITS.sharedContext);
  return `You are SaaSScout's Weekly Intelligence engine.

Reporting period:
- period_start inclusive: ${input.period.period_start}
- period_end exclusive: ${input.period.period_end}
- timezone: ${input.period.timezone}
- server-owned execution mode: ${input.executionMode || "mixed"}

User-owned evidence for this period:
${input.userEvidence.map((source) => JSON.stringify({ evidenceId: source.id, evidenceClass: source.type === "external" ? "fresh_external" : source.type === "historical_context" ? "historical_context" : "current_internal", topic: boundedPromptText(source.monitoring_topic || source.title, WEEKLY_MODEL_ENVELOPE_LIMITS.topicCharacters), title: boundedPromptText(source.title, WEEKLY_MODEL_ENVELOPE_LIMITS.titleCharacters), excerpt: boundedPromptText(source.summary, WEEKLY_MODEL_ENVELOPE_LIMITS.excerptCharacters), sourceType: boundedPromptText(source.source_type || source.type, 40), freshness: source.freshness || (source.type === "external" ? "unknown" : undefined), ...(source.published_at ? { publicationDate: source.published_at.slice(0, 10) } : {}) })).join("\n") || "None"}

Prior user context, outside the reporting period, for continuity only:
${historical.map((source) => JSON.stringify({ contextClass: "historical_context_non_citable", title: boundedPromptText(source.title, WEEKLY_MODEL_ENVELOPE_LIMITS.historicalTitleCharacters), theme: boundedPromptText(source.summary, WEEKLY_MODEL_ENVELOPE_LIMITS.historicalSummaryCharacters) })).join("\n") || "None"}

Optional shared aggregate context. This is supplementary only and must never be presented as private user activity:
${shared.map((source) => JSON.stringify({ contextClass: "shared_context_non_citable", title: boundedPromptText(source.title, WEEKLY_MODEL_ENVELOPE_LIMITS.sharedTitleCharacters), theme: boundedPromptText(source.summary, WEEKLY_MODEL_ENVELOPE_LIMITS.sharedSummaryCharacters) })).join("\n") || "None"}

Generation constraints:
- Synthesize across evidence to find non-obvious connections; do not merely restate snippets or broad pain.
- Separate symptom, root cause, workaround, solution failure, and commercial gap. Seek structural, trust, coordination, integration, incentive, visibility, switching-cost, usability, compliance, pricing, or distribution friction.
- Ground observations in eligible evidence. An inferred direction needs a concise connection and 2+ cited IDs; inference is never raw evidence.
- Ask "what is the best monetizable way to solve this problem?" Consider non-software; never default to SaaS.
- Where supported, identify sufferer, payer, impact, workaround spend, pricing, and adoption barrier. Classify commercial_signal as direct_buying_signal, indirect_commercial_signal, or no_monetization_evidence_yet; never invent willingness to pay.
- Do not invent named competitors. If workaround or solution-gap evidence is absent, return null.
- Prefer a new cause, subproblem, or wedge over broad repetition. Non-citable history may frame "a new angle on a known problem", never fresh evidence.
- Shared context is not user activity. Do not fabricate metrics or sources.
- In data_moat_fallback, say live collection was unavailable and frame conclusions as accumulated evidence or validation.
- Never claim current growth, signal, demand, or corroboration without fresh_external support.
- Every specific problem needs 1+ evidence_references containing only IDs shown above.
- Return no scores; SaaSScout scores deterministically. Unsupported optional fields are null, never filler.
- Return one JSON object only, no Markdown/commentary. Return at most ${WEEKLY_MODEL_ENVELOPE_LIMITS.problems} high-value, distinct problems; synthesize rather than restate/repeat.
- Keep summary <= ${WEEKLY_MODEL_ENVELOPE_LIMITS.reportSummaryCharacters} characters, problem_title <= ${WEEKLY_MODEL_ENVELOPE_LIMITS.problemTitleCharacters}, and every other prose field <= ${WEEKLY_MODEL_ENVELOPE_LIMITS.problemFieldCharacters} characters.
- Prior/shared context is non-citable. Do not return unsupported market/trend claims or scores. Top level is { "summary": string, "problems": array }.
- Problem keys/types: problem_title:string; problem_summary:string; underlying_cause:string; affected_users,affected_niches,business_impact,existing_workaround,why_existing_solutions_fail,repeated_pattern,monetization_angle,recommended_deep_scan:string|null; observed_evidence,recommended_validation:string; evidence_references:string[]; novelty:new_problem|new_angle_on_known_problem|stronger_evidence|recurring_problem|null; commercial_signal:{type:direct_buying_signal|indirect_commercial_signal|no_monetization_evidence_yet,rationale:string}; best_opportunity:Opportunity; alternative_opportunities:Opportunity[0..2].
- Opportunity keys/types: solution_type:${WEEKLY_SOLUTION_TYPES.join("|")}; title,short_description,why_it_fits,rationale:string; monetization_model:string|null; evidence_basis:observed|inferred.`;
}

const GENERIC_PROBLEM = /^(?:businesses?|users?|teams?) (?:have|face|experience) (?:workflow )?(?:inefficienc(?:y|ies)|challenges?|problems?|issues?)\.?$/i;
const BUYING_TERMS = /\b(?:pay|paid|price|pricing|budget|purchase|spend|cost|revenue|subscription|invoice|contract)\b/i;

function normalizedProblemWords(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 3));
}

function materiallyDuplicates(left: string, right: string) {
  const a = normalizedProblemWords(left); const b = normalizedProblemWords(right);
  if (!a.size || !b.size) return false;
  const overlap = [...a].filter((word) => b.has(word)).length;
  return overlap / Math.min(a.size, b.size) >= 0.8;
}

export function validateWeeklyModelOutput(output: WeeklyModelOutput, evidence: WeeklyEvidenceSource[], priorUserContext: WeeklyEvidenceSource[] = [], executionMode?: WeeklyExecutionMode) {
  if (!output || typeof output !== "object") validationFailure("malformed_output", "Malformed weekly intelligence output.");
  const summary = safeText(output.summary);
  if (!summary) validationFailure("missing_summary", "Weekly intelligence output is missing a summary.");
  const outputProblems = Array.isArray(output.problems) ? output.problems : validationFailure("malformed_output", "Malformed weekly intelligence output.");
  if (summary.length > WEEKLY_MODEL_ENVELOPE_LIMITS.reportSummaryCharacters) validationFailure("field_limit_exceeded", "Weekly intelligence summary exceeds the output bound.");
  if (outputProblems.length > WEEKLY_MODEL_ENVELOPE_LIMITS.problems) validationFailure("problem_limit_exceeded", "Weekly intelligence output exceeds the problem limit.");
  if ((executionMode === "data_moat_fallback" || executionMode === "insufficient_context") && /(?:this week|new external|fresh (?:market|source|demand|evidence)|market (?:is )?(?:increasing|growing)|multiple fresh sources)/i.test(summary + " " + JSON.stringify(output.problems))) {
    validationFailure("unsupported_fresh_market_claim", "Weekly fallback output made an unsupported fresh-market claim.");
  }

  const hasEvidence = hasMeaningfulWeeklyEvidence(evidence);
  if (!hasEvidence && outputProblems.length > 0) {
    validationFailure("problem_without_evidence", "Weekly intelligence output included personalized problems without user evidence.");
  }

  const seenProblems: string[] = [];
  const problems = outputProblems.map((raw) => {
    if (!raw || typeof raw !== "object") validationFailure("malformed_output", "Malformed weekly intelligence problem.");
    const row = raw as Record<string, unknown>;
    const title = safeText(row.problem_title);
    if (!title) validationFailure("missing_problem_title", "Weekly intelligence problem is missing a title.");
    if (GENERIC_PROBLEM.test(title)) validationFailure("generic_problem_title", "Weekly intelligence problem is too generic.");
    if (title.length > WEEKLY_MODEL_ENVELOPE_LIMITS.problemTitleCharacters) validationFailure("field_limit_exceeded", "Weekly intelligence problem title exceeds the output bound.");
    const references = Array.isArray(row.evidence_references) ? [...new Set(row.evidence_references.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))] : [];
    const eligibleIds = new Set(evidence.map((item) => item.id));
    if (references.length === 0 || references.some((id) => !eligibleIds.has(id))) validationFailure("invalid_evidence_reference", "Weekly intelligence problem has invalid evidence references.");
    const matchedEvidence = evidence.filter((item) => references.includes(item.id));
    const sourceEvidence = matchedEvidence.map((item) => item.summary).filter(Boolean).join(" ");
    const scores = calculateWeeklyProblemScores(references, evidence, priorUserContext);
    if (references.length > WEEKLY_MODEL_ENVELOPE_LIMITS.evidenceReferences) validationFailure("evidence_reference_limit_exceeded", "Weekly intelligence problem has too many evidence references.");
    const optionalText = (key: string) => { const value = safeText(row[key]) || null; if (value && value.length > WEEKLY_MODEL_ENVELOPE_LIMITS.problemFieldCharacters) validationFailure("field_limit_exceeded", `Weekly intelligence ${key} exceeds the output bound.`); return value; };

    const qualityContract = executionMode === "fresh_market" || executionMode === "mixed";
    const summaryText = optionalText("problem_summary");
    const underlyingCause = optionalText("underlying_cause");
    if (qualityContract && (!summaryText || !underlyingCause || materiallyDuplicates(summaryText, underlyingCause))) validationFailure("missing_or_indistinct_root_cause", "Weekly intelligence problem must distinguish the symptom from a specific root cause.");
    const duplicateIdentity = `${title} ${summaryText || ""}`;
    if (seenProblems.some((candidate) => materiallyDuplicates(candidate, duplicateIdentity))) validationFailure("duplicate_problem", "Weekly intelligence output contains materially duplicate problems.");
    seenProblems.push(duplicateIdentity);

    const commercial = row.commercial_signal && typeof row.commercial_signal === "object" ? row.commercial_signal as Record<string, unknown> : null;
    const commercialType = safeText(commercial?.type);
    const commercialRationale = safeText(commercial?.rationale);
    if (qualityContract && (!commercial || !["direct_buying_signal", "indirect_commercial_signal", "no_monetization_evidence_yet"].includes(commercialType) || !commercialRationale)) validationFailure("missing_commercial_interpretation", "Weekly intelligence problem is missing a bounded commercial interpretation.");
    if (commercialType === "direct_buying_signal" && !matchedEvidence.some((item) => BUYING_TERMS.test(`${item.title} ${item.summary}`))) validationFailure("unsupported_direct_buying_signal", "Weekly intelligence problem contains an unsupported willingness-to-pay statement.");

    const optionalOpportunityText = (value: unknown) => { const text = safeText(value) || null; if (text && text.length > WEEKLY_MODEL_ENVELOPE_LIMITS.problemFieldCharacters) validationFailure("field_limit_exceeded", "Weekly intelligence opportunity exceeds the output bound."); return text; };
    const parseOpportunity = (value: unknown, required: boolean): WeeklyOpportunityDirection | null => {
      if (!value || typeof value !== "object" || Array.isArray(value)) { if (required) validationFailure("missing_best_opportunity", "Weekly intelligence problem is missing its best opportunity."); return null; }
      const opportunity = value as Record<string, unknown>;
      const solutionType = safeText(opportunity.solution_type) as WeeklySolutionType;
      if (!WEEKLY_SOLUTION_TYPES.includes(solutionType)) validationFailure("invalid_solution_type", "Weekly intelligence opportunity has an invalid solution type.");
      const direction = { solution_type: solutionType, title: safeText(opportunity.title), short_description: safeText(opportunity.short_description), why_it_fits: safeText(opportunity.why_it_fits), monetization_model: optionalOpportunityText(opportunity.monetization_model), rationale: safeText(opportunity.rationale), evidence_basis: safeText(opportunity.evidence_basis) as "observed" | "inferred" };
      if (!direction.title || !direction.short_description || !direction.why_it_fits || !direction.rationale || !["observed", "inferred"].includes(direction.evidence_basis)) validationFailure("incomplete_opportunity", "Weekly intelligence opportunity is incomplete.");
      if (direction.evidence_basis === "inferred" && references.length < 2) validationFailure("inferred_opportunity_insufficient_evidence", "Weekly intelligence inferred opportunity requires multiple evidence references.");
      return direction;
    };
    const bestOpportunity = parseOpportunity(row.best_opportunity, qualityContract);
    const alternativesValue = row.alternative_opportunities == null ? [] : row.alternative_opportunities;
    const alternativesRaw = Array.isArray(alternativesValue) ? alternativesValue : validationFailure("opportunity_alternative_limit_exceeded", "Weekly intelligence opportunity alternatives exceed the limit.");
    if (alternativesRaw.length > 2) validationFailure("opportunity_alternative_limit_exceeded", "Weekly intelligence opportunity alternatives exceed the limit.");
    const alternatives = alternativesRaw.map((item) => parseOpportunity(item, true)!);
    const opportunityLine = (item: WeeklyOpportunityDirection) => boundedPromptText(`${item.solution_type}: ${item.title} — ${item.short_description} (${item.evidence_basis}; fit: ${item.why_it_fits}; rationale: ${item.rationale}${item.monetization_model ? `; monetization: ${item.monetization_model}` : ""})`, WEEKLY_MODEL_ENVELOPE_LIMITS.problemFieldCharacters);
    const workaround = optionalText("existing_workaround");
    const solutionGap = optionalText("why_existing_solutions_fail");
    const novelty = optionalText("novelty");

    return {
      problem_title: title,
      problem_summary: summaryText, affected_users: optionalText("affected_users"), affected_niches: optionalText("affected_niches"),
      observed_evidence: optionalText("observed_evidence"), repeated_patterns: [underlyingCause && `Root cause: ${underlyingCause}`, optionalText("repeated_pattern"), novelty && `Novelty: ${novelty}`].filter(Boolean).join(" | ") || null, business_impact: optionalText("business_impact"),
      why_existing_tools_fail: [workaround && `Current workaround: ${workaround}`, solutionGap && `Solution gap: ${solutionGap}`].filter(Boolean).join(" | ") || null,
      suggested_solutions: alternatives.length ? alternatives.map(opportunityLine).join(" | ") : null, suggested_mvp: bestOpportunity ? opportunityLine(bestOpportunity) : null,
      monetization_angle: boundedPromptText([commercialType && `Commercial signal: ${commercialType} — ${commercialRationale}`, optionalText("monetization_angle")].filter(Boolean).join(" | "), WEEKLY_MODEL_ENVELOPE_LIMITS.problemFieldCharacters) || null, recommended_validation: optionalText("recommended_validation"), recommended_deep_scan: optionalText("recommended_deep_scan"),
      evidence_references: references, ...scores, source_evidence: sourceEvidence,
      buying_signal_score: 0, frequency_score: clamp(matchedEvidence.length * 2, 0) || 0, opportunity_score: scores.intelligence_score || 0,
      problem_cluster: normalizeWeeklyProblemTitleKey(title), source_quality_score: scores.confidence_score,
    };
  });

  return { summary, problems };
}
