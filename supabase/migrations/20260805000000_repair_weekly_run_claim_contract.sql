-- Repair the authoritative Weekly Intelligence run-claim RPC contract.
-- This migration does not mutate historical Weekly rows. It preflights duplicate
-- user-period parents before installing the unique index required as the durable
-- integrity backstop for the server-owned claim boundary.

do $$
begin
  if exists (
    select 1
    from public.weekly_intelligence_runs runs
    where runs.user_id is not null
      and runs.period_start is not null
      and runs.period_end is not null
    group by runs.user_id, runs.period_start, runs.period_end
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'weekly_intelligence_runs contains duplicate user-period rows; run the documented read-only duplicate preflight and complete a separately approved cleanup before applying this migration';
  end if;
end;
$$;

create unique index if not exists weekly_intelligence_runs_user_period_unique
  on public.weekly_intelligence_runs(user_id, period_start, period_end)
  where user_id is not null and period_start is not null and period_end is not null;

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
  order by runs.created_at asc, runs.id asc
  limit 1
  for update;

  if not found then
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
    update public.weekly_intelligence_runs as runs
    set status = 'processing',
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

revoke all on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) from public;
revoke execute on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) from anon;
revoke execute on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) from authenticated;
grant execute on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) to service_role;
