-- Synthetic owner fixture; this suite is rolled back by its disposable runner.
insert into auth.users(id) values('11000000-0000-0000-0000-000000000001'),('11000000-0000-0000-0000-000000000002');
select set_config('landing.owner','11000000-0000-0000-0000-000000000001',false);
select set_config('landing.subject',(public.validation_create_subject(current_setting('landing.owner')::uuid,'user_entered','Landing acceptance','{}')->>'id'),false);
select set_config('landing.hypothesis',(public.validation_create_hypothesis(current_setting('landing.owner')::uuid,current_setting('landing.subject')::uuid,'operators','Research is too slow','Join a waitlist',null,'["10% signup"]','["Below 10%"]','["Too few visitors"]','[]','[]')->'version'->>'id'),false);
select set_config('landing.version',(public.validation_create_experiment(current_setting('landing.owner')::uuid,current_setting('landing.subject')::uuid,current_setting('landing.hypothesis')::uuid,'landing_waitlist','["operators"]','Landing page','{}','[]','identified_with_explicit_consent')->'version'->>'id'),false);
create function pg_temp.landing_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL %',label; end if; end $$;
create function pg_temp.landing_reject(command text,label text) returns void language plpgsql as $$ begin
 begin execute command; exception when others then return; end;
 raise exception 'FAIL expected rejection: %',label;
end $$;
select pg_temp.landing_assert(not has_table_privilege(r,t,'SELECT') and not has_table_privilege(r,t,'INSERT') and not has_table_privilege(r,t,'UPDATE') and not has_table_privilege(r,t,'DELETE'),'browser ACL '||r||t)
from unnest(array['anon','authenticated']) r cross join unnest(array['validation_landing_pages','validation_landing_publications','validation_landing_views','validation_landing_submissions','validation_landing_rate_buckets']) t;
select pg_temp.landing_assert(not has_function_privilege(r,'public.validation_landing_owner(uuid,uuid,text,jsonb,integer,text)','EXECUTE') and not has_function_privilege(r,'public.validation_landing_public(text,text,text,uuid,text,boolean,text)','EXECUTE'),'browser RPC ACL '||r) from unnest(array['anon','authenticated']) r;
select pg_temp.landing_assert(not has_function_privilege('service_role','public.validation_b43_read_current_evidence(uuid)','EXECUTE'),'shared reader remains closed');
set role service_role;
do $$
declare owner_id uuid:=current_setting('landing.owner')::uuid; version_id uuid:=current_setting('landing.version')::uuid;
 c jsonb:='{"template":"spotlight","headline":"Research faster","description":"Early access for operators","benefits":["Save time"],"cta":"Join","visual":"✦","minimumVisitors":100,"targetRate":10,"consent":"I agree to share my email with the page creator for updates about this idea. I can request removal at any time."}';
 d jsonb; x jsonb; i integer; first_pub uuid; contact uuid;
