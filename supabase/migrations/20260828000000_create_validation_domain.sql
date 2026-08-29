-- PR V2: private, server-owned persistence for real-world Idea Validation.
-- This migration is additive. It does not read or mutate upstream or Data Moat rows.

create table public.validation_subjects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  creation_origin text not null,
  label text not null,
  context_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint validation_subjects_origin_check check (creation_origin in ('discover','scan','weekly','saved_idea','opportunity','user_entered')),
  constraint validation_subjects_status_check check (status in ('active','superseded','archived')),
  constraint validation_subjects_label_check check (length(btrim(label)) > 0),
  constraint validation_subjects_context_check check (jsonb_typeof(context_snapshot) = 'object'),
  constraint validation_subjects_archive_check check ((status = 'archived') = (archived_at is not null)),
  unique (id, owner_id)
);

create table public.validation_subject_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null,
  source_type text not null,
  source_row_id text not null,
  source_version text,
  link_role text not null default 'origin',
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint validation_subject_links_source_type_check check (source_type in ('discover','scan','weekly','saved_idea','opportunity')),
  constraint validation_subject_links_source_row_check check (length(btrim(source_row_id)) > 0),
  constraint validation_subject_links_role_check check (link_role in ('origin','supporting_context')),
  constraint validation_subject_links_context_check check (jsonb_typeof(context_snapshot) = 'object'),
  constraint validation_subject_links_subject_fk foreign key (subject_id, owner_id)
    references public.validation_subjects(id, owner_id) on delete restrict,
  unique (owner_id, subject_id, source_type, source_row_id, link_role),
  unique (id, owner_id)
);

create table public.validation_hypotheses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null,
  status text not null default 'draft',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint validation_hypotheses_status_check check (status in ('draft','active','superseded','retired')),
  constraint validation_hypotheses_subject_fk foreign key (subject_id, owner_id)
    references public.validation_subjects(id, owner_id) on delete restrict,
  unique (id, owner_id),
  unique (id, subject_id, owner_id)
);

create table public.validation_hypothesis_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null,
  hypothesis_id uuid not null,
  version_number integer not null check (version_number > 0),
  target_segment text not null check (length(btrim(target_segment)) > 0),
  problem_claim text not null check (length(btrim(problem_claim)) > 0),
  expected_observable_behavior text not null check (length(btrim(expected_observable_behavior)) > 0),
  commercial_assumption text,
  support_criteria jsonb not null,
  contradiction_criteria jsonb not null,
  inconclusive_criteria jsonb not null,
  scope_included jsonb not null default '[]'::jsonb,
  scope_excluded jsonb not null default '[]'::jsonb,
  supersedes_version_id uuid,
  created_at timestamptz not null default now(),
  constraint validation_hypothesis_versions_json_check check (
    jsonb_typeof(support_criteria) = 'array' and jsonb_array_length(support_criteria) > 0 and
    jsonb_typeof(contradiction_criteria) = 'array' and jsonb_array_length(contradiction_criteria) > 0 and
    jsonb_typeof(inconclusive_criteria) = 'array' and jsonb_array_length(inconclusive_criteria) > 0 and
    jsonb_typeof(scope_included) = 'array' and jsonb_typeof(scope_excluded) = 'array'
  ),
  constraint validation_hypothesis_versions_hypothesis_fk foreign key (hypothesis_id, subject_id, owner_id)
    references public.validation_hypotheses(id, subject_id, owner_id) on delete restrict,
  constraint validation_hypothesis_versions_not_self check (supersedes_version_id is null or supersedes_version_id <> id),
  unique (hypothesis_id, version_number),
  unique (id, owner_id),
  unique (id, hypothesis_id, subject_id, owner_id)
);

alter table public.validation_hypothesis_versions
  add constraint validation_hypothesis_versions_supersedes_fk
  foreign key (supersedes_version_id, hypothesis_id, subject_id, owner_id)
  references public.validation_hypothesis_versions(id, hypothesis_id, subject_id, owner_id) on delete restrict;

create table public.validation_experiments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null,
  visibility text not null default 'visible',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint validation_experiments_visibility_check check (visibility in ('visible','archived')),
  constraint validation_experiments_archive_check check ((visibility = 'archived') = (archived_at is not null)),
  constraint validation_experiments_subject_fk foreign key (subject_id, owner_id)
    references public.validation_subjects(id, owner_id) on delete restrict,
  unique (id, owner_id),
  unique (id, subject_id, owner_id)
);

