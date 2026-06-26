export { TrendEngine } from "./engine";
export { rankTrendCandidates } from "./ranking";
export {
  averageTrendScore,
  calculateCompositeTrendScore,
  directionFromChange,
  momentumFromScore,
  normalizeTrendScore,
  scoreFromDirection,
  velocityFromScore,
} from "./scoring";
export { calculateWindowChange, createTrendTimeWindows, normalizeTimeWindowDays, normalizeTrendDate } from "./time-windows";
export type {
  TrendCandidate,
  TrendContext,
  TrendDetectionInput,
  TrendDetectionResult,
  TrendDirection,
  TrendEvidence,
  TrendMomentum,
  TrendScore,
  TrendSignal,
  TrendTimeWindow,
  TrendVelocity,
} from "./types";
export { validateTrendDetectionInput, validateTrendDetectionResult } from "./validation";
