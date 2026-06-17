import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SerpApiOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
};

type WeeklyDetectedProblem = {
  problem_title: string;
  problem_summary: string;
  affected_niches: string;
  suggested_solutions: string;
  pain_score: number;
  revenue_score: number;
  urgency_score: number;
  trend_score: number;
  monetization_angle: string;
  source_evidence: string;
};

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://trysaasscout.com",
    "X-Title": "SaaSScout",
  },
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const MARKET_SIGNAL_QUERIES = [
  "small business problems software should solve",
  "manual workflow complaints entrepreneurs",
  "reddit freelancers problems tools",
  "reddit agencies workflow problems",
  "reddit ecommerce store owners problems",
];

function cleanJsonResponse(content: string) {
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function searchSerpApi(query: string) {
  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is missing.");
  }

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    num: "4",
  });

  const response = await fetchWithTimeout(
    `https://serpapi.com/search.json?${params}`,
    12000
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "SerpApi request failed.");
  }

  return (data.organic_results || []) as SerpApiOrganicResult[];
}

async function collectWeeklySignals() {
  const settledResults = await Promise.allSettled(
    MARKET_SIGNAL_QUERIES.map((query) => searchSerpApi(query))
  );

  const allResults: SerpApiOrganicResult[] = [];

  for (const result of settledResults) {
    if (result.status === "fulfilled") {
      allResults.push(...result.value);
    } else {
      console.error("SerpApi query failed:", result.reason);
    }
  }

  const unique = new Map<string, SerpApiOrganicResult>();

  for (const result of allResults) {
    const key = result.link || result.title || "";
    if (!key) continue;

    if (!unique.has(key)) {
      unique.set(key, result);
    }
  }

  return Array.from(unique.values()).slice(0, 20);
}

async function analyzeWeeklySignals(sources: SerpApiOrganicResult[]) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }

  if (sources.length === 0) {
    throw new Error("No external sources were collected.");
  }

  const sourceText = sources
    .map(
      (source, index) => `
Source ${index + 1}
Title: ${source.title || "Untitled"}
URL: ${source.link || "No URL"}
Snippet: ${source.snippet || "No snippet"}
`
    )
    .join("\n");

  const prompt = `
You are SaaSScout, an AI market intelligence analyst.

Analyze these external market signals and detect monetizable SaaS problems.

Sources:
${sourceText}

Return 5 detected problems.

Rules:
- Focus on real problems, not generic niches.
- Identify affected niches.
- Suggest SaaS solutions that could be monetized.
- Score pain, revenue, urgency, and trend from 1 to 10.
- affected_niches must be separated by " | ".
- suggested_solutions must be separated by " | ".
- Use source evidence from the provided signals.
- Return ONLY valid JSON.

JSON format:
{
  "summary": "Short weekly summary.",
  "problems": [
    {
      "problem_title": "Short problem title",
      "problem_summary": "Problem explanation.",
      "affected_niches": "Niche 1 | Niche 2",
      "suggested_solutions": "Solution 1 | Solution 2",
      "pain_score": 8,
      "revenue_score": 8,
      "urgency_score": 7,
      "trend_score": 8,
      "monetization_angle": "How this could make money.",
      "source_evidence": "Short evidence summary."
    }
  ]
}
`;

  const completion = await openrouter.chat.completions.create({
    model: "openai/gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: "Return valid JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.2,
    max_tokens: 2200,
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No AI response generated.");
  }

  try {
    return JSON.parse(cleanJsonResponse(content));
  } catch {
    console.error("Raw weekly AI response:", content);
    throw new Error("AI response was not valid JSON.");
  }
}

