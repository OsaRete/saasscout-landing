import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { AuthError, requireUser } from "../_utils/auth";
import { buildWeeklyIntelligencePrompt, getWeeklyIntelligencePeriod, type WeeklyEvidenceSource, type WeeklySharedSource, type WeeklyPeriod, type WeeklyReportProblem } from "@/lib/weekly-intelligence";
import { aggregateUserDataMoat, type DataMoatAggregation, type DataMoatAggregationClient } from "@/lib/data-moat/aggregation";
import { updateWeeklyProblemIntelligence } from "@/lib/knowledge/problem-intelligence-store";
import { runKnowledgeEvolutionWeeklyDiagnostics, type KnowledgeEvolutionSupabaseClient } from "@/lib/knowledge/evolution";
import { createWeeklyExecutionId, getWeeklyDiagnostic, runAuthoritativeWeeklyGenerationForUser, WeeklyDiagnosticError, type AuthoritativeWeeklyGenerationRepository, type WeeklyEntryPath } from "@/lib/weekly-intelligence-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOpenRouterClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://trysaasscout.com",
      "X-Title": "SaaSScout",
    },
  });
}

function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );
}

function cleanJsonResponse(content: string) {
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
}

function isKnowledgeEvolutionDiagnosticsEnabled() {
  return process.env.KNOWLEDGE_EVOLUTION_DIAGNOSTICS === "1";
}

function sanitizeWeeklyError() {
  return "Could not generate weekly intelligence.";
}

function logWeeklyDiagnostic(event: string, payload: Record<string, unknown>) {
  console.info("Weekly intelligence diagnostic", { event, ...payload });
}

const WEEKLY_CLAIM_RPC_NAME = "claim_weekly_intelligence_run";
const WEEKLY_CLAIM_STATUSES = new Set(["claimed", "completed", "processing", "reclaimed"]);
const REQUIRED_WEEKLY_RUN_FIELDS = ["id", "user_id", "period_start", "period_end", "timezone", "status"] as const;

function safeRpcErrorPayload(error: { code?: string; details?: string; hint?: string; message?: string } | null, input: { userId: string; period: WeeklyPeriod; staleBefore: string }) {
  return {
    rpcName: WEEKLY_CLAIM_RPC_NAME,
    postgresCode: error?.code || null,
    hasDetails: Boolean(error?.details),
    hasHint: Boolean(error?.hint),
    hasMessage: Boolean(error?.message),
    argumentPresence: {
      p_user_id: Boolean(input.userId),
      p_period_start: Boolean(input.period.period_start),
      p_period_end: Boolean(input.period.period_end),
      p_timezone: Boolean(input.period.timezone),
      p_stale_before: Boolean(input.staleBefore),
    },
    periodKey: `${input.period.period_start}/${input.period.period_end}`,
    userId: input.userId,
  };
}

function parseWeeklyClaimRpcResponse(data: unknown) {
  const claim = Array.isArray(data) ? data[0] : data;
  if (!claim || typeof claim !== "object") throw new Error("Weekly claim RPC returned no claim row.");
  const row = claim as { claim_status?: unknown; run?: unknown };
  if (typeof row.claim_status !== "string" || !WEEKLY_CLAIM_STATUSES.has(row.claim_status)) throw new Error("Weekly claim RPC returned an unknown claim status.");
  if (!row.run || typeof row.run !== "object" || Array.isArray(row.run)) throw new Error("Weekly claim RPC returned an invalid run payload.");
  const run = row.run as Record<string, unknown>;
  for (const field of REQUIRED_WEEKLY_RUN_FIELDS) {
    if (run[field] === undefined || run[field] === null || run[field] === "") throw new Error(`Weekly claim RPC run payload is missing ${field}.`);
  }
  return { status: row.claim_status as "claimed" | "completed" | "processing" | "reclaimed", run };
}

