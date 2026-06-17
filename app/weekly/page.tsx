"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

type WeeklyRun = {
  id: string;
  status: string;
  total_sources_analyzed: number | null;
  summary: string | null;
  created_at: string;
};

type WeeklyProblem = {
  id: string;
  run_id: string;
  problem_title: string;
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

function splitByPipe(value: string | null) {
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
  const pain = Number(problem.pain_score || 0);
  const revenue = Number(problem.revenue_score || 0);
  const urgency = Number(problem.urgency_score || 0);
  const trend = Number(problem.trend_score || 0);

  return Number(
    (pain * 0.3 + revenue * 0.3 + urgency * 0.2 + trend * 0.2).toFixed(1)
  );
}

function getScoreLabel(score: number) {
  if (score >= 8.5) return "Strong signal";
  if (score >= 7) return "Promising";
  if (score >= 5.5) return "Early signal";
  return "Weak signal";
}

function buildSourcesEvidence(sources: WeeklySource[]) {
  if (sources.length === 0) return "No external sources saved for this run.";

  return sources
    .slice(0, 12)
    .map(
      (source, index) => `
External Source ${index + 1}
Title: ${source.source_title || "Untitled source"}
URL: ${source.source_url || "No URL"}
Snippet: ${source.source_snippet || "No snippet"}
Type: ${source.source_type || "unknown"}
`
    )
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
  
      const {
        data: { user },
      } = await supabase.auth.getUser();
  
      if (!user) {
        router.push("/login");
        return;
      }
  
      setLoadingAuth(false);
  
      const { data: runsData, error: runsError } = await supabase
        .from("weekly_intelligence_runs")
        .select("*")
        .order("created_at", { ascending: false });
  
      if (runsError) {
        console.error(runsError);
        setMessage("Could not load weekly intelligence runs.");
        setLoadingData(false);
        return;
      }
  
      const runIds = (runsData || []).map((run) => run.id);
  
      let problemsData: WeeklyProblem[] = [];
      let sourcesData: WeeklySource[] = [];
  
      if (runIds.length > 0) {
        const { data: problemRows } = await supabase
          .from("weekly_detected_problems")
          .select("*")
          .in("run_id", runIds);
  
        const { data: sourceRows } = await supabase
          .from("weekly_sources")
          .select("*")
          .in("run_id", runIds)
          .order("source_rank", { ascending: true });
  
        problemsData = problemRows || [];
        sourcesData = sourceRows || [];
      }
  
      setRuns(runsData || []);
      setProblems(problemsData);
      setSources(sourcesData);
      setSelectedRunId(runsData?.[0]?.id || null);
      setLoadingData(false);
    }
  
    void loadWeeklyData();
  }, [router]);

  async function handleRunWeeklyIntelligence() {
    try {
      setGenerating(true);
      setMessage("");

      const response = await fetch("/api/weekly-intelligence", {
        method: "POST",
      });

      const rawText = await response.text();

      let result;

      try {
        result = JSON.parse(rawText);
      } catch {
        console.error("Raw API response:", rawText);
        setMessage("The API returned an invalid response. Check terminal logs.");
        return;
      }

      if (!response.ok) {
        setMessage(result.error || "Could not run weekly intelligence.");
        return;
      }

      setMessage("Weekly Intelligence generated successfully.");
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
      .sort((a, b) => getProblemScore(b) - getProblemScore(a));
  }, [problems, selectedRun]);

  const selectedSources = useMemo(() => {
    if (!selectedRun) return [];

    return sources
      .filter((source) => source.run_id === selectedRun.id)
      .sort((a, b) => Number(a.source_rank || 0) - Number(b.source_rank || 0));
  }, [sources, selectedRun]);

  const topProblem = selectedProblems[0] || null;

  const averageProblemScore =
    selectedProblems.length > 0
      ? Number(
          (
            selectedProblems.reduce(
              (sum, problem) => sum + getProblemScore(problem),
              0
            ) / selectedProblems.length
          ).toFixed(1)
        )
      : 0;

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
                Automatic market problem discovery.
              </h1>

              <p className="mt-5 max-w-3xl text-gray-400">
                SaaSScout scans external signals, detects monetizable problems,
                identifies affected niches, suggests SaaS solutions, and feeds
                the data moat automatically.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleRunWeeklyIntelligence}
                disabled={generating}
                className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? "Generating..." : "Run Weekly Intelligence"}
              </button>

              <div className="rounded-2xl border border-violet-500/30 bg-black/20 px-5 py-4">
                <p className="text-xs uppercase tracking-widest text-violet-300">
                  Auto-updated
                </p>
                <p className="mt-1 text-sm text-gray-300">
                  Generated from external market signals.
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
                    {formatDate(run.created_at)} ·{" "}
                    {run.total_sources_analyzed || 0} sources
                  </button>
                ))}
              </div>
            </section>

            {selectedRun && (
              <>
                <div className="mt-8 grid gap-5 md:grid-cols-4">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Problems detected</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedProblems.length}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Sources saved</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedSources.length}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Avg intelligence</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {averageProblemScore}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Top problem</p>
                    <h2 className="mt-3 text-xl font-bold">
                      {topProblem?.problem_title || "Unknown"}
                    </h2>
                  </div>
                </div>

                <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-7">
                  <h2 className="text-2xl font-bold">Weekly Summary</h2>
                  <p className="mt-4 max-w-4xl leading-relaxed text-gray-400">
                    {selectedRun.summary || "No weekly summary available."}
                  </p>
                </section>

                <section className="mt-8 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-7">
                  <h2 className="text-2xl font-bold">External Sources</h2>
                  <p className="mt-2 text-sm text-gray-400">
                    These sources are now saved and passed into deeper scans.
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

                        <h3 className="mt-2 font-semibold text-white">
                          {source.source_title || "Untitled source"}
                        </h3>

                        <p className="mt-3 line-clamp-3 text-sm text-gray-400">
                          {source.source_snippet || "No snippet available."}
                        </p>
                      </a>
                    ))}
                  </div>

                  {selectedSources.length === 0 && (
                    <p className="mt-4 text-sm text-gray-500">
                      No external sources were saved for this run.
                    </p>
                  )}
                </section>

                <section className="mt-8 grid gap-6">
                  {selectedProblems.map((problem, index) => {
                    const niches = splitByPipe(problem.affected_niches);
                    const solutions = splitByPipe(problem.suggested_solutions);
                    const problemScore = getProblemScore(problem);

                    const sourcesEvidence = buildSourcesEvidence(selectedSources);

                    const scanEvidence = `${problem.problem_title}

${problem.problem_summary || ""}

Affected niches:
${problem.affected_niches || ""}

Suggested solutions:
${problem.suggested_solutions || ""}

Scores:
Pain: ${problem.pain_score || 0}/10
Revenue: ${problem.revenue_score || 0}/10
Urgency: ${problem.urgency_score || 0}/10
Trend: ${problem.trend_score || 0}/10
Intelligence score: ${problemScore}/10

Monetization angle:
${problem.monetization_angle || ""}

Source evidence:
${problem.source_evidence || ""}

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
                              Detected problem #{index + 1}
                            </p>

                            <h3 className="mt-3 text-3xl font-bold">
                              {problem.problem_title}
                            </h3>

                            <p className="mt-4 max-w-4xl leading-relaxed text-gray-400">
                              {problem.problem_summary ||
                                "No problem summary available."}
                            </p>
                          </div>

                          <div className="w-full rounded-3xl border border-violet-500/30 bg-violet-500/10 p-5 lg:max-w-xs">
                            <p className="text-xs uppercase tracking-widest text-violet-200">
                              Intelligence Score
                            </p>

                            <h4 className="mt-3 text-4xl font-bold">
                              {problemScore}/10
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
                          ].map((score) => (
                            <div key={score.label}>
                              <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                                <span>{score.label}</span>
                                <span>{score.value || 0}/10</span>
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
                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">Affected Niches</h4>

                            <div className="mt-4 space-y-3">
                              {(niches.length > 0
                                ? niches
                                : ["No affected niches available."]
                              ).map((item) => (
                                <p
                                  key={item}
                                  className="rounded-xl bg-black/20 px-4 py-3 text-sm text-gray-300"
                                >
                                  {item}
                                </p>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">
                              Monetizable Solutions
                            </h4>

                            <div className="mt-4 space-y-3">
                              {(solutions.length > 0
                                ? solutions
                                : ["No suggested solution available."]
                              ).map((item) => (
                                <p
                                  key={item}
                                  className="rounded-xl bg-black/20 px-4 py-3 text-sm text-gray-300"
                                >
                                  {item}
                                </p>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">
                              Monetization Angle
                            </h4>

                            <p className="mt-4 text-sm leading-relaxed text-gray-300">
                              {problem.monetization_angle ||
                                "No monetization angle available."}
                            </p>

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

                        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                          <h4 className="font-semibold">Source Evidence</h4>

                          <p className="mt-3 text-sm leading-relaxed text-gray-400">
                            {problem.source_evidence ||
                              "No source evidence available."}
                          </p>
                        </div>
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