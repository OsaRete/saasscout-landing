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
    evidenceDiversity: number;
    duplicateEvidenceReferenceCount: number;
    invalidReferences: readonly string[];
    missingReferences: readonly string[];
  }>;
  schemaCompleteness: Readonly<{
    requiredSectionCount: number;
    presentSectionCount: number;
    completeness: number;
    missingSections: readonly string[];
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
    duplicatedOpportunities: number;
    duplicatedClaims: number;
  }>;
  qualitySummary: Readonly<{
    groundingCoverage: number;
    schemaCompleteness: number;
    specificityScore: number;
    genericityIndicators: number;
    evidenceDiversity: number;
    sourceCoverage: number;
    contradictionCount: number;
    unsupportedClaims: number;
  }>;
}>;

const REQUIRED_SECTIONS = [
  "problem",
  "market",
  "audience",
  "recommendations",
  "opportunities",
  "competition",
  "pricing",
  "validation",
  "risks",
] as const;

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

function sectionPresent(section: typeof REQUIRED_SECTIONS[number], output: AnalyzeEvidenceOutput | GenerateOpportunitiesOutput) {
  if (isAnalyzeOutput(output)) {
    const joined = collectTexts(output).join(" ").toLowerCase();
    const map: Record<typeof section, boolean> = {
      problem: Boolean(output.pain_points || output.workflow_problems),
      market: Boolean(output.inferred_market),
      audience: Boolean(output.audience_summary),
      recommendations: Boolean(output.opportunity_angles),
      opportunities: Boolean(output.opportunity_angles),
      competition: joined.includes("compet"),
      pricing: Boolean(output.willingness_to_pay_signals) || joined.includes("pricing"),
      validation: joined.includes("validat"),
      risks: joined.includes("risk"),
    };
    return map[section];
  }

  const opportunities = output.opportunities;
  const joined = collectTexts(output).join(" ").toLowerCase();
  const hasEvery = (key: keyof GeneratedOpportunity) => opportunities.some((item) => Boolean(String(item[key] || "").trim()));
  const map: Record<typeof section, boolean> = {
    problem: hasEvery("pain") || hasEvery("problem_summary"),
    market: joined.includes("market"),
    audience: hasEvery("customer") || hasEvery("target_customer"),
    recommendations: opportunities.length > 0,
    opportunities: opportunities.length > 0,
    competition: joined.includes("compet"),
    pricing: hasEvery("pricing"),
    validation: hasEvery("validation_questions"),
    risks: joined.includes("risk"),
  };
  return map[section];
}

function countDuplicateNormalized(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values.map(normalizeText).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

function countSimpleContradictions(claims: readonly ScanGroundedClaim[]) {
  const normalized = claims.map((claim) => normalizeText(claim.text));
  let contradictions = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    for (let other = index + 1; other < normalized.length; other += 1) {
      const a = normalized[index];
      const b = normalized[other];
      const sharedTokens = a.split(" ").filter((token) => token.length > 4 && b.includes(token)).length;
      if (sharedTokens < 2) continue;
      if ((a.includes("increase") && b.includes("decrease")) || (a.includes("high") && b.includes("low")) || (a.includes("growing") && b.includes("declining"))) contradictions += 1;
    }
  }
  return contradictions;
}

export function computeScanQualityDiagnostics(input: ScanQualityDiagnosticsInput): ScanQualityDiagnostics {
  const claims = collectClaims(input.output);
  const texts = collectTexts(input.output);
  const allowedEvidenceIds = new Set(input.evidence.map((item) => item.evidenceId));
  const sourceById = new Map(input.evidence.map((item) => [item.evidenceId, item.sourceKind]));
  const refs = claims.flatMap((claim) => claim.evidenceRefs.map((ref) => ref.evidenceId));
  const uniqueEvidenceIds = [...new Set(refs)].sort();
  const invalidReferences = uniqueEvidenceIds.filter((id) => !allowedEvidenceIds.has(id));
  const missingReferences = [...allowedEvidenceIds].filter((id) => !uniqueEvidenceIds.includes(id)).sort();
  const duplicateEvidenceReferenceCount = refs.length - uniqueEvidenceIds.length;
  const groundedClaims = claims.filter((claim) => claim.groundingMode === "evidence").length;
  const inferenceClaims = claims.filter((claim) => claim.groundingMode === "inference").length;
  const unsupportedClaims = Math.max(0, claims.length - groundedClaims - inferenceClaims) + claims.filter((claim) => claim.groundingMode === "evidence" && claim.evidenceRefs.length === 0).length;
  const missingSections = REQUIRED_SECTIONS.filter((section) => !sectionPresent(section, input.output));
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
  const sourceIds = uniqueEvidenceIds.filter((id) => allowedEvidenceIds.has(id));
  const sourceCoverageKinds = new Set(sourceIds.map((id) => sourceById.get(id)).filter(Boolean));
  const contradictionCount = countSimpleContradictions(claims) + duplicatedClaims + duplicatedOpportunities;
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
      evidenceDiversity: allowedEvidenceIds.size === 0 ? 0 : sourceIds.length / allowedEvidenceIds.size,
      duplicateEvidenceReferenceCount,
      invalidReferences: Object.freeze(invalidReferences),
      missingReferences: Object.freeze(missingReferences),
    }),
    schemaCompleteness: Object.freeze({
      requiredSectionCount: REQUIRED_SECTIONS.length,
      presentSectionCount: REQUIRED_SECTIONS.length - missingSections.length,
      completeness: (REQUIRED_SECTIONS.length - missingSections.length) / REQUIRED_SECTIONS.length,
      missingSections: Object.freeze(missingSections),
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
      externalSourcesUsed: sourceCoverageKinds.has("external_snippet") ? sourceIds.filter((id) => sourceById.get(id) === "external_snippet").length : 0,
      uploadedDocumentsUsed: sourceCoverageKinds.has("uploaded_document") ? sourceIds.filter((id) => sourceById.get(id) === "uploaded_document").length : 0,
      userEvidenceUsed: sourceCoverageKinds.has("pasted_evidence") ? sourceIds.filter((id) => sourceById.get(id) === "pasted_evidence").length : 0,
      derivedAnalysisUsed: input.derivedAnalysisUsed ? 1 : 0,
      sourceIds: Object.freeze(sourceIds),
    }),
    contradictionDiagnostics: Object.freeze({ contradictionCount, duplicatedOpportunities, duplicatedClaims }),
    qualitySummary: Object.freeze({
      groundingCoverage: claims.length === 0 ? 0 : groundedClaims / claims.length,
      schemaCompleteness: (REQUIRED_SECTIONS.length - missingSections.length) / REQUIRED_SECTIONS.length,
      specificityScore,
      genericityIndicators: genericityIndicatorCount,
      evidenceDiversity: allowedEvidenceIds.size === 0 ? 0 : sourceIds.length / allowedEvidenceIds.size,
      sourceCoverage: allowedEvidenceIds.size === 0 ? 0 : sourceIds.length / allowedEvidenceIds.size,
      contradictionCount,
      unsupportedClaims,
    }),
  });
}
