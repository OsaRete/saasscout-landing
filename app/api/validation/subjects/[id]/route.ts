import { body, validationHandler } from "@/lib/validation/server/http";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){const{id}=await ctx.params;return validationHandler(request,(s,u)=>s.getSubject(u,id))}
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){const{id}=await ctx.params;return validationHandler(request,async(s,u)=>s.addSubjectLink(u,id,await body(request)))}
