// app/api/discover-opportunities/route.ts

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { AuthError, requireUser } from "../_utils/auth";
import {
  cleanJsonResponse,
  normalizeProblems,
} from "@/lib/intelligence/discovery-response-normalization";
import {
  collectDataMoatSources,
  type DiscoverySource,
} from "@/lib/knowledge/discovery-data-moat-sources";
import { updateProblemIntelligence } from "@/lib/knowledge/problem-intelligence-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Source = DiscoverySource;

type XTweet = {
  id: string;
  text?: string;
  lang?: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
};

type SerpApiOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
};

function getOpenRouterClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://trysaasscout.com",
      "X-Title": "SaaSScout",
    },
  });
}

function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );
}

const DISCOVERY_QUERIES = [
  `"too much manual work" business`,
  `"using spreadsheets to manage" business`,
  `"manual workflow" small business`,
  `"need a better way to manage clients"`,
  `"no good tool for" business`,
  `"wasting time" "google sheets" business`,
];

function getSignalScore(tweet: XTweet) {
  const metrics = tweet.public_metrics;

  return Number(
    (
      Number(metrics?.like_count || 0) * 1 +
      Number(metrics?.reply_count || 0) * 2 +
      Number(metrics?.bookmark_count || 0) * 2 +
      Number(metrics?.quote_count || 0) * 2 +
      Number(metrics?.impression_count || 0) * 0.01
    ).toFixed(2)
  );
}

function isUsefulTweet(tweet: XTweet) {
  const text = String(tweet.text || "").trim();
  const lower = text.toLowerCase();

  if (!text) return false;
  if (tweet.lang !== "en") return false;
  if (text.startsWith("RT @")) return false;
  if (text.length < 35) return false;

  const blocked = [
    "trump",
    "maga",
    "football",
    "anime",
    "drunk",
    "betting",
    "sportybet",
    "movie",
    "episode",
    "resort",
    "january 6",
  ];

  if (blocked.some((word) => lower.includes(word))) return false;

  const signals = [
    "business",
    "workflow",
    "manual work",
    "manual workflow",
    "spreadsheet",
    "google sheets",
    "clients",
    "operations",
    "agency",
    "freelance",
    "founder",
    "startup",
    "customer",
    "team",
    "process",
    "automation",
    "wasting time",
  ];

  return signals.some((word) => lower.includes(word));
}

function classifySourceCategory(text: string | null) {
  const value = String(text || "").toLowerCase();

  if (value.includes("client") || value.includes("lead") || value.includes("sales")) {
    return "Sales";
  }

  if (value.includes("content") || value.includes("marketing") || value.includes("caption")) {
    return "Marketing";
  }

  if (
    value.includes("spreadsheet") ||
    value.includes("google sheets") ||
    value.includes("workflow") ||
    value.includes("manual work") ||
    value.includes("operations")
  ) {
    return "Operations";
  }

  if (value.includes("agency") || value.includes("freelance")) {
    return "Agency/Freelancer";
  }

  if (value.includes("support") || value.includes("ticket") || value.includes("customer")) {
    return "Customer Support";
  }

  if (value.includes("ai") || value.includes("automation") || value.includes("agent")) {
    return "AI/Automation";
  }

  return "General";
}

async function searchSerpApi(query: string, resultsPerQuery: number) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("SERPAPI_API_KEY is missing.");

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

async function searchXSignals() {
  if (!process.env.X_BEARER_TOKEN) return [];

  const query =
    '("too much manual work" OR "manual workflow" OR "still using spreadsheets" OR "google sheets" OR "wasting time") ("business" OR "clients" OR "workflow" OR "operations" OR "agency" OR "freelance" OR "founder" OR "startup") -is:retweet lang:en';

  const params = new URLSearchParams({
    query,
    max_results: "20",
    "tweet.fields": "created_at,public_metrics,author_id,lang",
  });

  const response = await fetch(
    `https://api.x.com/2/tweets/search/recent?${params}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
      },
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("X API error:", data);
    return [];
  }

  return ((data?.data || []) as XTweet[])
    .filter(isUsefulTweet)
    .map((tweet) => ({
      tweet,
      signal_score: getSignalScore(tweet),
    }))
    .sort((a, b) => b.signal_score - a.signal_score)
    .slice(0, 8);
}

async function collectExternalSources(sourcesLimit: number) {
  const resultsPerQuery = Math.max(2, Math.ceil(sourcesLimit / DISCOVERY_QUERIES.length));

  const googleResults = await Promise.allSettled(
    DISCOVERY_QUERIES.map((query) => searchSerpApi(query, resultsPerQuery))
  );

  const sources: Source[] = [];

  for (const result of googleResults) {
    if (result.status === "fulfilled") {
      result.value.forEach((item) => {
        const text = `${item.title || ""} ${item.snippet || ""}`;

        sources.push({
          title: item.title || "Untitled Google result",
          url: item.link || null,
          snippet: item.snippet || null,
          source_type: "google_search",
          source_rank: item.position || sources.length + 1,
          signal_score: 0,
          category: classifySourceCategory(text),
        });
      });
    }
  }

  const xResults = await searchXSignals();

  xResults.forEach((item, index) => {
    const text = item.tweet.text || "";

    sources.push({
      title: `X Signal: ${text.slice(0, 90) || "Untitled tweet"}`,
      url: item.tweet.id ? `https://x.com/i/web/status/${item.tweet.id}` : null,
      snippet: text || null,
      source_type: "x",
      source_rank: index + 1,
      signal_score: item.signal_score,
      category: classifySourceCategory(text),
    });
  });

  const unique = new Map<string, Source>();

  for (const source of sources) {
    const key = source.url || source.title;
    if (!unique.has(key)) unique.set(key, source);
  }

  return Array.from(unique.values()).slice(0, sourcesLimit);
}


