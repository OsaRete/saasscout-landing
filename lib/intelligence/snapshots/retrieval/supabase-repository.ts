import "server-only";

import { createSupabaseAdminClient } from "../../../supabase/server-admin.ts";
import type { SnapshotRetrievalCandidate, SnapshotRetrievalQuery } from "./types.ts";
import type { SnapshotRetrievalRepository } from "./repository.ts";
import { SNAPSHOT_RETRIEVAL_MAX_CANDIDATES_DEFAULT, SNAPSHOT_RETRIEVAL_MAX_CANDIDATES_HARD_CAP, normalizeSnapshotRetrievalQuery } from "./ranker.ts";

const DEFAULT_TIME_WINDOW_DAYS = 180;
const MAX_TIME_WINDOW_DAYS = 365;
const CLAIM_SNIPPET_LIMIT = 5;
const CLAIM_SNIPPET_MAX_LENGTH = 240;
const ELIGIBLE_LIFECYCLES = ["validated", "persisted"] as const;

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>;
type QueryBuilder<T> = QueryResult<T> & {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: readonly unknown[]): QueryBuilder<T>;
  gte(column: string, value: string): QueryBuilder<T>;
  lte(column: string, value: string): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
};

export type SupabaseSnapshotRetrievalClient = Readonly<{
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
}>;

export type SafeRetrievalLogger = Readonly<{
  warn?: (event: string, metadata: Record<string, unknown>) => void;
  error?: (event: string, metadata: Record<string, unknown>) => void;
}>;

class SnapshotRetrievalRepositoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SnapshotRetrievalRepositoryError";
    this.code = code;
  }
}

type DiscoveryRow = { id?: unknown; user_id?: unknown };
type IdentityRow = { id?: unknown; snapshot_id?: unknown; discovery_id?: unknown; contract_version?: unknown; lifecycle_state?: unknown; created_at?: unknown };
type SectionRow = { snapshot_identity_id?: unknown; section_type?: unknown; payload?: unknown };
type EvidenceRow = { snapshot_identity_id?: unknown; evidence_id?: unknown; relationship?: unknown; claim?: unknown; confidence?: unknown };
type SupportRow = { snapshot_identity_id?: unknown; evidence_id?: unknown; target_section?: unknown };
type ProvenanceRow = { snapshot_identity_id?: unknown; source_type?: unknown };

type Sections = { problem?: ProblemSection; opportunity?: OpportunitySection; confidence?: ConfidenceSection };
type ProblemSection = { title: string; summary: string; affectedMarket?: string | null; relatedNiches: readonly string[] };
type OpportunitySection = { summary: string };
type ConfidenceSection = { overall?: number | null };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? Object.freeze([...new Set(value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()))]) : Object.freeze([]);
}
function clamp01(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}
function scoreValue(value: unknown): number | null {
  if (isObject(value)) return scoreValue(value.value ?? value.overall ?? value.score);
  return clamp01(value);
}
function normalizeWindow(query: SnapshotRetrievalQuery): { start: string; end: string } {
  const referenceMs = Date.parse(query.referenceTimestamp);
  if (!Number.isFinite(referenceMs)) throw new SnapshotRetrievalRepositoryError("SNAPSHOT_RETRIEVAL_INVALID_QUERY_BOUNDS", "Snapshot retrieval reference timestamp is invalid.");
  const days = Math.min(MAX_TIME_WINDOW_DAYS, Math.max(0, Math.floor(query.timeWindowDays ?? DEFAULT_TIME_WINDOW_DAYS)));
  return { start: new Date(referenceMs - days * 86_400_000).toISOString(), end: new Date(referenceMs).toISOString() };
}
function safeError(error: { message?: string; code?: string } | null, code: string): never {
  throw new SnapshotRetrievalRepositoryError(code, `Snapshot retrieval Supabase read failed${error?.code ? ` (${error.code})` : ""}.`);
}
async function readRows<T>(query: QueryResult<T>, code = "SNAPSHOT_RETRIEVAL_SUPABASE_READ_ERROR"): Promise<T[]> {
  const { data, error } = await query;
  if (error != null) safeError(error, code);
  return data ?? [];
}
function mapProblem(payload: unknown): ProblemSection | undefined {
  if (!isObject(payload)) return undefined;
  const title = stringValue(payload.title);
  const summary = stringValue(payload.summary);
  if (!title || !summary) return undefined;
  return Object.freeze({ title, summary, affectedMarket: stringValue(payload.affectedMarket) ?? null, relatedNiches: stringList(payload.relatedNiches) });
}
function mapOpportunity(payload: unknown): OpportunitySection | undefined {
  if (!isObject(payload)) return undefined;
  const summary = stringValue(payload.summary);
  return summary ? Object.freeze({ summary }) : undefined;
}
function mapConfidence(payload: unknown): ConfidenceSection | undefined {
  if (!isObject(payload)) return undefined;
  return Object.freeze({ overall: scoreValue(payload.overall) });
}
function snippet(value: string): string {
  return value.length > CLAIM_SNIPPET_MAX_LENGTH ? `${value.slice(0, CLAIM_SNIPPET_MAX_LENGTH - 1)}…` : value;
}

