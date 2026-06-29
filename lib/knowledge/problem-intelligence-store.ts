import { createClient } from "@supabase/supabase-js";

export type ProblemIntelligenceInput = {
  problem_title: string;
  pain_score: number;
  revenue_score: number;
  urgency_score: number;
  buying_signal_score: number;
  frequency_score: number;
  source_quality_score: number;
  opportunity_score: number;
};

export type WeeklyProblemIntelligenceInput = {
  problem_title: string;
  pain_score: number;
  revenue_score: number;
  urgency_score: number;
  trend_score: number;
  buying_signal_score: number;
  frequency_score: number;
  source_quality_score: number;
  opportunity_score: number;
};

export type GeneratedWeeklyProblemIntelligenceInput = {
  problem_title: string;
  pain_score: number;
  revenue_score: number;
  urgency_score: number;
  trend_score: number;
};

type ProblemIntelligenceRecord = {
  id: string;
  intelligence_score?: number | string | null;
  avg_opportunity_score?: number | string | null;
};

type SupabaseMaybeSingleBuilder = {
  maybeSingle(): PromiseLike<{
    data: ProblemIntelligenceRecord | null;
    error: unknown;
  }>;
};

type SupabaseSelectBuilder = {
  eq(column: string, value: unknown): SupabaseMaybeSingleBuilder;
};

type SupabaseUpdateBuilder = {
  eq(column: string, value: unknown): PromiseLike<{ error: unknown }>;
};

type SupabaseTableBuilder = {
  select(columns: string): SupabaseSelectBuilder;
  insert(values: unknown[]): PromiseLike<{ error: unknown }>;
  update(values: Record<string, unknown>): SupabaseUpdateBuilder;
};

type SupabaseProblemIntelligenceClient = {
  from(table: string): SupabaseTableBuilder;
};

function getSupabaseAdminClient(): SupabaseProblemIntelligenceClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ) as unknown as SupabaseProblemIntelligenceClient;
}

function nowIso() {
  return new Date().toISOString();
}

function calculateGeneratedWeeklyIntelligenceScore(problem: GeneratedWeeklyProblemIntelligenceInput) {
  return Number(
    (
      (Number(problem.pain_score || 0) * 0.3 +
        Number(problem.revenue_score || 0) * 0.3 +
        Number(problem.urgency_score || 0) * 0.2 +
        Number(problem.trend_score || 0) * 0.2) *
      10
    ).toFixed(1)
  );
}

function calculateWeeklyIntelligenceScore(problem: WeeklyProblemIntelligenceInput) {
  return Number((Number(problem.opportunity_score || 0) * 10).toFixed(1));
}

async function findProblemByExactTitle(
  problemTitle: string,
  supabaseClient: SupabaseProblemIntelligenceClient
) {
  const { data: existingProblem, error: fetchError } = await supabaseClient
    .from("problem_intelligence")
    .select("*")
    .eq("problem_title", problemTitle)
    .maybeSingle();

  if (fetchError) throw fetchError;
  return existingProblem;
}

/**
 * Transitional Knowledge Layer write path for discovery Data Moat memory updates.
 *
 * This intentionally preserves exact-title matching and the legacy scoring semantics.
 * Future Knowledge Evolution work should replace this with canonical problem identity and
 * append-only observations; diagnostics must not influence persistence until that happens.
 */
export async function updateProblemIntelligence(
  problem: ProblemIntelligenceInput,
  supabaseClient: SupabaseProblemIntelligenceClient = getSupabaseAdminClient()
) {
  const existingProblem = await findProblemByExactTitle(problem.problem_title, supabaseClient);

  const intelligenceScore = Number(problem.opportunity_score || 70);

  if (!existingProblem) {
    const { error } = await supabaseClient.from("problem_intelligence").insert([
      {
        problem_title: problem.problem_title,
        prepared_count: 0,
        converted_count: 0,
        avg_pain_score: problem.pain_score,
        avg_revenue_score: problem.revenue_score,
        avg_urgency_score: problem.urgency_score,
        avg_buying_signal_score: problem.buying_signal_score,
        avg_frequency_score: problem.frequency_score,
        avg_source_quality_score: problem.source_quality_score,
        avg_opportunity_score: problem.opportunity_score,
        intelligence_score: intelligenceScore,
      },
    ]);

    if (error) throw error;
    return;
  }

  const updatedScore = Number(
    ((Number(existingProblem.intelligence_score || 0) + intelligenceScore) / 2).toFixed(1)
  );

  const { error } = await supabaseClient
    .from("problem_intelligence")
    .update({
      avg_pain_score: problem.pain_score,
      avg_revenue_score: problem.revenue_score,
      avg_urgency_score: problem.urgency_score,
      avg_buying_signal_score: problem.buying_signal_score,
      avg_frequency_score: problem.frequency_score,
      avg_source_quality_score: problem.source_quality_score,
      avg_opportunity_score: problem.opportunity_score,
      intelligence_score: updatedScore,
      updated_at: nowIso(),
    })
    .eq("id", existingProblem.id);

  if (error) throw error;
}

