import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { AuthError, requireUser } from "../../_utils/auth";
import { stripIdeaValidationDiagnostics, validateIdea } from "@/lib/idea-validation";
import type { DataMoatAggregationClient } from "@/lib/data-moat/aggregation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ValidationRequestIdea = Readonly<{
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  problem?: unknown;
  audience?: unknown;
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

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json()) as { ideas?: ValidationRequestIdea[] };
    const ideas = Array.isArray(body.ideas) ? body.ideas.slice(0, 30) : [];

    const client = getSupabaseUserClient(req);
    const validations = await Promise.all(
      ideas.map(async (idea) => {
        const id = text(idea.id, 120);
        const title = text(idea.title, 180);

        if (!id || !title) return null;

        const validation = await validateIdea(client as unknown as DataMoatAggregationClient, {
          userId: user.id,
          idea: {
            title,
            summary: text(idea.summary, 600) || undefined,
            problem: text(idea.problem, 600) || undefined,
            audience: text(idea.audience, 240) || undefined,
          },
          includeSharedContext: false,
          limitPerSource: 100,
        });

        return [id, stripIdeaValidationDiagnostics(validation)] as const;
      }),
    );

    return NextResponse.json({
      validations: Object.fromEntries(validations.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: error.status });
    }

    console.error("Results idea validation failed", {
      event: "results_idea_validation_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return NextResponse.json({ error: "results_idea_validation_failed" }, { status: 500 });
  }
}
