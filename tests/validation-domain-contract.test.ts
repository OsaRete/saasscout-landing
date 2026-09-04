import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { CustomerInterviewDesign, ExperimentDraft, Hypothesis, ParticipantReference, SurveyDesign, ValidationObservation } from "../lib/validation/types.ts";
import { isBehavioralEvidence, isDerivedInterpretation, isHumanEvidence, isMaterialExperimentChange, isMaterialHypothesisChange, isPotentiallyPromotableValidationEvidence, isRealWorldValidationEvidence, isUpstreamContext, isValidEvidencePolarity, validateEvidenceClassification, validateExperimentTransition, validateHypothesisTestability, validateInterviewDesign, validateSurveyDesign } from "../lib/validation/validators.ts";

const hypothesis: Hypothesis = { hypothesisRef: "hypothesis:1", subjectRef: "subject:1", version: 1, status: "active", targetSegment: "Small marketing agencies with 2–15 employees", problemClaim: "Recurring client-onboarding friction comes from work fragmented across multiple tools", expectedObservableBehavior: "Participants describe the same recent friction and show an active workaround", commercialAssumption: "Some currently pay for adjacent tools", supportCriteria: ["Recent repeated onboarding friction"], contradictionCriteria: ["Recent onboarding is consistently frictionless"], inconclusiveCriteria: ["No recent onboarding experience"], scope: { included: ["Agencies with 2–15 employees"], excluded: ["Enterprise agencies"] } };

