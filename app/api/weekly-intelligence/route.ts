import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { AuthError, requireUser } from "../_utils/auth";
import { buildWeeklyIntelligencePrompt, getWeeklyIntelligencePeriod, type WeeklyEvidenceSource, type WeeklySharedSource, type WeeklyPeriod, type WeeklyReportProblem } from "@/lib/weekly-intelligence";
import { aggregateUserDataMoat, type DataMoatAggregation, type DataMoatAggregationClient } from "@/lib/data-moat/aggregation";
import { updateWeeklyProblemIntelligence } from "@/lib/knowledge/problem-intelligence-store";
import { runKnowledgeEvolutionWeeklyDiagnostics, type KnowledgeEvolutionSupabaseClient } from "@/lib/knowledge/evolution";
import { runAuthoritativeWeeklyGenerationForUser, type AuthoritativeWeeklyGenerationRepository } from "@/lib/weekly-intelligence-service";

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

function isKnowledgeEvolutionDiagnosticsEnabled() {
  return process.env.KNOWLEDGE_EVOLUTION_DIAGNOSTICS === "1";
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

  const completion = await getOpenRouterClient().chat.completions.create({
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

  const { error } = await getSupabaseAdminClient().from("weekly_sources").insert(rows);
  if (error) throw error;
}


function sanitizeWeeklyError() {
  return "Could not generate weekly intelligence.";
}

function logWeeklyDiagnostic(event: string, payload: Record<string, unknown>) {
  console.info("Weekly intelligence diagnostic", { event, ...payload });
}

export function buildWeeklyGenerationRepository(): AuthoritativeWeeklyGenerationRepository {
  return {
    async claimRun({ userId, period, staleBefore }) {
      const { data, error } = await getSupabaseAdminClient().rpc("claim_weekly_intelligence_run", {
        p_user_id: userId,
        p_period_start: period.period_start,
        p_period_end: period.period_end,
        p_timezone: period.timezone,
        p_stale_before: staleBefore,
      });
      if (error) throw error;
      const claim = Array.isArray(data) ? data[0] : data;
      if (!claim?.run) throw new Error("Could not claim weekly intelligence run.");
      return { status: claim.claim_status, run: claim.run };
    },
    getProblemsForRun,
    async completeRun({ runId, userId, period, totalSourcesAnalyzed, summary }) {
      const { data, error } = await getSupabaseAdminClient()
        .from("weekly_intelligence_runs")
        .update({ user_id: userId, period_start: period.period_start, period_end: period.period_end, timezone: period.timezone, status: "completed", total_sources_analyzed: totalSourcesAnalyzed, summary })
        .eq("id", runId)
        .eq("user_id", userId)
        .neq("status", "completed")
        .select()
        .single();
      if (error || !data) throw error || new Error("Could not complete weekly intelligence run.");
      return data;
    },
    async replaceProblems({ runId, problems }) {
      const { data: runRow, error: runError } = await getSupabaseAdminClient().from("weekly_intelligence_runs").select("status").eq("id", runId).single();
      if (runError) throw runError;
      if (runRow?.status === "completed") return getProblemsForRun(runId);
      const { error: deleteError } = await getSupabaseAdminClient().from("weekly_detected_problems").delete().eq("run_id", runId);
      if (deleteError) throw deleteError;
      if (problems.length === 0) return [];
      const problemRows = problems.map((problem: WeeklyReportProblem) => ({ ...problem, problem_title_key: problem.problem_title.trim().replace(/\s+/g, " ").toLowerCase(), run_id: runId }));
      const { data, error } = await getSupabaseAdminClient().from("weekly_detected_problems").insert(problemRows).select();
      if (error) throw error;
      for (const problem of problems) await updateWeeklyProblemIntelligence(problem);
      if (isKnowledgeEvolutionDiagnosticsEnabled()) {
        await runKnowledgeEvolutionWeeklyDiagnostics({ client: getSupabaseAdminClient() as unknown as KnowledgeEvolutionSupabaseClient, problems });
      }
      return data || [];
    },
    async markRunFailed({ runId }) {
      await getSupabaseAdminClient().from("weekly_intelligence_runs").update({ status: "failed" }).eq("id", runId).neq("status", "completed");
    },
  };
}

export async function runWeeklyGenerationForUser(userId: string, period: WeeklyPeriod) {
  return runAuthoritativeWeeklyGenerationForUser({
    userId,
    period,
    dependencies: {
      repository: buildWeeklyGenerationRepository(),
      aggregate: (authenticatedUserId) =>
        aggregateUserDataMoat(getSupabaseAdminClient() as unknown as DataMoatAggregationClient, authenticatedUserId, {
          includeSharedContext: true,
          limitPerSource: 100,
          logger: { info: logWeeklyDiagnosticInfo, warn: logWeeklyDiagnosticWarning },
        }),
      analyze: analyzeUserScopedWeeklySignals,
      log: logWeeklyDiagnostic,
    },
  });
}

async function getUserProfile(userId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("user_profiles")
    .select("plan,weekly_intelligence_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function findExistingWeeklyRun(userId: string, periodStart: string, periodEnd: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("weekly_intelligence_runs")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getProblemsForRun(runId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("weekly_detected_problems")
    .select("*")
    .eq("run_id", runId);

  if (error) throw error;
  return data || [];
}

function logWeeklyDiagnosticInfo(_message: string, payload?: unknown) {
  logWeeklyDiagnostic("data_moat_aggregation_info", safeAggregationDiagnosticPayload(payload));
}

function logWeeklyDiagnosticWarning(_message: string, payload?: unknown) {
  logWeeklyDiagnostic("data_moat_aggregation_warning", safeAggregationDiagnosticPayload(payload));
}

function safeAggregationDiagnosticPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const diagnostics = payload as DataMoatAggregation["diagnostics"];
  return {
    sourcesQueried: diagnostics.sourcesQueried || [],
    countsBySource: diagnostics.countsBySource || {},
    skippedSources: diagnostics.skippedSources || [],
    normalizationFailureCount: diagnostics.normalizationFailures?.length || 0,
    durationMs: diagnostics.durationMs || 0,
  };
}

async function analyzeUserScopedWeeklySignals(input: {
  period: ReturnType<typeof getWeeklyIntelligencePeriod>;
  userEvidence: WeeklyEvidenceSource[];
  priorUserContext: WeeklyEvidenceSource[];
  sharedContext: WeeklySharedSource[];
}) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is missing.");

  const prompt = buildWeeklyIntelligencePrompt(input);
  const completion = await getOpenRouterClient().chat.completions.create({
    model: "openai/gpt-4.1-mini",
    messages: [
      { role: "system", content: "Return valid JSON only. Never fabricate user evidence." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 2200,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response generated.");
  return JSON.parse(cleanJsonResponse(content));
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const profile = await getUserProfile(user.id);

    if (profile && profile.weekly_intelligence_enabled === false) {
      return NextResponse.json({ success: false, error: "Weekly Intelligence is not enabled for this plan." }, { status: 403 });
    }

    const period = getWeeklyIntelligencePeriod();
    logWeeklyDiagnostic("period_selected", { userId: user.id, period });
    const result = await runWeeklyGenerationForUser(user.id, period);
    logWeeklyDiagnostic("button_generation_result", { entryPath: "weekly_button", userId: user.id, periodKey: `${period.period_start}/${period.period_end}`, status: result.status, generatedProblems: result.problems.length, sourcesSaved: result.sources_saved });
    const statusCode = result.status === "processing" ? 202 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    console.error("Weekly intelligence error:", error);

    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json({ success: false, error: sanitizeWeeklyError() }, { status: 500 });
  }
}
