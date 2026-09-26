-- V8-B3.1 controlled Customer Interview evidence promotion.
--
-- Global coordination order:
-- canonical-registry
-- -> experiment version(s), UUID sorted
-- -> participant
-- -> representative-group
--
-- TypeScript remains authoritative for:
-- - promotion eligibility
-- - exact canonical resolution
-- - representative ranking/selection
--
-- PostgreSQL does NOT reproduce representative ranking.
-- It verifies that the persisted participant state used by TypeScript
-- is still current after coordination locks have been acquired.

alter table public.problem_observations
  add column evidence_polarity text
  check (
    evidence_polarity is null
    or evidence_polarity in (
      'supporting',
      'contradicting',
      'mixed'
    )
  );

alter table public.problem_observations
  add constraint problem_observations_id_canonical_unique
  unique(id, canonical_problem_id);

alter table public.validation_evidence_promotions
  add column promotion_fingerprint text;

alter table public.validation_evidence_promotions
  add column projection_version text;

alter table public.validation_evidence_promotions
  add constraint validation_promotions_fingerprint_check
  check (
    promotion_fingerprint is null
    or promotion_fingerprint ~ '^[0-9a-f]{64}$'
  );

alter table public.validation_evidence_promotions
  add constraint validation_promotions_result_canonical_fk
  foreign key(problem_observation_id, canonical_problem_id)
  references public.problem_observations(id, canonical_problem_id)
  on delete restrict;

create unique index validation_promotions_final_source_uidx
  on public.validation_evidence_promotions(
    owner_id,
    observation_id,
    policy_version
  )
  where problem_observation_id is not null;

create unique index validation_promotions_final_group_uidx
  on public.validation_evidence_promotions(
    owner_id,
    participant_id,
    canonical_problem_id,
    polarity,
    policy_version
  )
  where problem_observation_id is not null;

create unique index validation_promotions_fingerprint_uidx
  on public.validation_evidence_promotions(
    promotion_fingerprint
  )
  where promotion_fingerprint is not null;

create unique index validation_promotions_result_uidx
  on public.validation_evidence_promotions(
    problem_observation_id
  )
  where problem_observation_id is not null;


-- ---------------------------------------------------------------------
-- Coordination primitives
-- ---------------------------------------------------------------------

create function public.validation_b31_lock(
  p_domain text,
  p_identity text
)
returns void
language sql
set search_path=public
as $$
  select pg_advisory_xact_lock(
    hashtextextended(
      'v8-b3.1:' || p_domain || ':' || p_identity,
      0
    )
  );
$$;


-- Canonical registry mutations coordinate before any row mutation.
create function public.validation_b31_lock_registry_statement()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  perform public.validation_b31_lock(
    'canonical-registry',
    'v1'
  );

  return null;
end
$$;

create trigger canonical_problems_b31_coordination
before insert or update or delete
on public.canonical_problems
for each statement
execute function public.validation_b31_lock_registry_statement();

create trigger problem_aliases_b31_coordination
before insert or update or delete
on public.problem_aliases
for each statement
execute function public.validation_b31_lock_registry_statement();


-- ---------------------------------------------------------------------
-- Canonical authority snapshot
-- ---------------------------------------------------------------------

create function public.validation_b31_authority_snapshot(
  p_subject_id uuid,
  p_hypothesis_version_id uuid
)
returns jsonb
language sql
stable
set search_path=public
as $$
  select jsonb_build_object(
    'subjectLabel',
    (
      select label
      from public.validation_subjects
      where id = p_subject_id
    ),

    'hypothesisProblemClaim',
    (
      select problem_claim
      from public.validation_hypothesis_versions
      where id = p_hypothesis_version_id
    ),

    'canonicalProblems',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', id,
            'canonicalTitle', canonical_title,
            'normalizedTitle', normalized_title,
            'status', status
          )
          order by id::text
        )
        from public.canonical_problems
      ),
      '[]'::jsonb
    ),

    'aliases',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'canonicalProblemId', canonical_problem_id,
            'normalizedAlias', normalized_alias
          )
          order by
            canonical_problem_id::text,
            normalized_alias
        )
        from public.problem_aliases
      ),
      '[]'::jsonb
    )
  );
$$;