create table public.validation_experiment_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null,
  experiment_id uuid not null,
  hypothesis_id uuid not null,
  hypothesis_version_id uuid not null,
  version_number integer not null check (version_number > 0),
  family text not null,
  target_audience jsonb not null,
  collection_method text not null check (length(btrim(collection_method)) > 0),
  design_snapshot jsonb not null,
  screening_criteria jsonb not null default '[]'::jsonb,
  consent_privacy_mode text not null,
  lifecycle text not null default 'draft',
  supersedes_version_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint validation_experiment_versions_family_check check (family in ('customer_interview','survey','landing_waitlist','social_validation_post')),
  constraint validation_experiment_versions_lifecycle_check check (lifecycle in ('draft','ready','running','paused','completed','cancelled')),
  constraint validation_experiment_versions_privacy_check check (consent_privacy_mode in ('anonymous_notes','pseudonymous_notes','identified_with_explicit_consent')),
  constraint validation_experiment_versions_json_check check (
    jsonb_typeof(target_audience) = 'array' and jsonb_array_length(target_audience) > 0 and
    jsonb_typeof(design_snapshot) = 'object' and
    jsonb_typeof(screening_criteria) = 'array'
  ),
  constraint validation_experiment_versions_terminal_time_check check (
    (lifecycle = 'completed' and completed_at is not null and cancelled_at is null) or
    (lifecycle = 'cancelled' and cancelled_at is not null and completed_at is null) or
    (lifecycle not in ('completed','cancelled') and completed_at is null and cancelled_at is null)
  ),
  constraint validation_experiment_versions_started_time_check check (
    (lifecycle in ('draft','ready') and started_at is null) or
    (lifecycle in ('running','paused','completed') and started_at is not null) or
    lifecycle = 'cancelled'
  ),
  constraint validation_experiment_versions_experiment_fk foreign key (experiment_id, subject_id, owner_id)
    references public.validation_experiments(id, subject_id, owner_id) on delete restrict,
  constraint validation_experiment_versions_hypothesis_version_fk foreign key (hypothesis_version_id, hypothesis_id, subject_id, owner_id)
    references public.validation_hypothesis_versions(id, hypothesis_id, subject_id, owner_id) on delete restrict,
  constraint validation_experiment_versions_not_self check (supersedes_version_id is null or supersedes_version_id <> id),
  unique (experiment_id, version_number),
  unique (id, owner_id),
  unique (id, experiment_id, subject_id, owner_id),
  unique (id, experiment_id, hypothesis_version_id, hypothesis_id, subject_id, owner_id)
);

alter table public.validation_experiment_versions
  add constraint validation_experiment_versions_supersedes_fk
  foreign key (supersedes_version_id, experiment_id, subject_id, owner_id)
  references public.validation_experiment_versions(id, experiment_id, subject_id, owner_id) on delete restrict;

create table public.validation_participants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  experiment_id uuid,
  identity_mode text not null,
  pseudonymous_reference text,
  independence_key text,
  status text not null default 'active',
  consent_mode text,
  consent_purpose text,
  consent_captured_at timestamptz,
  created_at timestamptz not null default now(),
  constraint validation_participants_identity_check check (identity_mode in ('anonymous','experiment_pseudonymous','owner_pseudonymous','identified_interview','manual_imported')),
  constraint validation_participants_status_check check (status in ('active','withdrawn','archived')),
  constraint validation_participants_consent_check check (consent_mode is null or consent_mode in ('not_required','acknowledged','explicit')),
  constraint validation_participants_experiment_mode_check check (identity_mode <> 'experiment_pseudonymous' or experiment_id is not null),
  constraint validation_participants_experiment_fk foreign key (experiment_id, owner_id)
    references public.validation_experiments(id, owner_id) on delete restrict,
  unique (id, owner_id)
);

create unique index validation_participants_owner_independence_uidx
  on public.validation_participants(owner_id, independence_key) where independence_key is not null;

