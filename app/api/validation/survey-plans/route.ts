import { validationAdmission } from "@/lib/validation/server/release-policy";
import {body,validationHandler} from "@/lib/validation/server/http";import {SurveyService} from "@/lib/validation/server/surveys";import {createSupabaseAdminClient} from "@/lib/supabase/server-admin";export const runtime="nodejs";export async function POST(request:Request){
  const denied = validationAdmission("survey.plan", request.method);
  if (denied) return denied;
return validationHandler(request,"survey.plan",async(_,ownerId)=>new SurveyService(createSupabaseAdminClient()).createPlan(ownerId,await body(request)))}

// Explicitly deny alternate methods; do not rely on framework defaults.
export { validationDisabledResponse as GET, validationDisabledResponse as HEAD, validationDisabledResponse as PUT, validationDisabledResponse as PATCH, validationDisabledResponse as DELETE, validationDisabledResponse as OPTIONS } from "@/lib/validation/server/release-policy";