test("rejects a success prediction and accepts a bounded testable hypothesis", () => {
  assert.equal(validateHypothesisTestability({ ...hypothesis, targetSegment: "everyone", problemClaim: "This app will succeed", expectedObservableBehavior: "will succeed", supportCriteria: ["success"], contradictionCriteria: ["failure"], inconclusiveCriteria: ["unknown"] }).ok, false);
  assert.equal(validateHypothesisTestability(hypothesis).ok, true);
});
test("hypothesis changes are semantic and formatting-insensitive", () => {
  assert.equal(isMaterialHypothesisChange(hypothesis, { ...hypothesis, problemClaim: "A materially different problem affects renewals" }), true);
  assert.equal(isMaterialHypothesisChange(hypothesis, { ...hypothesis, targetSegment: "  SMALL   marketing agencies with 2–15 employees " }), false);
});
test("lifecycle permits documented transitions and keeps terminals closed", () => {
  for (const [from, to] of [["draft", "ready"], ["ready", "running"], ["running", "paused"], ["paused", "running"], ["running", "completed"], ["running", "cancelled"]] as const) assert.equal(validateExperimentTransition(from, to).ok, true);
  assert.equal(validateExperimentTransition("draft", "completed").ok, false);
  assert.equal(validateExperimentTransition("completed", "running").ok, false);
  assert.equal(validateExperimentTransition("cancelled", "draft").ok, false);
});
test("experiment material fields require versions but formatting does not", () => {
  const draft: ExperimentDraft = { family: "survey", targetAudience: ["Agency owners"], questionSet: ["q1"], screeningCriteria: ["recent onboarding"], collectionMethod: "manual import" };
  assert.equal(isMaterialExperimentChange(draft, { ...draft, questionSet: ["q1", "q2"] }), true);
  assert.equal(isMaterialExperimentChange(draft, { ...draft, targetAudience: [" agency   OWNERS "] }), false);
});
test("origin guards enforce human, behavior, context, derived, and promotion boundaries", () => {
  for (const origin of ["human_interview", "survey_response"] as const) { assert.equal(isHumanEvidence(origin), true); assert.equal(isRealWorldValidationEvidence(origin), true); }
  assert.equal(isBehavioralEvidence("behavioral_observation"), true);
  assert.equal(isRealWorldValidationEvidence("behavioral_observation"), true);
  for (const origin of ["discover_context", "scan_context", "weekly_context", "evidence_alignment_context"] as const) { assert.equal(isHumanEvidence(origin), false); assert.equal(isUpstreamContext(origin), true); assert.equal(isPotentiallyPromotableValidationEvidence(origin), false); }
  assert.equal(isDerivedInterpretation("ai_model_interpretation"), true);
  assert.equal(isRealWorldValidationEvidence("ai_model_interpretation"), false);
  assert.equal(isPotentiallyPromotableValidationEvidence("ai_model_interpretation"), false);
});
test("polarity is independent from sentiment and preserves mixed/inconclusive", () => {
  assert.equal(validateEvidenceClassification("supporting").ok, true); // no sentiment input exists to infer this
  assert.equal(validateEvidenceClassification("contradicting").ok, true);
  assert.equal(isValidEvidencePolarity("mixed"), true);
  assert.equal(isValidEvidencePolarity("inconclusive"), true);
  assert.equal(isValidEvidencePolarity("positive"), false);
  assert.equal(isValidEvidencePolarity("negative"), false);
});
test("participants may be anonymous or pseudonymous and observations require no PII", () => {
  const anonymous: ParticipantReference = { identityMode: "anonymous" };
  const pseudonymous: ParticipantReference = { participantRef: "participant:local-7", identityMode: "experiment_pseudonymous" };
  assert.equal(anonymous.participantRef, undefined); assert.equal(pseudonymous.identityMode, "experiment_pseudonymous");
  const observation: ValidationObservation = { observationRef: "observation:1", subjectRef: "subject:1", hypothesisRef: "hypothesis:1", hypothesisVersion: 1, experimentRef: "experiment:1", experimentVersion: 1, participant: anonymous, participantRelevance: [], origin: "behavioral_observation", modality: "conversion_event", behavioralEvent: "signup_submitted", observedAt: "2026-08-27T00:00:00Z", collectedAt: "2026-08-27T00:00:01Z", source: { sourceType: "landing", collectedBy: "server_observed" }, normalizedObservation: "Signup submitted", polarity: "supporting", independence: { relationship: "unknown", anonymousIndependenceUncertain: true }, classification: { attributedBy: "server_observed", classifiedAt: "2026-08-27T00:00:01Z" } };
  assert.equal(observation.behavioralEvent, "signup_submitted"); assert.equal("email" in observation.participant, false);
});
test("interview and survey designs require testable hypotheses and bounded questions", () => {
  const interview: CustomerInterviewDesign = { family: "customer_interview", hypothesis, targetParticipantCriteria: ["Agency owner with recent onboarding"], questions: [{ questionRef: "q1", prompt: "Tell me about the last client you onboarded.", intent: "past_behavior" }], consentPrivacyMode: "anonymous_notes", captureMode: "manual_observation" };
  const survey: SurveyDesign = { family: "survey", hypothesis, targetRespondentCriteria: ["Agency staff with recent onboarding"], questions: [{ questionRef: "q1", prompt: "Did you onboard a client in the last 90 days?", type: "boolean", intent: "screening", screening: true, criterionRelationship: "context" }], responseSource: "imported" };
  assert.equal(validateInterviewDesign(interview).ok, true); assert.equal(validateSurveyDesign(survey).ok, true);
  assert.equal(validateInterviewDesign({ ...interview, questions: [] }).ok, false); assert.equal(validateSurveyDesign({ ...survey, questions: [] }).ok, false);
  assert.equal(validateSurveyDesign({ ...survey, hypothesis: { ...hypothesis, problemClaim: "This app will succeed" } }).ok, false);
});
test("modern Survey choice designs require meaningful normalized-distinct options", () => {
  const survey = (options: readonly string[], type: "single_choice" | "multiple_choice"): SurveyDesign => ({ family: "survey", hypothesis, targetRespondentCriteria: ["Agency staff with recent onboarding"], questions: [{ questionRef: "question_1", prompt: "Which workflow do you use?", type, required: true, options }], responseSource: "public_link" });
  for (const invalid of [[], ["Sheets", ""], ["Sheets", "   "], ["Sheets", " sheets "]]) assert.equal(validateSurveyDesign(survey(invalid, "single_choice")).ok, false);
  assert.equal(validateSurveyDesign(survey(["Sheets", "Manual"], "single_choice")).ok, true);
  assert.equal(validateSurveyDesign(survey(["Email", "Shared inbox"], "multiple_choice")).ok, true);
});
test("validation domain has no numeric truth score or infrastructure dependency", async () => {
  const files = ["types.ts", "validators.ts", "index.ts"];
  const source = (await Promise.all(files.map((file) => readFile(new URL(`../lib/validation/${file}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /truthScore|validationScore|successProbability/);
  assert.doesNotMatch(source, /supabase|react|next\/|server-only|process\.env|fetch\s*\(/i);
});
