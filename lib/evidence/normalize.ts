import { generateEvidenceFingerprint } from "./fingerprint";
import type { Evidence, EvidenceInput, EvidenceSourceType } from "./types";

function trimOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

function normalizeCapturedAt(value: string | Date | null | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

export function createEvidence(input: EvidenceInput): Evidence {
  const sourceType = input.sourceType || "unknown";
  const capturedText = stringValue(input.capturedText);
  const evidence: Omit<Evidence, "deduplicationFingerprint"> = {
    sourceType,
    sourceName: trimOrNull(input.sourceName),
    sourceUrl: trimOrNull(input.sourceUrl),
    capturedText,
    extractedClaim: trimOrNull(input.extractedClaim),
    market: trimOrNull(input.market),
    audience: trimOrNull(input.audience),
    nicheCategory: trimOrNull(input.nicheCategory),
    detectedProblemTitle: trimOrNull(input.detectedProblemTitle),
    painIntensity: normalizeScore(input.painIntensity),
    frequencySignal: normalizeScore(input.frequencySignal),
    buyingIntentSignal: normalizeScore(input.buyingIntentSignal),
    confidenceScore: normalizeScore(input.confidenceScore),
    sourceQualityScore: normalizeScore(input.sourceQualityScore),
    capturedAt: normalizeCapturedAt(input.capturedAt),
    provenance: input.provenance || {},
  };

  return {
    ...evidence,
    deduplicationFingerprint: generateEvidenceFingerprint(evidence),
  };
}

export function normalizeExternalSourceToEvidence(
  source: Record<string, unknown>,
  context: EvidenceInput = {}
) {
  return createEvidence({
    sourceType: (context.sourceType || "external_source") as EvidenceSourceType,
    sourceName: trimOrNull(source.source_name) || trimOrNull(source.sourceName),
    sourceUrl: trimOrNull(source.url) || trimOrNull(source.source_url),
    capturedText:
      stringValue(source.raw_text) ||
      stringValue(source.snippet) ||
      stringValue(source.source_snippet) ||
      stringValue(source.title) ||
      stringValue(source.source_title),
    extractedClaim: trimOrNull(source.extracted_claim),
    nicheCategory: trimOrNull(source.category) || trimOrNull(source.source_type),
    sourceQualityScore:
      normalizeScore(source.source_quality_score) ?? normalizeScore(source.source_score),
    buyingIntentSignal: normalizeScore(source.buying_signal_score),
    frequencySignal: normalizeScore(source.frequency_score),
    ...context,
    provenance: {
      sourceTable: context.provenance?.sourceTable,
      sourceId: trimOrNull(source.id) || context.provenance?.sourceId,
      raw: source,
      ...context.provenance,
    },
  });
}

export function normalizeScanSourceToEvidence(
  source: Record<string, unknown>,
  context: EvidenceInput = {}
) {
  return normalizeExternalSourceToEvidence(source, {
    ...context,
    sourceType: "scan_source",
    provenance: {
      sourceTable: "scan_sources",
      scanId: trimOrNull(source.scan_id) || context.provenance?.scanId,
      userId: trimOrNull(source.user_id) || context.provenance?.userId,
      ...context.provenance,
    },
  });
}

export function normalizeWeeklyIntelligenceSourceToEvidence(
  source: Record<string, unknown>,
  context: EvidenceInput = {}
) {
  return normalizeExternalSourceToEvidence(source, {
    ...context,
    sourceType: "weekly_intelligence_source",
    provenance: {
      sourceTable: "weekly_sources",
      runId: trimOrNull(source.run_id) || context.provenance?.runId,
      ...context.provenance,
    },
  });
}

export function normalizeUploadedDocumentToEvidence({
  text,
  fileName,
  fileUrl,
  ...context
}: EvidenceInput & {
  text: string;
  fileName?: string | null;
  fileUrl?: string | null;
}) {
  return createEvidence({
    sourceType: "uploaded_document",
    sourceName: fileName || "Uploaded document",
    sourceUrl: fileUrl || null,
    capturedText: text,
    ...context,
  });
}

export function normalizePastedTextToEvidence({
  text,
  ...context
}: EvidenceInput & { text: string }) {
  return createEvidence({
    sourceType: "pasted_text",
    sourceName: "User pasted text",
    capturedText: text,
    ...context,
  });
}

export function normalizeFeedbackEventToEvidence(
  feedback: Record<string, unknown>,
  context: EvidenceInput = {}
) {
  return createEvidence({
    sourceType: "feedback_event",
    sourceName: trimOrNull(feedback.event_type) || "Feedback event",
    capturedText:
      stringValue(feedback.notes) ||
      stringValue(feedback.outcome) ||
      stringValue(feedback.status) ||
      "Feedback event captured without notes.",
    extractedClaim: trimOrNull(feedback.outcome),
    confidenceScore: normalizeScore(feedback.confidence_score),
    ...context,
    provenance: {
      sourceTable: context.provenance?.sourceTable,
      sourceId: trimOrNull(feedback.id) || context.provenance?.sourceId,
      raw: feedback,
      ...context.provenance,
    },
  });
}
