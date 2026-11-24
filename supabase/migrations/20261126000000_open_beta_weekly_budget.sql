BEGIN;

-- Defaults deny public Weekly reservations until the owner assigns a share.
ALTER TABLE public.application_spending_policy
  ADD COLUMN weekly_openrouter_requests integer NOT NULL DEFAULT 0 CHECK (weekly_openrouter_requests >= 0),
  ADD COLUMN weekly_serpapi_requests integer NOT NULL DEFAULT 0 CHECK (weekly_serpapi_requests >= 0);

CREATE OR REPLACE FUNCTION public.application_reserve_provider(p_user_id uuid,p_workflow text,p_request_id text,p_provider text,p_slots integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE policy public.application_spending_policy%ROWTYPE;
  month_start timestamptz;
  n_weekly bigint; weekly_limit integer;
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
  -- Apply the Weekly share under the same lock as the global reservation limits.
  IF p_workflow = 'weekly' AND EXISTS (
    SELECT 1 FROM public.application_beta_release WHERE singleton AND open_free_beta
  ) THEN
    weekly_limit := CASE p_provider WHEN 'openrouter' THEN policy.weekly_openrouter_requests
      WHEN 'serpapi' THEN policy.weekly_serpapi_requests ELSE 0 END;
    SELECT count(*) INTO n_weekly FROM public.application_provider_reservations
      WHERE workflow = 'weekly' AND provider = p_provider AND reserved_at >= month_start;
    IF n_weekly + p_slots > weekly_limit THEN RETURN false; END IF;
  END IF;
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

COMMIT;
