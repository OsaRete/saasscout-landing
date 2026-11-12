import { validationAdmission } from "@/lib/validation/server/release-policy";
import { prototypePublicHandler } from "@/lib/validation/server/prototype-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const denied = validationAdmission("prototype.event", request.method);
  if (denied) return denied;
  return prototypePublicHandler(request, (await context.params).token, "event");
}
export {
  validationDisabledResponse as GET,
  validationDisabledResponse as HEAD,
  validationDisabledResponse as PUT,
  validationDisabledResponse as PATCH,
  validationDisabledResponse as DELETE,
  validationDisabledResponse as OPTIONS,
} from "@/lib/validation/server/release-policy";