export function createSupabaseSnapshotRetrievalRepository(dependencies: { client?: SupabaseSnapshotRetrievalClient; logger?: SafeRetrievalLogger } = {}): SnapshotRetrievalRepository {
  const client = dependencies.client ?? (createSupabaseAdminClient() as unknown as SupabaseSnapshotRetrievalClient);
  const logger = dependencies.logger;

  return {
    async findCandidates(query: SnapshotRetrievalQuery): Promise<readonly SnapshotRetrievalCandidate[]> {
      if (query.organizationId != null) throw new SnapshotRetrievalRepositoryError("SNAPSHOT_RETRIEVAL_ORGANIZATION_SCOPE_UNSUPPORTED", "SNAPSHOT_RETRIEVAL_ORGANIZATION_SCOPE_UNSUPPORTED: Organization-scoped Snapshot retrieval is not supported by this repository.");
      if (query.userId == null || query.userId.trim() === "") throw new SnapshotRetrievalRepositoryError("SNAPSHOT_RETRIEVAL_USER_SCOPE_REQUIRED", "SNAPSHOT_RETRIEVAL_USER_SCOPE_REQUIRED: User-scoped Snapshot retrieval requires a userId.");

      const normalized = normalizeSnapshotRetrievalQuery(query);
      const cap = Math.min(SNAPSHOT_RETRIEVAL_MAX_CANDIDATES_HARD_CAP, normalized.maxCandidates || SNAPSHOT_RETRIEVAL_MAX_CANDIDATES_DEFAULT);
      const { start, end } = normalizeWindow(query);

      let discoveriesQuery = client.from<DiscoveryRow>("opportunity_discoveries").select("id,user_id").eq("user_id", query.userId).order("id", { ascending: true }).limit(cap);
      if (query.discoveryId != null) discoveriesQuery = discoveriesQuery.eq("id", query.discoveryId);
      const discoveryIds = readSafeStrings(await readRows(discoveriesQuery), "id")
        .filter((discoveryId) => discoveryId !== query.excludeDiscoveryId)
        .slice(0, cap);
      if (discoveryIds.length === 0) return Object.freeze([]);

      const identities = (await readRows(client.from<IdentityRow>("snapshot_identities")
        .select("id,snapshot_id,discovery_id,contract_version,lifecycle_state,created_at")
        .in("discovery_id", discoveryIds)
        .in("lifecycle_state", ELIGIBLE_LIFECYCLES)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .order("snapshot_id", { ascending: true })
        .limit(cap)))
        .map(mapIdentity)
        .filter((row): row is NonNullable<ReturnType<typeof mapIdentity>> => row != null)
        .filter((row) => discoveryIds.includes(row.discoveryId))
        .slice(0, cap);
      if (identities.length === 0) return Object.freeze([]);

      const identityIds = identities.map((identity) => identity.id);
      const [sections, evidence, supports, provenance] = await Promise.all([
        readRows(client.from<SectionRow>("snapshot_sections").select("snapshot_identity_id,section_type,payload").in("snapshot_identity_id", identityIds).in("section_type", ["problem_intelligence", "opportunity_intelligence", "confidence"])),
        readRows(client.from<EvidenceRow>("snapshot_evidence").select("snapshot_identity_id,evidence_id,relationship,claim,confidence").in("snapshot_identity_id", identityIds).order("evidence_id", { ascending: true }).limit(cap * 20)),
        readRows(client.from<SupportRow>("snapshot_evidence_supports").select("snapshot_identity_id,evidence_id,target_section").in("snapshot_identity_id", identityIds).limit(cap * 40)),
        readRows(client.from<ProvenanceRow>("snapshot_provenance_sources").select("snapshot_identity_id,source_type").in("snapshot_identity_id", identityIds).limit(cap * 20)),
      ]);

      const sectionMap = buildSectionMap(sections, logger);
      const supportCounts = buildSupportCounts(supports);
      const evidenceMap = buildEvidenceMap(evidence, supportCounts);
      const provenanceMap = buildProvenanceMap(provenance);
      const candidates: SnapshotRetrievalCandidate[] = [];
      for (const identity of identities) {
        const mapped = sectionMap.get(identity.id);
        if (!mapped?.problem || !mapped.opportunity || !mapped.confidence) {
          logger?.warn?.("snapshot_retrieval_malformed_row_skipped", { reason: "missing_required_section", snapshotId: identity.snapshotId });
          continue;
        }
        candidates.push(Object.freeze({
          snapshotId: identity.snapshotId,
          discoveryId: identity.discoveryId,
          contractVersion: identity.contractVersion,
          createdAt: identity.createdAt,
          lifecycleState: identity.lifecycleState,
          ownership: Object.freeze({ discoveryId: identity.discoveryId, scope: query.discoveryId != null ? "discovery" : "user" }),
          problem: mapped.problem,
          opportunity: mapped.opportunity,
          confidence: mapped.confidence,
          evidenceSignals: Object.freeze(evidenceMap.get(identity.id) ?? []),
          sourceTypes: Object.freeze(provenanceMap.get(identity.id) ?? []),
        }));
      }
      return Object.freeze(candidates);
    },
  };
}

