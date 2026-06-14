"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

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

function getOverallScore(problem: DiscoveredProblem) {
  const pain = Number(problem.pain_score || 0);
  const revenue = Number(problem.revenue_score || 0);
  const urgency = Number(problem.urgency_score || 0);

  return Number(((pain + revenue + urgency) / 3).toFixed(1));
}

function getScoreWidth(score: number | null) {
  return `${Math.min(100, Number(score || 0) * 10)}%`;
}

function getIntelligenceLabel(score: number) {
  if (score >= 85) return "Strong founder signal";
  if (score >= 70) return "Promising signal";
  if (score >= 50) return "Early signal";
  return "New signal";
}

function getFounderFitLabel(score: number) {
  if (score >= 85) return "Excellent fit for you";
  if (score >= 70) return "Good fit";
  if (score >= 50) return "Possible fit";
  if (score > 0) return "Weak fit";
  return "Not calculated yet";
}

export default function DiscoverPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

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

  const [matchingProblemId, setMatchingProblemId] = useState<string | null>(
    null
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadDiscoveryData() {
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

      if (profileData) {
        setUserProfile(profileData);
      }

      const { data: discoveryData, error: discoveryError } = await supabase
        .from("opportunity_discoveries")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (discoveryError) {
        console.error(discoveryError);
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

        if (error) {
          console.error(error);
        } else {
          problemsData = data || [];
        }
      }

      const { data: intelligenceData, error: intelligenceError } =
        await supabase.from("problem_intelligence").select("*");

      if (intelligenceError) {
        console.error(intelligenceError);
      }

      const { data: founderMatchData, error: founderMatchError } =
        await supabase
          .from("founder_problem_matches")
          .select("*")
          .eq("user_id", user.id);

      if (founderMatchError) {
        console.error(founderMatchError);
      }

      setDiscoveries(discoveryData || []);
      setProblems(problemsData);
      setProblemIntelligence(intelligenceData || []);
      setFounderMatches(founderMatchData || []);
      setSelectedDiscoveryId(discoveryData?.[0]?.id || null);
      setLoadingData(false);
    }

    loadDiscoveryData();
  }, [router]);

  const selectedDiscovery = useMemo(() => {
    return (
      discoveries.find((discovery) => discovery.id === selectedDiscoveryId) ||
      null
    );
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
        const intelligenceA =
          problemIntelligence.find(
            (item) =>
              item.problem_title.trim().toLowerCase() ===
              a.problem_title.trim().toLowerCase()
          )?.intelligence_score || 0;

        const intelligenceB =
          problemIntelligence.find(
            (item) =>
              item.problem_title.trim().toLowerCase() ===
              b.problem_title.trim().toLowerCase()
          )?.intelligence_score || 0;

        const founderFitA =
          founderMatches.find((match) => match.problem_id === a.id)
            ?.founder_fit_score || 0;

        const founderFitB =
          founderMatches.find((match) => match.problem_id === b.id)
            ?.founder_fit_score || 0;

        const baseA =
          Number(a.pain_score || 0) +
          Number(a.revenue_score || 0) +
          Number(a.urgency_score || 0);

        const baseB =
          Number(b.pain_score || 0) +
          Number(b.revenue_score || 0) +
          Number(b.urgency_score || 0);

        return (
          intelligenceB +
          founderFitB +
          baseB -
          (intelligenceA + founderFitA + baseA)
        );
      });
  }, [problems, selectedDiscovery, problemIntelligence, founderMatches]);

  const bestProblem = selectedProblems[0] || null;

  async function handleAnalyzeMarket() {
    if (!userId || analyzing) return;

    setAnalyzing(true);
    setMessage("");

    try {
      const response = await fetch("/api/discover-opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Could not analyze market signals.");
        setAnalyzing(false);
        return;
      }

      const newDiscovery = result.discovery as Discovery;
      const newProblems = (result.problems || []) as DiscoveredProblem[];

      setDiscoveries((current) => [newDiscovery, ...current]);
      setProblems((current) => [...newProblems, ...current]);
      setSelectedDiscoveryId(newDiscovery.id);
      setMessage("Opportunity discovery completed successfully.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong analyzing market signals.");
    }

    setAnalyzing(false);
  }

  async function handleCalculateFounderFit(problem: DiscoveredProblem) {
    if (!userId || matchingProblemId) return;

    setMatchingProblemId(problem.id);
    setMessage("");

    try {
      const response = await fetch("/api/founder-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          problemId: problem.id,
        }),
      });

      const rawResponse = await response.text();

