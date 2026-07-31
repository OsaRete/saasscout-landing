-- Restore Scan acceptance after closed-Beta privilege hardening.
-- Authoritative invocation path:
-- Browser -> authenticated Scan API -> requireUser(request) -> trusted user.id -> service_role RPC.
-- p_user_id MUST be supplied only from the requireUser-derived server identity; never from request bodies.
-- SECURITY INVOKER is intentional: the only executable role is service_role, which already owns the
-- authoritative table privileges needed for user_profiles and scan writes. Browser roles retain no writes.

CREATE OR REPLACE FUNCTION public.accept_scan_request(
  p_user_id uuid,
  p_market text,
  p_audience text,
  p_region text,
  p_evidence text
)
RETURNS TABLE(scan_id uuid, status text, accepted boolean, rejection_code text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_scan_id uuid;
  v_profile public.user_profiles%ROWTYPE;
  v_scan_id uuid;
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
    RETURN QUERY SELECT v_existing_scan_id, 'pending'::text, true, NULL::text;
    RETURN;
  END IF;

  SELECT *
    INTO v_profile
    FROM public.user_profiles up
   WHERE up.user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, 'profile_not_found'::text;
    RETURN;
  END IF;

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
    RETURN QUERY SELECT v_existing_scan_id, 'pending'::text, true, NULL::text;
    RETURN;
  END IF;

  IF v_profile.scans_used >= v_profile.scan_limit THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, 'scan_limit_exceeded'::text;
    RETURN;
  END IF;

  UPDATE public.user_profiles
     SET scans_used = scans_used + 1,
         updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.scan (user_id, market, audience, region, evidence, file_url, status)
  VALUES (p_user_id, p_market, p_audience, p_region, p_evidence, NULL, 'pending')
  RETURNING id INTO v_scan_id;

  RETURN QUERY SELECT v_scan_id, 'pending'::text, true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_scan_request(uuid, text, text, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.accept_scan_request(uuid, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_scan_request(uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_scan_request(uuid, text, text, text, text) TO service_role;
