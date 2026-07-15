import OpenAI from "openai";
import { buildTrustedUserIntent } from "@/lib/scan/evidence-envelope";
import { buildAnalyzeEvidencePrompt } from "@/lib/scan/safe-prompt-builders";
import {
  ModelJsonError,
  parseStrictModelJson,
  publicModelOutputError,
} from "@/lib/scan/model-json";
import {
  ScanOutputValidationError,
  validateAnalyzeEvidenceOutput,
} from "@/lib/scan/output-validation";
import { AuthError, requireUser } from "../_utils/auth";

function getOpenRouterClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      "X-Title": "SaaSScout",
    },
  });
}

function safeString(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

export async function POST(request: Request) {
  try {
    await requireUser(request);

    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json(
        { error: "OpenRouter API key is missing." },
        { status: 500 },
      );
    }

    const body = await request.json();

    const market = safeString(body.market).slice(0, 120);
    const audience = safeString(body.audience).slice(0, 120);
    const region = safeString(body.region).slice(0, 80);
    const evidence = safeString(body.evidence).slice(0, 6000);

    if (!market && !evidence) {
      return Response.json(
        { error: "Market or evidence is required." },
        { status: 400 },
      );
    }

    const trustedIntent = buildTrustedUserIntent({ market, audience, region });
    const evidenceIds = ["scan-user-evidence"] as const;
    const prompt = buildAnalyzeEvidencePrompt({
      intent: trustedIntent,
      evidence: [
        {
          evidenceId: "scan-user-evidence",
          sourceKind: "pasted_evidence",
          content: evidence,
        },
      ],
    });
    const startedAt = Date.now();

    const completion = await getOpenRouterClient().chat.completions.create({
      model: "openai/gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You analyze evidence and return structured SaaS market intelligence as valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.25,
      max_tokens: 1200,
    });

    const content = completion.choices[0]?.message?.content;

    try {
      const parsed = parseStrictModelJson(content || "");
      const analysis = validateAnalyzeEvidenceOutput(parsed, { evidenceIds });

      console.info("Scan model output validation", {
        event: "scan_model_output_validation",
        route: "analyze-evidence",
        promptVersion: "scan-analyze-evidence@1",
        model: "openai/gpt-4.1-mini",
        validationStatus: "passed",
        groundingStatus: "passed",
        totalClaims: analysis.groundingSummary.totalClaims,
        evidenceGroundedClaims: analysis.groundingSummary.evidenceGroundedClaims,
        inferenceClaims: analysis.groundingSummary.inferenceClaims,
        groundingCoverage: analysis.groundingSummary.groundingCoverage,
        distinctEvidenceIdsReferenced: analysis.groundingSummary.distinctEvidenceIdsReferenced,
        durationMs: Date.now() - startedAt,
      });

      return Response.json({ analysis });
    } catch (validationError) {
      if (
        validationError instanceof ModelJsonError ||
        validationError instanceof ScanOutputValidationError
      ) {
        console.warn("Scan model output validation", {
          event: "scan_model_output_validation",
          route: "analyze-evidence",
          promptVersion: "scan-analyze-evidence@1",
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

        return Response.json(publicModelOutputError(validationError.code), {
          status: 502,
        });
      }

      throw validationError;
    }
  } catch (error) {
    console.error("Analyze evidence error:", error);

    if (error instanceof AuthError) {
      return Response.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to analyze evidence.";

    return Response.json({ error: message }, { status: 500 });
  }
}
