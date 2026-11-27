-- The legacy catalogs do not establish which information is safe to share.
-- Preserve their rows in place and remove every application role's access.
revoke all on table public.problem_intelligence, public.opportunity_intelligence,
  public.weekly_reports, public.weekly_niches from public, anon, authenticated, service_role;

drop policy if exists "Users can read problem intelligence" on public.problem_intelligence;
drop policy if exists beta_membership_required on public.problem_intelligence;
drop policy if exists "Authenticated users can read global weekly reports" on public.weekly_reports;
drop policy if exists "Authenticated users can read global weekly niches" on public.weekly_niches;

comment on table public.problem_intelligence is
  'Quarantined legacy shared catalog. Rows lack demonstrated shareable provenance. Application roles have no access.';
comment on table public.opportunity_intelligence is
  'Quarantined legacy score projection derived from the shared problem catalog. Application roles have no access.';

-- Retain the existing Beta membership policies on current Weekly runs and problems.
alter policy "Users can read own weekly intelligence runs" on public.weekly_intelligence_runs
  using (user_id = (select auth.uid()) and not is_global);

alter policy "Users can read problems for own weekly runs" on public.weekly_detected_problems
  using (
    exists (
      select 1 from public.weekly_intelligence_runs runs
      where runs.id = weekly_detected_problems.run_id
        and runs.user_id = (select auth.uid())
        and not runs.is_global
    )
  );

alter policy "Users can read sources for own weekly runs" on public.weekly_sources
  using (
    exists (
      select 1 from public.weekly_intelligence_runs runs
      where runs.id = weekly_sources.run_id
        and runs.user_id = (select auth.uid())
        and not runs.is_global
    )
  );

-- Historical ownerless/global runs and their children stay in place. Future
-- rows must have an explicit owner and never be marked global.
alter table public.weekly_intelligence_runs
  add constraint weekly_intelligence_runs_requires_owner
  check (user_id is not null and not is_global) not valid;

-- Keep one active run per owner and period without letting legacy global rows
-- block a new private claim for that period.
create unique index weekly_intelligence_runs_private_period_unique
  on public.weekly_intelligence_runs(user_id, period_start, period_end)
  where user_id is not null and period_start is not null and period_end is not null and not is_global;

drop index public.weekly_intelligence_runs_user_period_unique;

alter index public.weekly_intelligence_runs_private_period_unique
  rename to weekly_intelligence_runs_user_period_unique;

create or replace function public.claim_weekly_intelligence_run(
  p_user_id uuid,
  p_period_start timestamp with time zone,
  p_period_end timestamp with time zone,
  p_timezone text,
  p_stale_before timestamp with time zone
)
returns table(claim_status text, run jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_run public.weekly_intelligence_runs%rowtype;
  lock_key text;
  execution_limit integer;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'p_user_id is required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_start >= p_period_end then
    raise exception using errcode = '22023', message = 'valid p_period_start and p_period_end are required';
  end if;
  if nullif(btrim(coalesce(p_timezone, '')), '') is null then
    raise exception using errcode = '22023', message = 'p_timezone is required';
  end if;
  if p_stale_before is null then
    raise exception using errcode = '22023', message = 'p_stale_before is required';
  end if;

  lock_key := p_user_id::text || '|' || p_period_start::text || '|' || p_period_end::text;
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  select runs.* into claimed_run
  from public.weekly_intelligence_runs as runs
  where runs.user_id = p_user_id
    and runs.period_start = p_period_start
    and runs.period_end = p_period_end
    and not runs.is_global
  order by runs.created_at asc, runs.id asc
  limit 1
  for update;

  if not found then
    select weekly_max_executions into execution_limit from public.application_spending_policy where singleton and enabled;
    if execution_limit is null or execution_limit < 1 then
      raise exception 'Weekly spending policy unavailable' using errcode = 'P0001';
    end if;
    insert into public.weekly_intelligence_runs(user_id, period_start, period_end, timezone, status, updated_at)
    values (p_user_id, p_period_start, p_period_end, btrim(p_timezone), 'processing', now())
    returning * into claimed_run;

    claim_status := 'claimed';
    run := to_jsonb(claimed_run);
    return next;
    return;
  end if;

  if claimed_run.status = 'completed' then
    claim_status := 'completed';
  elsif claimed_run.status = 'processing' and coalesce(claimed_run.updated_at, claimed_run.created_at) >= p_stale_before then
    claim_status := 'processing';
  else
    select weekly_max_executions into execution_limit from public.application_spending_policy where singleton and enabled;
    if execution_limit is null or execution_limit < 1 then
      raise exception 'Weekly spending policy unavailable' using errcode = 'P0001';
    end if;
    if claimed_run.spending_execution_attempts >= execution_limit then
      raise exception 'Weekly retry ceiling exhausted' using errcode = 'P0001';
    end if;
    update public.weekly_intelligence_runs as runs
    set spending_execution_attempts = runs.spending_execution_attempts + 1,
        status = 'processing',
        timezone = btrim(p_timezone),
        updated_at = now()
    where runs.id = claimed_run.id
      and runs.status <> 'completed'
    returning runs.* into claimed_run;

    claim_status := 'reclaimed';
  end if;

  run := to_jsonb(claimed_run);
  return next;
end;
$$;

-- CREATE OR REPLACE keeps the existing ACL. State the role boundary explicitly.
revoke all on function public.claim_weekly_intelligence_run(uuid, timestamptz, timestamptz, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_weekly_intelligence_run(uuid, timestamptz, timestamptz, text, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
