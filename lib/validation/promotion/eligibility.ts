import { VALIDATION_PROMOTION_POLICY_VERSION, type AuthoritativeClassification, type EligibilityInput, type PromotionEligibilityReason, type ValidationPromotionEligibility } from "./types.ts";

const promotable = new Set(["supporting", "contradicting", "mixed"]);

export function resolveCurrentAuthoritativeClassification(rows: AuthoritativeClassification[]) {
  const authoritative = rows.filter((row) => row.authorityStatus === "authoritative" && row.source !== "ai_model_suggested");
  const superseded = new Set(rows.map((row) => row.supersedesClassificationId).filter((id): id is string => Boolean(id)));
  const terminals = authoritative.filter((row) => !superseded.has(row.id));
  return terminals.length === 1 ? { status: "resolved" as const, classification: terminals[0] } : terminals.length === 0 ? { status: "missing" as const, classification: null } : { status: "ambiguous" as const, classification: null };
}

function hasUsefulContent(content: unknown) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return false;
  return Object.values(content).some((value) => typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined);
}

export function evaluateValidationPromotionEligibility(input: EligibilityInput): ValidationPromotionEligibility {
  const reasons: PromotionEligibilityReason[] = [];
  const current = resolveCurrentAuthoritativeClassification(input.classifications);
  if (!input.lineageValid || !input.observationId) reasons.push("invalid_validation_lineage");
  const interview = input.origin === "human_interview" && input.modality === "interview_observation" && input.sourceType === "customer_interview" && Boolean(input.interviewSessionId);
  if (!interview) reasons.push(input.modality === "survey_answer" || input.origin === "survey_response" ? "survey_projection_required" : "unsupported_evidence_origin");
  if (input.experimentFamily !== "customer_interview") reasons.push("unsupported_experiment_family");
  if (!hasUsefulContent(input.content)) reasons.push("empty_evidence_content");
  if (current.status === "missing") reasons.push("missing_authoritative_classification");
  if (current.status === "ambiguous") reasons.push("ambiguous_authoritative_classification");
  if (current.classification && !promotable.has(current.classification.polarity)) reasons.push("classification_not_promotable");
  if (!input.participantId) reasons.push("missing_independence_identity");
  if (input.participantStatus !== "active") reasons.push("participant_state_not_eligible");
  if (!input.interviewSessionStatus || !["in_progress", "completed"].includes(input.interviewSessionStatus) || !["running", "paused", "completed"].includes(input.experimentLifecycle)) reasons.push("experiment_state_not_eligible");
  const targetRelevance = input.participantRelevance === "target_segment_match" ? "established" : "unknown";
  if (targetRelevance === "unknown") reasons.push("target_relevance_unproven");
  const eligible = reasons.length === 0;
  return { observationId: input.observationId, policyVersion: VALIDATION_PROMOTION_POLICY_VERSION, eligible, classificationId: current.classification?.id ?? null, classification: current.classification?.polarity ?? null, independenceUnit: input.participantId ? { kind: "participant", privateId: input.participantId } : null, targetRelevance, reasons: eligible ? ["eligible"] : reasons };
}

export function surveyProjectionRequired(observationId: string, submissionId: string): ValidationPromotionEligibility {
  return { observationId, policyVersion: VALIDATION_PROMOTION_POLICY_VERSION, eligible: false, classificationId: null, classification: null, independenceUnit: { kind: "survey_submission", privateId: submissionId }, targetRelevance: "unknown", reasons: ["survey_projection_required"] };
}
