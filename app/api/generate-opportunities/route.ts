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

type WeeklyNiche = {
  niche: string;
  category: string;
  trend_score: number;
  pain_intensity: number;
  source_volume: number;
  repeated_problems: string;
  opportunity_angle: string;
  movement: string;
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

const TRENDING_NICHES = [
  "Fitness coaches",
  "Freelance designers",
  "Real estate agents",
  "Local restaurants",
  "Online tutors",
  "Indie SaaS founders",
  "Book authors",
  "Wedding planners",
  "Small marketing agencies",
  "E-commerce store owners",
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getWeekRange() {
  const now = new Date();

  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
  };
}

function cleanJsonResponse(content: string) {
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
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
    num: "5",
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

async function collectSignalsForNiche(niche: string) {
  const queries = [
    `${niche} problems`,
    `${niche} complaints`,
    `${niche} manual workflow`,
    `site:reddit.com ${niche} problem`,
  ];

  const results: SerpApiOrganicResult[] = [];

  for (const query of queries.slice(0, 2)) {
    const searchResults = await searchSerpApi(query);
    results.push(...searchResults);
  }

  const unique = new Map<string, SerpApiOrganicResult>();

  for (const result of results) {
    const url = result.link || result.title || "";

    if (!url) continue;

    if (!unique.has(url)) {
      unique.set(url, result);
    }
  }

  return Array.from(unique.values()).slice(0, 6);
}

async function analyzeWeeklySignals({
  weekStart,
  weekEnd,
  nicheSignals,
}: {
  weekStart: string;
  weekEnd: string;
  nicheSignals: {
    niche: string;
    sources: SerpApiOrganicResult[];
  }[];
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }

  const sourceText = nicheSignals
    .map((item) => {
      const sources = item.sources
        .map(
          (source, index) => `
Source ${index + 1}
Title: ${source.title || "Untitled"}
URL: ${source.link || "No URL"}
Snippet: ${source.snippet || "No snippet"}
`
        )
        .join("\n");

      return `
NICHE: ${item.niche}
SOURCES:
${sources}
`;
    })
    .join("\n\n");

  const prompt = `
You are SaaSScout, an AI market intelligence analyst.

Analyze the following weekly market signals collected from Google Search results.

Week start: ${weekStart}
Week end: ${weekEnd}

Collected signals:
${sourceText}

Generate a weekly market intelligence report with exactly 10 niches.

Rules:
- Focus on SaaS opportunities.
- Use the provided search signals as evidence.
- Rank niches by current market opportunity potential.
- Trend score must be 1 to 10.
- Pain intensity must be 1 to 10.
- Source volume should reflect how many useful signals were found for that niche.
- Repeated problems must be separated by " | ".
- Movement must be one of: "+ Rising", "Stable", "- Cooling".
- Keep output concise and practical.
- Return ONLY valid JSON.
- Do not include markdown.
- Do not include explanations outside JSON.

JSON format:
{
  "summary": "weekly summary",
  "strongest_trend": "niche name",
  "niches": [
    {
      "niche": "Fitness coaches",
      "category": "Service business",
      "trend_score": 8.8,
      "pain_intensity": 8.5,
      "source_volume": 12,
      "repeated_problems": "Problem 1 | Problem 2 | Problem 3",
      "opportunity_angle": "Specific SaaS opportunity angle.",
      "movement": "+ Rising"
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
          "You generate weekly SaaS market intelligence from external market signals. Always return valid JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.25,
    max_tokens: 2600,
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

function normalizeNiches(rawNiches: WeeklyNiche[]) {
  return rawNiches.slice(0, 10).map((item, index) => ({
    niche: item.niche || TRENDING_NICHES[index] || "Unknown niche",
    category: item.category || "Market segment",
    trend_score: Number(item.trend_score) || 7,
    pain_intensity: Number(item.pain_intensity) || 7,
    source_volume: Number(item.source_volume) || 0,
    repeated_problems:
      item.repeated_problems ||
      "Manual workflows | Fragmented tools | Time-consuming admin tasks",
    opportunity_angle:
      item.opportunity_angle ||
      `Build a SaaS tool that reduces repetitive work for ${
        item.niche || "this niche"
      }.`,
    movement: item.movement || "Stable",
  }));
}

async function saveGlobalWeeklyReport({
  weekStart,
  weekEnd,
  summary,
  strongestTrend,
  totalSourcesAnalyzed,
  averageTrendScore,
  averagePainIntensity,
  niches,
}: {
  weekStart: string;
  weekEnd: string;
  summary: string;
  strongestTrend: string | null;
  totalSourcesAnalyzed: number;
  averageTrendScore: number;
  averagePainIntensity: number;
  niches: ReturnType<typeof normalizeNiches>;
}) {
  const ownerId = process.env.WEEKLY_REPORT_OWNER_ID;

  if (!ownerId) {
    throw new Error("WEEKLY_REPORT_OWNER_ID is missing.");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  const { data: existingReport, error: existingError } = await supabaseAdmin
    .from("weekly_reports")
    .select("id")
    .eq("week_start", weekStart)
    .eq("week_end", weekEnd)
    .eq("is_global", true)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existingReport) {
    return {
      reportId: existingReport.id,
      alreadyExists: true,
    };
  }

  const { data: reportData, error: reportError } = await supabaseAdmin
    .from("weekly_reports")
    .insert([
      {
        user_id: ownerId,
        week_start: weekStart,
        week_end: weekEnd,
        summary,
        strongest_trend: strongestTrend,
        total_sources_analyzed: totalSourcesAnalyzed,
        average_trend_score: averageTrendScore,
        average_pain_intensity: averagePainIntensity,
        is_global: true,
      },
    ])
    .select()
    .single();

  if (reportError || !reportData) {
    throw reportError || new Error("Could not save weekly report.");
  }

  const nichesToInsert = niches.map((item) => ({
    weekly_report_id: reportData.id,
    user_id: ownerId,
    niche: item.niche,
    category: item.category,
    trend_score: item.trend_score,
    pain_intensity: item.pain_intensity,
    source_volume: item.source_volume,
    repeated_problems: item.repeated_problems,
    opportunity_angle: item.opportunity_angle,
    movement: item.movement,
    is_global: true,
  }));

  const { error: nichesError } = await supabaseAdmin
    .from("weekly_niches")
    .insert(nichesToInsert);

  if (nichesError) {
    throw nichesError;
  }

  return {
    reportId: reportData.id,
    alreadyExists: false,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const shouldSaveToDatabase = body?.saveToDatabase === true;

    const { weekStart, weekEnd } = getWeekRange();

    const nicheSignals = [];

    for (const niche of TRENDING_NICHES) {
      const sources = await collectSignalsForNiche(niche);

      nicheSignals.push({
        niche,
        sources,
      });
    }

    const analysis = await analyzeWeeklySignals({
      weekStart,
      weekEnd,
      nicheSignals,
    });

    const niches = normalizeNiches(analysis.niches || []);

    const averageTrendScore =
      niches.reduce((sum, item) => sum + Number(item.trend_score || 0), 0) /
      niches.length;

    const averagePainIntensity =
      niches.reduce((sum, item) => sum + Number(item.pain_intensity || 0), 0) /
      niches.length;

    const totalSourcesAnalyzed = nicheSignals.reduce(
      (sum, item) => sum + item.sources.length,
      0
    );

    const report = {
      week_start: weekStart,
      week_end: weekEnd,
      summary:
        analysis.summary ||
        "This week shows repeated demand for automation, workflow consolidation, and operational efficiency across service-based niches.",
      strongest_trend: analysis.strongest_trend || niches[0]?.niche || null,
      total_sources_analyzed: totalSourcesAnalyzed,
      average_trend_score: Number(averageTrendScore.toFixed(1)),
      average_pain_intensity: Number(averagePainIntensity.toFixed(1)),
      niches,
    };

    let databaseResult = null;

    if (shouldSaveToDatabase) {
      databaseResult = await saveGlobalWeeklyReport({
        weekStart,
        weekEnd,
        summary: report.summary,
        strongestTrend: report.strongest_trend,
        totalSourcesAnalyzed: report.total_sources_analyzed,
        averageTrendScore: report.average_trend_score,
        averagePainIntensity: report.average_pain_intensity,
        niches,
      });
    }

    return NextResponse.json({
      success: true,
      saved_to_database: shouldSaveToDatabase,
      database_result: databaseResult,
      report,
    });
  } catch (error) {
    console.error("Generate weekly report error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Could not generate weekly report.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}