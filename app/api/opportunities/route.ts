import { AuthError, requireUser } from "../_utils/auth";
import { createSupabaseAdminClient } from "../../../lib/supabase/server-admin";
import { deleteOpportunityForUser, parseDeleteOpportunityInput, UserActionError, type UserActionsClient } from "../../../lib/user-actions";

export async function DELETE(req: Request) {
  const startedAt = Date.now();
  try {
    const user = await requireUser(req);
    const input = parseDeleteOpportunityInput(await req.json());
    const result = await deleteOpportunityForUser({ client: createSupabaseAdminClient() as unknown as UserActionsClient, userId: user.id, opportunityId: input.opportunityId, logger: console });
    console.info("User action diagnostic", { event: "opportunity_delete_route_completed", userId: user.id, opportunityId: input.opportunityId, deleted: result.deleted, durationMs: Date.now() - startedAt });
    return Response.json({ opportunity: result });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof UserActionError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Opportunity delete action failed", { durationMs: Date.now() - startedAt });
    return Response.json({ error: "Could not delete opportunity." }, { status: 500 });
  }
}
