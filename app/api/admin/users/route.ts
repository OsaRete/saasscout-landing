import { AuthError } from "../../_utils/auth";
import { requireOwnerAdministrator } from "@/lib/auth/owner-administrator";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  return Response.json({ error: error instanceof AuthError ? error.message : "User administration unavailable." },
    { status: error instanceof AuthError ? error.status : 503, headers });
}
export async function GET(request: Request) {
  try {
    const { user, client } = await requireOwnerAdministrator(request);
    const page = Number(new URL(request.url).searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new AuthError("Invalid page.", 400);
    const { data, error } = await client.rpc("application_list_users", { p_actor: user.id, p_page: page });
    if (error || !Array.isArray(data)) throw new Error("Listing failed");
    return Response.json({ users: data, page }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    // A bearer token is mandatory; cookies/frontend state never authorize this endpoint.
    const { user, client } = await requireOwnerAdministrator(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AuthError("Invalid origin.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AuthError("JSON required.", 415);
    // Bound streaming input as well as Content-Length; no unbounded body parse.
    const reader = request.body?.getReader();
    if (!reader) throw new AuthError("Body required.", 400);
    let body = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); throw new AuthError("Request too large.", 413); }
      body += decoder.decode(value, { stream: true });
    }
    let input;
    try { input = JSON.parse(body + decoder.decode()); } catch { throw new AuthError("Invalid request.", 400); }
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["userId", "action", "confirmation"].includes(key)) ||
      typeof input.userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.userId) ||
      !["suspend", "reactivate", "request_deletion"].includes(input.action) || input.confirmation !== input.userId) {
      throw new AuthError("Explicit account confirmation required.", 400);
    }
    const { error } = await client.rpc("application_manage_user", { p_actor: user.id, p_target: input.userId, p_action: input.action });
    if (error) throw new AuthError("Action blocked. Check account status and owner safeguards.", 409);
    return Response.json({ status: input.action === "request_deletion" ? "deletion_review_required" : "updated", deleted: false }, { headers });
  } catch (error) { return failure(error); }
}
