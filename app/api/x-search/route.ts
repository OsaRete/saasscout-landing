import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type XTweet = {
  id: string;
  text?: string;
  lang?: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
};

function cleanQuery(query: string) {
  let cleaned = query.trim();

  if (!cleaned.includes("-is:retweet")) {
    cleaned += " -is:retweet";
  }

  if (!cleaned.includes("lang:en")) {
    cleaned += " lang:en";
  }

  return cleaned;
}

function isUsefulTweet(tweet: XTweet) {
  const text = String(tweet.text || "").trim();
  const lowerText = text.toLowerCase();

  if (!text) return false;
  if (tweet.lang !== "en") return false;
  if (text.startsWith("RT @")) return false;
  if (text.length < 50) return false;

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
    "crypto giveaway",
  ];

  if (blockedWords.some((word) => lowerText.includes(word))) {
    return false;
  }

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

function getSignalScore(tweet: XTweet) {
  const metrics = tweet.public_metrics;

  const likes = Number(metrics?.like_count || 0);
  const replies = Number(metrics?.reply_count || 0);
  const bookmarks = Number(metrics?.bookmark_count || 0);
  const quotes = Number(metrics?.quote_count || 0);
  const impressions = Number(metrics?.impression_count || 0);

  return (
    likes * 1 +
    replies * 2 +
    bookmarks * 2 +
    quotes * 2 +
    impressions * 0.01
  );
}

export async function GET(req: NextRequest) {
  try {
    if (!process.env.X_BEARER_TOKEN) {
      return NextResponse.json(
        { success: false, error: "X_BEARER_TOKEN is missing." },
        { status: 500 }
      );
    }

    const searchParams = req.nextUrl.searchParams;

    const rawQuery =
      searchParams.get("query") ||
      '("too much manual work" OR "manual workflow" OR "still using spreadsheets" OR "google sheets" OR "wasting time") ("business" OR "clients" OR "workflow" OR "operations" OR "agency" OR "freelance" OR "founder" OR "startup")';

    const query = cleanQuery(rawQuery);

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
      return NextResponse.json(
        {
          success: false,
          status: response.status,
          error: data?.detail || data?.title || "X API request failed.",
          data,
        },
        { status: response.status }
      );
    }

    const tweets = ((data?.data || []) as XTweet[])
      .filter(isUsefulTweet)
      .map((tweet) => ({
        ...tweet,
        signal_score: Number(getSignalScore(tweet).toFixed(2)),
      }))
      .sort((a, b) => b.signal_score - a.signal_score)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      status: response.status,
      query,
      count: tweets.length,
      tweets,
      meta: data?.meta || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}