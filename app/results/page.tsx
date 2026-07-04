"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";
import { Button, CardSkeleton, EmptyState, LoadingState } from "../../components/ui";

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

type ScanSource = {
  id: string;
  scan_id: string;
  source_type: string;
  source_name: string | null;
  title: string | null;
  url: string | null;
  snippet: string | null;
  source_score: number | null;
};

function splitByPipe(value: string | null) {
  return String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getScoreTone(score: number) {
  if (score >= 80) {
    return {
      ring: "border-cyan-300/40 bg-cyan-300/15 text-cyan-100",
      bar: "from-cyan-300 via-violet-300 to-fuchsia-300",
      label: "Validated",
    };
  }

  if (score >= 65) {
    return {
      ring: "border-violet-300/40 bg-violet-400/15 text-violet-100",
      bar: "from-violet-300 via-cyan-300 to-blue-300",
      label: "Promising",
    };
  }

  return {
    ring: "border-white/15 bg-white/[0.06] text-gray-100",
    bar: "from-gray-300 via-violet-300 to-cyan-300",
    label: "Emerging",
  };
}

function normalizeScore(score: number) {
  return Math.max(0, Math.min(100, Number(score) || 0));
}

function InfoBadge({
  label,
  value,
  tone = "violet",
}: {
  label: string;
  value: string | number;
  tone?: "violet" | "cyan" | "slate" | "amber";
}) {
  const toneClass = {
    violet: "border-violet-400/30 bg-violet-400/10 text-violet-100",
    cyan: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
    slate: "border-white/10 bg-white/[0.05] text-gray-200",
    amber: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${toneClass}`}
    >
      <span className="text-[10px] uppercase tracking-[0.22em] opacity-70">
        {label}
      </span>
      <span>{value}</span>
    </span>
  );
}

function IntelligencePanel({
  eyebrow,
  title,
  children,
  accent = "violet",
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  accent?: "violet" | "cyan";
}) {
  const accentClass =
    accent === "cyan"
      ? "from-cyan-300/25 to-cyan-300/0 text-cyan-200"
      : "from-violet-300/25 to-violet-300/0 text-violet-200";

  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.045] p-5 transition hover:border-white/20 hover:bg-white/[0.065]">
      <div className={`mb-4 h-1 w-16 rounded-full bg-gradient-to-r ${accentClass}`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
        {eyebrow}
      </p>
      <h4 className="mt-2 text-base font-semibold text-white">{title}</h4>
      <div className="mt-3 text-sm leading-relaxed text-gray-300">{children}</div>
    </div>
  );
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
  const [scanSources, setScanSources] = useState<ScanSource[]>([]);
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

      let sourcesData: ScanSource[] = [];

      if (scanIds.length > 0) {
        const { data, error } = await supabase
          .from("scan_sources")
          .select("*")
          .in("scan_id", scanIds);

        if (error) {
          console.error(error);
        } else {
          sourcesData = data || [];
        }
      }

      setScans(scansData || []);
      setOpportunities(opportunitiesData || []);
      setSavedIdeas(savedData || []);
      setEvidenceAnalyses(analysisData);
      setScanSources(sourcesData);
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

  function getSourcesForScan(scanId: string) {
    return scanSources.filter((source) => source.scan_id === scanId);
  }

  function getSourceTypesForScan(scanId: string) {
    const sources = getSourcesForScan(scanId);

    return Array.from(
      new Set(
        sources.map((source) => source.source_name || source.source_type)
      )
    );
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
      <LoadingState title="Loading SaaSScout" description="Checking access before opening scan results." />
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
            <div className="grid gap-5"><CardSkeleton rows={4} /><CardSkeleton rows={4} /></div>
          ) : scans.length === 0 ? (
            <EmptyState
              icon="⌁"
              title="No scans yet"
              description="Create your first market scan to start discovering evidence-backed opportunities."
              primaryAction={<Button href="/scan">New Market Scan</Button>}
            />
          ) : (
            <div className="space-y-10">
              {scans.map((scan, index) => {
                const scanOpportunities = getOpportunitiesForScan(scan.id);
                const evidenceAnalysis = getEvidenceAnalysisForScan(scan.id);
                const sources = getSourcesForScan(scan.id);
                const sourceTypes = getSourceTypesForScan(scan.id);
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

                    {sources.length > 0 && (
  <div className="mt-6 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <p className="text-sm uppercase tracking-widest text-cyan-300">
          External Sources
        </p>

        <h3 className="mt-3 text-2xl font-bold">
          {sources.length} sources collected
        </h3>

        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-300">
          SaaSScout used external market signals to support this scan.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sourceTypes.map((type) => (
          <span
            key={type}
            className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200"
          >
            {type}
          </span>
        ))}
      </div>
    </div>

    <div className="mt-5 grid gap-4 md:grid-cols-3">
      {sources.slice(0, 3).map((source) => (
        <div
          key={source.id}
          className="rounded-2xl border border-white/10 bg-black/20 p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-widest text-cyan-300">
              {source.source_name || source.source_type}
            </p>

            <p className="text-xs text-gray-500">
              Score {source.source_score || "-"}
            </p>
          </div>

          <h4 className="mt-3 font-semibold text-white">
            {source.title || "Untitled source"}
          </h4>

          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            {source.snippet || "No snippet available."}
          </p>

          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm font-medium text-cyan-300 hover:text-cyan-200"
            >
              Open source
            </a>
          )}
        </div>
      ))}
    </div>
  </div>
)}

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

                          const scoreValue = normalizeScore(opportunity.score);
                          const scoreTone = getScoreTone(scoreValue);

                          return (
                            <article
                              key={opportunity.id}
                              className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] shadow-2xl shadow-violet-950/30 transition hover:border-cyan-300/30 hover:shadow-cyan-950/30"
                            >
                              <div className="border-b border-white/10 p-6 md:p-8">
                                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                                  <div className="max-w-4xl">
                                    <div className="flex flex-wrap gap-2.5">
                                      <InfoBadge
                                        label="Score"
                                        value={scoreTone.label}
                                        tone="cyan"
                                      />
                                      {evidenceAnalysis?.confidence_score && (
                                        <InfoBadge
                                          label="Confidence"
                                          value={evidenceAnalysis.confidence_score}
                                          tone="violet"
                                        />
                                      )}
                                      <InfoBadge
                                        label="Difficulty"
                                        value={opportunity.difficulty}
                                        tone="amber"
                                      />
                                      {(scan.market || evidenceAnalysis?.inferred_market) && (
                                        <InfoBadge
                                          label="Market"
                                          value={
                                            scan.market ||
                                            evidenceAnalysis?.inferred_market ||
                                            "Market"
                                          }
                                          tone="slate"
                                        />
                                      )}
                                    </div>

                                    <p className="mt-6 text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">
                                      Validated opportunity intelligence
                                    </p>

                                    <h3 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
                                      {opportunity.title}
                                    </h3>
                                  </div>

                                  <div
                                    className={`shrink-0 rounded-3xl border px-6 py-5 text-center ${scoreTone.ring}`}
                                  >
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-75">
                                      Opportunity Score
                                    </p>
                                    <div className="mt-3 flex items-end justify-center gap-1">
                                      <span className="text-5xl font-black leading-none">
                                        {scoreValue}
                                      </span>
                                      <span className="pb-1 text-sm opacity-70">/100</span>
                                    </div>
                                    <div className="mt-4 h-2 w-44 overflow-hidden rounded-full bg-black/30">
                                      <div
                                        className={`h-full rounded-full bg-gradient-to-r ${scoreTone.bar}`}
                                        style={{ width: `${scoreValue}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="p-6 md:p-8">
                                <section className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.07] p-6">
                                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-200">
                                    Insight summary
                                  </p>
                                  <h4 className="mt-3 text-xl font-semibold text-white">
                                    What problem exists and why it matters
                                  </h4>
                                  <p className="mt-4 max-w-5xl text-base leading-8 text-gray-200">
                                    {opportunity.pain}
                                  </p>
                                </section>

                                <section className="mt-6 grid gap-4 lg:grid-cols-12">
                                  <div className="lg:col-span-5">
                                    <IntelligencePanel
                                      eyebrow="Primary buyer"
                                      title="Target customer"
                                      accent="cyan"
                                    >
                                      {opportunity.customer}
                                    </IntelligencePanel>
                                  </div>
                                  <div className="lg:col-span-7">
                                    <IntelligencePanel
                                      eyebrow="Initial product wedge"
                                      title="Suggested MVP"
                                    >
                                      {opportunity.mvp}
                                    </IntelligencePanel>
                                  </div>
                                  <div className="lg:col-span-7">
                                    <IntelligencePanel
                                      eyebrow="Monetization signal"
                                      title="Pricing direction"
                                      accent="cyan"
                                    >
                                      {opportunity.pricing}
                                    </IntelligencePanel>
                                  </div>
                                  <div className="lg:col-span-5">
                                    <IntelligencePanel
                                      eyebrow="Execution load"
                                      title="Build difficulty"
                                    >
                                      {opportunity.difficulty}
                                    </IntelligencePanel>
                                  </div>
                                </section>

                                {sources.length > 0 && (
                                  <section className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-6">
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                      <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-violet-200">
                                          Evidence used in this scan
                                        </p>
                                        <h4 className="mt-2 text-xl font-semibold text-white">
                                          {sources.length} collected source
                                          {sources.length === 1 ? "" : "s"} supporting the opportunity context
                                        </h4>
                                      </div>
                                      <Link
                                        href={`/sources?scanId=${scan.id}`}
                                        className="rounded-full border border-cyan-300/30 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10"
                                      >
                                        Review evidence
                                      </Link>
                                    </div>
                                  </section>
                                )}

                                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                  <Link
                                    href={`/opportunity/${opportunity.id}`}
                                    className="rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-3 text-center font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:from-violet-500 hover:to-cyan-400"
                                  >
                                    View Intelligence Report
                                  </Link>

                                  <Link
                                    href={`/sources?scanId=${scan.id}`}
                                    className="rounded-2xl border border-cyan-400/25 px-5 py-3 text-center font-semibold text-cyan-100 transition hover:bg-cyan-400/10"
                                  >
                                    External Sources
                                  </Link>

                                  <button
                                    onClick={() => handleSaveIdea(opportunity.id)}
                                    disabled={saving || saved}
                                    className="rounded-2xl border border-white/10 px-5 py-3 font-semibold text-gray-200 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {saving
                                      ? "Saving..."
                                      : saved
                                      ? "Saved"
                                      : "Save Idea"}
                                  </button>
                                </div>
                              </div>
                            </article>
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