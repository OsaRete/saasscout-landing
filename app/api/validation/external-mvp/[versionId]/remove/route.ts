import { validationAdmission } from "@/lib/validation/server/release-policy";
import { externalMvpOwnerHandler } from "@/lib/validation/server/external-mvp-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  const denied = validationAdmission("external-mvp.remove", request.method);
  if (denied) return denied;
  return externalMvpOwnerHandler(
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
