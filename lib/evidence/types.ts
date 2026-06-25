export type EvidenceSourceType =
  | "external_source"
  | "uploaded_document"
  | "pasted_text"
  | "scan_source"
  | "weekly_intelligence_source"
  | "feedback_event"
  | "data_moat"
  | "unknown";

export type EvidenceProvenance = {
  sourceTable?: string;
  sourceId?: string;
  scanId?: string;
  runId?: string;
  userId?: string;
  opportunityId?: string;
  problemId?: string;
  capturedBy?: string;
  raw?: Record<string, unknown>;
};

export type Evidence = {
  sourceType: EvidenceSourceType;
  sourceName: string | null;
  sourceUrl: string | null;
  capturedText: string;
  extractedClaim: string | null;
  market: string | null;
  audience: string | null;
  nicheCategory: string | null;
  detectedProblemTitle: string | null;
  painIntensity: number | null;
  frequencySignal: number | null;
  buyingIntentSignal: number | null;
  confidenceScore: number | null;
  sourceQualityScore: number | null;
  capturedAt: string;
  provenance: EvidenceProvenance;
  deduplicationFingerprint: string;
};

export type EvidenceInput = Partial<
  Omit<Evidence, "capturedAt" | "deduplicationFingerprint" | "provenance">
> & {
  capturedAt?: string | Date | null;
  provenance?: EvidenceProvenance | null;
};

export type EvidenceValidationResult = {
  valid: boolean;
  errors: string[];
};
