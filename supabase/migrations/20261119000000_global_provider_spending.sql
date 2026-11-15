-- Default-deny, owner-configured request ceilings. No prices or user grants are seeded.
CREATE TABLE public.application_spending_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  total_requests integer NOT NULL DEFAULT 0 CHECK (total_requests >= 0),
  openrouter_requests integer NOT NULL DEFAULT 0 CHECK (openrouter_requests >= 0),
  serpapi_requests integer NOT NULL DEFAULT 0 CHECK (serpapi_requests >= 0),
  x_requests integer NOT NULL DEFAULT 0 CHECK (x_requests >= 0),
  search_requests integer NOT NULL DEFAULT 0 CHECK (search_requests >= 0),
  user_ai_requests integer NOT NULL DEFAULT 0 CHECK (user_ai_requests >= 0),
  user_search_requests integer NOT NULL DEFAULT 0 CHECK (user_search_requests >= 0),
  max_concurrent integer NOT NULL DEFAULT 0 CHECK (max_concurrent >= 0),
  weekly_max_executions integer NOT NULL DEFAULT 0 CHECK (weekly_max_executions BETWEEN 0 AND 10)
);
INSERT INTO public.application_spending_policy(singleton) VALUES (true);
CREATE TABLE public.application_provider_reservations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  workflow text NOT NULL CHECK (workflow IN ('scan','discovery','weekly','collect-sources','x-search')),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 200),
  provider text NOT NULL CHECK (provider IN ('openrouter','serpapi','x')),
  slot integer NOT NULL CHECK (slot BETWEEN 1 AND 20),
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  dispatched_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY(user_id,workflow,request_id,provider,slot),
  CHECK (finished_at IS NULL OR dispatched_at IS NOT NULL)
);
CREATE INDEX application_provider_reserved_month ON public.application_provider_reservations(reserved_at,provider);
CREATE INDEX application_provider_active ON public.application_provider_reservations(reserved_at) WHERE finished_at IS NULL;
ALTER TABLE public.application_spending_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_provider_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_spending_policy,public.application_provider_reservations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.application_spending_policy,public.application_provider_reservations TO service_role;

