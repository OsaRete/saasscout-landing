import { validationAdmission } from "@/lib/validation/server/release-policy";
import { body, validationHandler } from "@/lib/validation/server/http";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){
  const denied = validationAdmission("subject.read", request.method);
  if (denied) return denied;
const{id}=await ctx.params;return validationHandler(request,"subject.read",(s,u)=>s.getSubject(u,id))}
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
  const denied = validationAdmission("subject.link", request.method);
  if (denied) return denied;
const{id}=await ctx.params;return validationHandler(request,"subject.link",async(s,u)=>s.addSubjectLink(u,id,await body(request)))}

// Explicitly deny alternate methods; do not rely on framework defaults.
export { validationDisabledResponse as HEAD, validationDisabledResponse as PUT, validationDisabledResponse as PATCH, validationDisabledResponse as DELETE, validationDisabledResponse as OPTIONS } from "@/lib/validation/server/release-policy";
