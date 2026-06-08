"use client";

import { useEffect, useMemo, useState } from "react";
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
  created_at: string;
  user_id: string;
  opportunity_id: string;
};

type WeeklyReport = {
  id: string;
  week_start: string;
  week_end: string;
  summary: string | null;
  strongest_trend: string | null;
  total_sources_analyzed: number | null;
  average_trend_score: number | null;
  average_pain_intensity: number | null;
  is_global: boolean | null;
};

type WeeklyNiche = {
  id: string;
  weekly_report_id: string;
  niche: string;
  trend_score: number | null;
  pain_intensity: number | null;
  source_volume: number | null;
  movement: string | null;
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function barWidth(value: number | null) {
  return `${Math.min(100, Math.max(0, Number(value || 0) * 10))}%`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  const [scans, setScans] = useState<Scan[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [weeklyNiches, setWeeklyNiches] = useState<WeeklyNiche[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setLoadingAuth(false);

      const { data: scansData } = await supabase
        .from("scan")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const { data: opportunitiesData } = await supabase
        .from("opportunities")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const { data: savedData } = await supabase
        .from("saved_ideas")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const { data: weeklyData } = await supabase
        .from("weekly_reports")
        .select("*")
        .or(`user_id.eq.${user.id},is_global.eq.true`)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();

      let weeklyNichesData: WeeklyNiche[] = [];

      if (weeklyData?.id) {
        const { data } = await supabase
          .from("weekly_niches")
          .select("*")
          .eq("weekly_report_id", weeklyData.id)
          .order("trend_score", { ascending: false })
          .limit(5);

        weeklyNichesData = data || [];
      }

      setScans(scansData || []);
      setOpportunities(opportunitiesData || []);
      setSavedIdeas(savedData || []);
      setWeeklyReport(weeklyData || null);
      setWeeklyNiches(weeklyNichesData);
      setLoadingData(false);
    }

    loadDashboard();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const savedOpportunities = useMemo(() => {
    return savedIdeas
      .map((savedIdea) =>
        opportunities.find(
          (opportunity) => opportunity.id === savedIdea.opportunity_id
        )
      )
      .filter(Boolean) as Opportunity[];
  }, [savedIdeas, opportunities]);

  if (loadingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-gray-400">Loading SaaSScout...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-white/10 bg-[#070B18]/95 p-6 lg:block">
          <Image
            src="/brand/logo-main.png"
            alt="SaaSScout"
            width={170}
            height={48}
            className="h-10 w-auto"
          />

          <nav className="mt-10 space-y-2 text-sm text-gray-400">
            <div className="rounded-xl bg-violet-600/20 px-4 py-3 font-semibold text-white">
              Dashboard
            </div>

            <Link
              href="/scan"
              className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white"
            >
              New Scan
            </Link>

            <Link
              href="/scans"
              className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white"
            >
              Scan History
            </Link>

            <Link
              href="/results"
              className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white"
            >
              Opportunities
            </Link>

            <Link
              href="/saved"
              className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white"
            >
              Saved Ideas
            </Link>

            <div className="my-4 h-px bg-white/10" />

            <Link
              href="/weekly"
              className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white"
            >
              Weekly Intelligence
            </Link>
          </nav>
        </aside>

        <section className="flex-1 px-6 py-8 lg:px-10">
          <header className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] to-violet-600/[0.08] px-8 py-7 shadow-2xl">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-widest text-violet-300">
                  SaaSScout MVP
                </p>

                <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
                  Founder Dashboard
                </h1>

                <p className="mt-4 max-w-2xl text-gray-400">
                  Discover real market pain, analyze evidence, and turn repeated
                  complaints into actionable SaaS opportunities.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleLogout}
                  className="h-11 rounded-xl border border-white/10 px-5 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
                >
                  Logout
                </button>

                <Link
                  href="/scan"
                  className="flex h-11 items-center rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500"
                >
                  New Market Scan
                </Link>
              </div>
            </div>
          </header>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-sm text-gray-400">Total scans</p>
              <h2 className="mt-3 text-4xl font-bold">{scans.length}</h2>
              <p className="mt-2 text-sm text-green-400">Real user data</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-sm text-gray-400">Opportunities</p>
              <h2 className="mt-3 text-4xl font-bold">
                {opportunities.length}
              </h2>
              <p className="mt-2 text-sm text-violet-300">
                Generated from scans
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-sm text-gray-400">Saved ideas</p>
              <h2 className="mt-3 text-4xl font-bold">{savedIdeas.length}</h2>
              <p className="mt-2 text-sm text-cyan-300">Ready to validate</p>
            </div>
          </div>

          <section className="mt-8 rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 p-6 shadow-2xl">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-widest text-violet-300">
                  Weekly Intelligence
                </p>

                <h2 className="mt-3 text-2xl font-bold">
                  {weeklyReport?.strongest_trend
                    ? `Strongest trend: ${weeklyReport.strongest_trend}`
                    : "Market trend report"}
                </h2>

                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-400">
                  {weeklyReport?.summary ||
                    "Weekly market intelligence will appear here once the first report is generated."}
                </p>

                {weeklyReport && (
                  <p className="mt-3 text-xs text-gray-500">
                    Latest report: {formatDate(weeklyReport.week_start)} -{" "}
                    {formatDate(weeklyReport.week_end)}
                  </p>
                )}
              </div>

              <Link
                href="/weekly"
                className="w-fit rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500"
              >
                Open Weekly Intelligence
              </Link>
            </div>

            {weeklyReport && weeklyNiches.length > 0 && (
              <div className="mt-6 grid gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <p className="text-sm text-gray-400">Avg trend score</p>
                  <h3 className="mt-2 text-3xl font-bold">
                    {weeklyReport.average_trend_score || 0}
                  </h3>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{
                        width: barWidth(weeklyReport.average_trend_score),
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <p className="text-sm text-gray-400">Avg pain intensity</p>
                  <h3 className="mt-2 text-3xl font-bold">
                    {weeklyReport.average_pain_intensity || 0}
                  </h3>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full bg-red-500"
                      style={{
                        width: barWidth(weeklyReport.average_pain_intensity),
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <p className="text-sm text-gray-400">Sources analyzed</p>
                  <h3 className="mt-2 text-3xl font-bold">
                    {weeklyReport.total_sources_analyzed || 0}
                  </h3>
                  <p className="mt-4 text-sm text-cyan-300">
                    External signals analyzed this week
                  </p>
                </div>
              </div>
            )}

            {weeklyNiches.length > 0 && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Top weekly niches</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Mini trend chart based on latest weekly report.
                    </p>
                  </div>

                  <p className="text-xs text-gray-500">Trend / Pain</p>
                </div>

                <div className="space-y-4">
                  {weeklyNiches.slice(0, 5).map((item) => (
                    <div key={item.id}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-300">
                          {item.niche}
                        </span>
                        <span className="text-gray-500">
                          {item.movement || "Stable"}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: barWidth(item.trend_score) }}
                          />
                        </div>

                        <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: barWidth(item.pain_intensity) }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 shadow-2xl lg:col-span-2">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Recent scans</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Latest evidence and market analyses.
                  </p>
                </div>

                <Link
                  href="/scans"
                  className="text-sm font-medium text-violet-300 hover:text-violet-200"
                >
                  View all
                </Link>
              </div>

              {loadingData ? (
                <p className="text-gray-400">Loading scans...</p>
              ) : scans.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
                  <p className="text-gray-300">No scans yet.</p>
                  <Link
                    href="/scan"
                    className="mt-4 inline-block rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-500"
                  >
                    Create your first scan
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {scans.slice(0, 5).map((scan) => (
                    <div
                      key={scan.id}
                      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <h3 className="font-semibold">
                          {scan.market || "Evidence-based scan"}
                        </h3>
                        <p className="mt-1 text-sm text-gray-400">
                          {formatDate(scan.created_at)}
                          {scan.audience ? ` · ${scan.audience}` : ""}
                          {scan.region ? ` · ${scan.region}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="rounded-full bg-violet-500/15 px-3 py-1 text-sm capitalize text-violet-200">
                          {scan.status}
                        </span>

                        <Link
                          href="/results"
                          className="text-sm font-medium text-violet-300 hover:text-violet-200"
                        >
                          View results
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-8">
              <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 shadow-2xl">
                <h2 className="text-2xl font-bold">Quick actions</h2>

                <div className="mt-5 grid gap-3">
                  <Link
                    href="/scan"
                    className="rounded-2xl bg-violet-600 px-5 py-4 font-semibold hover:bg-violet-500"
                  >
                    New Market Scan
                  </Link>

                  <Link
                    href="/scans"
                    className="rounded-2xl border border-white/10 px-5 py-4 font-semibold text-gray-300 hover:bg-white/5"
                  >
                    View Scan History
                  </Link>

                  <Link
                    href="/results"
                    className="rounded-2xl border border-white/10 px-5 py-4 font-semibold text-gray-300 hover:bg-white/5"
                  >
                    View Opportunities
                  </Link>

                  <Link
                    href="/weekly"
                    className="rounded-2xl border border-violet-500/30 bg-violet-500/10 px-5 py-4 font-semibold text-violet-200 hover:bg-violet-500/20"
                  >
                    Weekly Intelligence
                  </Link>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Saved ideas</h2>
                  <Link
                    href="/saved"
                    className="text-sm font-medium text-violet-300 hover:text-violet-200"
                  >
                    View all
                  </Link>
                </div>

                <div className="mt-6 space-y-4">
                  {loadingData ? (
                    <p className="text-gray-400">Loading saved ideas...</p>
                  ) : savedOpportunities.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
                      No saved ideas yet.
                    </p>
                  ) : (
                    savedOpportunities.slice(0, 3).map((idea) => (
                      <Link
                        key={idea.id}
                        href={`/opportunity/${idea.id}`}
                        className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06]"
                      >
                        <p className="font-medium">{idea.title}</p>
                        <p className="mt-2 text-sm text-gray-500">
                          Score: {idea.score} · {idea.pricing}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}