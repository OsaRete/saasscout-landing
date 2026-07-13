import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseAdminClient = SupabaseClient;

export class SupabaseAdminConfigurationError extends Error {
  readonly code: "missing_supabase_url" | "missing_service_role_key";

  constructor(code: SupabaseAdminConfigurationError["code"], message: string) {
    super(message);
    this.name = "SupabaseAdminConfigurationError";
    this.code = code;
  }
}

export function createSupabaseAdminClient(): SupabaseAdminClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new SupabaseAdminConfigurationError(
      "missing_supabase_url",
      "Supabase admin client is not configured: NEXT_PUBLIC_SUPABASE_URL is missing.",
    );
  }

  if (!serviceRoleKey) {
    throw new SupabaseAdminConfigurationError(
      "missing_service_role_key",
      "Supabase admin client is not configured: SUPABASE_SERVICE_ROLE_KEY is missing.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
