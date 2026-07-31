import "server-only";

import type OpenAI from "openai";
import { createOpenRouterClient, SCAN_MODEL_ID } from "./problem-intelligence-service.ts";
import { buildSolutionIntelligencePrompt, type DerivedAnalysisContext } from "./safe-prompt-builders.ts";
import { ModelJsonError, parseStrictModelJson } from "./model-json.ts";
import { computeSolutionIntelligenceDiagnostics, SOLUTION_INTELLIGENCE_VERSION, SolutionIntelligenceValidationError, validateSolutionIntelligenceOutput, type SolutionIntelligenceDiagnostics, type SolutionIntelligenceResult } from "./solution-intelligence.ts";
import type { EvidenceEnvelopeInput, TrustedUserIntent } from "./evidence-envelope.ts";

type ChatClient = Pick<OpenAI["chat"]["completions"], "create">;
export type SolutionIntelligenceFailureKind = "generation" | "json" | "validation" | "grounding" | "diagnostics" | "configuration";
export type SolutionGroundingFailureDiagnostics = Readonly<{ validationReason: string; failingPath: string; failingOpportunityIndex?: number; failingSolutionIndex?: number; suppliedEvidenceRefCount: number; recognizedEvidenceRefCount: number; unknownEvidenceIds: readonly string[]; allowedEvidenceIdCount: number }>;
export class SolutionIntelligenceServiceError extends Error { readonly kind: SolutionIntelligenceFailureKind; readonly code: string; readonly diagnostics?: SolutionGroundingFailureDiagnostics; constructor(kind: SolutionIntelligenceFailureKind, code: string, diagnostics?: SolutionGroundingFailureDiagnostics) { super("Solution Intelligence could not be safely generated."); this.name = "SolutionIntelligenceServiceError"; this.kind = kind; this.code = code; this.diagnostics = diagnostics; } }
export type SolutionIntelligenceServiceInput = Readonly<{ intent: TrustedUserIntent; evidence: readonly EvidenceEnvelopeInput[]; allowedEvidenceIds: readonly string[]; derivedProblemContext?: DerivedAnalysisContext; model?: string; client?: ChatClient; now?: () => number }>;
export type SolutionIntelligenceModelOutput = string;
export type SolutionIntelligenceTechnicalMetadata = Readonly<{ solutionIntelligenceVersion: typeof SOLUTION_INTELLIGENCE_VERSION; promptVersion: typeof SOLUTION_INTELLIGENCE_VERSION; model: string; validatorVersion: "scan-solution-intelligence-validator@1" }>;
export type SolutionIntelligenceServiceResult = Readonly<{ output: SolutionIntelligenceResult; diagnostics: SolutionIntelligenceDiagnostics; technicalMetadata: SolutionIntelligenceTechnicalMetadata; durationMs: number }>;

export async function generateSolutionIntelligenceModelOutput(input: SolutionIntelligenceServiceInput): Promise<SolutionIntelligenceModelOutput> {
  const model = input.model ?? SCAN_MODEL_ID;
  const client = input.client ?? createOpenRouterClient().chat.completions;
  if (!process.env.OPENROUTER_API_KEY && !input.client) throw new SolutionIntelligenceServiceError("configuration", "provider_configuration_missing");
  try {
    const completion = await client.create({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: "You produce evidence-grounded Solution Intelligence as strict JSON only." }, { role: "user", content: buildSolutionIntelligencePrompt({ intent: input.intent, evidence: [...input.evidence], derivedAnalysis: input.derivedProblemContext }) }], temperature: 0.25, max_tokens: 3200 });
    const choice = completion.choices[0];
    const content = String(choice?.message?.content ?? "");
    console.info("Scan solution model generation diagnostics", { event:"scan_solution_model_generation_diagnostics", model, finishReason:choice?.finish_reason ?? "unknown", contentLength:content.length });
    return content;
  } catch { throw new SolutionIntelligenceServiceError("generation", "provider_generation_failed"); }
}


function groundingValidationReason(issue: { code: string; path: string; message: string }): string {
  if (issue.code.endsWith("unknown_evidence_id")) return "unknown_evidence_id";
  if (issue.path.endsWith(".relevance")) return "invalid_relevance";
  if (issue.message.startsWith("Duplicate")) return "duplicate_evidence_reference";
  if (issue.code.endsWith("grounding_missing")) return "missing_required_grounding";
  if (issue.code.endsWith("grounding_mismatch")) return "grounding_contract_mismatch";
  return "malformed_evidence_reference";
}

function collectEvidenceIds(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) { for (const item of value) collectEvidenceIds(item, output); return output; }
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "evidenceId" && typeof child === "string") output.push(child.trim());
    else collectEvidenceIds(child, output);
  }
  return output;
}

export function validateSolutionIntelligenceModelOutput(input: SolutionIntelligenceServiceInput, modelOutput: SolutionIntelligenceModelOutput): SolutionIntelligenceResult {
  try {
    return validateSolutionIntelligenceOutput(parseStrictModelJson(modelOutput), { evidenceIds: input.allowedEvidenceIds });
  } catch (error) {
    if (error instanceof ModelJsonError) throw new SolutionIntelligenceServiceError("json", error.code);
    if (error instanceof SolutionIntelligenceValidationError) {
      const grounding = error.issues.find((issue) => issue.code.includes("grounding"));
      if (grounding) {
        const parsed = parseStrictModelJson(modelOutput) as Record<string, unknown>;
        const ids = collectEvidenceIds(parsed);
        const allowed = new Set(input.allowedEvidenceIds);
        const opportunity = grounding.path.match(/opportunities\.(\d+)/);
        const solution = grounding.path.match(/evaluatedCategories\.(\d+)/);
        throw new SolutionIntelligenceServiceError("grounding", error.code, Object.freeze({ validationReason:groundingValidationReason(grounding), failingPath:grounding.path, ...(opportunity ? { failingOpportunityIndex:Number(opportunity[1]) } : {}), ...(solution ? { failingSolutionIndex:Number(solution[1]) } : {}), suppliedEvidenceRefCount:ids.length, recognizedEvidenceRefCount:ids.filter((id) => allowed.has(id)).length, unknownEvidenceIds:Object.freeze([...new Set(ids.filter((id) => !allowed.has(id)))]), allowedEvidenceIdCount:allowed.size }));
      }
      throw new SolutionIntelligenceServiceError("validation", error.code);
    }
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
