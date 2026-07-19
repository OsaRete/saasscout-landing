import { NextResponse } from "next/server";
import { AuthError, requireUser } from "../../_utils/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversionBody = {
  discoveryId?: unknown;
  problemId?: unknown;
  problemTitle?: unknown;
};

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function calculateIntelligenceScore(problem: {
  avg_pain_score?: number | string | null;
  avg_revenue_score?: number | string | null;
  avg_urgency_score?: number | string | null;
  prepared_count?: number | string | null;
}, convertedCount: number) {
  return Number(
    (
      (Number(problem.avg_pain_score || 0) * 0.35 +
        Number(problem.avg_revenue_score || 0) * 0.35 +
        Number(problem.avg_urgency_score || 0) * 0.2 +
        Math.min(Number(problem.prepared_count || 0), 20) * 0.1 +
        Math.min(convertedCount, 20) * 0.25) *
      10
    ).toFixed(1)
  );
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json()) as ConversionBody;
    const discoveryId = getString(body.discoveryId);
    const problemId = getString(body.problemId);
    const fallbackProblemTitle = getString(body.problemTitle);

    if (!discoveryId || !problemId) {
      return NextResponse.json(
        { success: false, error: "discoveryId and problemId are required." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: discoveredProblem, error: discoveredProblemError } = await supabase
      .from("discovered_problems")
      .select("id, discovery_id, problem_title")
      .eq("id", problemId)
      .eq("discovery_id", discoveryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (discoveredProblemError) throw discoveredProblemError;

    if (!discoveredProblem) {
      return NextResponse.json(
        { success: false, error: "Discovered problem not found." },
        { status: 404 }
      );
    }

    const problemTitle = discoveredProblem.problem_title || fallbackProblemTitle;

    if (!problemTitle) {
      return NextResponse.json(
        { success: false, error: "Problem title is required." },
        { status: 400 }
      );
    }

    const { data: existingProblem, error: existingProblemError } = await supabase
      .from("problem_intelligence")
      .select("id, converted_count, prepared_count, avg_pain_score, avg_revenue_score, avg_urgency_score")
      .eq("problem_title", problemTitle)
      .maybeSingle();

    if (existingProblemError) throw existingProblemError;

    if (!existingProblem) {
      return NextResponse.json({ success: true, updated: false });
    }

    const convertedCount = Number(existingProblem.converted_count || 0) + 1;
    const intelligenceScore = calculateIntelligenceScore(existingProblem, convertedCount);

    const { error: updateError } = await supabase
      .from("problem_intelligence")
      .update({
        converted_count: convertedCount,
        intelligence_score: intelligenceScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingProblem.id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, updated: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    console.error("Problem intelligence conversion error:", error);
    return NextResponse.json(
      { success: false, error: "Could not update problem intelligence conversion." },
      { status: 500 }
    );
  }
}
