-- Status-aware Scan attempt identity. This migration intentionally leaves the legacy
-- accept_scan_request(uuid,text,text,text,text) function in place for rolling deploys.
ALTER TABLE public.scan ADD COLUMN request_fingerprint text;
ALTER TABLE public.scan ADD COLUMN attempt_number integer;
ALTER TABLE public.scan ADD COLUMN retry_of_scan_id uuid REFERENCES public.scan(id) ON DELETE RESTRICT;

ALTER TABLE public.scan ADD CONSTRAINT scan_request_fingerprint_format_check
  CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-f]{64}$') NOT VALID;
ALTER TABLE public.scan ADD CONSTRAINT scan_attempt_number_check
  CHECK (attempt_number IS NULL OR attempt_number > 0) NOT VALID;
-- NOT VALID avoids scanning or rewriting historical rows while enforcing all new writes.
ALTER TABLE public.scan ADD CONSTRAINT scan_status_lifecycle_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed')) NOT VALID;

CREATE UNIQUE INDEX scan_request_attempt_unique
  ON public.scan(user_id, request_fingerprint, attempt_number)
  WHERE request_fingerprint IS NOT NULL AND attempt_number IS NOT NULL;
CREATE UNIQUE INDEX scan_one_active_attempt_per_request
  ON public.scan(user_id, request_fingerprint)
  WHERE request_fingerprint IS NOT NULL AND status IN ('pending', 'processing');
CREATE INDEX scan_request_latest_attempt_idx
  ON public.scan(user_id, request_fingerprint, attempt_number DESC)
  WHERE request_fingerprint IS NOT NULL;

CREATE FUNCTION public.accept_scan_request_v2(
  p_user_id uuid,
  p_request_fingerprint text,
  p_market text,
  p_audience text,
  p_region text,
  p_evidence text
)
RETURNS TABLE(
  accepted boolean,
  scan_id uuid,
  disposition text,
  existing_status text,
  execution_claim_required boolean,
  unlimited_entitlement_used boolean,
  rejection_code text,
  attempt_number integer,
  retry_of_scan_id uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.user_profiles%ROWTYPE;
  v_existing public.scan%ROWTYPE;
  v_scan_id uuid;
  v_attempt integer := 1;
  v_unlimited boolean := false;
  v_retry_of uuid;
  v_disposition text := 'created';
  v_existing_status text;
BEGIN
  IF p_user_id IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text, false, false, 'invalid_request_fingerprint', NULL::integer, NULL::uuid;
    RETURN;
  END IF;

  -- Serialize one logical request even when no Scan row exists yet.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_request_fingerprint, 0));

  SELECT * INTO v_profile FROM public.user_profiles up WHERE up.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::text, false, false, 'profile_not_found', NULL::integer, NULL::uuid;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.application_user_access aua
    WHERE aua.user_id = p_user_id AND aua.access_role = 'internal_tester'
      AND aua.is_active AND aua.unlimited_scans
      AND (aua.expires_at IS NULL OR aua.expires_at > now())
  ) INTO v_unlimited;

  SELECT * INTO v_existing FROM public.scan s
   WHERE s.user_id = p_user_id AND s.request_fingerprint = p_request_fingerprint
   ORDER BY s.attempt_number DESC, s.created_at DESC, s.id DESC LIMIT 1;

  IF FOUND AND v_existing.status = 'pending' THEN
    RETURN QUERY SELECT true, v_existing.id, 'reused_pending', 'pending', true, v_unlimited, NULL::text, v_existing.attempt_number, v_existing.retry_of_scan_id;
    RETURN;
  ELSIF FOUND AND v_existing.status = 'processing' THEN
    RETURN QUERY SELECT true, v_existing.id, 'already_processing', 'processing', false, v_unlimited, NULL::text, v_existing.attempt_number, v_existing.retry_of_scan_id;
    RETURN;
  ELSIF FOUND AND v_existing.status = 'completed' THEN
    RETURN QUERY SELECT true, v_existing.id, 'already_completed', 'completed', false, v_unlimited, NULL::text, v_existing.attempt_number, v_existing.retry_of_scan_id;
    RETURN;
  ELSIF FOUND AND v_existing.status = 'failed' THEN
    v_attempt := v_existing.attempt_number + 1;
    v_retry_of := v_existing.id;
    v_existing_status := 'failed';
    v_disposition := 'retry_created';
  ELSIF FOUND THEN
    RETURN QUERY SELECT false, v_existing.id, NULL::text, v_existing.status, false, v_unlimited, 'invalid_existing_status', v_existing.attempt_number, v_existing.retry_of_scan_id;
    RETURN;
  END IF;

  -- A retry is a new execution attempt and consumes ordinary quota; no refund is added here.
  IF NOT v_unlimited AND v_profile.scans_used >= v_profile.scan_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, 'rejected_limit', v_existing_status, false, false, 'scan_limit_exceeded', NULL::integer, v_retry_of;
    RETURN;
  END IF;
  IF NOT v_unlimited THEN
    UPDATE public.user_profiles SET scans_used = scans_used + 1, updated_at = now() WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.scan(user_id, market, audience, region, evidence, file_url, status, request_fingerprint, attempt_number, retry_of_scan_id)
  VALUES (p_user_id, p_market, p_audience, p_region, p_evidence, NULL, 'pending', p_request_fingerprint, v_attempt, v_retry_of)
  RETURNING id INTO v_scan_id;

  RETURN QUERY SELECT true, v_scan_id, v_disposition, v_existing_status, true, v_unlimited, NULL::text, v_attempt, v_retry_of;
END;
$$;

CREATE FUNCTION public.claim_scan_execution_v1(p_user_id uuid, p_scan_id uuid, p_request_fingerprint text)
RETURNS TABLE(claimed boolean, scan_id uuid, resulting_status text, rejection_code text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH claimed_row AS (
    UPDATE public.scan s SET status = 'processing'
     WHERE s.id = p_scan_id AND s.user_id = p_user_id
       AND s.request_fingerprint = p_request_fingerprint AND s.status = 'pending'
     RETURNING s.id, s.status
  )
  SELECT true, c.id, c.status, NULL::text FROM claimed_row c
  UNION ALL
  SELECT false, p_scan_id, s.status, 'not_claimed'::text
    FROM public.scan s
   WHERE s.id = p_scan_id AND s.user_id = p_user_id
     AND s.request_fingerprint = p_request_fingerprint
     AND NOT EXISTS (SELECT 1 FROM claimed_row)
  UNION ALL
  SELECT false, p_scan_id, NULL::text, 'not_found'::text
   WHERE NOT EXISTS (SELECT 1 FROM claimed_row)
     AND NOT EXISTS (SELECT 1 FROM public.scan s WHERE s.id = p_scan_id AND s.user_id = p_user_id AND s.request_fingerprint = p_request_fingerprint)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_scan_request_v2(uuid,text,text,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_scan_request_v2(uuid,text,text,text,text,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_scan_request_v2(uuid,text,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_scan_execution_v1(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_scan_execution_v1(uuid,uuid,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scan_execution_v1(uuid,uuid,text) TO service_role;
