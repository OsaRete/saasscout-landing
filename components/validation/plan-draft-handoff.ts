import type {
  ExperimentDesignDraft,
  SurveyDesignQuestion,
} from "../../lib/validation/design-assistant/contracts.ts";

export type PlanDraftHandoff = Readonly<{
  subjectId: string;
  hypothesisVersionId: string;
  experimentId: string;
  experimentVersionId: string;
  family: "customer_interview" | "survey";
  interviewQuestions: ExperimentDesignDraft["interviewQuestions"];
  surveyQuestions: SurveyDesignQuestion[];
}>;

type CreatedExperiment = {
  experiment: { id: string };
  version: {
    id: string;
    hypothesis_version_id: string;
    family: PlanDraftHandoff["family"];
  };
};

const supportedSurveyTypes = new Set([
  "single_choice",
  "multiple_choice",
  "short_text",
  "long_text",
  "number",
]);
const normalizedChoice = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
const isPlaceholderChoice = (value: string) =>
  /^(?:option|choice)\s*\d+$/i.test(value.trim());

export function createPlanDraftHandoff(
  subjectId: string,
  hypothesisVersionId: string,
  draft: ExperimentDesignDraft | null,
  created: CreatedExperiment,
): PlanDraftHandoff | null {
  if (
    !draft ||
    created.version.hypothesis_version_id !== hypothesisVersionId ||
    created.version.family !== draft.recommendedFamily
  )
    return null;

  const questionCount =
    draft.recommendedFamily === "customer_interview"
      ? draft.interviewQuestions.length
      : draft.surveyQuestions.length;
  if (questionCount < 1 || questionCount > 12) return null;

  if (
    draft.recommendedFamily === "customer_interview" &&
    draft.interviewQuestions.some(
      (question) => !question.prompt.trim() || question.prompt.length > 500,
    )
  )
    return null;

  if (
    draft.recommendedFamily === "survey" &&
    (questionCount > 15 ||
      draft.surveyQuestions.some((question) => {
        if (
          !question.questionRef.trim() ||
          !question.prompt.trim() ||
          question.prompt.length > 500 ||
          !supportedSurveyTypes.has(question.type)
        )
          return true;
        const choice = question.type.includes("choice");
        if (!choice) return question.options.length !== 0;
        return (
          question.options.length < 2 ||
          question.options.length > 12 ||
          question.options.some((option) => !option.trim()) ||
          question.options.some(isPlaceholderChoice) ||
          new Set(question.options.map(normalizedChoice)).size !==
            question.options.length
        );
      }))
  )
    return null;

  return {
    subjectId,
    hypothesisVersionId,
    experimentId: created.experiment.id,
    experimentVersionId: created.version.id,
    family: draft.recommendedFamily,
    interviewQuestions: draft.interviewQuestions.map((question) => ({
      prompt: question.prompt,
    })),
    surveyQuestions: draft.surveyQuestions.map((question) => ({
      ...question,
      options: [...question.options],
    })),
  };
}

export function matchesPlanDraftHandoff(
  handoff: PlanDraftHandoff | null,
  context: {
    subjectId: string;
    hypothesisVersionId: string;
    experimentId: string;
    experimentVersionId: string;
    family: PlanDraftHandoff["family"];
  },
): handoff is PlanDraftHandoff {
  return Boolean(
    handoff &&
    handoff.subjectId === context.subjectId &&
    handoff.hypothesisVersionId === context.hypothesisVersionId &&
    handoff.experimentId === context.experimentId &&
    handoff.experimentVersionId === context.experimentVersionId &&
    handoff.family === context.family,
  );
}
