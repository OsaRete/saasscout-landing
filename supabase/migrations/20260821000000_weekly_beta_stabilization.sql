-- PostgreSQL/PostgREST can infer ON CONFLICT (run_id,evidence_id) only from a
-- non-partial unique index. NULL evidence IDs remain valid for legacy rows.
create unique index if not exists weekly_sources_run_evidence_id_conflict_uidx
  on public.weekly_sources(run_id, evidence_id);

-- Server-owned, additive execution metadata. Historical rows intentionally stay NULL.
alter table public.weekly_intelligence_runs
  add column if not exists execution_contract_version text,
  add column if not exists execution_mode text,
  add column if not exists external_provider_state text,
  add column if not exists external_sources_persisted integer,
  add column if not exists source_degraded boolean;

alter table public.weekly_intelligence_runs
  add constraint weekly_runs_execution_mode_check
    check (execution_mode is null or execution_mode in ('fresh_market','mixed','data_moat_fallback','insufficient_context')),
  add constraint weekly_runs_provider_state_check
    check (external_provider_state is null or external_provider_state in ('healthy','degraded','unavailable','not_configured','no_results')),
  add constraint weekly_runs_external_sources_persisted_check
    check (external_sources_persisted is null or external_sources_persisted >= 0);
