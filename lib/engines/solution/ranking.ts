import type { SolutionEvaluation } from "./types.ts";

export function rankSolutionEvaluations(evaluations: SolutionEvaluation[]) {
  return [...evaluations].sort((a, b) =>
    b.scoreBreakdown.overallSolutionScore - a.scoreBreakdown.overallSolutionScore ||
    b.scoreBreakdown.confidenceScore - a.scoreBreakdown.confidenceScore ||
    b.scoreBreakdown.evidenceStrengthScore - a.scoreBreakdown.evidenceStrengthScore ||
    a.candidate.category.localeCompare(b.candidate.category)
  );
}
