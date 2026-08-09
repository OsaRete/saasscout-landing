-- Weekly-only additive storage required for evidence-grounded projection and Deep Scan provenance.
-- Existing rows are not rewritten; all new fields remain nullable.
alter table public.weekly_detected_problems
  add column if not exists affected_users text,
  add column if not exists observed_evidence text,
  add column if not exists repeated_patterns text,
  add column if not exists business_impact text,
  add column if not exists why_existing_tools_fail text,
  add column if not exists suggested_mvp text,
  add column if not exists recommended_validation text,
  add column if not exists recommended_deep_scan text,
  add column if not exists evidence_references jsonb,
  add column if not exists intelligence_score numeric,
  add column if not exists confidence_score numeric,
  add column if not exists evidence_strength text;

alter table public.weekly_detected_problems
  add constraint weekly_detected_problems_evidence_references_array
  check (evidence_references is null or jsonb_typeof(evidence_references) = 'array') not valid,
  add constraint weekly_detected_problems_evidence_strength_values
  check (evidence_strength is null or evidence_strength in ('limited', 'moderate', 'strong')) not valid;

comment on column public.weekly_detected_problems.evidence_references is
  'Stable IDs of user-owned evidence used by deterministic Weekly scoring and Deep Scan provenance.';

-- Preserve the server-owned source boundary explicitly. This is intentionally redundant
-- with the effective privilege migration and prevents later deploy drift.
revoke all on table public.weekly_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.weekly_sources to service_role;
