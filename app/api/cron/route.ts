import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { success: false, error: "Cron is not configured." },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://trysaasscout.com";

    const response = await fetch(`${baseUrl}/api/generate-weekly-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({
        saveToDatabase: true,
      }),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Weekly report generation failed.");
    }

    return NextResponse.json({
      success: true,
      message: "Weekly global report generated successfully.",
      data,
    });
  } catch (error) {
    console.error("Cron weekly report error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cron failed.",
      },
      { status: 500 }
    );
  }
}
