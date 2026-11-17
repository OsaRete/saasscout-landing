-- Open Free Beta follows the invitation schema without rewriting historical migrations.
-- No launch, owner assignment, account mutation or provider-budget activation is seeded.
ALTER TABLE public.application_user_access
  ADD COLUMN owner_administrator boolean NOT NULL DEFAULT false,
  ADD COLUMN account_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN deletion_requested_at timestamptz;

CREATE TABLE public.application_beta_release (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  open_free_beta boolean NOT NULL DEFAULT false
);
INSERT INTO public.application_beta_release(singleton) VALUES (true);
ALTER TABLE public.application_beta_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_beta_release FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.application_beta_release TO service_role;

CREATE TABLE public.application_admin_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('suspend','reactivate','request_deletion')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.application_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_admin_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.application_admin_audit TO service_role;

-- Trusted Auth state, never JWT/email/user metadata claims, is the identity authority.
CREATE FUNCTION public.application_account_verified(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_user_id
    AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous,false)
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= statement_timestamp()));
$$;
CREATE FUNCTION public.application_owner_administrator(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
  SELECT public.application_account_verified(p_user_id) AND EXISTS (
    SELECT 1 FROM public.application_user_access a WHERE a.user_id=p_user_id
      AND a.owner_administrator AND NOT a.account_suspended AND a.deletion_requested_at IS NULL);
$$;
CREATE OR REPLACE FUNCTION public.application_beta_member(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
  SELECT public.application_account_verified(p_user_id)
    AND NOT EXISTS (SELECT 1 FROM public.application_user_access a WHERE a.user_id=p_user_id
      AND (a.account_suspended OR a.deletion_requested_at IS NOT NULL))
    AND (public.application_owner_administrator(p_user_id)
      OR coalesce((SELECT r.open_free_beta FROM public.application_beta_release r WHERE r.singleton),false));
$$;
-- application_beta_access() and the original 31 restrictive policies reuse this predicate.

CREATE FUNCTION public.application_manage_user(p_actor uuid, p_target uuid, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('owner-bootstrap',0));
  IF NOT public.application_owner_administrator(p_actor) THEN
    RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501';
  END IF;
  IF p_actor=p_target OR EXISTS (SELECT 1 FROM public.application_user_access a
    WHERE a.user_id=p_target AND a.owner_administrator) THEN
    RAISE EXCEPTION 'Owner accounts require offline owner recovery' USING ERRCODE='42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('suspend','reactivate','request_deletion') THEN
    RAISE EXCEPTION 'Unsupported administration action' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=p_target) THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.application_user_access(user_id,access_role,is_active,unlimited_scans)
    VALUES(p_target,'beta_member',false,false) ON CONFLICT(user_id) DO NOTHING;
  -- Serialize status changes. Deletion review cannot be undone by reactivation.
  PERFORM 1 FROM public.application_user_access WHERE user_id=p_target FOR UPDATE;
  IF p_action='reactivate' AND EXISTS (SELECT 1 FROM public.application_user_access
    WHERE user_id=p_target AND deletion_requested_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Deletion review requires offline owner resolution' USING ERRCODE='42501';
  END IF;
  UPDATE public.application_user_access SET
    account_suspended=(p_action <> 'reactivate'),
    deletion_requested_at=CASE WHEN p_action='request_deletion' THEN coalesce(deletion_requested_at,now()) ELSE deletion_requested_at END,
    updated_at=now() WHERE user_id=p_target;
  INSERT INTO public.application_admin_audit(actor_id,target_id,action) VALUES(p_actor,p_target,p_action);
END;
$$;
CREATE FUNCTION public.application_list_users(p_actor uuid, p_page integer DEFAULT 1)
RETURNS TABLE(user_id uuid,email text,created_at timestamptz,last_sign_in_at timestamptz,
  verified boolean,suspended boolean,owner_administrator boolean,deletion_requested_at timestamptz,
  scans_used integer,scan_limit integer,scans_this_month bigint,discoveries_this_month bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NOT public.application_owner_administrator(p_actor) THEN
    RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501';
  END IF;
  IF p_page IS NULL OR p_page<1 OR p_page>100000 THEN RAISE EXCEPTION 'Invalid page'; END IF;
  RETURN QUERY SELECT u.id,u.email::text,u.created_at,u.last_sign_in_at,
    public.application_account_verified(u.id),coalesce(a.account_suspended,false),
    coalesce(a.owner_administrator,false),a.deletion_requested_at,p.scans_used,p.scan_limit,
    (SELECT count(*) FROM public.scan s WHERE s.user_id=u.id AND s.created_at >=
      (date_trunc('month',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')),
    (SELECT count(*) FROM public.application_discovery_admissions d WHERE d.user_id=u.id AND d.admitted_at >=
      (date_trunc('month',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))
    FROM auth.users u LEFT JOIN public.application_user_access a ON a.user_id=u.id
    LEFT JOIN public.user_profiles p ON p.user_id=u.id
    ORDER BY u.created_at DESC,u.id LIMIT 50 OFFSET ((p_page-1)*50);
END;
$$;
REVOKE ALL ON FUNCTION public.application_account_verified(uuid), public.application_owner_administrator(uuid),
  public.application_manage_user(uuid,uuid,text),public.application_list_users(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.application_owner_administrator(uuid),public.application_manage_user(uuid,uuid,text),
  public.application_list_users(uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