create table public.validation_evidence_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  subject_id uuid not null,
  hypothesis_id uuid not null,
  hypothesis_version_id uuid not null,
  experiment_id uuid not null,
  experiment_version_id uuid not null,
  participant_id uuid,
  origin text not null,
  modality text not null,
  behavioral_event_type text,
  observed_at timestamptz not null,
  collected_at timestamptz not null default now(),
  source_type text not null check (length(btrim(source_type)) > 0),
  source_reference text,
  collected_by text not null,
  observation_content jsonb not null,
  content_fingerprint text,
  ingestion_key text,
  participant_independence_key text,
  independence_relationship text not null default 'unknown',
  anonymous_independence_uncertain boolean not null default false,
  created_at timestamptz not null default now(),
  constraint validation_evidence_origin_check check (origin in ('human_response','human_interview','survey_response','social_response','manual_human_observation','behavioral_observation')),
  constraint validation_evidence_modality_check check (modality in ('opinion','reported_behavior','observed_behavior','commercial_signal','structured_response','free_text_response','interview_observation','survey_answer','social_response','conversion_event')),
  constraint validation_evidence_event_check check (
    (behavioral_event_type is null) or
    (origin = 'behavioral_observation' and behavioral_event_type in ('page_view','cta_click','form_started','signup_submitted','demo_requested','pricing_interaction','deposit_completed','purchase_completed'))
  ),
  constraint validation_evidence_collector_check check (collected_by in ('manual','import','server_observed')),
  constraint validation_evidence_content_check check (jsonb_typeof(observation_content) = 'object'),
  constraint validation_evidence_independence_check check (independence_relationship in ('unknown','independent','duplicate','repeat_participant')),
  constraint validation_evidence_experiment_version_fk foreign key (experiment_version_id, experiment_id, hypothesis_version_id, hypothesis_id, subject_id, owner_id)
    references public.validation_experiment_versions(id, experiment_id, hypothesis_version_id, hypothesis_id, subject_id, owner_id) on delete restrict,
  constraint validation_evidence_participant_fk foreign key (participant_id, owner_id)
    references public.validation_participants(id, owner_id) on delete restrict,
  unique (id, owner_id)
);

create unique index validation_evidence_ingestion_uidx
  on public.validation_evidence_observations(owner_id, ingestion_key) where ingestion_key is not null;
create index validation_evidence_experiment_idx
  on public.validation_evidence_observations(owner_id, experiment_version_id, observed_at desc);
create index validation_evidence_fingerprint_idx
  on public.validation_evidence_observations(owner_id, content_fingerprint) where content_fingerprint is not null;

create table public.validation_evidence_classifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  observation_id uuid not null,
  polarity text not null,
  classification_source text not null,
  authority_status text not null,
  rationale text,
  supersedes_classification_id uuid,
  classified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint validation_classifications_polarity_check check (polarity in ('supporting','contradicting','mixed','neutral','inconclusive')),
  constraint validation_classifications_source_check check (classification_source in ('participant_supplied','user_supplied','deterministic_system_derived','ai_model_suggested','server_observed')),
  constraint validation_classifications_authority_check check (authority_status in ('authoritative','suggested')),
  constraint validation_classifications_ai_authority_check check (classification_source <> 'ai_model_suggested' or authority_status = 'suggested'),
  constraint validation_classifications_not_self check (supersedes_classification_id is null or supersedes_classification_id <> id),
  constraint validation_classifications_observation_fk foreign key (observation_id, owner_id)
    references public.validation_evidence_observations(id, owner_id) on delete restrict,
  unique (id, observation_id, owner_id),
  unique (id, owner_id)
);

alter table public.validation_evidence_classifications
  add constraint validation_classifications_supersedes_fk
  foreign key (supersedes_classification_id, observation_id, owner_id)
  references public.validation_evidence_classifications(id, observation_id, owner_id) on delete restrict;

create unique index validation_classifications_one_successor_uidx
  on public.validation_evidence_classifications(owner_id, supersedes_classification_id)
  where supersedes_classification_id is not null;

create index validation_subjects_owner_created_idx on public.validation_subjects(owner_id, created_at desc);
create index validation_subject_links_subject_idx on public.validation_subject_links(owner_id, subject_id);
create index validation_hypotheses_subject_idx on public.validation_hypotheses(owner_id, subject_id, created_at desc);
create index validation_hypothesis_versions_parent_idx on public.validation_hypothesis_versions(owner_id, hypothesis_id, version_number desc);
create index validation_experiments_subject_idx on public.validation_experiments(owner_id, subject_id, created_at desc);
create index validation_experiment_versions_parent_idx on public.validation_experiment_versions(owner_id, experiment_id, version_number desc);
create index validation_participants_owner_idx on public.validation_participants(owner_id, created_at desc);
create index validation_classifications_observation_idx on public.validation_evidence_classifications(owner_id, observation_id, classified_at desc);

-- Critical history is append-only even for privileged application connections.
create function public.validation_reject_change() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end;
$$;

