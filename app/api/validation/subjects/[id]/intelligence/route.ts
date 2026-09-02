import { AuthError, requireUser } from "@/app/api/_utils/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { ValidationIntelligenceService } from "@/lib/validation/intelligence/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, id: string, analyze: boolean) {
  try {
    const user = await requireUser(request);
    const service = new ValidationIntelligenceService(
      createSupabaseAdminClient(),
    );
    return Response.json(
      {
        data: analyze
          ? await service.analyze(user.id, id)
          : await service.status(user.id, id),
      },
      { status: analyze ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof AuthError)
      return Response.json(
        {
          error: {
            code: "unauthenticated",
            message: "Authentication required.",
          },
        },
        { status: 401 },
      );
    const e = error as Error & { status?: number };
    return Response.json(
      {
        error: {
          code:
            e.message === "hypothesis_required"
              ? "hypothesis_required"
              : e.message === "not_found"
                ? "not_found"
                : "analysis_unavailable",
          message:
            e.message === "hypothesis_required"
              ? "Define a hypothesis before analyzing evidence."
              : e.message === "not_found"
                ? "Validation workspace not found."
                : "Validation Intelligence is temporarily unavailable. Your evidence was not changed.",
        },
      },
      { status: e.status || 500 },
    );
  }
}
export async function GET(
  request: Request,
  context: RouteContext<"/api/validation/subjects/[id]/intelligence">,
) {
  return handle(request, (await context.params).id, false);
}
export async function POST(
  request: Request,
  context: RouteContext<"/api/validation/subjects/[id]/intelligence">,
) {
  return handle(request, (await context.params).id, true);
}
