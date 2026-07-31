-- Make user_profiles an authoritative server-owned entitlement boundary.
-- The table currently contains no user-editable columns, so browser roles receive
-- owner-scoped SELECT only. Initial rows continue to be created by the postgres-owned
-- auth.users trigger function; subsequent entitlement writes belong to service_role.

REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;

-- Ownership RLS is retained for browser reads. Mutation policies are removed so the
-- policy catalog does not suggest that direct browser profile writes are supported.
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;

-- Profile creation remains a trusted database operation. Trigger execution does not
-- require the invoking browser role to hold INSERT on user_profiles; SECURITY DEFINER
-- runs as the postgres owner. Keep name resolution fixed and deny direct browser calls.
ALTER FUNCTION public.handle_new_user_profile() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM anon, authenticated;

