import "server-only";

import type { EvidenceSourceKind } from "./evidence-envelope.ts";
import type {
  AnalyzeEvidenceOutput,
  GenerateOpportunitiesOutput,
  GeneratedOpportunity,
} from "./output-validation.ts";
import type { ScanGroundedClaim } from "./grounding.ts";

export type ScanQualityDiagnosticEvidence = Readonly<{
  evidenceId: string;
  sourceKind: EvidenceSourceKind;
}>;

export type ScanQualityDiagnosticsInput = Readonly<{
  output: AnalyzeEvidenceOutput | GenerateOpportunitiesOutput;
  evidence: readonly ScanQualityDiagnosticEvidence[];
  derivedAnalysisUsed?: boolean;
}>;

export type ScanQualityDiagnostics = Readonly<{
  groundingCoverage: Readonly<{
    totalClaims: number;
    evidenceGroundedClaims: number;
    evidenceGroundedPercentage: number;
    inferenceClaims: number;
    inferencePercentage: number;
    unsupportedClaims: number;
  }>;
  evidenceDiagnostics: Readonly<{
    evidenceReferenceCount: number;
    uniqueEvidenceIds: readonly string[];
    independentEvidenceCount: number;
    evidenceCoverage: number;
    evidenceSourceKindDiversity: number;
    duplicateReferencesWithinClaims: number;
    reusedEvidenceAcrossClaims: number;
    maxClaimsPerEvidence: number;
    evidenceConcentration: number;
    invalidReferences: readonly string[];
    missingReferences: readonly string[];
  }>;
  schemaCompleteness: Readonly<{
    contractFieldCompleteness: Readonly<{
      requiredFieldCount: number;
      presentFieldCount: number;
      completeness: number;
      missingFields: readonly string[];
    }>;
    heuristicTopicCoverage: Readonly<{
      requiredTopicCount: number;
      presentTopicCount: number;
      coverage: number;
      missingTopics: readonly string[];
    }>;
  }>;
  genericityIndicators: Readonly<{
    excessiveRepetition: boolean;
    vagueRecommendations: number;
    emptyReasoning: number;
    placeholderLikeLanguage: number;
    repeatedOpportunityStructures: number;
  }>;
  specificityMetrics: Readonly<{
    averageExplanationLength: number;
    averageReasoningDepth: number;
    concreteEntityCount: number;
    suppliedEvidenceReferenceCount: number;
    groundedDetailPercentage: number;
    specificityScore: number;
  }>;
  sourceCoverage: Readonly<{
    externalSourcesUsed: number;
    uploadedDocumentsUsed: number;
    userEvidenceUsed: number;
    derivedAnalysisUsed: number;
    sourceIds: readonly string[];
  }>;
  contradictionDiagnostics: Readonly<{
    contradictionCount: number;
    contradictionPairCount: number;
    evidenceVsEvidenceContradictions: number;
    inferenceVsEvidenceContradictions: number;
    inferenceVsInferenceContradictions: number;
    duplicatedOpportunities: number;
    duplicatedClaims: number;
  }>;
  qualitySummary: Readonly<{
    groundingCoverage: number;
    contractFieldCompleteness: number;
    heuristicTopicCoverage: number;
    specificityScore: number;
    genericityIndicators: number;
    evidenceCoverage: number;
    evidenceSourceKindDiversity: number;
    independentEvidenceCount: number;
    evidenceConcentration: number;
    sourceCoverage: number;
    contradictionCount: number;
    duplicatedClaims: number;
    duplicatedOpportunities: number;
    unsupportedClaims: number;
  }>;
}>;

const ANALYZE_CONTRACT_FIELDS = [
  "inferred_market",
  "audience_summary",
  "evidence_summary",
  "pain_points",
  "repeated_patterns",
  "workflow_problems",
  "willingness_to_pay_signals",
  "opportunity_angles",
  "confidence_score",
] as const;

const OPPORTUNITY_CONTRACT_FIELDS = [
  "title",
  "score",
  "pain",
  "customer",
  "mvp",
  "pricing",
  "difficulty",
  "problem_summary",
  "target_customer",
  "mvp_roadmap",
  "validation_questions",
  "landing_page_idea",
  "acquisition_channels",
] as const;

