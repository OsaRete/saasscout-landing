-- V8-B3.1: explicit Customer Interview promotion only. No canonical or downstream writes.
alter table public.problem_observations
  add column evidence_polarity text
  constraint problem_observations_evidence_polarity_check
  check (evidence_polarity is null or evidence_polarity in ('supporting','contradicting','mixed'));

alter table public.problem_observations
  add constraint problem_observations_id_canonical_unique unique (id, canonical_problem_id);

alter table public.validation_evidence_promotions
  add constraint validation_promotions_result_canonical_fk
  foreign key (problem_observation_id, canonical_problem_id)
  references public.problem_observations(id, canonical_problem_id) on delete restrict;

create unique index validation_promotions_one_result_uidx
  on public.validation_evidence_promotions(problem_observation_id)
  where problem_observation_id is not null;
create unique index validation_promotions_one_final_group_uidx
  on public.validation_evidence_promotions(owner_id,representative_group_key,policy_version)
  where problem_observation_id is not null;

-- One read contract supplies the exact persisted rows consumed by the TypeScript B2 resolver.
-- PostgreSQL never normalizes or independently resolves canonical identity.
create function public.validation_promotion_authority_rows_v1(
  p_owner_id uuid,
  p_participant_id uuid
) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'observations', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id,owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,
        participant_id,interview_session_id,origin,modality,source_type,observed_at,observation_content,participant_independence_key
      from public.validation_evidence_observations where owner_id=p_owner_id and participant_id=p_participant_id
    ) x),'[]'::jsonb),
    'classifications', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id,owner_id,observation_id,polarity,classification_source,authority_status,supersedes_classification_id
      from public.validation_evidence_classifications
      where owner_id=p_owner_id and observation_id in (select id from public.validation_evidence_observations where owner_id=p_owner_id and participant_id=p_participant_id)
    ) x),'[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id,owner_id,label from public.validation_subjects where owner_id=p_owner_id and id in
        (select subject_id from public.validation_evidence_observations where owner_id=p_owner_id and participant_id=p_participant_id)
    ) x),'[]'::jsonb),
    'hypotheses', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id,owner_id,subject_id,hypothesis_id,problem_claim from public.validation_hypothesis_versions where owner_id=p_owner_id and id in
        (select hypothesis_version_id from public.validation_evidence_observations where owner_id=p_owner_id and participant_id=p_participant_id)
    ) x),'[]'::jsonb),
    'experiments', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id,owner_id,subject_id,experiment_id,hypothesis_id,hypothesis_version_id,family,lifecycle
      from public.validation_experiment_versions where owner_id=p_owner_id and id in
        (select experiment_version_id from public.validation_evidence_observations where owner_id=p_owner_id and participant_id=p_participant_id)
    ) x),'[]'::jsonb),
    'participants', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id,owner_id,status from public.validation_participants where owner_id=p_owner_id and id=p_participant_id
    ) x),'[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id,owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,participant_id,status,participant_relevance
      from public.validation_interview_sessions where owner_id=p_owner_id and participant_id=p_participant_id
        and id in (select interview_session_id from public.validation_evidence_observations where owner_id=p_owner_id and participant_id=p_participant_id)
    ) x),'[]'::jsonb),
    'canonicalProblems', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
      select id,canonical_title,normalized_title,status from public.canonical_problems
    ) x),'[]'::jsonb),
    'aliases', coalesce((select jsonb_agg(to_jsonb(x) order by x.canonical_problem_id,x.normalized_alias) from (
      select canonical_problem_id,normalized_alias from public.problem_aliases
    ) x),'[]'::jsonb)
  )
$$;

create function public.validation_read_promotion_authority_v1(p_owner_id uuid,p_observation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare participant uuid;
begin
  select participant_id into participant from public.validation_evidence_observations
    where id=p_observation_id and owner_id=p_owner_id;
  if participant is null then raise exception 'promotion_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('rows',public.validation_promotion_authority_rows_v1(p_owner_id,participant),'participantId',participant);
end $$;

-- Registry writes and participant-scoped eligibility mutations coordinate with promotion.
create function public.validation_lock_canonical_registry_v1() returns trigger
language plpgsql set search_path=public as $$ begin
  perform pg_advisory_xact_lock(hashtextextended('validation-canonical-registry:v1',0));
  return null;
end $$;
create trigger validation_canonical_problems_registry_lock before insert or update or delete on public.canonical_problems
  for each statement execute function public.validation_lock_canonical_registry_v1();
create trigger validation_problem_aliases_registry_lock before insert or update or delete on public.problem_aliases
  for each statement execute function public.validation_lock_canonical_registry_v1();

create function public.validation_lock_participant_membership_v1(p_owner_id uuid,p_participant_id uuid)
returns void language plpgsql set search_path=public as $$ begin
  if p_participant_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('validation-promotion-participant:v1|'||p_owner_id::text||'|'||p_participant_id::text||'|v8-b1.2',0));
  end if;
