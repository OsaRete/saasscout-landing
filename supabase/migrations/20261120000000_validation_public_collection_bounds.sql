-- Public participant integrity and bounded collection. Retain all evidence and grants.
-- This pending migration owns its transaction: psql and Supabase CLI may apply
-- statements without an implicit file transaction. Keep locks, seeding and RPCs atomic.
begin;
-- Block ingress while seeding retained usage and replacing RPCs in this transaction.
lock table public.validation_survey_submissions, public.validation_survey_answers,
 public.validation_landing_views, public.validation_landing_submissions,
 public.validation_prototype_views, public.validation_prototype_submissions in share row exclusive mode;

create table public.validation_collection_usage (
 method text not null check(method in ('survey','landing','prototype')),
 experiment_version_id uuid not null references public.validation_experiment_versions(id) on delete restrict,
 events bigint not null default 0 check(events>=0), submissions bigint not null default 0 check(submissions>=0),
 primary key(method,experiment_version_id)
);
alter table public.validation_collection_usage enable row level security;
revoke all on public.validation_collection_usage from public,anon,authenticated,service_role;
grant select,insert,update on public.validation_collection_usage to service_role;
-- Durable consumption survives contact erasure and publication replacement. Existing
-- retained history seeds a floor; contacts erased before this migration cannot be reconstructed.
insert into public.validation_collection_usage(method,experiment_version_id,submissions)
 select 'survey',experiment_version_id,count(*) from public.validation_survey_submissions group by experiment_version_id;
insert into public.validation_collection_usage(method,experiment_version_id,events,submissions)
 select 'landing',p.experiment_version_id,
 (select count(*) from public.validation_landing_views where page_id=p.id),
 (select count(*) from public.validation_landing_submissions where page_id=p.id) from public.validation_landing_pages p;
insert into public.validation_collection_usage(method,experiment_version_id,events,submissions)
 select 'prototype',p.experiment_version_id,
 (select count(*) from public.validation_prototype_views where page_id=p.id),
 (select count(*) from public.validation_prototype_submissions where page_id=p.id) from public.validation_prototype_pages p;

create table public.validation_survey_rate_buckets (
 publication_id uuid not null references public.validation_survey_publications(id) on delete restrict,
 network_hash text not null check(network_hash='global' or network_hash ~ '^[a-f0-9]{64}$'),
 minute timestamptz not null, attempts integer not null check(attempts>0),
 primary key(publication_id,network_hash,minute)
);
alter table public.validation_survey_rate_buckets enable row level security;
revoke all on public.validation_survey_rate_buckets from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.validation_survey_rate_buckets to service_role;