let result;

try {
  result = JSON.parse(rawResponse);
} catch {
  console.error("RAW FOUNDER FIT RESPONSE:", rawResponse);
  alert(rawResponse);
  setMessage("Founder fit API returned invalid response.");
  setMatchingProblemId(null);
  return;
}

if (!response.ok) {
  console.error("FOUNDER FIT API ERROR:", result);
  alert(JSON.stringify(result, null, 2));
  setMessage(result.error || "Could not calculate founder fit.");
  setMatchingProblemId(null);
  return;
}

      const savedMatch = result.match as FounderMatch;

      setFounderMatches((current) => {
        const withoutOld = current.filter(
          (match) => match.problem_id !== savedMatch.problem_id
        );

        return [savedMatch, ...withoutOld];
      });

      setMessage("Founder fit calculated successfully.");
    }  catch (error) {
      console.error("FOUNDER FIT FRONTEND ERROR:", error);
      alert("Something went wrong calculating founder fit.");
      setMessage("Something went wrong calculating founder fit.");
    }

    setMatchingProblemId(null);
  }

  async function handlePrepareDeepScan({
    problem,
    niches,
  }: {
    problem: DiscoveredProblem;
    niches: string[];
  }) {
    if (!userId) return;

    await supabase.from("discovery_actions").insert([
      {
        user_id: userId,
        discovery_id: problem.discovery_id,
        problem_id: problem.id,
        action_type: "prepared_deep_scan",
        problem_title: problem.problem_title,
        affected_niches: problem.affected_niches,
        suggested_solutions: problem.suggested_solutions,
        pain_score: problem.pain_score,
        revenue_score: problem.revenue_score,
        urgency_score: problem.urgency_score,
      },
    ]);

    const { data: existingProblem } = await supabase
      .from("problem_intelligence")
      .select("*")
      .eq("problem_title", problem.problem_title)
      .maybeSingle();

    if (!existingProblem) {
      await supabase.from("problem_intelligence").insert([
        {
          problem_title: problem.problem_title,
          prepared_count: 1,
          converted_count: 0,
          avg_pain_score: Number(problem.pain_score || 0),
          avg_revenue_score: Number(problem.revenue_score || 0),
          avg_urgency_score: Number(problem.urgency_score || 0),
          intelligence_score: Number(
            (
              (Number(problem.pain_score || 0) * 0.35 +
                Number(problem.revenue_score || 0) * 0.35 +
                Number(problem.urgency_score || 0) * 0.2 +
                1 * 0.1) *
              10
            ).toFixed(1)
          ),
        },
      ]);
    } else {
      const newPreparedCount = Number(existingProblem.prepared_count || 0) + 1;

      const intelligenceScore = Number(
        (
          (
            Number(existingProblem.avg_pain_score || 0) * 0.35 +
            Number(existingProblem.avg_revenue_score || 0) * 0.35 +
            Number(existingProblem.avg_urgency_score || 0) * 0.2 +
            Math.min(newPreparedCount, 20) * 0.1 +
            Math.min(Number(existingProblem.converted_count || 0), 20) * 0.25
          ) * 10
        ).toFixed(1)
      );

      await supabase
        .from("problem_intelligence")
        .update({
          prepared_count: newPreparedCount,
          intelligence_score: intelligenceScore,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingProblem.id);
    }

    const marketParam = encodeURIComponent(niches[0] || problem.problem_title);

    const evidenceParam = encodeURIComponent(
      `${problem.problem_title}

${problem.problem_summary || ""}

Affected niches:
${problem.affected_niches || ""}

Suggested solutions:
${problem.suggested_solutions || ""}

Source evidence:
${problem.source_evidence || ""}`
    );

    router.push(
      `/scan?market=${marketParam}&evidence=${evidenceParam}&discoveryId=${problem.discovery_id}&problemId=${problem.id}&problemTitle=${encodeURIComponent(
        problem.problem_title
      )}`
    );
  }

  if (loadingAuth || loadingData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-gray-400">Loading opportunity discovery...</p>
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
              href="/founder-profile"
              className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-200 hover:bg-violet-500/20"
            >
              Founder Profile
            </Link>

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

        <section className="mt-14 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] to-cyan-600/[0.08] p-8 shadow-2xl md:p-12">
          <p className="text-sm uppercase tracking-widest text-cyan-300">
            Opportunity Discovery
          </p>

          <div className="mt-4 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                Find monetizable problems before choosing a niche.
              </h1>

              <p className="mt-5 max-w-3xl text-gray-400">
                SaaSScout analyzes external market signals, detects repeated
                problems, identifies affected niches, ranks opportunities using
                behavior data, and now matches them to your founder profile.
              </p>

              <div className="mt-6 flex flex-wrap gap-3 text-xs">
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-cyan-200">
                  Problem-first analysis
                </span>

                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-violet-200">
                  SaaSScout Intelligence Score
                </span>

                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-green-200">
                  Founder Fit Matching
                </span>
              </div>
            </div>

            <div className="w-full rounded-3xl border border-white/10 bg-black/20 p-6 lg:max-w-sm">
              <p className="text-sm text-gray-400">Current plan</p>

              <h2 className="mt-2 text-3xl font-bold">
                {userProfile?.plan?.toUpperCase() || "FREE"}
              </h2>

              <p className="mt-3 text-sm text-gray-400">
                This plan can analyze up to{" "}
                <span className="font-semibold text-cyan-200">
                  {userProfile?.external_sources_limit || 10}
                </span>{" "}
                external sources per discovery run.
              </p>

              <button
                onClick={handleAnalyzeMarket}
                disabled={analyzing}
                className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-600 px-6 py-4 text-sm font-bold text-white shadow-xl shadow-cyan-500/20 transition hover:scale-[1.01] hover:from-cyan-400 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {analyzing
                  ? "Analyzing real market signals..."
                  : "Analyze Market Signals"}
              </button>

              <p className="mt-3 text-xs leading-relaxed text-gray-500">
                Discovery uses your discovery allowance. Deep scan credits are
                only used after you confirm on the scan page.
              </p>
            </div>
          </div>

          {message && (
            <div className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
              {message}
            </div>
          )}
        </section>

        {discoveries.length === 0 ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-[#0B1020] p-10 text-center">
            <h2 className="text-2xl font-bold">No discoveries yet</h2>
            <p className="mt-3 text-gray-400">
              Run your first market discovery analysis to detect monetizable
              problems and affected niches.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Discovery history</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Review previous analyses and compare market behavior.
                  </p>
                </div>

                <p className="text-sm text-gray-500">
                  {discoveries.length} run
                  {discoveries.length === 1 ? "" : "s"}
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
                <div className="mt-8 grid gap-5 md:grid-cols-4">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Problems detected</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedProblems.length}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Sources analyzed</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedDiscovery.total_sources_analyzed}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Plan limit</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedDiscovery.sources_limit}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Top opportunity</p>
                    <h2 className="mt-3 text-xl font-bold">
                      {bestProblem?.problem_title || "Unknown"}
                    </h2>
                  </div>
                </div>

                <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-7">
                  <h2 className="text-2xl font-bold">
                    Market Discovery Summary
                  </h2>

                  <p className="mt-4 max-w-4xl leading-relaxed text-gray-400">
                    {selectedDiscovery.summary ||
                      "SaaSScout detected monetizable problems from external market signals."}
                  </p>
                </section>

                <section className="mt-8 grid gap-6">
                  {selectedProblems.map((problem, index) => {
                    const niches = splitByPipe(problem.affected_niches);
                    const solutions = splitByPipe(problem.suggested_solutions);
                    const overallScore = getOverallScore(problem);

                    const intelligence = getProblemIntelligence(
                      problem.problem_title
                    );
                    const intelligenceScore = Number(
                      intelligence?.intelligence_score || 0
                    );

                    const founderMatch = getFounderMatch(problem.id);
                    const founderFitScore = Number(
                      founderMatch?.founder_fit_score || 0
                    );

                    return (
                      <div
                        key={problem.id}
                        className="rounded-3xl border border-white/10 bg-[#0B1020] p-7 shadow-2xl"
                      >
                        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                          <div className="flex-1">
                            <p className="text-sm text-cyan-400">
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

                          <div className="grid w-full gap-4 md:grid-cols-2 xl:max-w-xl">
                            <div className="rounded-3xl border border-violet-500/30 bg-violet-500/10 p-5">
                              <p className="text-xs uppercase tracking-widest text-violet-200">
                                SaaSScout Intelligence
                              </p>

                              <h4 className="mt-3 text-4xl font-bold text-white">
                                {intelligenceScore > 0
                                  ? intelligenceScore.toFixed(1)
                                  : "New"}
                              </h4>

                              <p className="mt-2 text-sm text-violet-100/80">
                                {intelligenceScore > 0
                                  ? getIntelligenceLabel(intelligenceScore)
                                  : "Not enough behavior data yet"}
                              </p>

                              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-300">
                                <div className="rounded-xl bg-black/20 p-3">
                                  <p className="text-gray-500">Prepared</p>
                                  <p className="mt-1 text-lg font-bold text-white">
                                    {intelligence?.prepared_count || 0}
                                  </p>
                                </div>

                                <div className="rounded-xl bg-black/20 p-3">
                                  <p className="text-gray-500">Converted</p>
                                  <p className="mt-1 text-lg font-bold text-white">
                                    {intelligence?.converted_count || 0}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-3xl border border-green-500/30 bg-green-500/10 p-5">
                              <p className="text-xs uppercase tracking-widest text-green-200">
                                Founder Fit
                              </p>

                              <h4 className="mt-3 text-4xl font-bold text-white">
                                {founderFitScore > 0
                                  ? founderFitScore.toFixed(1)
                                  : "—"}
                              </h4>

                              <p className="mt-2 text-sm text-green-100/80">
                                {getFounderFitLabel(founderFitScore)}
                              </p>

                              {founderMatch && (
                                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-300">
                                  <div className="rounded-xl bg-black/20 p-3">
                                    <p className="text-gray-500">Skills</p>
                                    <p className="mt-1 text-lg font-bold text-white">
                                      {founderMatch.skill_match}
                                    </p>
                                  </div>

                                  <div className="rounded-xl bg-black/20 p-3">
                                    <p className="text-gray-500">Time</p>
                                    <p className="mt-1 text-lg font-bold text-white">
                                      {founderMatch.time_match}
                                    </p>
                                  </div>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  handleCalculateFounderFit(problem)
                                }
                                disabled={matchingProblemId === problem.id}
                                className="mt-4 flex w-full items-center justify-center rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-green-600/20 transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
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

                        <div className="mt-6 flex flex-wrap gap-3">
                          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                            Evidence score: {overallScore}/10
                          </span>

                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-300">
                            Build difficulty:{" "}
                            {problem.build_difficulty || "Medium"}
                          </span>

                          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                            Ranked by evidence + behavior + founder fit
                          </span>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                          {[
                            { label: "Pain", value: problem.pain_score },
                            { label: "Revenue", value: problem.revenue_score },
                            { label: "Urgency", value: problem.urgency_score },
                          ].map((score) => (
                            <div key={score.label}>
                              <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                                <span>{score.label}</span>
                                <span>{score.value || 0}/10</span>
                              </div>

                              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                  className="h-full rounded-full bg-cyan-500"
                                  style={{ width: getScoreWidth(score.value) }}
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
                                : ["No affected niches detected."]
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
                              SaaS Solution Angles
                            </h4>

                            <div className="mt-4 space-y-3">
                              {(solutions.length > 0
                                ? solutions
                                : ["No solution angle available."]
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
                            <h4 className="font-semibold">Source Evidence</h4>

                            <p className="mt-4 text-sm leading-relaxed text-gray-300">
                              {problem.source_evidence ||
                                "No source evidence available."}
                            </p>

                            <div className="mt-5 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                              <p className="text-xs leading-relaxed text-violet-200/80">
                                This prepares a deep scan with this problem and
                                evidence. Credits are only used when you confirm
                                on the scan page.
                              </p>

                              <button
                                type="button"
                                onClick={() =>
                                  handlePrepareDeepScan({
                                    problem,
                                    niches,
                                  })
                                }
                                className="mt-4 flex w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500"
                              >
                                Prepare Deep Scan
                              </button>
                            </div>
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