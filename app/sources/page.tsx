"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../supabase";
import AppShell from "../../components/app-shell";
import {
  Badge,
  Button,
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  Panel,
  TextInput,
} from "../../components/ui";

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
      <AppShell active="/results">
        <div className="mx-auto max-w-4xl">
          <EmptyState
            icon="!"
            title="Sources not found"
            description="This scan does not exist or you do not have access to it."
            primaryAction={<Button href="/results">Back to Results</Button>}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="/results">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="External Source Intelligence"
          title="Sources used for this scan."
          description="Review the external market signals SaaSScout collected to support this scan and generate opportunity insights."
          actions={
            <>
              <Button href="/results" variant="secondary">Results</Button>
              <Button href="/scan">New Scan</Button>
            </>
          }
        />

        <div className="mt-6 flex flex-wrap gap-3">
          <Badge tone="neutral">Market: {scan.market || "Evidence-based scan"}</Badge>
          <Badge tone="neutral">Created {formatDate(scan.created_at)}</Badge>
          <Badge tone="cyan">{sources.length} sources</Badge>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <MetricCard label="Total sources" value={sources.length} tone="cyan" />
          <MetricCard label="Average source score" value={averageScore} tone="cyan" />
          <MetricCard label="Source types" value={sourceTypes.length} tone="violet" />
        </div>

        <Panel className="mt-8 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">Collected sources</h2>
              <p className="mt-1 text-sm text-gray-500">
                Search by title, snippet, source name, or source type.
              </p>
            </div>

            <TextInput
              type="text"
              placeholder="Search sources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:max-w-sm"
            />
          </div>

          {sourceTypes.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {sourceTypes.map((type) => (
                <Badge key={type} tone="cyan">{type}</Badge>
              ))}
            </div>
          )}
        </Panel>

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
                    <Badge tone="neutral">{source.source_type}</Badge>

                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050816]"
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
    </AppShell>
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
