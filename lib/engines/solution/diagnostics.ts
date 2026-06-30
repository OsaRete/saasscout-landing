import type { SolutionIntelligenceDiagnostics } from "./types.ts";

export function createEmptySolutionIntelligenceDiagnostics(
  overrides: Partial<SolutionIntelligenceDiagnostics> = {},
): SolutionIntelligenceDiagnostics {
  return {
    evaluatedCategoryCount: 0,
    rejectedCategoryCount: 0,
    recommendedCategory: null,
    lowConfidenceReasonCount: 0,
    missingEvidenceCount: 0,
    fallbackUsed: false,
    warnings: [],
    ...overrides,
  };
}
