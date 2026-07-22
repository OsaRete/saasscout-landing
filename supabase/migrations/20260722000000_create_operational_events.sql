-- Closed Beta operational workflow diagnostics.
-- Append-only, service-owned events for founder-operated support. This is not an analytics or monitoring platform.

create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  workflow text not null check (workflow in ('scan', 'weekly_intelligence', 'discover', 'results_validation')),
  event_type text not null check (char_length(event_type) between 1 and 80),
  status text not null check (status in ('started', 'claimed', 'processing', 'completed', 'failed', 'reused', 'degraded', 'partial_persistence')),
  user_id uuid null references auth.users(id) on delete set null,
  request_id text null check (request_id is null or char_length(request_id) <= 120),
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  failure_category text null check (failure_category is null or char_length(failure_category) <= 80),
  safe_metadata jsonb not null default '{}'::jsonb,
  constraint operational_events_safe_metadata_object check (jsonb_typeof(safe_metadata) = 'object')
);

alter table public.operational_events enable row level security;

revoke all on table public.operational_events from public, anon, authenticated;
grant insert, select on table public.operational_events to service_role;

create index if not exists operational_events_workflow_created_at_idx on public.operational_events (workflow, created_at desc);
create index if not exists operational_events_user_created_at_idx on public.operational_events (user_id, created_at desc) where user_id is not null;

create or replace function public.prevent_operational_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'operational_events is append-only';
end;
$$;

drop trigger if exists operational_events_no_update on public.operational_events;
create trigger operational_events_no_update
before update on public.operational_events
for each row execute function public.prevent_operational_events_mutation();

drop trigger if exists operational_events_no_delete on public.operational_events;
create trigger operational_events_no_delete
before delete on public.operational_events
for each row execute function public.prevent_operational_events_mutation();

revoke all on function public.prevent_operational_events_mutation() from public;
