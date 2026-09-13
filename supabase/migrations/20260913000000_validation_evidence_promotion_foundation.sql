-- V8-B1: server-private preparation ledger only. No Data Moat writes or canonical mutations.
create table public.validation_evidence_promotions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  observation_id uuid not null,
  classification_id uuid,
  subject_id uuid not null,
  hypothesis_id uuid not null,
  hypothesis_version_id uuid not null,
  experiment_id uuid not null,
  experiment_version_id uuid not null,
  participant_id uuid not null,
  interview_session_id uuid not null,
  policy_version text not null check (length(btrim(policy_version)) > 0),
  eligible boolean not null,
  eligibility_reasons text[] not null check (cardinality(eligibility_reasons) > 0),
  independence_kind text not null check (independence_kind = 'participant'),
  independence_private_id uuid not null,
  polarity text check (polarity in ('supporting','contradicting','mixed','neutral','inconclusive')),
  representative_group_key text,
  representative_selected boolean not null default false,
  canonical_problem_id uuid references public.canonical_problems(id) on delete restrict,
  resolution_status text not null check (resolution_status in ('resolved','unmatched','ambiguous','insufficient_identity')),
  resolution_reason text not null check (length(btrim(resolution_reason)) > 0),
  resolver_version text not null check (length(btrim(resolver_version)) > 0),
  problem_observation_id uuid references public.problem_observations(id) on delete restrict,
  supersedes_promotion_id uuid,
  deactivation_reason text,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint validation_promotions_observation_fk foreign key (observation_id, owner_id)
    references public.validation_evidence_observations(id, owner_id) on delete restrict,
  constraint validation_promotions_classification_fk foreign key (classification_id, observation_id, owner_id)
    references public.validation_evidence_classifications(id, observation_id, owner_id) on delete restrict,
  constraint validation_promotions_lineage_fk foreign key (experiment_version_id, experiment_id, hypothesis_version_id, hypothesis_id, subject_id, owner_id)
    references public.validation_experiment_versions(id, experiment_id, hypothesis_version_id, hypothesis_id, subject_id, owner_id) on delete restrict,
  constraint validation_promotions_participant_fk foreign key (participant_id, owner_id)
    references public.validation_participants(id, owner_id) on delete restrict,
  constraint validation_promotions_session_fk foreign key (interview_session_id, experiment_version_id, participant_id, owner_id)
    references public.validation_interview_sessions(id, experiment_version_id, participant_id, owner_id) on delete restrict,
  constraint validation_promotions_resolution_check check ((resolution_status = 'resolved') = (canonical_problem_id is not null)),
  constraint validation_promotions_interview_independence_check check (independence_private_id = participant_id),
  constraint validation_promotions_eligibility_check check (
    not eligible or (classification_id is not null and polarity in ('supporting','contradicting','mixed'))
  ),
  constraint validation_promotions_representative_check check (
    not representative_selected or (
      eligible and representative_group_key is not null and
      resolution_status = 'resolved' and canonical_problem_id is not null
    )
  ),
  constraint validation_promotions_problem_observation_check check (
    problem_observation_id is null or (
      eligible and representative_selected and
      resolution_status = 'resolved' and canonical_problem_id is not null
    )
  ),
  constraint validation_promotions_not_self check (supersedes_promotion_id is null or supersedes_promotion_id <> id),
  unique (id, owner_id),
  unique (id, owner_id, observation_id, policy_version)
);

alter table public.validation_evidence_promotions add constraint validation_promotions_supersedes_fk
  foreign key (supersedes_promotion_id, owner_id, observation_id, policy_version)
  references public.validation_evidence_promotions(id, owner_id, observation_id, policy_version) on delete restrict;
create unique index validation_promotions_evaluation_idempotency_uidx
  on public.validation_evidence_promotions(owner_id, observation_id, classification_id, policy_version) nulls not distinct;
create unique index validation_promotions_one_successor_uidx on public.validation_evidence_promotions(owner_id, supersedes_promotion_id) where supersedes_promotion_id is not null;
create unique index validation_promotions_one_chain_root_uidx on public.validation_evidence_promotions(owner_id, observation_id, policy_version) where supersedes_promotion_id is null;
create index validation_promotions_group_idx on public.validation_evidence_promotions(owner_id, representative_group_key) where representative_group_key is not null;

create trigger validation_evidence_promotions_append_only before update or delete on public.validation_evidence_promotions
  for each row execute function public.validation_reject_change();
alter table public.validation_evidence_promotions enable row level security;
revoke all on public.validation_evidence_promotions from public, anon, authenticated;
grant all on public.validation_evidence_promotions to service_role;
comment on table public.validation_evidence_promotions is 'V8 server-private append-only evaluation ledger; never the promoted Data Moat observation.';
