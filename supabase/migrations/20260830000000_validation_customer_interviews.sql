-- PR V5: private Customer Interview plans, sessions, and exact observation provenance.
create table public.validation_interview_plan_versions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, subject_id uuid not null, experiment_id uuid not null,
  experiment_version_id uuid not null, version_number integer not null check (version_number > 0),
  questions jsonb not null, supersedes_plan_version_id uuid, created_at timestamptz not null default now(),
  constraint validation_interview_plans_questions_check check (jsonb_typeof(questions)='array' and jsonb_array_length(questions) between 1 and 12 and pg_column_size(questions) <= 32768),
  constraint validation_interview_plans_experiment_fk foreign key (experiment_version_id,experiment_id,subject_id,owner_id)
    references public.validation_experiment_versions(id,experiment_id,subject_id,owner_id) on delete restrict,
  unique (experiment_id,version_number), unique(id,owner_id), unique(id,experiment_version_id,experiment_id,subject_id,owner_id)
);
alter table public.validation_interview_plan_versions add constraint validation_interview_plans_supersedes_fk
  foreign key (supersedes_plan_version_id,owner_id) references public.validation_interview_plan_versions(id,owner_id) on delete restrict;

create table public.validation_interview_sessions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, subject_id uuid not null, experiment_id uuid not null,
  experiment_version_id uuid not null, hypothesis_id uuid not null, hypothesis_version_id uuid not null, participant_id uuid not null,
  interview_plan_version_id uuid not null, status text not null default 'draft',
  participant_relevance text not null default 'unknown_relevance', notes text,
  started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz, created_at timestamptz not null default now(),
  constraint validation_interview_sessions_status_check check(status in ('draft','in_progress','completed','cancelled')),
  constraint validation_interview_sessions_relevance_check check(participant_relevance in ('target_segment_match','adjacent_segment','unknown_relevance')),
  constraint validation_interview_sessions_notes_check check(notes is null or length(notes)<=12000),
  constraint validation_interview_sessions_times_check check(
    (status='draft' and started_at is null and completed_at is null and cancelled_at is null) or
    (status='in_progress' and started_at is not null and completed_at is null and cancelled_at is null) or
    (status='completed' and started_at is not null and completed_at is not null and cancelled_at is null) or
    (status='cancelled' and completed_at is null and cancelled_at is not null)),
  constraint validation_interview_sessions_experiment_fk foreign key (experiment_version_id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id)
    references public.validation_experiment_versions(id,experiment_id,hypothesis_version_id,hypothesis_id,subject_id,owner_id) on delete restrict,
  constraint validation_interview_sessions_participant_fk foreign key(participant_id,owner_id) references public.validation_participants(id,owner_id) on delete restrict,
  constraint validation_interview_sessions_plan_fk foreign key(interview_plan_version_id,experiment_version_id,experiment_id,subject_id,owner_id)
    references public.validation_interview_plan_versions(id,experiment_version_id,experiment_id,subject_id,owner_id) on delete restrict,
  unique(id,owner_id), unique(id,experiment_version_id,participant_id,owner_id)
);

alter table public.validation_evidence_observations add column interview_session_id uuid;
alter table public.validation_evidence_observations add constraint validation_evidence_interview_session_fk
  foreign key(interview_session_id,experiment_version_id,participant_id,owner_id)
  references public.validation_interview_sessions(id,experiment_version_id,participant_id,owner_id) on delete restrict;

create function public.validation_protect_interview_history() returns trigger language plpgsql set search_path=public as $$ begin
 if tg_op='DELETE' then raise exception 'interview history is immutable' using errcode='23514'; end if;
 if tg_table_name='validation_interview_plan_versions' then raise exception 'interview plans are immutable' using errcode='23514'; end if;
 if old.status in ('completed','cancelled') then raise exception 'terminal interview is immutable' using errcode='23514'; end if;
 if new.owner_id<>old.owner_id or new.subject_id<>old.subject_id or new.hypothesis_id<>old.hypothesis_id or new.experiment_id<>old.experiment_id or new.experiment_version_id<>old.experiment_version_id or new.hypothesis_version_id<>old.hypothesis_version_id or new.participant_id<>old.participant_id or new.interview_plan_version_id<>old.interview_plan_version_id or new.created_at<>old.created_at then raise exception 'interview lineage is immutable' using errcode='23514'; end if;
 if not ((old.status='draft' and new.status in ('draft','in_progress','cancelled')) or (old.status='in_progress' and new.status in ('in_progress','completed','cancelled'))) then raise exception 'invalid interview transition' using errcode='23514'; end if;
 return new; end $$;
