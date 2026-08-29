import { body, validationHandler } from "@/lib/validation/server/http";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request){return validationHandler(request,(s,u)=>s.listSubjects(u))}
export async function POST(request:Request){return validationHandler(request,async(s,u)=>s.createSubject(u,await body(request)))}
