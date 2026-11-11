import { validationAdmission } from "@/lib/validation/server/release-policy";
import { landingOwnerHandler } from "@/lib/validation/server/landing-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  const denied = validationAdmission("landing.remove", request.method);
  if (denied) return denied;
  return landingOwnerHandler(
    request,
    (await context.params).versionId,
    "remove",
  );
}
export {
  validationDisabledResponse as GET,
  validationDisabledResponse as HEAD,
  validationDisabledResponse as PUT,
  validationDisabledResponse as PATCH,
  validationDisabledResponse as DELETE,
  validationDisabledResponse as OPTIONS,
} from "@/lib/validation/server/release-policy";
