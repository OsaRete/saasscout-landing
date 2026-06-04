"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

const ADMIN_EMAIL = "cedeomartineze@gmail.com";
const FREE_SCAN_LIMIT = 3;
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type LoadingStep =
  | "idle"
  | "checking"
  | "extracting"
  | "analyzingEvidence"
  | "saving"
  | "generating"
  | "completed";

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

type EvidenceAnalysis = {
  inferred_market: string;
  audience_summary: string;
  evidence_summary: string;
  pain_points: string;
  repeated_patterns: string;
  workflow_problems: string;
  willingness_to_pay_signals: string;
  opportunity_angles: string;
  confidence_score: number;
};

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileType(fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension || "FILE";
}

export default function ScanPage() {
  const router = useRouter();

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [market, setMarket] = useState("");
  const [audience, setAudience] = useState("");
  const [region, setRegion] = useState("");
  const [evidence, setEvidence] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>("idle");
  const [message, setMessage] = useState("");

  const isAdmin = userEmail?.toLowerCase() === ADMIN_EMAIL;

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
      setUserEmail(user.email || null);
      setLoadingAuth(false);
    }

    checkUser();
  }, [router]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    setMessage("");

    if (!file) {
      setEvidenceFile(null);
      return;
    }

    const allowedExtensions = [".txt", ".pdf", ".docx"];
    const fileName = file.name.toLowerCase();
    const isAllowed = allowedExtensions.some((extension) =>
      fileName.endsWith(extension)
    );

    if (!isAllowed) {
      setEvidenceFile(null);
      setMessage("Only .txt, .pdf, and .docx files are supported.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setEvidenceFile(null);
      setMessage(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    setEvidenceFile(file);
  }

  function removeSelectedFile() {
    setEvidenceFile(null);
    setMessage("");
  }

  async function extractFileText(file: File) {
    if (file.name.toLowerCase().endsWith(".txt")) {
      return await file.text();
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/extract-file-text", {
      method: "POST",
      body: formData,
    });

    const rawResponse = await response.text();

    let result;

    try {
      result = JSON.parse(rawResponse);
    } catch {
      console.error("Raw extract-file-text response:", rawResponse);

      throw new Error(
        "The file extraction API returned an invalid response. Check the terminal for the real error."
      );
    }

    if (!response.ok) {
      throw new Error(result.error || "Could not extract file text.");
    }

    return String(result.text || "");
  }

  async function analyzeEvidence({
    market,
    audience,
    region,
    evidence,
  }: {
    market: string;
    audience: string;
    region: string;
    evidence: string;
  }) {
    const response = await fetch("/api/analyze-evidence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        market,
        audience,
        region,
        evidence,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Evidence analysis failed.");
    }

    return result.analysis as EvidenceAnalysis;
  }

  async function uploadEvidenceFile(scanId: string, file: File) {
    const safeFileName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .toLowerCase();

    const filePath = `${userId}/${scanId}/${Date.now()}-${safeFileName}`;

    const { error } = await supabase.storage
      .from("evidence-files")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    return filePath;
  }

  async function saveEvidenceAnalysis(
    scanId: string,
    evidenceAnalysis: EvidenceAnalysis
  ) {
    const { error } = await supabase.from("evidence_analysis").insert([
      {
        scan_id: scanId,
        inferred_market: evidenceAnalysis.inferred_market,
        audience_summary: evidenceAnalysis.audience_summary,
        evidence_summary: evidenceAnalysis.evidence_summary,
        pain_points: evidenceAnalysis.pain_points,
        repeated_patterns: evidenceAnalysis.repeated_patterns,
        workflow_problems: evidenceAnalysis.workflow_problems,
        willingness_to_pay_signals:
          evidenceAnalysis.willingness_to_pay_signals,
        opportunity_angles: evidenceAnalysis.opportunity_angles,
        confidence_score: evidenceAnalysis.confidence_score,
      },
    ]);

    if (error) {
      console.error("Evidence analysis insert error:", error);
    }
  }

  function getButtonText() {
    if (!loading) return "Find Opportunities";

    if (loadingStep === "checking") return "Checking scan limit...";
    if (loadingStep === "extracting") return "Extracting document...";
    if (loadingStep === "analyzingEvidence") return "Analyzing evidence...";
    if (loadingStep === "saving") return "Saving scan...";
    if (loadingStep === "generating") return "Generating opportunities...";

    return "Analyzing...";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!userId) return;

    if (!market.trim() && !evidence.trim() && !evidenceFile) {
      setMessage("Please provide a market, paste evidence, or upload a file.");
      return;
    }

    setLoading(true);
    setLoadingStep("checking");
    setMessage("");

    try {
      if (!isAdmin) {
        const { count, error: countError } = await supabase
          .from("scan")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);

        if (countError) {
          console.error(countError);
          setMessage("Could not verify your scan limit. Please try again.");
          setLoading(false);
          setLoadingStep("idle");
          return;
        }

        if ((count || 0) >= FREE_SCAN_LIMIT) {
          setMessage(
            "You have reached the free limit of 3 scans. Paid plans are coming soon."
          );
          setLoading(false);
          setLoadingStep("idle");
          return;
        }
      }

      const cleanMarket = market.trim();
      const cleanAudience = audience.trim();
      const cleanRegion = region.trim();

      let cleanEvidence = evidence.trim();
      let finalMarket = cleanMarket;

      if (evidenceFile) {
        try {
          setLoadingStep("extracting");

          const fileText = await extractFileText(evidenceFile);

          if (fileText.trim()) {
            cleanEvidence = `${cleanEvidence}\n\nUploaded file content:\n${fileText}`;
          }
        } catch (extractError) {
          console.error(extractError);
          setMessage(
            extractError instanceof Error
              ? extractError.message
              : "Could not extract text from the uploaded file."
          );
          setLoading(false);
          setLoadingStep("idle");
          return;
        }
      }

      cleanEvidence = cleanEvidence.trim().slice(0, 6000);

      let evidenceAnalysis: EvidenceAnalysis | null = null;

      if (cleanEvidence) {
        try {
          setLoadingStep("analyzingEvidence");

          evidenceAnalysis = await analyzeEvidence({
            market: cleanMarket,
            audience: cleanAudience,
            region: cleanRegion,
            evidence: cleanEvidence,
          });

          finalMarket = cleanMarket || evidenceAnalysis.inferred_market || "";

          cleanEvidence = `
Original evidence:
${cleanEvidence}

Evidence Intelligence:
Inferred market: ${evidenceAnalysis.inferred_market}
Audience summary: ${evidenceAnalysis.audience_summary}
Evidence summary: ${evidenceAnalysis.evidence_summary}
Pain points: ${evidenceAnalysis.pain_points}
Repeated patterns: ${evidenceAnalysis.repeated_patterns}
Workflow problems: ${evidenceAnalysis.workflow_problems}
Willingness to pay signals: ${evidenceAnalysis.willingness_to_pay_signals}
Opportunity angles: ${evidenceAnalysis.opportunity_angles}
Confidence score: ${evidenceAnalysis.confidence_score}
`.trim();
        } catch (analysisError) {
          console.error("Evidence analysis error:", analysisError);

          setMessage(
            analysisError instanceof Error
              ? analysisError.message
              : "Could not analyze the evidence."
          );

          setLoading(false);
          setLoadingStep("idle");
          return;
        }
      }

      setLoadingStep("saving");

      const { data: scanData, error: scanError } = await supabase
        .from("scan")
        .insert([
          {
            user_id: userId,
            market: finalMarket || null,
            audience: cleanAudience || null,
            region: cleanRegion || null,
            evidence: cleanEvidence || null,
            file_url: null,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (scanError || !scanData) {
        console.error(scanError);
        setMessage("Something went wrong creating your scan. Please try again.");
        setLoading(false);
        setLoadingStep("idle");
        return;
      }

      if (evidenceAnalysis) {
        await saveEvidenceAnalysis(scanData.id, evidenceAnalysis);
      }

      if (evidenceFile) {
        try {
          const filePath = await uploadEvidenceFile(scanData.id, evidenceFile);

          await supabase
            .from("scan")
            .update({ file_url: filePath })
            .eq("id", scanData.id);
        } catch (uploadError) {
          console.error("UPLOAD ERROR:", uploadError);

          setMessage(
            uploadError instanceof Error
              ? uploadError.message
              : JSON.stringify(uploadError)
          );

          setLoading(false);
          setLoadingStep("idle");
          return;
        }
      }

      setLoadingStep("generating");

      const response = await fetch("/api/generate-opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          market: finalMarket,
          audience: cleanAudience,
          region: cleanRegion,
          evidence: cleanEvidence,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error(result);
        setMessage(result.error || "AI generation failed. Please try again.");
        setLoading(false);
        setLoadingStep("idle");
        return;
      }

      const generatedOpportunities: GeneratedOpportunity[] =
        result.opportunities || [];

      if (generatedOpportunities.length === 0) {
        setMessage("No opportunities were generated. Please try again.");
        setLoading(false);
        setLoadingStep("idle");
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
        setLoadingStep("idle");
        return;
      }

      await supabase
        .from("scan")
        .update({ status: "completed" })
        .eq("id", scanData.id);

      setLoadingStep("completed");

      router.push("/results");
    } catch (error) {
      console.error(error);
      setMessage("Something went wrong generating your opportunities.");
      setLoading(false);
      setLoadingStep("idle");
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
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-widest text-violet-400">
                New Market Scan
              </p>

              <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
                What market do you want to analyze?
              </h1>

              <p className="mt-5 max-w-2xl text-lg text-gray-400">
                Add a niche, paste real market evidence, or upload a document.
                SaaSScout will detect pain points and generate actionable SaaS
                opportunities.
              </p>
            </div>

            {isAdmin ? (
              <div className="inline-flex shrink-0 items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-violet-200">
                Admin · Unlimited scans
              </div>
            ) : (
              <div className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-300">
                Free beta · {FREE_SCAN_LIMIT} scans
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-10 grid gap-6">
            <div>
              <label className="mb-2 block text-sm text-gray-300">
                Market / Niche
              </label>

              <input
                type="text"
                maxLength={120}
                placeholder="Optional: Freelance designers, fitness coaches, book authors..."
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-gray-300">
                  Target audience
                </label>

                <input
                  type="text"
                  maxLength={120}
                  placeholder="Solo founders, agencies, coaches..."
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-gray-300">
                  Region
                </label>

                <input
                  type="text"
                  maxLength={80}
                  placeholder="Global, US, Brazil, LatAm..."
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500"
                />
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-sm font-semibold text-white">
                Option 1: Paste evidence
              </p>

              <p className="mt-2 text-sm text-gray-500">
                Paste real conversations, reviews, support tickets, interview
                notes, market reports, or podcast transcripts.
              </p>

              <textarea
                maxLength={6000}
                placeholder="Example: Paste Reddit posts, customer reviews, support tickets, interview notes, podcast transcripts, or market research here..."
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                className="mt-4 min-h-[220px] w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500"
              />

              <div className="mt-2 flex justify-end text-xs text-gray-500">
                {evidence.length}/6000
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs uppercase tracking-widest text-gray-500">
              <div className="h-px flex-1 bg-white/10" />
              or
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white">
                Option 2: Upload evidence file
              </p>

              <p className="mt-2 text-sm text-gray-500">
                Upload a TXT, PDF, or DOCX file. Maximum size:{" "}
                {MAX_FILE_SIZE_MB}MB.
              </p>

              <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                <label
                  htmlFor="evidence-file"
                  className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500"
                >
                  Choose File
                </label>

                <input
                  id="evidence-file"
                  type="file"
                  accept=".txt,.pdf,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <p className="text-sm text-gray-400">
                  {evidenceFile ? evidenceFile.name : "No file selected"}
                </p>
              </div>

              {evidenceFile && (
                <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-violet-100">
                      📄 {evidenceFile.name}
                    </p>

                    <p className="mt-1 text-xs text-violet-200/80">
                      {getFileType(evidenceFile.name)} ·{" "}
                      {formatFileSize(evidenceFile.size)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={removeSelectedFile}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 transition hover:bg-white/10"
                  >
                    Remove
                  </button>
                </div>
              )}

              <div className="mt-5 grid gap-3 text-sm text-gray-500 sm:grid-cols-2">
                <p>✓ Reddit discussions</p>
                <p>✓ Customer interviews</p>
                <p>✓ Product reviews</p>
                <p>✓ Support tickets</p>
                <p>✓ Podcast transcripts</p>
                <p>✓ Market reports</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 rounded-2xl bg-violet-600 px-6 py-4 font-semibold text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {getButtonText()}
            </button>

            {message && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">
                {message}
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}