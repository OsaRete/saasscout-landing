export const VALIDATION_DESIGN_MODEL = "openai/gpt-5.1" as const;
export const VALIDATION_DESIGN_PROVIDER = "OpenRouter" as const;
export const VALIDATION_DESIGN_MAX_OUTPUT_TOKENS = 1_600;
export const VALIDATION_DESIGN_QUESTION_MIN = 5;
export const VALIDATION_DESIGN_QUESTION_MAX = 8;

export const SURVEY_DESIGN_QUESTION_TYPES = [
  "single_choice",
  "multiple_choice",
  "short_text",
  "long_text",
  "number",
] as const;

export type SurveyDesignQuestionType =
  (typeof SURVEY_DESIGN_QUESTION_TYPES)[number];
export type ValidationDesignMode = "hypothesis" | "experiment";

export type HypothesisDesignDraft = {
  mode: "hypothesis";
  hypothesisStatement: string;
  problemAssumption: string;
  targetCustomerAssumption: string;
  expectedCurrentBehavior: string;
  mostImportantUncertainty: string;
  weakeningEvidence: string[];
};

export type InterviewDesignQuestion = { prompt: string };
export type SurveyDesignQuestion = {
  questionRef: string;
  prompt: string;
  type: SurveyDesignQuestionType;
  required: boolean;
  options: string[];
};

export type ExperimentDesignDraft = {
  mode: "experiment";
  recommendedFamily: "customer_interview" | "survey";
  goal: string;
  rationale: string;
  targetAudience: string[];
  screeningCriteria: string[];
  evidenceGap: string;
  suggestedCollectionMethod: string;
  privacyMode:
    | "anonymous_notes"
    | "pseudonymous_notes"
    | "identified_with_explicit_consent";
  interviewQuestions: InterviewDesignQuestion[];
  surveyQuestions: SurveyDesignQuestion[];
};

export type ValidationDesignDraft =
  HypothesisDesignDraft | ExperimentDesignDraft;

export type ValidationDesignIntent =
  | {
      mode: "hypothesis";
      subjectId: string;
      draftInput: {
        targetSegment: string;
        problemClaim: string;
        expectedObservableBehavior?: string;
      };
    }
  | {
      mode: "experiment";
      subjectId: string;
      hypothesisVersionId: string;
      draftInput?: { targetAudience?: string };
    };

export type ValidationDesignContext = {
  subject: { id: string; label: string; description?: string };
  hypothesis?: {
    id: string;
    targetSegment: string;
    problemClaim: string;
    expectedObservableBehavior: string;
  };
};
