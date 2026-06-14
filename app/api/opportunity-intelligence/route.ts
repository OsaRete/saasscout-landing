import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

function getConfidenceLabel(score: number) {
  if (score >= 85) return "Very High";
  if (score >= 70) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

function getRecommendation(founderFit: number, intelligence: number) {
  if (founderFit >= 75 && intelligence >= 75) return "Build Now";
  if (founderFit >= 60 && intelligence >= 60) return "Validate";
  return "Watchlist";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const userId = body?.userId;
    const opportunityId = body?.opportunityId;

    if (!userId || !opportunityId) {
      return NextResponse.json(
        { success: false, error: "userId and opportunityId are required." },
        { status: 400 }
      );
    }

    const { data: opportunity, error: opportunityError } = await supabaseAdmin
      .from("opportunities")
      .select(
        "id, user_id, source_problem_title, source_problem_id, source_discovery_id, title, problem_summary"
      )
      .eq("id", opportunityId)
      .eq("user_id", userId)
      .maybeSingle();

    if (opportunityError) throw opportunityError;

    if (!opportunity) {
      return NextResponse.json(
        { success: false, error: "Opportunity not found." },
        { status: 404 }
      );
    }

    const sourceProblemTitle =
      opportunity.source_problem_title ||
      body?.problemTitle ||
      opportunity.problem_summary ||
      opportunity.title;

    const sourceProblemId = opportunity.source_problem_id || body?.problemId;

    const { data: intelligence, error: intelligenceError } =
      await supabaseAdmin
        .from("problem_intelligence")
        .select("*")
        .eq("problem_title", sourceProblemTitle)
        .maybeSingle();

    if (intelligenceError) throw intelligenceError;

    let founderFitScore = 0;

    if (sourceProblemId) {
      const { data: founderMatch, error: founderMatchError } =
        await supabaseAdmin
          .from("founder_problem_matches")
          .select("*")
          .eq("user_id", userId)
          .eq("problem_id", sourceProblemId)
          .maybeSingle();

      if (founderMatchError) throw founderMatchError;

      founderFitScore = Number(founderMatch?.founder_fit_score || 0);
    }

    const intelligenceScore = Number(intelligence?.intelligence_score || 0);
    const preparedCount = Number(intelligence?.prepared_count || 0);
    const convertedCount = Number(intelligence?.converted_count || 0);

    const confidenceLabel = getConfidenceLabel(intelligenceScore);
    const recommendation = getRecommendation(
      founderFitScore,
      intelligenceScore
    );

    const { data: savedIntelligence, error } = await supabaseAdmin
      .from("opportunity_intelligence")
      .upsert(
        {
          opportunity_id: opportunityId,
          user_id: userId,
          founder_fit_score: founderFitScore,
          intelligence_score: intelligenceScore,
          prepared_count: preparedCount,
          converted_count: convertedCount,
          confidence_label: confidenceLabel,
          recommendation,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "opportunity_id,user_id",
        }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      intelligence: savedIntelligence,
    });
  } catch (error) {
    console.error("Opportunity intelligence error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not calculate opportunity intelligence.",
      },
      { status: 500 }
    );
  }
}