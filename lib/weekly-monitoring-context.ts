import "server-only";

export const WEEKLY_MONITORING_SELECTION_VERSION = "weekly-monitoring-context@1";
export const WEEKLY_MONITORING_LOOKBACK_DAYS = 180;
export const WEEKLY_MONITORING_MAX_TOPICS = 5;

export type WeeklyMonitoringTopicSourceKind = "completed_scan" | "accepted_discover_problem" | "saved_idea" | "prior_weekly_problem";

export type WeeklyMonitoringRecord = Readonly<{
  id: string;
  ownerId: string;
  kind: WeeklyMonitoringTopicSourceKind | "user_action" | "shared_problem_intelligence";
  occurredAt: string;
  title?: string | null;
  market?: string | null;
  niche?: string | null;
  problemSummary?: string | null;
  status?: string | null;
  conceptId?: string | null;
  actionType?: string | null;
  evidenceReferenceCount?: number;
  sourceCount?: number;
}>;

export type WeeklyMonitoringTopic = Readonly<{
  id: string;
  fingerprint: string;
  title: string;
  market: string | null;
  niche: string | null;
  problemSummary: string | null;
  sourceKinds: WeeklyMonitoringTopicSourceKind[];
  historicalSourceIds: string[];
  relevanceSignals: Readonly<{
    scanCount: number;
    discoverProblemCount: number;
    savedIdeaCount: number;
    priorWeeklyCount: number;
    userActionCount: number;
  }>;
  latestObservedAt: string;
  monitoringPriority: number;
}>;

export type WeeklyMonitoringSelection = Readonly<{
  version: typeof WEEKLY_MONITORING_SELECTION_VERSION;
  lookbackStart: string;
  topics: WeeklyMonitoringTopic[];
  diagnostics: Readonly<{
    monitoringTopicCount: number;
    monitoringSourceKindCounts: Record<WeeklyMonitoringTopicSourceKind, number>;
    historicalContextAvailable: boolean;
    monitoringSelectionVersion: typeof WEEKLY_MONITORING_SELECTION_VERSION;
  }>;
}>;

type AggregatedMonitoringInput = Readonly<{
  items: ReadonlyArray<{
    id: string;
    kind: string;
    ownerId?: string | null;
    title: string;
    summary: string;
    occurredAt: string;
    parentId?: string;
    metadata?: Readonly<Record<string, string | number | boolean | null>>;
  }>;
}>;

/** Adapts already owner-filtered Data Moat rows; saves/actions only enrich a linked concept. */
export function buildWeeklyMonitoringRecordsFromDataMoat(aggregation: AggregatedMonitoringInput, authenticatedUserId: string) {
  const opportunities = new Map(aggregation.items.filter((item) => item.kind === "opportunity").map((item) => [item.id, item]));
  const problems = new Map(aggregation.items.filter((item) => item.kind === "discover_problem").map((item) => [item.id, item]));
  return aggregation.items.flatMap<WeeklyMonitoringRecord>((item) => {
    if (item.ownerId !== authenticatedUserId) return [];
    if (item.kind === "scan") return [{ id: item.id, ownerId: authenticatedUserId, kind: "completed_scan", occurredAt: item.occurredAt, title: item.title, market: item.title, problemSummary: item.summary, status: String(item.metadata?.status || "") }];
    if (item.kind === "discover_problem") return [{ id: item.id, ownerId: authenticatedUserId, kind: "accepted_discover_problem", occurredAt: item.occurredAt, title: item.title, problemSummary: item.summary, niche: typeof item.metadata?.problemCluster === "string" ? item.metadata.problemCluster : null, status: String(item.metadata?.status || ""), conceptId: item.id }];
    if (item.kind === "saved_idea") {
      const opportunityId = typeof item.metadata?.opportunityId === "string" ? item.metadata.opportunityId : "";
      const opportunity = opportunities.get(opportunityId);
      if (!opportunity) return [];
      return [{ id: item.id, ownerId: authenticatedUserId, kind: "saved_idea", occurredAt: item.occurredAt, title: opportunity.title, problemSummary: opportunity.summary, conceptId: opportunity.id }];
    }
    if (item.kind === "user_activity") {
      const problemId = typeof item.metadata?.problemId === "string" ? item.metadata.problemId : "";
      const problem = problems.get(problemId);
      return [{ id: item.id, ownerId: authenticatedUserId, kind: "user_action", occurredAt: item.occurredAt, actionType: typeof item.metadata?.actionType === "string" ? item.metadata.actionType : null, conceptId: problem?.id || problemId || null }];
    }
    return [];
  });
}

const PLACEHOLDERS = new Set(["untitled weekly pattern", "user explored market", "validation follow-up"]);
const ACTIONS = new Set(["prepare_deep_scan", "save", "convert"]);

