import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WeeklySource = {
  title: string;
  url: string | null;
  snippet: string | null;
  source_type: "google_search" | "x";
  source_rank: number;
  author_id?: string | null;
  like_count?: number;
  reply_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  impression_count?: number;
  signal_score?: number;
  category?: string | null;
  buying_signal_score?: number;
  frequency_score?: number;
  opportunity_score?: number;
  problem_cluster?: string | null;
  source_quality_score?: number;
};

type SerpApiOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
};

type XTweet = {
  id: string;
  text?: string;
  lang?: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
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

type ScoredProblem = WeeklyDetectedProblem & {
  buying_signal_score: number;
  frequency_score: number;
  opportunity_score: number;
  problem_cluster: string;
  source_quality_score: number;
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
];

function cleanJsonResponse(content: string) {
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
}

function clampScore(score: number) {
  return Number(Math.min(10, Math.max(0, score)).toFixed(1));
}

function classifySourceCategory(text: string | null) {
  const value = String(text || "").toLowerCase();

  if (value.includes("client") || value.includes("lead") || value.includes("follow-up") || value.includes("sales")) return "Sales";
  if (value.includes("content") || value.includes("social media") || value.includes("caption") || value.includes("marketing")) return "Marketing";
  if (value.includes("google sheets") || value.includes("spreadsheet") || value.includes("operations") || value.includes("workflow") || value.includes("manual work")) return "Operations";
  if (value.includes("agency") || value.includes("freelance") || value.includes("freelancer")) return "Agency/Freelancer";
  if (value.includes("ecommerce") || value.includes("shopify") || value.includes("store owner")) return "Ecommerce";
  if (value.includes("support") || value.includes("ticket") || value.includes("customer")) return "Customer Support";
  if (value.includes("ai") || value.includes("automation") || value.includes("agent") || value.includes("n8n")) return "AI/Automation";

  return "General";
}

function getProblemCluster(text: string | null) {
  const value = String(text || "").toLowerCase();

  if (value.includes("lead") || value.includes("follow-up") || value.includes("sales")) return "lead_management";
  if (value.includes("spreadsheet") || value.includes("google sheets") || value.includes("manual workflow")) return "spreadsheet_workflows";
  if (value.includes("content") || value.includes("caption") || value.includes("social media")) return "content_operations";
  if (value.includes("support") || value.includes("ticket") || value.includes("customer")) return "customer_support";
  if (value.includes("report") || value.includes("dashboard") || value.includes("analytics")) return "reporting_analytics";
  if (value.includes("automation") || value.includes("agent") || value.includes("ai")) return "ai_automation";

  return "general_workflow_pain";
}

function getBuyingSignalScore(text: string | null) {
  const value = String(text || "").toLowerCase();
  let score = 0;

  const strongSignals = [
    "would pay",
    "i'd pay",
    "happy to pay",
    "looking for a tool",
    "looking for software",
    "need a tool",
    "need software",
    "is there an app",
    "any recommendations",
    "recommend a tool",
  ];

  const mediumSignals = [
    "i need",
    "we need",
    "wish there was",
    "someone should build",
    "how do you manage",
    "what do you use",
    "anyone know",
  ];

  strongSignals.forEach((signal) => {
    if (value.includes(signal)) score += 4;
  });

  mediumSignals.forEach((signal) => {
    if (value.includes(signal)) score += 2;
  });

  return clampScore(score);
}

function getSourceQualityScore(source: WeeklySource) {
  const engagement = Number(source.signal_score || 0);
  const hasSnippet = source.snippet ? 1.5 : 0;
  const hasUrl = source.url ? 1 : 0;
  const isX = source.source_type === "x" ? 1 : 0;
  const buying = Number(source.buying_signal_score || 0) * 0.4;

  return clampScore(engagement * 0.25 + hasSnippet + hasUrl + isX + buying);
}

function getFrequencyScore(cluster: string, sources: WeeklySource[]) {
  const matches = sources.filter((source) => source.problem_cluster === cluster).length;
  return clampScore(matches * 2);
}

function getOpportunityScore({
  pain,
  revenue,
  urgency,
  trend,
  buying,
  frequency,
  sourceQuality,
}: {
  pain: number;
  revenue: number;
  urgency: number;
  trend: number;
  buying: number;
  frequency: number;
  sourceQuality: number;
}) {
  return Number(
    (
      pain * 0.25 +
      revenue * 0.2 +
      urgency * 0.15 +
      trend * 0.15 +
      buying * 0.1 +
      frequency * 0.1 +
      sourceQuality * 0.05
    ).toFixed(1)
  );
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
  if (!apiKey) throw new Error("SERPAPI_API_KEY is missing.");

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    num: "3",
  });

  const response = await fetchWithTimeout(`https://serpapi.com/search.json?${params}`, 12000);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "SerpApi request failed.");
  }

  return (data.organic_results || []) as SerpApiOrganicResult[];
}

