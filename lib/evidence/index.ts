export type {
  Evidence,
  EvidenceInput,
  EvidenceProvenance,
  EvidenceSourceType,
  EvidenceValidationResult,
} from "./types";
export { generateEvidenceFingerprint } from "./fingerprint";
export {
  createEvidence,
  normalizeExternalSourceToEvidence,
  normalizeFeedbackEventToEvidence,
  normalizePastedTextToEvidence,
  normalizeScanSourceToEvidence,
  normalizeUploadedDocumentToEvidence,
  normalizeWeeklyIntelligenceSourceToEvidence,
} from "./normalize";
export { assertValidEvidence, validateEvidence } from "./validation";
