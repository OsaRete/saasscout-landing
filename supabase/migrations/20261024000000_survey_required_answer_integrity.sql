-- Enforce non-blank values for required survey answers at the authoritative RPC boundary.
create or replace function public.validation_submit_public_survey(p_token_hash text,p_idempotency_key text,p_payload_hash text,p_answers jsonb) returns jsonb language plpgsql set search_path=public as $$
declare pub public.validation_survey_publications;experiment public.validation_experiment_versions;plan public.validation_survey_plan_versions;s public.validation_survey_submissions;existing public.validation_survey_submissions;a jsonb;q jsonb;answer_count integer;distinct_question_count integer;selected_count integer;distinct_selected_count integer;
begin
 select * into pub from public.validation_survey_publications where token_hash=p_token_hash and state='published' for share;
 if not found then raise exception 'survey unavailable' using errcode='P0002';end if;
 select * into experiment from public.validation_experiment_versions
 where id=pub.experiment_version_id and experiment_id=pub.experiment_id and hypothesis_version_id=pub.hypothesis_version_id and
       hypothesis_id=pub.hypothesis_id and subject_id=pub.subject_id and owner_id=pub.owner_id and family='survey' and lifecycle='running'
 for share;
 if not found then raise exception 'survey unavailable' using errcode='P0002';end if;
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
 return jsonb_build_object('submissionId',s.id,'duplicate',false);
end $$;
