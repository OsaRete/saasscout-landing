"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadScans() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: scansData, error: scansError } = await supabase
        .from("scan")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (scansError) {
        console.error(scansError);
        setLoading(false);
        return;
      }

      const scanIds = (scansData || []).map((scan) => scan.id);

      let analysesData: EvidenceAnalysis[] = [];
      let opportunitiesData: Opportunity[] = [];

      if (scanIds.length > 0) {
        const { data: analysisRows, error: analysisError } = await supabase
          .from("evidence_analysis")
          .select("scan_id, inferred_market, confidence_score")
          .in("scan_id", scanIds);

        if (analysisError) console.error(analysisError);
        analysesData = analysisRows || [];

        const { data: opportunityRows, error: opportunityError } =
          await supabase
            .from("opportunities")
            .select("scan_id")
            .in("scan_id", scanIds);

        if (opportunityError) console.error(opportunityError);
        opportunitiesData = opportunityRows || [];
      }

      setScans(scansData || []);
      setAnalyses(analysesData);
      setOpportunities(opportunitiesData);
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

  const completedScans = scans.filter(
    (scan) => scan.status === "completed"
  ).length;

  const scansWithEvidence = analyses.length;

  const filteredScans = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return scans;

    return scans.filter((scan) => {
      const analysis = getAnalysis(scan.id);

      return [
        scan.market,
        scan.audience,
        scan.region,
        scan.status,
        analysis?.inferred_market,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, scans, analyses]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <p className="text-gray-400">Loading scan history...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
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
              href="/dashboard"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
            >
              Dashboard
            </Link>

            <Link
              href="/scan"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 hover:bg-violet-500"
            >
              New Scan
            </Link>
          </div>
        </div>

        <section className="mt-14 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] to-violet-600/[0.08] p-8 shadow-2xl">
          <p className="text-sm uppercase tracking-widest text-violet-300">
            Scan History
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Your market intelligence library.
          </h1>

          <p className="mt-5 max-w-3xl text-gray-400">
            Review every market scan, evidence analysis, and opportunity set
            generated inside SaaSScout.
          </p>
        </section>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Total scans</p>
            <h2 className="mt-3 text-4xl font-bold">{scans.length}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Completed scans</p>
            <h2 className="mt-3 text-4xl font-bold">{completedScans}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Evidence analyses</p>
            <h2 className="mt-3 text-4xl font-bold">{scansWithEvidence}</h2>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#0B1020] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">All scans</h2>
            <p className="mt-1 text-sm text-gray-500">
              Search by market, audience, region, status, or detected market.
            </p>
          </div>

          <input
            type="text"
            placeholder="Search scans..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-500 md:max-w-sm"
          />
        </div>

        <section className="mt-6">
          {filteredScans.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#0B1020] p-10 text-center">
              <h2 className="text-2xl font-bold">No scans found</h2>

              <p className="mt-3 text-gray-400">
                Create a new scan or adjust your search.
              </p>

              <Link
                href="/scan"
                className="mt-6 inline-block rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white hover:bg-violet-500"
              >
                New Market Scan
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              {filteredScans.map((scan) => {
                const analysis = getAnalysis(scan.id);
                const opportunityCount = getOpportunityCount(scan.id);
                const title =
                  scan.market ||
                  analysis?.inferred_market ||
                  "Evidence-based scan";

                return (
                  <div
                    key={scan.id}
                    className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 shadow-2xl transition hover:border-violet-500/30"
                  >
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium capitalize text-violet-200">
                            {scan.status}
                          </span>

                          {analysis && (
                            <span className="rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-200">
                              Evidence Intelligence
                            </span>
                          )}
                        </div>

                        <h3 className="mt-4 text-2xl font-bold">{title}</h3>

                        <p className="mt-2 text-sm text-gray-400">
                          Created on {formatDate(scan.created_at)}
                        </p>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-white/[0.04] p-4">
                            <p className="text-xs text-gray-500">Audience</p>
                            <p className="mt-2 text-sm text-gray-200">
                              {scan.audience || "Not specified"}
                            </p>
                          </div>

                          <div className="rounded-2xl bg-white/[0.04] p-4">
                            <p className="text-xs text-gray-500">Region</p>
                            <p className="mt-2 text-sm text-gray-200">
                              {scan.region || "Global"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
                          <p className="text-2xl font-bold">
                            {opportunityCount}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            opportunities
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center">
                          <p className="text-2xl font-bold">
                            {analysis?.confidence_score || "-"}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            confidence
                          </p>
                        </div>

                        <Link
                          href="/results"
                          className="col-span-2 rounded-xl bg-violet-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-violet-500"
                        >
                          View Results
                        </Link>
                      </div>
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