function normalized(value: string | null | undefined) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function display(value: string | null | undefined) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function stableHash(value: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

function isCandidate(record: WeeklyMonitoringRecord) {
  const title = normalized(record.title);
  if (!title || title.length < 4 || PLACEHOLDERS.has(title)) return false;
  if (record.kind === "completed_scan") return record.status === "completed";
  if (record.kind === "accepted_discover_problem") return record.status === "accepted";
  if (record.kind === "saved_idea") return Boolean(record.conceptId && display(record.problemSummary));
  if (record.kind === "prior_weekly_problem") return (record.evidenceReferenceCount || 0) > 0 && (record.sourceCount || 0) > 0;
  return false;
}

function canonicalKey(record: WeeklyMonitoringRecord) {
  if (record.conceptId) return `concept:${normalized(record.conceptId)}`;
  return [normalized(record.market), normalized(record.niche), normalized(record.title)].join("|");
}

export function selectWeeklyMonitoringTopics(input: {
  authenticatedUserId: string;
  periodEnd: string;
  records: readonly WeeklyMonitoringRecord[];
  maxTopics?: number;
}): WeeklyMonitoringSelection {
  if (!input.authenticatedUserId) throw new Error("Weekly monitoring selection requires an authenticated user.");
  const periodEndMs = new Date(input.periodEnd).getTime();
  if (!Number.isFinite(periodEndMs)) throw new Error("Weekly monitoring selection requires a valid period end.");
  const lookbackStartMs = periodEndMs - WEEKLY_MONITORING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const eligible = input.records.filter((record) => {
    const occurred = new Date(record.occurredAt).getTime();
    return record.ownerId === input.authenticatedUserId && Number.isFinite(occurred) && occurred >= lookbackStartMs && occurred < periodEndMs;
  });
  const candidates = eligible.filter(isCandidate);
  const actions = eligible.filter((record) => record.kind === "user_action" && ACTIONS.has(record.actionType || ""));
  const groups = new Map<string, WeeklyMonitoringRecord[]>();
  for (const record of candidates) {
    const key = canonicalKey(record);
    groups.set(key, [...(groups.get(key) || []), record]);
  }

  const topics = Array.from(groups.entries()).map(([key, records]) => {
    const ordered = records.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
    const latest = ordered[0];
    const ids = records.map((record) => record.id).sort();
    const kinds = [...new Set(records.map((record) => record.kind as WeeklyMonitoringTopicSourceKind))].sort();
    const linkedIds = new Set(records.flatMap((record) => [record.id, record.conceptId].filter(Boolean)));
    const userActionCount = actions.filter((action) => action.conceptId && linkedIds.has(action.conceptId)).length;
    const signals = {
      scanCount: records.filter((record) => record.kind === "completed_scan").length,
      discoverProblemCount: records.filter((record) => record.kind === "accepted_discover_problem").length,
      savedIdeaCount: records.filter((record) => record.kind === "saved_idea").length,
      priorWeeklyCount: records.filter((record) => record.kind === "prior_weekly_problem").length,
      userActionCount,
    };
    const ageDays = Math.floor((periodEndMs - new Date(latest.occurredAt).getTime()) / (24 * 60 * 60 * 1000));
    const recency = Math.max(0, 18 - Math.floor(ageDays / 10));
    const workflowDiversity = kinds.length * 8;
    const monitoringPriority = signals.discoverProblemCount * 30 + signals.savedIdeaCount * 24 + signals.scanCount * 18 + signals.priorWeeklyCount * 12 + signals.userActionCount * 5 + workflowDiversity + recency;
    const fingerprint = `wmt_${stableHash(`${WEEKLY_MONITORING_SELECTION_VERSION}|${key}`)}`;
    return Object.freeze({
      id: fingerprint,
      fingerprint,
      title: display(latest.title),
      market: display(latest.market) || null,
      niche: display(latest.niche) || null,
      problemSummary: display(latest.problemSummary) || null,
      sourceKinds: kinds,
      historicalSourceIds: ids,
      relevanceSignals: Object.freeze(signals),
      latestObservedAt: latest.occurredAt,
      monitoringPriority,
    });
  }).sort((a, b) => b.monitoringPriority - a.monitoringPriority || b.latestObservedAt.localeCompare(a.latestObservedAt) || a.fingerprint.localeCompare(b.fingerprint));

  const selected = topics.slice(0, Math.max(0, Math.min(input.maxTopics ?? WEEKLY_MONITORING_MAX_TOPICS, WEEKLY_MONITORING_MAX_TOPICS)));
  const counts = { completed_scan: 0, accepted_discover_problem: 0, saved_idea: 0, prior_weekly_problem: 0 };
  for (const topic of selected) for (const kind of topic.sourceKinds) counts[kind] += 1;
  return Object.freeze({
    version: WEEKLY_MONITORING_SELECTION_VERSION,
    lookbackStart: new Date(lookbackStartMs).toISOString(),
    topics: selected,
    diagnostics: Object.freeze({ monitoringTopicCount: selected.length, monitoringSourceKindCounts: counts, historicalContextAvailable: selected.length > 0, monitoringSelectionVersion: WEEKLY_MONITORING_SELECTION_VERSION }),
  });
}
