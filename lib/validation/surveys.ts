import type { SurveyQuestion, SurveyQuestionType } from "./types.ts";

export const SURVEY_QUESTION_TYPES: readonly SurveyQuestionType[] = ["single_choice", "multiple_choice", "short_text", "long_text", "number"];
export const SURVEY_PLAN_GUIDANCE = ["Keep surveys short: 5–10 high-value questions is recommended.", "Ask about current or past behavior, frequency, workarounds, time, and money.", "Avoid leading or hypothetical questions such as ‘Would you use my SaaS?’", "Responses are preserved as submitted; no AI interpretation is performed."] as const;

export type SurveyAnswer = Readonly<{ questionRef: string; value: string | number | readonly string[] }>;

export function validateSurveyAnswers(questions: readonly SurveyQuestion[], answers: unknown): SurveyAnswer[] {
  if (!Array.isArray(answers) || answers.length > questions.length || answers.length > 15) throw new Error("Answers must be a bounded array.");
  const byId = new Map(questions.map(question => [question.questionRef, question]));
  const seen = new Set<string>();
  const normalized = answers.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Answer ${index + 1} is malformed.`);
    const record = raw as Record<string, unknown>; const questionRef = record.questionRef;
    if (typeof questionRef !== "string" || seen.has(questionRef) || !byId.has(questionRef)) throw new Error("Answer references an unknown or duplicate question.");
    seen.add(questionRef); const question = byId.get(questionRef)!; const value = record.value;
    if (question.type === "single_choice" && (typeof value !== "string" || !question.options?.includes(value))) throw new Error("A choice answer is outside the allowed options.");
    if (question.type === "multiple_choice" && (!Array.isArray(value) || value.length > 12 || value.some(item => typeof item !== "string" || !question.options?.includes(item)) || new Set(value).size !== value.length)) throw new Error("A multiple-choice answer is invalid.");
    if ((question.type === "short_text" || question.type === "long_text") && (typeof value !== "string" || value.length > (question.type === "short_text" ? 500 : 4000))) throw new Error("A text answer exceeds its bound.");
    if (question.type === "number" && (typeof value !== "number" || !Number.isFinite(value) || (question.min != null && value < question.min) || (question.max != null && value > question.max))) throw new Error("A number answer is outside its allowed range.");
    return { questionRef, value } as SurveyAnswer;
  });
  if (questions.some(question => question.required && !seen.has(question.questionRef))) throw new Error("A required question was not answered.");
  return normalized;
}
