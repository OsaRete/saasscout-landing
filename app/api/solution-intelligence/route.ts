import OpenAI from "openai";
import { buildTrustedUserIntent } from "@/lib/scan/evidence-envelope";
import { buildSolutionIntelligencePrompt } from "@/lib/scan/safe-prompt-builders";
import { ModelJsonError, parseStrictModelJson } from "@/lib/scan/model-json";
import {
  computeSolutionIntelligenceDiagnostics,
  publicSolutionIntelligenceError,
  SolutionIntelligenceValidationError,
  validateSolutionIntelligenceOutput,
} from "@/lib/scan/solution-intelligence";
import { AuthError, requireUser } from "../_utils/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOpenRouterClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SITE_URL || "https://trysaasscout.com",
      "X-Title": "SaaSScout",
    },
  });
}

function safeString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    await requireUser(request);
    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json(
        { success: false, error: "OpenRouter API key is missing." },
        { status: 500 },
      );
    }

    const body = await request.json();
    const market = safeString(body.market, 120);
    const audience = safeString(body.audience, 120);
    const region = safeString(body.region, 80);
    const evidence = safeString(body.evidence, 6000);
    const derivedAnalysisContent = safeString(body.derivedAnalysis, 4000);

    if (!market && !evidence) {
      return Response.json(
        { success: false, error: "Market or evidence is required." },
        { status: 400 },
      );
    }

    const evidenceIds = ["scan-user-evidence"] as const;
    const prompt = buildSolutionIntelligencePrompt({
      intent: buildTrustedUserIntent({ market, audience, region }),
      evidence: [
        {
          evidenceId: "scan-user-evidence",
          sourceKind: "pasted_evidence",
          content: evidence,
        },
      ],
      ...(derivedAnalysisContent
        ? { derivedAnalysis: { content: derivedAnalysisContent } }
        : {}),
    });
    const startedAt = Date.now();

    const completion = await getOpenRouterClient().chat.completions.create({
      model: "openai/gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You produce evidence-grounded Solution Intelligence as strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.25,
      max_tokens: 3200,
    });

    try {
      const parsed = parseStrictModelJson(
        completion.choices[0]?.message?.content || "",
      );
      const solutionIntelligence = validateSolutionIntelligenceOutput(parsed, {
        evidenceIds,
      });
      const diagnostics =
        computeSolutionIntelligenceDiagnostics(solutionIntelligence);
      console.info("Solution Intelligence validation", {
        event: "solution_intelligence_validation",
        route: "solution-intelligence",
        promptVersion: "scan-solution-intelligence@1",
        model: "openai/gpt-4.1-mini",
        validationStatus: "passed",
        durationMs: Date.now() - startedAt,
        diagnostics,
      });
      return Response.json({
        success: true,
        solutionIntelligence,
        diagnostics,
      });
    } catch (validationError) {
      if (
        validationError instanceof ModelJsonError ||
        validationError instanceof SolutionIntelligenceValidationError
      ) {
        const code =
          validationError instanceof ModelJsonError
            ? "solution_model_schema_validation_failed"
            : validationError.code;
        console.warn("Solution Intelligence validation", {
          event: "solution_intelligence_validation",
          route: "solution-intelligence",
          promptVersion: "scan-solution-intelligence@1",
          model: "openai/gpt-4.1-mini",
          validationStatus: "failed",
          validationErrorCode: code,
          invalidFieldCount:
            validationError instanceof SolutionIntelligenceValidationError
              ? validationError.issues.length
              : 0,
          invalidFieldNames:
            validationError instanceof SolutionIntelligenceValidationError
              ? validationError.issues.map((item) => item.path).slice(0, 20)
              : [],
        });
        return Response.json(publicSolutionIntelligenceError(code), {
          status: 502,
        });
      }
      throw validationError;
    }
  } catch (error) {
    console.error("Solution Intelligence error:", error);
    if (error instanceof AuthError)
      return Response.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not generate Solution Intelligence.",
      },
      { status: 500 },
    );
  }
}
