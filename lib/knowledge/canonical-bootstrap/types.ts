export const CANONICAL_BOOTSTRAP_RULE_VERSION = "canonical_bootstrap_v1" as const;
export const CANONICAL_ACTIVATION_ELIGIBILITY_RULE_VERSION = "canonical_activation_eligibility_v1" as const;
export const CROSS_CANDIDATE_IDENTITY_AUDIT_RULE_VERSION = "cross_candidate_identity_audit_v1" as const;
export const CANONICAL_BOOTSTRAP_ACTIVATION_PLAN_RULE_VERSION = "canonical_bootstrap_activation_plan_v1" as const;

export type BootstrapDisposition = "high_confidence_cluster" | "review_required" | "singleton";
export type ActivationDisposition = "auto_activatable" | "blocked_for_review";
export type CrossCandidateAuditDisposition = "clearly_unique" | "potential_canonical_collision" | "not_applicable";
export type CrossCandidateCollisionReason =
  | "very_high_title_overlap"
  | "normalized_token_near_identity"
  | "title_containment_with_modifier"
  | "strong_alias_overlap"
  | "segment_qualified_variant"
  | "compatible_problem_cluster"
  | "conflicting_problem_cluster"
  | "trusted_niche_corroboration"
  | "auto_candidate_matches_blocked_candidate";
export type ActivationBlockReason =
  | "ambiguous_alias_collision"
  | "duplicate_normalized_identity_across_candidates"
  | "conflicting_problem_cluster"
  | "insufficient_trusted_context"
  | "incomplete_complete_link_identity"
  | "non_high_confidence_disposition";

/** Deliberately excludes source evidence, authors, URLs, metadata and opportunity scores. */
export type UnresolvedProblemObservation = Readonly<{
  id: string;
  canonical_problem_id: null;
  observation_fingerprint: string;
  problem_title: string;
  normalized_problem_title: string;
  problem_summary: string | null;
  source_table: string | null;
  source_row_id: string | null;
  affected_niches: string[];
  problem_cluster: string | null;
  observed_at: string | null;
}>;

export type BootstrapObservationAudit = Readonly<{
  id: string;
  title: string;
  normalizedTitle: string;
  sourceTable: string | null;
  sourceRowId: string | null;
  affectedNiches: string[];
  problemCluster: string | null;
  observedAt: string | null;
}>;

export type BootstrapAliasPreview = Readonly<{
  text: string;
  normalizedAlias: string;
  kind: "original_title" | "normalized_title";
}>;

export type BootstrapCandidateCluster = Readonly<{
  candidateId: string;
  disposition: BootstrapDisposition;
  candidateCanonicalTitle: string;
  observations: BootstrapObservationAudit[];
  aliasesPreview: BootstrapAliasPreview[];
  reasons: string[];
  /** Explicit B0.1.1 result; activationDisposition is retained for backward compatibility. */
  baseActivationDisposition: ActivationDisposition;
  activationDisposition: ActivationDisposition;
  activationBlockReasons: ActivationBlockReason[];
  crossCandidateAuditDisposition: CrossCandidateAuditDisposition;
  finalActivationDisposition: ActivationDisposition;
  trustedAffectedNiches: string[];
  ignoredAffectedNiches: string[];
}>;

export type AmbiguousAliasCollision = Readonly<{
  normalizedAlias: string;
  candidateIds: string[];
}>;

export type NormalizedIdentityCollision = Readonly<{
  normalizedIdentity: string;
  candidateIds: string[];
}>;

export type PotentialCanonicalCollisionPair = Readonly<{
  candidateAId: string;
  candidateBId: string;
  candidateATitle: string;
  candidateBTitle: string;
  candidateABaseActivationDisposition: ActivationDisposition;
  candidateBBaseActivationDisposition: ActivationDisposition;
  reasons: CrossCandidateCollisionReason[];
  metrics: Readonly<{
    titleTokenOverlap: number;
    titleTokenContainment: number;
    strongestAliasOverlap: number;
    sharedTitleTokens: number;
  }>;
  context: Readonly<{
    problemClusterRelationship: "compatible" | "conflicting" | "unavailable";
    trustedNicheOverlap: string[];
  }>;
}>;

export type CrossCandidateIdentityAudit = Readonly<{
  ruleVersion: typeof CROSS_CANDIDATE_IDENTITY_AUDIT_RULE_VERSION;
  candidatesAudited: number;
  pairComparisons: number;
  potentialCollisionPairs: PotentialCanonicalCollisionPair[];
  potentialCollisionGroups: string[][];
  clearlyUniqueAutoActivatableCandidateIds: string[];
  blockedAutoActivatableCandidateIds: string[];
  autoCandidatesMatchingBlockedCandidateIds: string[];
}>;

export type CanonicalBootstrapReport = Readonly<{
  bootstrapRuleVersion: typeof CANONICAL_BOOTSTRAP_RULE_VERSION;
  activationEligibilityRuleVersion: typeof CANONICAL_ACTIVATION_ELIGIBILITY_RULE_VERSION;
  summary: Readonly<{
    observationsAnalyzed: number;
    distinctSourceTables: string[];
    distinctNormalizedTitles: number;
    highConfidenceCandidateClusters: number;
    observationsInHighConfidenceClusters: number;
    reviewRequiredClusters: number;
    observationsInReviewRequiredClusters: number;
    singletonObservations: number;
    exactTitleDuplicateGroups: number;
    ambiguousAliasCollisions: number;
    autoActivatableClusters: number;
    observationsInAutoActivatableClusters: number;
    blockedHighConfidenceClusters: number;
    observationsInBlockedHighConfidenceClusters: number;
    blockedByAliasCollision: number;
    blockedByNormalizedIdentityCollision: number;
    blockedByContextIssue: number;
    blockedByClusterConflict: number;
    finalAutoActivatableClusters: number;
    blockedByCrossCandidateIdentityAudit: number;
    potentialCanonicalCollisionPairs: number;
    potentialCanonicalCollisionGroups: number;
  }>;
  ambiguousAliasCollisions: AmbiguousAliasCollision[];
  normalizedIdentityCollisions: NormalizedIdentityCollision[];
  crossCandidateIdentityAudit: CrossCandidateIdentityAudit;
  clusters: BootstrapCandidateCluster[];
}>;

export type CandidateActivationSnapshot = Readonly<{
  candidateId: string;
  candidateCanonicalTitle: string;
  candidateNormalizedTitle: string;
  observationIds: string[];
  aliases: ReadonlyArray<{ text: string; normalizedAlias: string }>;
  baseActivationDisposition: ActivationDisposition;
  crossCandidateAuditDisposition: CrossCandidateAuditDisposition;
  finalActivationDisposition: ActivationDisposition;
  bootstrapRuleVersion: string;
  activationEligibilityRuleVersion: string;
  crossCandidateAuditRuleVersion: string;
  candidateSnapshotHash: string;
}>;

export type CanonicalBootstrapActivationPlan = Readonly<{
  ruleVersion: typeof CANONICAL_BOOTSTRAP_ACTIVATION_PLAN_RULE_VERSION;
  eligibleCandidateCount: number;
  candidateIds: string[];
  candidateSnapshotHashes: string[];
  candidates: CandidateActivationSnapshot[];
  activationPlanHash: string;
}>;
