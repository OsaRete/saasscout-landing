import "server-only";

export type UserActionLogger = Pick<Console, "info" | "warn" | "error">;

type SupabaseResult<T> = PromiseLike<{ data: T | null; error: unknown }>;

type QueryBuilder<T = unknown> = {
  select(columns?: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  maybeSingle(): SupabaseResult<T>;
  single(): SupabaseResult<T>;
  insert(values: unknown[]): QueryBuilder<T>;
  upsert(values: unknown[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): QueryBuilder<T>;
  delete(): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T[]>;
};

export type UserActionsClient = {
  from(table: string): QueryBuilder;
};

export type SavedIdeaPublic = { id: string; opportunity_id: string; saved: true; duplicate: boolean };
export type UnsaveSavedIdeaPublic = { saved: false; removed: boolean };
export type DeleteOpportunityPublic = { deleted: boolean };
export type DiscoveryActionPublic = { id: string; discovery_id: string; problem_id: string; action_type: DiscoverActionType; duplicate: boolean };

const DISCOVER_ACTION_TYPES = ["prepared_deep_scan"] as const;
export type DiscoverActionType = (typeof DISCOVER_ACTION_TYPES)[number];

export class UserActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.name = "UserActionError";
    this.status = status;
    this.code = code;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readId(value: unknown, field: string) {
  return isObject(value) && typeof value[field] === "string" ? value[field] : null;
}

function safeLog(logger: UserActionLogger | undefined, level: "info" | "warn" | "error", event: string, details: Record<string, unknown>) {
  logger?.[level]?.("User action diagnostic", { event, ...details });
}

export function parseSaveIdeaInput(input: unknown) {
  const opportunityId = readId(input, "opportunityId");
  if (!opportunityId) throw new UserActionError(400, "invalid_saved_idea_request", "A valid opportunityId is required.");
  return { opportunityId };
}


export function parseUnsaveSavedIdeaInput(input: unknown) {
  const savedIdeaId = readId(input, "savedIdeaId");
  const opportunityId = readId(input, "opportunityId");
  if (!savedIdeaId && !opportunityId) throw new UserActionError(400, "invalid_unsave_saved_idea_request", "A valid savedIdeaId or opportunityId is required.");
  return { savedIdeaId, opportunityId };
}

export function parseDeleteOpportunityInput(input: unknown) {
  const opportunityId = readId(input, "opportunityId");
  if (!opportunityId) throw new UserActionError(400, "invalid_delete_opportunity_request", "A valid opportunityId is required.");
  return { opportunityId };
}

export function parseDiscoverActionInput(input: unknown) {
  const discoveryId = readId(input, "discoveryId");
  const problemId = readId(input, "problemId");
  const actionType = readId(input, "actionType");
  if (!discoveryId || !problemId || !actionType) throw new UserActionError(400, "invalid_discover_action_request", "discoveryId, problemId, and actionType are required.");
  if (!DISCOVER_ACTION_TYPES.includes(actionType as DiscoverActionType)) throw new UserActionError(400, "invalid_discover_action_type", "Unsupported discovery action type.");
  return { discoveryId, problemId, actionType: actionType as DiscoverActionType };
}

export async function saveIdeaForUser({ client, userId, opportunityId, logger }: { client: UserActionsClient; userId: string; opportunityId: string; logger?: UserActionLogger }): Promise<SavedIdeaPublic> {
  const { data: opportunity, error: opportunityError } = await client
    .from("opportunities")
    .select("id,user_id")
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (opportunityError || !opportunity) {
    safeLog(logger, "warn", "saved_idea_ownership_rejected", { userId, opportunityId });
    throw new UserActionError(404, "opportunity_not_found", "Opportunity not found.");
  }

  const existing = await client
    .from("saved_ideas")
    .select("id,opportunity_id")
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (existing.error) throw new UserActionError(500, "saved_idea_lookup_failed", "Could not save idea.");
  if (existing.data) {
    safeLog(logger, "info", "saved_idea_duplicate", { userId, opportunityId });
    return { id: readId(existing.data, "id") || "", opportunity_id: opportunityId, saved: true, duplicate: true };
  }

  const inserted = await client
    .from("saved_ideas")
    .upsert([{ user_id: userId, opportunity_id: opportunityId }], { onConflict: "user_id,opportunity_id", ignoreDuplicates: true })
    .select("id,opportunity_id")
    .single();

  if (inserted.error || !inserted.data) throw new UserActionError(500, "saved_idea_write_failed", "Could not save idea.");
  safeLog(logger, "info", "saved_idea_saved", { userId, opportunityId });
  return { id: readId(inserted.data, "id") || "", opportunity_id: opportunityId, saved: true, duplicate: false };
}

export async function recordDiscoverActionForUser({ client, userId, discoveryId, problemId, actionType, logger }: { client: UserActionsClient; userId: string; discoveryId: string; problemId: string; actionType: DiscoverActionType; logger?: UserActionLogger }): Promise<DiscoveryActionPublic> {
  const { data: discovery, error: discoveryError } = await client.from("opportunity_discoveries").select("id,user_id,status").eq("id", discoveryId).eq("user_id", userId).maybeSingle();
  if (discoveryError || !discovery) {
    safeLog(logger, "warn", "discover_action_ownership_rejected", { userId, discoveryId });
    throw new UserActionError(404, "discovery_not_found", "Discovery not found.");
  }
  const status = isObject(discovery) && typeof discovery.status === "string" ? discovery.status : "";
  if (status && !["completed", "success"].includes(status)) throw new UserActionError(409, "discovery_lifecycle_invalid", "Discovery is not ready for actions.");

  const { data: problem, error: problemError } = await client.from("discovered_problems").select("id,discovery_id,user_id").eq("id", problemId).eq("discovery_id", discoveryId).eq("user_id", userId).maybeSingle();
  if (problemError || !problem) {
    safeLog(logger, "warn", "discover_action_problem_rejected", { userId, discoveryId, problemId });
    throw new UserActionError(404, "problem_not_found", "Problem not found.");
  }

  const existing = await client.from("discovery_actions").select("id,discovery_id,problem_id,action_type").eq("user_id", userId).eq("discovery_id", discoveryId).eq("problem_id", problemId).eq("action_type", actionType).maybeSingle();
  if (existing.error) throw new UserActionError(500, "discover_action_lookup_failed", "Could not record action.");
  if (existing.data) {
    safeLog(logger, "info", "discover_action_duplicate", { userId, discoveryId, problemId, actionType });
    return { id: readId(existing.data, "id") || "", discovery_id: discoveryId, problem_id: problemId, action_type: actionType, duplicate: true };
  }

  const inserted = await client.from("discovery_actions").upsert([{ user_id: userId, discovery_id: discoveryId, problem_id: problemId, action_type: actionType }], { onConflict: "user_id,discovery_id,problem_id,action_type", ignoreDuplicates: true }).select("id,discovery_id,problem_id,action_type").single();
  if (inserted.error || !inserted.data) throw new UserActionError(500, "discover_action_write_failed", "Could not record action.");
  safeLog(logger, "info", "discover_action_recorded", { userId, discoveryId, problemId, actionType });
  return { id: readId(inserted.data, "id") || "", discovery_id: discoveryId, problem_id: problemId, action_type: actionType, duplicate: false };
}


export async function unsaveSavedIdeaForUser({ client, userId, savedIdeaId, opportunityId, logger }: { client: UserActionsClient; userId: string; savedIdeaId?: string | null; opportunityId?: string | null; logger?: UserActionLogger }): Promise<UnsaveSavedIdeaPublic> {
  let query = client.from("saved_ideas").select("id,user_id,opportunity_id").eq("user_id", userId);
  if (savedIdeaId) query = query.eq("id", savedIdeaId);
  if (opportunityId) query = query.eq("opportunity_id", opportunityId);

  const existing = await query.maybeSingle();
  if (existing.error) throw new UserActionError(500, "saved_idea_lookup_failed", "Could not remove saved idea.");
  if (!existing.data) {
    safeLog(logger, "info", "saved_idea_unsave_absent", { userId, savedIdeaId, opportunityId });
    return { saved: false, removed: false };
  }

  const ownedSavedIdeaId = readId(existing.data, "id");
  if (!ownedSavedIdeaId) throw new UserActionError(500, "saved_idea_lookup_failed", "Could not remove saved idea.");

  const deleted = await client.from("saved_ideas").delete().eq("id", ownedSavedIdeaId).eq("user_id", userId).maybeSingle();
  if (deleted.error) throw new UserActionError(500, "saved_idea_delete_failed", "Could not remove saved idea.");
  safeLog(logger, "info", "saved_idea_unsaved", { userId, savedIdeaId: ownedSavedIdeaId, opportunityId: readId(existing.data, "opportunity_id") });
  return { saved: false, removed: true };
}

export async function deleteOpportunityForUser({ client, userId, opportunityId, logger }: { client: UserActionsClient; userId: string; opportunityId: string; logger?: UserActionLogger }): Promise<DeleteOpportunityPublic> {
  const { data: opportunity, error: opportunityError } = await client.from("opportunities").select("id,user_id").eq("id", opportunityId).eq("user_id", userId).maybeSingle();
  if (opportunityError) throw new UserActionError(500, "opportunity_lookup_failed", "Could not delete opportunity.");
  if (!opportunity) {
    safeLog(logger, "info", "opportunity_delete_not_found", { userId, opportunityId });
    throw new UserActionError(404, "opportunity_not_found", "Opportunity not found.");
  }

  const savedCleanup = await client.from("saved_ideas").delete().eq("user_id", userId).eq("opportunity_id", opportunityId).maybeSingle();
  if (savedCleanup.error) throw new UserActionError(500, "opportunity_dependency_cleanup_failed", "Could not delete opportunity.");

  const deleted = await client.from("opportunities").delete().eq("id", opportunityId).eq("user_id", userId).maybeSingle();
  if (deleted.error) throw new UserActionError(500, "opportunity_delete_failed", "Could not delete opportunity.");
  safeLog(logger, "info", "opportunity_deleted", { userId, opportunityId });
  return { deleted: true };
}
