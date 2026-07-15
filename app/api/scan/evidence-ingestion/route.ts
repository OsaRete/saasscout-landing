import { requireUser, AuthError } from "../../_utils/auth";
import { buildSafeScanEvidenceIngestionLog, ingestScanEvidence, preflightScanEvidenceMultipartFiles, publicScanEvidenceError, scanEvidenceHttpStatusForCode, ScanEvidenceIngestionError, type ScanEvidenceFileInput } from "@/lib/scan/evidence-ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function publicIngestionResult(result: Awaited<ReturnType<typeof ingestScanEvidence>>) {
  return {
    version: result.version,
    evidenceItems: result.evidenceItems.map(({ evidenceId, sourceKind, normalizedContent, characterCount, truncated, extractionStatus }) => ({ evidenceId, sourceKind, normalizedContent, characterCount, truncated, extractionStatus })),
    allowedEvidenceIds: result.allowedEvidenceIds,
    derivedContextIds: result.derivedContextIds,
    totals: result.totals,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let fileCount = 0;
  let totalDeclaredBytes = 0;
  try {
    await requireUser(request);
    const formData = await request.formData();
    const preflight = preflightScanEvidenceMultipartFiles(formData.getAll("files"));
    fileCount = preflight.files.length;
    totalDeclaredBytes = preflight.totalDeclaredBytes;
    const files: ScanEvidenceFileInput[] = [];
    for (const value of preflight.files) {
      const bytes = Buffer.from(await value.arrayBuffer());
      files.push({ filename: value.name, mimeType: value.type, byteLength: value.size, bytes });
    }
    const pastedEvidence = String(formData.get("pastedEvidence") ?? "");
    const derivedAnalysis = String(formData.get("derivedAnalysis") ?? "");
    const result = await ingestScanEvidence({ pastedEvidence, files, derivedAnalysis });
    console.info("Scan evidence ingestion", buildSafeScanEvidenceIngestionLog({ result, durationMs: Date.now() - startedAt, totalInputBytes: result.evidenceItems.reduce((s, item) => s + (item.byteCount ?? 0), 0), fileCount, pastedEvidencePresent: Boolean(pastedEvidence.trim()), derivedAnalysisPresent: Boolean(derivedAnalysis.trim()) }));
    return Response.json({ success: true, ingestion: publicIngestionResult(result) });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ success: false, error: error.message }, { status: error.status });
    const code = error instanceof ScanEvidenceIngestionError ? error.code : "scan_evidence_extraction_failed";
    console.warn("Scan evidence ingestion", buildSafeScanEvidenceIngestionLog({ errorCode: code, durationMs: Date.now() - startedAt, fileCount, totalInputBytes: totalDeclaredBytes, extractionFailureCount: code.includes("extraction") ? 1 : 0 }));
    return Response.json(publicScanEvidenceError(error), { status: scanEvidenceHttpStatusForCode(code) });
  }
}