end $$;
create function public.validation_lock_observation_membership_v1() returns trigger
language plpgsql set search_path=public as $$ declare participant uuid; begin
  if tg_table_name='validation_evidence_observations' then participant:=new.participant_id;
  else select participant_id into participant from public.validation_evidence_observations where id=new.observation_id and owner_id=new.owner_id; end if;
  perform public.validation_lock_participant_membership_v1(new.owner_id,participant); return new;
end $$;
create trigger validation_observation_membership_lock before insert on public.validation_evidence_observations
  for each row execute function public.validation_lock_observation_membership_v1();
create trigger validation_classification_membership_lock before insert on public.validation_evidence_classifications
  for each row execute function public.validation_lock_observation_membership_v1();

create function public.validation_lock_participant_row_membership_v1() returns trigger
language plpgsql set search_path=public as $$ begin
  if old.status is distinct from new.status then perform public.validation_lock_participant_membership_v1(new.owner_id,new.id); end if; return new;
end $$;
create trigger validation_participant_membership_lock before update on public.validation_participants
  for each row execute function public.validation_lock_participant_row_membership_v1();

create function public.validation_lock_session_membership_v1() returns trigger
language plpgsql set search_path=public as $$ begin
  if old.status is distinct from new.status or old.participant_relevance is distinct from new.participant_relevance then
    perform public.validation_lock_participant_membership_v1(new.owner_id,new.participant_id);
  end if; return new;
end $$;
create trigger validation_session_membership_lock before update on public.validation_interview_sessions
  for each row execute function public.validation_lock_session_membership_v1();

create function public.validation_lock_experiment_memberships_v1() returns trigger
language plpgsql set search_path=public as $$ declare participant uuid; begin
  if old.lifecycle is distinct from new.lifecycle then
    for participant in select distinct o.participant_id from public.validation_evidence_observations o
      where o.owner_id=new.owner_id and o.experiment_version_id=new.id and o.participant_id is not null order by o.participant_id
    loop perform public.validation_lock_participant_membership_v1(new.owner_id,participant); end loop;
  end if; return new;
end $$;
create trigger validation_experiment_memberships_lock before update on public.validation_experiment_versions
  for each row execute function public.validation_lock_experiment_memberships_v1();

