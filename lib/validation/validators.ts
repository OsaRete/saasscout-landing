import type { CustomerInterviewDesign, DerivedInterpretationOrigin, EvidenceOrigin, EvidencePolarity, ExperimentDraft, ExperimentLifecycle, Hypothesis, HypothesisDraft, SurveyDesign, ValidationDomainError, ValidationResult } from "./types.ts";

const clean = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
const cleanList = (values: readonly string[]) => values.map(clean).filter(Boolean).sort();
const error = (code: ValidationDomainError["code"], message: string, field?: string): ValidationDomainError => ({ code, message, ...(field ? { field } : {}) });
const success = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
const failure = (...errors: ValidationDomainError[]): ValidationResult<never> => ({ ok: false, errors });

export function validateHypothesisTestability(draft: HypothesisDraft): ValidationResult<HypothesisDraft> {
  const errors: ValidationDomainError[] = [];
  if (clean(draft.targetSegment).length < 8) errors.push(error("untestable_hypothesis", "A bounded target segment is required.", "targetSegment"));
  if (clean(draft.problemClaim).length < 12 || /^(this |the )?(app|idea|product) will (succeed|work|win)[.!]?$/.test(clean(draft.problemClaim))) errors.push(error("untestable_hypothesis", "The problem claim must describe a specific pain or assumption, not predict success.", "problemClaim"));
  if (clean(draft.expectedObservableBehavior).length < 8) errors.push(error("untestable_hypothesis", "An observable behavior is required.", "expectedObservableBehavior"));
  if (!cleanList(draft.supportCriteria).length || !cleanList(draft.contradictionCriteria).length || !cleanList(draft.inconclusiveCriteria).length) errors.push(error("invalid_hypothesis", "Support, contradiction, and inconclusive criteria must each be explicit.", "criteria"));
  return errors.length ? { ok: false, errors } : success(draft);
}

const hypothesisMaterial = (draft: HypothesisDraft) => JSON.stringify({ targetSegment: clean(draft.targetSegment), problemClaim: clean(draft.problemClaim), expectedObservableBehavior: clean(draft.expectedObservableBehavior), commercialAssumption: clean(draft.commercialAssumption ?? ""), supportCriteria: cleanList(draft.supportCriteria), contradictionCriteria: cleanList(draft.contradictionCriteria), inconclusiveCriteria: cleanList(draft.inconclusiveCriteria), scope: { included: cleanList(draft.scope.included), excluded: cleanList(draft.scope.excluded) } });
export const isMaterialHypothesisChange = (before: HypothesisDraft, after: HypothesisDraft): boolean => hypothesisMaterial(before) !== hypothesisMaterial(after);

const TRANSITIONS: Readonly<Record<ExperimentLifecycle, readonly ExperimentLifecycle[]>> = Object.freeze({ draft: ["ready", "cancelled"], ready: ["draft", "running", "cancelled"], running: ["paused", "completed", "cancelled"], paused: ["running", "completed", "cancelled"], completed: [], cancelled: [] });
export function validateExperimentTransition(from: ExperimentLifecycle, to: ExperimentLifecycle): ValidationResult<ExperimentLifecycle> { return TRANSITIONS[from].includes(to) ? success(to) : failure(error("invalid_lifecycle_transition", `Experiment cannot transition from ${from} to ${to}.`, "lifecycle")); }
export const EXPERIMENT_TRANSITIONS = TRANSITIONS;
const experimentMaterial = (draft: ExperimentDraft) => JSON.stringify({ family: draft.family, targetAudience: cleanList(draft.targetAudience), questionSet: cleanList(draft.questionSet), screeningCriteria: cleanList(draft.screeningCriteria), collectionMethod: clean(draft.collectionMethod), cta: clean(draft.cta ?? ""), pricing: clean(draft.pricing ?? "") });
export const isMaterialExperimentChange = (before: ExperimentDraft, after: ExperimentDraft): boolean => experimentMaterial(before) !== experimentMaterial(after);