async function analyzeSignals({
  externalSources,
  moatSources,
}: {
  externalSources: Source[];
  moatSources: Source[];
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }

  const externalText = externalSources
    .map(
      (source, index) => `
External Source ${index + 1}
Type: ${source.source_type}
Category: ${source.category || "General"}
Title: ${source.title}
URL: ${source.url || "No URL"}
Snippet: ${source.snippet || "No snippet"}
Signal score: ${source.signal_score || 0}
`
    )
    .join("\n");

  const moatText = moatSources
    .map(
      (source, index) => `
Data Moat Source ${index + 1}
Category: ${source.category || "Data Moat"}
Title: ${source.title}
Snippet: ${source.snippet || "No snippet"}
Signal score: ${source.signal_score || 0}
`
    )
    .join("\n");

  const prompt = `
You are SaaSScout, an AI SaaS opportunity discovery engine.

You must analyze BOTH:
1. Fresh external market signals.
2. Existing internal data moat signals.

Fresh external signals:
${externalText}

Internal data moat:
${moatText}

Return 5 to 8 monetizable SaaS problems.

Rules:
- Prioritize problems supported by fresh external evidence.
- Use the data moat to strengthen, cluster, or validate problems.
- Do not invent generic SaaS ideas.
- Focus on repeated pain, manual work, spreadsheets, workflow friction, buying intent, and operational inefficiency.
- buying_signal_score means evidence that someone might pay.
- frequency_score means how repeated the problem appears.
- source_quality_score means how useful/concrete the sources are.
- opportunity_score must be 1 to 100.
- problem_cluster should be short, like "Client Operations", "Agency Workflow", "Spreadsheet Automation", "Sales Follow-up".
- affected_niches and suggested_solutions must use " | " separators.
- Return ONLY valid JSON.

JSON format:
{
  "summary": "Short summary.",
  "problems": [
    {
      "problem_title": "Short problem title",
      "problem_summary": "Problem explanation.",
      "affected_niches": "Niche 1 | Niche 2",
      "suggested_solutions": "Solution 1 | Solution 2",
      "pain_score": 8,
      "revenue_score": 8,
      "urgency_score": 7,
      "trend_score": 7,
      "buying_signal_score": 8,
      "frequency_score": 8,
      "source_quality_score": 8,
      "opportunity_score": 82,
      "problem_cluster": "Client Operations",
      "build_difficulty": "Medium",
      "source_evidence": "Evidence summary from external and internal signals."
    }
  ]
}
`;

  const completion = await getOpenRouterClient().chat.completions.create({
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
    temperature: 0.25,
    max_tokens: 3200,
  });

  const content = completion.choices[0]?.message?.content;

  if (!content) throw new Error("No AI response generated.");

  try {
    return JSON.parse(cleanJsonResponse(content));
  } catch {
    console.error("Raw discover AI response:", content);
    throw new Error("AI response was not valid JSON.");
  }
}


export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const userId = user.id;

    const { data: profile, error: profileError } = await getSupabaseAdminClient()
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "User profile not found." },
        { status: 404 }
      );
    }

    const sourcesLimit = Number(profile.external_sources_limit) || 10;

    const externalSources = await collectExternalSources(sourcesLimit);
    const moatSources = await collectDataMoatSources();

    const analysis = await analyzeSignals({
      externalSources,
      moatSources,
    });

    const problems = normalizeProblems(analysis.problems || []);

    const { data: discoveryData, error: discoveryError } = await getSupabaseAdminClient()
      .from("opportunity_discoveries")
      .insert([
        {
          user_id: userId,
          plan: profile.plan || "free",
          sources_limit: sourcesLimit,
          total_sources_analyzed: externalSources.length + moatSources.length,
          summary:
            analysis.summary ||
            "SaaSScout discovered opportunities from live external signals and the internal data moat.",
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
      trend_score: problem.trend_score,
      buying_signal_score: problem.buying_signal_score,
      frequency_score: problem.frequency_score,
      source_quality_score: problem.source_quality_score,
      opportunity_score: problem.opportunity_score,
      problem_cluster: problem.problem_cluster,
      build_difficulty: problem.build_difficulty,
      source_evidence: problem.source_evidence,
    }));

    const { data: insertedProblems, error: problemsError } = await getSupabaseAdminClient()
      .from("discovered_problems")
      .insert(problemsToInsert)
      .select();

    if (problemsError) throw problemsError;

    for (const problem of problems) {
      await updateProblemIntelligence(problem);
    }

    return NextResponse.json({
      success: true,
      discovery: discoveryData,
      problems: insertedProblems || [],
      external_sources_analyzed: externalSources.length,
      data_moat_sources_used: moatSources.length,
    });
  } catch (error) {
    console.error("Discover opportunities error:", error);

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not discover opportunities.",
      },
      { status: 500 }
    );
  }
}