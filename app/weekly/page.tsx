"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";
import { weeklyCoverageLabel, weeklySourceCountLabels } from "@/lib/weekly-presentation";

type WeeklyRun = {
  id: string;
  status: string;
  total_sources_analyzed: number | null;
  summary: string | null;
  created_at: string;
  execution_mode: "fresh_market" | "mixed" | "data_moat_fallback" | "insufficient_context" | null;
  external_provider_state: "healthy" | "degraded" | "unavailable" | "not_configured" | "no_results" | null;
  external_sources_persisted: number | null;
  source_degraded: boolean | null;
  execution_contract_version: string | null;
};

type WeeklyProblem = {
  id: string;
  run_id: string;
  problem_title: string;
  affected_users?: string | null;
  observed_evidence?: string | null;
  repeated_patterns?: string | null;
  business_impact?: string | null;
  why_existing_tools_fail?: string | null;
  suggested_mvp?: string | null;
  recommended_validation?: string | null;
  recommended_deep_scan?: string | null;
  evidence_references?: string[];
  intelligence_score?: number | null;
  confidence_score?: number | null;
  evidence_strength?: string | null;
  problem_summary: string | null;
  affected_niches: string | null;
  suggested_solutions: string | null;
  pain_score: number | null;
  revenue_score: number | null;
  urgency_score: number | null;
  trend_score: number | null;
  monetization_angle: string | null;
  source_evidence: string | null;
  created_at: string;
};

type WeeklySource = {
  id: string;
  run_id: string;
  source_title: string | null;
  source_url: string | null;
  source_snippet: string | null;
  source_type: string | null;
  source_rank: number | null;
  created_at: string;
};

function splitByPipe(value: string | null | undefined) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function scoreWidth(score: number | null) {
  return `${Math.min(100, Math.max(0, Number(score || 0) * 10))}%`;
}

function getProblemScore(problem: WeeklyProblem) {
  return problem.intelligence_score == null ? null : Number(problem.intelligence_score);
}

function getScoreLabel(score: number | null) {
  if (score == null) return "Insufficient evidence";
  if (score >= 8.5) return "Strong signal";
  if (score >= 7) return "Promising";
  if (score >= 5.5) return "Early signal";
  return "Weak signal";
}


type WeeklyApiResponse = {
  success?: boolean;
  error?: string;
  code?: string;
  stage?: string;
  weeklyExecutionId?: string;
  status?: string;
  executionMode?: WeeklyRun["execution_mode"];
  providerState?: WeeklyRun["external_provider_state"];
  reused?: boolean;
};

function getWeeklyRunMessage(result: WeeklyApiResponse, responseOk: boolean) {
  const diagnosticSuffix = result.weeklyExecutionId ? ` Diagnostic ID: ${result.weeklyExecutionId}.` : "";

  if (responseOk && result.code === "weekly_current_period_reused") {
    return `Weekly Intelligence is already up to date. You're viewing the completed report for this week; no new analysis was required.${diagnosticSuffix}`;
  }

  if (responseOk && result.code === "weekly_source_degraded") {
    return `Weekly Intelligence generated with degraded source coverage.${diagnosticSuffix}`;
  }

  if (!responseOk && (result.code === "weekly_authentication_failed" || result.code === "weekly_capability_denied")) {
    return `${result.error || "Weekly Intelligence is not available for this account."}${diagnosticSuffix}`;
  }

  if (!responseOk) {
    return `Could not generate weekly intelligence.${diagnosticSuffix}`;
  }

  if (result.executionMode === "data_moat_fallback") return `Live market sources were temporarily unavailable, so SaaSScout generated this report from your existing Data Moat.${diagnosticSuffix}`;
  if (result.executionMode === "insufficient_context") return `SaaSScout did not have enough reliable fresh or historical evidence to generate a trustworthy report this week.${diagnosticSuffix}`;
  if (result.providerState === "degraded") return `Weekly Intelligence was updated with partial live-market coverage and your Data Moat.${diagnosticSuffix}`;
  return `Weekly Intelligence was updated using fresh market evidence.${diagnosticSuffix}`;
}

function modeLabel(mode: WeeklyRun["execution_mode"]) {
  return ({ fresh_market: "Fresh market", mixed: "Fresh + Data Moat", data_moat_fallback: "Data Moat fallback", insufficient_context: "Insufficient context" } as const)[mode || "insufficient_context"];
}

