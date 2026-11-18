import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      deprecated: true,
      error:
        "Weekly Intelligence is generated on schedule. Use GET /api/weekly-intelligence to read reports.",
      authoritative_endpoint: "/api/weekly-intelligence",
    },
    { status: 410 },
  );
}
