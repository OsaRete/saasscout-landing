import { requireUser, AuthError } from "../../_utils/auth";
import { buildSafeScanEvidenceIngestionLog, ingestScanEvidence, publicScanEvidenceError, ScanEvidenceIngestionError, type ScanEvidenceFileInput } from "@/lib/scan/evidence-ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let fileCount = 0;
  try {
    await requireUser(request);
    const formData = await request.formData();
    const files: ScanEvidenceFileInput[] = [];
    for (const value of formData.getAll("files")) {
      if (!(value instanceof File)) throw new ScanEvidenceIngestionError("scan_evidence_request_invalid");
      const bytes = Buffer.from(await value.arrayBuffer());
      files.push({ filename: value.name, mimeType: value.type, byteLength: value.size, bytes });
    }
    fileCount = files.length;
    const pastedEvidence = String(formData.get("pastedEvidence") ?? "");
    const derivedAnalysis = String(formData.get("derivedAnalysis") ?? "");
    const result = await ingestScanEvidence({ pastedEvidence, files, derivedAnalysis });
    console.info("Scan evidence ingestion", buildSafeScanEvidenceIngestionLog({ result, durationMs: Date.now() - startedAt, totalInputBytes: files.reduce((s, f) => s + f.byteLength, 0), fileCount, pastedEvidencePresent: Boolean(pastedEvidence.trim()), derivedAnalysisPresent: Boolean(derivedAnalysis.trim()) }));
    return Response.json({ success: true, ingestion: { version: result.version, evidenceItems: result.evidenceItems.map(({ evidenceId, sourceKind, title, normalizedContent, characterCount, contentHash, truncated, extractionStatus }) => ({ evidenceId, sourceKind, title, normalizedContent, characterCount, contentHash, truncated, extractionStatus })), totals: result.totals } });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ success: false, error: error.message }, { status: error.status });
    const code = error instanceof ScanEvidenceIngestionError ? error.code : "scan_evidence_extraction_failed";
    console.warn("Scan evidence ingestion", buildSafeScanEvidenceIngestionLog({ errorCode: code, durationMs: Date.now() - startedAt, fileCount, extractionFailureCount: 1 }));
    return Response.json(publicScanEvidenceError(error), { status: 400 });
  }
}
