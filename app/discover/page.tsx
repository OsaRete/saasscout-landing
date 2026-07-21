"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";
import { Button, EmptyState, LoadingState, Notice } from "../../components/ui";

type UserProfile = {
  id: string;
  user_id: string;
  plan: string;
  scan_limit: number;
  scans_used: number;
  external_sources_limit: number;
  weekly_intelligence_enabled: boolean;
  pdf_export_enabled: boolean;
};

type Discovery = {
  id: string;
  user_id: string;
  plan: string;
  sources_limit: number;
  total_sources_analyzed: number;
  summary: string | null;
  status: string;
  created_at: string;
};

type DiscoveredProblem = {
  id: string;
  discovery_id: string;
  user_id: string;
  problem_title: string;
  problem_summary: string | null;
  affected_niches: string | null;
  suggested_solutions: string | null;
  pain_score: number | null;
  revenue_score: number | null;
  urgency_score: number | null;
  trend_score?: number | null;
  buying_signal_score?: number | null;
  frequency_score?: number | null;
  opportunity_score?: number | null;
  source_quality_score?: number | null;
  problem_cluster?: string | null;
  build_difficulty: string | null;
  source_evidence: string | null;
  created_at: string;
};

type ProblemIntelligence = {
  id: string;
  problem_title: string;
  prepared_count: number;
  converted_count: number;
  avg_pain_score: number;
  avg_revenue_score: number;
  avg_urgency_score: number;
  avg_buying_signal_score?: number | null;
  avg_frequency_score?: number | null;
  avg_source_quality_score?: number | null;
  avg_opportunity_score?: number | null;
  intelligence_score: number;
  updated_at: string;
};

