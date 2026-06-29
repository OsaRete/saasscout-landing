import { assessProblemEvolution, type KnowledgeEvolutionSupabaseClient, type ProblemEvolutionAssessmentResult } from "./repository.ts";
import type { ProblemEvolutionAssessment } from "./types.ts";

type WeeklyProblemForEvolutionDiagnostics = {
  problem_title?: string | null;
};

export type KnowledgeEvolutionWeeklyDiagnosticProblem = {
  problem_title: string;
  lifecycle_state: ProblemEvolutionAssessment["lifecycleState"];
  recurrence_score: number;
  momentum_score: number;
  validation_score: number;
  weakness_score: number;
  confidence_score: number;
  reasons: string[];
  observation_count: number;
  warnings: string[];
};

export type KnowledgeEvolutionWeeklyDiagnostics = {
  assessed_problem_count: number;
  failed_problem_count: number;
  problems: KnowledgeEvolutionWeeklyDiagnosticProblem[];
  warnings: string[];
};

function problemTitle(problem: WeeklyProblemForEvolutionDiagnostics, index: number) {
  return problem.problem_title?.trim() || `Untitled weekly problem ${index + 1}`;
}

function diagnosticForAssessment(
  problemTitle: string,
  result: ProblemEvolutionAssessmentResult
): KnowledgeEvolutionWeeklyDiagnosticProblem {
  return {
    problem_title: problemTitle,
    lifecycle_state: result.assessment.lifecycleState,
    recurrence_score: result.assessment.scores.recurrenceScore,
    momentum_score: result.assessment.scores.momentumScore,
    validation_score: result.assessment.scores.validationScore,
    weakness_score: result.assessment.scores.weaknessScore,
    confidence_score: result.assessment.scores.confidenceScore,
    reasons: result.assessment.reasons,
    observation_count: result.assessment.diagnostics.observationCount,
    warnings: result.warnings,
  };
}

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "Unknown Knowledge Evolution weekly assessment error.";
}

export async function runKnowledgeEvolutionWeeklyDiagnostics({
  client,
  problems,
}: {
  client: KnowledgeEvolutionSupabaseClient;
  problems: WeeklyProblemForEvolutionDiagnostics[];
}): Promise<KnowledgeEvolutionWeeklyDiagnostics> {
  const diagnostics: KnowledgeEvolutionWeeklyDiagnostics = {
    assessed_problem_count: 0,
    failed_problem_count: 0,
    problems: [],
    warnings: [],
  };

  for (const [index, problem] of problems.entries()) {
    const title = problemTitle(problem, index);

    try {
      const result = await assessProblemEvolution(client, {
        problemTitle: title,
        limit: 25,
        includeDiscoveredProblems: false,
      });
      const problemDiagnostics = diagnosticForAssessment(title, result);
      diagnostics.problems.push(problemDiagnostics);
      diagnostics.assessed_problem_count += 1;
      diagnostics.warnings.push(...problemDiagnostics.warnings.map((warning) => `${title}: ${warning}`));
    } catch (error) {
      const warning = `${title}: ${messageFor(error)}`;
      diagnostics.failed_problem_count += 1;
      diagnostics.warnings.push(warning);
      console.warn("Knowledge Evolution weekly diagnostics could not assess problem:", {
        problem_title: title,
        message: messageFor(error),
      });
    }
  }

  console.info("Knowledge Evolution weekly diagnostics:", diagnostics);

  return diagnostics;
}
