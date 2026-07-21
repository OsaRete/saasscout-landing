-- Harden closed-Beta browser privileges after moving destructive user-owned mutations server-side.
-- Historical migrations granted broad table privileges to anon/authenticated; this migration
-- defines the intended final privilege surface without changing data or RLS policies.

revoke all on table public.discovered_problems from public, anon, authenticated;
revoke all on table public.discovery_actions from public, anon, authenticated;
revoke all on table public.evidence_analysis from public, anon, authenticated;
revoke all on table public.founder_problem_matches from public, anon, authenticated;
revoke all on table public.opportunities from public, anon, authenticated;
revoke all on table public.opportunity_discoveries from public, anon, authenticated;
revoke all on table public.opportunity_intelligence from public, anon, authenticated;
revoke all on table public.problem_intelligence from public, anon, authenticated;
revoke all on table public.saved_ideas from public, anon, authenticated;
revoke all on table public.scan from public, anon, authenticated;
revoke all on table public.scan_sources from public, anon, authenticated;
revoke all on table public.user_profiles from public, anon, authenticated;
revoke all on table public.weekly_detected_problems from public, anon, authenticated;
revoke all on table public.weekly_intelligence_runs from public, anon, authenticated;
revoke all on table public.weekly_sources from public, anon, authenticated;
revoke all on table public.weekly_reports from public, anon, authenticated;
revoke all on table public.weekly_niches from public, anon, authenticated;
revoke all on table public.canonical_problems from public, anon, authenticated;
revoke all on table public.problem_observations from public, anon, authenticated;
revoke all on table public.problem_aliases from public, anon, authenticated;
revoke all on table public.problem_evolution_snapshots from public, anon, authenticated;
revoke all on table public.problem_feedback_events from public, anon, authenticated;

-- Public acquisition surface.
grant insert on table public."beta-signups" to anon;

-- Authenticated browser display reads protected by existing RLS policies.
grant select on table public.discovered_problems to authenticated;
grant select on table public.evidence_analysis to authenticated;
grant select on table public.founder_problem_matches to authenticated;
grant select on table public.opportunities to authenticated;
grant select on table public.opportunity_discoveries to authenticated;
grant select on table public.problem_intelligence to authenticated;
grant select on table public.saved_ideas to authenticated;
grant select on table public.scan to authenticated;
grant select on table public.scan_sources to authenticated;
grant select on table public.user_profiles to authenticated;
grant select on table public.weekly_detected_problems to authenticated;
grant select on table public.weekly_intelligence_runs to authenticated;
grant select on table public.problem_feedback_events to authenticated;

-- Intentionally retained direct authenticated profile bootstrap/update path.
grant insert, update on table public.user_profiles to authenticated;

-- Server-owned business mutation and intelligence tables. RLS remains enabled for browser roles;
-- service_role is used only by authenticated server routes/services that derive ownership.
grant all on table public.discovered_problems to service_role;
grant all on table public.discovery_actions to service_role;
grant all on table public.evidence_analysis to service_role;
grant all on table public.founder_problem_matches to service_role;
grant all on table public.opportunities to service_role;
grant all on table public.opportunity_discoveries to service_role;
grant all on table public.opportunity_intelligence to service_role;
grant all on table public.problem_intelligence to service_role;
grant all on table public.saved_ideas to service_role;
grant all on table public.scan to service_role;
grant all on table public.scan_sources to service_role;
grant all on table public.user_profiles to service_role;
grant all on table public.weekly_detected_problems to service_role;
grant all on table public.weekly_intelligence_runs to service_role;
grant all on table public.weekly_sources to service_role;
grant all on table public.weekly_reports to service_role;
grant all on table public.weekly_niches to service_role;
grant all on table public.canonical_problems to service_role;
grant all on table public.problem_observations to service_role;
grant all on table public.problem_aliases to service_role;
grant all on table public.problem_evolution_snapshots to service_role;
grant all on table public.problem_feedback_events to service_role;

-- SECURITY DEFINER Weekly claim accepts p_user_id and is callable only by the authoritative server role.
alter function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) set search_path = public;
revoke all on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) from public;
revoke execute on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) from anon;
revoke execute on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) from authenticated;
grant execute on function public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone) to service_role;
