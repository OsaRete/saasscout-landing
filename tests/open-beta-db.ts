/** Opt-in, fixed local Auth/PostgREST acceptance. Never connects to remote URLs.
 * Run upgrade on a freshly started baseline-only beta-membership-disposable
 * stack, then fresh after an explicitly authorized local reset with the new
 * migration included. No reset, container creation or Production mutation here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validationTestModule } from "./support/validation-module.ts";

const phase = process.argv[2];
assert.ok(phase === "upgrade" || phase === "fresh", "Explicit upgrade/fresh phase required");
assert.equal(process.env.BETA_MEMBERSHIP_DISPOSABLE, "1", "Disposable opt-in required");
const workdir = process.env.BETA_MEMBERSHIP_LOCAL_WORKDIR;
assert.ok(workdir && resolve(workdir) !== process.cwd(), "Separate disposable workdir required");
const container = "supabase_db_beta-membership-disposable";
function command(binary: string, args: string[], input?: string): string {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 60_000, maxBuffer: 4_000_000 });
  // Do not echo stdout/stderr: status contains local keys, SQL may contain fixture PII.
  assert.equal(result.status, 0, `Local ${binary} command failed; inspect private task logs`);
  return result.stdout.trim();
}
function sql(statement: string): string {
  return command("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", container,
    "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"], statement);
}
const status = JSON.parse(readFileSync(resolve(workdir, "connection.json"), "utf8")) as Record<string, string>;
assert.equal(status.phase, phase);
assert.equal(status.prepared, "true", "Fixture preparation must finish before acceptance starts");
const owned = JSON.parse(command("docker", ["--host=unix:///var/run/docker.sock", "inspect", container]));
assert.equal(owned[0].Config.Labels["saasscout.beta-membership-disposable"], status.fixture_id);
assert.equal(status.API_URL, "http://127.0.0.1:56321");
assert.equal(sql("select count(*) from auth.users;"), "0", "Only an empty fresh disposable database is allowed");
const url = status.API_URL;
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
const client = () => createClient(url, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Disposable-${randomUUID()}!`;
const users: { id: string; client: SupabaseClient; token: string }[] = [];
for (let i=0;i<4;i++) {
  const email = `open-${phase}-${i}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error,null);
  const browser=client();
  const signed=await browser.auth.signInWithPassword({email,password});
  assert.equal(signed.error,null);
  users.push({id:created.data.user!.id,client:browser,token:signed.data.session!.access_token});
}
const [owner,a,b,c]=users;
// Seed the existing founder tester assignment before upgrade. Do not replace its identity/entitlements.
assert.equal((await admin.from('application_user_access').insert({user_id:owner.id,access_role:'internal_tester',is_active:true,unlimited_scans:true,reason:'preserve fixture founder'})).error,null);
if (phase==='upgrade') {
  for (const name of ['20261116000000_beta_membership_access.sql','20261117000000_open_free_beta_access.sql','20261118000000_free_beta_monthly_admission.sql']) {
    sql(`BEGIN;\n${readFileSync(`supabase/migrations/${name}`,'utf8')}\nCOMMIT;`);
  }
  // Upgrade through the exact dependency schema before the additive spending migration.
  const historical = sql(`INSERT INTO public.scan(user_id,market,audience,region,evidence,status)
    VALUES('${owner.id}','upgrade fixture','synthetic','synthetic','retain evidence','completed') RETURNING id;`).split('\n')[0];
  const before = sql(`SELECT row_to_json(s) FROM public.scan s WHERE id='${historical}';`);
  sql(`BEGIN;\n${readFileSync('supabase/migrations/20261119000000_global_provider_spending.sql','utf8')}\nCOMMIT;`);
  assert.equal(sql(`SELECT row_to_json(s) FROM public.scan s WHERE id='${historical}';`), before, 'Upgrade preserves historical Scan evidence and identity');
  sql(readFileSync('supabase/migrations/20261125000000_named_beta_admission.sql','utf8'));
  const opportunity = sql(`INSERT INTO public.opportunities(user_id,title)
    VALUES('${owner.id}','Historical saved opportunity') RETURNING id;`).split('\n')[0];
  const saved = sql(`INSERT INTO public.saved_ideas(user_id,opportunity_id)
    VALUES('${owner.id}','${opportunity}') RETURNING id;`).split('\n')[0];
  const savedBefore = sql(`SELECT row_to_json(s) FROM public.saved_ideas s WHERE id='${saved}';`);
  sql(readFileSync('supabase/migrations/20261121000000_saved_ideas_owner_opportunity_unique.sql','utf8'));
  assert.equal(sql(`SELECT row_to_json(s) FROM public.saved_ideas s WHERE id='${saved}';`), savedBefore,
    'Unique index preserves the historical saved row');
  sql(`INSERT INTO public.saved_ideas(user_id,opportunity_id) VALUES('${owner.id}','${opportunity}')
    ON CONFLICT (user_id,opportunity_id) DO NOTHING;`);
  assert.equal(sql(`SELECT count(*) FROM public.saved_ideas
    WHERE user_id='${owner.id}' AND opportunity_id='${opportunity}';`), '1');
}
for(let i=0;i<40;i++) {
  if (!(await a.client.rpc('application_beta_access')).error) break;
  await new Promise(resolve=>setTimeout(resolve,250));
}
assert.equal((await a.client.rpc('application_beta_access')).data,false,'Public release remains closed after migration');
sql('DELETE FROM public.application_beta_release;');
assert.equal((await a.client.rpc('application_beta_access')).data,false,'Missing release singleton fails closed');
sql('INSERT INTO public.application_beta_release(singleton) VALUES(true);');
command('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v',`owner_user_id=${owner.id}`],readFileSync('scripts/open-beta-owner.sql','utf8'));
assert.equal((await owner.client.rpc('application_beta_access')).data,true,'Owner recovery works before public launch');
assert.equal((await admin.rpc('application_owner_administrator',{p_user_id:owner.id})).data,true);
const retained=await admin.from('application_user_access').select('access_role,is_active,unlimited_scans,reason').eq('user_id',owner.id).single();
assert.deepEqual(retained.data,{access_role:'internal_tester',is_active:true,unlimited_scans:true,reason:'preserve fixture founder'});
const api=validationTestModule('app/api/_utils/auth.ts') as {requireUser(r:Request):Promise<{id:string}>};
process.env.NEXT_PUBLIC_SUPABASE_URL=url;process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=status.ANON_KEY;
const request=(u:typeof a)=>new Request('http://local.test',{headers:{Authorization:`Bearer ${u.token}`}});
sql(`INSERT INTO public.application_beta_invitations (user_id, expires_at)
  VALUES ('${a.id}', now() + interval '1 hour'), ('${b.id}', now() + interval '1 hour');`);
sql('DELETE FROM public.application_beta_release;');
await assert.rejects(api.requireUser(request(a)),{status:403});
sql('INSERT INTO public.application_beta_release(singleton) VALUES(true);');
assert.equal((await api.requireUser(request(a))).id,a.id,'Named member passes Next.js admission with public Beta closed');
await assert.rejects(api.requireUser(request(c)),{status:403});
assert.equal((await admin.rpc('application_owner_administrator',{p_user_id:a.id})).data,false);
assert.ok((await admin.from('application_beta_invitations').select('user_id')).error);
assert.ok((await c.client.from('application_beta_invitations').insert({user_id:c.id,expires_at:'infinity'})).error);
assert.deepEqual((await a.client.from('user_profiles').select('user_id')).data,[{user_id:a.id}]);
assert.deepEqual((await b.client.from('user_profiles').select('user_id').eq('user_id',a.id)).data,[]);
assert.deepEqual((await c.client.from('user_profiles').select('user_id')).data,[]);
assert.equal((await admin.rpc('application_manage_user',{p_actor:owner.id,p_target:a.id,p_action:'suspend'})).error,null);
await assert.rejects(api.requireUser(request(a)),{status:403});
assert.equal((await admin.rpc('application_manage_user',{p_actor:owner.id,p_target:a.id,p_action:'reactivate'})).error,null);
sql(`UPDATE public.application_beta_invitations SET expires_at=now() WHERE user_id='${a.id}';`);
await assert.rejects(api.requireUser(request(a)),{status:403});
assert.deepEqual((await a.client.from('user_profiles').select('user_id')).data,[]);
sql(`UPDATE public.application_beta_invitations SET expires_at=now() WHERE user_id='${b.id}';`);
// Local-only release enablement. This never accepts a remote database address.
sql('UPDATE public.application_beta_release SET open_free_beta=true;');
for (const u of users) assert.equal((await u.client.rpc('application_beta_access')).data,true);
const signup=client();
const registered=await signup.auth.signUp({email:`registered-${phase}@example.test`,password,options:{data:{owner_administrator:true,access_role:'internal_tester',scan_limit:999}}});
assert.equal(registered.error,null);
assert.ok(registered.data.session,'Local Auth autoconfirm supplies a real verified session');
assert.equal((await signup.rpc('application_beta_access')).data,true,'Verified public registration automatically has Free Beta access');
assert.equal((await admin.rpc('application_owner_administrator',{p_user_id:registered.data.user!.id})).data,false,'Editable metadata cannot elevate');
const pending=await admin.auth.admin.createUser({email:`unverified-${phase}@example.test`,password,email_confirm:false});
assert.equal(pending.error,null);
assert.equal((await admin.rpc('application_beta_member',{p_user_id:pending.data.user!.id})).data,false,'Unverified Auth identity denied');
assert.ok((await client().auth.signInWithPassword({email:`unverified-${phase}@example.test`,password})).error,'Real Auth denies unconfirmed password login');
assert.equal((await client().rpc('application_beta_access')).error?.code,'42501');
assert.ok((await a.client.rpc('application_owner_administrator',{p_user_id:a.id})).error);
assert.ok((await a.client.rpc('application_manage_user',{p_actor:owner.id,p_target:b.id,p_action:'suspend'})).error);
assert.ok((await admin.rpc('application_manage_user',{p_actor:a.id,p_target:b.id,p_action:'suspend'})).error,'Actor rechecked in database');
assert.ok((await a.client.from('application_user_access').update({owner_administrator:true}).eq('user_id',a.id)).error);
assert.ok((await a.client.from('application_beta_release').update({open_free_beta:true})).error);
for(const u of [a,b]) {
  assert.equal((await u.client.from('user_profiles').select('user_id')).data?.length,1,'Owner RLS isolates profiles');
  assert.equal((await u.client.from('founder_profiles').upsert({user_id:u.id,technical_skills:'synthetic'})).error,null);
  assert.deepEqual((await u.client.from('founder_profiles').select('user_id').neq('user_id',u.id)).data,[]);
}
process.env.SUPABASE_SERVICE_ROLE_KEY=status.SERVICE_ROLE_KEY;
const adminApi=validationTestModule('app/api/admin/users/route.ts') as {GET(r:Request):Promise<Response>};
assert.equal((await adminApi.GET(new Request('http://local.test/api/admin/users',{headers:{Authorization:`Bearer ${a.token}`}}))).status,403,'Real ordinary bearer cannot list accounts');
assert.equal((await adminApi.GET(new Request('http://local.test/api/admin/users'))).status,401);
assert.equal((await adminApi.GET(new Request('http://local.test/api/admin/users',{headers:{Authorization:`Bearer ${owner.token}`}}))).status,200,'Real owner bearer lists minimal accounts');
assert.equal((await admin.rpc('application_manage_user',{p_actor:owner.id,p_target:a.id,p_action:'suspend'})).error,null);
assert.equal((await a.client.rpc('application_beta_access')).data,false,'Same real bearer loses DB access');
assert.deepEqual((await a.client.from('founder_profiles').select('*')).data,[]);
assert.ok((await a.client.from('founder_profiles').upsert({user_id:a.id,technical_skills:'blocked'})).error);
await assert.rejects(api.requireUser(request(a)),{status:403});
assert.equal((await a.client.auth.getUser()).data.user?.id,a.id,'Suspension does not delete or break Auth/recovery');
assert.equal((await admin.rpc('application_manage_user',{p_actor:owner.id,p_target:a.id,p_action:'reactivate'})).error,null);
assert.equal((await a.client.rpc('application_beta_access')).data,true);
assert.equal((await api.requireUser(request(a))).id,a.id);
assert.ok((await admin.rpc('application_manage_user',{p_actor:owner.id,p_target:owner.id,p_action:'suspend'})).error,'Owner self-lockout blocked');
assert.ok((await admin.rpc('application_manage_user',{p_actor:owner.id,p_target:owner.id,p_action:'request_deletion'})).error);
const admit=(u:string,key:string)=>admin.rpc('application_admit_discovery',{p_user_id:u,p_request_id:key});
const same=randomUUID();
const sameResults=await Promise.all(Array.from({length:8},()=>admit(a.id,same)));
assert.equal(sameResults.filter(r=>r.data==='admitted').length,1,'One dispatch permit for repeated key');
assert.equal(sameResults.filter(r=>r.data==='already_admitted').length,7);
const distinct=await Promise.all(Array.from({length:8},()=>admit(a.id,randomUUID())));
assert.equal(distinct.filter(r=>r.data==='admitted').length,2,'Three total admissions under concurrency');
assert.equal(distinct.filter(r=>r.data==='limit_exceeded').length,6);
assert.ok((await a.client.rpc('application_admit_discovery',{p_user_id:a.id,p_request_id:randomUUID()})).error);
sql(`UPDATE public.application_discovery_admissions SET admitted_at=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 second' WHERE user_id='${a.id}';`);
assert.equal((await admit(a.id,same)).data,'already_admitted','Old idempotency key cannot redispatch in a new month');
assert.equal((await admit(a.id,randomUUID())).data,'admitted','UTC month rollover permits new Discovery admission');
const ownerAdmissions=await Promise.all(Array.from({length:4},()=>admit(owner.id,randomUUID())));
assert.ok(ownerAdmissions.every(r=>r.data==='admitted'),'Owner exempt from individual Discovery quota only');
// Only this manifest-verified disposable fixture enables test ceilings. No production defaults.
sql('UPDATE public.application_spending_policy SET enabled=true,total_requests=10000,openrouter_requests=10000,serpapi_requests=10000,x_requests=10000,search_requests=10000,user_ai_requests=1000,user_search_requests=1000,max_concurrent=1000,weekly_max_executions=2;');
const scan=async(u:string,fingerprint:string)=>{
  const result=await admin.rpc('accept_scan_request_v2',{p_user_id:u,p_request_fingerprint:fingerprint,p_market:'fixture',p_audience:'fixture',p_region:'fixture',p_evidence:'Synthetic fixture evidence'});
  assert.equal(result.error,null);return result.data[0];
};
const scans=await Promise.all(Array.from({length:7},(_,i)=>scan(b.id,(i+1).toString(16).padStart(64,'0'))));
assert.equal(scans.filter(r=>r.accepted).length,3,'Exactly three Scan admissions under concurrency');
assert.equal(scans.filter(r=>r.rejection_code==='scan_limit_exceeded').length,4);
const first=scans.find(r=>r.accepted)!;
const fingerprint=(scans.indexOf(first)+1).toString(16).padStart(64,'0');
assert.equal((await scan(b.id,fingerprint)).disposition,'reused_pending','No extra quota for duplicate');
const claim=()=>admin.rpc('claim_scan_execution_v1',{p_user_id:b.id,p_scan_id:first.scan_id,p_request_fingerprint:fingerprint});
const claims=await Promise.all([claim(),claim()]);
assert.equal(claims.filter(r=>r.data?.[0]?.claimed===true).length,1,'Existing one-executor claim preserved');
assert.equal((await admin.from('scan').update({status:'failed'}).eq('id',first.scan_id)).error,null);
assert.equal((await scan(b.id,fingerprint)).rejection_code,'scan_limit_exceeded','Failed retry does not refund');
assert.equal((await admin.from('user_profiles').select('scans_used').eq('user_id',b.id).single()).data?.scans_used,3);
// Move only disposable fixture timestamps to verify UTC rollover without resetting the lifetime counter.
sql(`UPDATE public.scan SET created_at=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 second' WHERE user_id='${b.id}';`);
assert.equal((await scan(b.id,'e'.repeat(64))).accepted,true,'New UTC month allows Free Beta without resetting history');
assert.equal((await admin.from('user_profiles').select('scans_used').eq('user_id',b.id).single()).data?.scans_used,4);
assert.equal((await admin.from('user_profiles').update({scan_limit:0}).eq('user_id',c.id)).error,null);
assert.equal((await scan(c.id,'a'.repeat(64))).accepted,false,'Lower individual entitlement still denies');
assert.equal((await admin.from('application_user_access').update({unlimited_scans:false,is_active:false}).eq('user_id',owner.id)).error,null,'Local fixture proves owner authority is independent of tester entitlement');
const unlimited=await Promise.all(Array.from({length:4},(_,i)=>scan(owner.id,(i+11).toString(16).padStart(64,'0'))));
assert.ok(unlimited.every(r=>r.accepted&&r.unlimited_entitlement_used));
assert.equal((await admin.from('user_profiles').select('scans_used').eq('user_id',owner.id).single()).data?.scans_used,0);
assert.equal((await admin.rpc('application_manage_user',{p_actor:owner.id,p_target:c.id,p_action:'request_deletion'})).error,null);
assert.equal((await c.client.rpc('application_beta_access')).data,false);
assert.ok((await admin.rpc('application_manage_user',{p_actor:owner.id,p_target:c.id,p_action:'reactivate'})).error);
assert.ok((await admin.auth.admin.getUserById(c.id)).data.user,'Deletion request explicitly leaves Auth intact');
assert.equal(sql(`select count(*) from public.application_admin_audit where target_id='${c.id}' and action='request_deletion';`),'1');
const list=await admin.rpc('application_list_users',{p_actor:owner.id,p_page:1});
assert.equal(list.error,null);assert.ok(list.data.some((u:{user_id:string})=>u.user_id===c.id));
assert.ok((await admin.rpc('application_list_users',{p_actor:a.id,p_page:1})).error);
assert.equal((await admin.auth.admin.updateUserById(b.id,{ban_duration:'24h'})).error,null);
assert.equal((await b.client.rpc('application_beta_access')).data,false,'Auth ban also blocks the same already-issued database bearer');
assert.deepEqual((await b.client.from('founder_profiles').select('*')).data,[]);
assert.equal(sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname<>'beta-signups' and (has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT') or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE')) and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='beta_membership_required' and not p.polpermissive);`),'0','Complete browser RLS inventory retained');
assert.equal(sql(`select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.prorettype<>'trigger'::regtype and has_function_privilege('authenticated',p.oid,'EXECUTE');`),'application_beta_access');
console.log(`${phase}: Open Beta verified signup, owner bootstrap, metadata/grant denial, real bearer suspension/reactivation, cross-owner RLS, concurrent monthly Scan/Discovery admission, claim/duplicate/rollover, preserved tester and deletion blocking passed. No paid calls.`);
