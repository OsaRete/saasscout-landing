import "server-only";

import { aggregateUserDataMoat, type DataMoatAggregation, type DataMoatAggregationClient, type DataMoatAggregationOptions, type DataMoatItemKind, type DataMoatSource, type NormalizedDataMoatItem } from "../data-moat/aggregation.ts";

export type IdeaValidationStatus = "insufficient_evidence" | "weak" | "promising" | "validated" | "contradicted";
export type IdeaValidationRecommendation = "do_not_prioritize" | "collect_more_evidence" | "run_deep_scan" | "prioritize_beta_validation";
export type IdeaValidationSignalDirection = "supporting" | "contradictory";
export type PublicIdeaValidationResult = Readonly<{
  status: IdeaValidationStatus;
  confidence: number;
  evidenceSummary: string;
  supportingSignals: IdeaValidationSignal[];
  contradictorySignals: IdeaValidationSignal[];
  explanation: string;
  freshness: Readonly<{ latestEvidenceAt: string | null; ageDays: number | null; level: "none" | "fresh" | "recent" | "aging" | "stale" }>;
  recommendation: IdeaValidationRecommendation;
}>;
export type InternalIdeaValidationDiagnostics = Readonly<{
  evidenceCounts: Record<DataMoatSource, number>;
  validationDurationMs: number;
  confidenceInputs: Readonly<{ independentMentions: number; sourceDiversity: number; recurrenceWindows: number; supportingCount: number; contradictoryCount: number; freshnessScore: number; signalStrength: number; rawConfidence: number }>;
  skippedEvidence: Array<{ id: string; source: DataMoatSource; reason: string }>;
  unsupportedEvidence: Array<{ id: string; source: DataMoatSource; kind: DataMoatItemKind; reason: string }>;
  aggregationDiagnostics: DataMoatAggregation["diagnostics"];
}>;
export type IdeaValidationResult = PublicIdeaValidationResult & Readonly<{ diagnostics: InternalIdeaValidationDiagnostics }>;
export type PublicIdeaValidationResponse = PublicIdeaValidationResult;
export type IdeaValidationSignal = Readonly<{ direction: IdeaValidationSignalDirection; source: DataMoatSource; kind: DataMoatItemKind; itemId: string; title: string; occurredAt: string; strength: number; reason: string }>;
export type ValidateIdeaInput = Readonly<{ userId: string; idea: Readonly<{ title: string; summary?: string; problem?: string; audience?: string }>; includeSharedContext?: boolean; limitPerSource?: number; now?: () => number; aggregation?: DataMoatAggregation }>;

const SUPPORTING_KINDS = new Set<DataMoatItemKind>(["scan", "opportunity", "discover_run", "discover_problem", "saved_idea", "weekly_report", "snapshot", "user_activity"]);
const CONTRADICTION_TERMS = ["not viable", "no demand", "low demand", "invalid", "rejected", "contradict", "not worth", "too expensive", "low confidence", "failed"];

