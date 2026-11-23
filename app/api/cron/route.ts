import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getWeeklyIntelligencePeriod, rotateWeeklyRecipients } from "@/lib/weekly-intelligence";
import { createWeeklyExecutionId, getWeeklyDiagnostic } from "@/lib/weekly-intelligence-service";
import { AuthError } from "../_utils/auth";
import { runWeeklyGenerationForUser } from "../weekly-intelligence/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

async function getConfiguredWeeklyUsers() {
  const client = getSupabaseAdminClient();
  const users: { user_id: string }[] = [];
  let lastUserId: string | undefined;

  while (true) {
    const query = client
      .from("user_profiles")
      .select("user_id")
      .eq("weekly_intelligence_enabled", true)
      .order("user_id")
      .limit(250);
    const { data, error } = await (lastUserId ? query.gt("user_id", lastUserId) : query);
    if (error) throw error;
    if (!data?.length) return users;

    users.push(...data);
    lastUserId = data.at(-1)!.user_id;
  }
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

    if (process.env.WEEKLY_SCHEDULED_GENERATION_ENABLED !== "true") {
      return NextResponse.json({ success: true, code: "weekly_schedule_disabled", invocationId });
    }

    const period = getWeeklyIntelligencePeriod();
    console.info("Weekly intelligence diagnostic", { event: "schedule_started", invocationId, entryPath: "weekly_schedule", periodKey: `${period.period_start}/${period.period_end}`, timezone: period.timezone });
    let configuredUsers;
    try {
      configuredUsers = await getConfiguredWeeklyUsers();
    } catch (error) {
      const diagnostic = getWeeklyDiagnostic(error, "received", invocationId);
      return NextResponse.json({ success: false, error: "Cron weekly intelligence failed.", code: "weekly_recipient_selection_failed", stage: diagnostic.stage, invocationId }, { status: 500 });
    }
    const results = [];

    for (const user of rotateWeeklyRecipients(configuredUsers, period)) {
      const weeklyExecutionId = createWeeklyExecutionId();
      try {
        const result = await runWeeklyGenerationForUser(user.user_id, period, { weeklyExecutionId, entryPath: "cron" });
        results.push({ weeklyExecutionId, code: result.code, stage: result.stage, status: result.status, success: true, reused: result.reused, executionMode: result.executionMode, providerState: result.providerState, sourceDegraded: result.sourceCounts.sourceDegraded, problems: result.problems.length, externalSourcesPersisted: result.sourceCounts.externalSourcesPersisted });
      } catch (error) {
        if (error instanceof AuthError && error.status === 403) continue;
        const diagnostic = getWeeklyDiagnostic(error, "response_completed", weeklyExecutionId);
        console.warn("Weekly intelligence diagnostic", { event: "schedule_user_failed", invocationId, weeklyExecutionId, entryPath: "weekly_schedule", periodKey: `${period.period_start}/${period.period_end}`, code: diagnostic.code, stage: diagnostic.stage });
        results.push({ weeklyExecutionId, success: false, error: "Could not generate weekly intelligence.", code: diagnostic.code, stage: diagnostic.stage });
      }
    }

    const succeeded = results.filter((result) => result.success).length;
    const reused = results.filter((result) => result.success && result.reused).length;
    const failed = results.length - succeeded;
    const code = failed > 0 ? "weekly_partial_recipient_failure" : undefined;
    return NextResponse.json({ success: true, invocationId, code, period, configured_recipient_count: configuredUsers.length, eligible_recipient_count: results.length, succeeded_count: succeeded, reused_count: reused, failed_count: failed, duration_ms: Date.now() - startedAt, results });
  } catch (error) {
    const diagnostic = getWeeklyDiagnostic(error, "response_completed", invocationId);
    console.error("Cron weekly intelligence error", { invocationId, code: diagnostic.code, stage: diagnostic.stage, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ success: false, error: "Cron weekly intelligence failed.", code: diagnostic.code, stage: diagnostic.stage, invocationId, duration_ms: Date.now() - startedAt }, { status: 500 });
  }
}