export function buildWeeklyGenerationRepository(): AuthoritativeWeeklyGenerationRepository {
  return {
    async claimRun({ userId, period, staleBefore }) {
      const rpcArgs = {
        p_user_id: userId,
        p_period_start: period.period_start,
        p_period_end: period.period_end,
        p_timezone: period.timezone,
        p_stale_before: staleBefore,
      };
      const { data, error } = await getSupabaseAdminClient().rpc(WEEKLY_CLAIM_RPC_NAME, rpcArgs);
      if (error) {
        logWeeklyDiagnostic("weekly_claim_rpc_failed", safeRpcErrorPayload(error, { userId, period, staleBefore }));
        throw error;
      }
      return parseWeeklyClaimRpcResponse(data);
    },
    getProblemsForRun,
    async completeRun({ runId, userId, period, totalSourcesAnalyzed, summary }) {
      const { data, error } = await getSupabaseAdminClient()
        .from("weekly_intelligence_runs")
        .update({ user_id: userId, period_start: period.period_start, period_end: period.period_end, timezone: period.timezone, status: "completed", total_sources_analyzed: totalSourcesAnalyzed, summary })
        .eq("id", runId)
        .eq("user_id", userId)
        .neq("status", "completed")
        .select()
        .single();
      if (error || !data) throw error || new Error("Could not complete weekly intelligence run.");
      return data;
    },
    async replaceProblems({ runId, problems }) {
      const { data: runRow, error: runError } = await getSupabaseAdminClient().from("weekly_intelligence_runs").select("status").eq("id", runId).single();
      if (runError) throw runError;
      if (runRow?.status === "completed") return getProblemsForRun(runId);
      const { error: deleteError } = await getSupabaseAdminClient().from("weekly_detected_problems").delete().eq("run_id", runId);
      if (deleteError) throw deleteError;
      if (problems.length === 0) return [];
      const problemRows = problems.map((problem: WeeklyReportProblem) => ({ ...problem, problem_title_key: problem.problem_title.trim().replace(/\s+/g, " ").toLowerCase(), run_id: runId }));
      const { data, error } = await getSupabaseAdminClient().from("weekly_detected_problems").insert(problemRows).select();
      if (error) throw error;
      for (const problem of problems) {
        if ([problem.pain_score, problem.revenue_score, problem.urgency_score, problem.trend_score].every((score) => typeof score === "number")) {
          await updateWeeklyProblemIntelligence(problem as WeeklyReportProblem & { pain_score: number; revenue_score: number; urgency_score: number; trend_score: number });
        }
      }
      if (isKnowledgeEvolutionDiagnosticsEnabled()) {
        await runKnowledgeEvolutionWeeklyDiagnostics({ client: getSupabaseAdminClient() as unknown as KnowledgeEvolutionSupabaseClient, problems });
      }
      return data || [];
    },
    async markRunFailed({ runId }) {
      await getSupabaseAdminClient().from("weekly_intelligence_runs").update({ status: "failed" }).eq("id", runId).neq("status", "completed");
    },
  };
}

export async function runWeeklyGenerationForUser(userId: string, period: WeeklyPeriod, options: { weeklyExecutionId?: string; entryPath?: WeeklyEntryPath } = {}) {
  return runAuthoritativeWeeklyGenerationForUser({
    userId,
    period,
    dependencies: {
      repository: buildWeeklyGenerationRepository(),
      aggregate: (authenticatedUserId) =>
        aggregateUserDataMoat(getSupabaseAdminClient() as unknown as DataMoatAggregationClient, authenticatedUserId, {
          includeSharedContext: true,
          limitPerSource: 100,
          logger: { info: logWeeklyDiagnosticInfo, warn: logWeeklyDiagnosticWarning },
        }),
      analyze: analyzeUserScopedWeeklySignals,
      log: logWeeklyDiagnostic,
      weeklyExecutionId: options.weeklyExecutionId,
      entryPath: options.entryPath,
    },
  });
}

