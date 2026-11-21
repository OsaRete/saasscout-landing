BEGIN;

-- The singleton row lock serializes reservations and dispatch claims across all workflows.
-- Reservations count in full forever within their month: no failure/timeout refunds.
CREATE OR REPLACE FUNCTION public.application_reserve_provider(p_user_id uuid,p_workflow text,p_request_id text,p_provider text,p_slots integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE policy public.application_spending_policy%ROWTYPE;
  month_start timestamptz;
  n_total bigint; n_provider bigint; n_search bigint; n_user bigint; provider_limit integer;
BEGIN
  -- A waiter must see the preceding lock holder's committed ledger writes.
  IF current_setting('transaction_isolation') <> 'read committed' THEN RETURN false; END IF;
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
  provider_limit := CASE p_provider WHEN 'openrouter' THEN policy.openrouter_requests WHEN 'serpapi' THEN policy.serpapi_requests ELSE policy.x_requests END;
  IF n_total+p_slots>policy.total_requests OR n_provider+p_slots>provider_limit
    OR (p_provider<>'openrouter' AND n_search+p_slots>policy.search_requests)
    OR n_user+p_slots>(CASE WHEN p_provider='openrouter' THEN policy.user_ai_requests ELSE policy.user_search_requests END)
  THEN RETURN false; END IF;
  INSERT INTO public.application_provider_reservations(user_id,workflow,request_id,provider,slot)
    SELECT p_user_id,p_workflow,p_request_id,p_provider,i FROM generate_series(1,p_slots) i;
  RETURN true;
END;
$$;

-- Claim is irreversible. Even a lost RPC response cannot replay external work.
CREATE OR REPLACE FUNCTION public.application_dispatch_provider(p_user_id uuid,p_workflow text,p_request_id text,p_provider text,p_slot integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE policy public.application_spending_policy%ROWTYPE;
BEGIN
  -- A waiter must see the preceding lock holder's committed ledger writes.
  IF current_setting('transaction_isolation') <> 'read committed' THEN RETURN false; END IF;
  SELECT * INTO policy FROM public.application_spending_policy WHERE singleton FOR UPDATE;
  IF NOT FOUND OR NOT policy.enabled OR public.application_beta_member(p_user_id) IS NOT TRUE THEN RETURN false; END IF;
  -- Count live work across months. Recheck monthly spending against all charged reservations.
  -- A configuration edit cannot make previously reserved work ignore the new ceiling.
  IF (SELECT count(*) FROM public.application_provider_reservations WHERE dispatched_at IS NOT NULL AND finished_at IS NULL)>=policy.max_concurrent
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

COMMIT;