begin
 perform pg_temp.landing_reject(format('select public.validation_landing_owner(%L,%L,''read'')','11000000-0000-0000-0000-000000000002',version_id),'cross owner read');
 d:=public.validation_landing_owner(owner_id,version_id,'save',c,0);
 perform pg_temp.landing_assert((d->'page'->>'revision')::integer=1,'create');
 perform pg_temp.landing_reject(format('select public.validation_landing_owner(%L,%L,''save'',%L,0)',owner_id,version_id,c),'stale edit');
 perform pg_temp.landing_reject(format('select public.validation_landing_owner(%L,%L,''publish'',null,1,%L)',owner_id,version_id,repeat('a',64)),'draft publication');
 perform public.validation_transition_experiment_version(owner_id,version_id,'draft','ready');
 perform public.validation_transition_experiment_version(owner_id,version_id,'ready','running');
 d:=public.validation_landing_owner(owner_id,version_id,'publish',null,1,repeat('a',64));
 first_pub:=(d->'publication'->>'id')::uuid;
 x:=public.validation_landing_public(repeat('a',64),'resolve');
 perform pg_temp.landing_assert(x->>'headline'='Research faster' and not x?'owner_id' and not x?'minimumVisitors','safe projection');
 -- Editing never changes what an already-published link shows.
 d:=public.validation_landing_owner(owner_id,version_id,'save',jsonb_set(c,'{headline}','"Updated offer"'),1);
 perform pg_temp.landing_assert((public.validation_landing_public(repeat('a',64),'resolve')->>'headline')='Research faster','published snapshot');
 perform public.validation_landing_public(repeat('a',64),'view',repeat('b',64),'12000000-0000-4000-8000-000000000001',null,false,repeat('c',64));
 perform public.validation_landing_public(repeat('a',64),'view',repeat('b',64),'12000000-0000-4000-8000-000000000001',null,false,repeat('c',64));
 perform public.validation_landing_public(repeat('a',64),'view',repeat('b',64),'12000000-0000-4000-8000-000000000002',null,false,repeat('c',64));
 perform pg_temp.landing_reject(format('select public.validation_landing_public(%L,''submit'',%L,null,''person@example.com'',false,%L)',repeat('a',64),repeat('b',64),repeat('c',64)),'no consent');
 perform pg_temp.landing_reject(format('select public.validation_landing_public(%L,''submit'',%L,null,''invalid'',true,%L)',repeat('a',64),repeat('b',64),repeat('c',64)),'invalid email');
 perform public.validation_landing_public(repeat('a',64),'submit',repeat('b',64),null,'person@example.com',true,repeat('c',64));
 perform public.validation_landing_public(repeat('a',64),'submit',repeat('b',64),null,'person@example.com',true,repeat('c',64));
 perform public.validation_landing_public(repeat('a',64),'submit',repeat('b',64),null,'second@example.com',true,repeat('c',64));
 d:=public.validation_landing_owner(owner_id,version_id,'read');
 perform pg_temp.landing_assert(d->'metrics'='{"views":2,"visitors":1,"submissions":2,"convertedVisitors":1}'::jsonb,'exact metrics and duplicate handling');
 perform pg_temp.landing_assert(jsonb_array_length(d->'submissions')=2,'private results');
 contact:=(d->'submissions'->0->>'id')::uuid;
 perform pg_temp.landing_reject(format('update public.validation_landing_publications set content=''{}'' where id=%L',first_pub),'publication immutable');
 for i in 1..20 loop x:=public.validation_landing_public(repeat('a',64),'view',repeat('b',64),gen_random_uuid(),null,false,repeat('d',64)); end loop;
 x:=public.validation_landing_public(repeat('a',64),'view',repeat('b',64),gen_random_uuid(),null,false,repeat('d',64));
 perform pg_temp.landing_assert(x->>'limited'='true','durable limiter');
 perform public.validation_transition_experiment_version(owner_id,version_id,'running','paused');
 perform pg_temp.landing_reject(format('select public.validation_landing_public(%L,''resolve'')',repeat('a',64)),'pause closes ingress');
 perform public.validation_transition_experiment_version(owner_id,version_id,'paused','running');
 d:=public.validation_landing_owner(owner_id,version_id,'publish',null,2,repeat('e',64));
 perform pg_temp.landing_reject(format('select public.validation_landing_public(%L,''resolve'')',repeat('a',64)),'replacement revokes old link');
 perform pg_temp.landing_assert(public.validation_landing_public(repeat('e',64),'resolve')->>'headline'='Updated offer','replacement snapshot');
 d:=public.validation_landing_owner(owner_id,version_id,'unpublish',null,2);
 perform pg_temp.landing_reject(format('select public.validation_landing_public(%L,''submit'',%L,null,''third@example.com'',true,%L)',repeat('e',64),repeat('b',64),repeat('c',64)),'revocation prevents submission');
 perform public.validation_transition_experiment_version(owner_id,version_id,'running','completed');
 perform pg_temp.landing_reject(format('select public.validation_landing_owner(%L,%L,''save'',%L,2)',owner_id,version_id,c),'terminal edit');
 perform pg_temp.landing_reject(format('select public.validation_landing_owner(%L,%L,''remove'',%L,2)','11000000-0000-0000-0000-000000000002',version_id,jsonb_build_object('submissionId',contact)),'cross owner erasure');
 d:=public.validation_landing_owner(owner_id,version_id,'remove',jsonb_build_object('submissionId',contact),2);
 perform pg_temp.landing_assert(jsonb_array_length(d->'submissions')=1 and (d->'metrics'->>'submissions')::integer=1,'privacy removal after completion');
end $$;
reset role;
select 'PASS landing SQL: owner isolation, ACLs, create/edit/publish/unpublish, immutable snapshot, consent, duplicate contacts, exact metrics, durable limiter and lifecycle';
