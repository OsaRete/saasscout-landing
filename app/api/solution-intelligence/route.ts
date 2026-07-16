import { buildTrustedUserIntent } from "@/lib/scan/evidence-envelope";
import { buildSafeSolutionIntelligenceLog, publicSolutionIntelligenceConfigurationFailure, publicSolutionIntelligenceError, publicSolutionIntelligenceFailure, SOLUTION_INTELLIGENCE_VERSION, type SolutionIntelligenceErrorCode } from "@/lib/scan/solution-intelligence";
import { generateSolutionIntelligence, SolutionIntelligenceServiceError } from "@/lib/scan/solution-intelligence-service";
import { SCAN_MODEL_ID } from "@/lib/scan/problem-intelligence-service";
import { AuthError, requireUser } from "../_utils/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function safeString(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function code(error: SolutionIntelligenceServiceError): SolutionIntelligenceErrorCode { return error.kind === "json" ? "solution_model_schema_validation_failed" : error.code as SolutionIntelligenceErrorCode; }

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const body = await request.json();
    const market = safeString(body.market, 120);
    const audience = safeString(body.audience, 120);
    const region = safeString(body.region, 80);
    const evidence = safeString(body.evidence, 6000);
    const derivedAnalysisContent = safeString(body.derivedAnalysis, 4000);
    if (!market && !evidence) return Response.json({ success: false, error: "Market or evidence is required." }, { status: 400 });
    const result = await generateSolutionIntelligence({ intent: buildTrustedUserIntent({ market, audience, region }), evidence: [{ evidenceId: "scan-user-evidence", sourceKind: "pasted_evidence", content: evidence }], allowedEvidenceIds: ["scan-user-evidence"], ...(derivedAnalysisContent ? { derivedProblemContext: { content: derivedAnalysisContent } } : {}) });
    console.info("Solution Intelligence validation", buildSafeSolutionIntelligenceLog({ event: "solution_intelligence_validation", route: "solution-intelligence", promptVersion: SOLUTION_INTELLIGENCE_VERSION, model: result.technicalMetadata.model, validationStatus: "passed", durationMs: result.durationMs, diagnostics: result.diagnostics }));
    return Response.json({ success: true, solutionIntelligence: result.output });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof SolutionIntelligenceServiceError) {
      console.warn("Solution Intelligence validation", buildSafeSolutionIntelligenceLog({ event: "solution_intelligence_validation", route: "solution-intelligence", promptVersion: SOLUTION_INTELLIGENCE_VERSION, model: SCAN_MODEL_ID, validationStatus: error.kind === "configuration" ? "configuration_error" : "failed", errorCategory: code(error), errorName: error.name }));
      return Response.json(error.kind === "configuration" ? publicSolutionIntelligenceConfigurationFailure() : publicSolutionIntelligenceError(code(error)), { status: error.kind === "configuration" ? 500 : 502 });
    }
    console.error("Solution Intelligence error", buildSafeSolutionIntelligenceLog({ event: "solution_intelligence_error", route: "solution-intelligence", promptVersion: SOLUTION_INTELLIGENCE_VERSION, model: SCAN_MODEL_ID, validationStatus: "unexpected_error", errorCategory: "unexpected", errorName: error instanceof Error ? error.name : typeof error }));
    return Response.json(publicSolutionIntelligenceFailure(), { status: 500 });
  }
}
