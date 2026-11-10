import { validationAdmission } from "@/lib/validation/server/release-policy";
import { body, validationHandler } from "@/lib/validation/server/http";
export const runtime="nodejs"; export async function POST(request:Request){
  const denied = validationAdmission("observation.generic", request.method);
  if (denied) return denied;
return validationHandler(request,"observation.generic",async(s,u)=>s.recordObservation(u,await body(request)))}

// Explicitly deny alternate methods; do not rely on framework defaults.
export { validationDisabledResponse as GET, validationDisabledResponse as HEAD, validationDisabledResponse as PUT, validationDisabledResponse as PATCH, validationDisabledResponse as DELETE, validationDisabledResponse as OPTIONS } from "@/lib/validation/server/release-policy";
