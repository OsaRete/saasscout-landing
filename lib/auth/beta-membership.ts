import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "../../app/api/_utils/auth.ts";
import { createSupabaseAdminClient } from "../supabase/server-admin.ts";

/** Scheduled users have no bearer request; use the same database predicate. */
export async function requireBetaMember(
  userId: string,
  client: Pick<SupabaseClient, "rpc"> = createSupabaseAdminClient(),
): Promise<void> {
  if (!userId) throw new AuthError("An active Beta invitation is required.", 403);
  const { data, error } = await client.rpc("application_beta_member", { p_user_id: userId });
  if (error || typeof data !== "boolean") {
    throw new AuthError("Beta access could not be verified.", 503);
  }
  if (data !== true) throw new AuthError("An active Beta invitation is required.", 403);
}
