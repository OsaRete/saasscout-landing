-- V8-B3.0: private, human-reviewed Customer Interview shareable evidence contract.
-- This migration does not write to the Data Moat or the promotion ledger.

create table public.validation_customer_interview_shareable_evidence (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  source_observation_id uuid not null,
  statement text not null,
  statement_sha256 text not null,
  contract_version text not null,
  review_confirmation text not null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint validation_interview_shareable_source_fk
    foreign key (source_observation_id, owner_id)
    references public.validation_evidence_observations(id, owner_id) on delete restrict,
  constraint validation_interview_shareable_statement_check
    check (statement = btrim(statement) and length(statement) between 1 and 500),
  constraint validation_interview_shareable_hash_check
    check (statement_sha256 ~ '^[0-9a-f]{64}$'),
  constraint validation_interview_shareable_contract_check
    check (contract_version = 'customer_interview_shareable_evidence_v1'),
  constraint validation_interview_shareable_review_check
    check (review_confirmation = 'human_reviewed_for_shared_evidence_use'),
  unique (id, owner_id),
  unique (source_observation_id)
);

comment on table public.validation_customer_interview_shareable_evidence is
  'Private append-only human-reviewed projection of one Customer Interview observation; not a promotion or publication.';
comment on column public.validation_customer_interview_shareable_evidence.statement_sha256 is
  'Database-derived binding between the exact reviewed statement and its approval record.';

create index validation_interview_shareable_owner_created_idx
  on public.validation_customer_interview_shareable_evidence(owner_id, created_at desc);

create trigger validation_interview_shareable_append_only
  before update or delete on public.validation_customer_interview_shareable_evidence
  for each row execute function public.validation_reject_change();

alter table public.validation_customer_interview_shareable_evidence enable row level security;
revoke all on public.validation_customer_interview_shareable_evidence from public, anon, authenticated;
grant all on public.validation_customer_interview_shareable_evidence to service_role;

create function public.validation_record_interview_observation_v2(
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
       shared.statement_sha256 is distinct from encode(digest(convert_to(normalized_statement,'UTF8'),'sha256'),'hex') then
      raise exception 'idempotency conflict' using errcode='23505';
    end if;
  elsif normalized_statement is not null then
    insert into public.validation_customer_interview_shareable_evidence(
      owner_id,source_observation_id,statement,statement_sha256,contract_version,review_confirmation)
    values (
      p_owner_id,o.id,normalized_statement,encode(digest(convert_to(normalized_statement,'UTF8'),'sha256'),'hex'),
      'customer_interview_shareable_evidence_v1','human_reviewed_for_shared_evidence_use');
  end if;

  return (to_jsonb(o)-'owner_id') || jsonb_build_object(
    'duplicate', not inserted,
    'shareableEvidenceCreated', inserted and normalized_statement is not null
  );
end $$;

revoke all on function public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function public.validation_record_interview_observation_v2(uuid,uuid,timestamptz,jsonb,text,text,boolean) to service_role;
