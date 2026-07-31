import { AuthError, requireUser } from "../../_utils/auth";
import { resolveUserCapabilities } from "@/lib/auth/user-capabilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const capabilities = await resolveUserCapabilities(user.id);
    return Response.json({ capabilities });
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: "Unauthorized" }, { status: error.status });
    }
    return Response.json({ error: "Capabilities unavailable" }, { status: 500 });
  }
}
