import "server-only";
import { AuthError, requireUser } from "@/app/api/_utils/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { ValidationServerError } from "./contracts";
import { ValidationRepository } from "./repository";
import { ValidationService } from "./service";

export async function validationHandler(request:Request,operation:(service:ValidationService,ownerId:string)=>Promise<unknown>){try{const user=await requireUser(request);const service=new ValidationService(new ValidationRepository(createSupabaseAdminClient()));return Response.json({data:await operation(service,user.id)});}catch(error){if(error instanceof AuthError)return Response.json({error:{code:"unauthenticated",message:"Authentication required."}},{status:401});if(error instanceof ValidationServerError)return Response.json({error:{code:error.code,message:error.message}},{status:error.status});console.error("Validation command failed",{category:"internal_error"});return Response.json({error:{code:"constraint_conflict",message:"Validation operation failed."}},{status:500});}}
export async function body(request:Request){const length=Number(request.headers.get("content-length")??0);if(length>64_000)throw new ValidationServerError(413,"invalid_request","Request body is too large.");try{return await request.json()}catch{throw new ValidationServerError(400,"invalid_request","Request body must be valid JSON.")}}
