-- Trusted owner operation only, never called by the application or signup.
-- See docs/BETA_MEMBERSHIP_ACCESS.md. Do not run against Production in this task.
\set ON_ERROR_STOP on
\if :{?beta_user_id}
\else
  \echo 'Required: -v beta_user_id=<verified-auth-user-uuid>'
  \quit 1
\endif
\if :{?beta_action}
\else
  \echo 'Required: -v beta_action=admit or -v beta_action=revoke'
  \quit 1
\endif
\if :{?beta_expires_at}
\else
  \set beta_expires_at ''
\endif
BEGIN;
SELECT set_config('app.beta_user_id', :'beta_user_id', true),
       set_config('app.beta_action', :'beta_action', true),
       set_config('app.beta_expires_at', :'beta_expires_at', true);
DO $$
DECLARE
  target uuid := current_setting('app.beta_user_id')::uuid;
  action text := current_setting('app.beta_action');
  expiry timestamptz := nullif(current_setting('app.beta_expires_at'), '')::timestamptz;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Run membership management as the trusted database owner';
  END IF;
  IF target IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = target) THEN
    RAISE EXCEPTION 'A verified existing auth user UUID is required';
  END IF;
  IF action = 'admit' THEN
    IF expiry IS NOT NULL AND expiry <= statement_timestamp() THEN
      RAISE EXCEPTION 'Admission expiry must be in the future';
    END IF;
    INSERT INTO public.application_user_access
      (user_id, access_role, is_active, unlimited_scans, beta_admitted, beta_expires_at)
    VALUES (target, 'beta_member', false, false, true, expiry)
    ON CONFLICT (user_id) DO UPDATE SET
      beta_admitted = true, beta_expires_at = excluded.beta_expires_at, updated_at = now();
  ELSIF action = 'revoke' THEN
    UPDATE public.application_user_access SET beta_admitted = false, updated_at = now()
      WHERE user_id = target;
  ELSE
    RAISE EXCEPTION 'beta_action must be exactly admit or revoke';
  END IF;
END;
$$;
COMMIT;
SELECT user_id, beta_admitted, beta_expires_at FROM public.application_user_access
WHERE user_id = :'beta_user_id'::uuid;
