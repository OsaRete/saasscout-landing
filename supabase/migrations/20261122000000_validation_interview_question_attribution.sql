-- New observations may identify a question by its position in the exact
-- immutable plan version held by the session. Existing rows are untouched.
create function public.validation_check_interview_question_attribution()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  attribution jsonb := new.observation_content -> 'questionAttribution';
  position_text text := attribution ->> 'position';
begin
  if attribution is null then return new; end if;
  if jsonb_typeof(attribution) is distinct from 'object'
    or jsonb_typeof(attribution -> 'position') is distinct from 'number'
    or position_text is null or position_text !~ '^([1-9]|1[0-2])$'
    or new.modality is distinct from 'interview_observation' then
    raise exception 'invalid interview question reference' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.validation_interview_sessions s
    join public.validation_interview_plan_versions p
      on p.id = s.interview_plan_version_id and p.owner_id = s.owner_id
    where s.id = new.interview_session_id and s.owner_id = new.owner_id
      and p.id::text = attribution ->> 'planVersionId'
      and jsonb_array_length(p.questions) >= position_text::integer
  ) then
    raise exception 'invalid interview question reference' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.validation_check_interview_question_attribution() from public, anon, authenticated;

create trigger validation_check_interview_question_attribution
before insert on public.validation_evidence_observations for each row
execute function public.validation_check_interview_question_attribution();
