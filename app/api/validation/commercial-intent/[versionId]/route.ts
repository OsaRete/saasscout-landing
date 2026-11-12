import { validationAdmission } from "@/lib/validation/server/release-policy";
import { commercialIntentOwnerHandler } from "@/lib/validation/server/commercial-intent-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  const denied = validationAdmission("commercial-intent.read", request.method);
  if (denied) return denied;
  return commercialIntentOwnerHandler(
    request,
    (await context.params).versionId,
    "read",
  );
}
export {
  validationDisabledResponse as POST,
  validationDisabledResponse as HEAD,
  validationDisabledResponse as PUT,
  validationDisabledResponse as PATCH,
  validationDisabledResponse as DELETE,
  validationDisabledResponse as OPTIONS,
} from "@/lib/validation/server/release-policy";