create function public.validation_promote_customer_interview_v1(
  p_owner_id uuid,p_observation_id uuid,p_expected_classification_id uuid,p_expected_canonical_problem_id uuid,
  p_expected_subject_label text,p_expected_hypothesis_claim text,p_expected_polarity text,p_authority_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  o public.validation_evidence_observations; s public.validation_interview_sessions; p public.validation_participants;
  e public.validation_experiment_versions; h public.validation_hypothesis_versions; subject public.validation_subjects;
  classification public.validation_evidence_classifications; shareable public.validation_customer_interview_shareable_evidence;
  canonical public.canonical_problems; existing public.validation_evidence_promotions; existing_group public.validation_evidence_promotions; result_observation public.problem_observations;
  polarity text; fingerprint text; group_key text; current_snapshot jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('validation-canonical-registry:v1',0));
  select * into o from public.validation_evidence_observations where id=p_observation_id and owner_id=p_owner_id;
  if not found or o.participant_id is null then raise exception 'promotion_not_found' using errcode='P0002'; end if;
  perform public.validation_lock_participant_membership_v1(p_owner_id,o.participant_id);
  perform pg_advisory_xact_lock(hashtextextended('validation-promotion-group:v1|'||p_owner_id::text||'|'||o.participant_id::text||'|'||p_expected_canonical_problem_id::text||'|'||p_expected_polarity||'|v8-b1.2',0));
  current_snapshot:=public.validation_promotion_authority_rows_v1(p_owner_id,o.participant_id);
  if current_snapshot is distinct from p_authority_snapshot then raise exception 'promotion_authority_changed' using errcode='40001'; end if;

  select * into o from public.validation_evidence_observations where id=p_observation_id and owner_id=p_owner_id for update;
  if o.origin<>'human_interview' or o.modality<>'interview_observation' or o.source_type<>'customer_interview' or o.interview_session_id is null
    or not exists(select 1 from jsonb_each(o.observation_content) x where jsonb_typeof(x.value)<>'null' and btrim(x.value#>>'{}')<>'')
  then raise exception 'promotion_not_eligible' using errcode='P0001'; end if;
  select * into s from public.validation_interview_sessions where id=o.interview_session_id and owner_id=p_owner_id for share;
  select * into p from public.validation_participants where id=o.participant_id and owner_id=p_owner_id for share;
  select * into e from public.validation_experiment_versions where id=o.experiment_version_id and owner_id=p_owner_id for share;
  select * into h from public.validation_hypothesis_versions where id=o.hypothesis_version_id and owner_id=p_owner_id for share;
  select * into subject from public.validation_subjects where id=o.subject_id and owner_id=p_owner_id for share;
  if s.id is null or p.id is null or e.id is null or h.id is null or subject.id is null or s.experiment_version_id<>o.experiment_version_id
    or s.participant_id<>o.participant_id or e.subject_id<>o.subject_id or e.hypothesis_version_id<>o.hypothesis_version_id
    or e.experiment_id<>o.experiment_id or e.hypothesis_id<>o.hypothesis_id or p.status<>'active'
    or s.status not in ('in_progress','completed') or e.lifecycle not in ('running','paused','completed')
    or e.family<>'customer_interview' or s.participant_relevance<>'target_segment_match'
  then raise exception 'promotion_not_eligible' using errcode='P0001'; end if;
  if subject.label is distinct from p_expected_subject_label or h.problem_claim is distinct from p_expected_hypothesis_claim
  then raise exception 'promotion_authority_changed' using errcode='40001'; end if;
  select * into canonical from public.canonical_problems where id=p_expected_canonical_problem_id and status='active' for share;
  if not found then raise exception 'promotion_canonical_unresolved' using errcode='P0001'; end if;
  select c.* into classification from public.validation_evidence_classifications c where c.observation_id=o.id and c.owner_id=p_owner_id
    and c.authority_status='authoritative' and c.classification_source<>'ai_model_suggested'
    and not exists(select 1 from public.validation_evidence_classifications successor where successor.owner_id=p_owner_id and successor.supersedes_classification_id=c.id);
  if (select count(*) from public.validation_evidence_classifications c where c.observation_id=o.id and c.owner_id=p_owner_id and c.authority_status='authoritative' and c.classification_source<>'ai_model_suggested' and not exists(select 1 from public.validation_evidence_classifications successor where successor.owner_id=p_owner_id and successor.supersedes_classification_id=c.id))<>1
    or classification.id is distinct from p_expected_classification_id or classification.polarity is distinct from p_expected_polarity
    or classification.polarity not in ('supporting','contradicting','mixed')
  then raise exception 'promotion_classification_authority' using errcode='P0001'; end if;
  polarity:=classification.polarity;
  select * into shareable from public.validation_customer_interview_shareable_evidence where owner_id=p_owner_id and source_observation_id=o.id for share;
  if shareable.id is null or shareable.contract_version<>'customer_interview_shareable_evidence_v1'
    or shareable.review_confirmation<>'human_reviewed_for_shared_evidence_use'
    or shareable.statement_sha256<>encode(extensions.digest(convert_to(shareable.statement,'UTF8'),'sha256'),'hex')
  then raise exception 'promotion_shareable_approval' using errcode='P0001'; end if;
  fingerprint:='vcip1:'||encode(extensions.digest(convert_to(concat_ws(E'\n','saasscout:validation-customer-interview-promotion:v1',o.id,classification.id,canonical.id,polarity,'v8-b1.2','v8-b3.0.2-exact.1','validation_customer_interview_promotion_v1'),'UTF8'),'sha256'),'hex');
  group_key:=encode(extensions.digest(convert_to(o.participant_id::text||'|'||canonical.id::text||'|'||polarity,'UTF8'),'sha256'),'hex');

  select * into existing from public.validation_evidence_promotions where owner_id=p_owner_id and observation_id=o.id and policy_version='v8-b1.2' and problem_observation_id is not null;
  if existing.id is not null then
    select * into result_observation from public.problem_observations where id=existing.problem_observation_id;
    if existing.classification_id is distinct from classification.id or existing.canonical_problem_id is distinct from canonical.id
      or existing.polarity is distinct from polarity or result_observation.id is null
      or result_observation.observation_fingerprint<>fingerprint or result_observation.canonical_problem_id<>canonical.id
      or result_observation.evidence_polarity<>polarity or result_observation.source_evidence<>shareable.statement
    then raise exception 'promotion_correction_required' using errcode='P0001'; end if;
    return jsonb_build_object('promotionId',existing.id,'problemObservationId',result_observation.id,'canonicalProblemId',canonical.id,'polarity',polarity,'alreadyPromoted',true);
  end if;
  if exists(select 1 from public.validation_evidence_promotions where owner_id=p_owner_id and observation_id=o.id and policy_version='v8-b1.2')
  then raise exception 'promotion_ledger_history_conflict' using errcode='23000'; end if;
  select * into existing_group from public.validation_evidence_promotions where owner_id=p_owner_id and representative_group_key=group_key and policy_version='v8-b1.2' and problem_observation_id is not null;
  if existing_group.id is not null then raise exception 'promotion_group_already_finalized' using errcode='P0001'; end if;
  if exists(select 1 from public.problem_observations where observation_fingerprint=fingerprint) then raise exception 'promotion_integrity_conflict' using errcode='23000'; end if;
  insert into public.problem_observations(canonical_problem_id,observation_fingerprint,problem_title,normalized_problem_title,problem_summary,source_type,source_evidence,observed_at,evidence_polarity)
  values(canonical.id,fingerprint,canonical.canonical_title,canonical.normalized_title,shareable.statement,'validation_customer_interview_promotion_v1',shareable.statement,o.observed_at,polarity) returning * into result_observation;
  insert into public.validation_evidence_promotions(owner_id,observation_id,classification_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,interview_session_id,policy_version,eligible,eligibility_reasons,independence_kind,independence_private_id,polarity,representative_group_key,representative_selected,canonical_problem_id,resolution_status,resolution_reason,resolver_version,problem_observation_id)
  values(p_owner_id,o.id,classification.id,o.subject_id,o.hypothesis_id,o.hypothesis_version_id,o.experiment_id,o.experiment_version_id,o.participant_id,o.interview_session_id,'v8-b1.2',true,array['eligible'],'participant',o.participant_id,polarity,group_key,true,canonical.id,'resolved','exact_normalized_identity','v8-b3.0.2-exact.1',result_observation.id) returning * into existing;
  return jsonb_build_object('promotionId',existing.id,'problemObservationId',result_observation.id,'canonicalProblemId',canonical.id,'polarity',polarity,'alreadyPromoted',false);
end $$;

revoke all on function public.validation_promotion_authority_rows_v1(uuid,uuid),public.validation_read_promotion_authority_v1(uuid,uuid),public.validation_lock_participant_membership_v1(uuid,uuid),public.validation_promote_customer_interview_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.validation_promotion_authority_rows_v1(uuid,uuid),public.validation_read_promotion_authority_v1(uuid,uuid),public.validation_lock_participant_membership_v1(uuid,uuid),public.validation_promote_customer_interview_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb) to service_role;
revoke all on function public.validation_lock_canonical_registry_v1(),public.validation_lock_observation_membership_v1(),public.validation_lock_participant_row_membership_v1(),public.validation_lock_session_membership_v1(),public.validation_lock_experiment_memberships_v1() from public,anon,authenticated;
grant execute on function public.validation_lock_canonical_registry_v1(),public.validation_lock_observation_membership_v1(),public.validation_lock_participant_row_membership_v1(),public.validation_lock_session_membership_v1(),public.validation_lock_experiment_memberships_v1() to service_role;
comment on function public.validation_promote_customer_interview_v1(uuid,uuid,uuid,uuid,text,text,text,jsonb) is 'V8-B3.1 atomic, explicit, service-role-only Customer Interview promotion boundary.';
