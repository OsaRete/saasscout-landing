import {
  SURVEY_DESIGN_QUESTION_TYPES,
  VALIDATION_DESIGN_QUESTION_MAX,
  VALIDATION_DESIGN_QUESTION_MIN,
  type ExperimentDesignDraft,
  type HypothesisDesignDraft,
  type SurveyDesignQuestionType,
  type ValidationDesignDraft,
  type ValidationDesignMode,
} from "./contracts.ts";

export class ValidationDesignOutputError extends Error {
  readonly reason: "json_parse_failed" | "contract_failed";

  constructor(reason: "json_parse_failed" | "contract_failed" = "contract_failed") {
    super("model_output_contract_failed");
    this.name = "ValidationDesignOutputError";
    this.reason = reason;
  }
}

const fail = (): never => {
  throw new ValidationDesignOutputError();
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
const exact = (value: Record<string, unknown>, keys: string[]) => {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !(key in value))
  )
    fail();
};
const text = (value: unknown, max = 1_000): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new ValidationDesignOutputError();
  return value.trim();
};
const texts = (value: unknown, min: number, max: number): string[] => {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new ValidationDesignOutputError();
  return value.map((item) => text(item));
};

const PLACEHOLDER = /^(option|choice)\s*\d+$/i;

function parseHypothesis(
  value: Record<string, unknown>,
): HypothesisDesignDraft {
  const keys = [
    "mode",
    "hypothesisStatement",
    "problemAssumption",
    "targetCustomerAssumption",
    "expectedCurrentBehavior",
    "mostImportantUncertainty",
    "weakeningEvidence",
  ];
  exact(value, keys);
  if (value.mode !== "hypothesis") fail();
  return {
    mode: "hypothesis",
    hypothesisStatement: text(value.hypothesisStatement),
    problemAssumption: text(value.problemAssumption),
    targetCustomerAssumption: text(value.targetCustomerAssumption),
    expectedCurrentBehavior: text(value.expectedCurrentBehavior),
    mostImportantUncertainty: text(value.mostImportantUncertainty),
    weakeningEvidence: texts(value.weakeningEvidence, 1, 5),
  };
}

function parseExperiment(
  value: Record<string, unknown>,
): ExperimentDesignDraft {
  const keys = [
    "mode",
    "recommendedFamily",
    "goal",
    "rationale",
    "targetAudience",
    "screeningCriteria",
    "evidenceGap",
    "suggestedCollectionMethod",
    "privacyMode",
    "interviewQuestions",
    "surveyQuestions",
  ];
  exact(value, keys);
  if (value.mode !== "experiment") fail();
  const family = value.recommendedFamily;
  if (family !== "customer_interview" && family !== "survey") fail();
  const privacyMode = value.privacyMode;
  if (
    privacyMode !== "anonymous_notes" &&
    privacyMode !== "pseudonymous_notes" &&
    privacyMode !== "identified_with_explicit_consent"
  )
    fail();
  if (
    !Array.isArray(value.interviewQuestions) ||
    !Array.isArray(value.surveyQuestions)
  )
    throw new ValidationDesignOutputError();
  const interviewItems = value.interviewQuestions as unknown[];
  const surveyItems = value.surveyQuestions as unknown[];
  const interviewQuestions = interviewItems.map((item) => {
    const question = record(item);
    exact(question, ["prompt"]);
    return { prompt: text(question.prompt) };
  });
  const surveyQuestions = surveyItems.map((item) => {
    const question = record(item);
    exact(question, ["questionRef", "prompt", "type", "required", "options"]);
    if (
      typeof question.type !== "string" ||
      !SURVEY_DESIGN_QUESTION_TYPES.includes(
        question.type as SurveyDesignQuestionType,
      ) ||
      typeof question.required !== "boolean"
    )
      fail();
    const options = texts(question.options, 0, 12);
    const isChoice =
      question.type === "single_choice" || question.type === "multiple_choice";
    if ((isChoice && options.length < 2) || (!isChoice && options.length > 0))
      fail();
    if (options.some((option) => PLACEHOLDER.test(option))) fail();
    return {
      questionRef: text(question.questionRef, 40),
      prompt: text(question.prompt),
      type: question.type as SurveyDesignQuestionType,
      required: question.required as boolean,
      options,
    };
  });
  const activeQuestions =
    family === "customer_interview" ? interviewQuestions : surveyQuestions;
  const inactiveQuestions =
    family === "customer_interview" ? surveyQuestions : interviewQuestions;
  if (
    activeQuestions.length < VALIDATION_DESIGN_QUESTION_MIN ||
    activeQuestions.length > VALIDATION_DESIGN_QUESTION_MAX ||
    inactiveQuestions.length !== 0
  )
    fail();
  return {
    mode: "experiment",
    recommendedFamily: family as "customer_interview" | "survey",
    goal: text(value.goal),
    rationale: text(value.rationale),
    targetAudience: texts(value.targetAudience, 1, 8),
    screeningCriteria: texts(value.screeningCriteria, 0, 8),
    evidenceGap: text(value.evidenceGap),
    suggestedCollectionMethod: text(value.suggestedCollectionMethod),
    privacyMode: privacyMode as ExperimentDesignDraft["privacyMode"],
    interviewQuestions,
    surveyQuestions,
  };
}

export function parseValidationDesignOutput(
  raw: string,
  expectedMode: ValidationDesignMode,
): ValidationDesignDraft {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new ValidationDesignOutputError("json_parse_failed");
  }
  const parsed = record(decoded);
  return expectedMode === "hypothesis"
    ? parseHypothesis(parsed)
    : parseExperiment(parsed);
}
