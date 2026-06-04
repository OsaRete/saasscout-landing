"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

type Scan = {
  id: string;
  created_at: string;
  user_id: string;
  market: string | null;
  audience: string | null;
  region: string | null;
  status: string;
};

type Opportunity = {
  id: string;
  created_at: string;
  user_id: string;
  scan_id: string;
  title: string;
  score: number;
  pain: string;
  customer: string;
  mvp: string;
  pricing: string;
  difficulty: string;
};

type SavedIdea = {
  id: string;
  user_id: string;
  opportunity_id: string;
};

type EvidenceAnalysis = {
  id: string;
  scan_id: string;
  inferred_market: string | null;
  audience_summary: string | null;
  evidence_summary: string | null;
  pain_points: string | null;
  repeated_patterns: string | null;
  workflow_problems: string | null;
  willingness_to_pay_signals: string | null;
  opportunity_angles: string | null;
  confidence_score: number | null;
};

function splitByPipe(value: string | null) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ResultsPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [scans, setScans] = useState<Scan[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [evidenceAnalyses, setEvidenceAnalyses] = useState<EvidenceAnalysis[]>(
    []
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadResults() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setLoadingAuth(false);

      const { data: scansData, error: scansError } = await supabase
        .from("scan")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (scansError) {
        console.error(scansError);
        setLoadingData(false);
        return;
      }

      const scanIds = (scansData || []).map((scan) => scan.id);

      const { data: opportunitiesData, error: opportunitiesError } =
        await supabase
          .from("opportunities")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

      if (opportunitiesError) {
        console.error(opportunitiesError);
      }

      const { data: savedData, error: savedError } = await supabase
        .from("saved_ideas")
        .select("*")
        .eq("user_id", user.id);

      if (savedError) {
        console.error(savedError);
      }

      let analysisData: EvidenceAnalysis[] = [];

      if (scanIds.length > 0) {
        const { data, error } = await supabase
          .from("evidence_analysis")
          .select("*")
          .in("scan_id", scanIds);

        if (error) {
          console.error(error);
        } else {
          analysisData = data || [];
        }
      }

      setScans(scansData || []);
      setOpportunities(opportunitiesData || []);
      setSavedIdeas(savedData || []);
      setEvidenceAnalyses(analysisData);
      setLoadingData(false);
    }

    loadResults();
  }, [router]);

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getOpportunitiesForScan(scanId: string) {
    return opportunities.filter((opportunity) => opportunity.scan_id === scanId);
  }

  function getEvidenceAnalysisForScan(scanId: string) {
    return evidenceAnalyses.find((analysis) => analysis.scan_id === scanId);
  }

  function isIdeaSaved(opportunityId: string) {
    return savedIdeas.some((idea) => idea.opportunity_id === opportunityId);
  }

  async function handleSaveIdea(opportunityId: string) {
    if (!userId || isIdeaSaved(opportunityId)) return;

    setSavingId(opportunityId);

    const { data, error } = await supabase
      .from("saved_ideas")
      .insert([
        {
          user_id: userId,
          opportunity_id: opportunityId,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(error);
      setSavingId(null);
      return;
    }

    if (data) {
      setSavedIdeas((current) => [...current, data]);
    }

    setSavingId(null);
  }

  if (loadingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-gray-400">Loading SaaSScout...</p>
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
              href="/scan"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
            >
              New Scan
            </Link>

            <Link
              href="/dashboard"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <section className="mt-14 border-b border-white/10 pb-10">
          <p className="text-sm uppercase tracking-widest text-violet-400">
            Scan Results
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Your SaaS opportunities.
          </h1>

          <p className="mt-5 max-w-2xl text-lg text-gray-400">
            Review the evidence insights, market signals, and generated SaaS
            opportunities from your scans.
          </p>
        </section>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Total scans</p>
            <h2 className="mt-3 text-4xl font-bold">{scans.length}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Opportunities</p>
            <h2 className="mt-3 text-4xl font-bold">{opportunities.length}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Saved ideas</p>
            <h2 className="mt-3 text-4xl font-bold">{savedIdeas.length}</h2>
          </div>
        </div>

        <section className="mt-10">
          {loadingData ? (
            <p className="text-gray-400">Loading results...</p>
          ) : scans.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-10 text-center">
              <h2 className="text-2xl font-bold">No scans yet</h2>
              <p className="mt-3 text-gray-400">
                Create your first market scan to start discovering opportunities.
              </p>

              <Link
                href="/scan"
                className="mt-6 inline-block rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white hover:bg-violet-500"
              >
                New Market Scan
              </Link>
            </div>
          ) : (
            <div className="space-y-10">
              {scans.map((scan, index) => {
                const scanOpportunities = getOpportunitiesForScan(scan.id);
                const evidenceAnalysis = getEvidenceAnalysisForScan(scan.id);

                const painPoints = splitByPipe(evidenceAnalysis?.pain_points || null);
                const repeatedPatterns = splitByPipe(
                  evidenceAnalysis?.repeated_patterns || null
                );
                const opportunityAngles = splitByPipe(
                  evidenceAnalysis?.opportunity_angles || null
                );

                return (
                  <div
                    key={scan.id}
                    className="rounded-3xl border border-white/10 bg-[#0B1020] p-7 shadow-2xl"
                  >
                    <div className="flex flex-col gap-6 border-b border-white/10 pb-6 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm text-violet-400">
                          Scan #{index + 1}
                        </p>

                        <h2 className="mt-3 text-3xl font-bold">
                          {scan.market || evidenceAnalysis?.inferred_market || "Untitled scan"}
                        </h2>

                        <p className="mt-4 max-w-3xl leading-relaxed text-gray-400">
                          Created on {formatDate(scan.created_at)}
                        </p>
                      </div>

                      <div className="w-fit rounded-2xl border border-violet-500/30 bg-violet-500/10 px-6 py-4 text-center">
                        <p className="text-xl font-bold">
                          {scanOpportunities.length}
                        </p>
                        <p className="text-sm text-gray-400">opportunities</p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl bg-white/[0.04] p-5">
                        <p className="text-sm text-gray-500">Audience</p>
                        <p className="mt-2 text-sm text-gray-200">
                          {scan.audience ||
                            evidenceAnalysis?.audience_summary ||
                            "Not specified"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] p-5">
                        <p className="text-sm text-gray-500">Region</p>
                        <p className="mt-2 text-sm text-gray-200">
                          {scan.region || "Global"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] p-5">
                        <p className="text-sm text-gray-500">Status</p>
                        <p className="mt-2 text-sm capitalize text-gray-200">
                          {scan.status}
                        </p>
                      </div>
                    </div>

                    {evidenceAnalysis && (
                      <div className="mt-8 rounded-3xl border border-violet-500/20 bg-violet-500/10 p-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-sm uppercase tracking-widest text-violet-300">
                              Evidence Intelligence
                            </p>

                            <h3 className="mt-3 text-2xl font-bold">
                              Detected Market:{" "}
                              {evidenceAnalysis.inferred_market || "Unknown"}
                            </h3>

                            <p className="mt-3 max-w-4xl text-sm leading-relaxed text-gray-300">
                              {evidenceAnalysis.evidence_summary ||
                                "No evidence summary available."}
                            </p>
                          </div>

                          <div className="w-fit rounded-2xl border border-violet-400/30 bg-black/20 px-5 py-4 text-center">
                            <p className="text-2xl font-bold text-violet-100">
                              {evidenceAnalysis.confidence_score || 7}
                            </p>
                            <p className="text-xs text-gray-400">confidence</p>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-5 lg:grid-cols-3">
                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold text-white">
                              Top Pain Points
                            </h4>

                            <div className="mt-4 space-y-3">
                              {(painPoints.length > 0
                                ? painPoints
                                : ["No pain points found."]
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
                            <h4 className="font-semibold text-white">
                              Repeated Patterns
                            </h4>

                            <div className="mt-4 space-y-3">
                              {(repeatedPatterns.length > 0
                                ? repeatedPatterns
                                : ["No repeated patterns found."]
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
                            <h4 className="font-semibold text-white">
                              Opportunity Angles
                            </h4>

                            <div className="mt-4 space-y-3">
                              {(opportunityAngles.length > 0
                                ? opportunityAngles
                                : ["No opportunity angles found."]
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
                        </div>

                        {evidenceAnalysis.willingness_to_pay_signals && (
                          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold text-white">
                              Willingness To Pay Signals
                            </h4>

                            <p className="mt-3 text-sm leading-relaxed text-gray-300">
                              {evidenceAnalysis.willingness_to_pay_signals}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-8 space-y-5">
                      {scanOpportunities.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                          <p className="text-gray-400">
                            No opportunities found for this scan yet.
                          </p>
                        </div>
                      ) : (
                        scanOpportunities.map((opportunity) => {
                          const saved = isIdeaSaved(opportunity.id);
                          const saving = savingId === opportunity.id;

                          return (
                            <div
                              key={opportunity.id}
                              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                            >
                              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <h3 className="text-2xl font-bold">
                                    {opportunity.title}
                                  </h3>

                                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-400">
                                    {opportunity.pain}
                                  </p>
                                </div>

                                <div className="w-fit rounded-2xl border border-violet-500/30 bg-violet-500/10 px-5 py-3 text-center">
                                  <p className="text-2xl font-bold">
                                    {opportunity.score}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    score
                                  </p>
                                </div>
                              </div>

                              <div className="mt-6 grid gap-4 md:grid-cols-4">
                                <div className="rounded-xl bg-white/[0.04] p-4">
                                  <p className="text-xs text-gray-500">
                                    Customer
                                  </p>
                                  <p className="mt-2 text-sm text-gray-200">
                                    {opportunity.customer}
                                  </p>
                                </div>

                                <div className="rounded-xl bg-white/[0.04] p-4">
                                  <p className="text-xs text-gray-500">MVP</p>
                                  <p className="mt-2 text-sm text-gray-200">
                                    {opportunity.mvp}
                                  </p>
                                </div>

                                <div className="rounded-xl bg-white/[0.04] p-4">
                                  <p className="text-xs text-gray-500">
                                    Pricing
                                  </p>
                                  <p className="mt-2 text-sm text-gray-200">
                                    {opportunity.pricing}
                                  </p>
                                </div>

                                <div className="rounded-xl bg-white/[0.04] p-4">
                                  <p className="text-xs text-gray-500">
                                    Difficulty
                                  </p>
                                  <p className="mt-2 text-sm text-gray-200">
                                    {opportunity.difficulty}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                <Link
                                  href={`/opportunity/${opportunity.id}`}
                                  className="rounded-xl bg-violet-600 px-5 py-3 text-center font-semibold text-white hover:bg-violet-500"
                                >
                                  View Details
                                </Link>

                                <button
                                  onClick={() => handleSaveIdea(opportunity.id)}
                                  disabled={saving || saved}
                                  className="rounded-xl border border-white/10 px-5 py-3 font-semibold text-gray-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {saving
                                    ? "Saving..."
                                    : saved
                                    ? "Saved"
                                    : "Save Idea"}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}