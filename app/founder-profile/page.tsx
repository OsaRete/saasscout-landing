"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

export default function FounderProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [experienceLevel, setExperienceLevel] = useState("");
  const [technicalSkills, setTechnicalSkills] = useState("");
  const [budgetLevel, setBudgetLevel] = useState("");
  const [businessModel, setBusinessModel] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const { data } = await supabase
        .from("founder_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setExperienceLevel(data.experience_level || "");
        setTechnicalSkills(data.technical_skills || "");
        setBudgetLevel(data.budget_level || "");
        setBusinessModel(data.preferred_business_model || "");
        setHoursPerWeek(String(data.available_hours_per_week || ""));
      }

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    if (!userId) return;

    setSaving(true);
    setMessage("");

    const payload = {
      user_id: userId,
      experience_level: experienceLevel,
      technical_skills: technicalSkills,
      budget_level: budgetLevel,
      preferred_business_model: businessModel,
      available_hours_per_week: Number(hoursPerWeek || 0),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("founder_profiles")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      console.error(error);
      setMessage("Could not save founder profile.");
      setSaving(false);
      return;
    }

    setMessage("Founder profile saved successfully.");
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-gray-400">Loading founder profile...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Founder Profile</h1>

          <Link
            href="/dashboard"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
          >
            Dashboard
          </Link>
        </div>

        <section className="mt-10 rounded-[2rem] border border-white/10 bg-[#0B1020] p-8 shadow-2xl">
          <p className="text-sm uppercase tracking-widest text-violet-400">
            Founder Matching V1
          </p>

          <h2 className="mt-4 text-4xl font-bold">
            Tell SaaSScout what kind of founder you are.
          </h2>

          <p className="mt-4 text-gray-400">
            This profile will help SaaSScout match opportunities to your skills,
            budget, time, and preferred business model.
          </p>

          <form onSubmit={handleSave} className="mt-8 grid gap-5">
            <input
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value)}
              placeholder="Experience level: beginner, intermediate, advanced..."
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 outline-none focus:border-violet-500"
            />

            <textarea
              value={technicalSkills}
              onChange={(e) => setTechnicalSkills(e.target.value)}
              placeholder="Technical skills: React, Next.js, Python, no-code, marketing, sales..."
              className="min-h-[130px] rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 outline-none focus:border-violet-500"
            />

            <input
              value={budgetLevel}
              onChange={(e) => setBudgetLevel(e.target.value)}
              placeholder="Budget level: no budget, low, medium, high..."
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 outline-none focus:border-violet-500"
            />

            <input
              value={businessModel}
              onChange={(e) => setBusinessModel(e.target.value)}
              placeholder="Preferred business model: SaaS, micro-SaaS, agency, marketplace..."
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 outline-none focus:border-violet-500"
            />

            <input
              type="number"
              value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(e.target.value)}
              placeholder="Available hours per week"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 outline-none focus:border-violet-500"
            />

            <button
              disabled={saving}
              className="rounded-2xl bg-violet-600 px-6 py-4 font-bold text-white hover:bg-violet-500 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Founder Profile"}
            </button>

            {message && (
              <p className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
                {message}
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}