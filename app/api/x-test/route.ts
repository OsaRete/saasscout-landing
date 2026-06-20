import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!process.env.X_BEARER_TOKEN) {
      return NextResponse.json(
        { success: false, error: "X_BEARER_TOKEN is missing." },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      query: '"manual workflow" OR "too much manual work" -is:retweet lang:en',
      max_results: "10",
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

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Request failed.",
      },
      { status: 500 }
    );
  }
}