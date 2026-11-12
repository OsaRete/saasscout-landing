import { validationAdmission } from "@/lib/validation/server/release-policy";
import { externalMvpPublicHandler } from "@/lib/validation/server/external-mvp-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const denied = validationAdmission("external-mvp.submit", request.method);
  if (denied) return denied;
  return externalMvpPublicHandler(
    request,
    (await context.params).token,
    "submit",
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
