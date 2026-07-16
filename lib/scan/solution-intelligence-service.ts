import "server-only";

import type OpenAI from "openai";
import { createOpenRouterClient, SCAN_MODEL_ID } from "./problem-intelligence-service.ts";
import { buildSolutionIntelligencePrompt, type DerivedAnalysisContext } from "./safe-prompt-builders.ts";
import { ModelJsonError, parseStrictModelJson } from "./model-json.ts";
import { computeSolutionIntelligenceDiagnostics, SOLUTION_INTELLIGENCE_VERSION, SolutionIntelligenceValidationError, validateSolutionIntelligenceOutput, type SolutionIntelligenceDiagnostics, type SolutionIntelligenceResult } from "./solution-intelligence.ts";
import type { EvidenceEnvelopeInput, TrustedUserIntent } from "./evidence-envelope.ts";

type ChatClient = Pick<OpenAI["chat"]["completions"], "create">;
export type SolutionIntelligenceFailureKind = "generation" | "json" | "validation" | "grounding" | "diagnostics" | "configuration";
export class SolutionIntelligenceServiceError extends Error { readonly kind: SolutionIntelligenceFailureKind; readonly code: string; constructor(kind: SolutionIntelligenceFailureKind, code: string) { super("Solution Intelligence could not be safely generated."); this.name = "SolutionIntelligenceServiceError"; this.kind = kind; this.code = code; } }
export type SolutionIntelligenceServiceInput = Readonly<{ intent: TrustedUserIntent; evidence: readonly EvidenceEnvelopeInput[]; allowedEvidenceIds: readonly string[]; derivedProblemContext?: DerivedAnalysisContext; model?: string; client?: ChatClient; now?: () => number }>;
export type SolutionIntelligenceModelOutput = string;
export type SolutionIntelligenceTechnicalMetadata = Readonly<{ solutionIntelligenceVersion: typeof SOLUTION_INTELLIGENCE_VERSION; promptVersion: typeof SOLUTION_INTELLIGENCE_VERSION; model: string; validatorVersion: "scan-solution-intelligence-validator@1" }>;
export type SolutionIntelligenceServiceResult = Readonly<{ output: SolutionIntelligenceResult; diagnostics: SolutionIntelligenceDiagnostics; technicalMetadata: SolutionIntelligenceTechnicalMetadata; durationMs: number }>;

export async function generateSolutionIntelligenceModelOutput(input: SolutionIntelligenceServiceInput): Promise<SolutionIntelligenceModelOutput> {
  const model = input.model ?? SCAN_MODEL_ID;
  const client = input.client ?? createOpenRouterClient().chat.completions;
  if (!process.env.OPENROUTER_API_KEY && !input.client) throw new SolutionIntelligenceServiceError("configuration", "provider_configuration_missing");
  try {
    const completion = await client.create({ model, messages: [{ role: "system", content: "You produce evidence-grounded Solution Intelligence as strict JSON only." }, { role: "user", content: buildSolutionIntelligencePrompt({ intent: input.intent, evidence: [...input.evidence], derivedAnalysis: input.derivedProblemContext }) }], temperature: 0.25, max_tokens: 3200 });
    return String(completion.choices[0]?.message?.content ?? "");
  } catch { throw new SolutionIntelligenceServiceError("generation", "provider_generation_failed"); }
}

export function validateSolutionIntelligenceModelOutput(input: SolutionIntelligenceServiceInput, modelOutput: SolutionIntelligenceModelOutput): SolutionIntelligenceResult {
  try {
    return validateSolutionIntelligenceOutput(parseStrictModelJson(modelOutput), { evidenceIds: input.allowedEvidenceIds });
  } catch (error) {
    if (error instanceof ModelJsonError) throw new SolutionIntelligenceServiceError("json", error.code);
    if (error instanceof SolutionIntelligenceValidationError) throw new SolutionIntelligenceServiceError(error.code.includes("grounding") ? "grounding" : "validation", error.code);
    throw error;
  }
}

export function computeValidatedSolutionIntelligenceDiagnostics(output: SolutionIntelligenceResult): SolutionIntelligenceDiagnostics {
  try { return computeSolutionIntelligenceDiagnostics(output); }
  catch { throw new SolutionIntelligenceServiceError("diagnostics", "solution_diagnostics_failed"); }
}

export function solutionIntelligenceTechnicalMetadata(input: SolutionIntelligenceServiceInput): SolutionIntelligenceTechnicalMetadata {
  return Object.freeze({ solutionIntelligenceVersion: SOLUTION_INTELLIGENCE_VERSION, promptVersion: SOLUTION_INTELLIGENCE_VERSION, model: input.model ?? SCAN_MODEL_ID, validatorVersion: "scan-solution-intelligence-validator@1" as const });
}

export async function generateSolutionIntelligence(input: SolutionIntelligenceServiceInput): Promise<SolutionIntelligenceServiceResult> {
  const startedAt = input.now?.() ?? Date.now();
  let raw: SolutionIntelligenceModelOutput | undefined = await generateSolutionIntelligenceModelOutput(input);
  const output = validateSolutionIntelligenceModelOutput(input, raw);
  raw = undefined;
  const diagnostics = computeValidatedSolutionIntelligenceDiagnostics(output);
  return Object.freeze({ output, diagnostics, technicalMetadata: solutionIntelligenceTechnicalMetadata(input), durationMs: Math.max(0, (input.now?.() ?? Date.now()) - startedAt) });
}
