export type WeeklyPresentationRun = {
  execution_contract_version?: string | null;
  execution_mode?: string | null;
  external_provider_state?: string | null;
  external_sources_persisted?: number | null;
  source_degraded?: boolean | null;
  total_sources_analyzed?: number | null;
};

export function weeklyCoverageLabel(run: WeeklyPresentationRun) {
  if (!run.execution_contract_version) return "Legacy / unknown";
  if (run.external_provider_state === "healthy") return "Healthy";
  if (run.external_provider_state === "degraded" || run.source_degraded) return "Degraded";
  if (run.execution_mode === "data_moat_fallback") return "Data Moat fallback";
  if (run.external_provider_state === "unavailable" || run.external_provider_state === "not_configured") return "Unavailable";
  if (run.external_provider_state === "no_results") return "No live results";
  return "Unknown";
}

export function weeklySourceCountLabels(run: WeeklyPresentationRun) {
  if (!run.execution_contract_version) return { history: `${run.total_sources_analyzed || 0} sources`, collected: null, used: null };
  const collected = run.external_sources_persisted ?? 0;
  const used = run.total_sources_analyzed ?? 0;
  return {
    history: `${collected} collected · ${used} used`,
    collected: `${collected} external sources collected`,
    used: `${used} strongest signals used for this report`,
  };
}
