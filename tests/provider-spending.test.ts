import assert from "node:assert/strict";
import test from "node:test";
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { withProviderBudget, dispatchProviderFetch, ProviderBudgetError, bindWeeklySpendingAttempt, spendingRequestId } from "../lib/spending/provider-budget.ts";

const url = "https://openrouter.ai/api/v1/chat/completions";
const envelope = { model: "openai/gpt-4.1-mini", max_tokens: 3200, messages: [] };
const init = { method: "POST", body: JSON.stringify(envelope) };
const identity = { userId: "verified-owner", workflow: "discovery" as const, requestId: "durable-request" };
function ledger() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const dispatched = new Set<string>();
  return { calls, rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    const key = `${args.p_workflow}/${args.p_request_id}/${args.p_provider}/${args.p_slot}`;
    if (name === "application_dispatch_provider") {
      if (dispatched.has(key)) return { data: false, error: null };
      dispatched.add(key);
    }
    return { data: true, error: null };
  } };
}
const noTransport: typeof fetch = async () => { throw new Error("Forbidden provider dispatch"); };

test("missing workflow identity denies before transport or admin client", async () => {
  await assert.rejects(dispatchProviderFetch(url, init, noTransport), ProviderBudgetError);
});
for (const data of [false, null, "true", {}, undefined]) {
  test(`denied/malformed budget response ${String(data)} fails closed`, async () => {
    await withProviderBudget(identity, () => assert.rejects(dispatchProviderFetch(url, init, noTransport), ProviderBudgetError), {
      rpc: async () => ({ data, error: null }),
    });
  });
}
test("unavailable budget RPC fails closed", async () => {
  await withProviderBudget(identity, () => assert.rejects(dispatchProviderFetch(url, init, noTransport), ProviderBudgetError), {
    rpc: async () => ({ data: true, error: new Error("offline") }),
  });
});
test("same durable identity cannot dispatch twice even in independent requests", async () => {
  const client = ledger(); let dispatched = 0;
  const transport: typeof fetch = async () => { dispatched++; return new Response('{}'); };
  const results = await Promise.allSettled(Array.from({length:8}, () => withProviderBudget(identity, () => dispatchProviderFetch(url, init, transport), client)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(dispatched,1);
});
test("application replacement is a separately reserved attempt", async () => {
  const client=ledger();
  await withProviderBudget(identity, async () => {
    await dispatchProviderFetch(url,init,async()=>new Response('{}'));
    await dispatchProviderFetch(url,init,async()=>new Response('{}'));
  },client);
  assert.deepEqual(client.calls.filter(c=>c.name==='application_reserve_provider').map(c=>c.args.p_request_id),['durable-request:1','durable-request:2']);
});
test("ambiguous transport or response body failure retains active reservation and charge", async () => {
  for (const transport of [async()=>{throw new Error('timeout');},async()=>new Response(new ReadableStream({start(c){c.error(new Error('lost body'));}}))]) {
    const client=ledger();
    await withProviderBudget(identity,()=>assert.rejects(dispatchProviderFetch(url,init,transport)),client);
    assert.deepEqual(client.calls.map(c=>c.name),['application_reserve_provider','application_dispatch_provider']);
  }
});
test("received HTTP failure conservatively retains concurrency and usage",async()=>{
  const client=ledger();
  const response=await withProviderBudget(identity,()=>dispatchProviderFetch(url,init,async()=>new Response('{}',{status:429})),client);
  assert.equal(response.status,429);
  assert.deepEqual(client.calls.map(c=>c.name),['application_reserve_provider','application_dispatch_provider']);
});
test("actual OpenAI SDK issues one transport attempt on retryable HTTP failure",async()=>{
  const client=ledger();let outgoing=0;
  const sdk=new OpenAI({apiKey:'mock',baseURL:'https://openrouter.ai/api/v1',maxRetries:0,
    fetch:(input,options)=>dispatchProviderFetch(input,options,async()=>{outgoing++;return new Response('{"error":{"message":"busy"}}',{status:503});})});
  await withProviderBudget(identity,()=>assert.rejects(sdk.chat.completions.create({...envelope,messages:[{role:'user',content:'synthetic'}]})),client);
  assert.equal(outgoing,1);
  assert.equal(client.calls.filter(c=>c.name==='application_reserve_provider').length,1);
});
test("Scan only consumes its two transactionally pre-reserved slots",async()=>{
  const client=ledger();
  await withProviderBudget({...identity,workflow:'scan'},async()=>{
    for(let i=0;i<2;i++) await dispatchProviderFetch(url,init,async()=>new Response('{}'));
    await assert.rejects(dispatchProviderFetch(url,init,noTransport),ProviderBudgetError);
  },client);
  assert.equal(client.calls.filter(c=>c.name==='application_reserve_provider').length,0);
  assert.deepEqual(client.calls.filter(c=>c.name==='application_dispatch_provider').map(c=>c.args.p_slot),[1,2]);
});
test("Weekly server claim binds cumulative attempt identity",async()=>{
  const client=ledger();
  await withProviderBudget({...identity,workflow:'weekly'},async()=>{
    assert.throws(()=>bindWeeklySpendingAttempt({id:'run',user_id:'forged',spending_execution_attempts:2}),ProviderBudgetError);
    bindWeeklySpendingAttempt({id:'run',user_id:identity.userId,spending_execution_attempts:2});
    await dispatchProviderFetch(url,init,async()=>new Response('{}'));
  },client);
  assert.equal(client.calls[0].args.p_request_id,'run:2:1');
});
test("oversized or unbounded provider envelopes and redirects deny before dispatch",async()=>{
  await withProviderBudget(identity,async()=>{
    for(const bad of [{...envelope,max_tokens:99999},{...envelope,model:'unapproved'},{...envelope,stream:true}])
      await assert.rejects(dispatchProviderFetch(url,{...init,body:JSON.stringify(bad)},noTransport),ProviderBudgetError);
    await assert.rejects(dispatchProviderFetch('https://unapproved.test',init,noTransport),ProviderBudgetError);
  },ledger());
});
test("source-search keys require UUID v4 and ignore authority headers",()=>{
  assert.throws(()=>spendingRequestId(new Request('http://local',{headers:{'x-owner':'true'}})),ProviderBudgetError);
  assert.equal(spendingRequestId(new Request('http://local',{headers:{'idempotency-key':'ABCDEFAB-1234-4234-8234-123456789ABC'}})),'abcdefab-1234-4234-8234-123456789abc');
});
test("every production SDK constructor has explicit no-retry guarded transport",()=>{
  for(const file of ['lib/scan/problem-intelligence-service.ts','lib/intelligence/discover-opportunities-workflow.ts','app/api/weekly-intelligence/route.ts','lib/validation/intelligence/service.ts','lib/validation/design-assistant/service.ts']) {
    const source=readFileSync(file,'utf8');
    assert.match(source,/new OpenAI\(\{\s*maxRetries: 0,\s*fetch: budgetedProviderFetch,/);
  }
});

test("collect-sources actual route meters four searches and rejects replay before a fifth dispatch",async(t)=>{
  const { validationTestModule } = await import('./support/validation-module.ts');
  const client=ledger();let outgoing=0;
  const oldKey=process.env.SERPAPI_API_KEY;process.env.SERPAPI_API_KEY='mock';
  t.after(()=>{if(oldKey===undefined)delete process.env.SERPAPI_API_KEY;else process.env.SERPAPI_API_KEY=oldKey;});
  t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{
    assert.match(String(input),/^https:\/\/serpapi.com\/search.json/);outgoing++;
    return new Response('{"organic_results":[]}');
  });
  const route=validationTestModule('app/api/collect-sources/route.ts',(specifier)=>{
    if(specifier.endsWith('_utils/auth'))return {requireUser:async()=>({id:identity.userId}),AuthError:class extends Error {status:number;constructor(message:string,status:number){super(message);this.status=status;}}};
    if(specifier.endsWith('supabase/server-admin.ts'))return {createSupabaseAdminClient:()=>client};
    return undefined;
  }) as {POST(req:Request):Promise<Response>};
  const request=(body='{"market":"synthetic"}',key='00000000-0000-4000-8000-000000000001')=>new Request('http://local/api/collect-sources',{method:'POST',headers:{'idempotency-key':key},body});
  assert.equal((await route.POST(request())).status,200);
  assert.equal(outgoing,4);
  assert.equal(client.calls.filter(c=>c.name==='application_reserve_provider').length,4);
  assert.equal((await route.POST(request())).status,503);
  assert.equal(outgoing,4);
  assert.equal((await route.POST(request('{"market":"synthetic"}',''))).status,503);
  assert.equal((await route.POST(request('x'.repeat(2049)))).status,413);
  assert.equal(outgoing,4);
  t.mock.restoreAll();
});
