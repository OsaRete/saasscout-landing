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

type ProblemIntelligenceRecord = {
  id: string;
  intelligence_score?: number | string | null;
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

export async function updateProblemIntelligence(
  problem: ProblemIntelligenceInput,
  supabaseClient: SupabaseProblemIntelligenceClient = getSupabaseAdminClient()
) {
  const { data: existingProblem, error: fetchError } = await supabaseClient
    .from("problem_intelligence")
    .select("*")
    .eq("problem_title", problem.problem_title)
    .maybeSingle();

  if (fetchError) throw fetchError;

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
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingProblem.id);

  if (error) throw error;
}
