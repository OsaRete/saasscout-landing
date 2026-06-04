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
  created_at: string;
  user_id: string;
  opportunity_id: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [scans, setScans] = useState<Scan[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);

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

      setScans(scansData || []);
      setOpportunities(opportunitiesData || []);
      setSavedIdeas(savedData || []);
      setLoadingData(false);
    }

    loadDashboard();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getSavedOpportunities() {
    return savedIdeas
      .map((savedIdea) =>
        opportunities.find(
          (opportunity) => opportunity.id === savedIdea.opportunity_id
        )
      )
      .filter(Boolean) as Opportunity[];
  }

  const savedOpportunities = getSavedOpportunities();

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

            <Link href="/scan" className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white">
              New Scan
            </Link>

            <Link href="/scans" className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white">
              Scan History
            </Link>

            <Link href="/results" className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white">
              Opportunities
            </Link>

            <Link href="/saved" className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white">
              Saved Ideas
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
    className="
      h-11
      rounded-xl
      border
      border-white/10
      px-5
      text-sm
      font-medium
      text-gray-300
      transition
      hover:bg-white/5
      hover:text-white
    "
  >
    Logout
  </button>

  <Link
    href="/scan"
    className="
      flex
      h-11
      items-center
      rounded-xl
      bg-violet-600
      px-5
      text-sm
      font-semibold
      text-white
      shadow-lg
      shadow-violet-600/20
      transition
      hover:bg-violet-500
    "
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
              <h2 className="mt-3 text-4xl font-bold">{opportunities.length}</h2>
              <p className="mt-2 text-sm text-violet-300">Generated from scans</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <p className="text-sm text-gray-400">Saved ideas</p>
              <h2 className="mt-3 text-4xl font-bold">{savedIdeas.length}</h2>
              <p className="mt-2 text-sm text-cyan-300">Ready to validate</p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 shadow-2xl lg:col-span-2">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Recent scans</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Latest evidence and market analyses.
                  </p>
                </div>

                <Link href="/scans" className="text-sm font-medium text-violet-300 hover:text-violet-200">
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

                        <Link href="/results" className="text-sm font-medium text-violet-300 hover:text-violet-200">
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
                  <Link href="/scan" className="rounded-2xl bg-violet-600 px-5 py-4 font-semibold hover:bg-violet-500">
                    New Market Scan
                  </Link>

                  <Link href="/scans" className="rounded-2xl border border-white/10 px-5 py-4 font-semibold text-gray-300 hover:bg-white/5">
                    View Scan History
                  </Link>

                  <Link href="/results" className="rounded-2xl border border-white/10 px-5 py-4 font-semibold text-gray-300 hover:bg-white/5">
                    View Opportunities
                  </Link>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Saved ideas</h2>
                  <Link href="/saved" className="text-sm font-medium text-violet-300 hover:text-violet-200">
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