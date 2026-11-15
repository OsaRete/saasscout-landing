import "server-only";
import { AuthError, requireUser } from "../../app/api/_utils/auth";
import { createSupabaseAdminClient } from "../supabase/server-admin";

export async function requireOwnerAdministrator(request: Request) {
  const user = await requireUser(request);
  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc("application_owner_administrator", { p_user_id: user.id });
  if (error || typeof data !== "boolean") throw new AuthError("Administrator access could not be verified.", 503);
  if (!data) throw new AuthError("Owner administrator access is required.", 403);
  return { user, client };
}
