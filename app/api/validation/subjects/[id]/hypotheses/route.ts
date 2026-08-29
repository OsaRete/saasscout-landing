import { body, validationHandler } from "@/lib/validation/server/http";
export const runtime="nodejs"; export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){const{id}=await ctx.params;return validationHandler(request,async(s,u)=>s.createHypothesis(u,id,await body(request)))}
