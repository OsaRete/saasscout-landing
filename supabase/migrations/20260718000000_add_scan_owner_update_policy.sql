-- Allow authenticated scan owners to update their legacy scan rows.
-- This is intentionally policy-only: it does not introduce new lifecycle states,
-- constraints, enums, or changes to unrelated RLS policies.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'scan'
      and policyname = 'authenticated users can update own scans'
  ) then
    create policy "authenticated users can update own scans"
      on public.scan
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
