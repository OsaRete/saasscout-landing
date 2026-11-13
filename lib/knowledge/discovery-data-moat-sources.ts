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
  eq(column: string, value: string): SupabaseQueryResultBuilder;
  order(column: string, options: { ascending: boolean }): SupabaseQueryResultBuilder;
  limit(count: number): PromiseLike<{ data: Record<string, unknown>[] | null; error?: unknown }>;
};

type SupabaseTableBuilder = {
  select(columns: string): SupabaseQueryResultBuilder;
};

type SupabaseDiscoverySourcesClient = {
  from(table: string): SupabaseTableBuilder;
};

function getSupabaseAdminClient(): SupabaseDiscoverySourcesClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ) as unknown as SupabaseDiscoverySourcesClient;
}

export async function collectDataMoatSources(
  userId: string,
  supabaseClient?: SupabaseDiscoverySourcesClient
) {
  // Identity comes from requireUser at the server route, never from request data.
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("Authenticated owner is required for Discovery context.");
  }
  supabaseClient ??= getSupabaseAdminClient();

  const { data: intelligence } = await supabaseClient
    .from("problem_intelligence")
    .select("*")
    .order("intelligence_score", { ascending: false })
    .limit(15);

  // Both child tables inherit ownership through run_id. The inner join excludes
  // foreign, ownerless and orphaned runs before ordering/limits are applied.
  const { data: weeklyProblems, error: weeklyProblemsError } = await supabaseClient
    .from("weekly_detected_problems")
    .select("*,weekly_intelligence_runs!inner(id,user_id)")
    .eq("weekly_intelligence_runs.user_id", userId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (weeklyProblemsError) throw new Error("Could not load authorized Weekly problems.");

  const { data: weeklySources, error: weeklySourcesError } = await supabaseClient
    .from("weekly_sources")
    .select("*,weekly_intelligence_runs!inner(id,user_id)")
    .eq("weekly_intelligence_runs.user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (weeklySourcesError) throw new Error("Could not load authorized Weekly sources.");

  function hasOwnedRun(item: Record<string, unknown>) {
    const run = item.weekly_intelligence_runs;
    return run !== null && typeof run === "object" && !Array.isArray(run)
      && "id" in run && "user_id" in run
      && typeof item.run_id === "string" && item.run_id === run.id
      && run.user_id === userId;
  }

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
    if (!hasOwnedRun(item)) continue;
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
    if (!hasOwnedRun(item)) continue;
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
