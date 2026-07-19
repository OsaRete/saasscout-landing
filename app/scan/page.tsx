"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../supabase";

const ADMIN_EMAIL = "cedeomartineze@gmail.com";
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const SAFE_SCAN_FAILURE_MESSAGE = "Your scan could not be completed. Please try again.";

type LegacyScanStatus = "pending" | "processing" | "completed" | "failed";

type LoadingStep =
  | "idle"
  | "checking"
  | "extracting"
  | "collectingSources"
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

type ExternalSource = {
  source_type: string;
  source_name: string | null;
  title: string | null;
  url: string | null;
  snippet: string | null;
  raw_text: string | null;
  source_score: number | null;
};

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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

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

  async function extractFileText(file: File, accessToken: string) {
    if (file.name.toLowerCase().endsWith(".txt")) {
      return await file.text();
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/extract-file-text", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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

  async function acceptScan({
    market,
    audience,
    region,
    evidence,
    accessToken,
  }: {
    market: string;
    audience: string;
    region: string;
    evidence: string;
    accessToken: string;
  }) {
    const response = await fetch("/api/scan/acceptance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
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
      throw new Error(result.error?.message || result.error || "Scan acceptance failed.");
    }

    return result.acceptance as { version: "scan-acceptance@1"; scanId: string; status: "pending" };
  }

  async function analyzeEvidence({
    market,
    audience,
    region,
    evidence,
    accessToken,
  }: {
    market: string;
    audience: string;
    region: string;
    evidence: string;
    accessToken: string;
  }) {
    const response = await fetch("/api/analyze-evidence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
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

  async function collectExternalSources({
    market,
    audience,
    region,
    accessToken,
  }: {
    market: string;
    audience: string;
    region: string;
    accessToken: string;
  }) {
    const response = await fetch("/api/collect-sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        market,
        audience,
        region,
      }),
    });
  
    const result = await response.json();
  
    if (!response.ok) {
      throw new Error(result.error || "Could not collect external sources.");
    }
  
    return (result.sources || []) as ExternalSource[];
  }
  
  async function saveExternalSources({
    scanId,
    userId,
    sources,
  }: {
    scanId: string;
    userId: string;
    sources: ExternalSource[];
  }) {
    if (sources.length === 0) return true;
  
    const rows = sources.map((source) => ({
      scan_id: scanId,
      user_id: userId,
      source_type: source.source_type,
      source_name: source.source_name,
      title: source.title,
      url: source.url,
      snippet: source.snippet,
      raw_text: source.raw_text,
      source_score: source.source_score,
    }));
  
    const { error } = await supabase.from("scan_sources").insert(rows);
  
    if (error) {
      console.error("Scan sources insert error:", error);
      return false;
    }

    return true;
  }
  
  function formatExternalSourcesForEvidence(sources: ExternalSource[]) {
    if (sources.length === 0) return "";
  
    return sources
      .map(
        (source, index) => `
  External Source ${index + 1}
  Type: ${source.source_type}
  Source: ${source.source_name || "Unknown"}
  Title: ${source.title || "Untitled"}
  URL: ${source.url || "No URL"}
  Snippet: ${source.snippet || "No snippet"}
  Text: ${source.raw_text || "No extracted text"}
  Source score: ${source.source_score || "N/A"}
  `
      )
      .join("\n\n");
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

  async function transitionLegacyScanStatus({
    scanId,
    status,
    reason,
  }: {
    scanId: string;
    status: LegacyScanStatus;
    reason: string;
  }) {
    const { error } = await supabase
      .from("scan")
      .update({ status })
      .eq("id", scanId)
      .eq("user_id", userId);

    if (error) {
      console.error("Legacy scan status transition error:", {
        error,
        scanId,
        userId,
        attemptedStatus: status,
        reason,
      });
      return false;
    }

    return true;
  }

  async function failAcceptedScan(scanId: string, reason: string) {
    const transitioned = await transitionLegacyScanStatus({
      scanId,
      status: "failed",
      reason,
    });

    if (!transitioned) {
      console.error("Accepted scan failure terminal transition could not be persisted:", {
        scanId,
        userId,
        reason,
      });
    }
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
      return false;
    }

    return true;
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
  
    let acceptedScanId: string | null = null;

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

      if (!isAdmin) {
        if (!userProfile) {
          setMessage("Could not load your plan. Please refresh and try again.");
          setLoading(false);
          setLoadingStep("idle");
          return;
        }
  
        if (userProfile.scans_used >= userProfile.scan_limit) {
          setMessage(
            `You have reached your ${userProfile.plan} plan limit of ${userProfile.scan_limit} scans. Upgrade options are coming soon.`
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
      let externalSources: ExternalSource[] = [];
  
      if (evidenceFile) {
        try {
          setLoadingStep("extracting");
  
          const fileText = await extractFileText(evidenceFile, accessToken);
  
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
  
      if (cleanMarket) {
        try {
          setLoadingStep("collectingSources");
  
          externalSources = await collectExternalSources({
            market: cleanMarket,
            audience: cleanAudience,
            region: cleanRegion,
            accessToken,
          });
  
          const externalEvidence =
            formatExternalSourcesForEvidence(externalSources);
  
          if (externalEvidence.trim()) {
            cleanEvidence = `
  User-provided evidence:
  ${cleanEvidence || "No user-provided evidence."}
  
  External source evidence:
  ${externalEvidence}
  `.trim();
          }
        } catch (sourceError) {
          console.error("External sources error:", sourceError);
  
          setMessage(
            sourceError instanceof Error
              ? sourceError.message
              : "Could not collect external sources."
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
            accessToken,
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
  
      let scanAcceptance: { version: "scan-acceptance@1"; scanId: string; status: "pending" };

      try {
        scanAcceptance = await acceptScan({
          market: finalMarket,
          audience: cleanAudience,
          region: cleanRegion,
          evidence: cleanEvidence,
          accessToken,
        });
      } catch (acceptanceError) {
        console.error("Scan acceptance error:", acceptanceError);
        setMessage("Something went wrong creating your scan. Please try again.");
        setLoading(false);
        setLoadingStep("idle");
        return;
      }

      acceptedScanId = scanAcceptance.scanId;

      const processingTransitioned = await transitionLegacyScanStatus({
        scanId: scanAcceptance.scanId,
        status: "processing",
        reason: "scan_accepted",
      });

      if (!processingTransitioned) {
        await failAcceptedScan(scanAcceptance.scanId, "processing_transition_failed");
        setMessage(SAFE_SCAN_FAILURE_MESSAGE);
        setLoading(false);
        setLoadingStep("idle");
        return;
      }
  
      if (evidenceAnalysis) {
        const evidenceAnalysisSaved = await saveEvidenceAnalysis(scanAcceptance.scanId, evidenceAnalysis);

        if (!evidenceAnalysisSaved) {
          await failAcceptedScan(scanAcceptance.scanId, "evidence_analysis_persistence_failed");
          setMessage(SAFE_SCAN_FAILURE_MESSAGE);
          setLoading(false);
          setLoadingStep("idle");
          return;
        }
      }
  
      const externalSourcesSaved = await saveExternalSources({
        scanId: scanAcceptance.scanId,
        userId,
        sources: externalSources,
      });

      if (!externalSourcesSaved) {
        await failAcceptedScan(scanAcceptance.scanId, "source_persistence_failed");
        setMessage(SAFE_SCAN_FAILURE_MESSAGE);
        setLoading(false);
        setLoadingStep("idle");
        return;
      }
  
      if (evidenceFile) {
        try {
          const filePath = await uploadEvidenceFile(scanAcceptance.scanId, evidenceFile);
  
          const { error: fileUrlUpdateError } = await supabase
            .from("scan")
            .update({ file_url: filePath })
            .eq("id", scanAcceptance.scanId)
            .eq("user_id", userId);

          if (fileUrlUpdateError) {
            console.error("Scan file_url update error:", {
              error: fileUrlUpdateError,
              scanId: scanAcceptance.scanId,
              userId,
              filePath,
            });

            await failAcceptedScan(scanAcceptance.scanId, "file_url_persistence_failed");
            setMessage(SAFE_SCAN_FAILURE_MESSAGE);
            setLoading(false);
            setLoadingStep("idle");
            return;
          }
        } catch (uploadError) {
          console.error("UPLOAD ERROR:", uploadError);
  
          await failAcceptedScan(scanAcceptance.scanId, "evidence_file_upload_failed");
          setMessage(SAFE_SCAN_FAILURE_MESSAGE);
  
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
          Authorization: `Bearer ${accessToken}`,
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
        await failAcceptedScan(scanAcceptance.scanId, "opportunity_generation_failed");
        setMessage(SAFE_SCAN_FAILURE_MESSAGE);
        setLoading(false);
        setLoadingStep("idle");
        return;
      }
  
      const generatedOpportunities: GeneratedOpportunity[] =
        result.opportunities || [];
  
      if (generatedOpportunities.length === 0) {
        await failAcceptedScan(scanAcceptance.scanId, "opportunity_generation_empty");
        setMessage(SAFE_SCAN_FAILURE_MESSAGE);
        setLoading(false);
        setLoadingStep("idle");
        return;
      }
  
      const opportunitiesToInsert = generatedOpportunities
  .slice(0, 3)
  .map((opportunity) => ({
    user_id: userId,
    scan_id: scanAcceptance.scanId,
    source_problem_title: problemTitleParam || finalMarket || cleanMarket || null,
    source_problem_id: problemIdParam || null,
    source_discovery_id: discoveryIdParam || null,
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
        await failAcceptedScan(scanAcceptance.scanId, "opportunity_persistence_failed");
        setMessage(SAFE_SCAN_FAILURE_MESSAGE);
        setLoading(false);
        setLoadingStep("idle");
        return;
      }
  
      const completedTransitioned = await transitionLegacyScanStatus({
        scanId: scanAcceptance.scanId,
        status: "completed",
        reason: "opportunities_persisted",
      });

      if (!completedTransitioned) {
        console.error("Scan completed status update error:", {
          scanId: scanAcceptance.scanId,
          userId,
          attemptedStatus: "completed",
        });

        await failAcceptedScan(scanAcceptance.scanId, "completed_transition_failed");
        setMessage(SAFE_SCAN_FAILURE_MESSAGE);
        setLoading(false);
        setLoadingStep("idle");
        return;
      }
      
      if (discoveryIdParam && problemIdParam) {
          await supabase.from("discovery_actions").insert([
            {
              user_id: userId,
              discovery_id: discoveryIdParam,
              problem_id: problemIdParam,
              action_type: "converted_to_scan",
              problem_title: finalMarket || cleanMarket || null,
              affected_niches: cleanAudience || null,
              suggested_solutions: cleanEvidence.slice(0, 1000),
            },
          ]);
      }

      if (discoveryIdParam && problemIdParam) {
        const response = await fetch("/api/problem-intelligence/conversion", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            discoveryId: discoveryIdParam,
            problemId: problemIdParam,
            problemTitle: problemTitleParam || finalMarket || cleanMarket,
          }),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => null);
          console.error("Problem intelligence conversion update error:", result);
        }
      }

      if (!isAdmin && userProfile) {
        const newScansUsed = userProfile.scans_used + 1;
  
        const { error: profileUpdateError } = await supabase
          .from("user_profiles")
          .update({
            scans_used: newScansUsed,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
  
        if (profileUpdateError) {
          console.error("Profile scan usage update error:", profileUpdateError);
        } else {
          setUserProfile({
            ...userProfile,
            scans_used: newScansUsed,
          });
        }
      }
  
      setLoadingStep("completed");
  
      router.push("/results");
    } catch (error) {
      console.error(error);
      if (acceptedScanId) {
        await failAcceptedScan(acceptedScanId, "unexpected_exception");
      }
      setMessage(acceptedScanId ? SAFE_SCAN_FAILURE_MESSAGE : "Something went wrong generating your opportunities.");
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

            {isAdmin ? (
              <div className="inline-flex shrink-0 items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-violet-200">
                Admin · Unlimited scans
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
