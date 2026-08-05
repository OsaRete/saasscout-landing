import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getWeeklyIntelligencePeriod } from "@/lib/weekly-intelligence";
import { createWeeklyExecutionId, getWeeklyDiagnostic } from "@/lib/weekly-intelligence-service";
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
  const invocationId = createWeeklyExecutionId();
  const startedAt = Date.now();
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json({ success: false, error: "Cron is not configured.", code: "weekly_schedule_configuration_invalid", stage: "received", invocationId }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized", code: "weekly_schedule_unauthorized", stage: "received", invocationId }, { status: 401 });
    }

    const period = getWeeklyIntelligencePeriod();
    console.info("Weekly intelligence diagnostic", { event: "schedule_started", invocationId, entryPath: "weekly_schedule", periodKey: `${period.period_start}/${period.period_end}`, timezone: period.timezone });
    let eligibleUsers;
    try {
      eligibleUsers = await getEligibleWeeklyUsers();
    } catch (error) {
      const diagnostic = getWeeklyDiagnostic(error, "received", invocationId);
      return NextResponse.json({ success: false, error: "Cron weekly intelligence failed.", code: "weekly_recipient_selection_failed", stage: diagnostic.stage, invocationId }, { status: 500 });
    }
    const results = [];

    for (const user of eligibleUsers) {
      const weeklyExecutionId = createWeeklyExecutionId();
      try {
        const result = await runWeeklyGenerationForUser(user.user_id, period, { weeklyExecutionId, entryPath: "cron" });
        results.push({ user_id: user.user_id, weeklyExecutionId, code: result.code, stage: result.stage, status: result.status, success: true, reused: result.code === "weekly_current_period_reused", problems: result.problems.length, sources_saved: result.sources_saved });
      } catch (error) {
        const diagnostic = getWeeklyDiagnostic(error, "response_completed", weeklyExecutionId);
        console.warn("Weekly intelligence diagnostic", { event: "schedule_user_failed", invocationId, weeklyExecutionId, entryPath: "weekly_schedule", userId: user.user_id, periodKey: `${period.period_start}/${period.period_end}`, code: diagnostic.code, stage: diagnostic.stage });
        results.push({ user_id: user.user_id, weeklyExecutionId, success: false, error: "Could not generate weekly intelligence.", code: diagnostic.code, stage: diagnostic.stage });
      }
    }

    const succeeded = results.filter((result) => result.success).length;
    const reused = results.filter((result) => result.success && result.reused).length;
    const failed = results.length - succeeded;
    const code = failed > 0 ? "weekly_partial_recipient_failure" : undefined;
    return NextResponse.json({ success: true, invocationId, code, period, configured_recipient_count: eligibleUsers.length, eligible_recipient_count: eligibleUsers.length, succeeded_count: succeeded, reused_count: reused, failed_count: failed, duration_ms: Date.now() - startedAt, results });
  } catch (error) {
    const diagnostic = getWeeklyDiagnostic(error, "response_completed", invocationId);
    console.error("Cron weekly intelligence error", { invocationId, code: diagnostic.code, stage: diagnostic.stage, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ success: false, error: "Cron weekly intelligence failed.", code: diagnostic.code, stage: diagnostic.stage, invocationId, duration_ms: Date.now() - startedAt }, { status: 500 });
  }
}