-- The singleton row lock serializes ALL reservations across users, workflows and months.
-- Reservations count in full forever within their month: no failure/timeout refunds.
CREATE FUNCTION public.application_reserve_provider(p_user_id uuid,p_workflow text,p_request_id text,p_provider text,p_slots integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE policy public.application_spending_policy%ROWTYPE;
  month_start timestamptz;
  n_total bigint; n_provider bigint; n_search bigint; n_user bigint; n_active bigint; provider_limit integer;
BEGIN
  SELECT * INTO policy FROM public.application_spending_policy WHERE singleton FOR UPDATE;
  IF NOT FOUND OR NOT policy.enabled OR public.application_beta_member(p_user_id) IS NOT TRUE
    OR p_workflow IS NULL OR p_workflow NOT IN ('scan','discovery','weekly','collect-sources','x-search')
    OR p_provider IS NULL OR p_provider NOT IN ('openrouter','serpapi','x')
    OR p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 200
    OR p_slots IS NULL OR p_slots NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
  month_start := date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  -- Never reserve an already-seen identity again, including after a month boundary.
  IF EXISTS(SELECT 1 FROM public.application_provider_reservations WHERE user_id=p_user_id AND workflow=p_workflow AND request_id=p_request_id AND provider=p_provider) THEN RETURN false; END IF;
  SELECT count(*),count(*) FILTER(WHERE provider=p_provider),count(*) FILTER(WHERE provider IN ('serpapi','x')),
    count(*) FILTER(WHERE user_id=p_user_id AND (provider='openrouter')=(p_provider='openrouter'))
  INTO n_total,n_provider,n_search,n_user FROM public.application_provider_reservations WHERE reserved_at>=month_start;
  SELECT count(*) INTO n_active FROM public.application_provider_reservations WHERE finished_at IS NULL;
  provider_limit := CASE p_provider WHEN 'openrouter' THEN policy.openrouter_requests WHEN 'serpapi' THEN policy.serpapi_requests ELSE policy.x_requests END;
  IF n_total+p_slots>policy.total_requests OR n_provider+p_slots>provider_limit OR n_active+p_slots>policy.max_concurrent
    OR (p_provider<>'openrouter' AND n_search+p_slots>policy.search_requests)
    OR n_user+p_slots>(CASE WHEN p_provider='openrouter' THEN policy.user_ai_requests ELSE policy.user_search_requests END)
  THEN RETURN false; END IF;
  INSERT INTO public.application_provider_reservations(user_id,workflow,request_id,provider,slot)
    SELECT p_user_id,p_workflow,p_request_id,p_provider,i FROM generate_series(1,p_slots) i;
  RETURN true;
END;
$$;

-- Claim is irreversible. Even a lost RPC response cannot replay external work.
CREATE FUNCTION public.application_dispatch_provider(p_user_id uuid,p_workflow text,p_request_id text,p_provider text,p_slot integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE policy public.application_spending_policy%ROWTYPE;
BEGIN
  SELECT * INTO policy FROM public.application_spending_policy WHERE singleton FOR UPDATE;
  IF NOT FOUND OR NOT policy.enabled OR public.application_beta_member(p_user_id) IS NOT TRUE THEN RETURN false; END IF;
  -- Recheck lowered policy limits against all outstanding reservations before dispatch.
  -- A configuration edit cannot make previously reserved work ignore the new ceiling.
  IF (SELECT count(*) FROM public.application_provider_reservations WHERE finished_at IS NULL)>policy.max_concurrent
    OR (SELECT count(*) FROM public.application_provider_reservations WHERE reserved_at >= (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))>policy.total_requests
    OR (SELECT count(*) FROM public.application_provider_reservations WHERE provider=p_provider AND reserved_at >= (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))>
      (CASE p_provider WHEN 'openrouter' THEN policy.openrouter_requests WHEN 'serpapi' THEN policy.serpapi_requests ELSE policy.x_requests END)
    OR (p_provider<>'openrouter' AND (SELECT count(*) FROM public.application_provider_reservations WHERE provider IN ('serpapi','x') AND reserved_at >= (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))>policy.search_requests)
    OR (SELECT count(*) FROM public.application_provider_reservations WHERE user_id=p_user_id AND (provider='openrouter')=(p_provider='openrouter') AND reserved_at >= (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))>
      (CASE WHEN p_provider='openrouter' THEN policy.user_ai_requests ELSE policy.user_search_requests END)
  THEN RETURN false; END IF;
  UPDATE public.application_provider_reservations SET dispatched_at=clock_timestamp()
    WHERE user_id=p_user_id AND workflow=p_workflow AND request_id=p_request_id AND provider=p_provider AND slot=p_slot
      AND dispatched_at IS NULL AND finished_at IS NULL
      AND reserved_at >= (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  RETURN FOUND;
END;
$$;
CREATE FUNCTION public.application_finish_provider(p_user_id uuid,p_workflow text,p_request_id text,p_provider text,p_slot integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  UPDATE public.application_provider_reservations SET finished_at=clock_timestamp()
    WHERE user_id=p_user_id AND workflow=p_workflow AND request_id=p_request_id AND provider=p_provider AND slot=p_slot
      AND dispatched_at IS NOT NULL AND finished_at IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.application_reserve_provider(uuid,text,text,text,integer),public.application_dispatch_provider(uuid,text,text,text,integer),public.application_finish_provider(uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.application_reserve_provider(uuid,text,text,text,integer),public.application_dispatch_provider(uuid,text,text,text,integer),public.application_finish_provider(uuid,text,text,text,integer) TO service_role;

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
  v_scan_id := gen_random_uuid();
  IF NOT public.application_reserve_provider(p_user_id,'scan',v_scan_id::text,'openrouter',2) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, v_existing_status, false, v_unlimited, 'global_budget_unavailable', NULL::integer, v_retry_of;
    RETURN;
  END IF;
  IF NOT v_unlimited THEN
    UPDATE public.user_profiles SET scans_used = scans_used + 1, updated_at = now() WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.scan(id, user_id, market, audience, region, evidence, file_url, status, request_fingerprint, attempt_number, retry_of_scan_id)
  VALUES (v_scan_id, p_user_id, p_market, p_audience, p_region, p_evidence, NULL, 'pending', p_request_fingerprint, v_attempt, v_retry_of)
  RETURNING id INTO v_scan_id;

  RETURN QUERY SELECT true, v_scan_id, v_disposition, v_existing_status, true, v_unlimited, NULL::text, v_attempt, v_retry_of;
END;
$$;


ALTER TABLE public.weekly_intelligence_runs ADD COLUMN spending_execution_attempts integer NOT NULL DEFAULT 1 CHECK (spending_execution_attempts > 0);
create or replace function public.claim_weekly_intelligence_run(
  p_user_id uuid,
  p_period_start timestamp with time zone,
  p_period_end timestamp with time zone,
  p_timezone text,
  p_stale_before timestamp with time zone
)
returns table(claim_status text, run jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_run public.weekly_intelligence_runs%rowtype;
  lock_key text;
  execution_limit integer;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'p_user_id is required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_start >= p_period_end then
    raise exception using errcode = '22023', message = 'valid p_period_start and p_period_end are required';
  end if;
  if nullif(btrim(coalesce(p_timezone, '')), '') is null then
    raise exception using errcode = '22023', message = 'p_timezone is required';
  end if;
  if p_stale_before is null then
    raise exception using errcode = '22023', message = 'p_stale_before is required';
  end if;

  lock_key := p_user_id::text || '|' || p_period_start::text || '|' || p_period_end::text;
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));

  select runs.* into claimed_run
  from public.weekly_intelligence_runs as runs
  where runs.user_id = p_user_id
    and runs.period_start = p_period_start
    and runs.period_end = p_period_end
  order by runs.created_at asc, runs.id asc
  limit 1
  for update;

  if not found then
    SELECT weekly_max_executions INTO execution_limit FROM public.application_spending_policy WHERE singleton AND enabled;
    IF execution_limit IS NULL OR execution_limit < 1 THEN
      RAISE EXCEPTION 'Weekly spending policy unavailable' USING ERRCODE='P0001';
    END IF;
    insert into public.weekly_intelligence_runs(user_id, period_start, period_end, timezone, status, updated_at)
    values (p_user_id, p_period_start, p_period_end, btrim(p_timezone), 'processing', now())
    returning * into claimed_run;

    claim_status := 'claimed';
    run := to_jsonb(claimed_run);
    return next;
    return;
  end if;

  if claimed_run.status = 'completed' then
    claim_status := 'completed';
  elsif claimed_run.status = 'processing' and coalesce(claimed_run.updated_at, claimed_run.created_at) >= p_stale_before then
    claim_status := 'processing';
  else
    SELECT weekly_max_executions INTO execution_limit FROM public.application_spending_policy WHERE singleton AND enabled;
    IF execution_limit IS NULL OR execution_limit < 1 THEN
      RAISE EXCEPTION 'Weekly spending policy unavailable' USING ERRCODE='P0001';
    END IF;
    IF claimed_run.spending_execution_attempts >= execution_limit THEN
      RAISE EXCEPTION 'Weekly retry ceiling exhausted' USING ERRCODE='P0001';
    END IF;
    update public.weekly_intelligence_runs as runs
    set spending_execution_attempts = runs.spending_execution_attempts + 1,
        status = 'processing',
        timezone = btrim(p_timezone),
        updated_at = now()
    where runs.id = claimed_run.id
      and runs.status <> 'completed'
    returning runs.* into claimed_run;

    claim_status := 'reclaimed';
  end if;

  run := to_jsonb(claimed_run);
  return next;
end;
$$;

revoke all on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) from public;
revoke execute on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) from anon;
revoke execute on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) from authenticated;
grant execute on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) to service_role;

NOTIFY pgrst, 'reload schema';
