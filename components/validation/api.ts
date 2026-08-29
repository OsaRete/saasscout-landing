"use client";
import { supabase } from "@/app/supabase";

export async function validationRequest<T>(path:string, init?:RequestInit):Promise<T>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token) throw new Error("auth");
  const response=await fetch(path,{...init,headers:{...(init?.body?{"Content-Type":"application/json"}:{}),Authorization:`Bearer ${session.access_token}`,...init?.headers},cache:"no-store"});
  const payload=await response.json().catch(()=>null);
  if(!response.ok){const error=new Error(payload?.error?.message||"SaaSScout could not complete that request.");Object.assign(error,{code:payload?.error?.code,status:response.status});throw error}
  return payload.data as T;
}
export const displayDate=(value:string)=>new Intl.DateTimeFormat("en",{month:"short",day:"numeric",year:"numeric"}).format(new Date(value));
export const words=(value:string)=>value.split("\n").map(x=>x.trim()).filter(Boolean);
