import { normalizeProblemText } from "../../knowledge/deduplication/helpers.ts";
import { VALIDATION_CANONICAL_RESOLVER_VERSION, type CanonicalRegistryEntry, type CanonicalResolutionResult, type ResolutionIdentity } from "./types.ts";

export function resolveValidationCanonicalProblem(identity: ResolutionIdentity, registry: CanonicalRegistryEntry[]): CanonicalResolutionResult {
  const active = registry.filter((entry) => entry.status === "active");
  if (identity.provenanceCanonicalProblemId) {
    const matches = active.filter((entry) => entry.id === identity.provenanceCanonicalProblemId);
    if (matches.length === 1) return result("resolved", matches[0].id, "provenance_id_match", "provenance");
  }
  const source: { text: string; kind: "subject_label" | "hypothesis_problem_claim" } | null = identity.subjectLabel?.trim()
    ? { text: identity.subjectLabel, kind: "subject_label" }
    : identity.hypothesisProblemClaim?.trim()
      ? { text: identity.hypothesisProblemClaim, kind: "hypothesis_problem_claim" }
      : null;
  if (!source) return result("insufficient_identity", null, "explicit_problem_identity_missing", null);
  const normalized = normalizeProblemText(source.text);
  const titles = active.filter((entry) => normalizeProblemText(entry.normalizedTitle || entry.canonicalTitle) === normalized);
  if (titles.length === 1) return result("resolved", titles[0].id, "exact_normalized_canonical_title", source.kind);
  if (titles.length > 1) return result("ambiguous", null, "canonical_identity_ambiguous", source.kind);
  const aliases = active.filter((entry) => entry.aliases.some((alias) => normalizeProblemText(alias.normalizedAlias) === normalized));
  if (aliases.length === 1) return result("resolved", aliases[0].id, "exact_normalized_alias", source.kind);
  return aliases.length > 1 ? result("ambiguous", null, "canonical_identity_ambiguous", source.kind) : result("unmatched", null, "canonical_identity_unmatched", source.kind);
}
function result(status: CanonicalResolutionResult["status"], canonicalProblemId: string | null, reason: CanonicalResolutionResult["reason"], identitySource: CanonicalResolutionResult["identitySource"]): CanonicalResolutionResult { return { status, canonicalProblemId, resolverRuleVersion: VALIDATION_CANONICAL_RESOLVER_VERSION, reason, identitySource }; }
