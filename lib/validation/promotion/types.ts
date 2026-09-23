export const VALIDATION_PROMOTION_POLICY_VERSION = "v8-b1.2" as const;
export const VALIDATION_CANONICAL_RESOLVER_VERSION = "v8-b3.0.2-exact.1" as const;

export type ValidationPolarity = "supporting" | "contradicting" | "mixed" | "neutral" | "inconclusive";
export type PromotionEligibilityReason =
  | "eligible" | "missing_authoritative_classification" | "ambiguous_authoritative_classification"
  | "classification_not_promotable" | "unsupported_evidence_origin" | "missing_independence_identity"
  | "empty_evidence_content" | "invalid_validation_lineage" | "experiment_state_not_eligible"
  | "target_relevance_unproven" | "participant_state_not_eligible" | "survey_projection_required"
  | "unsupported_experiment_family";

export type AuthoritativeClassification = { id: string; observationId: string; polarity: ValidationPolarity; source: string; authorityStatus: "authoritative" | "suggested"; supersedesClassificationId: string | null };
export type EligibilityInput = {
  observationId: string; origin: string; modality: string; sourceType: string; content: unknown;
  participantId: string | null; participantIndependenceKey: string | null; participantStatus: string | null;
  interviewSessionId: string | null; interviewSessionStatus: string | null; participantRelevance: string | null;
  experimentFamily: string; experimentLifecycle: string; lineageValid: boolean;
  classifications: AuthoritativeClassification[];
};
export type IndependenceUnit = { kind: "participant" | "survey_submission"; privateId: string };
export type ValidationPromotionEligibility = { observationId: string; policyVersion: typeof VALIDATION_PROMOTION_POLICY_VERSION; eligible: boolean; classificationId: string | null; classification: ValidationPolarity | null; independenceUnit: IndependenceUnit | null; targetRelevance: "established" | "unknown"; reasons: PromotionEligibilityReason[] };

export type CanonicalRegistryEntry = { id: string; canonicalTitle: string; normalizedTitle: string; status: string; aliases: Array<{ normalizedAlias: string }> };
export type ResolutionIdentity = { subjectLabel?: string | null; hypothesisProblemClaim?: string | null; respondentProse?: string | null };
export type CanonicalResolutionResult = { status: "resolved" | "unmatched" | "ambiguous" | "insufficient_identity"; canonicalProblemId: string | null; resolverRuleVersion: typeof VALIDATION_CANONICAL_RESOLVER_VERSION; reason: "exact_normalized_canonical_title" | "exact_normalized_alias" | "canonical_identity_ambiguous" | "canonical_identity_conflict" | "canonical_identity_unmatched" | "explicit_problem_identity_missing"; identitySource: "subject_label" | "hypothesis_problem_claim" | null };

export type EvidenceSpecificity = "commercial_behavior" | "observed_behavior" | "reported_past_behavior" | "workaround_resource_allocation" | "frequency_severity" | "structured_opinion";
export type RepresentativeCandidate = { observationId: string; independenceUnit: IndependenceUnit; canonicalProblemId: string; polarity: "supporting" | "contradicting" | "mixed"; specificity: EvidenceSpecificity; targetRelevance: "established" | "unknown"; statementKind: "direct_quote" | "summary" | null; contentLength: number; observedAt: string };
export type RepresentativeSelection = { groupKey: string; representativeObservationId: string; memberObservationIds: string[] };
