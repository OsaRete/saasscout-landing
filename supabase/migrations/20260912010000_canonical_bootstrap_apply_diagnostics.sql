-- V8-B0.2.1: bounded stage diagnostics and corrected JSON observation UUID extraction.
create or replace function public.apply_canonical_bootstrap_activation(p_plan_hash text, p_candidates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
-- The trusted operator CLI establishes analyzer/plan legitimacy. This privileged RPC
-- is deliberately the transactional structural/ownership integrity boundary only.
declare
  candidate jsonb;
  alias jsonb;
  mapped public.canonical_bootstrap_activations%rowtype;
  canonical_id uuid;
  created_candidates integer := 0;
  reused_candidates integer := 0;
  created_aliases integer := 0;
  reused_aliases integer := 0;
  linked_observations integer := 0;
  already_linked integer := 0;
  expected integer;
  affected integer;
  verified integer;
  already_owned integer;
  has_mapping boolean;
  failure_stage text := 'preflight';
begin
  if p_plan_hash is null or p_plan_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_candidates) <> 'array' then
    raise exception using errcode = '22023', message = 'canonical_bootstrap_preflight_failed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('canonical_bootstrap_activation_v1', 0));

  if exists (select 1 from jsonb_array_elements(p_candidates) c group by c->>'candidateId' having count(*) > 1) then
    raise exception using errcode = 'P0001', message = 'canonical_bootstrap_preflight_failed';
  end if;
  if exists (select 1 from jsonb_array_elements(p_candidates) c group by c->>'candidateNormalizedTitle' having count(*) > 1) then
    raise exception using errcode = 'P0001', message = 'canonical_bootstrap_identity_collision';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_candidates) c cross join lateral jsonb_array_elements(c->'aliases') a
    group by a->>'normalizedAlias' having count(distinct c->>'candidateId') > 1
  ) then raise exception using errcode = 'P0001', message = 'canonical_bootstrap_alias_collision'; end if;
  -- Membership is globally one-to-one. This also rejects a duplicate ID inside one candidate.
  if exists (
    select 1 from jsonb_array_elements(p_candidates) c
      cross join lateral jsonb_array_elements_text(c->'observationIds') observation_id
    group by observation_id having count(*) > 1
  ) then raise exception using errcode = 'P0001', message = 'canonical_bootstrap_observation_conflict'; end if;

  -- Global preflight occurs under the single lock, before the first mutation.
  for candidate in select value from jsonb_array_elements(p_candidates) order by value->>'candidateId' loop
    if candidate->>'candidateId' !~ '^cb1_[0-9a-f]{24}$'
       or candidate->>'baseActivationDisposition' <> 'auto_activatable'
       or candidate->>'crossCandidateAuditDisposition' <> 'clearly_unique'
       or candidate->>'finalActivationDisposition' <> 'auto_activatable'
       or jsonb_array_length(candidate->'observationIds') < 2
       or candidate->>'candidateSnapshotHash' !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'canonical_bootstrap_preflight_failed';
    end if;
    select * into mapped from public.canonical_bootstrap_activations a
      where a.candidate_id = candidate->>'candidateId'
        and a.bootstrap_rule_version = candidate->>'bootstrapRuleVersion'
        and a.activation_eligibility_rule_version = candidate->>'activationEligibilityRuleVersion'
        and a.cross_candidate_audit_rule_version = candidate->>'crossCandidateAuditRuleVersion';
    has_mapping := found;
    if has_mapping and mapped.candidate_snapshot_hash <> candidate->>'candidateSnapshotHash' then
      raise exception using errcode = 'P0001', message = 'canonical_bootstrap_candidate_snapshot_mismatch';
    end if;
    if exists (select 1 from public.canonical_problems c where c.normalized_title = candidate->>'candidateNormalizedTitle' and (not has_mapping or c.id <> mapped.canonical_problem_id)) then
      raise exception using errcode = 'P0001', message = 'canonical_bootstrap_identity_collision';
    end if;
    for alias in select value from jsonb_array_elements(candidate->'aliases') loop
      if exists (select 1 from public.problem_aliases pa where pa.normalized_alias = alias->>'normalizedAlias' and (not has_mapping or pa.canonical_problem_id <> mapped.canonical_problem_id)) then
        raise exception using errcode = 'P0001', message = 'canonical_bootstrap_alias_collision';
      end if;
    end loop;
    if exists (
      select 1 from public.problem_observations po
      where po.id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds'))
        and po.canonical_problem_id is not null and (not has_mapping or po.canonical_problem_id <> mapped.canonical_problem_id)
    ) or (select count(*) from public.problem_observations po where po.id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds'))) <> jsonb_array_length(candidate->'observationIds') then
      raise exception using errcode = 'P0001', message = 'canonical_bootstrap_observation_conflict';
    end if;
  end loop;

  for candidate in select value from jsonb_array_elements(p_candidates) order by value->>'candidateId' loop
    select * into mapped from public.canonical_bootstrap_activations a where a.candidate_id = candidate->>'candidateId'
      and a.bootstrap_rule_version = candidate->>'bootstrapRuleVersion' and a.activation_eligibility_rule_version = candidate->>'activationEligibilityRuleVersion'
      and a.cross_candidate_audit_rule_version = candidate->>'crossCandidateAuditRuleVersion';
    if found then canonical_id := mapped.canonical_problem_id; reused_candidates := reused_candidates + 1;
    else
      failure_stage := 'canonical_insert';
      insert into public.canonical_problems (canonical_key, canonical_title, normalized_title, status)
        values ('bootstrap:' || candidate->>'bootstrapRuleVersion' || ':' || candidate->>'candidateId', candidate->>'candidateCanonicalTitle', candidate->>'candidateNormalizedTitle', 'active') returning id into canonical_id;
      failure_stage := 'ledger_insert';
      insert into public.canonical_bootstrap_activations (bootstrap_rule_version, activation_eligibility_rule_version, cross_candidate_audit_rule_version, candidate_id, candidate_snapshot_hash, canonical_problem_id, candidate_title, candidate_normalized_title, observation_ids, observation_count)
        values (candidate->>'bootstrapRuleVersion', candidate->>'activationEligibilityRuleVersion', candidate->>'crossCandidateAuditRuleVersion', candidate->>'candidateId', candidate->>'candidateSnapshotHash', canonical_id, candidate->>'candidateCanonicalTitle', candidate->>'candidateNormalizedTitle', array(select value::uuid from jsonb_array_elements_text(candidate->'observationIds')), jsonb_array_length(candidate->'observationIds'));
      created_candidates := created_candidates + 1;
    end if;
    for alias in select value from jsonb_array_elements(candidate->'aliases') loop
      failure_stage := 'alias_insert';
      insert into public.problem_aliases (canonical_problem_id, alias_text, normalized_alias, alias_type)
        values (canonical_id, alias->>'text', alias->>'normalizedAlias', 'title') on conflict (normalized_alias) do nothing;
      if found then created_aliases := created_aliases + 1; else reused_aliases := reused_aliases + 1; end if;
    end loop;
    expected := jsonb_array_length(candidate->'observationIds');
    select count(*) into already_owned from public.problem_observations
      where id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds'))
        and canonical_problem_id = canonical_id;
    failure_stage := 'observation_link';
    update public.problem_observations set canonical_problem_id = canonical_id, updated_at = now()
      where id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds')) and canonical_problem_id is null;
    get diagnostics affected = row_count;
    failure_stage := 'post_link_verification';
    select count(*) into verified from public.problem_observations
      where id in (select value::uuid from jsonb_array_elements_text(candidate->'observationIds'))
        and canonical_problem_id = canonical_id;
    if verified <> expected then
      raise exception using errcode = 'P0001', message = 'canonical_bootstrap_observation_conflict';
    end if;
    linked_observations := linked_observations + affected;
    already_linked := already_linked + already_owned;
  end loop;
  failure_stage := 'internal_integrity';
  return jsonb_build_object('activationPlanHash', p_plan_hash, 'candidatesCreated', created_candidates, 'candidatesReused', reused_candidates,
    'aliasesCreated', created_aliases, 'aliasesReused', reused_aliases, 'observationsLinked', linked_observations,
    'observationsAlreadyLinked', already_linked, 'status', case when created_candidates = 0 then 'already_applied' else 'applied' end);
exception when others then
  if sqlerrm in (
    'canonical_bootstrap_preflight_failed',
    'canonical_bootstrap_identity_collision',
    'canonical_bootstrap_alias_collision',
    'canonical_bootstrap_observation_conflict',
    'canonical_bootstrap_candidate_snapshot_mismatch'
  ) then raise; end if;

  raise exception using errcode = 'P0001', message = case failure_stage
    when 'canonical_insert' then 'canonical_bootstrap_canonical_insert_failed'
    when 'ledger_insert' then 'canonical_bootstrap_ledger_insert_failed'
    when 'alias_insert' then 'canonical_bootstrap_alias_insert_failed'
    when 'observation_link' then 'canonical_bootstrap_observation_link_failed'
    when 'post_link_verification' then 'canonical_bootstrap_post_link_verification_failed'
    when 'preflight' then 'canonical_bootstrap_preflight_failed'
    else 'canonical_bootstrap_internal_integrity_failed'
  end;
end;
$$;

revoke all on function public.apply_canonical_bootstrap_activation(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_canonical_bootstrap_activation(text, jsonb) to service_role;
