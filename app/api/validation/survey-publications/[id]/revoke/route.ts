import { validationAdmission } from "@/lib/validation/server/release-policy";
import {validationHandler} from "@/lib/validation/server/http";import {SurveyService} from "@/lib/validation/server/surveys";import {createSupabaseAdminClient} from "@/lib/supabase/server-admin";export const runtime="nodejs";export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const denied = validationAdmission("survey.revoke", request.method);
  if (denied) return denied;
const{id}=await context.params;return validationHandler(request,"survey.revoke",async(_,ownerId)=>new SurveyService(createSupabaseAdminClient()).revoke(ownerId,id))}

// Explicitly deny alternate methods; do not rely on framework defaults.
export { validationDisabledResponse as GET, validationDisabledResponse as HEAD, validationDisabledResponse as PUT, validationDisabledResponse as PATCH, validationDisabledResponse as DELETE, validationDisabledResponse as OPTIONS } from "@/lib/validation/server/release-policy";
