import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { AuthError, requireUser } from "../../_utils/auth";
import { aggregateUserDataMoat, type DataMoatAggregationClient } from "@/lib/data-moat/aggregation";
import { buildIdeaValidationDataMoatContext, stripIdeaValidationDiagnostics, validateIdeaAgainstDataMoatContext } from "@/lib/idea-validation";
import { RESULTS_IDEA_VALIDATION_MAX_IDEAS } from "@/lib/results/idea-validation-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ValidationRequestIdea = Readonly<{
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  problem?: unknown;
  audience?: unknown;
}>;

type AcceptedIdea = Readonly<{
  id: string;
  title: string;
  summary?: string;
  problem?: string;
  audience?: string;
}>;

function getSupabaseUserClient(req: Request) {
  const token = req.headers.get("authorization")?.slice("Bearer ".length).trim() || "";
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseIdeas(body: unknown): { ideas: AcceptedIdea[]; requestedCount: number; error?: string } {
  if (!body || typeof body !== "object" || !Array.isArray((body as { ideas?: unknown }).ideas)) return { ideas: [], requestedCount: 0, error: "invalid_ideas" };
  const rawIdeas = (body as { ideas: ValidationRequestIdea[] }).ideas;
  if (rawIdeas.length > RESULTS_IDEA_VALIDATION_MAX_IDEAS) return { ideas: [], requestedCount: rawIdeas.length, error: "too_many_ideas" };

  const ideas: AcceptedIdea[] = [];
  for (const idea of rawIdeas) {
    const id = text(idea.id, 120);
    const title = text(idea.title, 180);
    if (!id || !title) continue;
    ideas.push(Object.freeze({
      id,
      title,
      summary: text(idea.summary, 600) || undefined,
      problem: text(idea.problem, 600) || undefined,
      audience: text(idea.audience, 240) || undefined,
    }));
  }

  return { ideas, requestedCount: rawIdeas.length };
}

function logResultsValidation(event: string, payload: Record<string, unknown>) {
  console.info("Results idea validation diagnostics", { event, ...payload });
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now();
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => null);
    const parsed = parseIdeas(body);

    if (parsed.error === "invalid_ideas") {
      logResultsValidation("results_idea_validation_rejected", { requestedCount: parsed.requestedCount, acceptedCount: 0, reason: parsed.error, durationMs: Date.now() - requestStartedAt });
      return NextResponse.json({ error: "invalid_ideas" }, { status: 400 });
    }

    if (parsed.error === "too_many_ideas") {
      logResultsValidation("results_idea_validation_rejected", { requestedCount: parsed.requestedCount, acceptedCount: 0, maxIdeas: RESULTS_IDEA_VALIDATION_MAX_IDEAS, reason: parsed.error, durationMs: Date.now() - requestStartedAt });
      return NextResponse.json({ error: "too_many_ideas", maxIdeas: RESULTS_IDEA_VALIDATION_MAX_IDEAS }, { status: 413 });
    }

    if (parsed.ideas.length === 0) {
      logResultsValidation("results_idea_validation_empty", { requestedCount: parsed.requestedCount, acceptedCount: 0, durationMs: Date.now() - requestStartedAt });
      return NextResponse.json({ validations: {} });
    }

    const client = getSupabaseUserClient(req);
    const aggregationStartedAt = Date.now();
    const aggregation = await aggregateUserDataMoat(client as unknown as DataMoatAggregationClient, user.id, {
      includeSharedContext: false,
      limitPerSource: 100,
    });
    const aggregationDurationMs = Date.now() - aggregationStartedAt;
    const context = buildIdeaValidationDataMoatContext(aggregation);
    const validationStartedAt = Date.now();
    const validations: Array<readonly [string, ReturnType<typeof stripIdeaValidationDiagnostics>]> = [];
    const validatedById = new Map<string, ReturnType<typeof stripIdeaValidationDiagnostics>>();

    for (const idea of parsed.ideas) {
      const existing = validatedById.get(idea.id);
      if (existing) {
        validations.push([idea.id, existing] as const);
        continue;
      }

      const validation = stripIdeaValidationDiagnostics(validateIdeaAgainstDataMoatContext({
        userId: user.id,
        idea: {
          title: idea.title,
          summary: idea.summary,
          problem: idea.problem,
          audience: idea.audience,
        },
        dataMoatContext: context,
      }));
      validatedById.set(idea.id, validation);
      validations.push([idea.id, validation] as const);
    }

    logResultsValidation("results_idea_validation_completed", {
      requestedCount: parsed.requestedCount,
      acceptedCount: parsed.ideas.length,
      uniqueIdeaCount: validatedById.size,
      successfulValidationCount: validations.length,
      aggregationDurationMs,
      validationDurationMs: Date.now() - validationStartedAt,
      durationMs: Date.now() - requestStartedAt,
    });

    return NextResponse.json({
      validations: Object.fromEntries(validations),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: error.status });
    }

    console.error("Results idea validation failed", {
      event: "results_idea_validation_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
      durationMs: Date.now() - requestStartedAt,
    });

    return NextResponse.json({ error: "results_idea_validation_failed" }, { status: 500 });
  }
}
