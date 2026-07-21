import { AuthError, requireUser } from "../_utils/auth";
import { createSupabaseAdminClient } from "../../../lib/supabase/server-admin";
import { parseSaveIdeaInput, parseUnsaveSavedIdeaInput, saveIdeaForUser, unsaveSavedIdeaForUser, UserActionError, type UserActionsClient } from "../../../lib/user-actions";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const input = parseSaveIdeaInput(await req.json());
    const savedIdea = await saveIdeaForUser({ client: createSupabaseAdminClient() as unknown as UserActionsClient, userId: user.id, opportunityId: input.opportunityId, logger: console });
    return Response.json({ savedIdea });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof UserActionError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Saved idea action failed", error);
    return Response.json({ error: "Could not save idea." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  try {
    const user = await requireUser(req);
    const input = parseUnsaveSavedIdeaInput(await req.json());
    const result = await unsaveSavedIdeaForUser({ client: createSupabaseAdminClient() as unknown as UserActionsClient, userId: user.id, savedIdeaId: input.savedIdeaId, opportunityId: input.opportunityId, logger: console });
    console.info("User action diagnostic", { event: "saved_idea_delete_route_completed", userId: user.id, removed: result.removed, durationMs: Date.now() - startedAt });
    return Response.json({ savedIdea: result });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof UserActionError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Saved idea delete action failed", { durationMs: Date.now() - startedAt });
    return Response.json({ error: "Could not remove saved idea." }, { status: 500 });
  }
}
