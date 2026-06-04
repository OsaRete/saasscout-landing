"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

type Scan = {
  id: string;
  created_at: string;
  market: string | null;
  audience: string | null;
  region: string | null;
  status: string;
};

type EvidenceAnalysis = {
  scan_id: string;
  inferred_market: string | null;
  confidence_score: number | null;
};

type Opportunity = {
  scan_id: string;
};

export default function ScansPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState<Scan[]>([]);
  const [analyses, setAnalyses] = useState<EvidenceAnalysis[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);

  useEffect(() => {
    async function loadScans() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: scansData } = await supabase
        .from("scan")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const scanIds = (scansData || []).map((scan) => scan.id);

      const { data: analysesData } = await supabase
        .from("evidence_analysis")
        .select("*")
        .in("scan_id", scanIds);

      const { data: opportunitiesData } = await supabase
        .from("opportunities")
        .select("scan_id")
        .in("scan_id", scanIds);

      setScans(scansData || []);
      setAnalyses(analysesData || []);
      setOpportunities(opportunitiesData || []);
      setLoading(false);
    }

    loadScans();
  }, [router]);

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getAnalysis(scanId: string) {
    return analyses.find((item) => item.scan_id === scanId);
  }

  function getOpportunityCount(scanId: string) {
    return opportunities.filter((item) => item.scan_id === scanId).length;
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        Loading scans...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">

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
            href="/scan"
            className="rounded-xl bg-violet-600 px-5 py-3 font-semibold"
          >
            New Scan
          </Link>
        </div>

        <div className="mt-14">
          <p className="text-sm uppercase tracking-widest text-violet-400">
            Scan History
          </p>

          <h1 className="mt-4 text-5xl font-bold">
            All your market scans
          </h1>

          <p className="mt-4 text-gray-400 max-w-2xl">
            Review every scan, evidence analysis and opportunity generation
            created inside SaaSScout.
          </p>
        </div>

        <div className="mt-10 space-y-5">
          {scans.map((scan) => {
            const analysis = getAnalysis(scan.id);

            return (
              <div
                key={scan.id}
                className="rounded-3xl border border-white/10 bg-[#0B1020] p-6"
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:justify-between">

                  <div>
                    <h2 className="text-2xl font-bold">
                      {scan.market ||
                        analysis?.inferred_market ||
                        "Evidence-based scan"}
                    </h2>

                    <p className="mt-2 text-sm text-gray-400">
                      {formatDate(scan.created_at)}
                    </p>
                  </div>

                  <div className="flex gap-4">

                    <div className="rounded-xl bg-white/[0.04] px-5 py-3">
                      <p className="text-xs text-gray-500">
                        Opportunities
                      </p>

                      <p className="text-xl font-bold">
                        {getOpportunityCount(scan.id)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white/[0.04] px-5 py-3">
                      <p className="text-xs text-gray-500">
                        Confidence
                      </p>

                      <p className="text-xl font-bold">
                        {analysis?.confidence_score || "-"}
                      </p>
                    </div>

                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">

                  <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-3 py-1 text-xs">
                    {scan.status}
                  </span>

                  {analysis && (
                    <span className="rounded-full bg-green-500/10 border border-green-500/20 px-3 py-1 text-xs">
                      Evidence Intelligence
                    </span>
                  )}
                </div>

                <div className="mt-6">
                  <Link
                    href="/results"
                    className="rounded-xl border border-white/10 px-5 py-3 inline-block hover:bg-white/5"
                  >
                    View Results
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </main>
  );
}