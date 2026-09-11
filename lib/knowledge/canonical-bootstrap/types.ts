export const CANONICAL_BOOTSTRAP_RULE_VERSION = "canonical_bootstrap_v1" as const;
export const CANONICAL_ACTIVATION_ELIGIBILITY_RULE_VERSION = "canonical_activation_eligibility_v1" as const;

export type BootstrapDisposition = "high_confidence_cluster" | "review_required" | "singleton";
export type ActivationDisposition = "auto_activatable" | "blocked_for_review";
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
  activationDisposition: ActivationDisposition;
  activationBlockReasons: ActivationBlockReason[];
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
  }>;
  ambiguousAliasCollisions: AmbiguousAliasCollision[];
  normalizedIdentityCollisions: NormalizedIdentityCollision[];
  clusters: BootstrapCandidateCluster[];
}>;
