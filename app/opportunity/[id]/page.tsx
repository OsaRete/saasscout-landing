"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "../../supabase";

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

export default function OpportunityPage() {
  const router = useRouter();
  const params = useParams();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingOpportunity, setLoadingOpportunity] = useState(true);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    async function loadOpportunity() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setLoadingAuth(false);

      const opportunityId = String(params.id);

      const { data, error } = await supabase
        .from("opportunities")
        .select("*")
        .eq("id", opportunityId)
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error(error);
        setOpportunity(null);
        setLoadingOpportunity(false);
        return;
      }

      setOpportunity(data);

      const { data: savedData, error: savedError } = await supabase
        .from("saved_ideas")
        .select("*")
        .eq("user_id", user.id)
        .eq("opportunity_id", opportunityId)
        .maybeSingle();

      if (savedError) {
        console.error(savedError);
      }

      if (savedData) {
        setIsSaved(true);
        setSaveMessage("Idea already saved.");
      }

      setLoadingOpportunity(false);
    }

    loadOpportunity();
  }, [router, params.id]);

  async function handleSaveIdea() {
    if (!userId || !opportunity || saving || isSaved) return;

    setSaving(true);
    setSaveMessage("");

    const { error } = await supabase.from("saved_ideas").insert([
      {
        user_id: userId,
        opportunity_id: opportunity.id,
      },
    ]);

    if (error) {
      console.error(error);
      setSaveMessage("Could not save this idea. Please try again.");
      setSaving(false);
      return;
    }

    setIsSaved(true);
    setSaveMessage("Idea saved successfully.");
    setSaving(false);
  }

  if (loadingAuth || loadingOpportunity) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-gray-400">Loading opportunity...</p>
      </main>
    );
  }

  if (!opportunity) {
    return (
      <main className="min-h-screen bg-[#050816] text-white">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <Image
            src="/brand/logo-main.png"
            alt="SaaSScout"
            width={170}
            height={48}
            className="mx-auto h-10 w-auto"
          />

          <h1 className="mt-12 text-4xl font-bold">Opportunity not found</h1>

          <p className="mt-4 text-gray-400">
            This opportunity does not exist or you do not have access to it.
          </p>

          <Link
            href="/results"
            className="mt-8 inline-block rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white hover:bg-violet-500"
          >
            Back to Results
          </Link>
        </div>
      </main>
    );
  }

  const mvpFeatures = opportunity.mvp
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/results">
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
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
            >
              Back to Results
            </Link>

            <button
              onClick={handleSaveIdea}
              disabled={saving || isSaved}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : isSaved ? "Saved" : "Save Idea"}
            </button>
          </div>
        </div>

        {saveMessage && (
          <div
            className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
              isSaved
                ? "border-violet-500/30 bg-violet-500/10 text-violet-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            {saveMessage}
          </div>
        )}

        <section className="mt-14 rounded-[2rem] border border-white/10 bg-[#0B1020] p-8 shadow-2xl md:p-12">
          <p className="text-sm uppercase tracking-widest text-violet-400">
            Opportunity Detail
          </p>

          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                {opportunity.title}
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-relaxed text-gray-400">
                {opportunity.pain}
              </p>
            </div>

            <div className="rounded-3xl border border-violet-500/30 bg-violet-500/10 px-8 py-6 text-center">
              <p className="text-5xl font-bold">{opportunity.score}</p>
              <p className="mt-1 text-sm text-gray-400">Founder Score</p>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h2 className="text-2xl font-bold">Problem detected</h2>
              <p className="mt-4 leading-relaxed text-gray-400">
                {opportunity.pain}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h2 className="text-2xl font-bold">Suggested MVP Features</h2>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {mvpFeatures.map((feature) => (
                  <div
                    key={feature}
                    className="rounded-2xl bg-white/[0.04] p-4"
                  >
                    {feature}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h2 className="text-2xl font-bold">Build difficulty</h2>
              <p className="mt-4 leading-relaxed text-gray-400">
                {opportunity.difficulty}
              </p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h3 className="text-xl font-bold">Ideal Customer</h3>
              <p className="mt-4 text-gray-400">{opportunity.customer}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h3 className="text-xl font-bold">Pricing Angle</h3>
              <p className="mt-4 text-3xl font-bold text-violet-300">
                {opportunity.pricing}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h3 className="text-xl font-bold">Next Step</h3>
              <p className="mt-4 text-gray-400">
                Validate this idea with 5–10 people in the target market before
                building the full MVP.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}