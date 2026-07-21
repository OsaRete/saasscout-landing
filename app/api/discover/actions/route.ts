import { AuthError, requireUser } from "../../_utils/auth";
import { createSupabaseAdminClient } from "../../../../lib/supabase/server-admin";
import { parseDiscoverActionInput, recordDiscoverActionForUser, UserActionError } from "../../../../lib/user-actions";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const input = parseDiscoverActionInput(await req.json());
    const action = await recordDiscoverActionForUser({ client: createSupabaseAdminClient() as unknown as import("../../../../lib/user-actions").UserActionsClient, userId: user.id, discoveryId: input.discoveryId, problemId: input.problemId, actionType: input.actionType, logger: console });
    return Response.json({ action });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof UserActionError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Discover action failed", error);
    return Response.json({ error: "Could not record discover action." }, { status: 500 });
  }
}