type FounderMatch = {
  id: string;
  user_id: string;
  problem_id: string;
  problem_title: string;
  founder_fit_score: number;
  experience_match: number;
  skill_match: number;
  budget_match: number;
  time_match: number;
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

function scoreWidth(score: number | null | undefined) {
  return `${Math.min(100, Math.max(0, Number(score || 0) * 10))}%`;
}

function getOpportunityScore(
  problem: DiscoveredProblem,
  intelligence: ProblemIntelligence | null
) {
  return Number(
    problem.opportunity_score ||
      intelligence?.avg_opportunity_score ||
      intelligence?.intelligence_score ||
      ((Number(problem.pain_score || 0) +
        Number(problem.revenue_score || 0) +
        Number(problem.urgency_score || 0)) /
        3) *
        10
  );
}

function getScoreLabel(score: number) {
  if (score >= 85) return "High-confidence opportunity";
  if (score >= 70) return "Promising opportunity";
  if (score >= 50) return "Early opportunity";
  return "New signal";
}

function getFounderFitLabel(score: number) {
  if (score >= 85) return "Excellent fit";
  if (score >= 70) return "Good fit";
  if (score >= 50) return "Possible fit";
  if (score > 0) return "Weak fit";
  return "Not calculated";
}

export default function DiscoverPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [matchingProblemId, setMatchingProblemId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [problems, setProblems] = useState<DiscoveredProblem[]>([]);
  const [problemIntelligence, setProblemIntelligence] = useState<
    ProblemIntelligence[]
  >([]);
  const [founderMatches, setFounderMatches] = useState<FounderMatch[]>([]);
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState<string | null>(
    null
  );

  const loadDiscoveryData = useCallback(async () => {
    //setLoadingData(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setUserId(user.id);
    setLoadingAuth(false);

    const { data: profileData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    setUserProfile(profileData || null);

    const { data: discoveryData, error: discoveryError } = await supabase
      .from("opportunity_discoveries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (discoveryError) {
      console.error(discoveryError);
      setMessage("Could not load discoveries.");
      setLoadingData(false);
      return;
    }

    const discoveryIds = (discoveryData || []).map((item) => item.id);

    let problemsData: DiscoveredProblem[] = [];

    if (discoveryIds.length > 0) {
      const { data, error } = await supabase
        .from("discovered_problems")
        .select("*")
        .in("discovery_id", discoveryIds);

      if (error) console.error(error);
      else problemsData = data || [];
    }

    const { data: intelligenceData } = await supabase
      .from("problem_intelligence")
      .select("*")
      .order("intelligence_score", { ascending: false });

    const { data: founderMatchData } = await supabase
      .from("founder_problem_matches")
      .select("*")
      .eq("user_id", user.id);

    setDiscoveries(discoveryData || []);
    setProblems(problemsData);
    setProblemIntelligence(intelligenceData || []);
    setFounderMatches(founderMatchData || []);
    setSelectedDiscoveryId((current) => current || discoveryData?.[0]?.id || null);
    setLoadingData(false);
  }, [router]);

  // useEffect(() => {
  //   void loadDiscoveryData();
  // }, [loadDiscoveryData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDiscoveryData();
    }, 0);
  
    return () => window.clearTimeout(timer);
  }, [loadDiscoveryData]);

  const selectedDiscovery = useMemo(() => {
    return discoveries.find((item) => item.id === selectedDiscoveryId) || null;
  }, [discoveries, selectedDiscoveryId]);

  function getProblemIntelligence(problemTitle: string) {
    return (
      problemIntelligence.find(
        (item) =>
          item.problem_title.trim().toLowerCase() ===
          problemTitle.trim().toLowerCase()
      ) || null
    );
  }

  function getFounderMatch(problemId: string) {
    return founderMatches.find((match) => match.problem_id === problemId) || null;
  }

  const selectedProblems = useMemo(() => {
    if (!selectedDiscovery) return [];

    return problems
      .filter((problem) => problem.discovery_id === selectedDiscovery.id)
      .sort((a, b) => {
        const intelA = getProblemIntelligence(a.problem_title);
        const intelB = getProblemIntelligence(b.problem_title);

        const founderA = getFounderMatch(a.id)?.founder_fit_score || 0;
        const founderB = getFounderMatch(b.id)?.founder_fit_score || 0;

        const scoreA = getOpportunityScore(a, intelA) + founderA * 0.4;
        const scoreB = getOpportunityScore(b, intelB) + founderB * 0.4;

        return scoreB - scoreA;
      });
  }, [problems, selectedDiscovery, problemIntelligence, founderMatches]);

  const bestProblem = selectedProblems[0] || null;

  const dataMoatStats = useMemo(() => {
    const totalPrepared = problemIntelligence.reduce(
      (sum, item) => sum + Number(item.prepared_count || 0),
      0
    );

    const totalConverted = problemIntelligence.reduce(
      (sum, item) => sum + Number(item.converted_count || 0),
      0
    );

    const avgMoatScore =
      problemIntelligence.length > 0
        ? Number(
            (
              problemIntelligence.reduce(
                (sum, item) => sum + Number(item.intelligence_score || 0),
                0
              ) / problemIntelligence.length
            ).toFixed(1)
          )
        : 0;

    return {
      knownProblems: problemIntelligence.length,
      totalPrepared,
      totalConverted,
      avgMoatScore,
    };
  }, [problemIntelligence]);

  async function handleAnalyzeMarket() {
    if (!userId || analyzing) return;

    setAnalyzing(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Your session expired. Please log in again.");
        return;
      }

      const response = await fetch("/api/discover-opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Could not analyze market signals.");
        setAnalyzing(false);
        return;
      }

      await loadDiscoveryData();

      if (result.discovery?.id) {
        setSelectedDiscoveryId(result.discovery.id);
      }

      setMessage(
        "Discovery completed. Live signals were analyzed and the data moat was updated."
      );
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong analyzing market signals.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCalculateFounderFit(problem: DiscoveredProblem) {
    if (!userId || matchingProblemId) return;

    setMatchingProblemId(problem.id);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Your session expired. Please log in again.");
        return;
      }

      const response = await fetch("/api/founder-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ problemId: problem.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Could not calculate founder fit.");
        setMatchingProblemId(null);
        return;
      }

      const savedMatch = result.match as FounderMatch;

      setFounderMatches((current) => [
        savedMatch,
        ...current.filter((match) => match.problem_id !== savedMatch.problem_id),
      ]);

      setMessage("Founder fit calculated successfully.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong calculating founder fit.");
    } finally {
      setMatchingProblemId(null);
    }
  }

  async function handlePrepareDeepScan(problem: DiscoveredProblem, niches: string[]) {
    if (!userId) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setMessage("Your session expired. Please log in again.");
      return;
    }

    const response = await fetch("/api/discover/actions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        discoveryId: problem.discovery_id,
        problemId: problem.id,
        actionType: "prepared_deep_scan",
      }),
    });

    if (!response.ok) {
      setMessage("Could not prepare deep scan for this problem.");
      return;
    }

    const marketParam = encodeURIComponent(niches[0] || problem.problem_title);

    const evidenceParam = encodeURIComponent(`${problem.problem_title}

${problem.problem_summary || ""}

Affected niches:
${problem.affected_niches || ""}

Suggested solutions:
${problem.suggested_solutions || ""}

Source evidence:
${problem.source_evidence || ""}`);

    router.push(
      `/scan?market=${marketParam}&evidence=${evidenceParam}&discoveryId=${problem.discovery_id}&problemId=${problem.id}&problemTitle=${encodeURIComponent(
        problem.problem_title
      )}`
    );
  }

  if (loadingAuth || loadingData) {
    return (
      <LoadingState title="Loading opportunity discovery" description="Preparing live signals, data moat context, and founder-fit state." />
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
              href="/weekly"
              className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
            >
              Weekly Intelligence
            </Link>

            <Link
              href="/founder-profile"
              className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-200 hover:bg-violet-500/20"
            >
              Founder Profile
            </Link>

            <Link
              href="/scan"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              New Scan
            </Link>
          </div>
        </div>

        <section className="mt-14 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] via-cyan-600/[0.08] to-violet-600/[0.08] p-8 shadow-2xl md:p-12">
          <p className="text-sm uppercase tracking-widest text-cyan-300">
            Discover Opportunities
          </p>

          <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px]">
            <div>
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                Discover SaaS opportunities from live market signals and your data moat.
              </h1>

              <p className="mt-5 max-w-3xl text-gray-400">
                Discover searches external sources, compares them with internal intelligence,
                updates the data moat, and ranks opportunities by evidence, buying intent,
                frequency, source quality, and founder fit.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-xs">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-cyan-200">
                  Live external search
                </span>
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-violet-200">
                  Data moat scoring
                </span>
                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-green-200">
                  Founder fit ready
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/20 p-6">
              <p className="text-sm text-gray-400">Current plan</p>
              <h2 className="mt-2 text-3xl font-bold">
                {userProfile?.plan?.toUpperCase() || "FREE"}
              </h2>

              <p className="mt-3 text-sm text-gray-400">
                Source limit:{" "}
                <span className="font-semibold text-cyan-200">
                  {userProfile?.external_sources_limit || 10}
                </span>
              </p>

              <button
                onClick={handleAnalyzeMarket}
                disabled={analyzing}
                className="mt-6 flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-4 text-sm font-bold text-white shadow-xl shadow-cyan-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {analyzing ? "Searching live signals..." : "Run Discovery"}
              </button>

              <p className="mt-3 text-xs leading-relaxed text-gray-500">
                This run searches live sources and updates the data moat.
              </p>
            </div>
          </div>

          {message && (
            <Notice
              tone={message.toLowerCase().includes("could not") || message.toLowerCase().includes("wrong") || message.toLowerCase().includes("expired") ? "error" : "success"}
              className="mt-6"
            >
              {message}
            </Notice>
          )}
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Known moat problems</p>
            <h2 className="mt-3 text-4xl font-bold">{dataMoatStats.knownProblems}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Prepared scans</p>
            <h2 className="mt-3 text-4xl font-bold">{dataMoatStats.totalPrepared}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Converted ideas</p>
            <h2 className="mt-3 text-4xl font-bold">{dataMoatStats.totalConverted}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Avg moat score</p>
            <h2 className="mt-3 text-4xl font-bold">{dataMoatStats.avgMoatScore}</h2>
          </div>
        </section>

        {discoveries.length === 0 ? (
          <EmptyState
            icon="✦"
            title="No discoveries yet"
            description="Run your first discovery to search live market signals and feed the data moat."
            primaryAction={<Button onClick={handleAnalyzeMarket} disabled={analyzing}>{analyzing ? "Searching live signals..." : "Run Discovery"}</Button>}
            className="mt-10"
          />
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Discovery history</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Compare live discovery runs and see how the data moat evolves.
                  </p>
                </div>

                <p className="text-sm text-gray-500">
                  {discoveries.length} run{discoveries.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {discoveries.map((discovery) => (
                  <button
                    key={discovery.id}
                    onClick={() => setSelectedDiscoveryId(discovery.id)}
                    className={`rounded-xl border px-4 py-2 text-sm transition ${
                      selectedDiscoveryId === discovery.id
                        ? "border-cyan-500/40 bg-cyan-500/20 text-white"
                        : "border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.06]"
                    }`}
                  >
                    {formatDate(discovery.created_at)} ·{" "}
                    {discovery.total_sources_analyzed} sources
                  </button>
                ))}
              </div>
            </section>

            {selectedDiscovery && (
              <>
                <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-7">
                  <h2 className="text-2xl font-bold">Discovery Summary</h2>
                  <p className="mt-4 max-w-4xl leading-relaxed text-gray-400">
                    {selectedDiscovery.summary ||
                      "SaaSScout searched live signals, compared them with the data moat, and detected monetizable problems."}
                  </p>
                </section>

                <section className="mt-8 grid gap-6">
                  {selectedProblems.map((problem, index) => {
                    const niches = splitByPipe(problem.affected_niches);
                    const solutions = splitByPipe(problem.suggested_solutions);
                    const intelligence = getProblemIntelligence(problem.problem_title);
                    const founderMatch = getFounderMatch(problem.id);

                    const opportunityScore = getOpportunityScore(problem, intelligence);
                    const founderFitScore = Number(founderMatch?.founder_fit_score || 0);

                    return (
                      <div key={problem.id} className="rounded-3xl border border-white/10 bg-[#0B1020] p-7 shadow-2xl">
                        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                          <div className="flex-1">
                            <p className="text-sm text-cyan-400">
                              Opportunity #{index + 1}
                            </p>

                            <h3 className="mt-3 text-3xl font-bold">
                              {problem.problem_title}
                            </h3>

                            <p className="mt-4 max-w-4xl leading-relaxed text-gray-400">
                              {problem.problem_summary || "No summary available."}
                            </p>

                            <div className="mt-5 flex flex-wrap gap-3">
                              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                                Cluster: {problem.problem_cluster || "General"}
                              </span>

                              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                                Data moat: {intelligence ? "Known signal" : "New signal"}
                              </span>

                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-300">
                                Build difficulty: {problem.build_difficulty || "Medium"}
                              </span>
                            </div>
                          </div>

                          <div className="grid w-full gap-4 md:grid-cols-2 xl:max-w-xl">
                            <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/10 p-5">
                              <p className="text-xs uppercase tracking-widest text-cyan-200">
                                Opportunity Score
                              </p>
                              <h4 className="mt-3 text-4xl font-bold">
                                {opportunityScore.toFixed(1)}
                              </h4>
                              <p className="mt-2 text-sm text-cyan-100/80">
                                {getScoreLabel(opportunityScore)}
                              </p>
                            </div>

                            <div className="rounded-3xl border border-green-500/30 bg-green-500/10 p-5">
                              <p className="text-xs uppercase tracking-widest text-green-200">
                                Founder Fit
                              </p>
                              <h4 className="mt-3 text-4xl font-bold">
                                {founderFitScore > 0 ? founderFitScore.toFixed(1) : "—"}
                              </h4>
                              <p className="mt-2 text-sm text-green-100/80">
                                {getFounderFitLabel(founderFitScore)}
                              </p>

                              <button
                                type="button"
                                onClick={() => handleCalculateFounderFit(problem)}
                                disabled={matchingProblemId === problem.id}
                                className="mt-4 flex w-full items-center justify-center rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-500 disabled:opacity-60"
                              >
                                {matchingProblemId === problem.id
                                  ? "Calculating..."
                                  : founderFitScore > 0
                                  ? "Recalculate Fit"
                                  : "Calculate Founder Fit"}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-5">
                          {[
                            { label: "Pain", value: problem.pain_score },
                            { label: "Revenue", value: problem.revenue_score },
                            { label: "Urgency", value: problem.urgency_score },
                            { label: "Buying", value: problem.buying_signal_score },
                            { label: "Frequency", value: problem.frequency_score },
                          ].map((score) => (
                            <div key={score.label}>
                              <div className="mb-2 flex justify-between text-xs text-gray-400">
                                <span>{score.label}</span>
                                <span>{score.value || 0}/10</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                                <div className="h-full rounded-full bg-cyan-500" style={{ width: scoreWidth(score.value) }} />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-6 grid gap-4 lg:grid-cols-3">
                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">Affected Niches</h4>
                            <div className="mt-4 space-y-3">
                              {(niches.length ? niches : ["No niches detected."]).map((item) => (
                                <p key={item} className="rounded-xl bg-black/20 px-4 py-3 text-sm text-gray-300">
                                  {item}
                                </p>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">SaaS Angles</h4>
                            <div className="mt-4 space-y-3">
                              {(solutions.length ? solutions : ["No solution angle available."]).map((item) => (
                                <p key={item} className="rounded-xl bg-black/20 px-4 py-3 text-sm text-gray-300">
                                  {item}
                                </p>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">Evidence</h4>
                            <p className="mt-4 text-sm leading-relaxed text-gray-300">
                              {problem.source_evidence || "No evidence available."}
                            </p>

                            <button
                              type="button"
                              onClick={() => handlePrepareDeepScan(problem, niches)}
                              className="mt-5 flex w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-500"
                            >
                              Prepare Deep Scan
                            </button>
                          </div>
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