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
  market: string;
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

      const { data: scansData, error: scansError } = await supabase
        .from("scan")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (scansError) console.error(scansError);

      const { data: opportunitiesData, error: opportunitiesError } =
        await supabase
          .from("opportunities")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

      if (opportunitiesError) console.error(opportunitiesError);

      const { data: savedData, error: savedError } = await supabase
        .from("saved_ideas")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (savedError) console.error(savedError);

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
        <aside className="hidden w-72 border-r border-white/10 bg-[#070B18] p-6 lg:block">
          <Image
            src="/brand/logo-main.png"
            alt="SaaSScout"
            width={170}
            height={48}
            className="h-10 w-auto"
          />

          <nav className="mt-10 space-y-2 text-sm text-gray-400">
            <a className="block rounded-xl bg-violet-600/20 px-4 py-3 text-white">
              Dashboard
            </a>

            <Link
              href="/scan"
              className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white"
            >
              New Scan
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

            <a className="block rounded-xl px-4 py-3 hover:bg-white/5 hover:text-white">
              Settings
            </a>
          </nav>
        </aside>

        <section className="flex-1 px-6 py-8 lg:px-10">
          <header className="flex flex-col gap-6 border-b border-white/10 pb-8 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-widest text-violet-400">
                SaaSScout MVP
              </p>

              <h1 className="mt-3 text-4xl font-bold tracking-tight">
                Founder Dashboard
              </h1>

              <p className="mt-3 max-w-2xl text-gray-400">
                Discover real market pain, scan niches, and turn repeated
                complaints into SaaS opportunities.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleLogout}
                className="rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
              >
                Logout
              </button>

              <Link
                href="/scan"
                className="w-fit rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500"
              >
                New Market Scan
              </Link>
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
              <p className="mt-2 text-sm text-cyan-300">Real saved ideas</p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 shadow-2xl lg:col-span-2">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Recent scans</h2>
                <span className="text-sm text-gray-500">
                  {loadingData ? "Loading..." : "Real data"}
                </span>
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
                        <h3 className="font-semibold">{scan.market}</h3>
                        <p className="mt-1 text-sm text-gray-400">
                          {formatDate(scan.created_at)}
                          {scan.audience ? ` · ${scan.audience}` : ""}
                          {scan.region ? ` · ${scan.region}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="rounded-full bg-violet-500/15 px-3 py-1 text-sm text-violet-200">
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

              <p className="mt-2 text-sm text-gray-400">
                Opportunities you may want to validate later.
              </p>

              <div className="mt-6 space-y-4">
                {loadingData ? (
                  <p className="text-gray-400">Loading saved ideas...</p>
                ) : savedOpportunities.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm text-gray-400">
                      No saved ideas yet.
                    </p>
                  </div>
                ) : (
                  savedOpportunities.slice(0, 3).map((idea) => (
                    <Link
                      key={idea.id}
                      href={`/opportunity/${idea.id}`}
                      className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
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
        </section>
      </div>
    </main>
  );
}