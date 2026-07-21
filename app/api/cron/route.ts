import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getWeeklyIntelligencePeriod } from "@/lib/weekly-intelligence";
import { runWeeklyGenerationForUser } from "../weekly-intelligence/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

async function getEligibleWeeklyUsers() {
  const { data, error } = await getSupabaseAdminClient()
    .from("user_profiles")
    .select("user_id,plan,weekly_intelligence_enabled")
    .eq("weekly_intelligence_enabled", true);

  if (error) throw error;
  return (data || []).filter((profile) => Boolean(profile.user_id));
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json({ success: false, error: "Cron is not configured." }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const period = getWeeklyIntelligencePeriod();
    const eligibleUsers = await getEligibleWeeklyUsers();
    const results = [];

    for (const user of eligibleUsers) {
      try {
        const result = await runWeeklyGenerationForUser(user.user_id, period);
        results.push({ user_id: user.user_id, status: result.status, success: true });
      } catch (error) {
        results.push({ user_id: user.user_id, success: false, error: error instanceof Error ? error.message : "Weekly generation failed." });
      }
    }

    return NextResponse.json({ success: true, period, users_considered: eligibleUsers.length, results });
  } catch (error) {
    console.error("Cron weekly intelligence error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Cron failed." }, { status: 500 });
  }
}
