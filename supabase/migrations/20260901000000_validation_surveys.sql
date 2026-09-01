-- PR V6: immutable Survey plans, revocable hashed publications, and raw human submissions.
create table public.validation_survey_plan_versions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, subject_id uuid not null, experiment_id uuid not null, experiment_version_id uuid not null,
 hypothesis_id uuid not null, hypothesis_version_id uuid not null, version_number integer not null check(version_number>0),
 title text not null check(length(btrim(title)) between 1 and 200), purpose text not null check(length(btrim(purpose)) between 1 and 1000), questions jsonb not null,
 supersedes_survey_plan_version_id uuid, created_at timestamptz not null default now(),
 constraint validation_survey_questions_bounded check(jsonb_typeof(questions)='array' and jsonb_array_length(questions) between 1 and 15 and pg_column_size(questions)<=65536),
 constraint validation_survey_plan_experiment_fk foreign key(experiment_version_id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id) references public.validation_experiment_versions(id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id) on delete restrict,
 unique(experiment_id,version_number),unique(id,owner_id),unique(id,experiment_version_id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id)
);
alter table public.validation_survey_plan_versions add constraint validation_survey_plan_supersedes_fk foreign key(supersedes_survey_plan_version_id,owner_id) references public.validation_survey_plan_versions(id,owner_id) on delete restrict;

create table public.validation_survey_publications (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, subject_id uuid not null, experiment_id uuid not null, experiment_version_id uuid not null,
 hypothesis_id uuid not null, hypothesis_version_id uuid not null, survey_plan_version_id uuid not null, token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),
 state text not null default 'published' check(state in('published','revoked')), published_at timestamptz not null default now(), revoked_at timestamptz,
 constraint validation_survey_publication_state_check check((state='published' and revoked_at is null) or(state='revoked' and revoked_at is not null)),
 constraint validation_survey_publication_plan_fk foreign key(survey_plan_version_id,experiment_version_id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id) references public.validation_survey_plan_versions(id,experiment_version_id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id) on delete restrict,
 unique(id,owner_id),unique(id,survey_plan_version_id,experiment_version_id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id)
);
create unique index validation_survey_one_active_publication on public.validation_survey_publications(experiment_id) where state='published';

create table public.validation_survey_submissions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, subject_id uuid not null, experiment_id uuid not null, experiment_version_id uuid not null,
 hypothesis_id uuid not null,hypothesis_version_id uuid not null,survey_plan_version_id uuid not null,publication_id uuid not null,respondent_id uuid not null default gen_random_uuid(),
 origin text not null default 'public_survey' check(origin='public_survey'), idempotency_key text not null check(length(idempotency_key) between 16 and 200),payload_hash text not null check(payload_hash~'^[0-9a-f]{64}$'),submitted_at timestamptz not null default now(),
 constraint validation_survey_submission_publication_fk foreign key(publication_id,survey_plan_version_id,experiment_version_id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id) references public.validation_survey_publications(id,survey_plan_version_id,experiment_version_id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id) on delete restrict,
 unique(publication_id,idempotency_key),unique(id,owner_id),unique(id,survey_plan_version_id,owner_id)
);
create table public.validation_survey_answers (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,submission_id uuid not null,survey_plan_version_id uuid not null,question_id text not null check(question_id~'^[A-Za-z0-9_-]{8,80}$'),question_type text not null check(question_type in('single_choice','multiple_choice','short_text','long_text','number')),raw_answer jsonb not null check(pg_column_size(raw_answer)<=8192),created_at timestamptz not null default now(),
 constraint validation_survey_answer_submission_fk foreign key(submission_id,survey_plan_version_id,owner_id) references public.validation_survey_submissions(id,survey_plan_version_id,owner_id) on delete restrict,unique(submission_id,question_id)
);

create function public.validation_protect_survey_history() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'survey history is immutable' using errcode='23514'; end $$;
create trigger validation_survey_plans_immutable before update or delete on public.validation_survey_plan_versions for each row execute function public.validation_protect_survey_history();
create trigger validation_survey_submissions_immutable before update or delete on public.validation_survey_submissions for each row execute function public.validation_protect_survey_history();
create trigger validation_survey_answers_immutable before update or delete on public.validation_survey_answers for each row execute function public.validation_protect_survey_history();
create function public.validation_guard_survey_publication() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception 'survey publication history is immutable' using errcode='23514';end if;
 if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id or new.subject_id is distinct from old.subject_id or
    new.experiment_id is distinct from old.experiment_id or new.experiment_version_id is distinct from old.experiment_version_id or
    new.hypothesis_id is distinct from old.hypothesis_id or new.hypothesis_version_id is distinct from old.hypothesis_version_id or
    new.survey_plan_version_id is distinct from old.survey_plan_version_id or new.token_hash is distinct from old.token_hash or
    new.published_at is distinct from old.published_at then raise exception 'publication lineage is immutable' using errcode='23514';end if;
 if old.state<>'published' or new.state<>'revoked' or old.revoked_at is not null or new.revoked_at is null then raise exception 'invalid publication transition' using errcode='23514';end if;
 return new;
