import OpenAI from "openai";
import { NextResponse } from "next/server";
import { buildTrustedUserIntent } from "@/lib/scan/evidence-envelope";
import { buildGenerateOpportunitiesPrompt } from "@/lib/scan/safe-prompt-builders";
import {
  ModelJsonError,
  parseStrictModelJson,
  publicModelOutputError,
} from "@/lib/scan/model-json";
import {
  ScanOutputValidationError,
  validateGenerateOpportunitiesOutput,
} from "@/lib/scan/output-validation";
import { AuthError, requireUser } from "../_utils/auth";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function splitDerivedAnalysisContext(evidence: string) {
  const marker = "Evidence Intelligence:";
  const markerIndex = evidence.indexOf(marker);
  if (markerIndex === -1) return { evidence };

  const originalPrefix = "Original evidence:";
  const original = evidence.slice(0, markerIndex).replace(originalPrefix, "").trim();
  const derived = evidence.slice(markerIndex + marker.length).trim();
  return {
    evidence: original || evidence,
    derivedAnalysis: derived ? { content: derived } : undefined,
  };
}


export async function POST(req: Request) {
  try {
    await requireUser(req);

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is missing.");
    }

    const body = await req.json();

    const market = String(body.market || "").trim();
    const audience = String(body.audience || "").trim();
    const region = String(body.region || "").trim();
    const rawEvidence = String(body.evidence || "").trim();
    const { evidence, derivedAnalysis } = splitDerivedAnalysisContext(rawEvidence);

    if (!market && !evidence) {
      return NextResponse.json(
        {
          success: false,
          error: "Market or evidence is required.",
        },
        { status: 400 },
      );
    }

    const trustedIntent = buildTrustedUserIntent({ market, audience, region });
    const evidenceIds = ["scan-user-evidence"] as const;
    const prompt = buildGenerateOpportunitiesPrompt({
      intent: trustedIntent,
      evidence: [
        {
          evidenceId: "scan-user-evidence",
          sourceKind: "pasted_evidence",
          content: evidence,
        },
      ],
      derivedAnalysis,
    });
    const startedAt = Date.now();

    const completion = await getOpenRouterClient().chat.completions.create({
      model: "openai/gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You generate SaaS opportunity ideas from market pain evidence. Always return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.35,
      max_tokens: 2200,
    });

    const content = completion.choices[0]?.message?.content;

    try {
      const parsed = parseStrictModelJson(content || "");
      const { opportunities, groundingSummary } = validateGenerateOpportunitiesOutput(parsed, { evidenceIds });

      console.info("Scan model output validation", {
        event: "scan_model_output_validation",
        route: "generate-opportunities",
        promptVersion: "scan-generate-opportunities@1",
        model: "openai/gpt-4.1-mini",
        validationStatus: "passed",
        groundingStatus: "passed",
        totalClaims: groundingSummary.totalClaims,
        evidenceGroundedClaims: groundingSummary.evidenceGroundedClaims,
        inferenceClaims: groundingSummary.inferenceClaims,
        groundingCoverage: groundingSummary.groundingCoverage,
        distinctEvidenceIdsReferenced: groundingSummary.distinctEvidenceIdsReferenced,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({
        success: true,
        opportunities,
        grounding: { opportunities: opportunities.map((opportunity) => opportunity.grounding) },
      });
    } catch (validationError) {
      if (
        validationError instanceof ModelJsonError ||
        validationError instanceof ScanOutputValidationError
      ) {
        console.warn("Scan model output validation", {
          event: "scan_model_output_validation",
          route: "generate-opportunities",
          promptVersion: "scan-generate-opportunities@1",
          model: "openai/gpt-4.1-mini",
          validationStatus: "failed",
          groundingStatus: validationError.code.startsWith("model_grounding_") ? "failed" : "not_applicable",
          validationErrorCode: validationError.code,
          invalidFieldCount:
            validationError instanceof ScanOutputValidationError
              ? validationError.issues.length
              : 0,
          invalidFieldNames:
            validationError instanceof ScanOutputValidationError
              ? validationError.issues.map((issue) => issue.path).slice(0, 20)
              : [],
        });

        return NextResponse.json(publicModelOutputError(validationError.code), {
          status: 502,
        });
      }

      throw validationError;
    }
  } catch (error) {
    console.error("Generate opportunities error:", error);

    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Could not generate opportunities.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