async function getUserProfile(userId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("user_profiles")
    .select("plan,weekly_intelligence_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getProblemsForRun(runId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("weekly_detected_problems")
    .select("*")
    .eq("run_id", runId);

  if (error) throw error;
  return data || [];
}

function logWeeklyDiagnosticInfo(_message: string, payload?: unknown) {
  logWeeklyDiagnostic("data_moat_aggregation_info", safeAggregationDiagnosticPayload(payload));
}

function logWeeklyDiagnosticWarning(_message: string, payload?: unknown) {
  logWeeklyDiagnostic("data_moat_aggregation_warning", safeAggregationDiagnosticPayload(payload));
}

function safeAggregationDiagnosticPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const diagnostics = payload as DataMoatAggregation["diagnostics"];
  return {
    sourcesQueried: diagnostics.sourcesQueried || [],
    countsBySource: diagnostics.countsBySource || {},
    skippedSources: diagnostics.skippedSources || [],
    normalizationFailureCount: diagnostics.normalizationFailures?.length || 0,
    durationMs: diagnostics.durationMs || 0,
  };
}

async function analyzeUserScopedWeeklySignals(input: {
  period: ReturnType<typeof getWeeklyIntelligencePeriod>;
  userEvidence: WeeklyEvidenceSource[];
  priorUserContext: WeeklyEvidenceSource[];
  sharedContext: WeeklySharedSource[];
}) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is missing.");

  const prompt = buildWeeklyIntelligencePrompt(input);
  const completion = await getOpenRouterClient().chat.completions.create({
    model: "openai/gpt-4.1-mini",
    messages: [
      { role: "system", content: "Return valid JSON only. Never fabricate user evidence." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 2200,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("No AI response generated.");
  return JSON.parse(cleanJsonResponse(content));
}

export async function POST(req: Request) {
  const weeklyExecutionId = createWeeklyExecutionId();
  try {
    logWeeklyDiagnostic("received", { weeklyExecutionId, entryPath: "button" });
    const user = await requireUser(req);
    logWeeklyDiagnostic("authenticated", { weeklyExecutionId, entryPath: "button", userId: user.id });

    let profile;
    try {
      profile = await getUserProfile(user.id);
    } catch (error) {
      throw new WeeklyDiagnosticError("weekly_profile_unavailable", "capability_checked", "Weekly profile lookup failed.", { cause: error, weeklyExecutionId });
    }

    if (!profile) {
      throw new WeeklyDiagnosticError("weekly_profile_unavailable", "capability_checked", "Weekly profile is unavailable.", { weeklyExecutionId });
    }

    if (profile.weekly_intelligence_enabled === false) {
      return NextResponse.json({ success: false, error: "Weekly Intelligence is not enabled for this plan.", code: "weekly_capability_denied", stage: "capability_checked", weeklyExecutionId }, { status: 403 });
    }
    logWeeklyDiagnostic("capability_checked", { weeklyExecutionId, entryPath: "button", userId: user.id, weeklyEnabled: true });

    let period;
    try {
      period = getWeeklyIntelligencePeriod();
    } catch (error) {
      throw new WeeklyDiagnosticError("weekly_period_resolution_failed", "period_resolved", "Weekly period resolution failed.", { cause: error, weeklyExecutionId });
    }
    logWeeklyDiagnostic("period_resolved", { weeklyExecutionId, entryPath: "button", userId: user.id, periodKey: `${period.period_start}/${period.period_end}` });

    const result = await runWeeklyGenerationForUser(user.id, period, { weeklyExecutionId, entryPath: "button" });
    logWeeklyDiagnostic("button_generation_result", { weeklyExecutionId, entryPath: "weekly_button", userId: user.id, periodKey: `${period.period_start}/${period.period_end}`, status: result.status, generatedProblems: result.problems.length, sourcesSaved: result.sources_saved, code: result.code, stage: result.stage });
    const statusCode = result.status === "processing" ? 202 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    const diagnostic = error instanceof AuthError
      ? { code: "weekly_authentication_failed" as const, stage: "authenticated" as const, weeklyExecutionId }
      : getWeeklyDiagnostic(error, "response_completed", weeklyExecutionId);
    console.error("Weekly intelligence error", { weeklyExecutionId, code: diagnostic.code, stage: diagnostic.stage, errorName: error instanceof Error ? error.name : "UnknownError" });

    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: "Please sign in again to run Weekly Intelligence.", code: diagnostic.code, stage: diagnostic.stage, weeklyExecutionId }, { status: error.status });
    }

    const status = diagnostic.code === "weekly_capability_denied" ? 403 : 500;
    return NextResponse.json({ success: false, error: sanitizeWeeklyError(), code: diagnostic.code, stage: diagnostic.stage, weeklyExecutionId }, { status });
  }
}

