import { resolveValidationCanonicalProblem } from "./canonical-resolution.ts";
import { evaluateValidationPromotionEligibility } from "./eligibility.ts";
import { selectValidationRepresentatives } from "./representative-selection.ts";
import type { AuthoritativeClassification, CanonicalRegistryEntry, EvidenceSpecificity, EligibilityInput, RepresentativeCandidate, ValidationPolarity } from "./types.ts";
import type { PersistedPromotionRows } from "./read-repository.ts";

export type PreparedObservation = { input: EligibilityInput; identity: { provenanceCanonicalProblemId: string | null; subjectLabel: string | null; hypothesisProblemClaim: string | null }; specificity: EvidenceSpecificity; statementKind: "direct_quote" | "summary" | null; contentLength: number; observedAt: string };
const text = (value: unknown) => typeof value === "string" ? value : null;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function specificity(content: Record<string, unknown>, modality: string): EvidenceSpecificity {
  const explicit = text(content.evidence_specificity) ?? text(content.specificity);
  if (["commercial_behavior", "observed_behavior", "reported_past_behavior", "workaround_resource_allocation", "frequency_severity", "structured_opinion"].includes(explicit ?? "")) return explicit as EvidenceSpecificity;
  if (modality === "commercial_signal") return "commercial_behavior";
  if (modality === "observed_behavior") return "observed_behavior";
  if (modality === "reported_behavior") return "reported_past_behavior";
  return "structured_opinion";
}

export function adaptPersistedPromotionRows(rows: PersistedPromotionRows): PreparedObservation[] {
  const by = (items: Record<string, unknown>[]) => new Map(items.map((item) => [text(item.id), item]));
  const subjects = by(rows.subjects), hypotheses = by(rows.hypotheses), experiments = by(rows.experiments), participants = by(rows.participants), sessions = by(rows.sessions);
  const classifications = new Map<string, AuthoritativeClassification[]>();
  for (const row of rows.classifications) {
    const observationId = text(row.observation_id); if (!observationId) continue;
    const item: AuthoritativeClassification = { id: text(row.id) ?? "", observationId, polarity: text(row.polarity) as ValidationPolarity, source: text(row.classification_source) ?? "", authorityStatus: text(row.authority_status) as AuthoritativeClassification["authorityStatus"], supersedesClassificationId: text(row.supersedes_classification_id) };
    classifications.set(observationId, [...(classifications.get(observationId) ?? []), item]);
  }
  return rows.observations.map((row) => {
    const id = text(row.id) ?? "", subject = subjects.get(text(row.subject_id)) ?? {}, hypothesis = hypotheses.get(text(row.hypothesis_version_id)) ?? {}, experiment = experiments.get(text(row.experiment_version_id)) ?? {}, participant = participants.get(text(row.participant_id)) ?? {}, session = sessions.get(text(row.interview_session_id)) ?? {}, content = record(row.observation_content), context = record(subject.context_snapshot);
    const lineageValid = Boolean(text(row.owner_id) && text(row.subject_id) && text(row.hypothesis_id) && text(row.hypothesis_version_id) && text(row.experiment_id) && text(row.experiment_version_id)) && text(experiment.subject_id) === text(row.subject_id) && text(experiment.hypothesis_version_id) === text(row.hypothesis_version_id) && (!text(row.interview_session_id) || (text(session.experiment_version_id) === text(row.experiment_version_id) && text(session.participant_id) === text(row.participant_id)));
    const input: EligibilityInput = { observationId: id, origin: text(row.origin) ?? "", modality: text(row.modality) ?? "", sourceType: text(row.source_type) ?? "", content, participantId: text(row.participant_id), participantIndependenceKey: text(row.participant_independence_key), participantStatus: text(participant.status), interviewSessionId: text(row.interview_session_id), interviewSessionStatus: text(session.status), participantRelevance: text(session.participant_relevance), experimentFamily: text(experiment.family) ?? "", experimentLifecycle: text(experiment.lifecycle) ?? "", lineageValid, classifications: classifications.get(id) ?? [] };
    const contentText = JSON.stringify(content);
    const persistedStatementKind = text(content.statementKind) ?? text(content.statement_kind);
    return { input, identity: { provenanceCanonicalProblemId: text(context.canonical_problem_id) ?? text(context.canonicalProblemId), subjectLabel: text(subject.label), hypothesisProblemClaim: text(hypothesis.problem_claim) }, specificity: specificity(content, input.modality), statementKind: persistedStatementKind === "direct_quote" ? "direct_quote" : persistedStatementKind === "summary" ? "summary" : null, contentLength: contentText.length, observedAt: text(row.observed_at) ?? "" };
  });
}

export function buildCanonicalRegistry(rows: PersistedPromotionRows): CanonicalRegistryEntry[] {
  return rows.canonicalProblems.map((item) => ({ id: text(item.id) ?? "", canonicalTitle: text(item.canonical_title) ?? "", normalizedTitle: text(item.normalized_title) ?? "", status: text(item.status) ?? "", aliases: rows.aliases.filter((alias) => text(alias.canonical_problem_id) === text(item.id)).map((alias) => ({ normalizedAlias: text(alias.normalized_alias) ?? "" })) }));
}

export function prepareValidationPromotion(rows: PersistedPromotionRows) {
  const registry = buildCanonicalRegistry(rows);
  const evaluated = adaptPersistedPromotionRows(rows).map((item) => ({ ...item, eligibility: evaluateValidationPromotionEligibility(item.input), resolution: null as ReturnType<typeof resolveValidationCanonicalProblem> | null }));
  for (const item of evaluated) if (item.eligibility.eligible) item.resolution = resolveValidationCanonicalProblem(item.identity, registry);
  const candidates: RepresentativeCandidate[] = evaluated.flatMap((item) => item.eligibility.eligible && item.resolution?.status === "resolved" && item.eligibility.independenceUnit && item.eligibility.classification && ["supporting", "contradicting", "mixed"].includes(item.eligibility.classification) ? [{ observationId: item.input.observationId, independenceUnit: item.eligibility.independenceUnit, canonicalProblemId: item.resolution.canonicalProblemId!, polarity: item.eligibility.classification as RepresentativeCandidate["polarity"], specificity: item.specificity, targetRelevance: item.eligibility.targetRelevance, statementKind: item.statementKind, contentLength: item.contentLength, observedAt: item.observedAt }] : []);
  return { registry, evaluated, candidates, selections: selectValidationRepresentatives(candidates) };
}
