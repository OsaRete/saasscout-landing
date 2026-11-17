-- Offline owner bootstrap only. Never called by signup, the web application or this task.
-- Independently verify the existing founder's Auth UUID in the intended project first.
\set ON_ERROR_STOP on
\if :{?owner_user_id}
\else
  \echo 'Required: -v owner_user_id=<independently-verified-existing-founder-uuid>'
  \quit 1
\endif
BEGIN;
SELECT set_config('app.owner_user_id', :'owner_user_id', true);
DO $$
DECLARE target uuid := current_setting('app.owner_user_id')::uuid;
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Database owner required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-bootstrap',0));
  IF NOT public.application_account_verified(target) THEN RAISE EXCEPTION 'Existing verified active founder required'; END IF;
  -- Never silently replace an existing administrator or undo suspension/deletion review.
  IF EXISTS(SELECT 1 FROM public.application_user_access WHERE owner_administrator AND user_id<>target) THEN
    RAISE EXCEPTION 'Existing owner assignment requires separate reviewed recovery';
  END IF;
  IF EXISTS(SELECT 1 FROM public.application_user_access WHERE user_id=target
    AND (account_suspended OR deletion_requested_at IS NOT NULL)) THEN RAISE EXCEPTION 'Resolve owner restriction offline first'; END IF;
  INSERT INTO public.application_user_access(user_id,access_role,is_active,unlimited_scans,owner_administrator)
    VALUES(target,'beta_member',false,false,true)
    ON CONFLICT(user_id) DO UPDATE SET owner_administrator=true,updated_at=now();
END;
$$;
COMMIT;
SELECT user_id,owner_administrator FROM public.application_user_access WHERE user_id=:'owner_user_id'::uuid;
