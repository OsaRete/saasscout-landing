import { budgetedProviderFetch, ProviderBudgetError } from "../../spending/provider-budget.ts";
import type { DiscoverySource } from "../../knowledge/discovery-data-moat-sources";

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

// Prioritize direct pain, spreadsheet workarounds, client management, then tool gaps.
const DISCOVERY_QUERIES = [
  `"too much manual work" business`,
  `"using spreadsheets to manage" business`,
  `"need a better way to manage clients"`,
  `"no good tool for" business`,
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

  const response = await budgetedProviderFetch(`https://serpapi.com/search.json?${params}`, {
    method: "GET",
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || "SerpApi request failed.");
  }

  const results: unknown = data.organic_results ?? [];
  if (!Array.isArray(results)) throw new Error("Invalid SerpApi results.");
  return results as SerpApiOrganicResult[];
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

  const response = await budgetedProviderFetch(
    `https://api.x.com/2/tweets/search/recent?${params}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) throw new Error("X search returned an unsuccessful response.");
  const data = await response.json();

  return ((data?.data || []) as XTweet[])
    .filter(isUsefulTweet)
    .map((tweet) => ({
      tweet,
      signal_score: getSignalScore(tweet),
    }))
    .sort((a, b) => b.signal_score - a.signal_score)
    .slice(0, 8);
}

export async function collectExternalSources(sourcesLimit: number) {
  const resultsPerQuery = Math.min(10, Math.max(2, Math.ceil(sourcesLimit / DISCOVERY_QUERIES.length)));
  const sources: Source[] = [];
  let completedSearches = 0;

  for (const query of DISCOVERY_QUERIES) {
    let results: SerpApiOrganicResult[];
    try {
      // Wait for the guarded fetch to finish before claiming another dispatch slot.
      results = await searchSerpApi(query, resultsPerQuery);
    } catch {
      // A failed dispatch may still occupy a slot. Keep the evidence already collected.
      break;
    }

    completedSearches++;
    for (const item of results) {
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
    }
  }

  // Preserve other evidence if the optional, metered X search fails.
  let xSearchFailed = false;
  const xResults = await searchXSignals().catch((error: unknown) => {
    xSearchFailed = true;
    if (!(error instanceof ProviderBudgetError)) {
      console.error("Discovery X search failed.");
    }
    return [];
  });

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

  return {
    sources: Array.from(unique.values()).slice(0, sourcesLimit),
    limitedSearchCoverage: completedSearches < DISCOVERY_QUERIES.length || xSearchFailed,
  };
}

