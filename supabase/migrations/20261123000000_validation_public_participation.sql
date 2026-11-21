begin;

-- Existing links close at the migration transaction's start. Adding a column
-- with a stable default preserves legacy rows without rewriting their history.
-- The second default applies only to new publications (30 elapsed days).

alter table public.validation_survey_publications
  add column expires_at timestamptz not null default transaction_timestamp();
alter table public.validation_survey_publications
  alter column expires_at set default (clock_timestamp() + interval '720 hours');

alter table public.validation_landing_publications
  add column expires_at timestamptz not null default transaction_timestamp();
alter table public.validation_landing_publications
  alter column expires_at set default (clock_timestamp() + interval '720 hours');

alter table public.validation_prototype_publications
  add column expires_at timestamptz not null default transaction_timestamp();
alter table public.validation_prototype_publications
  alter column expires_at set default (clock_timestamp() + interval '720 hours');

alter table public.validation_external_mvp_publications
  add column expires_at timestamptz not null default transaction_timestamp();
alter table public.validation_external_mvp_publications
  alter column expires_at set default (clock_timestamp() + interval '720 hours');

alter table public.validation_commercial_intent_publications
  add column expires_at timestamptz not null default transaction_timestamp();
alter table public.validation_commercial_intent_publications
  alter column expires_at set default (clock_timestamp() + interval '720 hours');

-- submitted_at records the receipt time for new responses. NULL version
-- means a historical response for which affirmative consent was not recorded.
alter table public.validation_survey_submissions add column consent_notice_version text;

-- The pre-consent service RPC must fail closed on older application artifacts.
revoke execute on function public.validation_submit_public_survey(text,text,text,jsonb,text) from service_role;

create function public.validation_submit_public_survey(p_token_hash text,p_idempotency_key text,p_payload_hash text,p_answers jsonb,p_network_hash text,p_consent_notice_version text) returns jsonb language plpgsql set search_path=public as $$
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
 if pub.expires_at<=clock_timestamp() then raise exception 'survey unavailable' using errcode='P0002'; end if;
 insert into public.validation_collection_usage(method,experiment_version_id) values('survey',pub.experiment_version_id) on conflict do nothing;
 -- Prune even when the outcome will be limited. Aggregate admission precedes network allocation.
 delete from public.validation_survey_rate_buckets where publication_id=pub.id and minute<date_trunc('minute',clock_timestamp())-interval '1 day';
 insert into public.validation_survey_rate_buckets values(pub.id,'global',date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_survey_rate_buckets.attempts+1,601) returning attempts into n;
 if n>600 then return jsonb_build_object('limited',true); end if;
 insert into public.validation_survey_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=least(validation_survey_rate_buckets.attempts+1,11) returning attempts into n;
 if n>10 then return jsonb_build_object('limited',true); end if;
 if p_consent_notice_version is distinct from 'survey-participation-v1' then return jsonb_build_object('rejected',true); end if;
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
 insert into public.validation_survey_submissions(owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,survey_plan_version_id,publication_id,idempotency_key,payload_hash,consent_notice_version,submitted_at)
 values(pub.owner_id,pub.subject_id,pub.experiment_id,pub.experiment_version_id,pub.hypothesis_id,pub.hypothesis_version_id,pub.survey_plan_version_id,pub.id,p_idempotency_key,p_payload_hash,p_consent_notice_version,clock_timestamp())
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

