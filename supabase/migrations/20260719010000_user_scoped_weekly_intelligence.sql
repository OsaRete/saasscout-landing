alter table public.weekly_intelligence_runs
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists period_start timestamptz,
  add column if not exists period_end timestamptz,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists is_global boolean not null default false;

create unique index if not exists weekly_intelligence_runs_user_period_unique
  on public.weekly_intelligence_runs(user_id, period_start, period_end)
  where user_id is not null and period_start is not null and period_end is not null;

create index if not exists weekly_intelligence_runs_user_period_idx
  on public.weekly_intelligence_runs(user_id, period_start desc, period_end desc);

drop policy if exists "Anyone authenticated can read weekly intelligence runs" on public.weekly_intelligence_runs;
drop policy if exists "Anyone authenticated can read weekly detected problems" on public.weekly_detected_problems;
drop policy if exists "Authenticated users can read weekly sources" on public.weekly_sources;

create policy "Users can read own weekly intelligence runs"
  on public.weekly_intelligence_runs for select to authenticated
  using (user_id = auth.uid() or is_global = true or user_id is null);

create policy "Users can read problems for own weekly runs"
  on public.weekly_detected_problems for select to authenticated
  using (
    exists (
      select 1 from public.weekly_intelligence_runs runs
      where runs.id = weekly_detected_problems.run_id
        and (runs.user_id = auth.uid() or runs.is_global = true or runs.user_id is null)
    )
  );

create policy "Users can read sources for own weekly runs"
  on public.weekly_sources for select to authenticated
  using (
    exists (
      select 1 from public.weekly_intelligence_runs runs
      where runs.id = weekly_sources.run_id
        and (runs.user_id = auth.uid() or runs.is_global = true or runs.user_id is null)
    )
  );
