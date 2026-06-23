import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );
}

type FounderProfile = {
  user_id: string;
  experience_level: string | null;
  technical_skills: string | null;
  budget_level: string | null;
  preferred_business_model: string | null;
  available_hours_per_week: number | null;
};

type DiscoveredProblem = {
  id: string;
  user_id: string;
  problem_title: string;
  problem_summary: string | null;
  affected_niches: string | null;
  suggested_solutions: string | null;
  pain_score: number | null;
  revenue_score: number | null;
  urgency_score: number | null;
  build_difficulty: string | null;
};

function normalize(value: string | null | undefined) {
  return String(value || "").toLowerCase().trim();
}

function calculateExperienceMatch(
  experienceLevel: string | null,
  buildDifficulty: string | null
) {
  const experience = normalize(experienceLevel);
  const difficulty = normalize(buildDifficulty);

  if (!difficulty || difficulty.includes("easy")) {
    if (experience.includes("beginner")) return 90;
    if (experience.includes("intermediate")) return 95;
    if (experience.includes("advanced")) return 100;
    return 85;
  }

  if (difficulty.includes("medium")) {
    if (experience.includes("beginner")) return 60;
    if (experience.includes("intermediate")) return 90;
    if (experience.includes("advanced")) return 100;
    return 70;
  }

  if (difficulty.includes("hard") || difficulty.includes("complex")) {
    if (experience.includes("beginner")) return 30;
    if (experience.includes("intermediate")) return 65;
    if (experience.includes("advanced")) return 95;
    return 45;
  }

  return 70;
}

function calculateSkillMatch(
  technicalSkills: string | null,
  problem: DiscoveredProblem
) {
  const skills = normalize(technicalSkills);

  const problemText = normalize(
    `${problem.problem_title} ${problem.problem_summary} ${problem.affected_niches} ${problem.suggested_solutions}`
  );

  if (!skills) return 40;

  let score = 45;

  const skillKeywords = skills
    .split(/[,|]/)
    .map((skill) => skill.trim())
    .filter(Boolean);

  for (const skill of skillKeywords) {
    if (problemText.includes(skill)) {
      score += 12;
    }
  }

  if (
    skills.includes("react") ||
    skills.includes("next") ||
    skills.includes("frontend")
  ) {
    score += 10;
  }

  if (
    skills.includes("automation") ||
    skills.includes("openai") ||
    skills.includes("ai") ||
    skills.includes("python")
  ) {
    score += 15;
  }

  if (
    problemText.includes("automation") &&
    (skills.includes("automation") || skills.includes("ai"))
  ) {
    score += 15;
  }

  if (
    problemText.includes("marketing") &&
    (skills.includes("marketing") || skills.includes("sales"))
  ) {
    score += 15;
  }

  if (
    problemText.includes("dashboard") &&
    (skills.includes("react") || skills.includes("next"))
  ) {
    score += 10;
  }

  return Math.min(100, score);
}

function calculateBudgetMatch(
  budgetLevel: string | null,
  buildDifficulty: string | null
) {
  const budget = normalize(budgetLevel);
  const difficulty = normalize(buildDifficulty);

  if (budget.includes("no") || budget.includes("low")) {
    if (difficulty.includes("easy")) return 95;
    if (difficulty.includes("medium")) return 70;
    if (difficulty.includes("hard")) return 35;
    return 75;
  }

  if (budget.includes("medium")) {
    if (difficulty.includes("easy")) return 100;
    if (difficulty.includes("medium")) return 90;
    if (difficulty.includes("hard")) return 65;
    return 85;
  }

  if (budget.includes("high")) {
    return 95;
  }

  return 70;
}

function calculateTimeMatch(
  availableHoursPerWeek: number | null,
  buildDifficulty: string | null
) {
  const hours = Number(availableHoursPerWeek || 0);
  const difficulty = normalize(buildDifficulty);

  if (hours >= 30) return 100;

  if (hours >= 15) {
    if (difficulty.includes("hard")) return 70;
    return 95;
  }

  if (hours >= 8) {
    if (difficulty.includes("easy")) return 90;
    if (difficulty.includes("medium")) return 70;
    if (difficulty.includes("hard")) return 40;
    return 70;
  }

  if (hours > 0) {
    if (difficulty.includes("easy")) return 70;
    if (difficulty.includes("medium")) return 45;
    if (difficulty.includes("hard")) return 25;
    return 50;
  }

  return 40;
}

function calculateFounderFit({
  profile,
  problem,
}: {
  profile: FounderProfile;
  problem: DiscoveredProblem;
}) {
  const experienceMatch = calculateExperienceMatch(
    profile.experience_level,
    problem.build_difficulty
  );

  const skillMatch = calculateSkillMatch(profile.technical_skills, problem);

  const budgetMatch = calculateBudgetMatch(
    profile.budget_level,
    problem.build_difficulty
  );

  const timeMatch = calculateTimeMatch(
    profile.available_hours_per_week,
    problem.build_difficulty
  );

  const founderFitScore = Number(
    (
      experienceMatch * 0.35 +
      skillMatch * 0.35 +
      budgetMatch * 0.15 +
      timeMatch * 0.15
    ).toFixed(1)
  );

  return {
    founder_fit_score: founderFitScore,
    experience_match: Number(experienceMatch.toFixed(1)),
    skill_match: Number(skillMatch.toFixed(1)),
    budget_match: Number(budgetMatch.toFixed(1)),
    time_match: Number(timeMatch.toFixed(1)),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const userId = body?.userId;
    const problemId = body?.problemId;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required." },
        { status: 400 }
      );
    }

    if (!problemId) {
      return NextResponse.json(
        { success: false, error: "problemId is required." },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
    }

    const { data: profile, error: profileError } = await getSupabaseAdminClient()
      .from("founder_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          error: "Founder profile not found. Create your profile first.",
        },
        { status: 404 }
      );
    }

    const { data: problem, error: problemError } = await getSupabaseAdminClient()
      .from("discovered_problems")
      .select("*")
      .eq("id", problemId)
      .maybeSingle();

    if (problemError) {
      throw problemError;
    }

    if (!problem) {
      return NextResponse.json(
        { success: false, error: "Problem not found." },
        { status: 404 }
      );
    }

    const match = calculateFounderFit({
      profile,
      problem,
    });

    const { data: savedMatch, error: matchError } = await getSupabaseAdminClient()
      .from("founder_problem_matches")
      .upsert(
        {
          user_id: userId,
          problem_id: problem.id,
          problem_title: problem.problem_title,
          founder_fit_score: match.founder_fit_score,
          experience_match: match.experience_match,
          skill_match: match.skill_match,
          budget_match: match.budget_match,
          time_match: match.time_match,
        },
        {
          onConflict: "user_id,problem_id",
        }
      )
      .select()
      .single();

    if (matchError) {
      throw matchError;
    }

    return NextResponse.json({
      success: true,
      match: savedMatch,
    });
  } catch (error) {
    console.error("Founder match error:", error);

    const message =
      error instanceof Error ? error.message : "Could not calculate match.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}