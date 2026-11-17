import assert from "node:assert/strict";
import test from "node:test";
import { validationTestModule } from "./support/validation-module.ts";

const actor = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
function adminHarness(authorized=true) {
  const calls: unknown[]=[];
  const load=validationTestModule('app/api/admin/users/route.ts',(specifier)=> {
    if (specifier==='@/lib/auth/owner-administrator') return { requireOwnerAdministrator: async()=> {
      if(!authorized) throw new Error('Unauthorized fixture');
      return {user:{id:actor},client:{rpc:async(name:string,args:unknown)=>{calls.push([name,args]);return {data:name==='application_list_users'?[]:null,error:null};}}};
    }};
    return undefined;
  }) as {GET(r:Request):Promise<Response>;POST(r:Request):Promise<Response>};
  const request=(body:unknown,origin='https://app.test')=>new Request('https://app.test/api/admin/users',{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),
  });
  return {load,calls,request};
}
test('admin mutations reject forged origin, unknown privilege fields and absent UUID confirmation',async()=>{
  const h=adminHarness();
  for(const [body,origin] of [
    [{userId:target,action:'suspend',confirmation:target},'https://evil.test'],
    [{userId:target,action:'suspend',confirmation:target,owner_administrator:true},'https://app.test'],
    [{userId:target,action:'suspend'},'https://app.test'],
    [{userId:target,action:'delete',confirmation:target},'https://app.test'],
  ] as const) assert.ok((await h.load.POST(h.request(body,origin))).status>=400);
  assert.deepEqual(h.calls,[]);
});
test('owner endpoint binds actor to verified session and never reports deletion complete',async()=>{
  const h=adminHarness();
  const response=await h.load.POST(h.request({userId:target,action:'request_deletion',confirmation:target}));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:'deletion_review_required',deleted:false});
  assert.deepEqual(h.calls,[['application_manage_user',{p_actor:actor,p_target:target,p_action:'request_deletion'}]]);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('admin listing fails closed before database calls for non-owner',async()=>{
  const h=adminHarness(false);
  assert.equal((await h.load.GET(new Request('https://app.test/api/admin/users'))).status,503);
  assert.deepEqual(h.calls,[]);
});
test('real owner helper denies non-owner and malformed capability, ignoring editable role metadata',async()=>{
  for(const value of [false,null,'true',{},true]) {
    const loaded= validationTestModule('lib/auth/owner-administrator.ts',(specifier)=>{
      if(specifier.endsWith('_utils/auth')) return {
        AuthError:class extends Error {status:number;constructor(message:string,status:number){super(message);this.status=status;}},
        requireUser:async()=>({id:actor,user_metadata:{owner_administrator:true}}),
      };
      if(specifier.endsWith('server-admin')) return {createSupabaseAdminClient:()=>({rpc:async(name:string,args:unknown)=>{
        assert.equal(name,'application_owner_administrator');assert.deepEqual(args,{p_user_id:actor});return {data:value,error:null};
      }})};
      return undefined;
    }) as {requireOwnerAdministrator(r:Request):Promise<unknown>};
    if(value===true) assert.ok(await loaded.requireOwnerAdministrator(new Request('https://app.test')));
    else await assert.rejects(loaded.requireOwnerAdministrator(new Request('https://app.test')), { status: value === false ? 403 : 503 });
  }
});
test('exhausted, repeated or unavailable Discovery admission never enters paid workflow',async()=>{
  for(const admission of ['limit_exceeded','already_admitted','account_denied',null]) {
    let dispatched=false;
    const loaded= validationTestModule('app/api/discover-opportunities/route.ts',(specifier)=>{
      if(specifier==='../_utils/auth') return {AuthError:class extends Error {status:number;constructor(m:string,s:number){super(m);this.status=s;}},requireUser:async()=>({id:actor})};
      if(specifier.endsWith('server-admin')) return {createSupabaseAdminClient:()=>({rpc:async()=>({data:admission,error:null})})};
      if(specifier.endsWith('discover-opportunities-workflow')) return {DiscoverOpportunitiesWorkflowError:class extends Error{},discoverOpportunitiesWorkflow:async()=>{dispatched=true;throw new Error('Provider trap');}};
      return undefined;
    }) as {POST(r:Request):Promise<Response>};
    const response=await loaded.POST(new Request('https://app.test/api/discover-opportunities',{method:'POST',headers:{'Idempotency-Key':target}}));
    assert.ok(response.status>=400);assert.equal(dispatched,false);
  }
});
test('Weekly manual generation requires owner before profile/provider work',async()=>{
  let touched=false;
  const loaded= validationTestModule('app/api/weekly-intelligence/route.ts',(specifier)=>{
    if(specifier==='@/lib/auth/owner-administrator') return {requireOwnerAdministrator:async()=>{throw new Error('Non-owner rejected');}};
    if(specifier==='@/lib/knowledge/evolution') return {runKnowledgeEvolutionWeeklyDiagnostics(){throw new Error('Diagnostics trap');}};
    if(specifier==='openai') return class {constructor(){touched=true;throw new Error('Provider trap');}};
    return undefined;
  }) as {POST(r:Request):Promise<Response>};
  assert.ok((await loaded.POST(new Request('https://app.test/api/weekly-intelligence',{method:'POST'}))).status>=400);
  assert.equal(touched,false);
});
