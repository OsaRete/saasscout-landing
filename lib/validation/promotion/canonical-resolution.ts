import { normalizeProblemText } from "../../knowledge/deduplication/helpers.ts";
import { VALIDATION_CANONICAL_RESOLVER_VERSION, type CanonicalRegistryEntry, type CanonicalResolutionResult, type ResolutionIdentity } from "./types.ts";

type IdentitySource = "subject_label" | "hypothesis_problem_claim";
type Signal = { kind: IdentitySource; candidateIds: string[]; matchedTitle: boolean };

export function resolveValidationCanonicalProblem(identity: ResolutionIdentity, registry: CanonicalRegistryEntry[]): CanonicalResolutionResult {
  const active = registry.filter((entry) => entry.status === "active");
  const sources: Array<{ text: string; kind: IdentitySource }> = [];
  if (identity.subjectLabel?.trim()) sources.push({ text: identity.subjectLabel, kind: "subject_label" });
  if (identity.hypothesisProblemClaim?.trim()) sources.push({ text: identity.hypothesisProblemClaim, kind: "hypothesis_problem_claim" });
  if (!sources.length) return result("insufficient_identity", null, "explicit_problem_identity_missing", null);
  const signals: Signal[] = sources.map((source) => {
    const normalized = normalizeProblemText(source.text);
    const titleIds = active.filter((entry) => normalizeProblemText(entry.normalizedTitle || entry.canonicalTitle) === normalized).map((entry) => entry.id);
    const aliasIds = active.filter((entry) => entry.aliases.some((alias) => normalizeProblemText(alias.normalizedAlias) === normalized)).map((entry) => entry.id);
    return { kind: source.kind, candidateIds: [...new Set([...titleIds, ...aliasIds])], matchedTitle: titleIds.length > 0 };
  });
  if (signals.some((signal) => signal.candidateIds.length > 1)) return result("ambiguous", null, "canonical_identity_ambiguous", null);
  const resolved = signals.filter((signal) => signal.candidateIds.length === 1);
  if (new Set(resolved.map((signal) => signal.candidateIds[0])).size > 1) return result("ambiguous", null, "canonical_identity_conflict", null);
  if (!resolved.length) return result("unmatched", null, "canonical_identity_unmatched", sources[0].kind);
  const preferred = resolved.find((signal) => signal.kind === "subject_label") ?? resolved[0];
  return result("resolved", preferred.candidateIds[0], preferred.matchedTitle ? "exact_normalized_canonical_title" : "exact_normalized_alias", preferred.kind);
}
function result(status: CanonicalResolutionResult["status"], canonicalProblemId: string | null, reason: CanonicalResolutionResult["reason"], identitySource: CanonicalResolutionResult["identitySource"]): CanonicalResolutionResult { return { status, canonicalProblemId, resolverRuleVersion: VALIDATION_CANONICAL_RESOLVER_VERSION, reason, identitySource }; }
