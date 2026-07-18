import "server-only";

import OpenAI from "openai";

import type {
  EvidenceEnvelopeInput,
  TrustedUserIntent,
} from "./evidence-envelope.ts";
import { ModelJsonError, parseStrictModelJson } from "./model-json.ts";
import {
  ScanOutputValidationError,
  validateAnalyzeEvidenceOutput,
  type AnalyzeEvidenceOutput,
} from "./output-validation.ts";
import {
  computeScanQualityDiagnostics,
  type ScanQualityDiagnostics,
  type ScanQualityDiagnosticEvidence,
} from "./quality-diagnostics.ts";
import { buildAnalyzeEvidencePrompt } from "./safe-prompt-builders.ts";
import {
  calibrateAnalyzeEvidenceConfidence,
  type ScanCalibratedScore,
} from "./score-calibration.ts";

export const PROBLEM_INTELLIGENCE_PROMPT_VERSION =
  "scan-analyze-evidence@1" as const;

export const SCAN_MODEL_ID = "openai/gpt-4.1-mini" as const;

type ChatClient = Pick<OpenAI["chat"]["completions"], "create">;

export type ProblemIntelligenceFailureKind =
  | "generation"
  | "json"
  | "validation"
  | "grounding"
  | "diagnostics"
  | "calibration"
  | "configuration";

export class ProblemIntelligenceServiceError extends Error {
  readonly kind: ProblemIntelligenceFailureKind;
  readonly code: string;

  constructor(kind: ProblemIntelligenceFailureKind, code: string) {
    super("Problem Intelligence could not be safely generated.");

    this.name = "ProblemIntelligenceServiceError";
    this.kind = kind;
    this.code = code;
  }
}

export type ProblemIntelligenceServiceInput = Readonly<{
  intent: TrustedUserIntent;
  evidence: readonly EvidenceEnvelopeInput[];
  allowedEvidenceIds: readonly string[];
  model?: string;
  client?: ChatClient;
  now?: () => number;
}>;

export type ProblemIntelligenceModelOutput = string;

export type ProblemIntelligenceTechnicalMetadata = Readonly<{
  promptVersion: typeof PROBLEM_INTELLIGENCE_PROMPT_VERSION;
  model: string;
  validatorVersion: "scan-output-validation@1";
  calibrationVersion: "scan-calibration@1";
}>;

export type ProblemIntelligenceServiceResult = Readonly<{
  output: AnalyzeEvidenceOutput;
  diagnostics: ScanQualityDiagnostics;
  calibration: ScanCalibratedScore;
  technicalMetadata: ProblemIntelligenceTechnicalMetadata;
  durationMs: number;
}>;

