import { AuthError, requireUser } from "../../_utils/auth";
import { buildSafeScanWorkflowLog, executeScanWorkflow, isScanWorkflowFailure, type ScanWorkflowInput } from "@/lib/scan/workflow";
import type { ScanEvidenceFileInput } from "@/lib/scan/evidence-ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTopLevel = new Set(["intent", "pastedEvidence", "files", "externalSnippets", "discoverContext"]);
function enabled() { return process.env.SCAN_SERVER_WORKFLOW_ENABLED === "true"; }
function parseJsonInput(body: unknown): ScanWorkflowInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
  for (const key of Object.keys(body)) if (!allowedTopLevel.has(key)) throw new Error("invalid");
  return body as ScanWorkflowInput;
}
async function parseMultipartInput(request: Request): Promise<ScanWorkflowInput> {
  const form = await request.formData();
  const intentRaw = form.get("intent");
  const intent = intentRaw ? JSON.parse(String(intentRaw)) : {};
  const files: ScanEvidenceFileInput[] = [];
  for (const value of form.getAll("files")) {
    if (!(value instanceof File)) throw new Error("invalid");
    const bytes = Buffer.from(await value.arrayBuffer());
    files.push({ filename: value.name, mimeType: value.type, byteLength: value.size, bytes });
  }
  return { intent, pastedEvidence: String(form.get("pastedEvidence") ?? ""), files };
}
function publicSuccess(workflow: Awaited<ReturnType<typeof executeScanWorkflow>>) {
  return { success: true, workflow: { version: workflow.version, executionId: workflow.executionId, status: workflow.status, problemIntelligence: workflow.problemIntelligence, problemCalibration: { version: workflow.problemCalibration.version, score10: workflow.problemCalibration.score10, score100: workflow.problemCalibration.score100, scoreBand: workflow.problemCalibration.scoreBand, reliabilityClassification: workflow.problemCalibration.reliabilityClassification }, solutionIntelligence: workflow.solutionIntelligence, evidenceSummary: workflow.evidence, processingHistory: workflow.processingHistory, technicalContext: workflow.technicalContext } };
}
function publicFailure(failure: import("@/lib/scan/workflow").ScanWorkflowFailureResult) { return { success:false, error:failure.error, execution:{ version:failure.version, executionId:failure.executionId, status:failure.status, processingHistory:failure.processingHistory } }; }

export async function POST(request: Request) {
  try {
    if (!enabled()) return Response.json({ success:false, error:{ code:"scan_workflow_temporarily_unavailable", message:"The Scan workflow is temporarily unavailable." } }, { status: 503 });
    await requireUser(request);
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("multipart/form-data") ? await parseMultipartInput(request) : parseJsonInput(await request.json());
    const result = await executeScanWorkflow(input);
    console.info("Scan workflow", buildSafeScanWorkflowLog({ event:"scan_workflow_completed", result }));
    return Response.json(publicSuccess(result));
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ success:false, error:error.message }, { status:error.status });
    if (isScanWorkflowFailure(error)) { console.warn("Scan workflow", buildSafeScanWorkflowLog({ event:"scan_workflow_failed", failure:error })); return Response.json(publicFailure(error), { status: error.error.statusClass === "4xx" ? 400 : error.error.statusClass === "502" ? 502 : 500 }); }
    return Response.json({ success:false, error:{ code:"scan_workflow_request_invalid", message:"The Scan workflow request is invalid." } }, { status:400 });
  }
}
