import "server-only";

import type OpenAI from "openai";
import { createOpenRouterClient, SCAN_MODEL_ID } from "./problem-intelligence-service.ts";
import { buildSolutionIntelligencePrompt, type DerivedAnalysisContext } from "./safe-prompt-builders.ts";
import { ModelJsonError, parseStrictModelJson } from "./model-json.ts";
import { computeSolutionIntelligenceDiagnostics, SOLUTION_INTELLIGENCE_VERSION, SolutionIntelligenceValidationError, validateSolutionIntelligenceOutput, type SolutionIntelligenceDiagnostics, type SolutionIntelligenceResult } from "./solution-intelligence.ts";
import type { EvidenceEnvelopeInput, TrustedUserIntent } from "./evidence-envelope.ts";

type ChatClient = Pick<OpenAI["chat"]["completions"], "create">;
export type SolutionIntelligenceFailureKind = "generation" | "json" | "validation" | "grounding" | "configuration";
export class SolutionIntelligenceServiceError extends Error { readonly kind: SolutionIntelligenceFailureKind; readonly code: string; constructor(kind: SolutionIntelligenceFailureKind, code: string) { super("Solution Intelligence could not be safely generated."); this.name = "SolutionIntelligenceServiceError"; this.kind = kind; this.code = code; } }
export type SolutionIntelligenceServiceInput = Readonly<{ intent: TrustedUserIntent; evidence: readonly EvidenceEnvelopeInput[]; allowedEvidenceIds: readonly string[]; derivedProblemContext?: DerivedAnalysisContext; model?: string; client?: ChatClient; now?: () => number }>;
export type SolutionIntelligenceServiceResult = Readonly<{ output: SolutionIntelligenceResult; diagnostics: SolutionIntelligenceDiagnostics; technicalMetadata: Readonly<{ solutionIntelligenceVersion: typeof SOLUTION_INTELLIGENCE_VERSION; promptVersion: typeof SOLUTION_INTELLIGENCE_VERSION; model: string; validatorVersion: "scan-solution-intelligence-validator@1" }>; durationMs: number }>;

export async function generateSolutionIntelligence(input: SolutionIntelligenceServiceInput): Promise<SolutionIntelligenceServiceResult> {
  const startedAt = input.now?.() ?? Date.now();
  const model = input.model ?? SCAN_MODEL_ID;
  const client = input.client ?? createOpenRouterClient().chat.completions;
  if (!process.env.OPENROUTER_API_KEY && !input.client) throw new SolutionIntelligenceServiceError("configuration", "provider_configuration_missing");
  let content = "";
  try {
    const completion = await client.create({ model, messages: [{ role: "system", content: "You produce evidence-grounded Solution Intelligence as strict JSON only." }, { role: "user", content: buildSolutionIntelligencePrompt({ intent: input.intent, evidence: [...input.evidence], derivedAnalysis: input.derivedProblemContext }) }], temperature: 0.25, max_tokens: 3200 });
    content = String(completion.choices[0]?.message?.content ?? "");
  } catch { throw new SolutionIntelligenceServiceError("generation", "provider_generation_failed"); }
  try {
    const output = validateSolutionIntelligenceOutput(parseStrictModelJson(content), { evidenceIds: input.allowedEvidenceIds });
    const diagnostics = computeSolutionIntelligenceDiagnostics(output);
    return Object.freeze({ output, diagnostics, technicalMetadata: Object.freeze({ solutionIntelligenceVersion: SOLUTION_INTELLIGENCE_VERSION, promptVersion: SOLUTION_INTELLIGENCE_VERSION, model, validatorVersion: "scan-solution-intelligence-validator@1" as const }), durationMs: Math.max(0, (input.now?.() ?? Date.now()) - startedAt) });
  } catch (error) {
    if (error instanceof ModelJsonError) throw new SolutionIntelligenceServiceError("json", error.code);
    if (error instanceof SolutionIntelligenceValidationError) throw new SolutionIntelligenceServiceError(error.code.includes("grounding") ? "grounding" : "validation", error.code);
    throw error;
  }
}
