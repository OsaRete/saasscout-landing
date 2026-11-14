import { AuthError, requireUser } from "../../_utils/auth";
import { resolveUserCapabilities } from "@/lib/auth/user-capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const capabilities = await resolveUserCapabilities(user.id);
    return Response.json({ capabilities }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ error: "Capabilities unavailable" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
