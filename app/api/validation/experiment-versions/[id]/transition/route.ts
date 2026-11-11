import { validationAdmission } from "@/lib/validation/server/release-policy";
import { body, validationHandler } from "@/lib/validation/server/http";
export const runtime="nodejs"; export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
  const denied = validationAdmission("experiment.transition", request.method);
  if (denied) return denied;
const{id}=await ctx.params;return validationHandler(request,"experiment.transition",async(s,u)=>s.transition(u,id,await body(request)))}

// Explicitly deny alternate methods; do not rely on framework defaults.
export { validationDisabledResponse as GET, validationDisabledResponse as HEAD, validationDisabledResponse as PUT, validationDisabledResponse as PATCH, validationDisabledResponse as DELETE, validationDisabledResponse as OPTIONS } from "@/lib/validation/server/release-policy";
