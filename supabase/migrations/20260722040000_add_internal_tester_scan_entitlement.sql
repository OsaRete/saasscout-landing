-- Server-owned exceptional application access. Rollout allowlists, service_role,
-- paid plans, and end-user administrator authority are deliberately separate concepts.
CREATE TABLE public.application_user_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_role text NOT NULL CONSTRAINT application_user_access_role_check
    CHECK (access_role IN ('internal_tester')),
  is_active boolean NOT NULL DEFAULT true,
  unlimited_scans boolean NOT NULL DEFAULT false,
  reason text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.application_user_access ENABLE ROW LEVEL SECURITY;

-- No browser policies are intentional: exceptional access is not browser-readable
-- or browser-writable. Only trusted service-role operations may manage assignments.
REVOKE ALL ON TABLE public.application_user_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.application_user_access TO service_role;

-- The trusted server supplies p_user_id from requireUser(). The database, rather
-- than the rollout gate or browser payload, resolves the exceptional entitlement.
DROP FUNCTION public.accept_scan_request(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.accept_scan_request(
  p_user_id uuid,
  p_market text,
  p_audience text,
  p_region text,
  p_evidence text
)
RETURNS TABLE(scan_id uuid, status text, accepted boolean, rejection_code text, unlimited_entitlement_used boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_scan_id uuid;
  v_profile public.user_profiles%ROWTYPE;
  v_scan_id uuid;
  v_unlimited_scans boolean := false;
BEGIN
  SELECT s.id
    INTO v_existing_scan_id
    FROM public.scan s
   WHERE s.user_id = p_user_id
     AND COALESCE(s.market, '') = COALESCE(p_market, '')
     AND COALESCE(s.audience, '') = COALESCE(p_audience, '')
     AND COALESCE(s.region, '') = COALESCE(p_region, '')
     AND COALESCE(s.evidence, '') = COALESCE(p_evidence, '')
   ORDER BY s.created_at ASC, s.id ASC
   LIMIT 1;

  IF v_existing_scan_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_scan_id, 'pending'::text, true, NULL::text, false;
    RETURN;
  END IF;

  -- Keep the per-user profile lock for both branches. It serializes the duplicate
  -- re-check and preserves the normal quota path's concurrency guarantees.
  SELECT *
    INTO v_profile
    FROM public.user_profiles up
   WHERE up.user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, 'profile_not_found'::text, false;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.application_user_access aua
     WHERE aua.user_id = p_user_id
       AND aua.access_role = 'internal_tester'
       AND aua.is_active = true
       AND aua.unlimited_scans = true
       AND (aua.expires_at IS NULL OR aua.expires_at > now())
  ) INTO v_unlimited_scans;

  SELECT s.id
    INTO v_existing_scan_id
    FROM public.scan s
   WHERE s.user_id = p_user_id
     AND COALESCE(s.market, '') = COALESCE(p_market, '')
     AND COALESCE(s.audience, '') = COALESCE(p_audience, '')
     AND COALESCE(s.region, '') = COALESCE(p_region, '')
     AND COALESCE(s.evidence, '') = COALESCE(p_evidence, '')
   ORDER BY s.created_at ASC, s.id ASC
   LIMIT 1;

  IF v_existing_scan_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_scan_id, 'pending'::text, true, NULL::text, v_unlimited_scans;
    RETURN;
  END IF;

  IF NOT v_unlimited_scans AND v_profile.scans_used >= v_profile.scan_limit THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, 'scan_limit_exceeded'::text, false;
    RETURN;
  END IF;

  IF NOT v_unlimited_scans THEN
    UPDATE public.user_profiles
       SET scans_used = scans_used + 1,
           updated_at = now()
     WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.scan (user_id, market, audience, region, evidence, file_url, status)
  VALUES (p_user_id, p_market, p_audience, p_region, p_evidence, NULL, 'pending')
  RETURNING id INTO v_scan_id;

  RETURN QUERY SELECT v_scan_id, 'pending'::text, true, NULL::text, v_unlimited_scans;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_scan_request(uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_scan_request(uuid, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_scan_request(uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_scan_request(uuid, text, text, text, text) TO service_role;
