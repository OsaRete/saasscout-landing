import { NextResponse } from "next/server";

type SerpApiOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  source?: string;
  date?: string;
  position?: number;
};

type ExternalSource = {
  source_type: string;
  source_name: string | null;
  title: string | null;
  url: string | null;
  snippet: string | null;
  raw_text: string | null;
  source_score: number | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function detectSourceType(url: string, title: string) {
  const value = `${url} ${title}`.toLowerCase();

  if (value.includes("reddit.com")) return "reddit";
  if (value.includes("quora.com")) return "forum";
  if (value.includes("stackoverflow.com")) return "forum";
  if (value.includes("producthunt.com")) return "community";
  if (value.includes("g2.com")) return "review";
  if (value.includes("capterra.com")) return "review";
  if (value.includes("trustpilot.com")) return "review";
  if (value.includes("youtube.com")) return "video";
  if (value.includes("linkedin.com")) return "social";
  if (value.includes("medium.com")) return "blog";

  return "web";
}

function getSourceName(url: string, fallback?: string) {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");

    if (hostname.includes("reddit.com")) return "Reddit";
    if (hostname.includes("quora.com")) return "Quora";
    if (hostname.includes("stackoverflow.com")) return "Stack Overflow";
    if (hostname.includes("producthunt.com")) return "Product Hunt";
    if (hostname.includes("g2.com")) return "G2";
    if (hostname.includes("capterra.com")) return "Capterra";
    if (hostname.includes("trustpilot.com")) return "Trustpilot";
    if (hostname.includes("youtube.com")) return "YouTube";
    if (hostname.includes("linkedin.com")) return "LinkedIn";
    if (hostname.includes("medium.com")) return "Medium";

    return hostname;
  } catch {
    return fallback || "Web";
  }
}

function scoreSource(sourceType: string, snippet: string) {
  let score = 5;

  if (sourceType === "reddit") score += 2;
  if (sourceType === "forum") score += 1.5;
  if (sourceType === "review") score += 1.5;
  if (sourceType === "community") score += 1;

  const text = snippet.toLowerCase();

  const painKeywords = [
    "problem",
    "pain",
    "frustrated",
    "frustrating",
    "manual",
    "spreadsheet",
    "waste time",
    "time-consuming",
    "hard to",
    "struggle",
    "complaint",
    "issue",
    "looking for",
    "alternative",
    "tool",
    "software",
    "automate",
  ];

  for (const keyword of painKeywords) {
    if (text.includes(keyword)) score += 0.3;
  }

  return Math.min(10, Number(score.toFixed(1)));
}

function buildSearchQueries({
  market,
  audience,
  region,
}: {
  market: string;
  audience: string;
  region: string;
}) {
  const base = [market, audience, region].filter(Boolean).join(" ");

  return [
    `${base} problems`,
    `${base} complaints`,
    `${base} manual workflow`,
    `${base} spreadsheet problem`,
    `${base} looking for a tool`,
    `${base} software alternative`,
    `site:reddit.com ${base} problem`,
    `site:reddit.com ${base} "how do you manage"`,
  ];
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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const market = String(body.market || "").trim();
    const audience = String(body.audience || "").trim();
    const region = String(body.region || "").trim();

    if (!market) {
      return NextResponse.json(
        {
          success: false,
          error: "Market is required to collect external sources.",
        },
        { status: 400 }
      );
    }

    const queries = buildSearchQueries({
      market,
      audience,
      region,
    });

    const allResults: SerpApiOrganicResult[] = [];

    for (const query of queries.slice(0, 4)) {
      const results = await searchSerpApi(query);
      allResults.push(...results);
    }

    const seenUrls = new Set<string>();

    const sources: ExternalSource[] = allResults
      .filter((result) => {
        const url = result.link || "";

        if (!url) return false;
        if (seenUrls.has(url)) return false;

        seenUrls.add(url);
        return true;
      })
      .slice(0, 8)
      .map((result) => {
        const url = result.link || "";
        const title = result.title || "Untitled source";
        const snippet = result.snippet || "";
        const sourceType = detectSourceType(url, title);
        const sourceName = getSourceName(url, result.source);

        return {
          source_type: sourceType,
          source_name: sourceName,
          title,
          url,
          snippet,
          raw_text: snippet,
          source_score: scoreSource(sourceType, snippet),
        };
      });

    return NextResponse.json({
      success: true,
      market,
      audience,
      region,
      total_sources: sources.length,
      sources,
    });
  } catch (error) {
    console.error("Collect sources error:", error);

    const message =
      error instanceof Error ? error.message : "Could not collect sources.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}