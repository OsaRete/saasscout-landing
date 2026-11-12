-- Synthetic owner fixture; this suite is rolled back by its disposable runner.
insert into auth.users(id) values('31000000-0000-0000-0000-000000000001'),('31000000-0000-0000-0000-000000000002');
select set_config('external_mvp.owner','31000000-0000-0000-0000-000000000001',false);
select set_config('external_mvp.subject',(public.validation_create_subject(current_setting('external_mvp.owner')::uuid,'user_entered','Prototype acceptance','{}')->>'id'),false);
select set_config('external_mvp.hypothesis',(public.validation_create_hypothesis(current_setting('external_mvp.owner')::uuid,current_setting('external_mvp.subject')::uuid,'operators','Research is too slow','Join a waitlist',null,'["10% signup"]','["Below 10%"]','["Too few visitors"]','[]','[]')->'version'->>'id'),false);
select set_config('external_mvp.version',(public.validation_create_experiment(current_setting('external_mvp.owner')::uuid,current_setting('external_mvp.subject')::uuid,current_setting('external_mvp.hypothesis')::uuid,'external_mvp','["operators"]','Landing page','{}','[]','identified_with_explicit_consent')->'version'->>'id'),false);
create function pg_temp.external_mvp_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
create function pg_temp.external_mvp_reject(command text,label text) returns void language plpgsql as $$ begin
 begin execute command; exception when others then return; end;
 raise exception 'FAIL expected rejection: %',label;
end $$;
select pg_temp.external_mvp_assert(not has_table_privilege(r,t,'SELECT') and not has_table_privilege(r,t,'INSERT') and not has_table_privilege(r,t,'UPDATE') and not has_table_privilege(r,t,'DELETE'),'browser ACL '||r||t)
from unnest(array['anon','authenticated']) r cross join unnest(array['validation_external_mvp_pages','validation_external_mvp_publications','validation_external_mvp_submissions','validation_external_mvp_rate_buckets']) t;
select pg_temp.external_mvp_assert(not has_function_privilege(r,'public.validation_external_mvp_owner(uuid,uuid,text,jsonb,integer,text)','EXECUTE') and not has_function_privilege(r,'public.validation_external_mvp_public(text,text,uuid,jsonb,boolean,text)','EXECUTE'),'browser RPC ACL '||r) from unnest(array['anon','authenticated']) r;
select pg_temp.external_mvp_assert((select bool_and(relrowsecurity) from pg_class where relname like 'validation_external_mvp_%' and relkind='r'),'RLS enabled');
set role service_role;
do $$
declare o uuid:=current_setting('external_mvp.owner')::uuid; v uuid:=current_setting('external_mvp.version')::uuid;
 c jsonb:='{"title": "Test MVP", "url": "https://example.com/", "purpose": "Try the main task", "instructions": "Return to give feedback", "questions": ["What blocked you?"], "consent": "I agree to share my feedback privately with the experiment creator for product research. I will not include personal or sensitive information in my answers."}'; feedback jsonb:='{"outcome": "not_tried", "answers": ["I could not access it"], "email": "person@example.com", "consent": "I agree to share my feedback privately with the experiment creator for product research. I will not include personal or sensitive information in my answers.", "contactConsent": "I agree to share my email with the creator for follow-up about this test. I can ask the creator to remove it through the channel that supplied this link."}'; d jsonb; x jsonb; i integer; sid uuid;
