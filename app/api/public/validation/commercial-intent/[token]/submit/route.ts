import { validationAdmission } from "@/lib/validation/server/release-policy";
import { commercialIntentPublicHandler } from "@/lib/validation/server/commercial-intent-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const denied = validationAdmission(
    "commercial-intent.submit",
    request.method,
  );
  if (denied) return denied;
  return commercialIntentPublicHandler(
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