const SAFE_WEEKLY_RUN_FIELDS = "id,status,total_sources_analyzed,summary,period_start,period_end,created_at";
const SAFE_WEEKLY_PROBLEM_FIELDS = "id,run_id,problem_title,problem_summary,affected_users,affected_niches,observed_evidence,repeated_patterns,business_impact,why_existing_tools_fail,suggested_solutions,suggested_mvp,monetization_angle,recommended_validation,recommended_deep_scan,evidence_references,pain_score,revenue_score,urgency_score,trend_score,intelligence_score,confidence_score,evidence_strength,source_evidence,created_at";
const SAFE_WEEKLY_SOURCE_FIELDS = "id,run_id,source_title,source_url,source_snippet,source_type,source_rank,category,created_at";

/** Authenticated, ownership-checked projection. The browser never reads Weekly tables directly. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const requestedRunId = new URL(req.url).searchParams.get("runId");
    let runsQuery = getSupabaseAdminClient()
      .from("weekly_intelligence_runs")
      .select(SAFE_WEEKLY_RUN_FIELDS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (requestedRunId) runsQuery = runsQuery.eq("id", requestedRunId);
    const { data: runs, error: runsError } = await runsQuery;
    if (runsError) throw runsError;
    if (requestedRunId && (!runs || runs.length === 0)) {
      return NextResponse.json({ success: false, error: "Weekly report not found." }, { status: 404 });
    }
    const runIds = (runs || []).map((run) => run.id);
    if (runIds.length === 0) return NextResponse.json({ success: true, runs: [], problems: [], externalSources: [], taxonomy: { external: 0, userOwnedEvidence: 0, weeklyEvidence: 0, derivedObservations: 0, aiInsights: 0 } });
    const [{ data: problems, error: problemsError }, { data: sources, error: sourcesError }] = await Promise.all([
      getSupabaseAdminClient().from("weekly_detected_problems").select(SAFE_WEEKLY_PROBLEM_FIELDS).in("run_id", runIds),
      getSupabaseAdminClient().from("weekly_sources").select(SAFE_WEEKLY_SOURCE_FIELDS).in("run_id", runIds).order("source_rank", { ascending: true }),
    ]);
    if (problemsError) throw problemsError;
    if (sourcesError) throw sourcesError;
    const userOwnedEvidence = (problems || []).reduce((total, problem) => total + (Array.isArray(problem.evidence_references) ? problem.evidence_references.length : 0), 0);
    return NextResponse.json({
      success: true, runs: runs || [], problems: problems || [], externalSources: sources || [],
      taxonomy: { external: sources?.length || 0, userOwnedEvidence, weeklyEvidence: problems?.length || 0, derivedObservations: (problems || []).filter((problem) => problem.repeated_patterns || problem.business_impact).length, aiInsights: problems?.length || 0 },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: "Please sign in again." }, { status: error.status });
    console.error("Weekly projection error", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ success: false, error: "Could not load weekly intelligence." }, { status: 500 });
  }
}
