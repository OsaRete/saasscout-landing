"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

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

  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);

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
        setLoadingData(false);
        return;
      }

      const opportunityIds = savedData.map(
        (item) => item.opportunity_id
      );

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
    return opportunities.find(
      (item) => item.id === opportunityId
    );
  }

  if (loadingAuth || loadingData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-gray-400">Loading saved ideas...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Top */}
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
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {/* Header */}
        <section className="mt-14 border-b border-white/10 pb-10">
          <p className="text-sm uppercase tracking-widest text-violet-400">
            Saved Ideas
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Your favorite opportunities.
          </h1>

          <p className="mt-5 max-w-2xl text-lg text-gray-400">
            These are the SaaS opportunities you saved for future validation.
          </p>
        </section>

        {/* Stats */}
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">
              Saved opportunities
            </p>

            <h2 className="mt-3 text-4xl font-bold">
              {savedIdeas.length}
            </h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">
              Highest score
            </p>

            <h2 className="mt-3 text-4xl font-bold">
              {opportunities.length > 0
                ? Math.max(
                    ...opportunities.map(
                      (item) => item.score
                    )
                  )
                : 0}
            </h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">
              Ready to validate
            </p>

            <h2 className="mt-3 text-4xl font-bold">
              {opportunities.length}
            </h2>
          </div>
        </div>

        {/* Content */}
        <section className="mt-10">
          {savedIdeas.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-10 text-center">
              <h2 className="text-2xl font-bold">
                No saved ideas yet
              </h2>

              <p className="mt-3 text-gray-400">
                Save opportunities from the results page to see
                them here.
              </p>

              <Link
                href="/results"
                className="mt-6 inline-block rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white hover:bg-violet-500"
              >
                Explore Opportunities
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {savedIdeas.map((savedIdea) => {
                const opportunity = getOpportunity(
                  savedIdea.opportunity_id
                );

                if (!opportunity) return null;

                return (
                  <div
                    key={savedIdea.id}
                    className="rounded-3xl border border-white/10 bg-[#0B1020] p-7 shadow-2xl"
                  >
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h2 className="text-3xl font-bold">
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

                        <p className="text-sm text-gray-400">
                          score
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 grid gap-4 md:grid-cols-4">
                      <div className="rounded-2xl bg-white/[0.04] p-5">
                        <p className="text-sm text-gray-500">
                          Customer
                        </p>

                        <p className="mt-2 text-sm text-gray-200">
                          {opportunity.customer}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] p-5">
                        <p className="text-sm text-gray-500">
                          MVP
                        </p>

                        <p className="mt-2 text-sm text-gray-200">
                          {opportunity.mvp}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] p-5">
                        <p className="text-sm text-gray-500">
                          Pricing
                        </p>

                        <p className="mt-2 text-sm text-gray-200">
                          {opportunity.pricing}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/[0.04] p-5">
                        <p className="text-sm text-gray-500">
                          Difficulty
                        </p>

                        <p className="mt-2 text-sm text-gray-200">
                          {opportunity.difficulty}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <Link
                        href={`/opportunity/${opportunity.id}`}
                        className="inline-block rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-500"
                      >
                        View Details
                      </Link>
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