create function public.validation_guard_experiment_version_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id <> old.id or new.owner_id <> old.owner_id or new.subject_id <> old.subject_id or
     new.experiment_id <> old.experiment_id or new.hypothesis_id <> old.hypothesis_id or
     new.hypothesis_version_id <> old.hypothesis_version_id or new.version_number <> old.version_number or
     new.family <> old.family or new.target_audience <> old.target_audience or
     new.collection_method <> old.collection_method or new.design_snapshot <> old.design_snapshot or
     new.screening_criteria <> old.screening_criteria or new.consent_privacy_mode <> old.consent_privacy_mode or
     new.supersedes_version_id is distinct from old.supersedes_version_id or new.created_at <> old.created_at or
     (old.started_at is not null and new.started_at is distinct from old.started_at) then
    raise exception 'experiment version design and lineage are immutable' using errcode = '55000';
  end if;
  if old.lifecycle in ('completed','cancelled') and new is distinct from old then
    raise exception 'terminal experiment version is immutable' using errcode = '55000';
  end if;
  if new.lifecycle <> old.lifecycle and not (
    (old.lifecycle = 'draft' and new.lifecycle in ('ready','cancelled')) or
    (old.lifecycle = 'ready' and new.lifecycle in ('draft','running','cancelled')) or
    (old.lifecycle = 'running' and new.lifecycle in ('paused','completed','cancelled')) or
    (old.lifecycle = 'paused' and new.lifecycle in ('running','completed','cancelled'))
  ) then
    raise exception 'invalid experiment lifecycle transition: % -> %', old.lifecycle, new.lifecycle using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.validation_guard_evidence_participant_scope() returns trigger
language plpgsql set search_path = public as $$
declare participant_experiment_id uuid;
begin
  if new.participant_id is null then
    return new;
  end if;

  select experiment_id into participant_experiment_id
  from public.validation_participants
  where id = new.participant_id and owner_id = new.owner_id;

  if found and participant_experiment_id is not null and participant_experiment_id <> new.experiment_id then
    raise exception 'experiment-scoped participant cannot be attached to evidence from another experiment'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function public.validation_guard_subject_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.id <> old.id or new.owner_id <> old.owner_id or new.creation_origin <> old.creation_origin or
     new.label <> old.label or new.context_snapshot <> old.context_snapshot or new.created_at <> old.created_at then
    raise exception 'validation subject identity and context are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger validation_hypothesis_versions_append_only before update or delete on public.validation_hypothesis_versions
  for each row execute function public.validation_reject_change();
create trigger validation_subject_links_append_only before update or delete on public.validation_subject_links
  for each row execute function public.validation_reject_change();
create trigger validation_evidence_observations_append_only before update or delete on public.validation_evidence_observations
  for each row execute function public.validation_reject_change();
create trigger validation_evidence_participant_scope before insert or update on public.validation_evidence_observations
  for each row execute function public.validation_guard_evidence_participant_scope();
create trigger validation_evidence_classifications_append_only before update or delete on public.validation_evidence_classifications
  for each row execute function public.validation_reject_change();
create trigger validation_experiment_versions_guard before update on public.validation_experiment_versions
  for each row execute function public.validation_guard_experiment_version_update();
create trigger validation_experiment_versions_no_delete before delete on public.validation_experiment_versions
  for each row execute function public.validation_reject_change();
create trigger validation_subjects_guard before update on public.validation_subjects
  for each row execute function public.validation_guard_subject_update();
create trigger validation_subjects_no_delete before delete on public.validation_subjects
  for each row execute function public.validation_reject_change();
create trigger validation_hypotheses_no_delete before delete on public.validation_hypotheses
  for each row execute function public.validation_reject_change();
create trigger validation_experiments_no_delete before delete on public.validation_experiments
  for each row execute function public.validation_reject_change();
create trigger validation_participants_no_delete before delete on public.validation_participants
  for each row execute function public.validation_reject_change();

-- Browser access is read-only and owner-scoped. All authoritative writes remain server-owned.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'validation_subjects','validation_subject_links','validation_hypotheses','validation_hypothesis_versions',
    'validation_experiments','validation_experiment_versions','validation_participants',
    'validation_evidence_observations','validation_evidence_classifications'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', 'validation_owner_select_' || table_name, table_name);
  end loop;
end $$;

revoke all on function public.validation_reject_change() from public, anon, authenticated;
revoke all on function public.validation_guard_experiment_version_update() from public, anon, authenticated;
revoke all on function public.validation_guard_subject_update() from public, anon, authenticated;
revoke all on function public.validation_guard_evidence_participant_scope() from public, anon, authenticated;
grant execute on function public.validation_reject_change() to service_role;
grant execute on function public.validation_guard_experiment_version_update() to service_role;
grant execute on function public.validation_guard_subject_update() to service_role;
grant execute on function public.validation_guard_evidence_participant_scope() to service_role;
