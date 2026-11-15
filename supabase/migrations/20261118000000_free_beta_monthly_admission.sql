-- Monthly admission is additive; lifetime counters and historical attempts are retained.
CREATE TABLE public.application_discovery_admissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  admitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'admitted' CHECK(status IN ('admitted','completed','failed')),
  PRIMARY KEY(user_id,request_id)
);
CREATE INDEX application_discovery_month_idx ON public.application_discovery_admissions(user_id,admitted_at);
ALTER TABLE public.application_discovery_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_discovery_admissions FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON public.application_discovery_admissions TO service_role;
CREATE FUNCTION public.application_admit_discovery(p_user_id uuid,p_request_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE month_start timestamptz := date_trunc('month',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF p_request_id IS NULL OR public.application_beta_member(p_user_id) IS NOT TRUE THEN RETURN 'account_denied'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('discovery-month:'||p_user_id::text,0));
  IF EXISTS(SELECT 1 FROM public.application_discovery_admissions WHERE user_id=p_user_id AND request_id=p_request_id) THEN
    RETURN 'already_admitted';
  END IF;
  IF NOT public.application_owner_administrator(p_user_id) AND
    (SELECT count(*) FROM public.application_discovery_admissions WHERE user_id=p_user_id AND admitted_at>=month_start)>=3 THEN
    RETURN 'limit_exceeded';
  END IF;
  INSERT INTO public.application_discovery_admissions(user_id,request_id) VALUES(p_user_id,p_request_id);
  RETURN 'admitted';
END;
$$;
REVOKE ALL ON FUNCTION public.application_admit_discovery(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.application_admit_discovery(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_scan_request_v2(
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

  IF public.application_beta_member(p_user_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501';
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

  v_unlimited := v_unlimited OR public.application_owner_administrator(p_user_id);

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
  IF NOT v_unlimited AND (
    (v_profile.plan IS DISTINCT FROM 'free' AND v_profile.scans_used >= v_profile.scan_limit)
    OR (SELECT count(*) FROM public.scan s WHERE s.user_id=p_user_id
      AND s.created_at >= (date_trunc('month',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) >= CASE WHEN v_profile.plan='free' THEN least(3,coalesce(v_profile.scan_limit,0)) ELSE 3 END
  ) THEN
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


CREATE OR REPLACE FUNCTION public.claim_scan_execution_v1(p_user_id uuid, p_scan_id uuid, p_request_fingerprint text)
RETURNS TABLE(claimed boolean, scan_id uuid, resulting_status text, rejection_code text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.application_beta_member(p_user_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501';
  END IF;
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


NOTIFY pgrst, 'reload schema';
