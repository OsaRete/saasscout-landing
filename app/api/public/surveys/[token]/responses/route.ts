import { validationAdmission } from "@/lib/validation/server/release-policy";
import {body} from "@/lib/validation/server/http";import {publicSurveyHandler,publicSurveyLimit} from "@/lib/validation/server/public-survey-http";export const runtime="nodejs";export async function POST(request:Request,context:{params:Promise<{token:string}>}){
  const denied = validationAdmission("survey.submit", request.method);
  if (denied) return denied;
const{token}=await context.params;return publicSurveyHandler(request,"survey.submit",async service=>{publicSurveyLimit(request,token);return service.submit(token,await body(request))})}

// Explicitly deny alternate methods; do not rely on framework defaults.
export { validationDisabledResponse as GET, validationDisabledResponse as HEAD, validationDisabledResponse as PUT, validationDisabledResponse as PATCH, validationDisabledResponse as DELETE, validationDisabledResponse as OPTIONS } from "@/lib/validation/server/release-policy";
