"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

type GeneratedOpportunity = {
  title: string;
  score: number;
  pain: string;
  customer: string;
  mvp: string;
  pricing: string;
  difficulty: string;
  problem_summary: string;
  target_customer: string;
  mvp_roadmap: string;
  validation_questions: string;
  landing_page_idea: string;
  acquisition_channels: string;
};

export default function ScanPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [market, setMarket] = useState("");
  const [audience, setAudience] = useState("");
  const [region, setRegion] = useState("");
  const [evidence, setEvidence] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setLoadingAuth(false);
    }

    checkUser();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!market.trim() || !userId) return;

    setLoading(true);
    setMessage("");

    try {
      const cleanMarket = market.trim();
      const cleanAudience = audience.trim();
      const cleanRegion = region.trim();
      const cleanEvidence = evidence.trim().slice(0, 6000);

      const { data: scanData, error: scanError } = await supabase
        .from("scan")
        .insert([
          {
            user_id: userId,
            market: cleanMarket,
            audience: cleanAudience || null,
            region: cleanRegion || null,
            evidence: cleanEvidence || null,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (scanError || !scanData) {
        console.error(scanError);
        setMessage("Something went wrong creating your scan. Please try again.");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/generate-opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          market: cleanMarket,
          audience: cleanAudience,
          region: cleanRegion,
          evidence: cleanEvidence,
        }),
      });

      const result = await response.json();
      console.log("AI generation result:", result);

      if (!response.ok) {
        console.error(result);
        setMessage(result.error || "AI generation failed. Please try again.");
        setLoading(false);
        return;
      }

      const generatedOpportunities: GeneratedOpportunity[] =
        result.opportunities || [];

      if (generatedOpportunities.length === 0) {
        setMessage("No opportunities were generated. Please try again.");
        setLoading(false);
        return;
      }

      const opportunitiesToInsert = generatedOpportunities
        .slice(0, 3)
        .map((opportunity) => ({
          user_id: userId,
          scan_id: scanData.id,
          title: opportunity.title || "Untitled opportunity",
          score: Number(opportunity.score) || 7,
          pain: opportunity.pain || "No pain point provided.",
          customer: opportunity.customer || "Not specified.",
          mvp: opportunity.mvp || "Not specified.",
          pricing: opportunity.pricing || "Not specified.",
          difficulty: opportunity.difficulty || "Medium",

          problem_summary:
            opportunity.problem_summary || opportunity.pain || null,
          target_customer:
            opportunity.target_customer || opportunity.customer || null,
          mvp_roadmap: opportunity.mvp_roadmap || null,
          validation_questions: opportunity.validation_questions || null,
          landing_page_idea: opportunity.landing_page_idea || null,
          acquisition_channels: opportunity.acquisition_channels || null,
        }));

      const { error: opportunityError } = await supabase
        .from("opportunities")
        .insert(opportunitiesToInsert);

      if (opportunityError) {
        console.error(opportunityError);
        setMessage("Scan was created, but opportunities could not be saved.");
        setLoading(false);
        return;
      }

      await supabase
        .from("scan")
        .update({ status: "completed" })
        .eq("id", scanData.id);

      router.push("/results");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong generating your opportunities.");
      setLoading(false);
    }
  }

  if (loadingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-gray-400">Loading SaaSScout...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
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

          <Link
            href="/dashboard"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
          >
            Back to Dashboard
          </Link>
        </div>

        <section className="mt-16 rounded-[2rem] border border-white/10 bg-[#0B1020] p-8 shadow-2xl md:p-12">
          <p className="text-sm uppercase tracking-widest text-violet-400">
            New Market Scan
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            What market do you want to analyze?
          </h1>

          <p className="mt-5 max-w-2xl text-lg text-gray-400">
            Enter a niche, industry or customer group. You can also paste real
            conversations, reviews, transcripts or complaints to make the scan
            more accurate.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 grid gap-5">
            <div>
              <label className="mb-2 block text-sm text-gray-300">
                Market / Niche *
              </label>

              <input
                type="text"
                required
                maxLength={120}
                placeholder="Freelance designers"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition focus:border-violet-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">
                Target audience (optional)
              </label>

              <input
                type="text"
                maxLength={120}
                placeholder="Solo founders, agencies, coaches..."
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition focus:border-violet-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">
                Region (optional)
              </label>

              <input
                type="text"
                maxLength={80}
                placeholder="Global"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition focus:border-violet-500"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-4">
                <label className="block text-sm text-gray-300">
                  Evidence / Source Text (optional)
                </label>

                <span className="text-xs text-gray-500">
                  {evidence.length}/6000
                </span>
              </div>

              <textarea
                maxLength={6000}
                placeholder="Paste Reddit comments, podcast transcripts, customer reviews, support tickets, YouTube transcript, forum posts, notes, or any text you want SaaSScout to analyze..."
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                className="min-h-[220px] w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500"
              />

              <p className="mt-2 text-sm text-gray-500">
                This helps SaaSScout generate opportunities based on real market
                signals instead of only guessing from the niche.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 rounded-2xl bg-violet-600 px-6 py-4 font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500 disabled:opacity-60"
            >
              {loading
                ? "Analyzing evidence and generating opportunities..."
                : "Find Opportunities"}
            </button>

            {message && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">
                {message}
              </div>
            )}
          </form>
        </section>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {["Freelancers", "Fitness Coaches", "Local Businesses"].map(
            (item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <p className="text-sm text-gray-400">Popular search</p>
                <p className="mt-2 font-semibold">{item}</p>
              </div>
            )
          )}
        </div>
      </div>
    </main>
  );
}