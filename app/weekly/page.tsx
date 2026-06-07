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
};

type GeneratedNiche = {
  niche: string;
  category: string;
  trend_score: number;
  pain_intensity: number;
  source_volume: number;
  repeated_problems: string;
  opportunity_angle: string;
  movement: string;
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

export default function WeeklyPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [niches, setNiches] = useState<WeeklyNiche[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadWeeklyData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setLoadingAuth(false);

      const { data: reportsData, error: reportsError } = await supabase
        .from("weekly_reports")
        .select("*")
        .eq("user_id", user.id)
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

  async function handleGenerateWeeklyReport() {
    if (!userId || generating) return;

    setGenerating(true);
    setMessage("");

    try {
      const response = await fetch("/api/generate-weekly-report", {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Could not generate weekly report.");
        setGenerating(false);
        return;
      }

      const report = result.report;

      const { data: reportData, error: reportError } = await supabase
        .from("weekly_reports")
        .insert([
          {
            user_id: userId,
            week_start: report.week_start,
            week_end: report.week_end,
            summary: report.summary,
            strongest_trend: report.strongest_trend,
            total_sources_analyzed: report.total_sources_analyzed,
            average_trend_score: report.average_trend_score,
            average_pain_intensity: report.average_pain_intensity,
            status: "completed",
          },
        ])
        .select()
        .single();

      if (reportError || !reportData) {
        console.error(reportError);
        setMessage("Could not save weekly report.");
        setGenerating(false);
        return;
      }

      const nichesToInsert = (report.niches as GeneratedNiche[]).map((item) => ({
        weekly_report_id: reportData.id,
        user_id: userId,
        niche: item.niche,
        category: item.category,
        trend_score: item.trend_score,
        pain_intensity: item.pain_intensity,
        source_volume: item.source_volume,
        repeated_problems: item.repeated_problems,
        opportunity_angle: item.opportunity_angle,
        movement: item.movement,
      }));

      const { data: insertedNiches, error: nichesError } = await supabase
        .from("weekly_niches")
        .insert(nichesToInsert)
        .select();

      if (nichesError) {
        console.error(nichesError);
        setMessage("Report created, but niches could not be saved.");
        setGenerating(false);
        return;
      }

      setReports((current) => [reportData, ...current]);
      setNiches((current) => [...(insertedNiches || []), ...current]);
      setSelectedReportId(reportData.id);
      setMessage("Weekly report generated successfully.");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong generating the weekly report.");
    }

    setGenerating(false);
  }

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

        <section className="mt-14 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] to-violet-600/[0.08] p-8 shadow-2xl md:p-12">
          <p className="text-sm uppercase tracking-widest text-violet-300">
            Weekly Market Intelligence
          </p>

          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                Trending SaaS opportunities this week.
              </h1>

              <p className="mt-5 max-w-3xl text-gray-400">
                Track trending niches, repeated market problems, pain intensity,
                and opportunity angles across multiple markets.
              </p>
            </div>

            <button
              onClick={handleGenerateWeeklyReport}
              disabled={generating}
              className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "Generating..." : "Generate Weekly Update"}
            </button>
          </div>

          {message && (
            <div className="mt-6 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
              {message}
            </div>
          )}
        </section>

        {reports.length === 0 ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-[#0B1020] p-10 text-center">
            <h2 className="text-2xl font-bold">No weekly updates yet</h2>
            <p className="mt-3 text-gray-400">
              Generate your first weekly market intelligence report.
            </p>
          </section>
        ) : (
          <>
            <div className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-5">
              <p className="text-sm font-semibold text-gray-300">
                Weekly history
              </p>

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

                <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-7">
                  <h2 className="text-2xl font-bold">Weekly Summary</h2>
                  <p className="mt-4 max-w-4xl leading-relaxed text-gray-400">
                    {selectedReport.summary}
                  </p>
                </section>

                <section className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-7">
                  <h2 className="text-2xl font-bold">Trend Score Overview</h2>

                  <div className="mt-6 space-y-4">
                    {selectedNiches.map((item) => (
                      <div key={item.id}>
                        <div className="mb-2 flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-300">
                            {item.niche}
                          </span>
                          <span className="text-violet-300">
                            {item.trend_score || 0}/10
                          </span>
                        </div>

                        <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{
                              width: `${Math.min(
                                100,
                                Number(item.trend_score || 0) * 10
                              )}%`,
                            }}
                          />
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
                              {item.opportunity_angle}
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
                            <h4 className="font-semibold">
                              Suggested Action
                            </h4>

                            <p className="mt-4 text-sm leading-relaxed text-gray-300">
                              Use this niche as a starting point for a focused
                              SaaSScout scan. Validate the repeated problems and
                              look for willingness-to-pay signals.
                            </p>

                            <Link
                              href={`/scan`}
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