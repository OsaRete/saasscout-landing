import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../supabase/server-admin";

export type UserCapabilities = Readonly<{
  role: "internal_tester" | null;
  isInternalTester: boolean;
  unlimitedScans: boolean;
}>;

type CapabilityClient = Pick<SupabaseClient, "from">;

export const NO_USER_CAPABILITIES: UserCapabilities = Object.freeze({
  role: null,
  isInternalTester: false,
  unlimitedScans: false,
});

export async function resolveUserCapabilities(
  userId: string,
  client: CapabilityClient = createSupabaseAdminClient(),
): Promise<UserCapabilities> {
  if (!userId) return NO_USER_CAPABILITIES;

  try {
    const now = new Date().toISOString();
    const { data, error } = await client
      .from("application_user_access")
      .select("access_role, unlimited_scans")
      .eq("user_id", userId)
      .eq("access_role", "internal_tester")
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .maybeSingle();

    if (error || data?.access_role !== "internal_tester") return NO_USER_CAPABILITIES;

    return Object.freeze({
      role: "internal_tester",
      isInternalTester: true,
      unlimitedScans: data.unlimited_scans === true,
    });
  } catch {
    return NO_USER_CAPABILITIES;
  }
}
