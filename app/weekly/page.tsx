"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

type WeeklyReport = {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  summary: string | null;
  strongest_trend: string | null;
  total_sources_analyzed: number | null;
  average_trend_score: number | null;
  average_pain_intensity: number | null;
  status: string;
  is_global: boolean | null;
  created_at: string;
};

type WeeklyNiche = {
  id: string;
  weekly_report_id: string;
  user_id: string;
  niche: string;
  category: string | null;
  trend_score: number | null;
  pain_intensity: number | null;
  source_volume: number | null;
  repeated_problems: string | null;
  opportunity_angle: string | null;
  movement: string | null;
  is_global: boolean | null;
  created_at: string;
};

function splitProblems(value: string | null) {
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

function sourceWidth(sourceVolume: number | null, maxSourceVolume: number) {
  if (!maxSourceVolume) return "0%";

  return `${Math.min(
    100,
    Math.max(0, (Number(sourceVolume || 0) / maxSourceVolume) * 100)
  )}%`;
}

export default function WeeklyPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [niches, setNiches] = useState<WeeklyNiche[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  useEffect(() => {
    async function loadWeeklyData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setLoadingAuth(false);

      const { data: reportsData, error: reportsError } = await supabase
        .from("weekly_reports")
        .select("*")
        .or(`user_id.eq.${user.id},is_global.eq.true`)
        .order("week_start", { ascending: false });

      if (reportsError) {
        console.error(reportsError);
        setLoadingData(false);
        return;
      }

      const reportIds = (reportsData || []).map((report) => report.id);

      let nichesData: WeeklyNiche[] = [];

      if (reportIds.length > 0) {
        const { data, error } = await supabase
          .from("weekly_niches")
          .select("*")
          .in("weekly_report_id", reportIds);

        if (error) {
          console.error(error);
        } else {
          nichesData = data || [];
        }
      }

      setReports(reportsData || []);
      setNiches(nichesData);
      setSelectedReportId(reportsData?.[0]?.id || null);
      setLoadingData(false);
    }

    loadWeeklyData();
  }, [router]);

  const selectedReport = useMemo(() => {
    return reports.find((report) => report.id === selectedReportId) || null;
  }, [reports, selectedReportId]);

  const selectedNiches = useMemo(() => {
    if (!selectedReport) return [];

    return niches
      .filter((item) => item.weekly_report_id === selectedReport.id)
      .sort((a, b) => Number(b.trend_score || 0) - Number(a.trend_score || 0));
  }, [niches, selectedReport]);

  const topNiche = selectedNiches[0] || null;
  const topThreeNiches = selectedNiches.slice(0, 3);
  const maxSourceVolume = Math.max(
    ...selectedNiches.map((item) => Number(item.source_volume || 0)),
    1
  );

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
                Weekly Market Intelligence
              </p>

              <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
                Trending SaaS opportunities this week.
              </h1>

              <p className="mt-5 max-w-3xl text-gray-400">
                Track trending niches, repeated market problems, pain intensity,
                source volume, and opportunity angles across multiple markets.
              </p>
            </div>

            <div className="rounded-2xl border border-violet-500/30 bg-black/20 px-5 py-4">
              <p className="text-xs uppercase tracking-widest text-violet-300">
                Auto-updated
              </p>
              <p className="mt-1 text-sm text-gray-300">
                Generated weekly from external market signals.
              </p>
            </div>
          </div>
        </section>

        {reports.length === 0 ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-[#0B1020] p-10 text-center">
            <h2 className="text-2xl font-bold">No weekly updates yet</h2>
            <p className="mt-3 text-gray-400">
              The first automatic weekly market intelligence report has not been
              generated yet.
            </p>
          </section>
        ) : (
          <>
            <div className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-300">
                    Weekly history
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Compare recent weeks and track market movement over time.
                  </p>
                </div>

                <p className="text-sm text-gray-500">
                  {reports.length} report{reports.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {reports.map((report) => (
                  <button
                    key={report.id}
                    onClick={() => setSelectedReportId(report.id)}
                    className={`rounded-xl border px-4 py-2 text-sm transition ${
                      selectedReportId === report.id
                        ? "border-violet-500/40 bg-violet-500/20 text-white"
                        : "border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.06]"
                    }`}
                  >
                    {formatDate(report.week_start)} -{" "}
                    {formatDate(report.week_end)}
                    {report.is_global && (
                      <span className="ml-2 text-xs text-violet-300">
                        Global
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {selectedReport && (
              <>
                <div className="mt-8 grid gap-5 md:grid-cols-4">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Tracked niches</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedNiches.length}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Sources analyzed</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedReport.total_sources_analyzed || 0}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Avg trend score</p>
                    <h2 className="mt-3 text-4xl font-bold">
                      {selectedReport.average_trend_score || 0}
                    </h2>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm text-gray-400">Strongest trend</p>
                    <h2 className="mt-3 text-xl font-bold">
                      {selectedReport.strongest_trend || "Unknown"}
                    </h2>
                  </div>
                </div>

                {topNiche && (
                  <section className="mt-8 rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 p-7 shadow-2xl">
                    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-widest text-violet-300">
                          Top Opportunity This Week
                        </p>

                        <h2 className="mt-3 text-3xl font-bold">
                          {topNiche.niche}
                        </h2>

                        <p className="mt-4 max-w-3xl leading-relaxed text-gray-300">
                          {topNiche.opportunity_angle ||
                            "No opportunity angle available."}
                        </p>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-300">
                            {topNiche.category || "Market segment"}
                          </span>

                          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-200">
                            {topNiche.movement || "Stable"}
                          </span>

                          <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                            Global intelligence
                          </span>
                        </div>
                      </div>

                      <div className="grid min-w-[260px] gap-3">
                        <div className="rounded-2xl border border-violet-500/30 bg-black/20 p-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Trend</span>
                            <span className="text-violet-200">
                              {topNiche.trend_score || 0}/10
                            </span>
                          </div>
                          <div className="mt-3 h-3 rounded-full bg-white/[0.06]">
                            <div
                              className="h-3 rounded-full bg-violet-500"
                              style={{
                                width: scoreWidth(topNiche.trend_score),
                              }}
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-red-500/30 bg-black/20 p-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Pain</span>
                            <span className="text-red-200">
                              {topNiche.pain_intensity || 0}/10
                            </span>
                          </div>
                          <div className="mt-3 h-3 rounded-full bg-white/[0.06]">
                            <div
                              className="h-3 rounded-full bg-red-500"
                              style={{
                                width: scoreWidth(topNiche.pain_intensity),
                              }}
                            />
                          </div>
                        </div>

                        <Link
                          href="/scan"
                          className="rounded-2xl bg-violet-600 px-5 py-4 text-center text-sm font-semibold text-white hover:bg-violet-500"
                        >
                          Scan this niche
                        </Link>
                      </div>
                    </div>
                  </section>
                )}

                <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-7">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Weekly Summary</h2>
                      <p className="mt-4 max-w-4xl leading-relaxed text-gray-400">
                        {selectedReport.summary ||
                          "No weekly summary available."}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm text-gray-300">
                      {formatDate(selectedReport.week_start)} -{" "}
                      {formatDate(selectedReport.week_end)}
                    </div>
                  </div>
                </section>

                <section className="mt-8 grid gap-6 lg:grid-cols-3">
                  <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7 lg:col-span-2">
                    <h2 className="text-2xl font-bold">
                      Trend vs Pain Overview
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                      Compare opportunity momentum against problem intensity.
                    </p>

                    <div className="mt-6 space-y-5">
                      {selectedNiches.map((item) => (
                        <div key={item.id}>
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-300">
                              {item.niche}
                            </span>
                            <span className="text-gray-500">
                              Trend {item.trend_score || 0} · Pain{" "}
                              {item.pain_intensity || 0}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className="h-full rounded-full bg-violet-500"
                                style={{
                                  width: scoreWidth(item.trend_score),
                                }}
                              />
                            </div>

                            <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className="h-full rounded-full bg-red-500"
                                style={{
                                  width: scoreWidth(item.pain_intensity),
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
                    <h2 className="text-2xl font-bold">Source Volume</h2>

                    <p className="mt-2 text-sm text-gray-500">
                      Simple view of where market signal density is highest.
                    </p>

                    <div className="mt-6 space-y-4">
                      {selectedNiches.slice(0, 7).map((item) => (
                        <div key={item.id}>
                          <div className="mb-2 flex justify-between text-sm">
                            <span className="max-w-[180px] truncate text-gray-300">
                              {item.niche}
                            </span>
                            <span className="text-cyan-300">
                              {item.source_volume || 0}
                            </span>
                          </div>

                          <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
                            <div
                              className="h-full rounded-full bg-cyan-500"
                              style={{
                                width: sourceWidth(
                                  item.source_volume,
                                  maxSourceVolume
                                ),
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-7">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Top 3 Rising Niches</h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Highest ranked markets based on trend, pain, and source
                        signals.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-5 md:grid-cols-3">
                    {topThreeNiches.map((item, index) => (
                      <div
                        key={item.id}
                        className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
                      >
                        <p className="text-sm text-violet-300">
                          #{index + 1}
                        </p>

                        <h3 className="mt-3 text-xl font-bold">{item.niche}</h3>

                        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-400">
                          {item.opportunity_angle ||
                            "No opportunity angle available."}
                        </p>

                        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-black/20 px-3 py-2">
                            <p className="font-bold">
                              {item.trend_score || 0}
                            </p>
                            <p className="text-xs text-gray-500">trend</p>
                          </div>

                          <div className="rounded-xl bg-black/20 px-3 py-2">
                            <p className="font-bold">
                              {item.pain_intensity || 0}
                            </p>
                            <p className="text-xs text-gray-500">pain</p>
                          </div>

                          <div className="rounded-xl bg-black/20 px-3 py-2">
                            <p className="font-bold">
                              {item.source_volume || 0}
                            </p>
                            <p className="text-xs text-gray-500">sources</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="mt-8 grid gap-6">
                  {selectedNiches.map((item, index) => {
                    const problems = splitProblems(item.repeated_problems);

                    return (
                      <div
                        key={item.id}
                        className="rounded-3xl border border-white/10 bg-[#0B1020] p-7 shadow-2xl"
                      >
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm text-violet-400">
                              Trending niche #{index + 1}
                            </p>

                            <h3 className="mt-3 text-3xl font-bold">
                              {item.niche}
                            </h3>

                            <p className="mt-4 max-w-3xl text-gray-400">
                              {item.opportunity_angle ||
                                "No opportunity angle available."}
                            </p>
                          </div>

                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 px-4 py-3">
                              <p className="text-2xl font-bold">
                                {item.trend_score || 0}
                              </p>
                              <p className="text-xs text-gray-400">trend</p>
                            </div>

                            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                              <p className="text-2xl font-bold">
                                {item.pain_intensity || 0}
                              </p>
                              <p className="text-xs text-gray-400">pain</p>
                            </div>

                            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
                              <p className="text-2xl font-bold">
                                {item.source_volume || 0}
                              </p>
                              <p className="text-xs text-gray-400">sources</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-300">
                            {item.category || "Market segment"}
                          </span>

                          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-200">
                            {item.movement || "Stable"}
                          </span>

                          {item.is_global && (
                            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                              Global intelligence
                            </span>
                          )}
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">Repeated Problems</h4>

                            <div className="mt-4 space-y-3">
                              {(problems.length > 0
                                ? problems
                                : ["No repeated problems available."]
                              ).map((problem) => (
                                <p
                                  key={problem}
                                  className="rounded-xl bg-black/20 px-4 py-3 text-sm text-gray-300"
                                >
                                  {problem}
                                </p>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                            <h4 className="font-semibold">Suggested Action</h4>

                            <p className="mt-4 text-sm leading-relaxed text-gray-300">
                              Use this niche as a starting point for a focused
                              SaaSScout scan. Validate repeated problems,
                              compare external sources, and look for
                              willingness-to-pay signals.
                            </p>

                            <Link
                              href="/scan"
                              className="mt-5 inline-block rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500"
                            >
                              Scan this niche
                            </Link>
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