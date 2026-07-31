"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../supabase";

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const SAFE_SCAN_FAILURE_MESSAGE = "Your scan could not be completed. Please try again.";
const SOLUTION_GROUNDING_FAILURE_MESSAGE = "The generated opportunities could not be verified against your evidence. Please retry the scan.";
class ScanSubmissionError extends Error {}

type LoadingStep =
  | "idle"
  | "checking"
  | "extracting"
  | "collectingSources"
  | "analyzingEvidence"
  | "saving"
  | "generating"
  | "completed";




type UserProfile = {
  id: string;
  user_id: string;
  plan: string;
  scan_limit: number;
  scans_used: number;
  external_sources_limit: number;
  weekly_intelligence_enabled: boolean;
  pdf_export_enabled: boolean;
};

type UserCapabilities = {
  role: "internal_tester" | null;
  isInternalTester: boolean;
  unlimitedScans: boolean;
};

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileType(fileName: string) {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension || "FILE";
}

function ScanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const discoveryIdParam = searchParams.get("discoveryId");
  const problemIdParam = searchParams.get("problemId");
  const problemTitleParam = searchParams.get("problemTitle");
  

  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [capabilities, setCapabilities] = useState<UserCapabilities | null>(null);

  const [market, setMarket] = useState("");
  const [audience, setAudience] = useState("");
  const [region, setRegion] = useState("");
  const [evidence, setEvidence] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>("idle");
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        try {
          const capabilityResponse = await fetch("/api/user/capabilities", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (capabilityResponse.ok) {
            const capabilityBody = await capabilityResponse.json();
            setCapabilities(capabilityBody.capabilities ?? null);
          }
        } catch {
          // Capability labels are descriptive only. The database remains authoritative,
          // and a failed display lookup must leave the ordinary quota experience usable.
          setCapabilities(null);
        }
      }
      const { data: profileData, error: profileError } = await supabase
  .from("user_profiles")
  .select("*")
  .eq("user_id", user.id)
  .maybeSingle();

if (profileError) {
  console.error("Profile error:", profileError);
}

if (profileData) {
  setUserProfile(profileData);
}
      setLoadingAuth(false);
    }

    checkUser();
  }, [router]);

  useEffect(() => {
    const marketParam = searchParams.get("market");
    const evidenceParam = searchParams.get("evidence");
  
    const timer = setTimeout(() => {
      if (marketParam) {
        setMarket(marketParam);
      }
  
      if (evidenceParam) {
        setEvidence(evidenceParam);
      }
    }, 0);
  
    return () => clearTimeout(timer);
  }, [searchParams]);

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

  function getButtonText() {
    if (!loading) return "Find Opportunities";

    if (loadingStep === "checking") return "Checking scan limit...";
    if (loadingStep === "extracting") return "Extracting document...";
    if (loadingStep === "collectingSources") return "Collecting external sources...";
    if (loadingStep === "analyzingEvidence") return "Analyzing evidence...";
    if (loadingStep === "saving") return "Saving scan...";
    if (loadingStep === "generating") return "Generating opportunities...";

    return "Analyzing...";
  }

  async function runServerScanWorkflow({
    accessToken,
    cleanMarket,
    cleanAudience,
    cleanRegion,
  }: {
    accessToken: string;
    cleanMarket: string;
    cleanAudience: string;
    cleanRegion: string;
  }) {
    const legacyContext = {
      sourceProblemTitle: problemTitleParam || cleanMarket || undefined,
      sourceProblemId: problemIdParam || undefined,
      sourceDiscoveryId: discoveryIdParam || undefined,
    };

    const intent = {
      ...(cleanMarket ? { market: cleanMarket } : {}),
      ...(cleanAudience ? { audience: cleanAudience } : {}),
      ...(cleanRegion ? { region: cleanRegion } : {}),
    };

    const formData = new FormData();
    formData.append("intent", JSON.stringify(intent));
    formData.append("legacyContext", JSON.stringify(legacyContext));

    if (evidence.trim()) {
      formData.append("pastedEvidence", evidence.trim());
    }

    if (evidenceFile) {
      formData.append("files", evidenceFile);
    }

    const response = await fetch("/api/scan/workflow", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const safeCode = typeof result?.error?.code === "string" ? result.error.code : "scan_workflow_failed";
      const safeStage = typeof result?.error?.stage === "string" ? result.error.stage : "unknown";
      console.warn("Scan workflow failed", { code: safeCode, stage: safeStage, status: response.status });
      throw new ScanSubmissionError(safeCode === "scan_workflow_solution_grounding_failed" ? SOLUTION_GROUNDING_FAILURE_MESSAGE : (typeof result?.error?.message === "string" ? result.error.message : SAFE_SCAN_FAILURE_MESSAGE));
    }

    return result as { success: true; scanId: string };
  }

  async function recordDiscoveryConversion({
    accessToken,
    cleanMarket,
  }: {
    accessToken: string;
    cleanMarket: string;
  }) {
    if (!discoveryIdParam || !problemIdParam) return;

    const response = await fetch("/api/problem-intelligence/conversion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        discoveryId: discoveryIdParam,
        problemId: problemIdParam,
        problemTitle: problemTitleParam || cleanMarket,
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => null);
      console.error("Problem intelligence conversion update error:", result);
    }
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Your session expired. Please log in again.");
        setLoading(false);
        setLoadingStep("idle");
        return;
      }

      const accessToken = session.access_token;
      const cleanMarket = market.trim();
      const cleanAudience = audience.trim();
      const cleanRegion = region.trim();

      setLoadingStep("generating");
      await runServerScanWorkflow({ accessToken, cleanMarket, cleanAudience, cleanRegion });
      setLoadingStep("completed");
      await recordDiscoveryConversion({ accessToken, cleanMarket });

      router.push("/results");
    } catch (error) {
      console.error("Scan submission failed", { code: "scan_submission_failed" });
      setMessage(error instanceof ScanSubmissionError ? error.message : SAFE_SCAN_FAILURE_MESSAGE);
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
                Add a niche to search external sources, or optionally paste/upload your own evidence.
                SaaSScout will detect pain points and generate actionable SaaS
                opportunities.
              </p>
            </div>

            {capabilities?.isInternalTester && capabilities.unlimitedScans ? (
              <div className="inline-flex shrink-0 items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-violet-200">
                Internal tester · Unlimited scans
              </div>
            ) : (
              <div className="w-fit rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gray-300">
                {userProfile
  ? `${userProfile.plan.toUpperCase()} · ${
      userProfile.scan_limit - userProfile.scans_used
    } scans left`
  : "Loading plan..."}
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

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
          <p className="text-gray-400">Loading scan...</p>
        </main>
      }
    >
      <ScanPageContent />
    </Suspense>
  );
}
