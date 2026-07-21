import { AuthError, requireUser } from "../_utils/auth";
import { createSupabaseAdminClient } from "../../../lib/supabase/server-admin";
import { parseSaveIdeaInput, saveIdeaForUser, UserActionError } from "../../../lib/user-actions";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const input = parseSaveIdeaInput(await req.json());
    const savedIdea = await saveIdeaForUser({ client: createSupabaseAdminClient() as unknown as import("../../../lib/user-actions").UserActionsClient, userId: user.id, opportunityId: input.opportunityId, logger: console });
    return Response.json({ savedIdea });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof UserActionError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Saved idea action failed", error);
    return Response.json({ error: "Could not save idea." }, { status: 500 });
  }
}
