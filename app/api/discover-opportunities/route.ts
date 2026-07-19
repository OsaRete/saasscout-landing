// app/api/discover-opportunities/route.ts

import { NextResponse } from "next/server";
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

    const result = await discoverOpportunitiesWorkflow(user.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Discover opportunities error:", error);

    if (error instanceof AuthError) {
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