create trigger validation_interview_plans_immutable before update or delete on public.validation_interview_plan_versions for each row execute function public.validation_protect_interview_history();
create trigger validation_interview_sessions_guard before update or delete on public.validation_interview_sessions for each row execute function public.validation_protect_interview_history();
revoke all on function public.validation_protect_interview_history() from public,anon,authenticated;
grant execute on function public.validation_protect_interview_history() to service_role;

alter table public.validation_interview_plan_versions enable row level security;
alter table public.validation_interview_sessions enable row level security;
create policy validation_interview_plans_owner_read on public.validation_interview_plan_versions for select to authenticated using(owner_id=auth.uid());
create policy validation_interview_sessions_owner_read on public.validation_interview_sessions for select to authenticated using(owner_id=auth.uid());
revoke all on public.validation_interview_plan_versions,public.validation_interview_sessions from public,anon,authenticated;
grant select on public.validation_interview_plan_versions to authenticated;
grant select (id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,participant_id,interview_plan_version_id,status,participant_relevance,started_at,completed_at,cancelled_at,created_at)
  on public.validation_interview_sessions to authenticated;
grant all on public.validation_interview_plan_versions,public.validation_interview_sessions to service_role;

create function public.validation_create_interview_plan(p_owner_id uuid,p_experiment_version_id uuid,p_questions jsonb,p_supersedes_plan_version_id uuid default null) returns jsonb language plpgsql set search_path=public as $$ declare e public.validation_experiment_versions; root public.validation_experiments; p public.validation_interview_plan_versions; n integer; begin
 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and owner_id=p_owner_id and family='customer_interview'; if not found then raise exception 'not found' using errcode='P0002'; end if;
 -- Plan version_number is scoped by logical experiment_id, so serialize on that same owned root.
 select * into root from public.validation_experiments where id=e.experiment_id and owner_id=p_owner_id for update; if not found then raise exception 'not found' using errcode='P0002'; end if;
 -- Refresh and lock the exact design row only after the namespace root lock; lifecycle authority stays current.
 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and experiment_id=root.id and owner_id=p_owner_id and family='customer_interview' for update; if not found then raise exception 'not found' using errcode='P0002'; end if;
 if e.lifecycle in ('completed','cancelled') then raise exception 'terminal experiment' using errcode='23514'; end if;
 if p_supersedes_plan_version_id is not null and not exists(select 1 from public.validation_interview_plan_versions where id=p_supersedes_plan_version_id and experiment_id=e.experiment_id and owner_id=p_owner_id) then raise exception 'invalid predecessor' using errcode='23503'; end if;
 select coalesce(max(version_number),0)+1 into n from public.validation_interview_plan_versions where experiment_id=e.experiment_id;
 insert into public.validation_interview_plan_versions(owner_id,subject_id,experiment_id,experiment_version_id,version_number,questions,supersedes_plan_version_id) values(p_owner_id,e.subject_id,e.experiment_id,e.id,n,p_questions,p_supersedes_plan_version_id) returning * into p; return to_jsonb(p)-'owner_id'; end $$;

create function public.validation_create_interview_session(p_owner_id uuid,p_experiment_version_id uuid,p_participant_id uuid,p_interview_plan_version_id uuid,p_participant_relevance text) returns jsonb language plpgsql set search_path=public as $$ declare e public.validation_experiment_versions; p public.validation_participants; s public.validation_interview_sessions; begin
 select * into e from public.validation_experiment_versions where id=p_experiment_version_id and owner_id=p_owner_id and family='customer_interview' and lifecycle in ('running','paused'); if not found then raise exception 'experiment unavailable' using errcode='P0002'; end if;
 select * into p from public.validation_participants where id=p_participant_id and owner_id=p_owner_id and status='active'; if not found or (p.experiment_id is not null and p.experiment_id<>e.experiment_id) then raise exception 'participant unavailable' using errcode='P0002'; end if;
 insert into public.validation_interview_sessions(owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,participant_id,interview_plan_version_id,participant_relevance) values(p_owner_id,e.subject_id,e.experiment_id,e.id,e.hypothesis_id,e.hypothesis_version_id,p.id,p_interview_plan_version_id,p_participant_relevance) returning * into s; return to_jsonb(s)-'owner_id'-'notes'; end $$;