-- ---------------------------------------------------------------------
-- Representative freshness snapshot
-- ---------------------------------------------------------------------
--
-- This function intentionally does NOT:
-- - resolve canonical identity
-- - evaluate promotion eligibility
-- - rank observations
-- - choose a representative
--
-- It only reconstructs the persisted participant state that the
-- TypeScript B2 preparation pipeline used when it selected a
-- representative.
--
-- The promotion RPC compares this state after acquiring coordination
-- locks. Any relevant persisted-state change therefore fails closed and
-- requires preparation to run again.

create function public.validation_b31_representative_state(
  p_owner_id uuid,
  p_participant_id uuid
)
returns jsonb
language sql
stable
set search_path=public
as $$
  with participant_observations as (
    select
      o.id,
      o.owner_id,
      o.subject_id,
      o.hypothesis_id,
      o.hypothesis_version_id,
      o.experiment_id,
      o.experiment_version_id,
      o.participant_id,
      o.interview_session_id,
      o.origin,
      o.modality,
      o.source_type,
      o.observed_at,
      o.observation_content,
      o.participant_independence_key
    from public.validation_evidence_observations o
    where
      o.owner_id = p_owner_id
      and o.participant_id = p_participant_id
  ),

  participant_classifications as (
    select
      c.id,
      c.owner_id,
      c.observation_id,
      c.polarity,
      c.classification_source,
      c.authority_status,
      c.supersedes_classification_id
    from public.validation_evidence_classifications c
    where
      c.owner_id = p_owner_id
      and exists (
        select 1
        from participant_observations o
        where o.id = c.observation_id
      )
  ),

  participant_sessions as (
    select
      s.id,
      s.owner_id,
      s.subject_id,
      s.experiment_id,
      s.experiment_version_id,
      s.hypothesis_id,
      s.hypothesis_version_id,
      s.participant_id,
      s.status,
      s.participant_relevance
    from public.validation_interview_sessions s
    where
      s.owner_id = p_owner_id
      and exists (
        select 1
        from participant_observations o
        where o.interview_session_id = s.id
      )
  ),

  participant_experiments as (
    select
      e.id,
      e.owner_id,
      e.subject_id,
      e.experiment_id,
      e.hypothesis_id,
      e.hypothesis_version_id,
      e.family,
      e.lifecycle
    from public.validation_experiment_versions e
    where
      e.owner_id = p_owner_id
      and exists (
        select 1
        from participant_observations o
        where o.experiment_version_id = e.id
      )
  )

  select jsonb_build_object(
    'participant',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'owner_id', p.owner_id,
            'status', p.status
          )
          order by p.id::text
        )
        from public.validation_participants p
        where
          p.owner_id = p_owner_id
          and p.id = p_participant_id
      ),
      '[]'::jsonb
    ),

    'observations',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'owner_id', o.owner_id,
            'subject_id', o.subject_id,
            'hypothesis_id', o.hypothesis_id,
            'hypothesis_version_id', o.hypothesis_version_id,
            'experiment_id', o.experiment_id,
            'experiment_version_id', o.experiment_version_id,
            'participant_id', o.participant_id,
            'interview_session_id', o.interview_session_id,
            'origin', o.origin,
            'modality', o.modality,
            'source_type', o.source_type,
            'observed_at', o.observed_at,
            'observation_content', o.observation_content,
            'participant_independence_key',
              o.participant_independence_key
          )
          order by o.id::text
        )
        from participant_observations o
      ),
      '[]'::jsonb
    ),

    'classifications',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'owner_id', c.owner_id,
            'observation_id', c.observation_id,
            'polarity', c.polarity,
            'classification_source',
              c.classification_source,
            'authority_status', c.authority_status,
            'supersedes_classification_id',
              c.supersedes_classification_id
          )
          order by c.id::text
        )
        from participant_classifications c
      ),
      '[]'::jsonb
    ),

    'sessions',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'owner_id', s.owner_id,
            'subject_id', s.subject_id,
            'experiment_id', s.experiment_id,
            'experiment_version_id',
              s.experiment_version_id,
            'hypothesis_id', s.hypothesis_id,
            'hypothesis_version_id',
              s.hypothesis_version_id,
            'participant_id', s.participant_id,
            'status', s.status,
            'participant_relevance',
              s.participant_relevance
          )
          order by s.id::text
        )
        from participant_sessions s
      ),
      '[]'::jsonb
    ),

    'experiments',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'owner_id', e.owner_id,
            'subject_id', e.subject_id,
            'experiment_id', e.experiment_id,
            'hypothesis_id', e.hypothesis_id,
            'hypothesis_version_id',
              e.hypothesis_version_id,
            'family', e.family,
            'lifecycle', e.lifecycle
          )
          order by e.id::text
        )
        from participant_experiments e
      ),
      '[]'::jsonb
    )
  );
