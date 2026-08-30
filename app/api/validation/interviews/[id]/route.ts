import { body, validationHandler } from "@/lib/validation/server/http";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;return validationHandler(request,async(s,u)=>s.updateInterviewSession(u,id,await body(request)))}
