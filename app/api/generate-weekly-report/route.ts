import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      deprecated: true,
      error:
        "generate-weekly-report is deprecated. Use the authenticated /api/weekly-intelligence pipeline.",
      authoritative_endpoint: "/api/weekly-intelligence",
    },
    { status: 410 },
  );
}
