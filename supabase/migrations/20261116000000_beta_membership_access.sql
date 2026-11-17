-- Explicit Beta membership is independent of identity, plan and tester entitlement.
-- No users are admitted by this migration. Do not activate Beta before PR 2.
ALTER TABLE public.application_user_access
  DROP CONSTRAINT application_user_access_role_check,
  ADD CONSTRAINT application_user_access_role_check
    CHECK (access_role IN ('internal_tester', 'beta_member')),
  ADD COLUMN beta_admitted boolean NOT NULL DEFAULT false,
  ADD COLUMN beta_expires_at timestamptz,
  ADD CONSTRAINT beta_member_no_unlimited_scans
    CHECK (access_role <> 'beta_member' OR unlimited_scans = false);

COMMENT ON COLUMN public.application_user_access.beta_admitted IS
  'Owner-managed Beta admission only. Auth, subscription and tester privileges do not imply membership.';
COMMENT ON COLUMN public.application_user_access.beta_expires_at IS
  'Independent Beta expiry; existing is_active/expires_at remain tester entitlement fields.';

REVOKE ALL ON public.application_user_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.application_user_access TO service_role;

-- Only the trusted server may ask about an explicit user. No enumeration RPC
-- for browsers, and no client metadata, profile field or email inference.
CREATE FUNCTION public.application_beta_member(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.application_user_access a
    WHERE a.user_id = p_user_id AND a.beta_admitted = true
      AND (a.beta_expires_at IS NULL OR a.beta_expires_at > statement_timestamp())
  );
$$;
REVOKE ALL ON FUNCTION public.application_beta_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.application_beta_member(uuid) TO service_role;

-- The same persisted predicate serves bearer-authenticated APIs and direct RLS.
-- SECURITY DEFINER reads only service-owned membership and returns one boolean.
CREATE FUNCTION public.application_beta_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$ SELECT public.application_beta_member(auth.uid()); $$;
REVOKE ALL ON FUNCTION public.application_beta_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_beta_access() TO authenticated;

-- Explicit inventory of existing protected browser surfaces. Restrictive AND,
-- never another permissive policy: all existing owner restrictions still apply.
-- Public acquisition and service-only participant tables are not founder ingress.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'discovered_problems', 'evidence_analysis', 'founder_problem_matches',
    'founder_matches', 'founder_profiles', 'opportunities',
    'opportunity_discoveries', 'problem_intelligence', 'saved_ideas', 'scan',
    'scan_sources', 'user_profiles', 'weekly_detected_problems',
    'weekly_intelligence_runs', 'problem_feedback_events',
    'validation_subjects', 'validation_subject_links', 'validation_hypotheses',
    'validation_hypothesis_versions', 'validation_experiments',
    'validation_experiment_versions', 'validation_participants',
    'validation_evidence_observations', 'validation_evidence_classifications',
    'validation_interview_plan_versions', 'validation_interview_sessions',
    'validation_survey_plan_versions', 'validation_survey_publications',
    'validation_survey_submissions', 'validation_survey_answers',
    'validation_intelligence_runs'
  ] LOOP
    -- A missing/unenforced table is a deployment error, not skipped protection.
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'Beta prerequisite missing: RLS-enabled public.%', t;
    END IF;
    EXECUTE format(
      'CREATE POLICY beta_membership_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.application_beta_access())) WITH CHECK ((SELECT public.application_beta_access()))', t);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