end $$;
create trigger validation_survey_publication_guard before update or delete on public.validation_survey_publications for each row execute function public.validation_guard_survey_publication();

alter table public.validation_survey_plan_versions enable row level security;alter table public.validation_survey_publications enable row level security;alter table public.validation_survey_submissions enable row level security;alter table public.validation_survey_answers enable row level security;
create policy validation_survey_plans_owner_read on public.validation_survey_plan_versions for select to authenticated using(owner_id=(select auth.uid()));
create policy validation_survey_publications_owner_read on public.validation_survey_publications for select to authenticated using(owner_id=(select auth.uid()));
create policy validation_survey_submissions_owner_read on public.validation_survey_submissions for select to authenticated using(owner_id=(select auth.uid()));
create policy validation_survey_answers_owner_read on public.validation_survey_answers for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.validation_survey_plan_versions,public.validation_survey_publications,public.validation_survey_submissions,public.validation_survey_answers from public,anon,authenticated;
grant select on public.validation_survey_plan_versions,public.validation_survey_publications,public.validation_survey_submissions,public.validation_survey_answers to authenticated;
grant all on public.validation_survey_plan_versions,public.validation_survey_publications,public.validation_survey_submissions,public.validation_survey_answers to service_role;

create function public.validation_create_survey_plan(p_owner_id uuid,p_experiment_version_id uuid,p_title text,p_purpose text,p_questions jsonb,p_supersedes_survey_plan_version_id uuid default null) returns jsonb language plpgsql set search_path=public as $$
declare e public.validation_experiment_versions;root public.validation_experiments;p public.validation_survey_plan_versions;latest public.validation_survey_plan_versions;n integer;
begin
 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and owner_id=p_owner_id and family='survey';
 if not found then raise exception 'not found' using errcode='P0002';end if;
 -- Serialize version allocation and predecessor selection on the owned logical experiment root.
 select * into root from public.validation_experiments where id=e.experiment_id and owner_id=p_owner_id for update;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and experiment_id=root.id and owner_id=p_owner_id and family='survey' for update;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 if e.lifecycle in('completed','cancelled') then raise exception 'terminal experiment' using errcode='23514';end if;
 select * into latest from public.validation_survey_plan_versions where experiment_id=e.experiment_id and owner_id=p_owner_id order by version_number desc limit 1;
 if latest.id is null and p_supersedes_survey_plan_version_id is not null then raise exception 'first survey plan cannot have a predecessor' using errcode='23503';end if;
 if latest.id is not null and p_supersedes_survey_plan_version_id is distinct from latest.id then raise exception 'stale survey plan predecessor' using errcode='40001';end if;
 n:=coalesce(latest.version_number,0)+1;
 insert into public.validation_survey_plan_versions(owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,version_number,title,purpose,questions,supersedes_survey_plan_version_id)
 values(p_owner_id,e.subject_id,e.experiment_id,e.id,e.hypothesis_id,e.hypothesis_version_id,n,p_title,p_purpose,p_questions,p_supersedes_survey_plan_version_id) returning * into p;
 return to_jsonb(p)-'owner_id';
end $$;

create function public.validation_publish_survey(p_owner_id uuid,p_survey_plan_version_id uuid,p_token_hash text) returns jsonb language plpgsql set search_path=public as $$
declare candidate public.validation_survey_plan_versions;latest public.validation_survey_plan_versions;root public.validation_experiments;pub public.validation_survey_publications;
begin
 select * into candidate from public.validation_survey_plan_versions where id=p_survey_plan_version_id and owner_id=p_owner_id;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 -- Serialize revoke-and-replace publication on the same logical root used for plan allocation.
 select * into root from public.validation_experiments where id=candidate.experiment_id and owner_id=p_owner_id for update;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into candidate from public.validation_survey_plan_versions where id=p_survey_plan_version_id and experiment_id=root.id and owner_id=p_owner_id;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 select * into latest from public.validation_survey_plan_versions where experiment_id=root.id and owner_id=p_owner_id order by version_number desc limit 1;
 if latest.id is null or candidate.id is distinct from latest.id then raise exception 'stale survey plan cannot be published' using errcode='40001';end if;
 -- Creating a newer plan does not revoke this row; only this explicit publish command replaces it.
 update public.validation_survey_publications set state='revoked',revoked_at=clock_timestamp() where experiment_id=root.id and owner_id=p_owner_id and state='published';
 insert into public.validation_survey_publications(owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,survey_plan_version_id,token_hash)
 values(candidate.owner_id,candidate.subject_id,candidate.experiment_id,candidate.experiment_version_id,candidate.hypothesis_id,candidate.hypothesis_version_id,candidate.id,p_token_hash) returning * into pub;
 return to_jsonb(pub)-'owner_id'-'token_hash';