function getSignalScore(tweet: XTweet) {
  const metrics = tweet.public_metrics;

  return (
    Number(metrics?.like_count || 0) * 1 +
    Number(metrics?.reply_count || 0) * 2 +
    Number(metrics?.bookmark_count || 0) * 2 +
    Number(metrics?.quote_count || 0) * 2 +
    Number(metrics?.impression_count || 0) * 0.01
  );
}

function isUsefulTweet(tweet: XTweet) {
  const text = String(tweet.text || "").trim();
  const lowerText = text.toLowerCase();

  if (!text) return false;
  if (tweet.lang !== "en") return false;
  if (text.startsWith("RT @")) return false;
  if (text.length < 30) return false;

  const blockedWords = [
    "trump",
    "maga",
    "football",
    "anime",
    "drunk",
    "resort",
    "super junior",
    "january 6",
    "sportybet",
    "betting",
    "movie",
    "episode",
  ];

  if (blockedWords.some((word) => lowerText.includes(word))) return false;

  const businessSignals = [
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
    "automate",
    "automation",
    "tools",
    "wasting time",
  ];

  return businessSignals.some((word) => lowerText.includes(word));
}

async function searchXSignals() {
  if (!process.env.X_BEARER_TOKEN) {
    throw new Error("X_BEARER_TOKEN is missing inside weekly-intelligence.");
  }

  const query =
    '("too much manual work" OR "manual workflow" OR "still using spreadsheets" OR "google sheets" OR "wasting time") ("business" OR "clients" OR "workflow" OR "operations" OR "agency" OR "freelance" OR "founder" OR "startup") -is:retweet lang:en';

  const params = new URLSearchParams({
    query,
    max_results: "20",
    "tweet.fields": "created_at,public_metrics,author_id,lang",
  });

  const response = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: {
      Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`X API error: ${JSON.stringify(data)}`);
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

function enrichSources(sources: WeeklySource[]) {
  const firstPass = sources.map((source) => {
    const text = `${source.title || ""} ${source.snippet || ""}`;
    const buyingSignalScore = getBuyingSignalScore(text);
    const problemCluster = getProblemCluster(text);

    return {
      ...source,
      buying_signal_score: buyingSignalScore,
      problem_cluster: problemCluster,
    };
  });

  return firstPass.map((source) => {
    const frequencyScore = getFrequencyScore(source.problem_cluster || "general_workflow_pain", firstPass);
    const sourceQualityScore = getSourceQualityScore({
      ...source,
      frequency_score: frequencyScore,
    });

    const opportunityScore = getOpportunityScore({
      pain: 7,
      revenue: 7,
      urgency: 7,
      trend: 7,
      buying: Number(source.buying_signal_score || 0),
      frequency: frequencyScore,
      sourceQuality: sourceQualityScore,
    });

    return {
      ...source,
      frequency_score: frequencyScore,
      source_quality_score: sourceQualityScore,
      opportunity_score: opportunityScore,
    };
  });
}

async function collectWeeklySignals() {
  const googleResults = await Promise.allSettled(
    MARKET_SIGNAL_QUERIES.map((query) => searchSerpApi(query))
  );

  const sources: WeeklySource[] = [];

  for (const result of googleResults) {
    if (result.status === "fulfilled") {
      result.value.forEach((item) => {
        const sourceText = `${item.title || ""} ${item.snippet || ""}`;

        sources.push({
          title: item.title || "Untitled Google result",
          url: item.link || null,
          snippet: item.snippet || null,
          source_type: "google_search",
          source_rank: item.position || sources.length + 1,
          category: classifySourceCategory(sourceText),
        });
      });
    } else {
      console.error("Google source failed:", result.reason);
    }
  }

  const xResults = await searchXSignals();

  if (xResults.length === 0) {
    console.warn("X returned 0 usable tweets. Continuing with Google sources only.");
  }

  xResults.forEach((item, index) => {
    const tweetText = item.tweet.text || "";

    sources.push({
      title: `X Signal: ${tweetText.slice(0, 80) || "Untitled tweet"}`,
      url: item.tweet.id ? `https://x.com/i/web/status/${item.tweet.id}` : null,
      snippet: tweetText || null,
      source_type: "x",
      source_rank: index + 1,
      author_id: item.tweet.author_id || null,
      like_count: item.tweet.public_metrics?.like_count || 0,
      reply_count: item.tweet.public_metrics?.reply_count || 0,
      quote_count: item.tweet.public_metrics?.quote_count || 0,
      bookmark_count: item.tweet.public_metrics?.bookmark_count || 0,
      impression_count: item.tweet.public_metrics?.impression_count || 0,
      signal_score: Number(item.signal_score.toFixed(2)),
      category: classifySourceCategory(tweetText),
    });
  });

  const unique = new Map<string, WeeklySource>();

  for (const source of sources) {
    const key = source.url || source.title;
    if (!unique.has(key)) unique.set(key, source);
  }

  const googleSources = Array.from(unique.values()).filter(
    (source) => source.source_type === "google_search"
  );

  const xSources = Array.from(unique.values()).filter(
    (source) => source.source_type === "x"
  );

  return enrichSources([...xSources.slice(0, 8), ...googleSources.slice(0, 10)]);
}

async function analyzeWeeklySignals(sources: WeeklySource[]) {
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
Type: ${source.source_type}
Category: ${source.category || "General"}
Cluster: ${source.problem_cluster || "general_workflow_pain"}
Buying signal score: ${source.buying_signal_score || 0}/10
Frequency score: ${source.frequency_score || 0}/10
Source quality score: ${source.source_quality_score || 0}/10
Opportunity score: ${source.opportunity_score || 0}/10
Title: ${source.title}
URL: ${source.url || "No URL"}
Snippet: ${source.snippet || "No snippet"}
`
    )
    .join("\n");

  const prompt = `
You are SaaSScout, an AI market intelligence analyst.

Analyze these external market signals from Google and X. Detect monetizable SaaS problems.

Sources:
${sourceText}

Return 5 detected problems.

Rules:
- Focus on real problems, not generic niches.
- Prefer repeated workflow pain, manual work, inefficient processes, fragmented tools, spreadsheet-based work, and buying intent.
- Identify affected niches.
- Suggest SaaS solutions that could be monetized.
- Score pain, revenue, urgency, and trend from 1 to 10.
- Use the provided buying signal score, frequency score, source quality score, and opportunity score when judging monetization potential.
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
      { role: "system", content: "Return valid JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 2200,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response generated.");

  try {
    return JSON.parse(cleanJsonResponse(content));
  } catch {
    console.error("Raw weekly AI response:", content);
    throw new Error("AI response was not valid JSON.");
  }
}

function normalizeProblems(rawProblems: WeeklyDetectedProblem[], sources: WeeklySource[]): ScoredProblem[] {
  return rawProblems.slice(0, 5).map((problem) => {
    const text = `${problem.problem_title} ${problem.problem_summary} ${problem.source_evidence}`;
    const problemCluster = getProblemCluster(text);
    const buyingSignalScore = getBuyingSignalScore(text);
    const frequencyScore = getFrequencyScore(problemCluster, sources);
    const sourceQualityScore =
      sources.length > 0
        ? Number(
            (
              sources.reduce(
                (sum, source) => sum + Number(source.source_quality_score || 0),
                0
              ) / sources.length
            ).toFixed(1)
          )
        : 0;

    const pain = Number(problem.pain_score) || 7;
    const revenue = Number(problem.revenue_score) || 7;
    const urgency = Number(problem.urgency_score) || 7;
    const trend = Number(problem.trend_score) || 7;

    return {
      problem_title: problem.problem_title || "Untitled problem",
      problem_summary:
        problem.problem_summary ||
        "A market problem was detected from external signals.",
      affected_niches:
        problem.affected_niches || "Small businesses | Solo founders",
      suggested_solutions:
        problem.suggested_solutions || "Workflow automation tool | AI assistant",
      pain_score: pain,
      revenue_score: revenue,
      urgency_score: urgency,
      trend_score: trend,
      monetization_angle:
        problem.monetization_angle ||
        "Monthly subscription for solving a recurring workflow problem.",
      source_evidence:
        problem.source_evidence ||
        "External sources show repeated workflow friction.",
      buying_signal_score: buyingSignalScore,
      frequency_score: frequencyScore,
      source_quality_score: sourceQualityScore,
      problem_cluster: problemCluster,
      opportunity_score: getOpportunityScore({
        pain,
        revenue,
        urgency,
        trend,
        buying: buyingSignalScore,
        frequency: frequencyScore,
        sourceQuality: sourceQualityScore,
      }),
    };
  });
}

function calculateIntelligenceScore(problem: ScoredProblem) {
  return Number((Number(problem.opportunity_score || 0) * 10).toFixed(1));
}

async function saveWeeklySources({
  runId,
  sources,
}: {
  runId: string;
  sources: WeeklySource[];
}) {
  if (sources.length === 0) return;

  const rows = sources.map((source, index) => ({
    run_id: runId,
    source_title: source.title,
    source_url: source.url,
    source_snippet: source.snippet,
    source_type: source.source_type,
    source_rank: source.source_rank || index + 1,
    author_id: source.author_id || null,
    like_count: source.like_count || 0,
    reply_count: source.reply_count || 0,
    quote_count: source.quote_count || 0,
    bookmark_count: source.bookmark_count || 0,
    impression_count: source.impression_count || 0,
    signal_score: source.signal_score || 0,
    category: source.category || "General",
    buying_signal_score: source.buying_signal_score || 0,
    frequency_score: source.frequency_score || 0,
    opportunity_score: source.opportunity_score || 0,
    problem_cluster: source.problem_cluster || "general_workflow_pain",
    source_quality_score: source.source_quality_score || 0,
  }));

  const { error } = await supabaseAdmin.from("weekly_sources").insert(rows);
  if (error) throw error;
}

async function updateProblemIntelligence(problem: ScoredProblem) {
  const { data: existingProblem, error: fetchError } = await supabaseAdmin
    .from("problem_intelligence")
    .select("*")
    .eq("problem_title", problem.problem_title)
    .maybeSingle();

  if (fetchError) throw fetchError;

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
        avg_buying_signal_score: Number(problem.buying_signal_score || 0),
        avg_frequency_score: Number(problem.frequency_score || 0),
        avg_source_quality_score: Number(problem.source_quality_score || 0),
        avg_opportunity_score: Number(problem.opportunity_score || 0),
        intelligence_score: intelligenceScore,
        last_seen_at: new Date().toISOString(),
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

  const { error } = await supabaseAdmin
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
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", existingProblem.id);

  if (error) throw error;
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
    const problems = normalizeProblems(analysis.problems || [], sources);

    const { data: runData, error: runError } = await supabaseAdmin
      .from("weekly_intelligence_runs")
      .insert([
        {
          status: "completed",
          total_sources_analyzed: sources.length,
          summary:
            analysis.summary ||
            "SaaSScout detected weekly market problems from Google and X signals.",
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
      buying_signal_score: problem.buying_signal_score,
      frequency_score: problem.frequency_score,
      opportunity_score: problem.opportunity_score,
      problem_cluster: problem.problem_cluster,
      source_quality_score: problem.source_quality_score,
    }));

    const { data: insertedProblems, error: problemsError } =
      await supabaseAdmin
        .from("weekly_detected_problems")
        .insert(problemRows)
        .select();

    if (problemsError) throw problemsError;

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