function normalizeProblems(rawProblems: WeeklyDetectedProblem[]) {
  return rawProblems.slice(0, 5).map((problem) => ({
    problem_title: problem.problem_title || "Untitled problem",
    problem_summary:
      problem.problem_summary ||
      "A market problem was detected from external signals.",
    affected_niches:
      problem.affected_niches || "Small businesses | Solo founders",
    suggested_solutions:
      problem.suggested_solutions || "Workflow automation tool | AI assistant",
    pain_score: Number(problem.pain_score) || 7,
    revenue_score: Number(problem.revenue_score) || 7,
    urgency_score: Number(problem.urgency_score) || 7,
    trend_score: Number(problem.trend_score) || 7,
    monetization_angle:
      problem.monetization_angle ||
      "Monthly subscription for solving a recurring workflow problem.",
    source_evidence:
      problem.source_evidence ||
      "External sources show repeated workflow friction.",
  }));
}

function calculateIntelligenceScore(problem: WeeklyDetectedProblem) {
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

async function saveWeeklySources({
  runId,
  sources,
}: {
  runId: string;
  sources: SerpApiOrganicResult[];
}) {
  if (sources.length === 0) return;

  const rows = sources.map((source, index) => ({
    run_id: runId,
    source_title: source.title || "Untitled source",
    source_url: source.link || null,
    source_snippet: source.snippet || null,
    source_type: "google_search",
    source_rank: source.position || index + 1,
  }));

  const { error } = await supabaseAdmin.from("weekly_sources").insert(rows);

  if (error) {
    throw error;
  }
}

async function updateProblemIntelligence(problem: WeeklyDetectedProblem) {
  const { data: existingProblem, error: fetchError } = await supabaseAdmin
    .from("problem_intelligence")
    .select("*")
    .eq("problem_title", problem.problem_title)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  const intelligenceScore = calculateIntelligenceScore(problem);

  if (!existingProblem) {
    const { error } = await supabaseAdmin.from("problem_intelligence").insert([
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

    if (error) {
      throw error;
    }

    return;
  }

  const updatedScore = Number(
    (
      (Number(existingProblem.intelligence_score || 0) + intelligenceScore) /
      2
    ).toFixed(1)
  );

  const { error } = await supabaseAdmin
    .from("problem_intelligence")
    .update({
      avg_pain_score: Number(problem.pain_score || 0),
      avg_revenue_score: Number(problem.revenue_score || 0),
      avg_urgency_score: Number(problem.urgency_score || 0),
      intelligence_score: updatedScore,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingProblem.id);

  if (error) {
    throw error;
  }
}

export async function POST() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
    }

    const sources = await collectWeeklySignals();
    const analysis = await analyzeWeeklySignals(sources);
    const problems = normalizeProblems(analysis.problems || []);

    const { data: runData, error: runError } = await supabaseAdmin
      .from("weekly_intelligence_runs")
      .insert([
        {
          status: "completed",
          total_sources_analyzed: sources.length,
          summary:
            analysis.summary ||
            "SaaSScout detected weekly market problems from external sources.",
        },
      ])
      .select()
      .single();

    if (runError || !runData) {
      throw runError || new Error("Could not create weekly intelligence run.");
    }

    await saveWeeklySources({
      runId: runData.id,
      sources,
    });

    const problemRows = problems.map((problem) => ({
      run_id: runData.id,
      problem_title: problem.problem_title,
      problem_summary: problem.problem_summary,
      affected_niches: problem.affected_niches,
      suggested_solutions: problem.suggested_solutions,
      pain_score: problem.pain_score,
      revenue_score: problem.revenue_score,
      urgency_score: problem.urgency_score,
      trend_score: problem.trend_score,
      monetization_angle: problem.monetization_angle,
      source_evidence: problem.source_evidence,
    }));

    const { data: insertedProblems, error: problemsError } =
      await supabaseAdmin
        .from("weekly_detected_problems")
        .insert(problemRows)
        .select();

    if (problemsError) {
      throw problemsError;
    }

    for (const problem of problems) {
      await updateProblemIntelligence(problem);
    }

    return NextResponse.json({
      success: true,
      run: runData,
      sources_saved: sources.length,
      problems: insertedProblems || [],
    });
  } catch (error) {
    console.error("Weekly intelligence error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not generate weekly intelligence.",
      },
      { status: 500 }
    );
  }
}