-- B4.2-B1 narrow integrity boundary. No historical backfill.
-- The B3.1 qualification, locks, duplicate paths and fingerprint contract below
-- are preserved verbatim; the only RPC body addition is the atomic snapshot INSERT.

alter table public.validation_evidence_promotions
  add constraint validation_promotions_snapshot_identity_unique
  unique(id, problem_observation_id, canonical_problem_id, promotion_fingerprint, projection_version);

create table public.validation_qualified_evidence_snapshots (
  promotion_id uuid primary key,
  problem_observation_id uuid not null unique,
  canonical_problem_id uuid not null,
  problem_title text not null check (length(btrim(problem_title)) > 0),
  source_evidence text not null check (
    length(btrim(source_evidence)) > 0 and char_length(source_evidence) <= 500
  ),
  source_type text not null check (source_type = 'customer_interview_human_reviewed'),
  evidence_polarity text not null check (evidence_polarity in ('supporting','contradicting','mixed')),
  observed_at timestamptz not null check (isfinite(observed_at)),
  observation_fingerprint text not null,
  promotion_fingerprint text not null check (promotion_fingerprint ~ '^[0-9a-f]{64}$'),
  projection_version text not null check (projection_version = 'v8-b3.1-projection.1'),
  attestation_version text not null check (attestation_version = 'v8-b4.2-b1-snapshot.1'),
  -- Exact FK-column uniqueness makes PostgREST's reverse embed one-to-one.
  constraint validation_snapshots_identity_unique unique (
    promotion_id, problem_observation_id, canonical_problem_id, promotion_fingerprint, projection_version
  ),
  constraint validation_snapshots_promotion_fk foreign key (
    promotion_id, problem_observation_id, canonical_problem_id, promotion_fingerprint, projection_version
  ) references public.validation_evidence_promotions(
    id, problem_observation_id, canonical_problem_id, promotion_fingerprint, projection_version
  ) on delete restrict,
  constraint validation_snapshots_shared_canonical_fk foreign key (problem_observation_id, canonical_problem_id)
    references public.problem_observations(id, canonical_problem_id) on delete restrict,
  constraint validation_snapshots_fingerprint_check check (
    observation_fingerprint = 'validation-promotion:' || promotion_fingerprint
  )
);
alter table public.validation_qualified_evidence_snapshots enable row level security;
revoke all on public.validation_qualified_evidence_snapshots from public, anon, authenticated, service_role;
grant select on public.validation_qualified_evidence_snapshots to service_role;

-- Runtime ledger fabrication, mutation, and truncation are forbidden.
-- Existing server code writes final ledgers only through the postgres-owned RPC.
revoke all on public.validation_evidence_promotions from public, anon, authenticated, service_role;
grant select on public.validation_evidence_promotions to service_role;

create trigger validation_qualified_snapshots_immutable
before update or delete on public.validation_qualified_evidence_snapshots
for each row execute function public.validation_reject_change();

-- The guard must read the PRIVATE snapshot even for a writer without SELECT.
-- This function has no callable mutation path and ignores caller-controlled GUCs.
create function public.validation_b42_guard_attested_observation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if exists (
    select 1 from public.validation_qualified_evidence_snapshots
    where problem_observation_id = old.id
  ) then
    raise exception 'attested evidence is immutable' using errcode='55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;
alter function public.validation_b42_guard_attested_observation() owner to postgres;
revoke all on function public.validation_b42_guard_attested_observation()
from public, anon, authenticated, service_role;
create trigger problem_observations_b42_integrity
before update or delete on public.problem_observations
for each row execute function public.validation_b42_guard_attested_observation();

-- TRUNCATE has no per-row guard. Keep ordinary Discovery/bootstrap DML grants;
-- remove only the table-wide erasure path that bypasses scoped row triggers.
revoke truncate on public.problem_observations from public, anon, authenticated, service_role;

comment on table public.validation_qualified_evidence_snapshots is
  'Private immutable attestation for newly controlled B3.1 promotions only; no private source text or automatic historical attestation.';

create or replace function public.validation_promote_customer_interview_evidence(
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
    order by candidate.experiment_version_id
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


  -- B4.2-B1: only a NEW controlled promotion creates an attestation.
  -- Both duplicate exits above deliberately leave historical rows unattested.
  -- An INSERT failure here rolls back the shared projection AND final ledger.
  insert into public.validation_qualified_evidence_snapshots(
    promotion_id, problem_observation_id, canonical_problem_id,
    problem_title, source_evidence, source_type, evidence_polarity,
    observed_at, observation_fingerprint, promotion_fingerprint,
    projection_version, attestation_version
  ) values (
    ledger_id, shared_id, canonical.id,
    canonical.canonical_title, share.statement,
    'customer_interview_human_reviewed', p_polarity,
    o.observed_at, 'validation-promotion:' || p_promotion_fingerprint,
    p_promotion_fingerprint, p_projection_version, 'v8-b4.2-b1-snapshot.1'
  );


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


alter function public.validation_promote_customer_interview_evidence(
  uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text
) owner to postgres;
revoke all on function public.validation_promote_customer_interview_evidence(
  uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.validation_promote_customer_interview_evidence(
  uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text
) to service_role;
comment on function public.validation_promote_customer_interview_evidence(
  uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,text,text,text,text
) is 'B3.1 atomic controlled promotion plus B4.2-B1 immutable private snapshot; exact retries do not attest history.';
