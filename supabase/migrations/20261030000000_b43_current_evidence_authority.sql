-- B4.3-B restrictive current-evidence safety foundation.
-- Additive only: B3.1 promotion rows and B4.2 snapshots are not rewritten.

-- Supabase's migration principal is postgres but is not necessarily a
-- superuser. SECURITY DEFINER code therefore runs with BYPASSRLS; direct SQL
-- privileges and explicit function grants are the application boundary.
do $$
begin
  if current_user <> 'postgres' or current_user in ('anon','authenticated','service_role','authenticator') then
    raise exception 'B4.3 requires the trusted Supabase postgres migration principal';
  end if;
  if not exists (select 1 from pg_roles where rolname=current_user and rolbypassrls) then
    raise exception 'B4.3 postgres-owned functions require the documented BYPASSRLS threat model';
  end if;
  if pg_has_role('anon','postgres','SET') or pg_has_role('authenticated','postgres','SET')
     or pg_has_role('service_role','postgres','SET') or pg_has_role('authenticator','postgres','SET')
     or exists (
       select 1 from pg_auth_members m
       where m.roleid='postgres'::regrole and m.admin_option
         and (pg_has_role('anon',m.member,'SET') or pg_has_role('authenticated',m.member,'SET')
           or pg_has_role('service_role',m.member,'SET') or pg_has_role('authenticator',m.member,'SET'))
     ) then
    raise exception 'B4.3 application roles can reach or administer the postgres principal';
  end if;
end $$;

alter table public.validation_evidence_promotions
  add constraint validation_promotions_b43_authority_identity_unique
  unique (id,owner_id,problem_observation_id,canonical_problem_id,promotion_fingerprint,projection_version);

create table public.validation_evidence_consumption_authority (
  id uuid primary key default gen_random_uuid(),
  purpose_id text not null check (purpose_id='qualified_validation_shared_evidence'),
  promotion_id uuid not null,
  owner_id uuid not null,
  problem_observation_id uuid not null,
  canonical_problem_id uuid not null,
  promotion_fingerprint text not null check (promotion_fingerprint ~ '^[0-9a-f]{64}$'),
  projection_version text not null check (projection_version='v8-b3.1-projection.1'),
  authority_state text not null check (authority_state='withheld'),
  created_at timestamptz not null default clock_timestamp(),
  constraint validation_b43_authority_promotion_fk foreign key (
    promotion_id,owner_id,problem_observation_id,canonical_problem_id,promotion_fingerprint,projection_version
  ) references public.validation_evidence_promotions (
    id,owner_id,problem_observation_id,canonical_problem_id,promotion_fingerprint,projection_version
  ) on delete restrict,
  constraint validation_b43_authority_one_purpose_per_promotion unique (purpose_id,promotion_id)
);
comment on table public.validation_evidence_consumption_authority is
  'Private immutable purpose-bound consumption facts. B4.3-B can issue WITHHELD only; absence never grants authority.';