export function createOpenRouterClient() {
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

function sourceKindForDiagnostics(
  kind: EvidenceEnvelopeInput["sourceKind"],
): ScanQualityDiagnosticEvidence["sourceKind"] {
  return kind === "uploaded_document" || !kind
    ? "pasted_evidence"
    : kind;
}

export async function generateProblemIntelligenceModelOutput(
  input: ProblemIntelligenceServiceInput,
): Promise<ProblemIntelligenceModelOutput> {
  const model = input.model ?? SCAN_MODEL_ID;

  const client =
    input.client ?? createOpenRouterClient().chat.completions;

  if (!process.env.OPENROUTER_API_KEY && !input.client) {
    throw new ProblemIntelligenceServiceError(
      "configuration",
      "provider_configuration_missing",
    );
  }

  try {
    const completion = await client.create({
      model,

      messages: [
        {
          role: "system",
          content:
            "You analyze evidence and return structured SaaS market intelligence. Return exactly one valid JSON object. Do not use Markdown fences. Do not include explanations, comments, or text outside the JSON object.",
        },
        {
          role: "user",
          content: buildAnalyzeEvidencePrompt({
            intent: input.intent,
            evidence: [...input.evidence],
          }),
        },
      ],

      response_format: {
        type: "json_object",
      },

      temperature: 0.1,
      max_tokens: 2400,
    });

    const choice = completion.choices[0];
    const content = String(choice?.message?.content ?? "");

    console.info("Scan model generation diagnostics", {
      event: "scan_model_generation_diagnostics",
      model,
      finishReason: choice?.finish_reason ?? "unknown",
      contentLength: content.length,
      startsWith: content.slice(0, 100),
      endsWith: content.slice(-100),
    });

    return content;
  } catch (error) {
    console.error("Scan model provider error", {
      event: "scan_model_provider_error",
      model,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Unknown provider error",
    });

    throw new ProblemIntelligenceServiceError(
      "generation",
      "provider_generation_failed",
    );
  }
}

export function validateProblemIntelligenceModelOutput(
  input: ProblemIntelligenceServiceInput,
  modelOutput: ProblemIntelligenceModelOutput,
): AnalyzeEvidenceOutput {
  try {
    const parsed = parseStrictModelJson(modelOutput);

    return validateAnalyzeEvidenceOutput(parsed, {
      evidenceIds: input.allowedEvidenceIds,
    });
  } catch (error) {
    if (error instanceof ModelJsonError) {
      throw new ProblemIntelligenceServiceError(
        "json",
        error.code,
      );
    }

    if (error instanceof ScanOutputValidationError) {
      const failureKind: ProblemIntelligenceFailureKind =
        error.code.startsWith("model_grounding_")
          ? "grounding"
          : "validation";

      throw new ProblemIntelligenceServiceError(
        failureKind,
        error.code,
      );
    }

    throw error;
  }
}

export function computeProblemIntelligenceDiagnostics(
  input: ProblemIntelligenceServiceInput,
  output: AnalyzeEvidenceOutput,
): ScanQualityDiagnostics {
  try {
    return computeScanQualityDiagnostics({
      output,

      evidence: input.evidence.map((item) => ({
        evidenceId: item.evidenceId ?? "scan-user-evidence",
        sourceKind: sourceKindForDiagnostics(item.sourceKind),
      })),
    });
  } catch {
    throw new ProblemIntelligenceServiceError(
      "diagnostics",
      "problem_diagnostics_failed",
    );
  }
}

export function computeProblemIntelligenceCalibration(
  output: AnalyzeEvidenceOutput,
  diagnostics: ScanQualityDiagnostics,
): ScanCalibratedScore {
  try {
    return calibrateAnalyzeEvidenceConfidence({
      output,
      diagnostics,
    }).confidence;
  } catch {
    throw new ProblemIntelligenceServiceError(
      "calibration",
      "problem_calibration_failed",
    );
  }
}

export function problemIntelligenceTechnicalMetadata(
  input: ProblemIntelligenceServiceInput,
  calibration: ScanCalibratedScore,
): ProblemIntelligenceTechnicalMetadata {
  return Object.freeze({
    promptVersion: PROBLEM_INTELLIGENCE_PROMPT_VERSION,
    model: input.model ?? SCAN_MODEL_ID,
    validatorVersion: "scan-output-validation@1" as const,
    calibrationVersion: calibration.version,
  });
}

export async function generateProblemIntelligence(
  input: ProblemIntelligenceServiceInput,
): Promise<ProblemIntelligenceServiceResult> {
  const startedAt = input.now?.() ?? Date.now();

  let raw: ProblemIntelligenceModelOutput | undefined =
    await generateProblemIntelligenceModelOutput(input);

  const output = validateProblemIntelligenceModelOutput(
    input,
    raw,
  );

  raw = undefined;

  const diagnostics = computeProblemIntelligenceDiagnostics(
    input,
    output,
  );

  const calibration = computeProblemIntelligenceCalibration(
    output,
    diagnostics,
  );

  return Object.freeze({
    output,
    diagnostics,
    calibration,
    technicalMetadata: problemIntelligenceTechnicalMetadata(
      input,
      calibration,
    ),
    durationMs: Math.max(
      0,
      (input.now?.() ?? Date.now()) - startedAt,
    ),
  });
}