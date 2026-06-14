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
  problem_summary: string | null;
  target_customer: string | null;
  mvp_roadmap: string | null;
  validation_questions: string | null;
  landing_page_idea: string | null;
  acquisition_channels: string | null;
};

type EvidenceAnalysis = {
  id: string;
  scan_id: string;
  inferred_market: string | null;
  audience_summary: string | null;
  evidence_summary: string | null;
  pain_points: string | null;
  repeated_patterns: string | null;
  workflow_problems: string | null;
  willingness_to_pay_signals: string | null;
  opportunity_angles: string | null;
  confidence_score: number | null;
};



type OpportunityIntelligence = {
  id: string;
  opportunity_id: string;
  user_id: string;
  founder_fit_score: number;
  intelligence_score: number;
  prepared_count: number;
  converted_count: number;
  confidence_label: string | null;
  recommendation: string | null;
};

function splitByComma(text: string | null | undefined) {
  return String(text || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitByPipe(text: string | null | undefined) {
  return String(text || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitRoadmap(text: string | null | undefined) {
  const value = String(text || "").trim();

  if (!value) return [];

  return value
    .split(/Phase\s*\d+:|Week\s*\d+:|Step\s*\d+:/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function OpportunityPage() {
  const router = useRouter();
  const params = useParams();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingOpportunity, setLoadingOpportunity] = useState(true);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [evidenceAnalysis, setEvidenceAnalysis] =
  useState<EvidenceAnalysis | null>(null);
  const [opportunityIntelligence, setOpportunityIntelligence] =
  useState<OpportunityIntelligence | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

      if (error || !data) {
        console.error(error);
        setOpportunity(null);
        setLoadingOpportunity(false);
        return;
      }

      setOpportunity(data);

      const { data: analysisData, error: analysisError } = await supabase
        .from("evidence_analysis")
        .select("*")
        .eq("scan_id", data.scan_id)
        .maybeSingle();

      if (analysisError) {
        console.error(analysisError);
      }

      if (analysisData) {
        setEvidenceAnalysis(analysisData);
      }

      const { data: savedData } = await supabase
        .from("saved_ideas")
        .select("*")
        .eq("user_id", user.id)
        .eq("opportunity_id", opportunityId)
        .maybeSingle();

      if (savedData) {
        setIsSaved(true);
        setSaveMessage("Idea already saved.");
      }

      const intelligenceResponse = await fetch("/api/opportunity-intelligence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          opportunityId,
          problemTitle: data.problem_summary || data.title,
        }),
      });
      
      const intelligenceResult = await intelligenceResponse.json();
      
      if (intelligenceResponse.ok && intelligenceResult.intelligence) {
        setOpportunityIntelligence(intelligenceResult.intelligence);
      } else {
        console.error("Opportunity intelligence error:", intelligenceResult);
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

  function handleExportPdf(){
    window.print();
  }

  async function handleDeleteOpportunity() {
    if (!userId || !opportunity || deleting) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this opportunity? This action cannot be undone."
    );

    if (!confirmed) return;

    setDeleting(true);

    await supabase
      .from("saved_ideas")
      .delete()
      .eq("user_id", userId)
      .eq("opportunity_id", opportunity.id);

    const { error } = await supabase
      .from("opportunities")
      .delete()
      .eq("id", opportunity.id)
      .eq("user_id", userId);

    if (error) {
      console.error(error);
      setSaveMessage("Could not delete this opportunity. Please try again.");
      setDeleting(false);
      return;
    }

    router.push("/results");
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

  const mvpFeatures = splitByComma(opportunity.mvp);
  const roadmapItems = splitRoadmap(opportunity.mvp_roadmap);

  const validationQuestions =
    splitByPipe(opportunity.validation_questions).length > 0
      ? splitByPipe(opportunity.validation_questions)
      : [
          "How are you solving this problem today?",
          "How often does this problem happen?",
          "What happens if you do not solve it?",
          "Have you paid for a tool or service to solve this before?",
          `Would you pay ${opportunity.pricing} for this?`,
        ];

  const acquisitionChannels =
    splitByComma(opportunity.acquisition_channels).length > 0
      ? splitByComma(opportunity.acquisition_channels)
      : ["Reddit communities", "LinkedIn outreach", "Niche communities"];

  const evidencePainPoints = splitByPipe(evidenceAnalysis?.pain_points);
  const repeatedPatterns = splitByPipe(evidenceAnalysis?.repeated_patterns);
  const opportunityAngles = splitByPipe(evidenceAnalysis?.opportunity_angles);

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

          <div className="flex gap-3 print:hidden">
  <Link
    href="/results"
    className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
  >
    Back
  </Link>

  <button
    onClick={handleSaveIdea}
    disabled={saving || isSaved}
    className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
  >
    {saving ? "Saving..." : isSaved ? "Saved" : "Save Idea"}
  </button>

  <button
    onClick={handleExportPdf}
    className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5"
  >
    Export PDF
  </button>

  <button
    onClick={handleDeleteOpportunity}
    disabled={deleting}
    className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-60"
  >
    {deleting ? "Deleting..." : "Delete"}
  </button>
</div>
        </div>

        {saveMessage && (
          <div className="mt-6 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
            {saveMessage}
          </div>
        )}

        <section className="mt-14 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] to-violet-600/[0.08] p-8 shadow-2xl md:p-12">
          <p className="text-sm uppercase tracking-widest text-violet-300">
            Opportunity Report
          </p>

          <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                {opportunity.title}
              </h1>

              <p className="mt-5 max-w-3xl text-lg leading-relaxed text-gray-400">
                {opportunity.problem_summary || opportunity.pain}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-semibold text-violet-200">
                  {opportunity.difficulty} difficulty
                </span>

                <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-300">
                  {opportunity.pricing}
                </span>

                {evidenceAnalysis && (
                  <span className="rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2 text-xs font-semibold text-green-200">
                    Evidence-backed
                  </span>
                )}
              </div>
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
              <h2 className="text-2xl font-bold">Problem Summary</h2>
              <p className="mt-4 leading-relaxed text-gray-400">
                {opportunity.problem_summary || opportunity.pain}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h2 className="text-2xl font-bold">MVP Roadmap</h2>

              <div className="mt-6 space-y-4">
                {(roadmapItems.length > 0
                  ? roadmapItems
                  : [
                      "Validate the pain with 5–10 potential customers.",
                      `Build the core workflow around: ${mvpFeatures
                        .slice(0, 3)
                        .join(", ")}.`,
                      "Launch a small paid beta and measure willingness to pay.",
                    ]
                ).map((step, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
                  >
                    <h3 className="font-semibold text-violet-200">
                      Phase {index + 1}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-400">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h2 className="text-2xl font-bold">Suggested MVP Features</h2>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {mvpFeatures.map((feature) => (
                  <div
                    key={feature}
                    className="rounded-2xl bg-white/[0.04] p-4 text-gray-300"
                  >
                    {feature}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h2 className="text-2xl font-bold">Validation Questions</h2>

              <div className="mt-5 space-y-3">
                {validationQuestions.map((question) => (
                  <div
                    key={question}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-gray-300"
                  >
                    {question}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h2 className="text-2xl font-bold">Landing Page Idea</h2>

              <p className="mt-4 leading-relaxed text-gray-400">
                {opportunity.landing_page_idea ||
                  `Position this product around a direct outcome for ${opportunity.customer}. Lead with the pain and offer a simple beta CTA.`}
              </p>
            </div>

            {evidenceAnalysis && (
              <div className="rounded-3xl border border-green-500/20 bg-green-500/10 p-7">
                <p className="text-sm uppercase tracking-widest text-green-300">
                  Evidence Intelligence
                </p>

                <h2 className="mt-3 text-2xl font-bold">
                  Detected Market:{" "}
                  {evidenceAnalysis.inferred_market || "Unknown"}
                </h2>

                <p className="mt-4 leading-relaxed text-gray-300">
                  {evidenceAnalysis.evidence_summary}
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                    <h3 className="font-semibold">Pain Signals</h3>
                    <div className="mt-4 space-y-2">
                      {(evidencePainPoints.length
                        ? evidencePainPoints
                        : ["No pain signals available."]
                      ).map((item) => (
                        <p key={item} className="text-sm text-gray-300">
                          • {item}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                    <h3 className="font-semibold">Repeated Patterns</h3>
                    <div className="mt-4 space-y-2">
                      {(repeatedPatterns.length
                        ? repeatedPatterns
                        : ["No repeated patterns available."]
                      ).map((item) => (
                        <p key={item} className="text-sm text-gray-300">
                          • {item}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                    <h3 className="font-semibold">Opportunity Angles</h3>
                    <div className="mt-4 space-y-2">
                      {(opportunityAngles.length
                        ? opportunityAngles
                        : ["No opportunity angles available."]
                      ).map((item) => (
                        <p key={item} className="text-sm text-gray-300">
                          • {item}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                {evidenceAnalysis.willingness_to_pay_signals && (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
                    <h3 className="font-semibold">
                      Willingness To Pay Signals
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-gray-300">
                      {evidenceAnalysis.willingness_to_pay_signals}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-8">
            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h3 className="text-xl font-bold">Target Customer</h3>
              <p className="mt-4 text-gray-400">
                {opportunity.target_customer || opportunity.customer}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h3 className="text-xl font-bold">Pricing Angle</h3>
              <p className="mt-4 text-3xl font-bold text-violet-300">
                {opportunity.pricing}
              </p>
              <p className="mt-3 text-sm text-gray-500">
                Use this as an early pricing hypothesis.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-7">
              <h3 className="text-xl font-bold">Acquisition Channels</h3>

              <div className="mt-5 space-y-3">
                {acquisitionChannels.map((channel) => (
                  <div
                    key={channel}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-300"
                  >
                    {channel}
                  </div>
                ))}
              </div>
            </div>

            {evidenceAnalysis && (
              <div className="rounded-3xl border border-green-500/30 bg-green-500/10 p-7">
                <h3 className="text-xl font-bold">Evidence Confidence</h3>
                <p className="mt-4 text-4xl font-bold text-green-200">
                  {evidenceAnalysis.confidence_score || 7}
                </p>
                <p className="mt-3 text-sm text-gray-400">
                  Confidence in the extracted evidence signals.
                </p>
              </div>
            )}

<div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/10 p-7">
  <p className="text-sm uppercase tracking-widest text-cyan-300">
    Opportunity Intelligence
  </p>

  <h3 className="mt-3 text-2xl font-bold">
    {opportunityIntelligence?.recommendation || "Calculating..."}
  </h3>

  <div className="mt-6 grid grid-cols-2 gap-3">
    <div className="rounded-2xl bg-black/20 p-4">
      <p className="text-xs text-gray-500">Founder Fit</p>
      <p className="mt-1 text-2xl font-bold">
        {opportunityIntelligence?.founder_fit_score || 0}
      </p>
    </div>

    <div className="rounded-2xl bg-black/20 p-4">
      <p className="text-xs text-gray-500">Market Signal</p>
      <p className="mt-1 text-2xl font-bold">
        {opportunityIntelligence?.intelligence_score || 0}
      </p>
    </div>

    <div className="rounded-2xl bg-black/20 p-4">
      <p className="text-xs text-gray-500">Prepared</p>
      <p className="mt-1 text-2xl font-bold">
        {opportunityIntelligence?.prepared_count || 0}
      </p>
    </div>

    <div className="rounded-2xl bg-black/20 p-4">
      <p className="text-xs text-gray-500">Converted</p>
      <p className="mt-1 text-2xl font-bold">
        {opportunityIntelligence?.converted_count || 0}
      </p>
    </div>
  </div>

  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
    <p className="text-xs text-gray-500">Confidence</p>
    <p className="mt-1 text-lg font-bold text-cyan-200">
      {opportunityIntelligence?.confidence_label || "Low"}
    </p>
  </div>
</div>

            <div className="rounded-3xl border border-violet-500/30 bg-violet-500/10 p-7">
              <h3 className="text-xl font-bold">Recommended Next Step</h3>
              <p className="mt-4 text-gray-300">
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