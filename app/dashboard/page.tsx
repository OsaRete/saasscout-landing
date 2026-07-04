"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";
import AppShell from "../../components/app-shell";
import {
  Badge,
  Button,
  CardSkeleton,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  Panel,
} from "../../components/ui";

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
          (opportunity) => opportunity.id === savedIdea.opportunity_id,
        ),
      )
      .filter(Boolean) as Opportunity[];
  }, [savedIdeas, opportunities]);

  if (loadingAuth) {
    return (
      <LoadingState
        title="Loading SaaSScout"
        description="Checking your workspace and preparing dashboard intelligence."
      />
    );
  }

  return (
    <AppShell active="/dashboard">
      <PageHeader
        eyebrow="SaaSScout control center"
        title="Dashboard"
        description="Monitor scan activity, review opportunity intelligence, and keep your strongest market signals moving toward validation."
        actions={
          <>
            <Button
              href="/results"
              variant="secondary"
              className="h-11 px-5 py-0"
            >
              View Results
            </Button>
            <Button
              href="/scan"
              className="h-11 px-5 py-0 shadow-xl shadow-violet-600/25"
            >
              New Market Scan
            </Button>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="h-11 px-4 py-0 text-gray-400 hover:text-white"
            >
              Logout
            </Button>
          </>
        }
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total scans"
          value={loadingData ? "—" : scans.length}
          helper="Evidence collected from your market searches"
          tone="green"
        />
        <MetricCard
          label="Opportunities"
          value={loadingData ? "—" : opportunities.length}
          helper="Structured ideas generated from scan outputs"
          tone="violet"
        />
        <MetricCard
          label="Saved ideas"
          value={loadingData ? "—" : savedIdeas.length}
          helper="Shortlisted opportunities ready for validation"
          tone="cyan"
        />
        <div className="rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_34%),rgba(255,255,255,0.045)] p-6 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-400">Latest report</p>
            <Badge tone={weeklyReport ? "green" : "neutral"}>
              {weeklyReport ? "Ready" : "Pending"}
            </Badge>
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">
            {weeklyReport ? formatDate(weeklyReport.week_start) : "—"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-cyan-200/90">
            Weekly intelligence status for the active workspace.
          </p>
        </div>
      </div>

      <Panel accent className="mt-8 overflow-hidden p-0">
        <div className="relative border-b border-white/10 px-6 py-7 md:px-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-300">
                  Weekly Intelligence
                </p>
                <Badge tone={weeklyReport ? "green" : "neutral"}>
                  {weeklyReport ? "Latest signal loaded" : "Awaiting report"}
                </Badge>
              </div>

              <h2 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight md:text-4xl">
                {weeklyReport?.strongest_trend
                  ? `Strongest trend: ${weeklyReport.strongest_trend}`
                  : "Market trend report"}
              </h2>

              <p className="mt-4 max-w-3xl text-base leading-relaxed text-gray-300">
                {weeklyReport?.summary ||
                  "Weekly market intelligence will appear here once the first report is generated."}
              </p>

              {weeklyReport && (
                <p className="mt-4 text-sm text-gray-500">
                  Latest report: {formatDate(weeklyReport.week_start)} -{" "}
                  {formatDate(weeklyReport.week_end)}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Button href="/weekly" className="w-fit">
                Open Weekly Intelligence
              </Button>
              <Button href="/discover" variant="cyan" className="w-fit">
                Run Discovery
              </Button>
            </div>
          </div>
        </div>

        {weeklyReport && weeklyNiches.length > 0 && (
          <div className="grid gap-4 px-6 pt-6 md:px-8 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-5 shadow-lg shadow-black/10">
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

            <div className="rounded-2xl border border-white/10 bg-black/25 p-5 shadow-lg shadow-black/10">
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

            <div className="rounded-2xl border border-white/10 bg-black/25 p-5 shadow-lg shadow-black/10">
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
          <div className="mx-6 mb-6 mt-6 rounded-2xl border border-white/10 bg-black/25 p-5 shadow-lg shadow-black/10 md:mx-8">
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
      </Panel>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <Panel className="lg:col-span-2 xl:col-span-2">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
                Recent activity
              </p>
              <h2 className="mt-2 text-2xl font-bold">Recent scans</h2>
              <p className="mt-1 text-sm text-gray-500">
                Latest evidence runs and market analyses in this workspace.
              </p>
            </div>

            <Button href="/scans" variant="ghost" className="px-3 py-2">
              View all
            </Button>
          </div>

          {loadingData ? (
            <CardSkeleton rows={4} />
          ) : scans.length === 0 ? (
            <EmptyState
              icon="⌁"
              title="No scans yet"
              description="Create your first evidence-based market scan to start building reusable opportunity intelligence."
              primaryAction={
                <Button href="/scan">Create your first scan</Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {scans.slice(0, 5).map((scan) => (
                <div
                  key={scan.id}
                  className="group flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-0.5 hover:border-violet-500/30 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-violet-950/10 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <h3 className="font-semibold text-white transition group-hover:text-violet-100">
                      {scan.market || "Evidence-based scan"}
                    </h3>
                    <p className="mt-1 text-sm text-gray-400">
                      {formatDate(scan.created_at)}
                      {scan.audience ? ` · ${scan.audience}` : ""}
                      {scan.region ? ` · ${scan.region}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <Badge className="capitalize">{scan.status}</Badge>

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
        </Panel>

        <div className="space-y-6">
          <Panel className="border-cyan-500/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.1),transparent_34%),rgba(11,16,32,0.95)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Next best action
            </p>
            <h2 className="mt-2 text-2xl font-bold">Quick actions</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Start with a new scan, then review generated intelligence and
              saved validation candidates.
            </p>

            <div className="mt-5 grid gap-3">
              <Button
                href="/scan"
                className="justify-start rounded-2xl px-5 py-4 text-base"
              >
                New Market Scan
              </Button>

              <Button
                href="/discover"
                variant="cyan"
                className="justify-start rounded-2xl px-5 py-4 text-base"
              >
                Opportunity Discovery
              </Button>

              <Button
                href="/scans"
                variant="secondary"
                className="justify-start rounded-2xl px-5 py-4 text-base"
              >
                View Scan History
              </Button>

              <Button
                href="/results"
                variant="secondary"
                className="justify-start rounded-2xl px-5 py-4 text-base"
              >
                View Opportunities
              </Button>

              <Button
                href="/weekly"
                variant="secondary"
                className="justify-start rounded-2xl border-violet-500/30 bg-violet-500/10 px-5 py-4 text-base text-violet-200 hover:bg-violet-500/20"
              >
                Weekly Intelligence
              </Button>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Validation shortlist
                </p>
                <h2 className="mt-2 text-2xl font-bold">Saved ideas</h2>
              </div>
              <Button href="/saved" variant="ghost" className="px-3 py-2">
                View all
              </Button>
            </div>

            <div className="mt-6 space-y-4">
              {loadingData ? (
                <CardSkeleton rows={3} />
              ) : savedOpportunities.length === 0 ? (
                <EmptyState
                  icon="☆"
                  title="No saved ideas yet"
                  description="Save promising opportunities from results when you are ready to validate them."
                  primaryAction={
                    <Button href="/results" variant="cyan">
                      Explore opportunities
                    </Button>
                  }
                  className="p-6"
                />
              ) : (
                savedOpportunities.slice(0, 3).map((idea) => (
                  <Link
                    key={idea.id}
                    href={`/opportunity/${idea.id}`}
                    className="group block rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-cyan-950/10"
                  >
                    <p className="font-medium text-white transition group-hover:text-cyan-100">
                      {idea.title}
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      Score: {idea.score} · {idea.pricing}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
