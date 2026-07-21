import "server-only";

export type DataMoatSource =
  | "completed_scans"
  | "generated_opportunities"
  | "discover_history"
  | "accepted_discover_problems"
  | "saved_ideas"
  | "weekly_reports"
  | "snapshots"
  | "historical_user_evidence"
  | "shared_problem_intelligence";

export type DataMoatItemKind =
  | "scan"
  | "opportunity"
  | "discover_run"
  | "discover_problem"
  | "saved_idea"
  | "weekly_report"
  | "snapshot"
  | "user_activity"
  | "shared_problem_intelligence";

export type NormalizedDataMoatItem = Readonly<{
  kind: DataMoatItemKind;
  source: DataMoatSource;
  id: string;
  ownerId: string | null;
  title: string;
  summary: string;
  occurredAt: string;
  parentId?: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type DataMoatAggregationDiagnostics = Readonly<{
  sourcesQueried: DataMoatSource[];
  countsBySource: Record<DataMoatSource, number>;
  skippedSources: Array<{ source: DataMoatSource; reason: string }>;
  normalizationFailures: Array<{ source: DataMoatSource; id: string; reason: string }>;
  durationMs: number;
}>;

export type DataMoatAggregation = Readonly<{
  userId: string;
  items: NormalizedDataMoatItem[];
  bySource: Record<DataMoatSource, NormalizedDataMoatItem[]>;
  sharedContext: NormalizedDataMoatItem[];
  diagnostics: DataMoatAggregationDiagnostics;
}>;

type QueryResult = PromiseLike<{ data?: Record<string, unknown>[] | null; error?: unknown }>;
type QueryBuilder = QueryResult & {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  limit(count: number): QueryBuilder;
};
export type DataMoatAggregationClient = { from(table: string): QueryBuilder };

export type DataMoatAggregationOptions = Readonly<{
  includeSharedContext?: boolean;
  limitPerSource?: number;
  now?: () => number;
  logger?: Pick<Console, "info" | "warn">;
}>;

const SOURCES: DataMoatSource[] = [
  "completed_scans",
  "generated_opportunities",
  "discover_history",
  "accepted_discover_problems",
  "saved_ideas",
  "weekly_reports",
  "snapshots",
  "historical_user_evidence",
  "shared_problem_intelligence",
];

function emptyCounts(): Record<DataMoatSource, number> {
  return Object.fromEntries(SOURCES.map((source) => [source, 0])) as Record<DataMoatSource, number>;
}

function text(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function timestamp(value: unknown) {
  return typeof value === "string" && value ? value : "1970-01-01T00:00:00.000Z";
}

function scalar(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

function normalizeRow(source: DataMoatSource, kind: DataMoatItemKind, row: Record<string, unknown>, userId: string): NormalizedDataMoatItem | null {
  const id = text(row.id ?? row.snapshot_id ?? row.opportunity_id, "");
  if (!id) return null;
  const ownerId = typeof row.user_id === "string" ? row.user_id : typeof row.owner_id === "string" ? row.owner_id : null;
  if (source !== "shared_problem_intelligence" && ownerId !== userId) return null;

  const occurredAt = timestamp(row.created_at ?? row.period_end ?? row.last_seen_at);
  const scanTitle = [row.market, row.audience, row.region].filter((value) => typeof value === "string" && value.trim()).join(" / ");
  const title = text(row.problem_title ?? row.title ?? (scanTitle || row.summary), `${kind} ${id}`);
  const summary = text(row.problem_summary ?? row.summary ?? row.evidence ?? row.status, title).slice(0, 1000);
  const parentId = typeof row.discovery_id === "string" ? row.discovery_id : typeof row.scan_id === "string" ? row.scan_id : undefined;

  return Object.freeze({
    kind,
    source,
    id,
    ownerId,
    title,
    summary,
    occurredAt,
    ...(parentId ? { parentId } : {}),
    metadata: Object.freeze({
      status: scalar(row.status ?? row.lifecycle_state),
      score: scalar(row.intelligence_score ?? row.score ?? row.opportunity_score),
      sourceCount: scalar(row.total_sources_analyzed ?? row.source_count),
      opportunityId: scalar(row.opportunity_id),
      actionType: scalar(row.action_type),
      problemId: scalar(row.problem_id),
      periodStart: scalar(row.period_start),
      periodEnd: scalar(row.period_end),
    }),
  });
}

function deterministicSort(a: NormalizedDataMoatItem, b: NormalizedDataMoatItem) {
  return b.occurredAt.localeCompare(a.occurredAt) || a.source.localeCompare(b.source) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
}

async function safeRead(
  source: DataMoatSource,
  read: () => QueryResult,
  diagnostics: { skippedSources: Array<{ source: DataMoatSource; reason: string }> }
) {
  try {
    const { data, error } = await read();
    if (error) {
      diagnostics.skippedSources.push({ source, reason: "query_error" });
      return [];
    }
    return data || [];
  } catch {
    diagnostics.skippedSources.push({ source, reason: "source_unavailable" });
    return [];
  }
}

function addNormalized(
  rows: Record<string, unknown>[],
  source: DataMoatSource,
  kind: DataMoatItemKind,
  userId: string,
  diagnostics: { normalizationFailures: Array<{ source: DataMoatSource; id: string; reason: string }>; countsBySource: Record<DataMoatSource, number> },
) {
  const items: NormalizedDataMoatItem[] = [];
  for (const row of rows) {
    const item = normalizeRow(source, kind, row, userId);
    if (item) items.push(item);
    else diagnostics.normalizationFailures.push({ source, id: text(row.id, "unknown"), reason: "missing_identity_or_owner_mismatch" });
  }
  items.sort(deterministicSort);
  diagnostics.countsBySource[source] = items.length;
  return items;
}

export async function aggregateUserDataMoat(
  client: DataMoatAggregationClient,
  authenticatedUserId: string,
  options: DataMoatAggregationOptions = {},
): Promise<DataMoatAggregation> {
  if (!authenticatedUserId) throw new Error("Data Moat aggregation requires an authenticated user.");
  const limit = Math.max(1, Math.min(options.limitPerSource ?? 50, 200));
  const startedAt = options.now?.() ?? Date.now();
  const diagnostics = { sourcesQueried: [] as DataMoatSource[], countsBySource: emptyCounts(), skippedSources: [] as Array<{ source: DataMoatSource; reason: string }>, normalizationFailures: [] as Array<{ source: DataMoatSource; id: string; reason: string }> };
  const read = (source: DataMoatSource, fn: () => QueryResult) => { diagnostics.sourcesQueried.push(source); return safeRead(source, fn, diagnostics); };

  const [scans, opportunities, discoveries, acceptedProblems, savedIdeas, weeklyReports, snapshots, activity, shared] = await Promise.all([
    read("completed_scans", () => client.from("scan").select("id,user_id,market,audience,region,status,evidence,created_at").eq("user_id", authenticatedUserId).eq("status", "completed").order("created_at", { ascending: false }).limit(limit)),
    read("generated_opportunities", () => client.from("opportunities").select("id,user_id,scan_id,title,summary,score,created_at").eq("user_id", authenticatedUserId).order("created_at", { ascending: false }).limit(limit)),
    read("discover_history", () => client.from("opportunity_discoveries").select("id,user_id,summary,status,total_sources_analyzed,created_at").eq("user_id", authenticatedUserId).order("created_at", { ascending: false }).limit(limit)),
    read("accepted_discover_problems", () => client.from("discovered_problems").select("id,user_id,discovery_id,problem_title,problem_summary,problem_cluster,status,created_at").eq("user_id", authenticatedUserId).eq("status", "accepted").order("created_at", { ascending: false }).limit(limit)),
    read("saved_ideas", () => client.from("saved_ideas").select("id,user_id,opportunity_id,created_at").eq("user_id", authenticatedUserId).order("created_at", { ascending: false }).limit(limit)),
    read("weekly_reports", () => client.from("weekly_intelligence_runs").select("id,user_id,summary,status,period_start,period_end,created_at").eq("user_id", authenticatedUserId).eq("status", "completed").order("period_end", { ascending: false }).limit(limit)),
    read("snapshots", () => client.from("snapshot_identities").select("id,snapshot_id,owner_id,discovery_id,lifecycle_state,created_at").eq("owner_id", authenticatedUserId).order("created_at", { ascending: false }).limit(limit)),
    read("historical_user_evidence", () => client.from("discovery_actions").select("id,user_id,action_type,discovery_id,problem_id,created_at").eq("user_id", authenticatedUserId).order("created_at", { ascending: false }).limit(limit)),
    options.includeSharedContext === false ? Promise.resolve([]) : read("shared_problem_intelligence", () => client.from("problem_intelligence").select("id,problem_title,problem_summary,intelligence_score,last_seen_at").order("intelligence_score", { ascending: false }).limit(Math.min(limit, 10))),
  ]);

  const bySource = {
    completed_scans: addNormalized(scans, "completed_scans", "scan", authenticatedUserId, diagnostics),
    generated_opportunities: addNormalized(opportunities, "generated_opportunities", "opportunity", authenticatedUserId, diagnostics),
    discover_history: addNormalized(discoveries, "discover_history", "discover_run", authenticatedUserId, diagnostics),
    accepted_discover_problems: addNormalized(acceptedProblems, "accepted_discover_problems", "discover_problem", authenticatedUserId, diagnostics),
    saved_ideas: addNormalized(savedIdeas, "saved_ideas", "saved_idea", authenticatedUserId, diagnostics),
    weekly_reports: addNormalized(weeklyReports, "weekly_reports", "weekly_report", authenticatedUserId, diagnostics),
    snapshots: addNormalized(snapshots, "snapshots", "snapshot", authenticatedUserId, diagnostics),
    historical_user_evidence: addNormalized(activity, "historical_user_evidence", "user_activity", authenticatedUserId, diagnostics),
    shared_problem_intelligence: addNormalized(shared, "shared_problem_intelligence", "shared_problem_intelligence", authenticatedUserId, diagnostics),
  } satisfies Record<DataMoatSource, NormalizedDataMoatItem[]>;

  const sharedContext = bySource.shared_problem_intelligence;
  const items = SOURCES.filter((source) => source !== "shared_problem_intelligence").flatMap((source) => bySource[source]).sort(deterministicSort);
  const durationMs = Math.max(0, (options.now?.() ?? Date.now()) - startedAt);
  const outputDiagnostics = Object.freeze({ ...diagnostics, durationMs });
  options.logger?.info("Data Moat aggregation diagnostic", outputDiagnostics);
  if (diagnostics.skippedSources.length || diagnostics.normalizationFailures.length) options.logger?.warn("Data Moat aggregation completed with skipped data", outputDiagnostics);
  return Object.freeze({ userId: authenticatedUserId, items, bySource, sharedContext, diagnostics: outputDiagnostics });
}