begin
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_owner(%L,%L,''read'')','31000000-0000-0000-0000-000000000002',v),'cross owner');
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_owner(%L,%L,''save'',%L,0)',o,v,jsonb_set(c,'{url}','"https://127.0.0.1/"')),'unsafe URL');
 d:=public.validation_external_mvp_owner(o,v,'save',c,0);
 perform pg_temp.external_mvp_assert(d->'page'->>'revision'='1','saved');
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_owner(%L,%L,''save'',%L,0)',o,v,c),'stale edit');
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_owner(%L,%L,''publish'',null,1,%L)',o,v,repeat('a',64)),'draft publication');
 perform public.validation_transition_experiment_version(o,v,'draft','ready');
 perform public.validation_transition_experiment_version(o,v,'ready','running');
 d:=public.validation_external_mvp_owner(o,v,'publish',null,1,repeat('a',64));
 x:=public.validation_external_mvp_public(repeat('a',64),'resolve',null,null,false,repeat('b',64));
 perform pg_temp.external_mvp_assert(x->>'title'='Test MVP' and not x?'owner_id' and not x?'revision','safe projection');
 d:=public.validation_external_mvp_owner(o,v,'save',jsonb_set(c,'{questions}','["Changed question"]'),1);
 perform pg_temp.external_mvp_assert(public.validation_external_mvp_public(repeat('a',64),'resolve',null,null,false,repeat('b',64))->'questions'=c->'questions','snapshot');
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_public(%L,''submit'',gen_random_uuid(),%L,false,%L)',repeat('a',64),feedback,repeat('b',64)),'feedback consent');
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_public(%L,''submit'',gen_random_uuid(),%L,true,%L)',repeat('a',64),feedback-'contactConsent',repeat('b',64)),'contact consent');
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_public(%L,''submit'',gen_random_uuid(),%L,true,%L)',repeat('a',64),jsonb_set(feedback,'{answers}','[]'),repeat('b',64)),'exact answers');
 perform public.validation_external_mvp_public(repeat('a',64),'submit','32000000-0000-4000-8000-000000000001',feedback,true,repeat('b',64));
 perform public.validation_external_mvp_public(repeat('a',64),'submit','32000000-0000-4000-8000-000000000001',feedback,true,repeat('b',64));
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_public(%L,''submit'',%L,%L,true,%L)',repeat('a',64),'32000000-0000-4000-8000-000000000001',jsonb_set(feedback,'{outcome}','"yes"'),repeat('b',64)),'changed retry');
 d:=public.validation_external_mvp_owner(o,v,'read');sid:=(d->'submissions'->0->>'id')::uuid;
 perform pg_temp.external_mvp_assert(d->'metrics'->>'submissions'='1' and d->'metrics'->>'contacts'='1','retry once');
 perform pg_temp.external_mvp_assert(d->'submissions'->0->'answers'->0->>'question'='What blocked you?' and d->'submissions'->0->>'revision'='1','historical attribution');
 d:=public.validation_external_mvp_owner(o,v,'remove',jsonb_build_object('submissionId',sid),2);
 perform public.validation_external_mvp_public(repeat('a',64),'submit','32000000-0000-4000-8000-000000000001',feedback,true,repeat('b',64));
 d:=public.validation_external_mvp_owner(o,v,'read');
 perform pg_temp.external_mvp_assert(d->'metrics'->>'contacts'='0' and d->'metrics'->>'submissions'='1','erasure retry cannot restore email');
 perform pg_temp.external_mvp_reject('update public.validation_external_mvp_submissions set payload=''{}''','immutable feedback');
 perform pg_temp.external_mvp_reject('update public.validation_external_mvp_publications set content=''{}''','immutable publication');
 for i in 1..61 loop x:=public.validation_external_mvp_public(repeat('a',64),'resolve',null,null,false,repeat('d',64)); end loop;
 perform pg_temp.external_mvp_assert(x->>'limited'='true','GET durable limit');
 d:=public.validation_external_mvp_owner(o,v,'publish',null,2,repeat('e',64));
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_public(%L,''resolve'',null,null,false,%L)',repeat('a',64),repeat('b',64)),'replaced token');
 perform public.validation_transition_experiment_version(o,v,'running','paused');
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_public(%L,''submit'',gen_random_uuid(),%L,true,%L)',repeat('e',64),feedback,repeat('b',64)),'pause submit');
 perform public.validation_transition_experiment_version(o,v,'paused','running');
 d:=public.validation_external_mvp_owner(o,v,'unpublish',null,2);
 perform pg_temp.external_mvp_reject(format('select public.validation_external_mvp_public(%L,''resolve'',null,null,false,%L)',repeat('e',64),repeat('b',64)),'unpublish');
 perform pg_temp.external_mvp_assert(not exists(select 1 from public.validation_evidence_observations where owner_id=o),'private isolation');
 perform pg_temp.external_mvp_assert((select count(*) from public.validation_external_mvp_submissions where owner_id=o)=1,'feedback preserved');
 d:=public.validation_external_mvp_owner(o,v,'publish',null,2,repeat('f',64));
 insert into public.validation_external_mvp_submissions(publication_id,page_id,owner_id,request_id,payload,consent_text)
 select (d->'publication'->>'id')::uuid,(d->'page'->>'id')::uuid,o,gen_random_uuid(),'{}','synthetic capacity fixture' from generate_series(1,999);
 feedback:=jsonb_set(feedback,'{answers}','["Updated question answer"]');
 x:=public.validation_external_mvp_public(repeat('f',64),'submit',gen_random_uuid(),feedback,true,repeat('b',64));
 perform pg_temp.external_mvp_assert(x->>'capacity'='true','1000 total submission cap');
 insert into public.validation_external_mvp_rate_buckets values((d->'publication'->>'id')::uuid,'global',date_trunc('minute',clock_timestamp()),600)
 on conflict(publication_id,network_hash,minute) do update set attempts=600;
 x:=public.validation_external_mvp_public(repeat('f',64),'resolve',null,null,false,repeat('c',64));
 perform pg_temp.external_mvp_assert(x->>'limited'='true','global rotating-network cap');
end $$;
reset role;
select 'PASS external MVP ownership, ACL, RLS, URL, revisions, consent, snapshots, retry, contact erasure, immutability, rate, replacement, pause, unpublish and isolation';
