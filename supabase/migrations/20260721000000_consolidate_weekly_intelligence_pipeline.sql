-- Consolidate Weekly Intelligence persistence around weekly_intelligence_runs and weekly_detected_problems.
-- Legacy weekly_reports and weekly_niches remain physically present for historical compatibility,
-- but no active generation or dashboard read path should write or read them.

alter table public.weekly_intelligence_runs
  add column if not exists updated_at timestamp with time zone default now();

alter table public.weekly_detected_problems
  add column if not exists problem_title_key text;

update public.weekly_detected_problems
set problem_title_key = lower(regexp_replace(btrim(problem_title), '\s+', ' ', 'g'))
where problem_title_key is null
   or problem_title_key <> lower(regexp_replace(btrim(problem_title), '\s+', ' ', 'g'));

delete from public.weekly_detected_problems duplicate
using public.weekly_detected_problems canonical
where duplicate.run_id = canonical.run_id
  and coalesce(duplicate.problem_title_key, '') = coalesce(canonical.problem_title_key, '')
  and duplicate.id <> canonical.id
  and (
    coalesce(canonical.opportunity_score, 0),
    coalesce(canonical.source_quality_score, 0),
    coalesce(canonical.pain_score, 0),
    canonical.created_at,
    canonical.id::text
  ) > (
    coalesce(duplicate.opportunity_score, 0),
    coalesce(duplicate.source_quality_score, 0),
    coalesce(duplicate.pain_score, 0),
    duplicate.created_at,
    duplicate.id::text
  );

create unique index if not exists weekly_detected_problems_run_title_key_unique
  on public.weekly_detected_problems(run_id, problem_title_key);

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
  claimed public.weekly_intelligence_runs;
begin
  insert into public.weekly_intelligence_runs(user_id, period_start, period_end, timezone, status, updated_at)
  values (p_user_id, p_period_start, p_period_end, p_timezone, 'processing', now())
  on conflict (user_id, period_start, period_end) do nothing
  returning * into claimed;

  if found then
    claim_status := 'claimed';
    run := to_jsonb(claimed);
    return next;
    return;
  end if;

  select * into claimed
  from public.weekly_intelligence_runs
  where user_id = p_user_id
    and period_start = p_period_start
    and period_end = p_period_end
  for update;

  if claimed.status = 'completed' then
    claim_status := 'completed';
  elsif claimed.status = 'processing' and coalesce(claimed.updated_at, claimed.created_at) >= p_stale_before then
    claim_status := 'processing';
  else
    update public.weekly_intelligence_runs
    set status = 'processing', updated_at = now()
    where id = claimed.id
    returning * into claimed;
    claim_status := 'reclaimed';
  end if;

  run := to_jsonb(claimed);
  return next;
end;
$$;

comment on table public.weekly_reports is
  'Deprecated legacy Weekly Intelligence read/write table. Authoritative weekly persistence is weekly_intelligence_runs plus weekly_detected_problems.';

comment on table public.weekly_niches is
  'Deprecated legacy Weekly Intelligence detail table. Authoritative weekly problems are stored in weekly_detected_problems.';
