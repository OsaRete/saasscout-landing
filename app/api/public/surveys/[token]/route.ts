import { validationAdmission } from "@/lib/validation/server/release-policy";
import {publicSurveyHandler,publicSurveyLimit} from "@/lib/validation/server/public-survey-http";export const runtime="nodejs";export async function GET(request:Request,context:{params:Promise<{token:string}>}){
  const denied = validationAdmission("survey.resolve", request.method);
  if (denied) return denied;
const{token}=await context.params;return publicSurveyHandler(request,"survey.resolve",async service=>{publicSurveyLimit(request,token);return service.resolve(token)})}

// Explicitly deny alternate methods; do not rely on framework defaults.
export { validationDisabledResponse as HEAD, validationDisabledResponse as POST, validationDisabledResponse as PUT, validationDisabledResponse as PATCH, validationDisabledResponse as DELETE, validationDisabledResponse as OPTIONS } from "@/lib/validation/server/release-policy";
