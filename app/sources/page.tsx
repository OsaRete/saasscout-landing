"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../supabase";
import { Button, EmptyState, LoadingState } from "../../components/ui";

type Scan = {
  id: string;
  created_at: string;
  user_id: string;
  market: string | null;
  audience: string | null;
  region: string | null;
  status: string;
};

type ScanSource = {
  id: string;
  scan_id: string;
  user_id: string;
  source_type: string;
  source_name: string | null;
  title: string | null;
  url: string | null;
  snippet: string | null;
  raw_text: string | null;
  source_score: number | null;
  created_at: string;
};

function SourcesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");

  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState<Scan | null>(null);
  const [sources, setSources] = useState<ScanSource[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadSources() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      if (!scanId) {
        setLoading(false);
        return;
      }

      const { data: scanData, error: scanError } = await supabase
        .from("scan")
        .select("*")
        .eq("id", scanId)
        .eq("user_id", user.id)
        .single();

      if (scanError || !scanData) {
        console.error(scanError);
        setLoading(false);
        return;
      }

      const { data: sourcesData, error: sourcesError } = await supabase
        .from("scan_sources")
        .select("*")
        .eq("scan_id", scanId)
        .eq("user_id", user.id)
        .order("source_score", { ascending: false });

      if (sourcesError) {
        console.error(sourcesError);
      }

      setScan(scanData);
      setSources(sourcesData || []);
      setLoading(false);
    }

    loadSources();
  }, [router, scanId]);

  const filteredSources = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return sources;

    return sources.filter((source) =>
      [
        source.source_type,
        source.source_name,
        source.title,
        source.snippet,
        source.raw_text,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, sources]);

  const averageScore =
    sources.length > 0
      ? (
          sources.reduce(
            (sum, source) => sum + (Number(source.source_score) || 0),
            0
          ) / sources.length
        ).toFixed(1)
      : "0";

  const sourceTypes = Array.from(
    new Set(sources.map((source) => source.source_name || source.source_type))
  );

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <LoadingState title="Loading external sources" description="Retrieving source evidence for this scan." />
    );
  }

  if (!scanId || !scan) {
    return (
      <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
        <div className="mx-auto max-w-4xl">
          <EmptyState
            icon="!"
            title="Sources not found"
            description="This scan does not exist or you do not have access to it."
            primaryAction={<Button href="/results">Back to Results</Button>}
          />
        </div>
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
              href="/results"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
            >
              Results
            </Link>

            <Link
              href="/scan"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              New Scan
            </Link>
          </div>
        </div>

        <section className="mt-14 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] to-cyan-600/[0.08] p-8 shadow-2xl md:p-12">
          <p className="text-sm uppercase tracking-widest text-cyan-300">
            External Source Intelligence
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Sources used for this scan.
          </h1>

          <p className="mt-5 max-w-3xl text-gray-400">
            Review the external market signals SaaSScout collected to support
            this scan and generate opportunity insights.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-gray-300">
              Market: {scan.market || "Evidence-based scan"}
            </span>

            <span className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-gray-300">
              Created {formatDate(scan.created_at)}
            </span>

            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs text-cyan-200">
              {sources.length} sources
            </span>
          </div>
        </section>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Total sources</p>
            <h2 className="mt-3 text-4xl font-bold">{sources.length}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Average source score</p>
            <h2 className="mt-3 text-4xl font-bold">{averageScore}</h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-gray-400">Source types</p>
            <h2 className="mt-3 text-4xl font-bold">{sourceTypes.length}</h2>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">Collected sources</h2>
              <p className="mt-1 text-sm text-gray-500">
                Search by title, snippet, source name, or source type.
              </p>
            </div>

            <input
              type="text"
              placeholder="Search sources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-cyan-500 md:max-w-sm"
            />
          </div>

          {sourceTypes.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {sourceTypes.map((type) => (
                <span
                  key={type}
                  className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200"
                >
                  {type}
                </span>
              ))}
            </div>
          )}
        </div>

        <section className="mt-6">
          {sources.length === 0 ? (
            <EmptyState
              icon="◎"
              title="No external sources found"
              description="This scan did not collect external sources."
            />
          ) : filteredSources.length === 0 ? (
            <EmptyState
              icon="⌕"
              title="No matching sources"
              description="Try another search term to find collected source evidence."
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {filteredSources.map((source) => (
                <div
                  key={source.id}
                  className="rounded-3xl border border-white/10 bg-[#0B1020] p-6 shadow-2xl transition hover:border-cyan-500/30"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-cyan-300">
                        {source.source_name || source.source_type}
                      </p>

                      <h3 className="mt-3 text-2xl font-bold">
                        {source.title || "Untitled source"}
                      </h3>
                    </div>

                    <div className="shrink-0 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center">
                      <p className="text-2xl font-bold">
                        {source.source_score || "-"}
                      </p>
                      <p className="text-xs text-gray-400">score</p>
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-relaxed text-gray-400">
                    {source.snippet ||
                      source.raw_text ||
                      "No source text available."}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-300">
                      {source.source_type}
                    </span>

                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
                      >
                        Open source
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function SourcesPage() {
  return (
    <Suspense
      fallback={
        <LoadingState title="Loading external sources" description="Preparing source intelligence." />
      }
    >
      <SourcesContent />
    </Suspense>
  );
}