create table public.validation_evidence_source_restrictions (
  id uuid primary key default gen_random_uuid(),
  purpose_id text not null check (purpose_id='qualified_validation_shared_evidence'),
  reason_code text not null,
  scope_kind text not null,
  scope_id uuid not null,
  owner_id uuid,
  contribution_observation_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint validation_b43_restriction_reason_scope_check check (
    (scope_kind='participant' and reason_code in ('participant_withdrawn','participant_archived','consent_metadata_changed') and owner_id is not null and contribution_observation_id is not null) or
    (scope_kind='interview_session' and reason_code in ('session_cancelled','session_relevance_lost') and owner_id is not null and contribution_observation_id is null) or
    (scope_kind='experiment_version' and reason_code='experiment_cancelled' and owner_id is not null and contribution_observation_id is null) or
    (scope_kind='classification' and reason_code='classification_superseded' and owner_id is not null and contribution_observation_id is null) or
    (scope_kind='canonical_problem' and reason_code in ('canonical_deactivated','canonical_merged') and owner_id is null and contribution_observation_id is null) or
    (scope_kind='observation' and reason_code='shared_use_revoked' and owner_id is not null and contribution_observation_id is null)
  ),
  constraint validation_b43_restriction_contribution_scope_check check (
    (scope_kind='participant') = (contribution_observation_id is not null)
  )
);
create unique index validation_b43_restriction_idempotency_uidx on public.validation_evidence_source_restrictions (
  purpose_id,reason_code,scope_kind,scope_id,coalesce(owner_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(contribution_observation_id,'00000000-0000-0000-0000-000000000000'::uuid)
);
create index validation_b43_restriction_scope_idx on public.validation_evidence_source_restrictions
  (purpose_id,scope_kind,scope_id,owner_id);
create index validation_b43_restriction_contribution_idx on public.validation_evidence_source_restrictions
  (purpose_id,contribution_observation_id,owner_id) where contribution_observation_id is not null;
comment on table public.validation_evidence_source_restrictions is
  'Private append-only permanent restrictions. Participant facts bind only observations existing at the source transition; later observations do not inherit them.';

-- Defense in depth for any future accidental grants; postgres-owned definer
-- functions bypass these policies, so they are not their authorization layer.
alter table public.validation_evidence_consumption_authority enable row level security;
alter table public.validation_evidence_consumption_authority force row level security;
alter table public.validation_evidence_source_restrictions enable row level security;
alter table public.validation_evidence_source_restrictions force row level security;

revoke all on public.validation_evidence_consumption_authority,public.validation_evidence_source_restrictions
  from public,anon,authenticated,service_role,authenticator;

create function public.validation_b43_reject_fact_change() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
  raise exception 'B4.3 authority facts are append-only' using errcode='55000';
end $$;
revoke all on function public.validation_b43_reject_fact_change() from public,anon,authenticated,service_role,authenticator;
create trigger validation_b43_authority_immutable before update or delete on public.validation_evidence_consumption_authority
  for each row execute function public.validation_b43_reject_fact_change();
create trigger validation_b43_restrictions_immutable before update or delete on public.validation_evidence_source_restrictions
  for each row execute function public.validation_b43_reject_fact_change();

create function public.validation_b43_capture_new_promotion_authority() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  insert into public.validation_evidence_consumption_authority(
    purpose_id,promotion_id,owner_id,problem_observation_id,canonical_problem_id,
    promotion_fingerprint,projection_version,authority_state
  ) values (
    'qualified_validation_shared_evidence',new.id,new.owner_id,new.problem_observation_id,new.canonical_problem_id,
    new.promotion_fingerprint,new.projection_version,'withheld'
  );
  return new;
end $$;
revoke all on function public.validation_b43_capture_new_promotion_authority() from public,anon,authenticated,service_role,authenticator;
create trigger validation_b43_new_promotion_withheld_authority
  after insert on public.validation_evidence_promotions
  for each row when (new.problem_observation_id is not null)
  execute function public.validation_b43_capture_new_promotion_authority();

create function public.validation_b43_insert_restriction(
  p_reason text,p_kind text,p_scope uuid,p_owner uuid,p_observation uuid default null
) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if pg_trigger_depth()=0 then
    raise exception 'B4.3 restriction writer is trigger-only' using errcode='42501';
  end if;
  insert into public.validation_evidence_source_restrictions(
    purpose_id,reason_code,scope_kind,scope_id,owner_id,contribution_observation_id
  ) values ('qualified_validation_shared_evidence',p_reason,p_kind,p_scope,p_owner,p_observation)
  on conflict do nothing;
end $$;
revoke all on function public.validation_b43_insert_restriction(text,text,uuid,uuid,uuid) from public,anon,authenticated,service_role,authenticator;

create function public.validation_b43_lock_source_change() returns trigger
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
  if tg_op='INSERT' then return new; end if;
  return old;
end $$;
revoke all on function public.validation_b43_lock_source_change() from public,anon,authenticated,service_role,authenticator;

create function public.validation_b43_capture_participant_restrictions() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare reason text;
begin
  if old.status is distinct from new.status and new.status in ('withdrawn','archived') then
    reason := case new.status when 'withdrawn' then 'participant_withdrawn' else 'participant_archived' end;
    insert into public.validation_evidence_source_restrictions(
      purpose_id,reason_code,scope_kind,scope_id,owner_id,contribution_observation_id
    ) select 'qualified_validation_shared_evidence',reason,'participant',new.id,new.owner_id,o.id
      from public.validation_evidence_observations o
      where o.participant_id=new.id and o.owner_id=new.owner_id
    on conflict do nothing;
  end if;
  if (old.consent_mode,old.consent_purpose,old.consent_captured_at)
     is distinct from (new.consent_mode,new.consent_purpose,new.consent_captured_at)
     and exists (select 1 from public.validation_evidence_observations o where o.participant_id=new.id and o.owner_id=new.owner_id) then
    insert into public.validation_evidence_source_restrictions(
      purpose_id,reason_code,scope_kind,scope_id,owner_id,contribution_observation_id
    ) select 'qualified_validation_shared_evidence','consent_metadata_changed','participant',new.id,new.owner_id,o.id
      from public.validation_evidence_observations o
      where o.participant_id=new.id and o.owner_id=new.owner_id
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.validation_b43_capture_participant_restrictions() from public,anon,authenticated,service_role,authenticator;
create trigger validation_b43_participant_change_lock before update of status,consent_mode,consent_purpose,consent_captured_at
  on public.validation_participants for each row execute function public.validation_b43_lock_source_change();
create trigger validation_b43_participant_restrictions after update of status,consent_mode,consent_purpose,consent_captured_at
  on public.validation_participants for each row execute function public.validation_b43_capture_participant_restrictions();

create function public.validation_b43_restrict_observation_during_nonactive_participant() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare participant_status text;
begin
  if new.participant_id is null then return new; end if;
  select p.status into participant_status from public.validation_participants p
    where p.id=new.participant_id and p.owner_id=new.owner_id;
  if participant_status in ('withdrawn','archived') then
    perform public.validation_b43_insert_restriction(
      case participant_status when 'withdrawn' then 'participant_withdrawn' else 'participant_archived' end,
      'participant',new.participant_id,new.owner_id,new.id
    );
  end if;
  return new;
end $$;
revoke all on function public.validation_b43_restrict_observation_during_nonactive_participant() from public,anon,authenticated,service_role,authenticator;
create trigger validation_b43_observation_participant_restriction after insert on public.validation_evidence_observations
  for each row execute function public.validation_b43_restrict_observation_during_nonactive_participant();
create trigger validation_b43_observation_source_lock before insert on public.validation_evidence_observations
  for each row execute function public.validation_b43_lock_source_change();

create function public.validation_b43_capture_session_restrictions() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if old.status is distinct from new.status and new.status='cancelled' then
    perform public.validation_b43_insert_restriction('session_cancelled','interview_session',new.id,new.owner_id);
  end if;
  if old.participant_relevance='target_segment_match' and new.participant_relevance is distinct from old.participant_relevance then
    perform public.validation_b43_insert_restriction('session_relevance_lost','interview_session',new.id,new.owner_id);
  end if;
  return new;
end $$;
revoke all on function public.validation_b43_capture_session_restrictions() from public,anon,authenticated,service_role,authenticator;
create trigger validation_b43_session_change_lock before update of status,participant_relevance
  on public.validation_interview_sessions for each row execute function public.validation_b43_lock_source_change();
create trigger validation_b43_session_restrictions after update of status,participant_relevance
  on public.validation_interview_sessions for each row execute function public.validation_b43_capture_session_restrictions();

create function public.validation_b43_capture_experiment_restriction() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if old.lifecycle is distinct from new.lifecycle and new.lifecycle='cancelled' then
    perform public.validation_b43_insert_restriction('experiment_cancelled','experiment_version',new.id,new.owner_id);
  end if;
  return new;
end $$;
revoke all on function public.validation_b43_capture_experiment_restriction() from public,anon,authenticated,service_role,authenticator;
create trigger validation_b43_experiment_change_lock before update of lifecycle on public.validation_experiment_versions
  for each row execute function public.validation_b43_lock_source_change();
create trigger validation_b43_experiment_restriction after update of lifecycle on public.validation_experiment_versions
  for each row execute function public.validation_b43_capture_experiment_restriction();

create function public.validation_b43_capture_classification_restriction() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if new.supersedes_classification_id is not null and exists (
    select 1 from public.validation_evidence_promotions p
    where p.classification_id=new.supersedes_classification_id and p.owner_id=new.owner_id
      and p.problem_observation_id is not null
  ) then
    perform public.validation_b43_insert_restriction('classification_superseded','classification',new.supersedes_classification_id,new.owner_id);
  end if;
  return new;
end $$;
revoke all on function public.validation_b43_capture_classification_restriction() from public,anon,authenticated,service_role,authenticator;
create trigger validation_b43_classification_restriction after insert on public.validation_evidence_classifications
  for each row execute function public.validation_b43_capture_classification_restriction();

create function public.validation_b43_capture_canonical_restriction() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if old.status='active' and new.status in ('candidate','deprecated','archived') then
    perform public.validation_b43_insert_restriction('canonical_deactivated','canonical_problem',new.id,null);
  end if;
  if (old.status is distinct from new.status and new.status='merged')
     or (old.merged_into_problem_id is null and new.merged_into_problem_id is not null) then
    perform public.validation_b43_insert_restriction('canonical_merged','canonical_problem',new.id,null);
  end if;
  return new;
end $$;
revoke all on function public.validation_b43_capture_canonical_restriction() from public,anon,authenticated,service_role,authenticator;
create trigger validation_b43_canonical_restriction after update of status,merged_into_problem_id
  on public.canonical_problems for each row execute function public.validation_b43_capture_canonical_restriction();

-- The postgres-owned reader deliberately bypasses RLS. Its static, qualified
-- checks are the boundary; it is not executable by any application role here.

create function public.validation_b43_read_current_evidence(p_canonical_problem_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,pg_temp
as $$
declare
  candidate_count bigint;
  p public.validation_evidence_promotions;
  shared public.problem_observations;
  snapshot public.validation_qualified_evidence_snapshots;
  authority public.validation_evidence_consumption_authority;
  source public.validation_evidence_observations;
  participant public.validation_participants;
  interview public.validation_interview_sessions;
  experiment public.validation_experiment_versions;
  classification public.validation_evidence_classifications;
  canonical public.canonical_problems;
  terminal_count integer;
  expected_fingerprint text;
  restricted boolean;
  output_rows jsonb := '[]'::jsonb;
begin
  -- The runtime RPC has no application grant. Keep a second, explicit
  -- fail-closed guard in case an EXECUTE grant is accidentally added later.
  if session_user <> 'postgres' then raise exception 'unavailable' using errcode='P0001'; end if;
  if p_canonical_problem_id is null then raise exception 'unavailable' using errcode='P0001'; end if;
  select * into canonical from public.canonical_problems c where c.id=p_canonical_problem_id;
  if not found or canonical.status not in ('candidate','active','merged','deprecated','archived')
    or (canonical.status='merged') is distinct from (canonical.merged_into_problem_id is not null) then
    raise exception 'unavailable' using errcode='P0001';
  end if;
  select count(*) into candidate_count from public.validation_evidence_promotions p0
    where p0.canonical_problem_id=p_canonical_problem_id and p0.problem_observation_id is not null;
  if candidate_count>100 then raise exception 'unavailable' using errcode='P0001'; end if;

  for p in select p0.* from public.validation_evidence_promotions p0
    where p0.canonical_problem_id=p_canonical_problem_id and p0.problem_observation_id is not null
    order by p0.problem_observation_id
  loop
    select * into shared from public.problem_observations s where s.id=p.problem_observation_id;
    select * into snapshot from public.validation_qualified_evidence_snapshots s where s.promotion_id=p.id;
    if not found or not public.validation_b42_snapshot_verified(p)
      or snapshot.attestation_version is distinct from 'v8-b4.2-b1-full-row.2'
      or snapshot.problem_observation_id is distinct from p.problem_observation_id
      or snapshot.canonical_problem_id is distinct from p.canonical_problem_id
      or snapshot.promotion_fingerprint is distinct from p.promotion_fingerprint
      or snapshot.projection_version is distinct from p.projection_version
      or snapshot.problem_title is distinct from shared.problem_title
      or snapshot.source_evidence is distinct from shared.source_evidence
      or snapshot.source_type is distinct from shared.source_type
      or snapshot.evidence_polarity is distinct from shared.evidence_polarity
      or snapshot.observed_at is distinct from shared.observed_at
      or snapshot.observation_fingerprint is distinct from shared.observation_fingerprint
      or shared.id is distinct from p.problem_observation_id
      or shared.canonical_problem_id is distinct from p_canonical_problem_id
      or shared.source_type is distinct from 'customer_interview_human_reviewed'
      or shared.evidence_polarity is distinct from p.polarity
      or jsonb_typeof(shared.metadata) is distinct from 'object'
      or shared.metadata->>'projectionVersion' is distinct from 'v8-b3.1-projection.1'
      or shared.observation_fingerprint is distinct from 'validation-promotion:' || p.promotion_fingerprint
      or p.eligible is distinct from true or p.eligibility_reasons is distinct from array['eligible']::text[]
      or p.representative_selected is distinct from true or p.resolution_status is distinct from 'resolved'
      or p.resolution_reason is distinct from 'server_exact_authority_snapshot'
      or p.policy_version is distinct from 'v8-b1.2'
      or p.resolver_version is distinct from 'v8-b3.0.2-exact.1'
      or p.projection_version is distinct from 'v8-b3.1-projection.1'
      or p.supersedes_promotion_id is not null or p.deactivation_reason is not null
      or p.independence_kind is distinct from 'participant'
      or p.independence_private_id is distinct from p.participant_id
      or p.polarity not in ('supporting','contradicting','mixed')
      or p.representative_group_key is distinct from 'participant:'||p.participant_id::text||'|'||p.canonical_problem_id::text||'|'||p.polarity
      or shared.problem_title is null or btrim(shared.problem_title)=''
      or shared.source_evidence is null or btrim(shared.source_evidence)='' or char_length(shared.source_evidence)>500
      or shared.observed_at is null or not isfinite(shared.observed_at)
    then raise exception 'unavailable' using errcode='P0001'; end if;

    select encode(extensions.digest(convert_to(
      '{"canonicalProblemId":'||to_json(p.canonical_problem_id::text)::text||
      ',"classificationId":'||to_json(p.classification_id::text)::text||
      ',"observationId":'||to_json(p.observation_id::text)::text||
      ',"polarity":'||to_json(p.polarity)::text||
      ',"policyVersion":'||to_json(p.policy_version)::text||
      ',"projectionVersion":'||to_json(p.projection_version)::text||
      ',"resolverVersion":'||to_json(p.resolver_version)::text||'}','UTF8'),'sha256'),'hex') into expected_fingerprint;
    if expected_fingerprint is distinct from p.promotion_fingerprint then
      raise exception 'unavailable' using errcode='P0001';
    end if;

    select * into source from public.validation_evidence_observations o where o.id=p.observation_id and o.owner_id=p.owner_id;
    select * into participant from public.validation_participants x where x.id=p.participant_id and x.owner_id=p.owner_id;
    select * into interview from public.validation_interview_sessions x where x.id=p.interview_session_id and x.owner_id=p.owner_id;
    select * into experiment from public.validation_experiment_versions x where x.id=p.experiment_version_id and x.owner_id=p.owner_id;
    select * into classification from public.validation_evidence_classifications x
      where x.id=p.classification_id and x.observation_id=p.observation_id and x.owner_id=p.owner_id;
    if source.id is null or participant.id is null or interview.id is null or experiment.id is null
      or classification.id is null or canonical.id is null
      or source.participant_id is distinct from p.participant_id
      or source.interview_session_id is distinct from p.interview_session_id
      or source.experiment_version_id is distinct from p.experiment_version_id
      or source.subject_id is distinct from p.subject_id
      or source.hypothesis_id is distinct from p.hypothesis_id
      or source.hypothesis_version_id is distinct from p.hypothesis_version_id
      or source.experiment_id is distinct from p.experiment_id
      or interview.participant_id is distinct from p.participant_id
      or interview.experiment_version_id is distinct from p.experiment_version_id
      or interview.experiment_id is distinct from p.experiment_id
      or interview.subject_id is distinct from p.subject_id
      or interview.hypothesis_id is distinct from p.hypothesis_id
      or interview.hypothesis_version_id is distinct from p.hypothesis_version_id
      or experiment.experiment_id is distinct from p.experiment_id
      or experiment.subject_id is distinct from p.subject_id
      or experiment.hypothesis_id is distinct from p.hypothesis_id
      or experiment.hypothesis_version_id is distinct from p.hypothesis_version_id
      or experiment.family is distinct from 'customer_interview'
      or experiment.lifecycle not in ('running','paused','completed','cancelled')
      or source.origin is distinct from 'human_interview'
      or source.modality is distinct from 'interview_observation'
      or source.source_type is distinct from 'customer_interview'
      or jsonb_typeof(source.observation_content) is distinct from 'object'
      or source.observation_content='{}'::jsonb
      or interview.status not in ('in_progress','completed','cancelled')
      or interview.participant_relevance not in ('target_segment_match','adjacent_segment','unknown_relevance')
      or classification.authority_status is distinct from 'authoritative'
      or classification.classification_source='ai_model_suggested'
      or classification.polarity is distinct from p.polarity
    then raise exception 'unavailable' using errcode='P0001'; end if;

    select count(*) into terminal_count from public.validation_evidence_classifications c
      where c.owner_id=p.owner_id and c.observation_id=p.observation_id
        and c.authority_status='authoritative' and c.classification_source<>'ai_model_suggested'
        and not exists(select 1 from public.validation_evidence_classifications successor
          where successor.owner_id=c.owner_id and successor.supersedes_classification_id=c.id);
    if terminal_count<>1 then raise exception 'unavailable' using errcode='P0001'; end if;

    select * into authority from public.validation_evidence_consumption_authority a
      where a.purpose_id='qualified_validation_shared_evidence' and a.promotion_id=p.id;
    if not found or authority.owner_id is distinct from p.owner_id
      or authority.problem_observation_id is distinct from p.problem_observation_id
      or authority.canonical_problem_id is distinct from p.canonical_problem_id
      or authority.promotion_fingerprint is distinct from p.promotion_fingerprint
      or authority.projection_version is distinct from p.projection_version
      or authority.authority_state is distinct from 'withheld'
    then raise exception 'unavailable' using errcode='P0001'; end if;

    if (canonical.status='merged') is distinct from (canonical.merged_into_problem_id is not null) then
      raise exception 'unavailable' using errcode='P0001';
    end if;
    if participant.status not in ('active','withdrawn','archived')
      or interview.status not in ('in_progress','completed','cancelled')
      or interview.participant_relevance not in ('target_segment_match','adjacent_segment','unknown_relevance')
      or canonical.status not in ('candidate','active','merged','deprecated','archived')
    then raise exception 'unavailable' using errcode='P0001'; end if;

    select exists(select 1 from public.validation_evidence_source_restrictions r
      where r.purpose_id='qualified_validation_shared_evidence' and (
        (r.scope_kind='participant' and r.scope_id=p.participant_id and r.owner_id=p.owner_id and r.contribution_observation_id=p.observation_id) or
        (r.scope_kind='interview_session' and r.scope_id=p.interview_session_id and r.owner_id=p.owner_id) or
        (r.scope_kind='experiment_version' and r.scope_id=p.experiment_version_id and r.owner_id=p.owner_id) or
        (r.scope_kind='classification' and r.scope_id=p.classification_id and r.owner_id=p.owner_id) or
        (r.scope_kind='canonical_problem' and r.scope_id=p.canonical_problem_id) or
        (r.scope_kind='observation' and r.scope_id=p.observation_id and r.owner_id=p.owner_id)
      )) into restricted;
    if participant.status<>'active' and not exists(select 1 from public.validation_evidence_source_restrictions r
      where r.scope_kind='participant' and r.scope_id=p.participant_id and r.owner_id=p.owner_id
        and r.contribution_observation_id=p.observation_id) then raise exception 'unavailable' using errcode='P0001'; end if;
    if (interview.status='cancelled' or interview.participant_relevance<>'target_segment_match') and not exists(
      select 1 from public.validation_evidence_source_restrictions r where r.scope_kind='interview_session'
        and r.scope_id=p.interview_session_id and r.owner_id=p.owner_id) then raise exception 'unavailable' using errcode='P0001'; end if;
    if experiment.lifecycle='cancelled' and not exists(select 1 from public.validation_evidence_source_restrictions r
      where r.scope_kind='experiment_version' and r.scope_id=p.experiment_version_id and r.owner_id=p.owner_id) then raise exception 'unavailable' using errcode='P0001'; end if;
    if canonical.status<>'active' and not exists(select 1 from public.validation_evidence_source_restrictions r
      where r.scope_kind='canonical_problem' and r.scope_id=p.canonical_problem_id) then raise exception 'unavailable' using errcode='P0001'; end if;

    -- The only issuable authority state is WITHHELD. After verifying proof,
    -- lineage and completeness, it is an explicit exclusion and adds no output.
    if authority.authority_state='withheld' then continue; end if;
  end loop;
  return jsonb_build_object('observations',output_rows,'complete',true);
exception when others then
  raise exception 'current evidence unavailable' using errcode='P0001';
end $$;
revoke all on function public.validation_b43_read_current_evidence(uuid) from public,anon,authenticated,service_role,authenticator;
comment on function public.validation_b43_read_current_evidence(uuid) is
  'One-snapshot complete current-evidence assessment. WITHHELD is excluded; missing authority or inconsistent proof fails closed.';

-- No authenticated or service-role direct access to private fact contents.
revoke all on public.validation_evidence_consumption_authority,public.validation_evidence_source_restrictions
  from public,anon,authenticated,service_role,authenticator;
-- No application role receives direct fact access or B4.3 function execution.