function clamp(value: number, max = 100) { return Math.max(0, Math.min(max, Number(value.toFixed(1)))); }
function tokenize(value: string) { return Array.from(new Set(value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((word) => word.length > 2))); }
function textFor(item: NormalizedDataMoatItem) { return `${item.title} ${item.summary}`.toLowerCase(); }
function daysBetween(now: number, iso: string) { const time = Date.parse(iso); return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 86_400_000)) : null; }
function freshnessScore(ageDays: number | null) { if (ageDays === null) return 0; if (ageDays <= 30) return 10; if (ageDays <= 90) return 8; if (ageDays <= 180) return 5; if (ageDays <= 365) return 2; return 1; }
function freshnessLevel(ageDays: number | null): PublicIdeaValidationResult["freshness"]["level"] { if (ageDays === null) return "none"; if (ageDays <= 30) return "fresh"; if (ageDays <= 90) return "recent"; if (ageDays <= 180) return "aging"; return "stale"; }
function monthWindow(iso: string) { const date = new Date(iso); return Number.isFinite(date.getTime()) ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` : "unknown"; }
function sourceWeight(source: DataMoatSource) { return source === "accepted_discover_problems" ? 9 : source === "completed_scans" ? 8 : source === "generated_opportunities" ? 7 : source === "weekly_reports" ? 6 : source === "saved_ideas" ? 5 : source === "historical_user_evidence" ? 4 : source === "discover_history" ? 4 : source === "snapshots" ? 3 : 0; }
function overlaps(item: NormalizedDataMoatItem, ideaTokens: Set<string>) { const haystack = textFor(item); let count = 0; for (const token of ideaTokens) if (haystack.includes(token)) count += 1; return count; }
function isContradictory(item: NormalizedDataMoatItem) { const body = textFor(item); const status = String(item.metadata.status || "").toLowerCase(); return status === "rejected" || CONTRADICTION_TERMS.some((term) => body.includes(term)); }
function signalFrom(item: NormalizedDataMoatItem, direction: IdeaValidationSignalDirection, strength: number, reason: string): IdeaValidationSignal { return Object.freeze({ direction, source: item.source, kind: item.kind, itemId: item.id, title: item.title, occurredAt: item.occurredAt, strength: clamp(strength, 10), reason }); }

export function stripIdeaValidationDiagnostics(result: IdeaValidationResult): PublicIdeaValidationResponse {
  return Object.freeze({
    status: result.status,
    confidence: result.confidence,
    evidenceSummary: result.evidenceSummary,
    supportingSignals: result.supportingSignals,
    contradictorySignals: result.contradictorySignals,
    explanation: result.explanation,
    freshness: result.freshness,
    recommendation: result.recommendation,
  });
}

export function validateIdeaFromAggregation(input: ValidateIdeaInput): IdeaValidationResult {
  if (!input.userId) throw new Error("Idea validation requires an authenticated user.");
  const startedAt = input.now?.() ?? Date.now();
  const aggregation = input.aggregation;
  if (!aggregation) throw new Error("Idea validation requires aggregated Data Moat evidence.");
  if (aggregation.userId !== input.userId) throw new Error("Idea validation aggregation owner mismatch.");
  const query = [input.idea.title, input.idea.summary, input.idea.problem, input.idea.audience].filter(Boolean).join(" ");
  const tokens = new Set(tokenize(query));
  const skippedEvidence: InternalIdeaValidationDiagnostics["skippedEvidence"] = [];
  const unsupportedEvidence: InternalIdeaValidationDiagnostics["unsupportedEvidence"] = [];
  const supportingSignals: IdeaValidationSignal[] = [];
  const contradictorySignals: IdeaValidationSignal[] = [];

  for (const item of aggregation.items) {
    if (item.ownerId !== input.userId) { skippedEvidence.push({ id: item.id, source: item.source, reason: "owner_mismatch" }); continue; }
    if (!SUPPORTING_KINDS.has(item.kind)) { unsupportedEvidence.push({ id: item.id, source: item.source, kind: item.kind, reason: "unsupported_kind" }); continue; }
    const overlap = overlaps(item, tokens);
    const explicitLink = item.metadata.opportunityId === input.idea.title || item.metadata.problemId === input.idea.title;
    if (overlap === 0 && !explicitLink) { skippedEvidence.push({ id: item.id, source: item.source, reason: "not_related_to_idea" }); continue; }
    const strength = Math.min(10, sourceWeight(item.source) * 0.55 + Math.min(4, overlap) + (Number(item.metadata.score || 0) > 0 ? Math.min(2, Number(item.metadata.score) / 50) : 0));
    if (isContradictory(item)) contradictorySignals.push(signalFrom(item, "contradictory", strength, "Related evidence contains rejection, invalidation, or low-demand language."));
    else supportingSignals.push(signalFrom(item, "supporting", strength, "Related user-owned evidence supports the idea."));
  }

  supportingSignals.sort((a, b) => b.strength - a.strength || b.occurredAt.localeCompare(a.occurredAt) || a.itemId.localeCompare(b.itemId));
  contradictorySignals.sort((a, b) => b.strength - a.strength || b.occurredAt.localeCompare(a.occurredAt) || a.itemId.localeCompare(b.itemId));
  const related = [...supportingSignals, ...contradictorySignals];
  const sources = new Set(related.map((signal) => signal.source));
  const windows = new Set(related.map((signal) => monthWindow(signal.occurredAt)));
  const latestEvidenceAt = related.map((signal) => signal.occurredAt).sort().at(-1) ?? null;
  const ageDays = latestEvidenceAt ? daysBetween(startedAt, latestEvidenceAt) : null;
  const fresh = freshnessScore(ageDays);
  const supportingStrength = supportingSignals.reduce((sum, signal) => sum + signal.strength, 0);
  const contradictoryStrength = contradictorySignals.reduce((sum, signal) => sum + signal.strength, 0);
  const rawConfidence = related.length === 0 ? 0 : supportingSignals.length * 8 + sources.size * 10 + Math.min(windows.size, 4) * 6 + supportingStrength * 2 + fresh * 2 - contradictorySignals.length * 14 - contradictoryStrength * 2.5;
  const confidence = clamp(rawConfidence);
  const status: IdeaValidationStatus = related.length === 0 ? "insufficient_evidence" : confidence >= 75 ? "validated" : contradictorySignals.length > supportingSignals.length || confidence < 25 ? "contradicted" : confidence >= 55 ? "promising" : "weak";
  const recommendation: IdeaValidationRecommendation = status === "validated" ? "prioritize_beta_validation" : status === "promising" ? "run_deep_scan" : status === "contradicted" ? "do_not_prioritize" : "collect_more_evidence";
  const evidenceSummary = related.length === 0 ? "No related user-owned evidence was found through the Data Moat Aggregation Layer." : `${supportingSignals.length} supporting and ${contradictorySignals.length} contradictory related signals across ${sources.size} source types and ${windows.size} time windows.`;
  const explanation = related.length === 0 ? "The validation engine is read-only and cannot validate an idea without normalized evidence." : `Confidence is deterministic: support, source diversity, recurrence, freshness, and signal strength raise confidence; contradictory evidence lowers it.`;
  const diagnostics = Object.freeze({ evidenceCounts: aggregation.diagnostics.countsBySource, validationDurationMs: Math.max(0, (input.now?.() ?? Date.now()) - startedAt), confidenceInputs: Object.freeze({ independentMentions: related.length, sourceDiversity: sources.size, recurrenceWindows: windows.size, supportingCount: supportingSignals.length, contradictoryCount: contradictorySignals.length, freshnessScore: fresh, signalStrength: clamp(supportingStrength - contradictoryStrength, 100), rawConfidence: clamp(rawConfidence) }), skippedEvidence, unsupportedEvidence, aggregationDiagnostics: aggregation.diagnostics });
  return Object.freeze({ status, confidence, evidenceSummary, supportingSignals: supportingSignals.slice(0, 10), contradictorySignals: contradictorySignals.slice(0, 10), explanation, freshness: Object.freeze({ latestEvidenceAt, ageDays, level: freshnessLevel(ageDays) }), recommendation, diagnostics });
}

export async function validateIdea(client: DataMoatAggregationClient, input: Omit<ValidateIdeaInput, "aggregation">, options: DataMoatAggregationOptions = {}): Promise<IdeaValidationResult> {
  const aggregation = await aggregateUserDataMoat(client, input.userId, { ...options, includeSharedContext: input.includeSharedContext ?? false, limitPerSource: input.limitPerSource, now: input.now });
  return validateIdeaFromAggregation({ ...input, aggregation });
}
