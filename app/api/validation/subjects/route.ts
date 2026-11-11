import { validationAdmission } from "@/lib/validation/server/release-policy";
import { body, validationHandler } from "@/lib/validation/server/http";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request){
  const denied = validationAdmission("subject.list", request.method);
  if (denied) return denied;
return validationHandler(request,"subject.list",(s,u)=>s.listSubjects(u))}
export async function POST(request:Request){
  const denied = validationAdmission("subject.create", request.method);
  if (denied) return denied;
return validationHandler(request,"subject.create",async(s,u)=>s.createSubject(u,await body(request)))}

// Explicitly deny alternate methods; do not rely on framework defaults.
export { validationDisabledResponse as HEAD, validationDisabledResponse as PUT, validationDisabledResponse as PATCH, validationDisabledResponse as DELETE, validationDisabledResponse as OPTIONS } from "@/lib/validation/server/release-policy";
