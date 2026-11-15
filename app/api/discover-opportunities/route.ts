import { withProviderBudget, ProviderBudgetError } from "../../../lib/spending/provider-budget.ts";
// app/api/discover-opportunities/route.ts

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { AuthError, requireUser } from "../_utils/auth";
import {
  discoverOpportunitiesWorkflow,
  DiscoverOpportunitiesWorkflowError,
} from "@/lib/intelligence/discover-opportunities-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);

    const requestId = req.headers.get("idempotency-key");
    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new AuthError("A valid Discovery request ID is required.", 400);
    }
    const client = createSupabaseAdminClient();
    const { data: admission, error } = await client.rpc("application_admit_discovery", {
      p_user_id: user.id, p_request_id: requestId,
    });
    if (error || typeof admission !== "string") throw new AuthError("Discovery admission unavailable.", 503);
    if (admission === "limit_exceeded") throw new AuthError("Three Discovery generations are available per UTC calendar month.", 429);
    if (admission === "already_admitted") throw new AuthError("This Discovery request was already admitted. Check Discovery history before starting another.", 409);
    if (admission !== "admitted") throw new AuthError("Discovery access denied.", 403);
    // Once admitted, an ambiguous failure remains charged and this key never dispatches again.
    let result;
    try {
      result = await withProviderBudget({ userId: user.id, workflow: "discovery", requestId: requestId.toLowerCase() }, () => discoverOpportunitiesWorkflow(user.id));
    } catch (failure) {
      await client.from("application_discovery_admissions").update({ status: "failed" }).eq("user_id", user.id).eq("request_id", requestId);
      throw failure;
    }
    await client.from("application_discovery_admissions").update({ status: "completed" }).eq("user_id", user.id).eq("request_id", requestId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Discover opportunities error:", error);

    if (error instanceof AuthError || error instanceof ProviderBudgetError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    if (error instanceof DiscoverOpportunitiesWorkflowError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Could not discover opportunities.",
      },
      { status: 500 }
    );
  }
}