function readSafeStrings<T extends Record<string, unknown>>(rows: T[], key: keyof T): string[] {
  return rows.map((row) => stringValue(row[key])).filter((value): value is string => value != null);
}
function mapIdentity(row: IdentityRow) {
  const id = stringValue(row.id), snapshotId = stringValue(row.snapshot_id), discoveryId = stringValue(row.discovery_id), contractVersion = stringValue(row.contract_version), lifecycle = stringValue(row.lifecycle_state), createdAt = stringValue(row.created_at);
  if (!id || !snapshotId || !discoveryId || !contractVersion || !createdAt || (lifecycle !== "validated" && lifecycle !== "persisted")) return undefined;
  return Object.freeze({ id, snapshotId, discoveryId, contractVersion, lifecycleState: lifecycle, createdAt });
}
function buildSectionMap(rows: SectionRow[], logger?: SafeRetrievalLogger): Map<string, Sections> {
  const map = new Map<string, Sections>();
  for (const row of rows) {
    const id = stringValue(row.snapshot_identity_id);
    const type = stringValue(row.section_type);
    if (!id || !type) continue;
    const current = map.get(id) ?? {};
    const next = type === "problem_intelligence" ? { ...current, problem: mapProblem(row.payload) } : type === "opportunity_intelligence" ? { ...current, opportunity: mapOpportunity(row.payload) } : type === "confidence" ? { ...current, confidence: mapConfidence(row.payload) } : current;
    if (JSON.stringify(next) === JSON.stringify(current)) logger?.warn?.("snapshot_retrieval_malformed_row_skipped", { reason: "invalid_section_payload", sectionType: type });
    map.set(id, next);
  }
  return map;
}
function buildSupportCounts(rows: SupportRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const id = stringValue(row.snapshot_identity_id), evidenceId = stringValue(row.evidence_id);
    if (!id || !evidenceId) continue;
    const key = `${id}:${evidenceId}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}
function buildEvidenceMap(rows: EvidenceRow[], supportCounts: Map<string, number>): Map<string, SnapshotRetrievalCandidate["evidenceSignals"]> {
  const grouped = new Map<string, SnapshotRetrievalCandidate["evidenceSignals"][number][]>();
  for (const row of rows) {
    const id = stringValue(row.snapshot_identity_id), evidenceId = stringValue(row.evidence_id), claim = stringValue(row.claim);
    if (!id || !evidenceId || !claim) continue;
    const confidence = scoreValue(row.confidence);
    const list = grouped.get(id) ?? [];
    if (list.length < CLAIM_SNIPPET_LIMIT) list.push(Object.freeze({ claimSnippet: snippet(claim), confidence, supportingTargetCount: supportCounts.get(`${id}:${evidenceId}`) ?? 0 }));
    grouped.set(id, list);
  }
  return grouped;
}
function buildProvenanceMap(rows: ProvenanceRow[]): Map<string, readonly string[]> {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = stringValue(row.snapshot_identity_id), type = stringValue(row.source_type);
    if (!id || !type) continue;
    const set = grouped.get(id) ?? new Set<string>();
    set.add(type);
    grouped.set(id, set);
  }
  return new Map([...grouped.entries()].map(([id, set]) => [id, Object.freeze([...set].sort())]));
}