revoke all on function public.validation_submit_public_survey(text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.validation_submit_public_survey(text,text,text,jsonb,text,text) to service_role;

create or replace function public.validation_admit_public_survey_resolution(p_token_hash text,p_network_hash text)
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
 if pub.expires_at<=clock_timestamp() then raise exception 'survey unavailable' using errcode='P0002'; end if;
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

-- Preserve existing RPC signatures, grants, lock order and admission accounting.

create or replace function public.validation_landing_owner(p_owner_id uuid,p_version_id uuid,p_action text,p_content jsonb default null,p_revision integer default null,p_token_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v public.validation_experiment_versions; p public.validation_landing_pages; result jsonb; pub uuid;
begin
 -- Same lock order for owner and public commands: version, page, publication.
 select * into v from public.validation_experiment_versions where id=p_version_id and owner_id=p_owner_id and family='landing_waitlist' for share;
 if not found then raise no_data_found; end if;
 if p_action is null or p_action not in ('read','save','publish','unpublish','remove') then raise exception 'invalid action'; end if;
 -- Serialize first creation and revisions without changing the immutable experiment.
 perform pg_advisory_xact_lock(hashtextextended(p_version_id::text,719));
 select * into p from public.validation_landing_pages where experiment_version_id=v.id and owner_id=p_owner_id for update;
 if p_action='save' then
  if v.lifecycle not in ('draft','ready','running','paused') then raise exception 'terminal experiment'; end if;
  if p_content is null or jsonb_typeof(p_content)<>'object' or octet_length(p_content::text)>12000
   or not (p_content ?& array['template','headline','description','benefits','cta','visual','minimumVisitors','targetRate','consent'])
   or jsonb_typeof(p_content->'headline') is distinct from 'string'
   or jsonb_typeof(p_content->'description') is distinct from 'string'
   or jsonb_typeof(p_content->'cta') is distinct from 'string'
   or jsonb_typeof(p_content->'minimumVisitors') is distinct from 'number'
   or jsonb_typeof(p_content->'targetRate') is distinct from 'number'
   or p_content->>'visual' not in ('','✦','◎','↗')
   or exists(select 1 from jsonb_array_elements(p_content->'benefits') b where jsonb_typeof(b)<>'string' or length(b#>>'{}') not between 1 and 200)
   or p_content->>'template' not in ('spotlight','benefits','minimal')
   or length(coalesce(p_content->>'headline','')) not between 1 and 180
   or length(coalesce(p_content->>'description','')) not between 1 and 1500
   or length(coalesce(p_content->>'cta','')) not between 1 and 60
   or jsonb_typeof(p_content->'benefits') is distinct from 'array' or jsonb_array_length(p_content->'benefits')>5
   or (p_content->>'minimumVisitors')::integer not between 20 and 100000
   or (p_content->>'targetRate')::numeric not between 1 and 100
   or p_content->>'consent' is distinct from 'I agree to share my email with the page creator for updates about this idea. I can request removal at any time.'
   then raise exception 'invalid content'; end if;
  if p.id is null then
   if p_revision is distinct from 0 then raise exception 'revision conflict'; end if;
   insert into public.validation_landing_pages(owner_id,experiment_version_id,content) values(p_owner_id,v.id,p_content) returning * into p;
  else
   if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
   update public.validation_landing_pages set content=p_content,revision=revision+1,updated_at=now() where id=p.id returning * into p;
  end if;
 elsif p_action='remove' then
  if p.id is null then raise no_data_found; end if;
  delete from public.validation_landing_submissions where id=(p_content->>'submissionId')::uuid and page_id=p.id and owner_id=p_owner_id;
 elsif p_action in ('publish','unpublish') then
  if p.id is null then raise no_data_found; end if;
  if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
  if p_action='publish' and (v.lifecycle<>'running' or p_token_hash is null) then raise exception 'not running'; end if;
  update public.validation_landing_publications set revoked_at=clock_timestamp() where page_id=p.id and revoked_at is null;
  if p_action='publish' then
   insert into public.validation_landing_publications(page_id,owner_id,revision,content,token_hash) values(p.id,p_owner_id,p.revision,p.content,p_token_hash) returning id into pub;
  end if;
 end if;
 select jsonb_build_object('page',case when p.id is null then null else jsonb_build_object('id',p.id,'revision',p.revision,'content',p.content) end,
 'publication',(select jsonb_build_object('id',id,'revision',revision,'publishedAt',published_at,'expiresAt',expires_at) from public.validation_landing_publications where page_id=p.id and revoked_at is null),
 'metrics',jsonb_build_object('views',(select count(*) from public.validation_landing_views where page_id=p.id),
 'visitors',(select count(distinct visitor_hash) from public.validation_landing_views where page_id=p.id),
 'submissions',(select count(*) from public.validation_landing_submissions where page_id=p.id),
 'convertedVisitors',(select count(distinct s.visitor_hash) from public.validation_landing_submissions s where s.page_id=p.id and exists(select 1 from public.validation_landing_views w where w.page_id=p.id and w.visitor_hash=s.visitor_hash))),
 'submissions',coalesce((select jsonb_agg(x) from (select id,email,consent_text,submitted_at from public.validation_landing_submissions where page_id=p.id order by submitted_at desc limit 100) x),'[]'::jsonb)) into result;
 return result;
end $$;

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
 if pub.expires_at<=clock_timestamp() then raise no_data_found; end if;
 if p_action='resolve' then
  return jsonb_build_object('template',pub.content->'template','headline',pub.content->'headline','description',pub.content->'description','benefits',pub.content->'benefits','cta',pub.content->'cta','visual',pub.content->'visual','consent',pub.content->'consent');
 end if;
 if p_action is null or p_action not in ('view','submit') or p_visitor_hash is null or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request'; end if;
 -- Serialize all publications of this exact experiment version, including cumulative checks.
 perform pg_advisory_xact_lock(hashtextextended(p.experiment_version_id::text,737));
 if pub.expires_at<=clock_timestamp() then raise no_data_found; end if;
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

create or replace function public.validation_prototype_owner(p_owner_id uuid,p_version_id uuid,p_action text,p_content jsonb default null,p_revision integer default null,p_token_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v public.validation_experiment_versions; p public.validation_prototype_pages; result jsonb; pub uuid;
begin
 -- Same lock order for owner and public commands: version, page, publication.
 select * into v from public.validation_experiment_versions where id=p_version_id and owner_id=p_owner_id and family='interactive_prototype' for share;
 if not found then raise no_data_found; end if;
 if p_action is null or p_action not in ('read','save','publish','unpublish','remove') then raise exception 'invalid action'; end if;
 -- Serialize first creation and revisions without changing the immutable experiment.
 perform pg_advisory_xact_lock(hashtextextended(p_version_id::text,719));
 select * into p from public.validation_prototype_pages where experiment_version_id=v.id and owner_id=p_owner_id for update;
 if p_action='save' then
  if v.lifecycle not in ('draft','ready','running','paused') then raise exception 'terminal experiment'; end if;
  perform public.validation_prototype_validate_content(p_content);
  if p.id is null then
   if p_revision is distinct from 0 then raise exception 'revision conflict'; end if;
   insert into public.validation_prototype_pages(owner_id,experiment_version_id,content) values(p_owner_id,v.id,p_content) returning * into p;
  else
   if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
   update public.validation_prototype_pages set content=p_content,removed=false,revision=revision+1,updated_at=now() where id=p.id returning * into p;
  end if;
 elsif p_action='remove' then
  if p.id is null then raise no_data_found; end if;
  if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
  update public.validation_prototype_publications set revoked_at=clock_timestamp() where page_id=p.id and revoked_at is null;
  update public.validation_prototype_pages set removed=true,revision=revision+1,updated_at=now() where id=p.id returning * into p;
 elsif p_action in ('publish','unpublish') then
  if p.id is null then raise no_data_found; end if;
  if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
  if p_action='publish' and (v.lifecycle<>'running' or p.removed or p_token_hash is null) then raise exception 'not running'; end if;
  update public.validation_prototype_publications set revoked_at=clock_timestamp() where page_id=p.id and revoked_at is null;
  if p_action='publish' then
   insert into public.validation_prototype_publications(page_id,owner_id,revision,content,token_hash) values(p.id,p_owner_id,p.revision,p.content,p_token_hash) returning id into pub;
  end if;
 end if;
 select jsonb_build_object('page',case when p.id is null then null else jsonb_build_object('id',p.id,'revision',p.revision,'content',p.content,'removed',p.removed) end,
 'publication',(select jsonb_build_object('id',id,'revision',revision,'publishedAt',published_at,'expiresAt',expires_at) from public.validation_prototype_publications where page_id=p.id and revoked_at is null),
 'metrics',jsonb_build_object('events',(select count(*) from public.validation_prototype_views where page_id=p.id),
 'browsers',(select count(distinct visitor_hash) from public.validation_prototype_views where page_id=p.id),
 'submissions',(select count(*) from public.validation_prototype_submissions where page_id=p.id),
 'screens',coalesce((select jsonb_agg(x) from (select screen,count(*) from public.validation_prototype_views where page_id=p.id and target is null group by screen) x),'[]'::jsonb),
 'outcomes',coalesce((select jsonb_agg(x) from (select payload->>'outcome' as outcome,count(*) from public.validation_prototype_submissions where page_id=p.id group by payload->>'outcome') x),'[]'::jsonb)),
 'submissions',coalesce((select jsonb_agg(x) from (select s.id,u.revision,s.payload->>'outcome' as outcome,s.payload->>'comment' as comment,s.submitted_at from public.validation_prototype_submissions s join public.validation_prototype_publications u on u.id=s.publication_id where s.page_id=p.id order by s.submitted_at desc limit 100) x),'[]'::jsonb)) into result;
 return result;
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
 if pub.expires_at<=clock_timestamp() then raise no_data_found; end if;
 if p_action='resolve' then
  return jsonb_build_object('title',pub.content->'title','purpose',pub.content->'purpose','screens',pub.content->'screens','consent',pub.content->'consent');
 end if;
 if p_action is null or p_action not in ('event','submit') or p_visitor_hash is null or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request'; end if;
 -- Serialize all publications of this exact experiment version, including cumulative checks.
 perform pg_advisory_xact_lock(hashtextextended(p.experiment_version_id::text,737));
 if pub.expires_at<=clock_timestamp() then raise no_data_found; end if;
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

create or replace function public.validation_external_mvp_owner(p_owner_id uuid,p_version_id uuid,p_action text,p_content jsonb default null,p_revision integer default null,p_token_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v public.validation_experiment_versions; p public.validation_external_mvp_pages; result jsonb; pub uuid;
begin
 -- Same lock order for owner and public commands: version, page, publication.
 select * into v from public.validation_experiment_versions where id=p_version_id and owner_id=p_owner_id and family='external_mvp' for share;
 if not found then raise no_data_found; end if;
 if p_action is null or p_action not in ('read','save','publish','unpublish','remove') then raise exception 'invalid action'; end if;
 -- Serialize first creation and revisions without changing the immutable experiment.
 perform pg_advisory_xact_lock(hashtextextended(p_version_id::text,719));
 select * into p from public.validation_external_mvp_pages where experiment_version_id=v.id and owner_id=p_owner_id for update;
 if p_action='save' then
  if v.lifecycle not in ('draft','ready','running','paused') then raise exception 'terminal experiment'; end if;
  perform public.validation_external_mvp_validate_content(p_content);
  if p.id is null then
   if p_revision is distinct from 0 then raise exception 'revision conflict'; end if;
   insert into public.validation_external_mvp_pages(owner_id,experiment_version_id,content) values(p_owner_id,v.id,p_content) returning * into p;
  else
   if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
   update public.validation_external_mvp_pages set content=p_content,revision=revision+1,updated_at=now() where id=p.id returning * into p;
  end if;
 elsif p_action='remove' then
  if p.id is null then raise no_data_found; end if;
  update public.validation_external_mvp_submissions set email=null,contact_removed=true
   where id=(p_content->>'submissionId')::uuid and page_id=p.id and owner_id=p_owner_id;
  if not found then raise no_data_found; end if;
 elsif p_action in ('publish','unpublish') then
  if p.id is null then raise no_data_found; end if;
  if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
  if p_action='publish' and (v.lifecycle<>'running' or p_token_hash is null) then raise exception 'not running'; end if;
  update public.validation_external_mvp_publications set revoked_at=clock_timestamp() where page_id=p.id and revoked_at is null;
  if p_action='publish' then
   insert into public.validation_external_mvp_publications(page_id,owner_id,revision,content,token_hash) values(p.id,p_owner_id,p.revision,p.content,p_token_hash) returning id into pub;
  end if;
 end if;
 select jsonb_build_object('page',case when p.id is null then null else jsonb_build_object('id',p.id,'revision',p.revision,'content',p.content) end,
 'publication',(select jsonb_build_object('id',id,'revision',revision,'publishedAt',published_at,'expiresAt',expires_at) from public.validation_external_mvp_publications where page_id=p.id and revoked_at is null),
 'metrics',jsonb_build_object(
 'submissions',(select count(*) from public.validation_external_mvp_submissions where page_id=p.id),
 'contacts',(select count(*) from public.validation_external_mvp_submissions where page_id=p.id and email is not null),
 'outcomes',coalesce((select jsonb_agg(x) from (select payload->>'outcome' as outcome,count(*) from public.validation_external_mvp_submissions where page_id=p.id group by payload->>'outcome') x),'[]'::jsonb)),
 'submissions',coalesce((select jsonb_agg(x) from (select s.id,u.revision,s.payload->>'outcome' as outcome,
 (select jsonb_agg(jsonb_build_object('question',q.value,'answer',s.payload->'answers'->(q.ordinality::integer-1))) from jsonb_array_elements(u.content->'questions') with ordinality q) as answers,
 s.email,s.submitted_at from public.validation_external_mvp_submissions s join public.validation_external_mvp_publications u on u.id=s.publication_id where s.page_id=p.id order by s.submitted_at desc limit 100) x),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.validation_external_mvp_public(p_token_hash text,p_action text,p_request_id uuid default null,p_payload jsonb default null,p_consent boolean default false,p_network_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare pub public.validation_external_mvp_publications; p public.validation_external_mvp_pages; v public.validation_experiment_versions; n integer; prior public.validation_external_mvp_submissions; feedback jsonb; email_value text;
begin
 select * into pub from public.validation_external_mvp_publications where token_hash=p_token_hash;
 if not found then raise no_data_found; end if;
 select * into p from public.validation_external_mvp_pages where id=pub.page_id;
 select * into v from public.validation_experiment_versions where id=p.experiment_version_id and owner_id=p.owner_id and family='external_mvp' and lifecycle='running' for share;
 if not found then raise no_data_found; end if;
 perform 1 from public.validation_external_mvp_pages where id=p.id for share;
 -- Serialize public admissions for exact capacity/idempotency and lifecycle races.
 select * into pub from public.validation_external_mvp_publications where id=pub.id and revoked_at is null for update;
 if not found then raise no_data_found; end if;
 if pub.expires_at<=clock_timestamp() then raise no_data_found; end if;
 if p_action is null or p_action not in ('resolve','submit') or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request'; end if;
 -- Global per-publication budget also bounds distributed/rotating-IP abuse.
 insert into public.validation_external_mvp_rate_buckets values(pub.id,'global',date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=validation_external_mvp_rate_buckets.attempts+1 returning attempts into n;
 if n>600 then return jsonb_build_object('limited',true); end if;
 insert into public.validation_external_mvp_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=validation_external_mvp_rate_buckets.attempts+1 returning attempts into n;
 if n>60 then return jsonb_build_object('limited',true); end if;
 delete from public.validation_external_mvp_rate_buckets where publication_id=pub.id and minute<now()-interval '1 day';
 if p_action='resolve' then
  return jsonb_build_object('title',pub.content->'title','purpose',pub.content->'purpose','url',pub.content->'url','instructions',pub.content->'instructions','questions',pub.content->'questions','consent',pub.content->'consent');
 end if;
 if p_consent is distinct from true or p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>44000
 or p_payload->>'consent' is distinct from 'I agree to share my feedback privately with the experiment creator for product research. I will not include personal or sensitive information in my answers.'
 or p_payload->>'outcome' is null or p_payload->>'outcome' not in ('yes','partly','no','not_tried')
 or jsonb_typeof(p_payload->'answers') is distinct from 'array' then raise exception 'invalid feedback'; end if;
 if jsonb_array_length(p_payload->'answers')<>jsonb_array_length(pub.content->'questions') or exists(select 1 from jsonb_array_elements(p_payload->'answers') a where jsonb_typeof(a)<>'string' or length(trim(a#>>'{}')) not between 1 and 2000) then raise exception 'answer limits'; end if;
 email_value:=p_payload->>'email';
 if email_value is not null and (length(email_value) not between 3 and 254 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_payload->>'contactConsent' is distinct from 'I agree to share my email with the creator for follow-up about this test. I can ask the creator to remove it through the channel that supplied this link.') then raise exception 'contact consent'; end if;
 feedback:=jsonb_build_object('outcome',p_payload->'outcome','answers',p_payload->'answers');
 select * into prior from public.validation_external_mvp_submissions where publication_id=pub.id and request_id=p_request_id;
 if found then
  if prior.payload is distinct from feedback or (not prior.contact_removed and prior.email is distinct from email_value) then raise unique_violation using message='feedback conflict'; end if;
  return jsonb_build_object('accepted',true);
 end if;
 if (select count(*) from public.validation_external_mvp_submissions where page_id=p.id)>=1000 then return jsonb_build_object('capacity',true); end if;
 insert into public.validation_external_mvp_submissions(publication_id,page_id,owner_id,request_id,payload,email,consent_text,contact_consent_text)
 values(pub.id,p.id,p.owner_id,p_request_id,feedback,email_value,pub.content->>'consent',case when email_value is null then null else 'I agree to share my email with the creator for follow-up about this test. I can ask the creator to remove it through the channel that supplied this link.' end);
 return jsonb_build_object('accepted',true);
end $$;

create or replace function public.validation_commercial_intent_owner(p_owner_id uuid,p_version_id uuid,p_action text,p_content jsonb default null,p_revision integer default null,p_token_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v public.validation_experiment_versions; p public.validation_commercial_intent_pages; result jsonb; pub uuid;
begin
 -- Same lock order for owner and public commands: version, page, publication.
 select * into v from public.validation_experiment_versions where id=p_version_id and owner_id=p_owner_id and family='commercial_intent' for share;
 if not found then raise no_data_found; end if;
 if p_action is null or p_action not in ('read','save','publish','unpublish','remove') then raise exception 'invalid action'; end if;
 -- Serialize first creation and revisions without changing the immutable experiment.
 perform pg_advisory_xact_lock(hashtextextended(p_version_id::text,719));
 select * into p from public.validation_commercial_intent_pages where experiment_version_id=v.id and owner_id=p_owner_id for update;
 if p_action='save' then
  if v.lifecycle not in ('draft','ready','running','paused') then raise exception 'terminal experiment'; end if;
  perform public.validation_commercial_intent_validate_content(p_content);
  if p.id is null then
   if p_revision is distinct from 0 then raise exception 'revision conflict'; end if;
   insert into public.validation_commercial_intent_pages(owner_id,experiment_version_id,content) values(p_owner_id,v.id,p_content) returning * into p;
  else
   if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
   update public.validation_commercial_intent_pages set content=p_content,revision=revision+1,updated_at=now() where id=p.id returning * into p;
  end if;
 elsif p_action='remove' then
  if p.id is null then raise no_data_found; end if;
  update public.validation_commercial_intent_submissions set email=null,contact_removed=true
   where id=(p_content->>'submissionId')::uuid and page_id=p.id and owner_id=p_owner_id;
  if not found then raise no_data_found; end if;
 elsif p_action in ('publish','unpublish') then
  if p.id is null then raise no_data_found; end if;
  if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
  if p_action='publish' and (v.lifecycle<>'running' or p_token_hash is null) then raise exception 'not running'; end if;
  update public.validation_commercial_intent_publications set revoked_at=clock_timestamp() where page_id=p.id and revoked_at is null;
  if p_action='publish' then
   insert into public.validation_commercial_intent_publications(page_id,owner_id,revision,content,token_hash) values(p.id,p_owner_id,p.revision,p.content,p_token_hash) returning id into pub;
  end if;
 end if;
 select jsonb_build_object('publicationState',case when exists(select 1 from public.validation_commercial_intent_publications where page_id=p.id and revoked_at is null) then 'published' when exists(select 1 from public.validation_commercial_intent_publications where page_id=p.id) then 'unpublished' else 'draft' end,'page',case when p.id is null then null else jsonb_build_object('id',p.id,'revision',p.revision,'content',p.content) end,
 'publication',(select jsonb_build_object('id',id,'revision',revision,'publishedAt',published_at,'expiresAt',expires_at) from public.validation_commercial_intent_publications where page_id=p.id and revoked_at is null),
 'metrics',jsonb_build_object(
 'views',(select count(*) from public.validation_commercial_intent_views where page_id=p.id),
 'submissions',(select count(*) from public.validation_commercial_intent_submissions where page_id=p.id),
 'contacts',(select count(*) from public.validation_commercial_intent_submissions where page_id=p.id and email is not null),
 'outcomes',coalesce((select jsonb_agg(x) from (select case when s.payload->>'outcome'='interested' then u.content->>'objective' else 'not_now' end as outcome,count(*) from public.validation_commercial_intent_submissions s join public.validation_commercial_intent_publications u on u.id=s.publication_id where s.page_id=p.id group by 1) x),'[]'::jsonb)),
 'submissions',coalesce((select jsonb_agg(x) from (select s.id,u.revision,u.content->>'objective' as objective,s.payload->>'outcome' as outcome,
 (select jsonb_agg(jsonb_build_object('question',q.value,'answer',s.payload->'answers'->(q.ordinality::integer-1))) from jsonb_array_elements(u.content->'questions') with ordinality q) as answers,
 s.email,s.submitted_at from public.validation_commercial_intent_submissions s join public.validation_commercial_intent_publications u on u.id=s.publication_id where s.page_id=p.id order by s.submitted_at desc limit 100) x),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.validation_commercial_intent_public(p_token_hash text,p_action text,p_request_id uuid default null,p_payload jsonb default null,p_consent boolean default false,p_network_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare pub public.validation_commercial_intent_publications; p public.validation_commercial_intent_pages; v public.validation_experiment_versions; n integer; prior public.validation_commercial_intent_submissions; feedback jsonb; email_value text;
begin
 select * into pub from public.validation_commercial_intent_publications where token_hash=p_token_hash;
 if not found then raise no_data_found; end if;
 select * into p from public.validation_commercial_intent_pages where id=pub.page_id;
 select * into v from public.validation_experiment_versions where id=p.experiment_version_id and owner_id=p.owner_id and family='commercial_intent' and lifecycle='running' for share;
 if not found then raise no_data_found; end if;
 perform 1 from public.validation_commercial_intent_pages where id=p.id for share;
 -- Serialize public admissions for exact capacity/idempotency and lifecycle races.
 select * into pub from public.validation_commercial_intent_publications where id=pub.id and revoked_at is null for update;
 if not found then raise no_data_found; end if;
 if pub.expires_at<=clock_timestamp() then raise no_data_found; end if;
 if p_action is null or p_action not in ('resolve','view','submit') or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request'; end if;
 -- Global per-publication budget also bounds distributed/rotating-IP abuse.
 insert into public.validation_commercial_intent_rate_buckets values(pub.id,'global',date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=validation_commercial_intent_rate_buckets.attempts+1 returning attempts into n;
 if n>600 then return jsonb_build_object('limited',true); end if;
 insert into public.validation_commercial_intent_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=validation_commercial_intent_rate_buckets.attempts+1 returning attempts into n;
 if n>60 then return jsonb_build_object('limited',true); end if;
 delete from public.validation_commercial_intent_rate_buckets where publication_id=pub.id and minute<now()-interval '1 day';
 if p_action='resolve' then
  return jsonb_build_object('title',pub.content->'title','purpose',pub.content->'purpose','objective',pub.content->'objective','instructions',pub.content->'instructions','questions',pub.content->'questions','consent',pub.content->'consent');
 end if;
 if p_action='view' then
  if p_request_id is null then raise exception 'request required'; end if;
  if exists(select 1 from public.validation_commercial_intent_views where publication_id=pub.id and request_id=p_request_id) then return jsonb_build_object('accepted',true); end if;
  if (select count(*) from public.validation_commercial_intent_views where page_id=p.id)>=10000 then return jsonb_build_object('capacity',true); end if;
  insert into public.validation_commercial_intent_views(publication_id,page_id,owner_id,request_id) values(pub.id,p.id,p.owner_id,p_request_id);
  return jsonb_build_object('accepted',true);
 end if;
 if p_consent is distinct from true or p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>44000
 or p_payload->>'consent' is distinct from 'I agree to share my response privately with the experiment creator for commercial research. This is a nonbinding expression only: no purchase, payment, reservation, subscription or financial commitment is created. I will not include personal or sensitive information in my answers.'
 or p_payload->>'outcome' is null or p_payload->>'outcome' not in ('interested','not_now')
 or jsonb_typeof(p_payload->'answers') is distinct from 'array' then raise exception 'invalid feedback'; end if;
 if jsonb_array_length(p_payload->'answers')<>jsonb_array_length(pub.content->'questions') or exists(select 1 from jsonb_array_elements(p_payload->'answers') a where jsonb_typeof(a)<>'string' or length(trim(a#>>'{}')) not between 1 and 2000) then raise exception 'answer limits'; end if;
 email_value:=p_payload->>'email';
 if email_value is not null and (length(email_value) not between 3 and 254 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_payload->>'contactConsent' is distinct from 'I agree to share my email with the creator for follow-up about this offer only. I can ask the creator to remove it through the channel that supplied this link.') then raise exception 'contact consent'; end if;
 feedback:=jsonb_build_object('outcome',p_payload->'outcome','answers',p_payload->'answers');
 select * into prior from public.validation_commercial_intent_submissions where publication_id=pub.id and request_id=p_request_id;
 if found then
  if prior.payload is distinct from feedback or (not prior.contact_removed and prior.email is distinct from email_value) then raise unique_violation using message='feedback conflict'; end if;
  return jsonb_build_object('accepted',true);
 end if;
 if (select count(*) from public.validation_commercial_intent_submissions where page_id=p.id)>=1000 then return jsonb_build_object('capacity',true); end if;
 insert into public.validation_commercial_intent_submissions(publication_id,page_id,owner_id,request_id,payload,email,consent_text,contact_consent_text)
 values(pub.id,p.id,p.owner_id,p_request_id,feedback,email_value,pub.content->>'consent',case when email_value is null then null else 'I agree to share my email with the creator for follow-up about this offer only. I can ask the creator to remove it through the channel that supplied this link.' end);
 return jsonb_build_object('accepted',true);
end $$;

notify pgrst, 'reload schema';

commit;
