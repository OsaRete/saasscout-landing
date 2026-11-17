import { AuthError, requireUser } from "../../_utils/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { resolveUserCapabilities } from "@/lib/auth/user-capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const capabilities = await resolveUserCapabilities(user.id);
    const client = createSupabaseAdminClient();
    const { data: owner, error } = await client.rpc("application_owner_administrator", { p_user_id: user.id });
    if (error || typeof owner !== "boolean") throw new Error("Owner capability unavailable");
    const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
    const [scans, discoveries] = await Promise.all([
      client.from("scan").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", month.toISOString()),
      client.from("application_discovery_admissions").select("request_id", { count: "exact", head: true }).eq("user_id", user.id).gte("admitted_at", month.toISOString()),
    ]);
    if (scans.error || discoveries.error) throw new Error("Usage unavailable");
    return Response.json({ capabilities: { ...capabilities, isOwnerAdministrator: owner, scansThisMonth: scans.count, discoveriesThisMonth: discoveries.count, unlimitedScans: owner || capabilities.unlimitedScans } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ error: "Capabilities unavailable" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
