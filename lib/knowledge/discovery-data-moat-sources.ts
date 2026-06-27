import { createClient } from "@supabase/supabase-js";

export type DiscoverySource = {
  title: string;
  url: string | null;
  snippet: string | null;
  source_type: "google_search" | "x" | "data_moat";
  source_rank: number;
  signal_score?: number;
  category?: string | null;
};

type SupabaseQueryResultBuilder = {
  order(column: string, options: { ascending: boolean }): SupabaseQueryResultBuilder;
  limit(count: number): PromiseLike<{ data: Record<string, unknown>[] | null }>;
};

type SupabaseTableBuilder = {
  select(columns: string): SupabaseQueryResultBuilder;
};

type SupabaseDiscoverySourcesClient = {
  from(table: string): SupabaseTableBuilder;
};

function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );
}

export async function collectDataMoatSources(
  supabaseClient: SupabaseDiscoverySourcesClient = getSupabaseAdminClient()
) {
  const { data: intelligence } = await supabaseClient
    .from("problem_intelligence")
    .select("*")
    .order("intelligence_score", { ascending: false })
    .limit(15);

  const { data: weeklyProblems } = await supabaseClient
    .from("weekly_detected_problems")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(15);

  const { data: weeklySources } = await supabaseClient
    .from("weekly_sources")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const moatSources: DiscoverySource[] = [];

  for (const item of intelligence || []) {
    moatSources.push({
      title: `Data Moat Problem: ${item.problem_title}`,
      url: null,
      snippet: `Known problem. Intelligence score: ${item.intelligence_score}. Prepared: ${item.prepared_count}. Converted: ${item.converted_count}.`,
      source_type: "data_moat",
      source_rank: moatSources.length + 1,
      signal_score: Number(item.intelligence_score || 0),
      category: "Data Moat",
    });
  }

  for (const item of weeklyProblems || []) {
    moatSources.push({
      title: `Weekly Problem: ${item.problem_title}`,
      url: null,
      snippet: `${item.problem_summary || ""} Evidence: ${item.source_evidence || ""}`,
      source_type: "data_moat",
      source_rank: moatSources.length + 1,
      signal_score: Number(item.trend_score || 0) * 10,
      category: "Weekly Intelligence",
    });
  }

  for (const item of weeklySources || []) {
    moatSources.push({
      title: String(item.source_title || "Weekly Source"),
      url: item.source_url ? String(item.source_url) : null,
      snippet: item.source_snippet ? String(item.source_snippet) : null,
      source_type: "data_moat",
      source_rank: moatSources.length + 1,
      signal_score: Number(item.signal_score || 0),
      category: item.category ? String(item.category) : "Weekly Source",
    });
  }

  return moatSources.slice(0, 30);
}
