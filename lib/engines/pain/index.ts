export { PainDetectionEngine } from "./engine";
export { rankPainCandidates } from "./ranking";
export {
  averagePainScore,
  calculateCompositePainScore,
  frequencyFromScore,
  normalizePainScore,
  severityFromScore,
} from "./scoring";
export type {
  PainCandidate,
  PainContext,
  PainDetectionInput,
  PainDetectionResult,
  PainEvidence,
  PainFrequency,
  PainScore,
  PainSeverity,
  PainSignal,
} from "./types";
export { validatePainDetectionInput, validatePainDetectionResult } from "./validation";
