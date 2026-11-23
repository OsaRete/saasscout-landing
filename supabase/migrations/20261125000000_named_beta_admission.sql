BEGIN;

-- Grants are issued offline by the database owner to verified Auth identities.
CREATE TABLE public.application_beta_invitations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.application_beta_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_beta_invitations FROM PUBLIC, anon, authenticated, service_role;

-- The same predicate protects the Next.js admission RPC, PostgREST policies,
-- and durable workflow admission. Legacy access roles do not confer invitations.
CREATE OR REPLACE FUNCTION public.application_beta_member(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
  SELECT public.application_account_verified(p_user_id)
    AND NOT EXISTS (SELECT 1 FROM public.application_user_access a WHERE a.user_id=p_user_id
      AND (a.account_suspended OR a.deletion_requested_at IS NOT NULL))
    AND (public.application_owner_administrator(p_user_id)
      OR coalesce((SELECT r.open_free_beta OR EXISTS (
        SELECT 1 FROM public.application_beta_invitations i
        WHERE i.user_id=p_user_id AND i.expires_at > statement_timestamp()
      ) FROM public.application_beta_release r WHERE r.singleton), false));
$$;

COMMIT;
