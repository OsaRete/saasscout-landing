import "server-only";

import { createSupabaseAdminClient, type SupabaseAdminClient } from "../../supabase/server-admin.ts";
import type { PersistedPromotionRows } from "./read-repository.ts";

/** One statement-level snapshot for B3.1; its exact JSON is rechecked after database locks. */
export async function readValidationPromotionAuthority(
  ownerId: string,
  observationId: string,
  db: SupabaseAdminClient = createSupabaseAdminClient(),
): Promise<PersistedPromotionRows> {
  const result = await db.rpc("validation_read_promotion_authority_v1", {
    p_owner_id: ownerId,
    p_observation_id: observationId,
  });
  if (result.error || !result.data || typeof result.data !== "object") throw new Error("promotion_authority_read_failed");
  const rows = (result.data as { rows?: unknown }).rows;
  if (!rows || typeof rows !== "object") throw new Error("promotion_authority_read_failed");
  return rows as PersistedPromotionRows;
}
