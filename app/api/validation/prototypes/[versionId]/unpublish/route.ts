import { validationAdmission } from "@/lib/validation/server/release-policy";
import { prototypeOwnerHandler } from "@/lib/validation/server/prototype-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  const denied = validationAdmission("prototype.unpublish", request.method);
  if (denied) return denied;
  return prototypeOwnerHandler(
    request,
    (await context.params).versionId,
    "unpublish",
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
