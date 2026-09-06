import type { ValidationDesignMode } from "./contracts.ts";

const text = { type: "string", minLength: 1, maxLength: 1_000 } as const;

const hypothesisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "mode",
    "hypothesisStatement",
    "problemAssumption",
    "targetCustomerAssumption",
    "expectedCurrentBehavior",
    "mostImportantUncertainty",
    "weakeningEvidence",
  ],
  properties: {
    mode: { type: "string", const: "hypothesis" },
    hypothesisStatement: text,
    problemAssumption: text,
    targetCustomerAssumption: text,
    expectedCurrentBehavior: text,
    mostImportantUncertainty: text,
    weakeningEvidence: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: text,
    },
  },
} as const;

const experimentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
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
  ],
  properties: {
    mode: { type: "string", const: "experiment" },
    recommendedFamily: {
      type: "string",
      enum: ["customer_interview", "survey"],
    },
    goal: text,
    rationale: text,
    targetAudience: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: text,
    },
    screeningCriteria: {
      type: "array",
      maxItems: 8,
      items: text,
    },
    evidenceGap: text,
    suggestedCollectionMethod: text,
    privacyMode: {
      type: "string",
      enum: [
        "anonymous_notes",
        "pseudonymous_notes",
        "identified_with_explicit_consent",
      ],
    },
    interviewQuestions: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt"],
        properties: { prompt: text },
      },
    },
    surveyQuestions: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionRef", "prompt", "type", "required", "options"],
        properties: {
          questionRef: { type: "string", pattern: "^[a-z0-9_]{1,40}$" },
          prompt: text,
          type: {
            type: "string",
            enum: [
              "single_choice",
              "multiple_choice",
              "short_text",
              "long_text",
              "number",
            ],
          },
          required: { type: "boolean" },
          options: { type: "array", maxItems: 12, items: text },
        },
      },
    },
  },
} as const;

export function validationDesignResponseFormat(mode: ValidationDesignMode) {
  return {
    type: "json_schema" as const,
    json_schema: {
      name: `validation_${mode}_design_draft`,
      strict: true,
      schema: mode === "hypothesis" ? hypothesisSchema : experimentSchema,
    },
  };
}