const HUMAN = new Set<EvidenceOrigin>(["human_response", "human_interview", "survey_response", "social_response", "manual_human_observation"]);
const BEHAVIORAL = new Set<EvidenceOrigin>(["behavioral_observation"]);
const UPSTREAM = new Set<EvidenceOrigin>(["discover_context", "scan_context", "weekly_context", "saved_idea_context", "opportunity_context", "snapshot_context", "evidence_alignment_context"]);
const DERIVED = new Set<EvidenceOrigin>(["deterministic_interpretation", "ai_model_interpretation"]);
export const isHumanEvidence = (origin: EvidenceOrigin): boolean => HUMAN.has(origin);
export const isBehavioralEvidence = (origin: EvidenceOrigin): boolean => BEHAVIORAL.has(origin);
export const isRealWorldValidationEvidence = (origin: EvidenceOrigin): boolean => isHumanEvidence(origin) || isBehavioralEvidence(origin);
export const isUpstreamContext = (origin: EvidenceOrigin): boolean => UPSTREAM.has(origin);
export const isDerivedInterpretation = (origin: EvidenceOrigin | DerivedInterpretationOrigin): boolean => DERIVED.has(origin);
/** Eligibility for future reviewed promotion only; this performs no Data Moat write. */
export const isPotentiallyPromotableValidationEvidence = (origin: EvidenceOrigin): boolean => isRealWorldValidationEvidence(origin);

const POLARITIES: readonly EvidencePolarity[] = ["supporting", "contradicting", "mixed", "neutral", "inconclusive"];
export const isValidEvidencePolarity = (value: unknown): value is EvidencePolarity => typeof value === "string" && POLARITIES.includes(value as EvidencePolarity);
/** Sentiment cannot establish polarity; only explicit hypothesis criteria can. */
export function validateEvidenceClassification(polarity: unknown): ValidationResult<EvidencePolarity> { return isValidEvidencePolarity(polarity) ? success(polarity) : failure(error("invalid_evidence_classification", "Polarity must use the domain taxonomy.", "polarity")); }

const validateDesignHypothesis = (hypothesis: Hypothesis) => validateHypothesisTestability(hypothesis);
export function validateInterviewDesign(design: CustomerInterviewDesign): ValidationResult<CustomerInterviewDesign> {
  const errors: ValidationDomainError[] = [];
  const hypothesis = validateDesignHypothesis(design.hypothesis); if (!hypothesis.ok) errors.push(...hypothesis.errors);
  if (!cleanList(design.targetParticipantCriteria).length) errors.push(error("invalid_experiment_design", "Target participant criteria are required.", "targetParticipantCriteria"));
  if (!design.questions.length) errors.push(error("invalid_experiment_design", "At least one interview question is required.", "questions"));
  for (const [index, question] of design.questions.entries()) if (!clean(question.questionRef) || clean(question.prompt).length < 5) errors.push(error("invalid_experiment_design", "Each interview question needs an identifier and bounded prompt.", `questions.${index}`));
  return errors.length ? { ok: false, errors } : success(design);
}
export function validateSurveyDesign(design: SurveyDesign): ValidationResult<SurveyDesign> {
  const errors: ValidationDomainError[] = [];
  const hypothesis = validateDesignHypothesis(design.hypothesis); if (!hypothesis.ok) errors.push(...hypothesis.errors);
  if (!cleanList(design.targetRespondentCriteria).length) errors.push(error("invalid_experiment_design", "Target respondent criteria are required.", "targetRespondentCriteria"));
  if (!design.questions.length || design.questions.length > 15) errors.push(error("invalid_experiment_design", "Use 1–15 survey questions; 5–10 is recommended.", "questions"));
  for (const [index, question] of design.questions.entries()) {
    const modern = typeof question.required === "boolean";
    if (!(modern ? /^[A-Za-z0-9_-]{8,80}$/.test(question.questionRef) : Boolean(clean(question.questionRef))) || question.prompt.trim().length < 5 || question.prompt.length > 500) errors.push(error("invalid_experiment_design", "Each survey question needs an opaque identifier and bounded prompt.", `questions.${index}`));
    if (!modern) continue;
    const choice = question.type === "single_choice" || question.type === "multiple_choice";
    if (choice && (!question.options || question.options.length < 2 || question.options.length > 12 || new Set(question.options).size !== question.options.length || question.options.some(option => !option.trim() || option.length > 200))) errors.push(error("invalid_experiment_design", "Choice questions require 2–12 distinct bounded options.", `questions.${index}.options`));
    if (!choice && question.options?.length) errors.push(error("invalid_experiment_design", "Only choice questions accept options.", `questions.${index}.options`));
    if (question.type === "number" && (question.min != null && question.max != null && question.min > question.max)) errors.push(error("invalid_experiment_design", "Number minimum cannot exceed maximum.", `questions.${index}`));
  }
  if (new Set(design.questions.map(question => question.questionRef)).size !== design.questions.length) errors.push(error("invalid_experiment_design", "Question identifiers must be unique.", "questions"));
  return errors.length ? { ok: false, errors } : success(design);
}
