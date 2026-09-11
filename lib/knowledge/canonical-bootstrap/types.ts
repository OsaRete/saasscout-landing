export const CANONICAL_BOOTSTRAP_RULE_VERSION = "canonical_bootstrap_v1" as const;

export type BootstrapDisposition = "high_confidence_cluster" | "review_required" | "singleton";

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
}>;

export type AmbiguousAliasCollision = Readonly<{
  normalizedAlias: string;
  candidateIds: string[];
}>;

export type CanonicalBootstrapReport = Readonly<{
  bootstrapRuleVersion: typeof CANONICAL_BOOTSTRAP_RULE_VERSION;
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
  }>;
  ambiguousAliasCollisions: AmbiguousAliasCollision[];
  clusters: BootstrapCandidateCluster[];
}>;