end $$;

create function public.validation_revoke_survey(p_owner_id uuid,p_publication_id uuid) returns jsonb language plpgsql set search_path=public as $$
declare pub public.validation_survey_publications;
begin
 -- UPDATE takes a row-exclusive lock. It waits behind an in-flight submission's FOR SHARE lock.
 update public.validation_survey_publications set state='revoked',revoked_at=clock_timestamp() where id=p_publication_id and owner_id=p_owner_id and state='published' returning * into pub;
 if not found then raise exception 'not found' using errcode='P0002';end if;
 return to_jsonb(pub)-'owner_id'-'token_hash';
end $$;

create function public.validation_submit_public_survey(p_token_hash text,p_idempotency_key text,p_payload_hash text,p_answers jsonb) returns jsonb language plpgsql set search_path=public as $$
declare pub public.validation_survey_publications;experiment public.validation_experiment_versions;plan public.validation_survey_plan_versions;s public.validation_survey_submissions;existing public.validation_survey_submissions;a jsonb;q jsonb;answer_count integer;distinct_question_count integer;selected_count integer;distinct_selected_count integer;
begin
 -- A shared publication-row lock admits an already-started valid submission atomically and
 -- blocks revoke/replacement until commit. Once revocation commits, this predicate cannot match.
 select * into pub from public.validation_survey_publications where token_hash=p_token_hash and state='published' for share;
 if not found then raise exception 'survey unavailable' using errcode='P0002';end if;
 -- Lock order is publication then exact experiment version. V3 lifecycle transitions lock only the
 -- experiment-version row, so they never wait for publication and cannot form a reverse-order cycle.
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
   if exists(select 1 from jsonb_array_elements(a->'value') selected where jsonb_typeof(selected) is distinct from 'string' or not exists(select 1 from jsonb_array_elements_text(q->'options') option where option=selected#>>'{}')) then raise exception 'invalid multiple choice option' using errcode='23514';end if;
   select count(distinct selected#>>'{}') into distinct_selected_count from jsonb_array_elements(a->'value') selected;
   if distinct_selected_count<>selected_count then raise exception 'duplicate multiple choice option' using errcode='23514';end if;
  elsif q->>'type'='short_text' then
   if jsonb_typeof(a->'value') is distinct from 'string' or length(a->>'value')>500 then raise exception 'invalid short text answer' using errcode='23514';end if;
  elsif q->>'type'='long_text' then
   if jsonb_typeof(a->'value') is distinct from 'string' or length(a->>'value')>4000 then raise exception 'invalid long text answer' using errcode='23514';end if;
  elsif q->>'type'='number' then
   if jsonb_typeof(a->'value') is distinct from 'number' or (q?'min' and (a->>'value')::numeric<(q->>'min')::numeric) or (q?'max' and (a->>'value')::numeric>(q->>'max')::numeric) then raise exception 'invalid number answer' using errcode='23514';end if;
  else
   raise exception 'unsupported survey question type' using errcode='23514';
  end if;
 end loop;

 -- The insert and every answer insert are one function transaction; any later exception rolls all back.
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
revoke all on function public.validation_protect_survey_history(),public.validation_guard_survey_publication(),public.validation_create_survey_plan(uuid,uuid,text,text,jsonb,uuid),public.validation_publish_survey(uuid,uuid,text),public.validation_revoke_survey(uuid,uuid),public.validation_submit_public_survey(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.validation_protect_survey_history(),public.validation_guard_survey_publication(),public.validation_create_survey_plan(uuid,uuid,text,text,jsonb,uuid),public.validation_publish_survey(uuid,uuid,text),public.validation_revoke_survey(uuid,uuid),public.validation_submit_public_survey(text,text,text,jsonb) to service_role;