$$;


-- ---------------------------------------------------------------------
-- Atomic promotion boundary
-- ---------------------------------------------------------------------

create function public.validation_promote_customer_interview_evidence(
  p_owner_id uuid,
  p_observation_id uuid,
  p_classification_id uuid,
  p_canonical_problem_id uuid,
  p_polarity text,
  p_representative_group_key text,
  p_promotion_fingerprint text,
  p_representative_state jsonb,
  p_authority_snapshot jsonb,
  p_canonical_title text,
  p_normalized_title text,
  p_policy_version text,
  p_resolver_version text,
  p_projection_version text
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  o public.validation_evidence_observations;
  e public.validation_experiment_versions;
  p public.validation_participants;
  s public.validation_interview_sessions;
  c public.validation_evidence_classifications;
  share public.validation_customer_interview_shareable_evidence;
  canonical public.canonical_problems;
  prior public.validation_evidence_promotions;

  experiment_lock record;

  current_representative_state jsonb;

  shared_id uuid;
  ledger_id uuid;
  terminals integer;
begin
  if
    p_policy_version <> 'v8-b1.2'
    or p_resolver_version <> 'v8-b3.0.2-exact.1'
    or p_projection_version <> 'v8-b3.1-projection.1'
    or p_polarity not in (
      'supporting',
      'contradicting',
      'mixed'
    )
    or p_promotion_fingerprint !~ '^[0-9a-f]{64}$'
    or p_representative_state is null
    or jsonb_typeof(p_representative_state) <> 'object'
  then
    raise exception 'unsupported promotion contract'
      using errcode='23514';
  end if;


  -- Source finality can be checked before coordination as a fast path.
  -- It is checked again after coordination before any write.
  select *
  into prior
  from public.validation_evidence_promotions
  where
    owner_id = p_owner_id
    and observation_id = p_observation_id
    and policy_version = p_policy_version
    and problem_observation_id is not null;

  if found then
    if
      prior.promotion_fingerprint = p_promotion_fingerprint
      and prior.classification_id = p_classification_id
      and prior.canonical_problem_id = p_canonical_problem_id
      and prior.polarity = p_polarity
    then
      return jsonb_build_object(
        'promotionId', prior.id,
        'problemObservationId',
          prior.problem_observation_id,
        'duplicate', true
      );
    end if;

    raise exception
      'promotion correction required: source observation is final'
      using errcode='P0001';
  end if;


  -- Initial source lookup is used only to discover the authoritative
  -- participant identity required for coordination.
  select *
  into o
  from public.validation_evidence_observations
  where
    id = p_observation_id
    and owner_id = p_owner_id;

  if
    not found
    or o.participant_id is null
    or o.interview_session_id is null
  then
    raise exception 'ineligible observation'
      using errcode='23514';
  end if;


  -- ---------------------------------------------------------------
  -- Global lock order
  -- ---------------------------------------------------------------

  perform public.validation_b31_lock(
    'canonical-registry',
    'v1'
  );


  -- A participant may have persisted observations associated with more
  -- than one experiment version. Lock every currently represented
  -- experiment deterministically before taking the participant lock.
  --
  -- Concurrent insertion of a new observation also acquires its
  -- experiment lock before the participant lock. Therefore the
  -- participant lock becomes the serialization point for candidate-set
  -- membership.

  for experiment_lock in
    select distinct
      candidate.experiment_version_id
    from public.validation_evidence_observations candidate
    where
      candidate.owner_id = p_owner_id
      and candidate.participant_id = o.participant_id
      and candidate.experiment_version_id is not null
    order by candidate.experiment_version_id;
  loop
    perform public.validation_b31_lock(
      'experiment',
      experiment_lock.experiment_version_id::text
    );
  end loop;


  -- Ensure the requested observation's experiment is coordinated even
  -- if the candidate query above becomes unexpectedly incomplete.
  perform public.validation_b31_lock(
    'experiment',
    o.experiment_version_id::text
  );


  perform public.validation_b31_lock(
    'participant',
    o.participant_id::text
  );


  perform public.validation_b31_lock(
    'representative-group',
    p_owner_id::text
      || ':'
      || o.participant_id::text
      || ':'
      || p_canonical_problem_id::text
      || ':'
      || p_polarity
      || ':'
      || p_policy_version
  );


  -- ---------------------------------------------------------------
  -- Revalidate after coordination
  -- ---------------------------------------------------------------

  -- A concurrent exact retry or peer may have finalized while this
  -- transaction waited.
  select *
  into prior
  from public.validation_evidence_promotions
  where
    owner_id = p_owner_id
    and observation_id = p_observation_id
    and policy_version = p_policy_version
    and problem_observation_id is not null;

  if found then
    if
      prior.promotion_fingerprint = p_promotion_fingerprint
      and prior.classification_id = p_classification_id
      and prior.canonical_problem_id = p_canonical_problem_id
      and prior.polarity = p_polarity
    then
      return jsonb_build_object(
        'promotionId', prior.id,
        'problemObservationId',
          prior.problem_observation_id,
        'duplicate', true
      );
    end if;

    raise exception
      'promotion correction required: source observation is final'
      using errcode='P0001';
  end if;


  -- Re-read the source after locks.
  select *
  into o
  from public.validation_evidence_observations
  where
    id = p_observation_id
    and owner_id = p_owner_id;

  if
    not found
    or o.participant_id is null
    or o.interview_session_id is null
  then
    raise exception
      'promotion eligibility changed'
      using errcode='40001';
  end if;


  -- ---------------------------------------------------------------
  -- P1 representative freshness proof
  -- ---------------------------------------------------------------
  --
  -- PostgreSQL does not rank observations here.
  --
  -- TypeScript already selected the representative. PostgreSQL merely
  -- proves that the persisted participant state used for that decision
  -- has not changed since preparation.

  current_representative_state :=
    public.validation_b31_representative_state(
      p_owner_id,
      o.participant_id
    );

  if
    current_representative_state
      is distinct from p_representative_state
  then
    raise exception
      'representative authority state changed'
      using errcode='40001';
  end if;


  -- ---------------------------------------------------------------
  -- Existing B3.1 authoritative revalidation
  -- ---------------------------------------------------------------

  select *
  into e
  from public.validation_experiment_versions
  where
    id = o.experiment_version_id
    and owner_id = p_owner_id;

  select *
  into p
  from public.validation_participants
  where
    id = o.participant_id
    and owner_id = p_owner_id;

  select *
  into s
  from public.validation_interview_sessions
  where
    id = o.interview_session_id
    and owner_id = p_owner_id;

  select *
  into c
  from public.validation_evidence_classifications
  where
    id = p_classification_id
    and observation_id = o.id
    and owner_id = p_owner_id;

  select *
  into share
  from public.validation_customer_interview_shareable_evidence
  where
    source_observation_id = o.id
    and owner_id = p_owner_id;

  select *
  into canonical
  from public.canonical_problems
  where
    id = p_canonical_problem_id
    and status = 'active';


  if
    public.validation_b31_authority_snapshot(
      o.subject_id,
      o.hypothesis_version_id
    )
    is distinct from p_authority_snapshot
  then
    raise exception
      'canonical authority snapshot changed'
      using errcode='40001';
  end if;


  if
    canonical.id is null
    or canonical.canonical_title <> p_canonical_title
    or canonical.normalized_title <> p_normalized_title
  then
    raise exception
      'canonical authority snapshot changed'
      using errcode='40001';
  end if;


  if
    o.origin <> 'human_interview'
    or o.modality <> 'interview_observation'
    or o.source_type <> 'customer_interview'
    or jsonb_typeof(o.observation_content) <> 'object'
    or o.observation_content = '{}'::jsonb

    or e.family <> 'customer_interview'
    or e.lifecycle not in (
      'running',
      'paused',
      'completed'
    )

    or p.status <> 'active'

    or s.status not in (
      'in_progress',
      'completed'
    )

    or s.participant_relevance
      <> 'target_segment_match'

    or s.participant_id <> o.participant_id
    or s.experiment_version_id
      <> o.experiment_version_id

    or c.id is null
    or c.authority_status <> 'authoritative'
    or c.classification_source = 'ai_model_suggested'
    or c.polarity <> p_polarity
  then
    raise exception
      'promotion eligibility changed'
      using errcode='23514';
  end if;


  select count(*)
  into terminals
  from public.validation_evidence_classifications x
  where
    x.owner_id = p_owner_id
    and x.observation_id = o.id
    and x.authority_status = 'authoritative'
    and x.classification_source <> 'ai_model_suggested'
    and not exists (
      select 1
      from public.validation_evidence_classifications successor
      where
        successor.owner_id = x.owner_id
        and successor.supersedes_classification_id = x.id
    );


  if
    terminals <> 1
    or exists (
      select 1
      from public.validation_evidence_classifications successor
      where
        successor.owner_id = p_owner_id
        and successor.supersedes_classification_id = c.id
    )
  then
    raise exception
      'authoritative classification changed'
      using errcode='40001';
  end if;


  if
    share.id is null
    or share.contract_version
      <> 'customer_interview_shareable_evidence_v1'
    or share.review_confirmation
      <> 'human_reviewed_for_shared_evidence_use'
    or share.statement_sha256
      <> encode(
        extensions.digest(
          convert_to(
            share.statement,
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
  then
    raise exception
      'approved shareable evidence required'
      using errcode='23514';
  end if;


  -- ---------------------------------------------------------------
  -- Atomic shared projection + private ledger
  -- ---------------------------------------------------------------

  insert into public.problem_observations(
    canonical_problem_id,
    observation_fingerprint,
    problem_title,
    normalized_problem_title,
    source_type,
    source_evidence,
    evidence_polarity,
    observed_at,
    metadata
  )
  values(
    canonical.id,
    'validation-promotion:' || p_promotion_fingerprint,
    canonical.canonical_title,
    canonical.normalized_title,
    'customer_interview_human_reviewed',
    share.statement,
    p_polarity,
    o.observed_at,
    jsonb_build_object(
      'projectionVersion',
      p_projection_version
    )
  )
  returning id
  into shared_id;


  insert into public.validation_evidence_promotions(
    owner_id,
    observation_id,
    classification_id,
    subject_id,
    hypothesis_id,
    hypothesis_version_id,
    experiment_id,
    experiment_version_id,
    participant_id,
    interview_session_id,
    policy_version,
    eligible,
    eligibility_reasons,
    independence_kind,
    independence_private_id,
    polarity,
    representative_group_key,
    representative_selected,
    canonical_problem_id,
    resolution_status,
    resolution_reason,
    resolver_version,
    problem_observation_id,
    promotion_fingerprint,
    projection_version
  )
  values(
    p_owner_id,
    o.id,
    c.id,
    o.subject_id,
    o.hypothesis_id,
    o.hypothesis_version_id,
    o.experiment_id,
    o.experiment_version_id,
    o.participant_id,
    o.interview_session_id,
    p_policy_version,
    true,
    array['eligible'],
    'participant',
    o.participant_id,
    p_polarity,
    p_representative_group_key,
    true,
    canonical.id,
    'resolved',
    'server_exact_authority_snapshot',
    p_resolver_version,
    shared_id,
    p_promotion_fingerprint,
    p_projection_version
  )
  returning id
  into ledger_id;


  return jsonb_build_object(
    'promotionId',
    ledger_id,
    'problemObservationId',
    shared_id,
    'duplicate',
    false
  );
end
$$;


-- ---------------------------------------------------------------------
-- Membership-changing coordinators
-- ---------------------------------------------------------------------
--
-- These acquire advisory locks before UPDATE/INSERT to avoid
-- tuple/advisory lock inversion.

create or replace function public.validation_transition_experiment_version(
  p_owner_id uuid,
  p_version_id uuid,
  p_expected_lifecycle text,
  p_target_lifecycle text
)
returns jsonb
language plpgsql
set search_path=public
as $$
declare
  v public.validation_experiment_versions;
  t timestamptz := clock_timestamp();
begin
  perform public.validation_b31_lock(
    'experiment',
    p_version_id::text
  );

  update public.validation_experiment_versions
  set
    lifecycle = p_target_lifecycle,
    started_at = case
      when p_target_lifecycle = 'running'
        then coalesce(started_at, t)
      else started_at
    end,
    completed_at = case
      when p_target_lifecycle = 'completed'
        then t
      else completed_at
    end,
    cancelled_at = case
      when p_target_lifecycle = 'cancelled'
        then t
      else cancelled_at
    end
  where
    id = p_version_id
    and owner_id = p_owner_id
    and lifecycle = p_expected_lifecycle
  returning *
  into v;

  if not found then
    raise exception 'stale lifecycle'
      using errcode='40001';
  end if;

  return to_jsonb(v) - 'owner_id';
end
$$;


create or replace function public.validation_update_interview_session(
  p_owner_id uuid,
  p_session_id uuid,
  p_expected_status text,
  p_target_status text,
  p_notes text
)
returns jsonb
language plpgsql
set search_path=public
as $$
declare
  current_session public.validation_interview_sessions;
  parent public.validation_experiment_versions;
  s public.validation_interview_sessions;
  t timestamptz := clock_timestamp();
begin
  select *
  into current_session
  from public.validation_interview_sessions
  where
    id = p_session_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'stale interview'
      using errcode='40001';
  end if;

  perform public.validation_b31_lock(
    'experiment',
    current_session.experiment_version_id::text
  );

  perform public.validation_b31_lock(
    'participant',
    current_session.participant_id::text
  );

  if
    p_expected_status = 'draft'
    and p_target_status = 'in_progress'
  then
    select *
    into parent
    from public.validation_experiment_versions
    where
      id = current_session.experiment_version_id
      and owner_id = p_owner_id
      and family = 'customer_interview';

    if
      not found
      or parent.lifecycle <> 'running'
    then
      raise exception
        'parent experiment is not running'
        using errcode='40001';
    end if;
  end if;

  update public.validation_interview_sessions
  set
    notes = p_notes,
    status = p_target_status,
    started_at = case
      when p_target_status = 'in_progress'
        then coalesce(started_at, t)
      else started_at
    end,
    completed_at = case
      when p_target_status = 'completed'
        then t
      else completed_at
    end,
    cancelled_at = case
      when p_target_status = 'cancelled'
        then t
      else cancelled_at
    end
  where
    id = p_session_id
    and owner_id = p_owner_id
    and status = p_expected_status
  returning *
  into s;

  if not found then
    raise exception 'stale interview'
      using errcode='40001';
  end if;

  return to_jsonb(s) - 'owner_id';
end
$$;


create function public.validation_update_interview_relevance(
  p_owner_id uuid,
  p_session_id uuid,
  p_expected_relevance text,
  p_target_relevance text
)
returns jsonb
language plpgsql
set search_path=public
as $$
declare
  s public.validation_interview_sessions;
begin
  select *
  into s
  from public.validation_interview_sessions
  where
    id = p_session_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'stale interview'
      using errcode='40001';
  end if;

  perform public.validation_b31_lock(
    'experiment',
    s.experiment_version_id::text
  );

  perform public.validation_b31_lock(
    'participant',
    s.participant_id::text
  );

  update public.validation_interview_sessions
  set participant_relevance = p_target_relevance
  where
    id = p_session_id
    and owner_id = p_owner_id
    and participant_relevance = p_expected_relevance
  returning *
  into s;

  if not found then
    raise exception 'stale interview'
      using errcode='40001';
  end if;

  return
    to_jsonb(s)
    - 'owner_id'
    - 'notes';
end
$$;


create function public.validation_update_participant_status(
  p_owner_id uuid,
  p_participant_id uuid,
  p_expected_status text,
  p_target_status text
)
returns jsonb
language plpgsql
set search_path=public
as $$
declare
  p public.validation_participants;
begin
  perform public.validation_b31_lock(
    'participant',
    p_participant_id::text
  );

  update public.validation_participants
  set status = p_target_status
  where
    id = p_participant_id
    and owner_id = p_owner_id
    and status = p_expected_status
  returning *
  into p;

  if not found then
    raise exception 'stale participant'
      using errcode='40001';
  end if;

  return to_jsonb(p) - 'owner_id';
end
$$;


create function public.validation_insert_classification(
  p_owner_id uuid,
  p_observation_id uuid,
  p_polarity text,
  p_classification_source text,
  p_authority_status text,
  p_rationale text,
  p_supersedes_classification_id uuid
)
returns jsonb
language plpgsql
set search_path=public
as $$
declare
  o public.validation_evidence_observations;
  c public.validation_evidence_classifications;
begin
  select *
  into o
  from public.validation_evidence_observations
  where
    id = p_observation_id
    and owner_id = p_owner_id;

  if not found then
    raise exception 'not found'
      using errcode='P0002';
  end if;

  perform public.validation_b31_lock(
    'experiment',
    o.experiment_version_id::text
  );

  if o.participant_id is not null then
    perform public.validation_b31_lock(
      'participant',
      o.participant_id::text
    );
  end if;

  insert into public.validation_evidence_classifications(
    owner_id,
    observation_id,
    polarity,
    classification_source,
    authority_status,
    rationale,
    supersedes_classification_id
  )
  values(
    p_owner_id,
    p_observation_id,
    p_polarity,
    p_classification_source,
    p_authority_status,
    p_rationale,
    p_supersedes_classification_id
  )
  returning *
  into c;

  return to_jsonb(c) - 'owner_id';
end
$$;


-- ---------------------------------------------------------------------
-- INSERT coordination
-- ---------------------------------------------------------------------

create function public.validation_b31_coordinate_observation_insert()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  perform public.validation_b31_lock(
    'experiment',
    new.experiment_version_id::text
  );

  if new.participant_id is not null then
    perform public.validation_b31_lock(
      'participant',
      new.participant_id::text
    );
  end if;

  return new;
end
$$;

create trigger validation_observation_b31_coordination
before insert
on public.validation_evidence_observations
for each row
execute function
  public.validation_b31_coordinate_observation_insert();


create function public.validation_b31_coordinate_classification_insert()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  o public.validation_evidence_observations;
begin
  select *
  into o
  from public.validation_evidence_observations
  where
    id = new.observation_id
    and owner_id = new.owner_id;

  if found then
    perform public.validation_b31_lock(
      'experiment',
      o.experiment_version_id::text
    );

    if o.participant_id is not null then
      perform public.validation_b31_lock(
        'participant',
        o.participant_id::text
      );
    end if;
  end if;

  return new;
end
$$;

create trigger validation_classification_b31_coordination
before insert
on public.validation_evidence_classifications
for each row
execute function
  public.validation_b31_coordinate_classification_insert();


-- ---------------------------------------------------------------------
-- Privilege boundary
-- ---------------------------------------------------------------------

revoke all on function
  public.validation_b31_lock(text,text),
  public.validation_b31_authority_snapshot(uuid,uuid),
  public.validation_b31_representative_state(uuid,uuid),
  public.validation_promote_customer_interview_evidence(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    jsonb,
    jsonb,
    text,
    text,
    text,
    text,
    text
  ),
  public.validation_update_interview_relevance(
    uuid,
    uuid,
    text,
    text
  ),
  public.validation_update_participant_status(
    uuid,
    uuid,
    text,
    text
  ),
  public.validation_insert_classification(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    uuid
  ),
  public.validation_b31_lock_registry_statement(),
  public.validation_b31_coordinate_observation_insert(),
  public.validation_b31_coordinate_classification_insert()
from public,anon,authenticated;


grant execute on function
  public.validation_b31_lock(text,text),
  public.validation_b31_authority_snapshot(uuid,uuid),
  public.validation_b31_representative_state(uuid,uuid),
  public.validation_promote_customer_interview_evidence(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    jsonb,
    jsonb,
    text,
    text,
    text,
    text,
    text
  ),
  public.validation_update_interview_relevance(
    uuid,
    uuid,
    text,
    text
  ),
  public.validation_update_participant_status(
    uuid,
    uuid,
    text,
    text
  ),
  public.validation_insert_classification(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    uuid
  )
to service_role;


comment on function
  public.validation_promote_customer_interview_evidence(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    jsonb,
    jsonb,
    text,
    text,
    text,
    text,
    text
  )
is
  'Atomic B3.1 boundary: verifies server-prepared representative state after coordination locks, then writes one sanitized shared observation and one private final ledger row; no downstream writes.';