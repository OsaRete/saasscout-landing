import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type SerpApiOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  source?: string;
  position?: number;
};

type DiscoveredProblem = {
  problem_title: string;
  problem_summary: string;
  affected_niches: string;
  suggested_solutions: string;
  pain_score: number;
  revenue_score: number;
  urgency_score: number;
  build_difficulty: string;
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISCOVERY_QUERIES = [
  `"too much manual work" business`,
  `"using spreadsheets to manage" business`,
  `"looking for software to manage"`,
  `"need a better way to manage clients"`,
  `"manual workflow" small business`,
  `"no good tool for" business`,
  `"time consuming process" business owners`,
  `"struggling to manage" clients`,
];

function cleanJsonResponse(content: string) {
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
}

async function searchSerpApi(query: string, resultsPerQuery: number) {
  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is missing.");
  }

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    num: String(resultsPerQuery),
  });

  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "SerpApi request failed.");
  }

  return (data.organic_results || []) as SerpApiOrganicResult[];
}

function normalizeProblems(rawProblems: DiscoveredProblem[]) {
  return rawProblems.slice(0, 8).map((item, index) => ({
    problem_title: item.problem_title || `Market Problem ${index + 1}`,
    problem_summary:
      item.problem_summary ||
      "A repeated market problem was detected from external signals.",
    affected_niches:
      item.affected_niches ||
      "Small businesses | Solo founders | Service providers",
    suggested_solutions:
      item.suggested_solutions ||
      "Build a focused SaaS tool that reduces manual work and centralizes the workflow.",
    pain_score: Number(item.pain_score) || 7,
    revenue_score: Number(item.revenue_score) || 7,
    urgency_score: Number(item.urgency_score) || 7,
    build_difficulty: item.build_difficulty || "Medium",
    source_evidence:
      item.source_evidence ||
      "External signals suggest repeated workflow frustration.",
  }));
}

async function analyzeMarketSignals({
  sources,
}: {
  sources: SerpApiOrganicResult[];
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing.");
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
You are SaaSScout, an AI market opportunity discovery analyst.

Your job is NOT to generate random SaaS ideas.

Your job is to analyze external market signals, detect repeated monetizable problems, identify affected niches, and suggest SaaS solutions.

External market signals:
${sourceText}

Generate between 5 and 8 discovered market problems.

Rules:
- Start from problems, not from predefined niches.
- Each problem must have monetization potential.
- Each problem must include affected niches.
- Each problem must include possible SaaS solutions.
- Pain score must be 1 to 10.
- Revenue score must be 1 to 10.
- Urgency score must be 1 to 10.
- Build difficulty must be one of: Easy, Medium, Hard.
- Source evidence must summarize why this problem was detected.
- Return ONLY valid JSON.
- Do not include markdown.
- Do not include explanations outside JSON.

JSON format:
{
  "summary": "Short summary of the market discovery analysis.",
  "problems": [
    {
      "problem_title": "Manual client follow-up is causing lost revenue",
      "problem_summary": "Many service businesses struggle to track leads, clients, and follow-ups across spreadsheets, email, and chat tools.",
      "affected_niches": "Fitness coaches | Marketing agencies | Consultants | Real estate agents",
      "suggested_solutions": "Client follow-up CRM | Automated reminder system | Lightweight client pipeline tool",
      "pain_score": 9,
      "revenue_score": 8.5,
      "urgency_score": 8,
      "build_difficulty": "Medium",
      "source_evidence": "Multiple external signals mention manual tracking, spreadsheets, missed follow-ups, and client management frustration."
    }
  ]
}
`;

  const completion = await openrouter.chat.completions.create({
    model: "openai/gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You detect monetizable business problems from external market signals. Always return valid JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 2800,
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No AI response generated.");
  }

  try {
    return JSON.parse(cleanJsonResponse(content));
  } catch {
    console.error("Raw discovery AI response:", content);
    throw new Error("AI response was not valid JSON.");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const userId = String(body.userId || "").trim();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required." },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "User profile not found." },
        { status: 404 }
      );
    }

    const sourcesLimit = Number(profile.external_sources_limit) || 10;
    const resultsPerQuery = Math.max(
      2,
      Math.ceil(sourcesLimit / DISCOVERY_QUERIES.length)
    );

    const collectedSources: SerpApiOrganicResult[] = [];

    for (const query of DISCOVERY_QUERIES) {
      if (collectedSources.length >= sourcesLimit) break;

      const results = await searchSerpApi(query, resultsPerQuery);
      collectedSources.push(...results);
    }

    const uniqueSourcesMap = new Map<string, SerpApiOrganicResult>();

    for (const source of collectedSources) {
      const key = source.link || source.title || "";

      if (!key) continue;

      if (!uniqueSourcesMap.has(key)) {
        uniqueSourcesMap.set(key, source);
      }
    }

    const uniqueSources = Array.from(uniqueSourcesMap.values()).slice(
      0,
      sourcesLimit
    );

    const analysis = await analyzeMarketSignals({
      sources: uniqueSources,
    });

    const problems = normalizeProblems(analysis.problems || []);

    const { data: discoveryData, error: discoveryError } = await supabaseAdmin
      .from("opportunity_discoveries")
      .insert([
        {
          user_id: userId,
          plan: profile.plan || "free",
          sources_limit: sourcesLimit,
          total_sources_analyzed: uniqueSources.length,
          summary:
            analysis.summary ||
            "SaaSScout detected monetizable problems from external market signals.",
          status: "completed",
        },
      ])
      .select()
      .single();

    if (discoveryError || !discoveryData) {
      throw discoveryError || new Error("Could not save discovery.");
    }

    const problemsToInsert = problems.map((problem) => ({
      discovery_id: discoveryData.id,
      user_id: userId,
      problem_title: problem.problem_title,
      problem_summary: problem.problem_summary,
      affected_niches: problem.affected_niches,
      suggested_solutions: problem.suggested_solutions,
      pain_score: problem.pain_score,
      revenue_score: problem.revenue_score,
      urgency_score: problem.urgency_score,
      build_difficulty: problem.build_difficulty,
      source_evidence: problem.source_evidence,
    }));

    const { data: insertedProblems, error: problemsError } =
      await supabaseAdmin
        .from("discovered_problems")
        .insert(problemsToInsert)
        .select();

    if (problemsError) {
      throw problemsError;
    }

    return NextResponse.json({
      success: true,
      discovery: discoveryData,
      problems: insertedProblems || [],
    });
  } catch (error) {
    console.error("Discover opportunities error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Could not discover opportunities.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}