-- Knowledge Evolution additive schema migration.
--
-- This migration is schema-only. It introduces the future Knowledge Evolution
-- persistence layer without changing production application behavior, without
-- touching legacy tables, and without adding backfill or dual-write logic.
-- Existing reads and writes remain on the legacy tables until later rollout phases.

create extension if not exists pgcrypto;

create table if not exists public.canonical_problems (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  canonical_title text not null,
  normalized_title text not null,
  summary text,
  primary_niche text,
  affected_niches text[] not null default '{}',
  problem_cluster text,
  status text not null default 'candidate' check (status in ('candidate', 'active', 'merged', 'deprecated', 'archived')),
  merged_into_problem_id uuid references public.canonical_problems(id) on delete set null,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  observation_count integer not null default 0 check (observation_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  source_type_count integer not null default 0 check (source_type_count >= 0),
  avg_pain_score numeric(4,2) check (avg_pain_score is null or (avg_pain_score >= 0 and avg_pain_score <= 10)),
  avg_revenue_score numeric(4,2) check (avg_revenue_score is null or (avg_revenue_score >= 0 and avg_revenue_score <= 10)),
  avg_urgency_score numeric(4,2) check (avg_urgency_score is null or (avg_urgency_score >= 0 and avg_urgency_score <= 10)),
  avg_trend_score numeric(4,2) check (avg_trend_score is null or (avg_trend_score >= 0 and avg_trend_score <= 10)),
  avg_buying_signal_score numeric(4,2) check (avg_buying_signal_score is null or (avg_buying_signal_score >= 0 and avg_buying_signal_score <= 10)),
  avg_frequency_score numeric(4,2) check (avg_frequency_score is null or (avg_frequency_score >= 0 and avg_frequency_score <= 10)),
  avg_source_quality_score numeric(4,2) check (avg_source_quality_score is null or (avg_source_quality_score >= 0 and avg_source_quality_score <= 10)),
  avg_opportunity_score numeric(4,2) check (avg_opportunity_score is null or (avg_opportunity_score >= 0 and avg_opportunity_score <= 10)),
  intelligence_score numeric(6,2) check (intelligence_score is null or intelligence_score >= 0),
  confidence_score numeric(4,2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 10)),
  evolution_state text not null default 'insufficient_evidence' check (evolution_state in ('emerging', 'accelerating', 'stable', 'declining', 'recurring', 'insufficient_evidence')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canonical_problems_no_self_merge check (merged_into_problem_id is null or merged_into_problem_id <> id)
);

comment on table public.canonical_problems is 'Knowledge Evolution canonical identity table for durable, consolidated market problems. Additive schema-only; not used by production application logic yet.';

create table if not exists public.problem_observations (
  id uuid primary key default gen_random_uuid(),
  canonical_problem_id uuid references public.canonical_problems(id) on delete set null,
  observation_fingerprint text not null,
  problem_title text not null,
  normalized_problem_title text not null,
  problem_summary text,
  source_table text,
  source_row_id text,
  source_url text,
  source_type text,
  source_evidence text,
  source_author_id text,
  source_metrics jsonb not null default '{}'::jsonb,
  affected_niches text[] not null default '{}',
  problem_cluster text,
  pain_score numeric(4,2) check (pain_score is null or (pain_score >= 0 and pain_score <= 10)),
  revenue_score numeric(4,2) check (revenue_score is null or (revenue_score >= 0 and revenue_score <= 10)),
  urgency_score numeric(4,2) check (urgency_score is null or (urgency_score >= 0 and urgency_score <= 10)),
  trend_score numeric(4,2) check (trend_score is null or (trend_score >= 0 and trend_score <= 10)),
  buying_signal_score numeric(4,2) check (buying_signal_score is null or (buying_signal_score >= 0 and buying_signal_score <= 10)),
  frequency_score numeric(4,2) check (frequency_score is null or (frequency_score >= 0 and frequency_score <= 10)),
  source_quality_score numeric(4,2) check (source_quality_score is null or (source_quality_score >= 0 and source_quality_score <= 10)),
  opportunity_score numeric(4,2) check (opportunity_score is null or (opportunity_score >= 0 and opportunity_score <= 10)),
  confidence_score numeric(4,2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 10)),
  evidence_quality text check (evidence_quality is null or evidence_quality in ('low', 'medium', 'high')),
  observed_at timestamptz,
  ingested_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.problem_observations is 'Append-only Knowledge Evolution evidence ledger for market problem observations. Canonical resolution is nullable so unresolved observations can be retained safely.';

create table if not exists public.problem_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_problem_id uuid not null references public.canonical_problems(id) on delete cascade,
  alias_text text not null,
  normalized_alias text not null,
  alias_type text not null check (alias_type in ('title', 'cluster', 'source_phrase', 'legacy_title', 'user_phrase', 'resolver_generated')),
  confidence_score numeric(4,2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 10)),
  source_table text,
  source_row_id text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.problem_aliases is 'Resolver-owned aliases that map alternate titles, phrases, clusters, and legacy labels to canonical Knowledge Evolution problems.';

