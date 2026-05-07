"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

export default function ScanPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [market, setMarket] = useState("");
  const [audience, setAudience] = useState("");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
      } else {
        setUserId(user.id);
        setLoadingAuth(false);
      }
    }

    checkUser();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!market.trim() || !userId) return;

    setLoading(true);
    setMessage("");

    const { data: scanData, error: scanError } = await supabase
      .from("scan")
      .insert([
        {
          user_id: userId,
          market,
          audience,
          region,
          status: "completed",
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

    const demoOpportunities = [
      {
        user_id: userId,
        scan_id: scanData.id,
        title: `CRM for ${market}`,
        score: 8.6,
        pain: "Users manage clients manually across spreadsheets, chats and notes.",
        customer: `${market} professionals`,
        mvp: "Client dashboard, reminders, notes, pipeline and simple automation.",
        pricing: "$19/mo",
        difficulty: "Medium",
      },
      {
        user_id: userId,
        scan_id: scanData.id,
        title: `${market} Analytics Platform`,
        score: 7.9,
        pain: "Businesses lack visibility into performance, customer behavior and growth signals.",
        customer: `${market} founders and operators`,
        mvp: "Analytics dashboard, weekly reports, insights and alerts.",
        pricing: "$29/mo",
        difficulty: "Medium",
      },
      {
        user_id: userId,
        scan_id: scanData.id,
        title: `AI Assistant for ${market}`,
        score: 7.4,
        pain: "Too much repetitive work and manual operations reduce productivity.",
        customer: `${market} teams`,
        mvp: "AI chat assistant, task suggestions, templates and automation flows.",
        pricing: "$49/mo",
        difficulty: "High",
      },
    ];

    const { error: opportunityError } = await supabase
      .from("opportunities")
      .insert(demoOpportunities);

    if (opportunityError) {
      console.error(opportunityError);
      setMessage("Scan was created, but opportunities could not be generated.");
      setLoading(false);
      return;
    }

    router.push("/results");
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
            Enter a niche, industry or customer group. SaaSScout will generate
            opportunities based on pain signals and repeated frustrations.
          </p>

          <form onSubmit={handleSubmit} className="mt-10 grid gap-5">
            <div>
              <label className="mb-2 block text-sm text-gray-300">
                Market / Niche *
              </label>

              <input
                type="text"
                required
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
                placeholder="Global"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition focus:border-violet-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 rounded-2xl bg-violet-600 px-6 py-4 font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500 disabled:opacity-60"
            >
              {loading ? "Generating opportunities..." : "Find Opportunities"}
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