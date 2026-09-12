export { analyzeCanonicalBootstrap } from "./analyzer.ts";
export { buildActivationPlan, buildCandidateSnapshot } from "./activation-plan.ts";
export { createSupabaseObservationReader, readUnresolvedProblemObservations } from "./repository.ts";
export { CANONICAL_BOOTSTRAP_RULE_VERSION } from "./types.ts";
export type { CanonicalBootstrapReport, UnresolvedProblemObservation } from "./types.ts";
