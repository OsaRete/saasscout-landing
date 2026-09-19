-- V8-B3.0.1: repair the pgcrypto schema reference used by approved shareable evidence.
-- The B3.0 function has a deliberately fixed public search_path, while managed
-- Supabase installs pgcrypto in extensions. Replacing only the function keeps
-- all existing rows, constraints, RLS, grants, and append-only semantics intact.

create or replace function public.validation_record_interview_observation_v2(
  p_owner_id uuid,
  p_interview_session_id uuid,
  p_observed_at timestamptz,
  p_observation_content jsonb,
  p_ingestion_key text,
  p_shareable_statement text default null,
  p_shareable_reviewed boolean default false
) returns jsonb language plpgsql set search_path=public as $$
declare
  s public.validation_interview_sessions;
  o public.validation_evidence_observations;
  shared public.validation_customer_interview_shareable_evidence;
  inserted boolean;
  normalized_statement text := nullif(btrim(p_shareable_statement), '');
begin
  if (normalized_statement is null and p_shareable_reviewed) or
     (normalized_statement is not null and not p_shareable_reviewed) then
    raise exception 'shareable statement and human review confirmation must be supplied together' using errcode='23514';
  end if;
  if normalized_statement is not null and length(normalized_statement) > 500 then
    raise exception 'shareable statement exceeds 500 characters' using errcode='22001';
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
    select * into shared from public.validation_customer_interview_shareable_evidence
    where source_observation_id=o.id and owner_id=p_owner_id;
    if normalized_statement is null then
      if found then
        raise exception 'idempotency conflict' using errcode='23505';
      end if;
    elsif not found or shared.statement is distinct from normalized_statement or
       shared.statement_sha256 is distinct from encode(extensions.digest(convert_to(normalized_statement,'UTF8'),'sha256'),'hex') then
      raise exception 'idempotency conflict' using errcode='23505';
    end if;
  elsif normalized_statement is not null then
    insert into public.validation_customer_interview_shareable_evidence(
      owner_id,source_observation_id,statement,statement_sha256,contract_version,review_confirmation)
    values (
      p_owner_id,o.id,normalized_statement,encode(extensions.digest(convert_to(normalized_statement,'UTF8'),'sha256'),'hex'),
      'customer_interview_shareable_evidence_v1','human_reviewed_for_shared_evidence_use');
  end if;

  return (to_jsonb(o)-'owner_id') || jsonb_build_object(
    'duplicate', not inserted,
    'shareableEvidenceCreated', inserted and normalized_statement is not null
  );
end $$;

revoke all on function public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean) to service_role;
