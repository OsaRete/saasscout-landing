import { validationAdmission } from "@/lib/validation/server/release-policy";
import { landingOwnerHandler } from "@/lib/validation/server/landing-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  const denied = validationAdmission("landing.read", request.method);
  if (denied) return denied;
  return landingOwnerHandler(request, (await context.params).versionId, "read");
}
export {
  validationDisabledResponse as POST,
  validationDisabledResponse as HEAD,
  validationDisabledResponse as PUT,
  validationDisabledResponse as PATCH,
  validationDisabledResponse as DELETE,
  validationDisabledResponse as OPTIONS,
} from "@/lib/validation/server/release-policy";