function buildSourcesEvidence(sources: WeeklySource[]) {
  return sources
    .slice(0, 12)
    .map((source) => [
      source.source_title && `Title: ${source.source_title}`,
      source.source_url && `URL: ${source.source_url}`,
      source.source_snippet && `Snippet: ${source.source_snippet}`,
      source.source_type && `Type: ${source.source_type}`,
    ].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n");
}

export default function WeeklyPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  const [runs, setRuns] = useState<WeeklyRun[]>([]);
  const [problems, setProblems] = useState<WeeklyProblem[]>([]);
  const [sources, setSources] = useState<WeeklySource[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    async function loadWeeklyData() {
      setLoadingData(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setLoadingAuth(false);
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/weekly-intelligence", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` }, cache: "no-store",
      });
      const projection = await response.json();
      if (!response.ok) { setMessage(projection.error || "Could not load weekly intelligence."); setLoadingData(false); return; }
      const runsData = projection.runs || [];
      setRuns(runsData); setProblems(projection.problems || []); setSources(projection.externalSources || []);
      setSelectedRunId(runsData[0]?.id || null); setLoadingData(false);
    }
    void loadWeeklyData();
  }, [router]);

  async function handleRunWeeklyIntelligence() {
    try {
      setGenerating(true);
      setMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Please sign in again to run Weekly Intelligence.");
        return;
      }

      const response = await fetch("/api/weekly-intelligence", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const rawText = await response.text();

      let result: WeeklyApiResponse;

      try {
        result = JSON.parse(rawText);
      } catch {
        setMessage("The API returned an invalid response.");
        return;
      }

      if (!response.ok) {
        setMessage(getWeeklyRunMessage(result, false));
        return;
      }

      setMessage(getWeeklyRunMessage(result, true));
      if (result.code === "weekly_current_period_reused" || result.reused) return;
      window.location.reload();
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong running weekly intelligence.");
    } finally {
      setGenerating(false);
    }
  }

  const selectedRun = useMemo(() => {
    return runs.find((run) => run.id === selectedRunId) || null;
  }, [runs, selectedRunId]);

  const selectedProblems = useMemo(() => {
    if (!selectedRun) return [];

    return problems
      .filter((problem) => problem.run_id === selectedRun.id)
      .sort((a, b) => Number(getProblemScore(b) ?? -1) - Number(getProblemScore(a) ?? -1));
  }, [problems, selectedRun]);

  const selectedSources = useMemo(() => {
    if (!selectedRun) return [];

    return sources
      .filter((source) => source.run_id === selectedRun.id)
      .sort((a, b) => Number(a.source_rank || 0) - Number(b.source_rank || 0));
  }, [sources, selectedRun]);

  const topProblem = selectedProblems[0] || null;

  if (loadingAuth || loadingData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-gray-400">Loading weekly intelligence...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <Image
              src="/brand/logo-main.png"
              alt="SaaSScout"
              width={170}
              height={48}
              className="h-10 w-auto"
            />
          </Link>

          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
            >
              Dashboard
            </Link>

            <Link
              href="/scan"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              New Scan
            </Link>
          </div>
        </div>

        <section className="mt-14 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.06] via-violet-600/[0.08] to-cyan-600/[0.06] p-8 shadow-2xl md:p-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-widest text-violet-300">
                Weekly Intelligence V2
              </p>

              <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
                Evidence-grounded weekly market intelligence.
              </h1>

              <p className="mt-5 max-w-3xl text-gray-400">
                SaaSScout connects your eligible activity, saved market evidence, and clearly labeled external signals into traceable observations and next steps.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleRunWeeklyIntelligence}
                disabled={generating}
                className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? "Refreshing..." : "Refresh Weekly Intelligence"}
              </button>

              <div className="rounded-2xl border border-violet-500/30 bg-black/20 px-5 py-4">
                <p className="text-xs uppercase tracking-widest text-violet-300">
                  Auto-updated
                </p>
                <p className="mt-1 text-sm text-gray-300">
                  Generated from traceable, user-owned market evidence.
                </p>
              </div>
            </div>
          </div>

          {message && (
            <div className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
              {message}
            </div>
          )}
        </section>

        {runs.length === 0 ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-[#0B1020] p-10 text-center">
            <h2 className="text-2xl font-bold">No weekly intelligence yet</h2>
            <p className="mt-3 text-gray-400">
              Run the first weekly intelligence analysis to detect market
              problems automatically.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Weekly runs</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Compare previous automatic market intelligence reports.
                  </p>
                </div>

                <p className="text-sm text-gray-500">
                  {runs.length} run{runs.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`rounded-xl border px-4 py-2 text-sm transition ${
                      selectedRunId === run.id
                        ? "border-violet-500/40 bg-violet-500/20 text-white"
                        : "border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.06]"
                    }`}
                  >
                    {formatDate(run.created_at)} · {weeklySourceCountLabels(run).history}
                  </button>
                ))}
              </div>
            </section>

            {selectedRun && (
              <>
                <div className="mt-8 grid gap-5 md:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Last updated</p>
                    <h2 className="mt-3 text-lg font-bold">{formatDate(selectedRun.created_at)}</h2>
                    <p className="mt-1 text-xs text-gray-500">Automatic Monday run</p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Intelligence mode</p>
                    <h2 className="mt-3 text-lg font-bold">{modeLabel(selectedRun.execution_mode)}</h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Live market coverage</p>
                    <h2 className="mt-3 text-lg font-bold">{weeklyCoverageLabel(selectedRun)}</h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Problems detected</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedProblems.length}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">External sources collected</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedRun.external_sources_persisted ?? selectedSources.length}
                    </h2>
                    {weeklySourceCountLabels(selectedRun).used && <p className="mt-1 text-xs text-gray-500">{weeklySourceCountLabels(selectedRun).used}</p>}
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Top problem</p>
                    <h2 className="mt-3 text-xl font-bold">
                      {topProblem?.problem_title || "—"}
                    </h2>
                  </div>
                </div>

                {selectedRun.summary && <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-7">
                  <h2 className="text-2xl font-bold">Weekly Summary</h2>
                  <p className="mt-4 max-w-4xl leading-relaxed text-gray-400">
                    {selectedRun.summary}
                  </p>
                </section>}

                <section className="mt-8 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-7">
                  <h2 className="text-2xl font-bold">External evidence</h2>
                  <p className="mt-2 text-sm text-gray-400">
                    Public market references are shown separately from user-owned Data Moat evidence and model-derived insights.
                  </p>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {(selectedSources.length > 0
                      ? selectedSources.slice(0, 8)
                      : []
                    ).map((source) => (
                      <a
                        key={source.id}
                        href={source.source_url || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-white/10 bg-black/20 p-5 transition hover:bg-white/[0.05]"
                      >
                        <p className="text-xs uppercase tracking-widest text-cyan-300">
                          {source.source_type || "source"} · #
                          {source.source_rank || "-"}
                        </p>

                        {source.source_title && <h3 className="mt-2 font-semibold text-white">{source.source_title}</h3>}

                        <p className="mt-3 line-clamp-3 text-sm text-gray-400">
                          {source.source_snippet}
                        </p>
                      </a>
                    ))}
                  </div>

                  {selectedSources.length === 0 && (
                    <p className="mt-4 text-sm text-gray-500">
                      This report contains no public external references.
                    </p>
                  )}
                </section>

                <section className="mt-8 grid gap-6">
                  {selectedProblems.map((problem, index) => {
                    const niches = splitByPipe(problem.affected_niches);
                    const solutions = splitByPipe(problem.suggested_solutions);
                    const rootCause = splitByPipe(problem.repeated_patterns).find((item) => item.startsWith("Root cause:"));
                    const solutionGap = splitByPipe(problem.why_existing_tools_fail);
                    const problemScore = getProblemScore(problem);

                    const sourcesEvidence = buildSourcesEvidence(selectedSources);

                    const scanEvidence = `${problem.problem_title}

${problem.problem_summary || ""}

Affected niches:
${problem.affected_niches || ""}

Underlying cause and novelty:
${problem.repeated_patterns || ""}

Existing solution gap:
${problem.why_existing_tools_fail || ""}

Selected opportunity direction:
${problem.suggested_mvp || ""}

Alternative opportunities:
${problem.suggested_solutions || ""}

Scores:
Pain: ${problem.pain_score == null ? "not scored" : `${problem.pain_score}/10`}
Revenue: ${problem.revenue_score == null ? "not scored" : `${problem.revenue_score}/10`}
Urgency: ${problem.urgency_score == null ? "not scored" : `${problem.urgency_score}/10`}
Trend: ${problem.trend_score == null ? "not scored" : `${problem.trend_score}/10`}
Intelligence score: ${problemScore == null ? "Not scored" : `${problemScore}/10`}

Monetization angle:
${problem.monetization_angle || ""}

Weekly problem ID: ${problem.id}
Evidence summary:
${problem.source_evidence || ""}
Evidence references: ${(problem.evidence_references || []).join(", ")}
Recommended investigation: ${problem.recommended_deep_scan || problem.recommended_validation || ""}
Recommended validation angle: ${problem.recommended_validation || ""}
Relevant Data Moat context: ${problem.observed_evidence || problem.repeated_patterns || ""}

External sources:
${sourcesEvidence}`;

                    return (
                      <div
                        key={problem.id}
                        className="rounded-3xl border border-white/10 bg-[#0B1020] p-7 shadow-2xl"
                      >
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm text-violet-400">
                              Evidence-grounded insight #{index + 1}
                            </p>

                            <h3 className="mt-3 text-3xl font-bold">
                              {problem.problem_title}
                            </h3>

                            {problem.problem_summary && <p className="mt-4 max-w-4xl leading-relaxed text-gray-400">{problem.problem_summary}</p>}
                          </div>

                          <div className="w-full rounded-3xl border border-violet-500/30 bg-violet-500/10 p-5 lg:max-w-xs">
                            <p className="text-xs uppercase tracking-widest text-violet-200">
                              Intelligence Score
                            </p>

                            <h4 className="mt-3 text-4xl font-bold">
                              {problemScore == null ? "Not scored" : `${problemScore}/10`}
                            </h4>

                            <p className="mt-2 text-sm text-violet-100/80">
                              {getScoreLabel(problemScore)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-4">
                          {[
                            { label: "Pain", value: problem.pain_score },
                            { label: "Revenue", value: problem.revenue_score },
                            { label: "Urgency", value: problem.urgency_score },
                            { label: "Trend", value: problem.trend_score },
                          ].filter((score) => score.value != null).map((score) => (
                            <div key={score.label}>
                              <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                                <span>{score.label}</span>
                                <span>{score.value == null ? "Not scored" : `${score.value}/10`}</span>
                              </div>

                              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                  className="h-full rounded-full bg-violet-500"
                                  style={{ width: scoreWidth(score.value) }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-3">
                          {rootCause && <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] p-5">
                            <h4 className="font-semibold">Underlying cause</h4>
                            <p className="mt-4 text-sm leading-relaxed text-gray-300">{rootCause.replace(/^Root cause:\s*/, "")}</p>
                          </div>}

                          {solutionGap.length > 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">Workaround and solution gap</h4>
                            <div className="mt-4 space-y-3">{solutionGap.map((item) => <p key={item} className="text-sm leading-relaxed text-gray-300">{item}</p>)}</div>
                          </div>}

                          {niches.length > 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">Affected niches</h4>

                            <div className="mt-4 space-y-3">
                              {niches.map((item) => (
                                <p
                                  key={item}
                                  className="rounded-xl bg-black/20 px-4 py-3 text-sm text-gray-300"
                                >
                                  {item}
                                </p>
                              ))}
                            </div>
                          </div>}

                          {(problem.suggested_mvp || solutions.length > 0) && <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">
                              Monetizable opportunity directions
                            </h4>

                            <div className="mt-4 space-y-3">
                              {problem.suggested_mvp && <p className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm text-gray-200">Best: {problem.suggested_mvp}</p>}
                              {solutions.map((item) => (
                                <p
                                  key={item}
                                  className="rounded-xl bg-black/20 px-4 py-3 text-sm text-gray-300"
                                >
                                  {item}
                                </p>
                              ))}
                            </div>
                          </div>}

                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            {problem.monetization_angle && <><h4 className="font-semibold">
                              Monetization angle
                            </h4><p className="mt-4 text-sm leading-relaxed text-gray-300">{problem.monetization_angle}</p></>}

                            <div className="mt-5 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                              <p className="text-xs leading-relaxed text-violet-200/80">
                                Send this problem into a deeper SaaSScout scan
                                with saved external sources.
                              </p>

                              <Link
                                href={`/scan?market=${encodeURIComponent(
                                  niches[0] || problem.problem_title
                                )}&evidence=${encodeURIComponent(
                                  scanEvidence
                                )}`}
                                className="mt-4 flex w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500"
                              >
                                Prepare Deep Scan
                              </Link>
                            </div>
                          </div>
                        </div>

                        {problem.source_evidence && <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                          <h4 className="font-semibold">Observed evidence</h4>
                          <p className="mt-3 text-sm leading-relaxed text-gray-400">{problem.source_evidence}</p>
                        </div>}
                      </div>
                    );
                  })}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
