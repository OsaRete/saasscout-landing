"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";
import { Button, EmptyState, LoadingState } from "../../components/ui";

type SavedIdea = {
  id: string;
  created_at: string;
  user_id: string;
  opportunity_id: string;
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

export default function SavedIdeasPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadSavedIdeas() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setLoadingAuth(false);

      const { data: savedData, error: savedError } = await supabase
        .from("saved_ideas")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (savedError) {
        console.error(savedError);
        setLoadingData(false);
        return;
      }

      setSavedIdeas(savedData || []);

      if (!savedData || savedData.length === 0) {
        setOpportunities([]);
        setLoadingData(false);
        return;
      }

      const opportunityIds = savedData.map((item) => item.opportunity_id);

      const { data: opportunitiesData, error: opportunitiesError } =
        await supabase
          .from("opportunities")
          .select("*")
          .in("id", opportunityIds);

      if (opportunitiesError) {
        console.error(opportunitiesError);
      } else {
        setOpportunities(opportunitiesData || []);
      }

      setLoadingData(false);
    }

    loadSavedIdeas();
  }, [router]);

  function getOpportunity(opportunityId: string) {
    return opportunities.find((item) => item.id === opportunityId);
  }

  function getSavedDate(opportunityId: string) {
    const savedIdea = savedIdeas.find(
      (item) => item.opportunity_id === opportunityId
    );

    if (!savedIdea) return "";

    return new Date(savedIdea.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  async function handleRemoveSavedIdea(savedIdeaId: string) {
    if (removingId) return;

    const confirmed = window.confirm(
      "Remove this idea from your saved list?"
    );

    if (!confirmed) return;

    setRemovingId(savedIdeaId);

    const { error } = await supabase
      .from("saved_ideas")
      .delete()
      .eq("id", savedIdeaId);

    if (error) {
      console.error(error);
      setRemovingId(null);
      return;
    }

    setSavedIdeas((current) =>
      current.filter((item) => item.id !== savedIdeaId)
    );

    setRemovingId(null);
  }

  const savedOpportunities = useMemo(() => {
    return savedIdeas
      .map((savedIdea) => {
        const opportunity = getOpportunity(savedIdea.opportunity_id);

        if (!opportunity) return null;

        return {
          savedIdea,
          opportunity,
        };
      })
      .filter(Boolean) as {
      savedIdea: SavedIdea;
      opportunity: Opportunity;
    }[];
  }, [savedIdeas, opportunities]);

  const filteredSavedOpportunities = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return savedOpportunities;

    return savedOpportunities.filter(({ opportunity }) =>
      [
        opportunity.title,
        opportunity.pain,
        opportunity.customer,
        opportunity.mvp,
        opportunity.pricing,
        opportunity.difficulty,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, savedOpportunities]);

  const highestScore =
    opportunities.length > 0
      ? Math.max(...opportunities.map((item) => Number(item.score) || 0))
      : 0;

  const lowDifficultyCount = savedOpportunities.filter(
    ({ opportunity }) => opportunity.difficulty?.toLowerCase() === "low"
  ).length;

  if (loadingAuth || loadingData) {
    return (
      <LoadingState title="Loading saved ideas" description="Preparing your validation shortlist." />
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
              href="/results"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
            >
              Results
            </Link>

            <Link
              href="/dashboard"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
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

        <section className="mt-14 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] to-violet-600/[0.08] p-8 shadow-2xl">
          <p className="text-sm uppercase tracking-widest text-violet-300">
            Saved Ideas
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Your validation shortlist.
          </h1>

          <p className="mt-5 max-w-3xl text-gray-400">
            Keep track of the SaaS opportunities you want to validate, compare,
            or revisit later.
          </p>
        </section>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Saved opportunities</p>
            <h2 className="mt-3 text-4xl font-bold">{savedIdeas.length}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Highest score</p>
            <h2 className="mt-3 text-4xl font-bold">{highestScore}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Low difficulty ideas</p>
            <h2 className="mt-3 text-4xl font-bold">{lowDifficultyCount}</h2>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#0B1020] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">Saved opportunities</h2>
            <p className="mt-1 text-sm text-gray-500">
              Search your saved ideas by title, customer, MVP, pricing, or
              difficulty.
            </p>
          </div>

          <input
            type="text"
            placeholder="Search saved ideas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-500 md:max-w-sm"
          />
        </div>

        <section className="mt-6">
          {savedIdeas.length === 0 ? (
            <EmptyState
              icon="☆"
              title="No saved ideas yet"
              description="Save opportunities from the results page to build your validation shortlist."
              primaryAction={<Button href="/results">Explore Opportunities</Button>}
            />
          ) : filteredSavedOpportunities.length === 0 ? (
            <EmptyState
              icon="⌕"
              title="No matching ideas"
              description="Try a different search term to find saved opportunities."
            />
          ) : (
            <div className="space-y-6">
              {filteredSavedOpportunities.map(({ savedIdea, opportunity }) => (
                <div
                  key={savedIdea.id}
                  className="rounded-3xl border border-white/10 bg-[#0B1020] p-7 shadow-2xl transition hover:border-violet-500/30"
                >
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-3">
                        <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-200">
                          Saved {getSavedDate(opportunity.id)}
                        </span>

                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-300">
                          {opportunity.difficulty} difficulty
                        </span>

                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-300">
                          {opportunity.pricing}
                        </span>
                      </div>

                      <h2 className="mt-4 text-3xl font-bold">
                        {opportunity.title}
                      </h2>

                      <p className="mt-4 max-w-3xl leading-relaxed text-gray-400">
                        {opportunity.pain}
                      </p>
                    </div>

                    <div className="w-fit rounded-2xl border border-violet-500/30 bg-violet-500/10 px-6 py-4 text-center">
                      <p className="text-4xl font-bold">
                        {opportunity.score}
                      </p>

                      <p className="text-sm text-gray-400">score</p>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-white/[0.04] p-5">
                      <p className="text-sm text-gray-500">Customer</p>
                      <p className="mt-2 text-sm text-gray-200">
                        {opportunity.customer}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white/[0.04] p-5">
                      <p className="text-sm text-gray-500">MVP</p>
                      <p className="mt-2 text-sm text-gray-200">
                        {opportunity.mvp}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white/[0.04] p-5">
                      <p className="text-sm text-gray-500">Pricing</p>
                      <p className="mt-2 text-sm text-gray-200">
                        {opportunity.pricing}
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
                      onClick={() => handleRemoveSavedIdea(savedIdea.id)}
                      disabled={removingId === savedIdea.id}
                      className="rounded-xl border border-red-500/30 px-5 py-3 font-semibold text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {removingId === savedIdea.id
                        ? "Removing..."
                        : "Remove from Saved"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}