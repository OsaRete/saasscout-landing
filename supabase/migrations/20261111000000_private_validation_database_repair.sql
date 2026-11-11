-- Private Validation Beta repair. Forward-only; no historical data changes.
-- Trusted migration principal and function ownership match the B4.3 boundary.
do $$
begin
  if current_user <> 'postgres' or not exists (
    select 1 from pg_roles where rolname=current_user and rolbypassrls
  ) then
    raise exception 'Private Validation repair requires postgres with BYPASSRLS';
  end if;
end $$;

-- Preserve all source coordination locks; BEFORE UPDATE must persist NEW.
create or replace function public.validation_b43_lock_source_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if tg_table_name='validation_participants' then
    perform public.validation_b31_lock('participant',old.id::text);
  elsif tg_table_name='validation_interview_sessions' then
    perform public.validation_b31_lock('experiment',old.experiment_version_id::text);
    perform public.validation_b31_lock('participant',old.participant_id::text);
  elsif tg_table_name='validation_evidence_observations' then
    perform public.validation_b31_lock('experiment',new.experiment_version_id::text);
    if new.participant_id is not null then
      perform public.validation_b31_lock('participant',new.participant_id::text);
    end if;
  elsif tg_table_name='validation_experiment_versions' then
    perform public.validation_b31_lock('experiment',old.id::text);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.validation_b43_lock_source_change() from public,anon,authenticated,service_role,authenticator;


-- Keep historical idempotency checks behind the existing private RPC.
create or replace function public.validation_record_interview_observation_v2(
  p_owner_id uuid,
  p_interview_session_id uuid,
  p_observed_at timestamptz,
  p_observation_content jsonb,
  p_ingestion_key text,
  p_shareable_statement text default null,
  p_shareable_reviewed boolean default false
) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  s public.validation_interview_sessions;
  o public.validation_evidence_observations;
  inserted boolean;
begin
  -- Beta admits private capture only, independently of application flags.
  if p_shareable_statement is not null or p_shareable_reviewed is distinct from false then
    raise exception 'shared Validation is unavailable' using errcode='42501';
  end if;
  select session.* into s
  from public.validation_interview_sessions session
  join public.validation_experiment_versions version
    on version.id=session.experiment_version_id and version.owner_id=p_owner_id
  where session.id=p_interview_session_id and session.owner_id=p_owner_id
    and session.status in ('in_progress','completed') and version.family='customer_interview';
  if not found then raise exception 'interview unavailable' using errcode='P0002'; end if;

  insert into public.validation_evidence_observations(
    owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,
    participant_id,interview_session_id,origin,modality,observed_at,source_type,source_reference,
    collected_by,observation_content,ingestion_key,participant_independence_key,
    independence_relationship,anonymous_independence_uncertain)
  select p_owner_id,e.subject_id,e.hypothesis_id,e.hypothesis_version_id,e.experiment_id,e.id,
    s.participant_id,s.id,'human_interview','interview_observation',p_observed_at,'customer_interview',
    s.id::text,'manual',p_observation_content,p_ingestion_key,p.independence_key,
    case when exists(select 1 from public.validation_evidence_observations prior where prior.owner_id=p_owner_id and prior.participant_id=s.participant_id) then 'repeat_participant' else 'unknown' end,
    p.identity_mode='anonymous'
  from public.validation_experiment_versions e
  join public.validation_participants p on p.id=s.participant_id and p.owner_id=p_owner_id
  where e.id=s.experiment_version_id and e.owner_id=p_owner_id and e.family='customer_interview'
  on conflict(owner_id,ingestion_key) where ingestion_key is not null do nothing returning * into o;
  inserted := found;

  if not inserted then
    select * into o from public.validation_evidence_observations
    where owner_id=p_owner_id and ingestion_key=p_ingestion_key;
    if not found or o.interview_session_id is distinct from s.id or o.observed_at is distinct from p_observed_at or o.observation_content is distinct from p_observation_content then
      raise exception 'idempotency conflict' using errcode='23505';
    end if;
    -- A historical shared capture cannot be retried as a private-only command.
    if exists (select 1 from public.validation_customer_interview_shareable_evidence
      where source_observation_id=o.id and owner_id=p_owner_id) then
      raise exception 'idempotency conflict' using errcode='23505';
    end if;
  end if;

  return (to_jsonb(o)-'owner_id') || jsonb_build_object(
    'duplicate', not inserted,
    'shareableEvidenceCreated', false
  );
end $$;


-- Shared preparation and qualified proof are unavailable to application roles.
-- Private source DML and ordinary Discovery/Scan shared-table access are unchanged.
revoke all on public.validation_customer_interview_shareable_evidence,
  public.validation_evidence_promotions,
  public.validation_qualified_evidence_snapshots
from public,anon,authenticated,service_role,authenticator;

revoke all on function
  public.validation_promote_customer_interview_evidence(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text),
  public.validation_b31_authority_snapshot(uuid,uuid),
  public.validation_b31_representative_state(uuid,uuid),
  public.validation_b42_row_record(public.problem_observations),
  public.validation_b42_protected_schema(),
  public.validation_b42_snapshot_verified(public.validation_evidence_promotions),
  public.validation_b43_read_current_evidence(uuid)
from public,anon,authenticated,service_role,authenticator;

-- Existing private capture remains callable only by the server executor.
revoke all on function public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean)
from public,anon,authenticated,authenticator;
grant execute on function public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean) to service_role;