/**
 * Transitional Knowledge Layer write path for the enhanced weekly-intelligence route.
 *
 * Preserves the route's current exact-title lookup, last_seen_at writes, and opportunity
 * score averaging. This is not semantic deduplication and does not create canonical IDs.
 */
export async function updateWeeklyProblemIntelligence(
  problem: WeeklyProblemIntelligenceInput,
  supabaseClient: SupabaseProblemIntelligenceClient = getSupabaseAdminClient()
) {
  const existingProblem = await findProblemByExactTitle(problem.problem_title, supabaseClient);
  const intelligenceScore = calculateWeeklyIntelligenceScore(problem);
  const seenAt = nowIso();

  if (!existingProblem) {
    const { error } = await supabaseClient.from("problem_intelligence").insert([
      {
        problem_title: problem.problem_title,
        prepared_count: 0,
        converted_count: 0,
        avg_pain_score: Number(problem.pain_score || 0),
        avg_revenue_score: Number(problem.revenue_score || 0),
        avg_urgency_score: Number(problem.urgency_score || 0),
        avg_buying_signal_score: Number(problem.buying_signal_score || 0),
        avg_frequency_score: Number(problem.frequency_score || 0),
        avg_source_quality_score: Number(problem.source_quality_score || 0),
        avg_opportunity_score: Number(problem.opportunity_score || 0),
        intelligence_score: intelligenceScore,
        last_seen_at: seenAt,
      },
    ]);

    if (error) throw error;
    return;
  }

  const updatedOpportunityScore = Number(
    (
      (Number(existingProblem.avg_opportunity_score || 0) +
        Number(problem.opportunity_score || 0)) /
      2
    ).toFixed(1)
  );

  const { error } = await supabaseClient
    .from("problem_intelligence")
    .update({
      avg_pain_score: Number(problem.pain_score || 0),
      avg_revenue_score: Number(problem.revenue_score || 0),
      avg_urgency_score: Number(problem.urgency_score || 0),
      avg_buying_signal_score: Number(problem.buying_signal_score || 0),
      avg_frequency_score: Number(problem.frequency_score || 0),
      avg_source_quality_score: Number(problem.source_quality_score || 0),
      avg_opportunity_score: updatedOpportunityScore,
      intelligence_score: Number((updatedOpportunityScore * 10).toFixed(1)),
      updated_at: seenAt,
      last_seen_at: seenAt,
    })
    .eq("id", existingProblem.id);

  if (error) throw error;
}

/**
 * Transitional Knowledge Layer write path for the legacy generate-weekly-report route.
 *
 * Preserves its narrower column writes and weighted trend-aware intelligence score while
 * keeping exact-title matching until canonical Knowledge Evolution identity is introduced.
 */
export async function updateGeneratedWeeklyProblemIntelligence(
  problem: GeneratedWeeklyProblemIntelligenceInput,
  supabaseClient: SupabaseProblemIntelligenceClient = getSupabaseAdminClient()
) {
  const existingProblem = await findProblemByExactTitle(problem.problem_title, supabaseClient);
  const intelligenceScore = calculateGeneratedWeeklyIntelligenceScore(problem);

  if (!existingProblem) {
    const { error } = await supabaseClient.from("problem_intelligence").insert([
      {
        problem_title: problem.problem_title,
        prepared_count: 0,
        converted_count: 0,
        avg_pain_score: Number(problem.pain_score || 0),
        avg_revenue_score: Number(problem.revenue_score || 0),
        avg_urgency_score: Number(problem.urgency_score || 0),
        intelligence_score: intelligenceScore,
      },
    ]);

    if (error) throw error;
    return;
  }

  const { error } = await supabaseClient
    .from("problem_intelligence")
    .update({
      avg_pain_score: Number(problem.pain_score || 0),
      avg_revenue_score: Number(problem.revenue_score || 0),
      avg_urgency_score: Number(problem.urgency_score || 0),
      intelligence_score: Number(
        ((Number(existingProblem.intelligence_score || 0) + intelligenceScore) / 2).toFixed(1)
      ),
      updated_at: nowIso(),
    })
    .eq("id", existingProblem.id);

  if (error) throw error;
}