create table if not exists public.problem_evolution_snapshots (
  id uuid primary key default gen_random_uuid(),
  canonical_problem_id uuid not null references public.canonical_problems(id) on delete cascade,
  snapshot_period text not null check (snapshot_period in ('daily', 'weekly', 'backfill', 'merge_event', 'manual')),
  snapshot_at timestamptz not null,
  window_start timestamptz,
  window_end timestamptz,
  observation_count integer not null default 0 check (observation_count >= 0),
  cumulative_observation_count integer not null default 0 check (cumulative_observation_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  source_type_count integer not null default 0 check (source_type_count >= 0),
  avg_pain_score numeric(4,2) check (avg_pain_score is null or (avg_pain_score >= 0 and avg_pain_score <= 10)),
  avg_revenue_score numeric(4,2) check (avg_revenue_score is null or (avg_revenue_score >= 0 and avg_revenue_score <= 10)),
  avg_urgency_score numeric(4,2) check (avg_urgency_score is null or (avg_urgency_score >= 0 and avg_urgency_score <= 10)),
  avg_trend_score numeric(4,2) check (avg_trend_score is null or (avg_trend_score >= 0 and avg_trend_score <= 10)),
  avg_buying_signal_score numeric(4,2) check (avg_buying_signal_score is null or (avg_buying_signal_score >= 0 and avg_buying_signal_score <= 10)),
  avg_frequency_score numeric(4,2) check (avg_frequency_score is null or (avg_frequency_score >= 0 and avg_frequency_score <= 10)),
  avg_source_quality_score numeric(4,2) check (avg_source_quality_score is null or (avg_source_quality_score >= 0 and avg_source_quality_score <= 10)),
  avg_opportunity_score numeric(4,2) check (avg_opportunity_score is null or (avg_opportunity_score >= 0 and avg_opportunity_score <= 10)),
  intelligence_score numeric(6,2) check (intelligence_score is null or intelligence_score >= 0),
  confidence_score numeric(4,2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 10)),
  velocity_score numeric(6,2) check (velocity_score is null or velocity_score >= 0),
  acceleration_score numeric(6,2),
  persistence_score numeric(6,2) check (persistence_score is null or persistence_score >= 0),
  evolution_state text not null default 'insufficient_evidence' check (evolution_state in ('emerging', 'accelerating', 'stable', 'declining', 'recurring', 'insufficient_evidence')),
  decision_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.problem_evolution_snapshots is 'Periodic derived Knowledge Evolution state for canonical problems. Created for future server-side intelligence jobs; no production reads are switched in this migration.';

create table if not exists public.problem_feedback_events (
  id uuid primary key default gen_random_uuid(),
  canonical_problem_id uuid references public.canonical_problems(id) on delete set null,
  user_id uuid,
  related_discovery_id uuid,
  related_discovered_problem_id uuid,
  event_type text not null check (event_type in ('saved', 'dismissed', 'validated', 'invalidated', 'founder_matched', 'built', 'launched', 'revenue_reported', 'failed', 'pivoted', 'qualitative_feedback', 'system_inferred')),
  event_value numeric,
  event_text text,
  event_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.problem_feedback_events is 'Feedback Moat event ledger for user and system feedback tied to canonical problems. Direct authenticated access is restricted to a user''s own rows.';

create unique index if not exists canonical_problems_canonical_key_key on public.canonical_problems(canonical_key);
create index if not exists canonical_problems_normalized_title_idx on public.canonical_problems(normalized_title);
create index if not exists canonical_problems_status_intelligence_score_idx on public.canonical_problems(status, intelligence_score desc);
create index if not exists canonical_problems_evolution_state_updated_at_idx on public.canonical_problems(evolution_state, updated_at desc);
create index if not exists canonical_problems_primary_niche_intelligence_score_idx on public.canonical_problems(primary_niche, intelligence_score desc);
create index if not exists canonical_problems_last_seen_at_idx on public.canonical_problems(last_seen_at desc);

create unique index if not exists problem_observations_observation_fingerprint_key on public.problem_observations(observation_fingerprint);
create index if not exists problem_observations_canonical_problem_observed_idx on public.problem_observations(canonical_problem_id, observed_at desc);
create index if not exists problem_observations_normalized_problem_title_idx on public.problem_observations(normalized_problem_title);
create index if not exists problem_observations_source_trace_idx on public.problem_observations(source_table, source_row_id);
create index if not exists problem_observations_source_type_observed_idx on public.problem_observations(source_type, observed_at desc);
create index if not exists problem_observations_problem_cluster_observed_idx on public.problem_observations(problem_cluster, observed_at desc);

create unique index if not exists problem_aliases_canonical_normalized_type_key on public.problem_aliases(canonical_problem_id, normalized_alias, alias_type);
create index if not exists problem_aliases_normalized_alias_idx on public.problem_aliases(normalized_alias);
create index if not exists problem_aliases_alias_type_confidence_idx on public.problem_aliases(alias_type, confidence_score desc);
create index if not exists problem_aliases_source_trace_idx on public.problem_aliases(source_table, source_row_id);

create unique index if not exists problem_evolution_snapshots_unique_period_key on public.problem_evolution_snapshots(canonical_problem_id, snapshot_period, snapshot_at);
create index if not exists problem_evolution_snapshots_canonical_snapshot_idx on public.problem_evolution_snapshots(canonical_problem_id, snapshot_at desc);
create index if not exists problem_evolution_snapshots_evolution_state_snapshot_idx on public.problem_evolution_snapshots(evolution_state, snapshot_at desc);
create index if not exists problem_evolution_snapshots_intelligence_snapshot_idx on public.problem_evolution_snapshots(intelligence_score desc, snapshot_at desc);
create index if not exists problem_evolution_snapshots_window_idx on public.problem_evolution_snapshots(window_start, window_end);

create index if not exists problem_feedback_events_canonical_occurred_idx on public.problem_feedback_events(canonical_problem_id, occurred_at desc);
create index if not exists problem_feedback_events_user_occurred_idx on public.problem_feedback_events(user_id, occurred_at desc);
create index if not exists problem_feedback_events_event_type_occurred_idx on public.problem_feedback_events(event_type, occurred_at desc);
create index if not exists problem_feedback_events_related_discovery_idx on public.problem_feedback_events(related_discovery_id);
create index if not exists problem_feedback_events_related_discovered_problem_idx on public.problem_feedback_events(related_discovered_problem_id);

alter table public.canonical_problems enable row level security;
alter table public.problem_observations enable row level security;
alter table public.problem_aliases enable row level security;
alter table public.problem_evolution_snapshots enable row level security;
alter table public.problem_feedback_events enable row level security;

revoke all on table public.canonical_problems from anon, authenticated;
revoke all on table public.problem_observations from anon, authenticated;
revoke all on table public.problem_aliases from anon, authenticated;
revoke all on table public.problem_evolution_snapshots from anon, authenticated;
revoke all on table public.problem_feedback_events from anon, authenticated;

grant all on table public.canonical_problems to service_role;
grant all on table public.problem_observations to service_role;
grant all on table public.problem_aliases to service_role;
grant all on table public.problem_evolution_snapshots to service_role;
grant all on table public.problem_feedback_events to service_role;

grant select on table public.problem_feedback_events to authenticated;

create policy "Service role can manage canonical problems"
  on public.canonical_problems
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage problem observations"
  on public.problem_observations
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage problem aliases"
  on public.problem_aliases
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage problem evolution snapshots"
  on public.problem_evolution_snapshots
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage problem feedback events"
  on public.problem_feedback_events
  for all
  to service_role
  using (true)
  with check (true);

create policy "Authenticated users can read their own feedback events"
  on public.problem_feedback_events
  for select
  to authenticated
  using (user_id = auth.uid());