const HEURISTIC_TOPICS = ["competition", "market", "pricing", "risks", "validation"] as const;
const KNOWN_SOURCE_KIND_COUNT = 5;

const VAGUE_TERMS = /\b(leverage|optimize|streamline|robust|seamless|innovative|user-friendly|best practices|growth hacking|synergy|value proposition)\b/i;
const PLACEHOLDER_TERMS = /\b(tbd|todo|placeholder|lorem ipsum|n\/a|insert|your company|example\.com)\b/i;
const ENTITY_TERMS = /\b(?:[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)+|\$\d+(?:\.\d+)?|\d+(?:\.\d+)?%|\b[A-Z]{2,}\b)\b/g;

function isAnalyzeOutput(output: AnalyzeEvidenceOutput | GenerateOpportunitiesOutput): output is AnalyzeEvidenceOutput {
  return "grounding" in output && "confidence_score" in output;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function collectClaims(output: AnalyzeEvidenceOutput | GenerateOpportunitiesOutput): ScanGroundedClaim[] {
  if (isAnalyzeOutput(output)) {
    return [
      output.grounding.inferred_market,
      output.grounding.audience_summary,
      output.grounding.evidence_summary,
      ...output.grounding.pain_points,
      ...output.grounding.repeated_patterns,
      ...output.grounding.workflow_problems,
      ...output.grounding.willingness_to_pay_signals,
      ...output.grounding.opportunity_angles,
      output.grounding.confidence_score,
    ];
  }
  return output.opportunities.flatMap((opportunity) => Object.values(opportunity.grounding));
}

function collectTexts(output: AnalyzeEvidenceOutput | GenerateOpportunitiesOutput) {
  if (isAnalyzeOutput(output)) {
    return [
      output.inferred_market,
      output.audience_summary,
      output.evidence_summary,
      output.pain_points,
      output.repeated_patterns,
      output.workflow_problems,
      output.willingness_to_pay_signals,
      output.opportunity_angles,
    ];
  }
  return output.opportunities.flatMap((opportunity) => [
    opportunity.title,
    opportunity.pain,
    opportunity.customer,
    opportunity.mvp,
    opportunity.pricing,
    opportunity.problem_summary,
    opportunity.target_customer,
    opportunity.mvp_roadmap,
    opportunity.validation_questions,
    opportunity.landing_page_idea,
    opportunity.acquisition_channels,
  ]);
}

function collectOpportunities(output: AnalyzeEvidenceOutput | GenerateOpportunitiesOutput): readonly GeneratedOpportunity[] {
  return isAnalyzeOutput(output) ? [] : output.opportunities;
}

function computeContractFieldCompleteness(output: AnalyzeEvidenceOutput | GenerateOpportunitiesOutput) {
  if (isAnalyzeOutput(output)) {
    const missingFields = ANALYZE_CONTRACT_FIELDS.filter((field) => !Boolean(output[field]));
    return {
      requiredFieldCount: ANALYZE_CONTRACT_FIELDS.length,
      presentFieldCount: ANALYZE_CONTRACT_FIELDS.length - missingFields.length,
      completeness: (ANALYZE_CONTRACT_FIELDS.length - missingFields.length) / ANALYZE_CONTRACT_FIELDS.length,
      missingFields,
    };
  }

  const missingFields = OPPORTUNITY_CONTRACT_FIELDS.filter((field) => !output.opportunities.some((opportunity) => Boolean(opportunity[field])));
  return {
    requiredFieldCount: OPPORTUNITY_CONTRACT_FIELDS.length,
    presentFieldCount: OPPORTUNITY_CONTRACT_FIELDS.length - missingFields.length,
    completeness: (OPPORTUNITY_CONTRACT_FIELDS.length - missingFields.length) / OPPORTUNITY_CONTRACT_FIELDS.length,
    missingFields,
  };
}

function heuristicTopicPresent(topic: typeof HEURISTIC_TOPICS[number], output: AnalyzeEvidenceOutput | GenerateOpportunitiesOutput) {
  const joined = collectTexts(output).join(" ").toLowerCase();
  const opportunities = collectOpportunities(output);
  const opportunityHas = (key: keyof GeneratedOpportunity) => opportunities.some((item) => Boolean(String(item[key] || "").trim()));
  const map: Record<typeof topic, boolean> = {
    competition: joined.includes("compet"),
    market: isAnalyzeOutput(output) ? Boolean(output.inferred_market) : joined.includes("market"),
    pricing: isAnalyzeOutput(output) ? Boolean(output.willingness_to_pay_signals) || joined.includes("pricing") : opportunityHas("pricing"),
    risks: joined.includes("risk"),
    validation: isAnalyzeOutput(output) ? joined.includes("validat") : opportunityHas("validation_questions"),
  };
  return map[topic];
}

function computeHeuristicTopicCoverage(output: AnalyzeEvidenceOutput | GenerateOpportunitiesOutput) {
  const missingTopics = HEURISTIC_TOPICS.filter((topic) => !heuristicTopicPresent(topic, output));
  return {
    requiredTopicCount: HEURISTIC_TOPICS.length,
    presentTopicCount: HEURISTIC_TOPICS.length - missingTopics.length,
    coverage: (HEURISTIC_TOPICS.length - missingTopics.length) / HEURISTIC_TOPICS.length,
    missingTopics,
  };
}

function countDuplicateNormalized(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values.map(normalizeText).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function computeContradictionDiagnostics(claims: readonly ScanGroundedClaim[]) {
  const normalized = claims.map((claim) => normalizeText(claim.text));
  let evidenceVsEvidenceContradictions = 0;
  let inferenceVsEvidenceContradictions = 0;
  let inferenceVsInferenceContradictions = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    for (let other = index + 1; other < normalized.length; other += 1) {
      const a = normalized[index];
      const b = normalized[other];
      const sharedTokens = a.split(" ").filter((token) => token.length > 4 && b.includes(token)).length;
      if (sharedTokens < 2) continue;
      const aTokens = new Set(a.split(" "));
      const bTokens = new Set(b.split(" "));
      const aRising = aTokens.has("increase") || aTokens.has("increasing") || aTokens.has("growing");
      const bRising = bTokens.has("increase") || bTokens.has("increasing") || bTokens.has("growing");
      const aFalling = aTokens.has("decrease") || aTokens.has("decreasing") || aTokens.has("declining");
      const bFalling = bTokens.has("decrease") || bTokens.has("decreasing") || bTokens.has("declining");
      const contradicts = (aRising && bFalling) || (bRising && aFalling) || (aTokens.has("high") && bTokens.has("low")) || (bTokens.has("high") && aTokens.has("low"));
      if (!contradicts) continue;
      const modes = [claims[index].groundingMode, claims[other].groundingMode];
      if (modes[0] === "evidence" && modes[1] === "evidence") evidenceVsEvidenceContradictions += 1;
      else if (modes.includes("evidence") && modes.includes("inference")) inferenceVsEvidenceContradictions += 1;
      else if (modes[0] === "inference" && modes[1] === "inference") inferenceVsInferenceContradictions += 1;
    }
  }

  const contradictionPairCount = evidenceVsEvidenceContradictions + inferenceVsEvidenceContradictions + inferenceVsInferenceContradictions;
  return { contradictionCount: contradictionPairCount, contradictionPairCount, evidenceVsEvidenceContradictions, inferenceVsEvidenceContradictions, inferenceVsInferenceContradictions };
}

export function computeScanQualityDiagnostics(input: ScanQualityDiagnosticsInput): ScanQualityDiagnostics {
  const claims = collectClaims(input.output);
  const texts = collectTexts(input.output);
  const allowedEvidenceIds = new Set(input.evidence.map((item) => item.evidenceId));
  const sourceById = new Map(input.evidence.map((item) => [item.evidenceId, item.sourceKind]));
  const refs = claims.flatMap((claim) => claim.evidenceRefs.map((ref) => ref.evidenceId));
  const uniqueEvidenceIds = [...new Set(refs)].sort();
  const validEvidenceIds = uniqueEvidenceIds.filter((id) => allowedEvidenceIds.has(id));
  const invalidReferences = uniqueEvidenceIds.filter((id) => !allowedEvidenceIds.has(id));
  const missingReferences = [...allowedEvidenceIds].filter((id) => !uniqueEvidenceIds.includes(id)).sort();
  const duplicateReferencesWithinClaims = claims.reduce((total, claim) => {
    const ids = claim.evidenceRefs.map((ref) => ref.evidenceId);
    return total + ids.length - new Set(ids).size;
  }, 0);
  const evidenceClaimCounts = new Map<string, number>();
  for (const claim of claims) {
    for (const evidenceId of new Set(claim.evidenceRefs.map((ref) => ref.evidenceId).filter((id) => allowedEvidenceIds.has(id)))) {
      evidenceClaimCounts.set(evidenceId, (evidenceClaimCounts.get(evidenceId) || 0) + 1);
    }
  }
  const reusedEvidenceAcrossClaims = [...evidenceClaimCounts.values()].filter((count) => count > 1).length;
  const maxClaimsPerEvidence = Math.max(0, ...evidenceClaimCounts.values());
  const evidenceConcentration = claims.length === 0 ? 0 : clamp01(maxClaimsPerEvidence / claims.length);
  const evidenceCoverage = allowedEvidenceIds.size === 0 ? 0 : validEvidenceIds.length / allowedEvidenceIds.size;
  const sourceCoverageKinds = new Set(validEvidenceIds.map((id) => sourceById.get(id)).filter((kind): kind is EvidenceSourceKind => Boolean(kind)));
  const evidenceSourceKindDiversity = clamp01(sourceCoverageKinds.size / KNOWN_SOURCE_KIND_COUNT);
  const groundedClaims = claims.filter((claim) => claim.groundingMode === "evidence").length;
  const inferenceClaims = claims.filter((claim) => claim.groundingMode === "inference").length;
  const unsupportedClaims = Math.max(0, claims.length - groundedClaims - inferenceClaims) + claims.filter((claim) => claim.groundingMode === "evidence" && claim.evidenceRefs.length === 0).length;
  const contractFieldCompleteness = computeContractFieldCompleteness(input.output);
  const heuristicTopicCoverage = computeHeuristicTopicCoverage(input.output);
  const vagueRecommendations = texts.filter((text) => VAGUE_TERMS.test(text)).length;
  const emptyReasoning = claims.filter((claim) => claim.groundingMode === "inference" && !claim.inferenceReason?.trim()).length;
  const placeholderLikeLanguage = texts.filter((text) => PLACEHOLDER_TERMS.test(text)).length;
  const duplicatedClaims = countDuplicateNormalized(claims.map((claim) => claim.text));
  const duplicatedOpportunities = countDuplicateNormalized(collectOpportunities(input.output).map((opportunity) => `${opportunity.title} ${opportunity.pain} ${opportunity.mvp}`));
  const repetitionRatio = texts.length === 0 ? 0 : countDuplicateNormalized(texts) / texts.length;
  const averageExplanationLength = texts.length === 0 ? 0 : texts.reduce((total, text) => total + text.split(/\s+/).filter(Boolean).length, 0) / texts.length;
  const averageReasoningDepth = claims.length === 0 ? 0 : claims.reduce((total, claim) => total + (claim.inferenceReason ? claim.inferenceReason.split(/\s+/).filter(Boolean).length : claim.evidenceRefs.length), 0) / claims.length;
  const concreteEntityCount = texts.reduce((total, text) => total + (text.match(ENTITY_TERMS)?.length || 0), 0);
  const groundedDetailPercentage = claims.length === 0 ? 0 : groundedClaims / claims.length;
  const specificityScore = clamp01((Math.min(averageExplanationLength, 80) / 80 + Math.min(averageReasoningDepth, 6) / 6 + Math.min(concreteEntityCount, 12) / 12 + groundedDetailPercentage) / 4);
  const contradictionDiagnostics = computeContradictionDiagnostics(claims);
  const genericityIndicatorCount = [repetitionRatio > 0.2, vagueRecommendations > 0, emptyReasoning > 0, placeholderLikeLanguage > 0, duplicatedOpportunities > 0].filter(Boolean).length;

  return Object.freeze({
    groundingCoverage: Object.freeze({
      totalClaims: claims.length,
      evidenceGroundedClaims: groundedClaims,
      evidenceGroundedPercentage: claims.length === 0 ? 0 : groundedClaims / claims.length,
      inferenceClaims,
      inferencePercentage: claims.length === 0 ? 0 : inferenceClaims / claims.length,
      unsupportedClaims,
    }),
    evidenceDiagnostics: Object.freeze({
      evidenceReferenceCount: refs.length,
      uniqueEvidenceIds: Object.freeze(uniqueEvidenceIds),
      independentEvidenceCount: validEvidenceIds.length,
      evidenceCoverage,
      evidenceSourceKindDiversity,
      duplicateReferencesWithinClaims,
      reusedEvidenceAcrossClaims,
      maxClaimsPerEvidence,
      evidenceConcentration,
      invalidReferences: Object.freeze(invalidReferences),
      missingReferences: Object.freeze(missingReferences),
    }),
    schemaCompleteness: Object.freeze({
      contractFieldCompleteness: Object.freeze({
        ...contractFieldCompleteness,
        missingFields: Object.freeze(contractFieldCompleteness.missingFields),
      }),
      heuristicTopicCoverage: Object.freeze({
        ...heuristicTopicCoverage,
        missingTopics: Object.freeze(heuristicTopicCoverage.missingTopics),
      }),
    }),
    genericityIndicators: Object.freeze({
      excessiveRepetition: repetitionRatio > 0.2,
      vagueRecommendations,
      emptyReasoning,
      placeholderLikeLanguage,
      repeatedOpportunityStructures: duplicatedOpportunities,
    }),
    specificityMetrics: Object.freeze({
      averageExplanationLength,
      averageReasoningDepth,
      concreteEntityCount,
      suppliedEvidenceReferenceCount: refs.length,
      groundedDetailPercentage,
      specificityScore,
    }),
    sourceCoverage: Object.freeze({
      externalSourcesUsed: validEvidenceIds.filter((id) => sourceById.get(id) === "external_snippet").length,
      uploadedDocumentsUsed: validEvidenceIds.filter((id) => sourceById.get(id) === "uploaded_document").length,
      userEvidenceUsed: validEvidenceIds.filter((id) => sourceById.get(id) === "pasted_evidence").length,
      derivedAnalysisUsed: input.derivedAnalysisUsed ? 1 : 0,
      sourceIds: Object.freeze(validEvidenceIds),
    }),
    contradictionDiagnostics: Object.freeze({ ...contradictionDiagnostics, duplicatedOpportunities, duplicatedClaims }),
    qualitySummary: Object.freeze({
      groundingCoverage: claims.length === 0 ? 0 : groundedClaims / claims.length,
      contractFieldCompleteness: contractFieldCompleteness.completeness,
      heuristicTopicCoverage: heuristicTopicCoverage.coverage,
      specificityScore,
      genericityIndicators: genericityIndicatorCount,
      evidenceCoverage,
      evidenceSourceKindDiversity,
      independentEvidenceCount: validEvidenceIds.length,
      evidenceConcentration,
      sourceCoverage: evidenceCoverage,
      contradictionCount: contradictionDiagnostics.contradictionCount,
      duplicatedClaims,
      duplicatedOpportunities,
      unsupportedClaims,
    }),
  });
}

export class ScanQualityDiagnosticsValidationError extends Error { readonly path: string; constructor(path = "diagnostics") { super("Scan quality diagnostics are invalid."); this.name = "ScanQualityDiagnosticsValidationError"; this.path = path; } }
function qRecord(v: unknown, path: string): Record<string, unknown> { if (typeof v !== "object" || v === null || Array.isArray(v)) throw new ScanQualityDiagnosticsValidationError(path); return v as Record<string, unknown>; }
function qExact(o: Record<string, unknown>, keys: readonly string[], path: string) { for (const k of keys) if (!(k in o)) throw new ScanQualityDiagnosticsValidationError(`${path}.${k}`); for (const k of Object.keys(o)) if (!keys.includes(k)) throw new ScanQualityDiagnosticsValidationError(`${path}.${k}`); }
function qNum(v: unknown, path: string, max?: number) { if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || (max !== undefined && v > max)) throw new ScanQualityDiagnosticsValidationError(path); return v; }
function qInt(v: unknown, path: string) { const n = qNum(v, path); if (!Number.isInteger(n)) throw new ScanQualityDiagnosticsValidationError(path); return n; }
function qBool(v: unknown, path: string) { if (typeof v !== "boolean") throw new ScanQualityDiagnosticsValidationError(path); }
function qStrArr(v: unknown, path: string) { if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ScanQualityDiagnosticsValidationError(path); }
export function validateScanQualityDiagnostics(value: unknown): asserts value is ScanQualityDiagnostics {
  const d=qRecord(value,"diagnostics"); qExact(d,["groundingCoverage","evidenceDiagnostics","schemaCompleteness","genericityIndicators","specificityMetrics","sourceCoverage","contradictionDiagnostics","qualitySummary"],"diagnostics");
  const g=qRecord(d.groundingCoverage,"diagnostics.groundingCoverage"); qExact(g,["totalClaims","evidenceGroundedClaims","evidenceGroundedPercentage","inferenceClaims","inferencePercentage","unsupportedClaims"],"diagnostics.groundingCoverage"); ["totalClaims","evidenceGroundedClaims","inferenceClaims","unsupportedClaims"].forEach(k=>qInt(g[k],`diagnostics.groundingCoverage.${k}`)); ["evidenceGroundedPercentage","inferencePercentage"].forEach(k=>qNum(g[k],`diagnostics.groundingCoverage.${k}`,1)); if ((g.evidenceGroundedClaims as number)+(g.inferenceClaims as number)+(g.unsupportedClaims as number)!==(g.totalClaims as number)) throw new ScanQualityDiagnosticsValidationError("diagnostics.groundingCoverage.totalClaims");
  const e=qRecord(d.evidenceDiagnostics,"diagnostics.evidenceDiagnostics"); qExact(e,["evidenceReferenceCount","uniqueEvidenceIds","independentEvidenceCount","evidenceCoverage","evidenceSourceKindDiversity","duplicateReferencesWithinClaims","reusedEvidenceAcrossClaims","maxClaimsPerEvidence","evidenceConcentration","invalidReferences","missingReferences"],"diagnostics.evidenceDiagnostics"); ["evidenceReferenceCount","independentEvidenceCount","duplicateReferencesWithinClaims","reusedEvidenceAcrossClaims","maxClaimsPerEvidence"].forEach(k=>qInt(e[k],`diagnostics.evidenceDiagnostics.${k}`)); ["evidenceCoverage","evidenceSourceKindDiversity","evidenceConcentration"].forEach(k=>qNum(e[k],`diagnostics.evidenceDiagnostics.${k}`,1)); ["uniqueEvidenceIds","invalidReferences","missingReferences"].forEach(k=>qStrArr(e[k],`diagnostics.evidenceDiagnostics.${k}`));
  const sc=qRecord(d.schemaCompleteness,"diagnostics.schemaCompleteness"); qExact(sc,["contractFieldCompleteness","heuristicTopicCoverage"],"diagnostics.schemaCompleteness"); for (const k of ["contractFieldCompleteness","heuristicTopicCoverage"] as const) { const x=qRecord(sc[k],`diagnostics.schemaCompleteness.${k}`); const totalKey=k==="contractFieldCompleteness"?"requiredFieldCount":"requiredTopicCount"; const presentKey=k==="contractFieldCompleteness"?"presentFieldCount":"presentTopicCount"; const pctKey=k==="contractFieldCompleteness"?"completeness":"coverage"; const missingKey=k==="contractFieldCompleteness"?"missingFields":"missingTopics"; qExact(x,[totalKey,presentKey,pctKey,missingKey],`diagnostics.schemaCompleteness.${k}`); const total=qInt(x[totalKey],`${k}.${totalKey}`), present=qInt(x[presentKey],`${k}.${presentKey}`); qNum(x[pctKey],`${k}.${pctKey}`,1); qStrArr(x[missingKey],`${k}.${missingKey}`); if (present>total) throw new ScanQualityDiagnosticsValidationError(`${k}.${presentKey}`); }
  const gi=qRecord(d.genericityIndicators,"diagnostics.genericityIndicators"); qExact(gi,["excessiveRepetition","vagueRecommendations","emptyReasoning","placeholderLikeLanguage","repeatedOpportunityStructures"],"diagnostics.genericityIndicators"); qBool(gi.excessiveRepetition,"diagnostics.genericityIndicators.excessiveRepetition"); ["vagueRecommendations","emptyReasoning","placeholderLikeLanguage","repeatedOpportunityStructures"].forEach(k=>qInt(gi[k],`diagnostics.genericityIndicators.${k}`));
  const sm=qRecord(d.specificityMetrics,"diagnostics.specificityMetrics"); qExact(sm,["averageExplanationLength","averageReasoningDepth","concreteEntityCount","suppliedEvidenceReferenceCount","groundedDetailPercentage","specificityScore"],"diagnostics.specificityMetrics"); ["averageExplanationLength","averageReasoningDepth","concreteEntityCount","suppliedEvidenceReferenceCount"].forEach(k=>qNum(sm[k],`diagnostics.specificityMetrics.${k}`)); ["groundedDetailPercentage","specificityScore"].forEach(k=>qNum(sm[k],`diagnostics.specificityMetrics.${k}`,1));
  const so=qRecord(d.sourceCoverage,"diagnostics.sourceCoverage"); qExact(so,["externalSourcesUsed","uploadedDocumentsUsed","userEvidenceUsed","derivedAnalysisUsed","sourceIds"],"diagnostics.sourceCoverage"); ["externalSourcesUsed","uploadedDocumentsUsed","userEvidenceUsed","derivedAnalysisUsed"].forEach(k=>qInt(so[k],`diagnostics.sourceCoverage.${k}`)); qStrArr(so.sourceIds,"diagnostics.sourceCoverage.sourceIds");
  const cd=qRecord(d.contradictionDiagnostics,"diagnostics.contradictionDiagnostics"); qExact(cd,["contradictionCount","contradictionPairCount","evidenceVsEvidenceContradictions","inferenceVsEvidenceContradictions","inferenceVsInferenceContradictions","duplicatedOpportunities","duplicatedClaims"],"diagnostics.contradictionDiagnostics"); Object.keys(cd).forEach(k=>qInt(cd[k],`diagnostics.contradictionDiagnostics.${k}`));
  const qs=qRecord(d.qualitySummary,"diagnostics.qualitySummary"); qExact(qs,["groundingCoverage","contractFieldCompleteness","heuristicTopicCoverage","specificityScore","genericityIndicators","evidenceCoverage","evidenceSourceKindDiversity","independentEvidenceCount","evidenceConcentration","sourceCoverage","contradictionCount","duplicatedClaims","duplicatedOpportunities","unsupportedClaims"],"diagnostics.qualitySummary"); ["groundingCoverage","contractFieldCompleteness","heuristicTopicCoverage","specificityScore","evidenceCoverage","evidenceSourceKindDiversity","evidenceConcentration","sourceCoverage"].forEach(k=>qNum(qs[k],`diagnostics.qualitySummary.${k}`,1)); ["genericityIndicators","independentEvidenceCount","contradictionCount","duplicatedClaims","duplicatedOpportunities","unsupportedClaims"].forEach(k=>qInt(qs[k],`diagnostics.qualitySummary.${k}`)); if (qs.groundingCoverage!==g.evidenceGroundedPercentage || qs.unsupportedClaims!==g.unsupportedClaims) throw new ScanQualityDiagnosticsValidationError("diagnostics.qualitySummary.groundingCoverage");
}
