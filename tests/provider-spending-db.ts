/** Only the manifest-owned loopback PostgreSQL/Auth/PostgREST fixture is permitted. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { withProviderBudget, dispatchProviderFetch } from '../lib/spending/provider-budget.ts';

assert.equal(process.env.BETA_MEMBERSHIP_DISPOSABLE,'1');
const root=process.env.BETA_MEMBERSHIP_LOCAL_WORKDIR;
assert.ok(root && resolve(root)!==process.cwd());
const manifest=JSON.parse(readFileSync(resolve(root,'connection.json'),'utf8'));
assert.equal(manifest.API_URL,'http://127.0.0.1:56321');assert.equal(manifest.prepared,'true');
const container='supabase_db_beta-membership-disposable';
function cmd(args:string[],input?:string) {
 const r=spawnSync('docker',['--host=unix:///var/run/docker.sock',...args],{input,encoding:'utf8',timeout:60000});
 assert.equal(r.status,0,'Disposable database command failed');return r.stdout.trim();
}
assert.equal(JSON.parse(cmd(['inspect',container]))[0].Config.Labels['saasscout.beta-membership-disposable'],manifest.fixture_id);
const sql=(text:string)=>cmd(['exec','-i',container,'psql','-X','-At','-U','postgres','-v','ON_ERROR_STOP=1'],text);
const client=createClient(manifest.API_URL,manifest.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
// Use only existing synthetic users from the preceding open-beta acceptance.
const users=JSON.parse(sql("select json_agg(id) from auth.users where email like 'open-%@example.test';")) as string[];
assert.ok(users.length>=4);
const owner=sql('select user_id from public.application_user_access where owner_administrator;');
assert.ok(users.includes(owner));
const ordinary=users.find(id=>id!==owner)!;
const rpc=async(name:string,args:Record<string,unknown>)=>{const r=await client.rpc(name,args);assert.equal(r.error,null);return r.data;};
const args=(id=ordinary,provider='openrouter',workflow='discovery')=>({p_user_id:id,p_workflow:workflow,p_request_id:randomUUID(),p_provider:provider});
const reserve=(a:ReturnType<typeof args>,slots=1)=>rpc('application_reserve_provider',{...a,p_slots:slots});
const count=()=>Number(sql('select count(*) from public.application_provider_reservations;'));
const generous=()=>sql('UPDATE public.application_spending_policy SET enabled=true,total_requests=10000,openrouter_requests=10000,serpapi_requests=10000,x_requests=10000,search_requests=10000,user_ai_requests=10000,user_search_requests=10000,max_concurrent=10000,weekly_max_executions=2;');
const checks:string[]=[];
const dispatch=(a: ReturnType<typeof args>)=>rpc('application_dispatch_provider',{...a,p_slot:1});
const finish=(a: ReturnType<typeof args>)=>rpc('application_finish_provider',{...a,p_slot:1});
const priorMonth="(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 second'";

if (manifest.phase==='upgrade') {
  generous();
  const pending=args(ordinary,'openrouter','scan');
  const unresolved=args(owner,'serpapi','weekly');
  assert.equal(await reserve(pending,2),true);
  assert.equal(await reserve(unresolved),true);
  assert.equal(await dispatch(unresolved),true);
  sql(`UPDATE public.application_provider_reservations SET reserved_at=${priorMonth},
    dispatched_at=CASE WHEN dispatched_at IS NOT NULL THEN ${priorMonth} END`);
  const ledger=()=>sql('SELECT jsonb_agg(to_jsonb(r) ORDER BY request_id,slot) FROM public.application_provider_reservations r;');
  const beforeUpgrade=ledger();
  sql('UPDATE public.application_spending_policy SET max_concurrent=1;');
  assert.equal(await reserve(args()),false,'Old admission counts abandoned rows against concurrency');
  sql(readFileSync('supabase/migrations/20261124000000_provider_dispatch_concurrency.sql','utf8'));
  assert.equal(ledger(),beforeUpgrade,'Upgrade preserves prior-month pending and dispatched rows byte-for-byte');
  const next=args();
  assert.equal(await reserve(next),true);
  assert.equal(await dispatch(next),false,'Prior-month unresolved dispatch still occupies the only slot');
  assert.equal(await finish(pending),false,'An undispatched row cannot be finished');
  assert.equal(await finish(unresolved),true,'A legitimate terminal transition releases the slot');
  assert.equal(await dispatch(pending),false,'Prior-month pending work cannot dispatch even with room');
  assert.equal(await dispatch(next),true,'Prior-month pending rows do not occupy live slots');
  assert.equal(await finish(next),true);
  checks.push('populated upgrade preserves the ledger and prior-month dispatch semantics');
}

sql('UPDATE public.application_spending_policy SET enabled=false;');
assert.equal(await reserve(args(owner)),false);
// Missing-policy negative control is asserted from its returned boolean, not just lack of error.
assert.match(sql(`BEGIN; DELETE FROM public.application_spending_policy; SELECT public.application_reserve_provider('${ordinary}','discovery','missing-policy','openrouter',1); ROLLBACK;`),/\nf\n/);
checks.push('disabled/missing policy fails closed');
// Exercise the proposed simulation values without changing migration defaults.
sql(`UPDATE public.application_spending_policy SET enabled=true,total_requests=5000,
  openrouter_requests=1000,serpapi_requests=4000,x_requests=0,search_requests=4000,
  user_ai_requests=40,user_search_requests=160,max_concurrent=32,weekly_max_executions=2;`);
assert.equal(await reserve(args(owner, 'x')), false, 'Candidate policy disables X for an owner');
assert.equal(await reserve(args(ordinary, 'openrouter')), true, 'Candidate policy admits AI');
assert.equal(await reserve(args(ordinary, 'serpapi')), true, 'Candidate policy admits search');
checks.push('candidate request policy admits OpenRouter and SerpAPI reservations while denying X');
generous();
const before=count();
const currentCount=()=>Number(sql("select count(*) from public.application_provider_reservations where reserved_at >= date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';"));
sql(`UPDATE public.application_spending_policy SET total_requests=${currentCount()+1};`);
const last=await Promise.all(Array.from({length:12},(_,i)=>reserve(args(i%2?owner:ordinary,i%3?'openrouter':'serpapi',i%2?'weekly':'discovery'))));
assert.equal(last.filter(Boolean).length,1);assert.equal(count(),before+1);
assert.equal(await reserve(args(owner)),false);checks.push('cross-user/workflow/provider last-unit race; owner has no global exemption');
generous();
const duplicate=args();const same=await Promise.all(Array.from({length:12},()=>reserve(duplicate)));
assert.equal(same.filter(Boolean).length,1);
const dispatches=await Promise.all(Array.from({length:12},()=>rpc('application_dispatch_provider',{...duplicate,p_slot:1})));
assert.equal(dispatches.filter(Boolean).length,1);checks.push('durable same-key reservation and dispatch races');
const lowered=args(owner);assert.equal(await reserve(lowered),true);
assert.equal(await rpc('application_dispatch_provider',{...lowered,p_slot:null}),false);
assert.equal(await dispatch({...lowered,p_user_id:randomUUID()}),false);
sql('UPDATE public.application_spending_policy SET enabled=false;');
assert.equal(await dispatch(lowered),false,'An existing reservation cannot bypass the kill switch');
generous();
sql('UPDATE public.application_spending_policy SET openrouter_requests=0;');
assert.equal(await rpc('application_dispatch_provider',{...lowered,p_slot:1}),false,'Lowered limits also stop existing reservations');
generous();
assert.equal(await rpc('application_dispatch_provider',{...lowered,p_slot:1}),true);
const old=args(owner);assert.equal(await reserve(old),true);
sql(`UPDATE public.application_provider_reservations SET reserved_at=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 second' WHERE request_id='${old.p_request_id}';`);
assert.equal(await reserve(old),false,'Old identity cannot reserve again in a new month');
assert.equal(await rpc('application_dispatch_provider',{...old,p_slot:1}),false,'Old reservations cannot finance next-month dispatch');
checks.push('lowered policy and UTC rollover cannot revive old reserved dispatch');
const live=()=>Number(sql('select count(*) from public.application_provider_reservations where dispatched_at is not null and finished_at is null;'));
const active=live();
sql(`UPDATE public.application_spending_policy SET max_concurrent=${active+1};`);
const candidates=[args(ordinary,'openrouter','discovery'),args(owner,'serpapi','weekly')];
for (const candidate of candidates) assert.equal(await reserve(candidate),true);
const claims=await Promise.all(candidates.map(dispatch));
assert.equal(claims.filter(Boolean).length,1,'Exactly one claim takes the final live slot');
assert.equal(live(),active+1);
assert.equal(await dispatch(candidates[claims.indexOf(true)]),false,'Duplicate claim cannot dispatch');
assert.equal(await finish(candidates[claims.indexOf(true)]),true);
assert.equal(await dispatch(candidates[claims.indexOf(false)]),true,'Terminal completion frees the live slot');
assert.equal(await finish(candidates[claims.indexOf(false)]),true);
assert.equal(live(),active);
const snapshot=args();
assert.equal(await reserve(snapshot),true);
assert.match(sql(`BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT public.application_dispatch_provider('${ordinary}','discovery','${snapshot.p_request_id}','openrouter',1); ROLLBACK;`),/\nf\n/);
assert.equal(await dispatch(snapshot),true,'The same valid claim succeeds at the RPC isolation level');
assert.equal(await finish(snapshot),true);
checks.push('shared last-slot dispatch race, duplicate denial and terminal release');
generous();
for(const [column,provider] of [['openrouter_requests','openrouter'],['search_requests','serpapi'],['serpapi_requests','serpapi'],['x_requests','x'],['user_ai_requests','openrouter'],['user_search_requests','serpapi']] as const) {
 sql(`UPDATE public.application_spending_policy SET ${column}=0;`);
 assert.equal(await reserve(args(owner,provider)),false);generous();
}
checks.push('provider/search/user ceilings include owner');
// The real transport guard uses real RPCs, but every provider byte is mocked.
let outgoing=0;
const identity={userId:owner,workflow:'collect-sources' as const,requestId:randomUUID()};
const search='https://serpapi.com/search.json?num=5&q=synthetic';
const transport:typeof fetch=async()=>{outgoing++;return new Response('{}');};
const race=await Promise.allSettled(Array.from({length:8},()=>withProviderBudget(identity,()=>dispatchProviderFetch(search,{},transport),client)));
assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(outgoing,1);
assert.equal(await reserve(args(owner)),true);
sql('UPDATE public.application_spending_policy SET enabled=false;');
await withProviderBudget({...identity,requestId:randomUUID()},()=>assert.rejects(dispatchProviderFetch(search,{},transport)),client);
assert.equal(outgoing,1);checks.push('actual guarded source transport with real RPC duplicate and kill-switch traps');
generous();
const ambiguous={userId:owner,workflow:'collect-sources' as const,requestId:randomUUID()};
await withProviderBudget(ambiguous,()=>assert.rejects(dispatchProviderFetch(search,{},async()=>{throw new Error('ambiguous');})),client);
assert.equal(sql(`select count(*) from public.application_provider_reservations where request_id='${ambiguous.requestId}:1' and dispatched_at is not null and finished_at is null;`),'1');
sql(`UPDATE public.application_spending_policy SET max_concurrent=${live()};`);
const blocked={...identity,requestId:randomUUID()};
await withProviderBudget(blocked,()=>assert.rejects(dispatchProviderFetch(search,{},transport)),client);
assert.equal(outgoing,1,'A live-capacity denial never reaches out to the provider');
assert.equal(sql(`select count(*) from public.application_provider_reservations where request_id='${blocked.requestId}:1' and dispatched_at is null;`),'1');
checks.push('ambiguous dispatch retains charged active row');
// Budget denial must not change ordinary admission/history counters, nor create a pending Scan.
const scanBefore=sql(`select scans_used from public.user_profiles where user_id='${ordinary}';`);
const rowsBefore=sql(`select count(*) from public.scan where user_id='${ordinary}';`);
// Separate fresh verified fixture user avoids an already-exhausted individual quota.
const created=await client.auth.admin.createUser({email:`spend-${randomUUID()}@example.test`,password:`Local-${randomUUID()}!`,email_confirm:true});
assert.equal(created.error,null);const fresh=created.data.user!.id;
const scanArgs={p_user_id:fresh,p_request_fingerprint:'f'.repeat(64),p_market:'synthetic',p_audience:'synthetic',p_region:'synthetic',p_evidence:'synthetic'};
sql('UPDATE public.application_spending_policy SET enabled=false;');
const denied=await rpc('accept_scan_request_v2',scanArgs);
assert.equal(denied[0].rejection_code,'global_budget_unavailable');
assert.equal(sql(`select scans_used from public.user_profiles where user_id='${fresh}';`),'0');
assert.equal(sql(`select count(*) from public.scan where user_id='${fresh}';`),'0');
assert.equal(sql(`select scans_used from public.user_profiles where user_id='${ordinary}';`),scanBefore);
assert.equal(sql(`select count(*) from public.scan where user_id='${ordinary}';`),rowsBefore);
generous();
const beforeScanReserve=count();
sql(`UPDATE public.application_spending_policy SET total_requests=${currentCount()+1};`);
assert.equal((await rpc('accept_scan_request_v2',scanArgs))[0].rejection_code,'global_budget_unavailable','One remaining unit cannot finance a two-call Scan');
assert.equal(count(),beforeScanReserve,'No partial Scan reservation');
assert.equal(sql(`select scans_used from public.user_profiles where user_id='${fresh}';`),'0');
generous();
const liveBeforeScan=live();
sql(`UPDATE public.application_spending_policy SET max_concurrent=${liveBeforeScan};`);
const monthlyBeforeScan=currentCount();
const admitted=(await rpc('accept_scan_request_v2',scanArgs))[0];assert.equal(admitted.accepted,true);
assert.equal(sql(`select count(*) from public.application_provider_reservations where workflow='scan' and request_id='${admitted.scan_id}' and dispatched_at is null;`),'2');
assert.equal(live(),liveBeforeScan,'Abandoned/pre-dispatch Scan work occupies no live capacity');
assert.equal(currentCount(),monthlyBeforeScan+2,'Both unused Scan units remain charged');
assert.equal((await rpc('accept_scan_request_v2',scanArgs))[0].scan_id,admitted.scan_id);
generous();
checks.push('Scan atomic two-slot reservation, no quota/pending row on denial, duplicate reuse');
// Weekly retry exhaustion is cumulative per durable period; failed/stale reclaims each increment.
const weekly={p_user_id:owner,p_period_start:'2026-11-09T00:00:00Z',p_period_end:'2026-11-16T00:00:00Z',p_timezone:'UTC',p_stale_before:'2026-11-01T00:00:00Z'};
const first=(await rpc('claim_weekly_intelligence_run',weekly))[0];assert.equal(first.claim_status,'claimed');
assert.equal(first.run.spending_execution_attempts,1);
assert.equal((await rpc('claim_weekly_intelligence_run',weekly))[0].claim_status,'processing');
sql(`update public.weekly_intelligence_runs set status='failed' where id='${first.run.id}';`);
const retries=await Promise.all(Array.from({length:8},()=>rpc('claim_weekly_intelligence_run',weekly)));
assert.equal(retries.filter(r=>r[0].claim_status==='reclaimed').length,1);
assert.ok(retries.every(r=>r[0].run.spending_execution_attempts===2));
sql(`update public.weekly_intelligence_runs set updated_at='2026-10-01' where id='${first.run.id}';`);
assert.ok((await client.rpc('claim_weekly_intelligence_run',weekly)).error);
sql(`update public.weekly_intelligence_runs set status='completed' where id='${first.run.id}'; UPDATE public.application_spending_policy SET enabled=false;`);
assert.equal((await rpc('claim_weekly_intelligence_run',weekly))[0].claim_status,'completed');
checks.push('Weekly failed/stale cumulative ceiling, concurrent reclaim, processing and completed reuse with budgets disabled');
assert.equal(sql("select has_function_privilege('authenticated','public.application_reserve_provider(uuid,text,text,text,integer)','execute');"),'f');
assert.equal(sql("select has_function_privilege('authenticated','public.application_dispatch_provider(uuid,text,text,text,integer)','execute');"),'f');
assert.equal(sql("select has_function_privilege('anon','public.application_dispatch_provider(uuid,text,text,text,integer)','execute');"),'f');
assert.equal(sql("select has_table_privilege('service_role','public.application_spending_policy','update');"),'f');
assert.equal(sql("select has_table_privilege('authenticated','public.application_provider_reservations','select');"),'f');
assert.equal(sql("select has_table_privilege('service_role','public.application_provider_reservations','update');"),'f');
checks.push('browser and service-role ledger/configuration forgery denied');
console.log(`${manifest.phase}: ${checks.length} spending acceptance groups passed:\n${checks.join('\n')}`);
