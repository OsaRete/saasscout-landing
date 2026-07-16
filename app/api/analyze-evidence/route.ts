import { buildTrustedUserIntent } from "@/lib/scan/evidence-envelope";
import { buildScanCalibrationShadowLog } from "@/lib/scan/score-calibration";
import { publicModelOutputError } from "@/lib/scan/model-json";
import { generateProblemIntelligence, ProblemIntelligenceServiceError, PROBLEM_INTELLIGENCE_PROMPT_VERSION, SCAN_MODEL_ID } from "@/lib/scan/problem-intelligence-service";
import { AuthError, requireUser } from "../_utils/auth";

function safeString(value: unknown, fallback = "") { return typeof value === "string" ? value.trim() : fallback; }
function publicCode(error: ProblemIntelligenceServiceError) { if (error.kind === "json") return error.code as "model_empty_response" | "model_invalid_json"; if (error.kind === "grounding") return error.code as Parameters<typeof publicModelOutputError>[0]; return "model_schema_validation_failed" as const; }

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const body = await request.json();
    const market = safeString(body.market).slice(0, 120);
    const audience = safeString(body.audience).slice(0, 120);
    const region = safeString(body.region).slice(0, 80);
    const evidence = safeString(body.evidence).slice(0, 6000);
    if (!market && !evidence) return Response.json({ error: "Market or evidence is required." }, { status: 400 });
    const startedAt = Date.now();
    const result = await generateProblemIntelligence({ intent: buildTrustedUserIntent({ market, audience, region }), evidence: [{ evidenceId: "scan-user-evidence", sourceKind: "pasted_evidence", content: evidence }], allowedEvidenceIds: ["scan-user-evidence"] });
    console.info("Scan score calibration shadow", buildScanCalibrationShadowLog({ route: "analyze-evidence", promptVersion: PROBLEM_INTELLIGENCE_PROMPT_VERSION, model: result.technicalMetadata.model, calibration: { confidence: result.calibration }, durationMs: result.durationMs }));
    console.info("Scan model output validation", { event: "scan_model_output_validation", route: "analyze-evidence", promptVersion: PROBLEM_INTELLIGENCE_PROMPT_VERSION, model: result.technicalMetadata.model, validationStatus: "passed", groundingStatus: "passed", totalClaims: result.output.groundingSummary.totalClaims, evidenceGroundedClaims: result.output.groundingSummary.evidenceGroundedClaims, inferenceClaims: result.output.groundingSummary.inferenceClaims, groundingCoverage: result.output.groundingSummary.groundingCoverage, distinctEvidenceIdsReferenced: result.output.groundingSummary.distinctEvidenceIdsReferenced, qualityDiagnostics: result.diagnostics.qualitySummary, durationMs: Date.now() - startedAt });
    const analysis = result.output;
    return Response.json({ analysis });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof ProblemIntelligenceServiceError) {
      console.warn("Scan model output validation", { event: "scan_model_output_validation", route: "analyze-evidence", promptVersion: PROBLEM_INTELLIGENCE_PROMPT_VERSION, model: SCAN_MODEL_ID, validationStatus: "failed", groundingStatus: error.kind === "grounding" ? "failed" : "not_applicable", validationErrorCode: error.code });
      return Response.json(publicModelOutputError(publicCode(error)), { status: error.kind === "configuration" ? 500 : 502 });
    }
    console.error("Analyze evidence error", { event: "analyze_evidence_unexpected_error", route: "analyze-evidence", errorCategory: "unexpected", errorName: error instanceof Error ? error.name : typeof error });
    return Response.json({ error: "Failed to analyze evidence." }, { status: 500 });
  }
}
