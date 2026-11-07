-- B4.3-C1: preserve source transitions; applied migration history is unchanged.
-- Lock identities/order and function security attributes remain unchanged.
-- CREATE OR REPLACE retains ownership and ACLs; repeat the existing revocation.
-- No authority issuance, backfill, consumer activation or lock-order remediation.

create or replace function public.validation_b43_lock_source_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if tg_table_name='validation_participants' then
    perform public.validation_b31_lock('participant',old.id::text);
  elsif tg_table_name='validation_interview_sessions' then
    perform public.validation_b31_lock('experiment',old.experiment_version_id::text);
    perform public.validation_b31_lock('participant',old.participant_id::text);
  elsif tg_table_name='validation_evidence_observations' then
    perform public.validation_b31_lock('experiment',new.experiment_version_id::text);
    if new.participant_id is not null then
      perform public.validation_b31_lock('participant',new.participant_id::text);
    end if;
  elsif tg_table_name='validation_experiment_versions' then
    perform public.validation_b31_lock('experiment',old.id::text);
  end if;
  -- All four attachments are BEFORE INSERT or BEFORE UPDATE row triggers.
  -- Preserve proposed values for later guards, constraints and AFTER capture.
  return new;
end $$;
revoke all on function public.validation_b43_lock_source_change() from public,anon,authenticated,service_role,authenticator;