create or replace function public.validation_submit_public_survey(p_token_hash text,p_idempotency_key text,p_payload_hash text,p_answers jsonb,p_network_hash text) returns jsonb language plpgsql set search_path=public as $$
declare pub public.validation_survey_publications;experiment public.validation_experiment_versions;plan public.validation_survey_plan_versions;s public.validation_survey_submissions;existing public.validation_survey_submissions;a jsonb;q jsonb;answer_count integer;distinct_question_count integer;selected_count integer;distinct_selected_count integer;n integer;
begin
 select * into pub from public.validation_survey_publications where token_hash=p_token_hash and state='published' for share;
 if not found then raise exception 'survey unavailable' using errcode='P0002';end if;
 select * into experiment from public.validation_experiment_versions
 where id=pub.experiment_version_id and experiment_id=pub.experiment_id and hypothesis_version_id=pub.hypothesis_version_id and
       hypothesis_id=pub.hypothesis_id and subject_id=pub.subject_id and owner_id=pub.owner_id and family='survey' and lifecycle='running'
 for share;
 if not found then raise exception 'survey unavailable' using errcode='P0002';end if;
 if p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid network hash' using errcode='23514'; end if;
 -- Serialize all publications of this exact experiment version, including cumulative checks.
 perform pg_advisory_xact_lock(hashtextextended(pub.experiment_version_id::text,737));
 insert into public.validation_collection_usage(method,experiment_version_id) values('survey',pub.experiment_version_id) on conflict do nothing;
 -- Prune even when the outcome will be limited. Aggregate admission precedes network allocation.
 delete from public.validation_survey_rate_buckets where publication_id=pub.id and minute<date_trunc('minute',clock_timestamp())-interval '1 day';
 insert into public.validation_survey_rate_buckets values(pub.id,'global',date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_survey_rate_buckets.attempts+1,601) returning attempts into n;
 if n>600 then return jsonb_build_object('limited',true); end if;
 insert into public.validation_survey_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_survey_rate_buckets.attempts+1,11) returning attempts into n;
 if n>10 then return jsonb_build_object('limited',true); end if;
 begin
 select * into plan from public.validation_survey_plan_versions where id=pub.survey_plan_version_id;
 if not found then raise exception 'survey plan unavailable' using errcode='P0002';end if;

 if jsonb_typeof(p_answers) is distinct from 'array' then raise exception 'answers must be an array' using errcode='23514';end if;
 answer_count:=jsonb_array_length(p_answers);
 if answer_count>15 or pg_column_size(p_answers)>65536 then raise exception 'answers exceed bounds' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(p_answers) answer where jsonb_typeof(answer) is distinct from 'object' or jsonb_typeof(answer->'questionRef') is distinct from 'string' or not (answer ? 'value')) then raise exception 'malformed answer' using errcode='23514';end if;
 select count(distinct answer->>'questionRef') into distinct_question_count from jsonb_array_elements(p_answers) answer;
 if distinct_question_count<>answer_count then raise exception 'duplicate question reference' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(p_answers) answer where not exists(select 1 from jsonb_array_elements(plan.questions) question where question->>'questionRef'=answer->>'questionRef')) then raise exception 'unknown question' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(plan.questions) question where coalesce((question->>'required')::boolean,false) and not exists(select 1 from jsonb_array_elements(p_answers) answer where answer->>'questionRef'=question->>'questionRef')) then raise exception 'required question missing' using errcode='23514';end if;

 for a in select value from jsonb_array_elements(p_answers) loop
  select value into q from jsonb_array_elements(plan.questions) where value->>'questionRef'=a->>'questionRef';
  if q->>'type'='single_choice' then
   if jsonb_typeof(a->'value') is distinct from 'string' or not exists(select 1 from jsonb_array_elements_text(q->'options') option where option=a->>'value') then raise exception 'invalid single choice answer' using errcode='23514';end if;
  elsif q->>'type'='multiple_choice' then
   if jsonb_typeof(a->'value') is distinct from 'array' then raise exception 'invalid multiple choice answer type' using errcode='23514';end if;
   selected_count:=jsonb_array_length(a->'value');
   if selected_count>12 then raise exception 'multiple choice answer exceeds bounds' using errcode='23514';end if;
   if coalesce((q->>'required')::boolean,false) and selected_count=0 then raise exception 'required question was not answered' using errcode='23514';end if;
   if exists(select 1 from jsonb_array_elements(a->'value') selected where jsonb_typeof(selected) is distinct from 'string' or not exists(select 1 from jsonb_array_elements_text(q->'options') option where option=selected#>>'{}')) then raise exception 'invalid multiple choice option' using errcode='23514';end if;
   select count(distinct selected#>>'{}') into distinct_selected_count from jsonb_array_elements(a->'value') selected;
   if distinct_selected_count<>selected_count then raise exception 'duplicate multiple choice option' using errcode='23514';end if;
  elsif q->>'type'='short_text' then
   if jsonb_typeof(a->'value') is distinct from 'string' or length(a->>'value')>500 then raise exception 'invalid short text answer' using errcode='23514';end if;
   if coalesce((q->>'required')::boolean,false) and btrim(a->>'value',U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' then raise exception 'required question was not answered' using errcode='23514';end if;
  elsif q->>'type'='long_text' then
   if jsonb_typeof(a->'value') is distinct from 'string' or length(a->>'value')>4000 then raise exception 'invalid long text answer' using errcode='23514';end if;
   if coalesce((q->>'required')::boolean,false) and btrim(a->>'value',U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' then raise exception 'required question was not answered' using errcode='23514';end if;
  elsif q->>'type'='number' then
   if jsonb_typeof(a->'value') is distinct from 'number' or (q?'min' and (a->>'value')::numeric<(q->>'min')::numeric) or (q?'max' and (a->>'value')::numeric>(q->>'max')::numeric) then raise exception 'invalid number answer' using errcode='23514';end if;
  else
   raise exception 'unsupported survey question type' using errcode='23514';
  end if;
 end loop;

 -- Identical retries remain accepted even when cumulative capacity has been exhausted.
 select * into existing from public.validation_survey_submissions where publication_id=pub.id and idempotency_key=p_idempotency_key;
 if found then
  if existing.payload_hash is distinct from p_payload_hash then return jsonb_build_object('conflict',true); end if;
  return jsonb_build_object('submissionId',existing.id,'duplicate',true);
 end if;
 if not exists(select 1 from public.validation_survey_submissions where publication_id=pub.id and idempotency_key=p_idempotency_key) and (select submissions from public.validation_collection_usage where method='survey' and experiment_version_id=pub.experiment_version_id)>=1000 then return jsonb_build_object('capacity',true); end if;
 -- Validation precedes writes; PostgreSQL function execution is atomic, so any later exception rolls back all inserts.
 insert into public.validation_survey_submissions(owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,survey_plan_version_id,publication_id,idempotency_key,payload_hash)
 values(pub.owner_id,pub.subject_id,pub.experiment_id,pub.experiment_version_id,pub.hypothesis_id,pub.hypothesis_version_id,pub.survey_plan_version_id,pub.id,p_idempotency_key,p_payload_hash)
 on conflict(publication_id,idempotency_key)do nothing returning * into s;
 if not found then
  select * into existing from public.validation_survey_submissions where publication_id=pub.id and idempotency_key=p_idempotency_key;
  if existing.payload_hash<>p_payload_hash then raise exception 'idempotency conflict' using errcode='23505';end if;
  return jsonb_build_object('submissionId',existing.id,'duplicate',true);
 end if;
 for a in select value from jsonb_array_elements(p_answers) loop
  select value into q from jsonb_array_elements(plan.questions) where value->>'questionRef'=a->>'questionRef';
  insert into public.validation_survey_answers(owner_id,submission_id,survey_plan_version_id,question_id,question_type,raw_answer)
  values(pub.owner_id,s.id,plan.id,a->>'questionRef',q->>'type',a->'value');
 end loop;
 update public.validation_collection_usage set submissions=submissions+1 where method='survey' and experiment_version_id=pub.experiment_version_id;
 return jsonb_build_object('submissionId',s.id,'duplicate',false);
 exception when check_violation then return jsonb_build_object('rejected',true);
 when unique_violation then return jsonb_build_object('conflict',true);
 end;
end $$;

revoke all on function public.validation_submit_public_survey(text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.validation_submit_public_survey(text,text,text,jsonb,text) to service_role;
-- Retire the legacy service entry: older application artifacts cannot interpret
-- committed limited outcomes and must fail closed until the new code is deployed.
create or replace function public.validation_submit_public_survey(p_token_hash text,p_idempotency_key text,p_payload_hash text,p_answers jsonb)
returns jsonb language sql set search_path=public,pg_temp as $$
 select public.validation_submit_public_survey(p_token_hash,p_idempotency_key,p_payload_hash,p_answers,
 encode(sha256(convert_to(p_token_hash||':unknown','UTF8')),'hex'));
$$;
revoke execute on function public.validation_submit_public_survey(text,text,text,jsonb) from service_role;

create or replace function public.validation_landing_public(p_token_hash text,p_action text,p_visitor_hash text default null,p_request_id uuid default null,p_email text default null,p_consent boolean default false,p_network_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare pub public.validation_landing_publications; p public.validation_landing_pages; v public.validation_experiment_versions; n integer; inserted integer;
begin
 select * into pub from public.validation_landing_publications where token_hash=p_token_hash;
 if not found then raise no_data_found; end if;
 select * into p from public.validation_landing_pages where id=pub.page_id;
 select * into v from public.validation_experiment_versions where id=p.experiment_version_id and owner_id=p.owner_id and family='landing_waitlist' and lifecycle='running' for share;
 if not found then raise no_data_found; end if;
 perform 1 from public.validation_landing_pages where id=p.id for share;
 select * into pub from public.validation_landing_publications where id=pub.id and revoked_at is null for share;
 if not found then raise no_data_found; end if;
 if p_action='resolve' then
  return jsonb_build_object('template',pub.content->'template','headline',pub.content->'headline','description',pub.content->'description','benefits',pub.content->'benefits','cta',pub.content->'cta','visual',pub.content->'visual','consent',pub.content->'consent');
 end if;
 if p_action is null or p_action not in ('view','submit') or p_visitor_hash is null or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request'; end if;
 -- Serialize all publications of this exact experiment version, including cumulative checks.
 perform pg_advisory_xact_lock(hashtextextended(p.experiment_version_id::text,737));
 insert into public.validation_collection_usage(method,experiment_version_id) values('landing',p.experiment_version_id) on conflict do nothing;
 -- Prune even when the outcome will be limited. Aggregate admission precedes network allocation.
 delete from public.validation_landing_rate_buckets where publication_id=pub.id and minute<date_trunc('minute',clock_timestamp())-interval '1 day';
 insert into public.validation_landing_rate_buckets values(pub.id,'global',date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_landing_rate_buckets.attempts+1,601) returning attempts into n;
 if n>600 then return jsonb_build_object('limited',true); end if;
 insert into public.validation_landing_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_landing_rate_buckets.attempts+1,21) returning attempts into n;
 if n>20 then return jsonb_build_object('limited',true); end if;
 if p_action='view' then
  if p_request_id is null then raise exception 'request id required'; end if;
 if not exists(select 1 from public.validation_landing_views where publication_id=pub.id and request_id=p_request_id) and (select events from public.validation_collection_usage where method='landing' and experiment_version_id=p.experiment_version_id)>=10000 then return jsonb_build_object('capacity',true); end if;
  insert into public.validation_landing_views(publication_id,page_id,owner_id,request_id,visitor_hash) values(pub.id,p.id,p.owner_id,p_request_id,p_visitor_hash) on conflict do nothing;
 get diagnostics inserted = row_count;
 update public.validation_collection_usage set events=events+inserted where method='landing' and experiment_version_id=p.experiment_version_id;
 else
  if p_consent is distinct from true or p_email is null then raise exception 'explicit consent required'; end if;
  -- Only a browser with a recorded view can convert; contacts remain separately counted.
  if not exists(select 1 from public.validation_landing_views where page_id=p.id and visitor_hash=p_visitor_hash) then raise exception 'view required'; end if;
 if not exists(select 1 from public.validation_landing_submissions where page_id=p.id and email=p_email) and (select submissions from public.validation_collection_usage where method='landing' and experiment_version_id=p.experiment_version_id)>=1000 then return jsonb_build_object('capacity',true); end if;
  insert into public.validation_landing_submissions(publication_id,page_id,owner_id,email,visitor_hash,consent_text)
  values(pub.id,p.id,p.owner_id,p_email,p_visitor_hash,pub.content->>'consent') on conflict(page_id,email) do nothing;
 get diagnostics inserted = row_count;
 update public.validation_collection_usage set submissions=submissions+inserted where method='landing' and experiment_version_id=p.experiment_version_id;
 end if;
 -- Same response for first submission and duplicate: never disclose email membership.
 return jsonb_build_object('accepted',true);
end $$;

create or replace function public.validation_prototype_public(p_token_hash text,p_action text,p_visitor_hash text default null,p_request_id uuid default null,p_payload jsonb default null,p_consent boolean default false,p_network_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare pub public.validation_prototype_publications; p public.validation_prototype_pages; v public.validation_experiment_versions; n integer; inserted integer; prior jsonb; sc jsonb;
begin
 select * into pub from public.validation_prototype_publications where token_hash=p_token_hash;
 if not found then raise no_data_found; end if;
 select * into p from public.validation_prototype_pages where id=pub.page_id;
 select * into v from public.validation_experiment_versions where id=p.experiment_version_id and owner_id=p.owner_id and family='interactive_prototype' and lifecycle='running' for share;
 if not found then raise no_data_found; end if;
 perform 1 from public.validation_prototype_pages where id=p.id and not removed for share;
 if not found then raise no_data_found; end if;
 select * into pub from public.validation_prototype_publications where id=pub.id and revoked_at is null for share;
 if not found then raise no_data_found; end if;
 if p_action='resolve' then
  return jsonb_build_object('title',pub.content->'title','purpose',pub.content->'purpose','screens',pub.content->'screens','consent',pub.content->'consent');
 end if;
 if p_action is null or p_action not in ('event','submit') or p_visitor_hash is null or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request'; end if;
 -- Serialize all publications of this exact experiment version, including cumulative checks.
 perform pg_advisory_xact_lock(hashtextextended(p.experiment_version_id::text,737));
 insert into public.validation_collection_usage(method,experiment_version_id) values('prototype',p.experiment_version_id) on conflict do nothing;
 -- Prune even when the outcome will be limited. Aggregate admission precedes network allocation.
 delete from public.validation_prototype_rate_buckets where publication_id=pub.id and minute<date_trunc('minute',clock_timestamp())-interval '1 day';
 insert into public.validation_prototype_rate_buckets values(pub.id,'global',date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_prototype_rate_buckets.attempts+1,601) returning attempts into n;
 if n>600 then return jsonb_build_object('limited',true); end if;
 insert into public.validation_prototype_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_prototype_rate_buckets.attempts+1,61) returning attempts into n;
 if n>60 then return jsonb_build_object('limited',true); end if;
 if p_consent is distinct from true or p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_visitor_hash !~ '^[a-f0-9]{64}$' then raise exception 'explicit consent and bounded request required'; end if;
 if p_action='event' then
  select x into sc from jsonb_array_elements(pub.content->'screens') x where x->>'id'=p_payload->>'screen';
  if sc is null then raise exception 'unknown screen'; end if;
  if p_payload->>'target' is not null and not exists(select 1 from jsonb_array_elements(sc->'actions') a where a->>'target'=p_payload->>'target') then raise exception 'invalid navigation'; end if;
  -- Entry events are admitted only at the first screen. Subsequent views require an admitted edge.
  if p_payload->>'target' is null and p_payload->>'screen' <> pub.content->'screens'->0->>'id' and not exists(select 1 from public.validation_prototype_views where publication_id=pub.id and visitor_hash=p_visitor_hash and target=p_payload->>'screen') then raise exception 'navigation required'; end if;
  if p_payload->>'target' is not null and not exists(select 1 from public.validation_prototype_views where publication_id=pub.id and visitor_hash=p_visitor_hash and screen=p_payload->>'screen' and target is null) then raise exception 'screen view required'; end if;
 if not exists(select 1 from public.validation_prototype_views where publication_id=pub.id and request_id=p_request_id) and (select events from public.validation_collection_usage where method='prototype' and experiment_version_id=p.experiment_version_id)>=10000 then return jsonb_build_object('capacity',true); end if;
  insert into public.validation_prototype_views(publication_id,page_id,owner_id,request_id,visitor_hash,screen,target) values(pub.id,p.id,p.owner_id,p_request_id,p_visitor_hash,p_payload->>'screen',p_payload->>'target') on conflict do nothing;
 get diagnostics inserted = row_count;
 update public.validation_collection_usage set events=events+inserted where method='prototype' and experiment_version_id=p.experiment_version_id;
 else
  if jsonb_typeof(p_payload->'comment') is distinct from 'string' or length(trim(p_payload->>'comment')) not between 1 and 2000 or p_payload->>'outcome' is null or p_payload->>'outcome' not in ('yes','partly','no') or p_payload->>'consent' is distinct from 'I agree to share my anonymous navigation activity and feedback with the prototype creator for idea validation. I will not include personal or sensitive information.' or octet_length(p_payload::text)>10000 then raise exception 'invalid feedback'; end if;
  if not exists(select 1 from public.validation_prototype_views where publication_id=pub.id and visitor_hash=p_visitor_hash) then raise exception 'view required'; end if;
  select payload into prior from public.validation_prototype_submissions where publication_id=pub.id and visitor_hash=p_visitor_hash;
  if found and prior is distinct from p_payload then raise unique_violation using message='feedback conflict'; end if;
 if not exists(select 1 from public.validation_prototype_submissions where publication_id=pub.id and visitor_hash=p_visitor_hash) and (select submissions from public.validation_collection_usage where method='prototype' and experiment_version_id=p.experiment_version_id)>=1000 then return jsonb_build_object('capacity',true); end if;
  insert into public.validation_prototype_submissions(publication_id,page_id,owner_id,request_id,visitor_hash,payload,consent_text)
  values(pub.id,p.id,p.owner_id,p_request_id,p_visitor_hash,p_payload,pub.content->>'consent') on conflict(publication_id,visitor_hash) do nothing;
 get diagnostics inserted = row_count;
 update public.validation_collection_usage set submissions=submissions+inserted where method='prototype' and experiment_version_id=p.experiment_version_id;
  -- Concurrent retries must preserve the first payload too.
  select payload into prior from public.validation_prototype_submissions where publication_id=pub.id and visitor_hash=p_visitor_hash;
  if prior is distinct from p_payload then raise unique_violation using message='feedback conflict'; end if;
 end if;
 -- Stable response for identical retries; no participant or internal row IDs exposed.
 return jsonb_build_object('accepted',true);
end $$;


-- Preserve the existing shared resolve/submit per-network budget without process-local state.
create function public.validation_admit_public_survey_resolution(p_token_hash text,p_network_hash text)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare pub public.validation_survey_publications;experiment public.validation_experiment_versions;n integer;
begin
 select * into pub from public.validation_survey_publications where token_hash=p_token_hash and state='published' for share;
 if not found then raise exception 'survey unavailable' using errcode='P0002';end if;
 select * into experiment from public.validation_experiment_versions
 where id=pub.experiment_version_id and experiment_id=pub.experiment_id and hypothesis_version_id=pub.hypothesis_version_id and
       hypothesis_id=pub.hypothesis_id and subject_id=pub.subject_id and owner_id=pub.owner_id and family='survey' and lifecycle='running'
 for share;
 if not found then raise exception 'survey unavailable' using errcode='P0002';end if;
 if p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid network hash' using errcode='23514'; end if;
 -- Serialize all publications of this exact experiment version, including cumulative checks.
 perform pg_advisory_xact_lock(hashtextextended(pub.experiment_version_id::text,737));
 insert into public.validation_collection_usage(method,experiment_version_id) values('survey',pub.experiment_version_id) on conflict do nothing;
 -- Prune even when the outcome will be limited. Aggregate admission precedes network allocation.
 delete from public.validation_survey_rate_buckets where publication_id=pub.id and minute<date_trunc('minute',clock_timestamp())-interval '1 day';
 insert into public.validation_survey_rate_buckets values(pub.id,'global',date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_survey_rate_buckets.attempts+1,601) returning attempts into n;
 if n>600 then return jsonb_build_object('limited',true); end if;
 insert into public.validation_survey_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_survey_rate_buckets.attempts+1,11) returning attempts into n;
 if n>10 then return jsonb_build_object('limited',true); end if;
 return jsonb_build_object('admitted',true);
end $$;
revoke all on function public.validation_admit_public_survey_resolution(text,text) from public,anon,authenticated;
grant execute on function public.validation_admit_public_survey_resolution(text,text) to service_role;

notify pgrst, 'reload schema';

commit;