create function public.validation_update_interview_session(p_owner_id uuid,p_session_id uuid,p_expected_status text,p_target_status text,p_notes text) returns jsonb language plpgsql set search_path=public as $$ declare current_session public.validation_interview_sessions; parent public.validation_experiment_versions; s public.validation_interview_sessions; t timestamptz:=clock_timestamp(); begin
 if p_expected_status='draft' and p_target_status='in_progress' then
   select * into current_session from public.validation_interview_sessions where id=p_session_id and owner_id=p_owner_id and status=p_expected_status;
   if not found then raise exception 'stale interview' using errcode='40001'; end if;
   -- V3 lifecycle transitions UPDATE this exact row. Lock it first so start-vs-transition has one database order.
   select * into parent from public.validation_experiment_versions where id=current_session.experiment_version_id and owner_id=p_owner_id and family='customer_interview' for update;
   if not found or parent.lifecycle<>'running' then raise exception 'parent experiment is not running' using errcode='40001'; end if;
 end if;
 update public.validation_interview_sessions set notes=p_notes,status=p_target_status,started_at=case when p_target_status='in_progress' then coalesce(started_at,t) else started_at end,completed_at=case when p_target_status='completed' then t else completed_at end,cancelled_at=case when p_target_status='cancelled' then t else cancelled_at end
 where id=p_session_id and owner_id=p_owner_id and status=p_expected_status
 returning * into s;
 if not found then raise exception 'stale interview' using errcode='40001'; end if; return to_jsonb(s)-'owner_id'; end $$;

revoke all on function public.validation_create_interview_plan(uuid,uuid,jsonb,uuid),public.validation_create_interview_session(uuid,uuid,uuid,uuid,text),public.validation_update_interview_session(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.validation_create_interview_plan(uuid,uuid,jsonb,uuid),public.validation_create_interview_session(uuid,uuid,uuid,uuid,text),public.validation_update_interview_session(uuid,uuid,text,text,text) to service_role;

-- Interview-specific extension of the V3 append-only/idempotent observation command.
create function public.validation_record_interview_observation(p_owner_id uuid,p_interview_session_id uuid,p_observed_at timestamptz,p_observation_content jsonb,p_ingestion_key text) returns jsonb language plpgsql set search_path=public as $$ declare s public.validation_interview_sessions; o public.validation_evidence_observations; begin
 select * into s from public.validation_interview_sessions where id=p_interview_session_id and owner_id=p_owner_id and status in ('in_progress','completed'); if not found then raise exception 'interview unavailable' using errcode='P0002'; end if;
 insert into public.validation_evidence_observations(owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,interview_session_id,origin,modality,observed_at,source_type,source_reference,collected_by,observation_content,ingestion_key,participant_independence_key,independence_relationship,anonymous_independence_uncertain)
 select p_owner_id,e.subject_id,e.hypothesis_id,e.hypothesis_version_id,e.experiment_id,e.id,s.participant_id,s.id,'human_interview','interview_observation',p_observed_at,'customer_interview',s.id::text,'manual',p_observation_content,p_ingestion_key,p.independence_key,
   case when exists(select 1 from public.validation_evidence_observations prior where prior.owner_id=p_owner_id and prior.participant_id=s.participant_id) then 'repeat_participant' else 'unknown' end,
   p.identity_mode='anonymous'
 from public.validation_experiment_versions e join public.validation_participants p on p.id=s.participant_id and p.owner_id=p_owner_id where e.id=s.experiment_version_id and e.owner_id=p_owner_id
 on conflict(owner_id,ingestion_key) where ingestion_key is not null do nothing returning * into o;
 if found then return (to_jsonb(o)-'owner_id')||jsonb_build_object('duplicate',false); end if;
 select * into o from public.validation_evidence_observations where owner_id=p_owner_id and ingestion_key=p_ingestion_key;
 if not found or o.interview_session_id is distinct from s.id or o.observed_at is distinct from p_observed_at or o.observation_content is distinct from p_observation_content then raise exception 'idempotency conflict' using errcode='23505'; end if;
 return (to_jsonb(o)-'owner_id')||jsonb_build_object('duplicate',true); end $$;
revoke all on function public.validation_record_interview_observation(uuid,uuid,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.validation_record_interview_observation(uuid,uuid,timestamptz,jsonb,text) to service_role;
