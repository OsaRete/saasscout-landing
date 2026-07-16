import "server-only";

import OpenAI from "openai";
import { buildAnalyzeEvidencePrompt } from "./safe-prompt-builders.ts";
import { ModelJsonError, parseStrictModelJson } from "./model-json.ts";
import { computeScanQualityDiagnostics, type ScanQualityDiagnostics, type ScanQualityDiagnosticEvidence } from "./quality-diagnostics.ts";
import { calibrateAnalyzeEvidenceConfidence, type ScanCalibratedScore } from "./score-calibration.ts";
import { ScanOutputValidationError, validateAnalyzeEvidenceOutput, type AnalyzeEvidenceOutput } from "./output-validation.ts";
import type { EvidenceEnvelopeInput, TrustedUserIntent } from "./evidence-envelope.ts";

export const PROBLEM_INTELLIGENCE_PROMPT_VERSION = "scan-analyze-evidence@1" as const;
export const SCAN_MODEL_ID = "openai/gpt-4.1-mini" as const;

type ChatClient = Pick<OpenAI["chat"]["completions"], "create">;
export type ProblemIntelligenceFailureKind = "generation" | "json" | "validation" | "grounding" | "configuration";
export class ProblemIntelligenceServiceError extends Error { readonly kind: ProblemIntelligenceFailureKind; readonly code: string; constructor(kind: ProblemIntelligenceFailureKind, code: string) { super("Problem Intelligence could not be safely generated."); this.name = "ProblemIntelligenceServiceError"; this.kind = kind; this.code = code; } }
export type ProblemIntelligenceServiceInput = Readonly<{ intent: TrustedUserIntent; evidence: readonly EvidenceEnvelopeInput[]; allowedEvidenceIds: readonly string[]; model?: string; client?: ChatClient; now?: () => number }>;
export type ProblemIntelligenceServiceResult = Readonly<{ output: AnalyzeEvidenceOutput; diagnostics: ScanQualityDiagnostics; calibration: ScanCalibratedScore; technicalMetadata: Readonly<{ promptVersion: typeof PROBLEM_INTELLIGENCE_PROMPT_VERSION; model: string; validatorVersion: "scan-output-validation@1"; calibrationVersion: "scan-calibration@1" }>; durationMs: number }>;

export function createOpenRouterClient() { return new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://trysaasscout.com", "X-Title": "SaaSScout" } }); }

function sourceKindForDiagnostics(kind: EvidenceEnvelopeInput["sourceKind"]): ScanQualityDiagnosticEvidence["sourceKind"] { return kind === "uploaded_document" || !kind ? "pasted_evidence" : kind; }

export async function generateProblemIntelligence(input: ProblemIntelligenceServiceInput): Promise<ProblemIntelligenceServiceResult> {
  const startedAt = input.now?.() ?? Date.now();
  const model = input.model ?? SCAN_MODEL_ID;
  const client = input.client ?? createOpenRouterClient().chat.completions;
  if (!process.env.OPENROUTER_API_KEY && !input.client) throw new ProblemIntelligenceServiceError("configuration", "provider_configuration_missing");
  let content = "";
  try {
    const completion = await client.create({ model, messages: [{ role: "system", content: "You analyze evidence and return structured SaaS market intelligence as valid JSON only." }, { role: "user", content: buildAnalyzeEvidencePrompt({ intent: input.intent, evidence: [...input.evidence] }) }], temperature: 0.25, max_tokens: 1200 });
    content = String(completion.choices[0]?.message?.content ?? "");
  } catch { throw new ProblemIntelligenceServiceError("generation", "provider_generation_failed"); }
  try {
    const parsed = parseStrictModelJson(content);
    const output = validateAnalyzeEvidenceOutput(parsed, { evidenceIds: input.allowedEvidenceIds });
    const diagnostics = computeScanQualityDiagnostics({ output, evidence: input.evidence.map((item) => ({ evidenceId: item.evidenceId ?? "scan-user-evidence", sourceKind: sourceKindForDiagnostics(item.sourceKind) })) });
    const calibration = calibrateAnalyzeEvidenceConfidence({ output, diagnostics }).confidence;
    return Object.freeze({ output, diagnostics, calibration, technicalMetadata: Object.freeze({ promptVersion: PROBLEM_INTELLIGENCE_PROMPT_VERSION, model, validatorVersion: "scan-output-validation@1" as const, calibrationVersion: calibration.version }), durationMs: Math.max(0, (input.now?.() ?? Date.now()) - startedAt) });
  } catch (error) {
    if (error instanceof ModelJsonError) throw new ProblemIntelligenceServiceError("json", error.code);
    if (error instanceof ScanOutputValidationError) throw new ProblemIntelligenceServiceError(error.code.startsWith("model_grounding_") ? "grounding" : "validation", error.code);
    throw error;
  }
}
