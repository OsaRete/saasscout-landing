import type { Evidence } from "../../evidence";
import type { ProblemSynthesisCandidate, ProblemSynthesisCandidateCollapseReport, ProblemSynthesisDiagnostics, ProblemSynthesisInput, ProblemSynthesisResult, ProblemScoreBreakdown, ProblemSynthesisSeedDiagnostic } from "./types";

function clampScore(value: unknown, fallback = 0) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.min(10, Math.max(0, score));
}

function average(values: unknown[], fallback = 0) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function sentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function evidenceReference(evidence: Evidence) {
  return [evidence.deduplicationFingerprint, evidence.sourceName, evidence.sourceUrl].filter(Boolean).join(" — ");
}

type SynthesisSeed = {
  title: string;
  normalizedTitle: string;
  market: string;
  audience: string;
  problemCluster: string;
  engine: string;
  baseScore: number;
  rank: number;
  evidenceCount: number;
  sourceQualityScore: number;
  titleSpecificityScore: number;
  claimSpecificityScore: number;
  genericTitle: boolean;
};

type RankedSynthesisSeed = SynthesisSeed & {
  score: number;
  engineSupport: string[];
  rejectionReasons: string[];
  downrankedGeneric: boolean;
  semanticTitle: string;
  semanticTitleScore: number;
  rawTitleRejected: boolean;
  rawTitleRejectionReasons: string[];
};

const GENERIC_TITLES = new Set(["manual", "billing", "approval", "workflow", "automation", "software", "tool", "app", "service"]);
const MIN_EVIDENCE_FOR_STRONG_SEED = 2;
const MAX_DIAGNOSTIC_SYNTHESIS_CANDIDATES = 3;
const MIN_SYNTHESIS_CONFIDENCE = 5;
const MIN_SEMANTIC_TITLE_SCORE = 3;
const RAW_EVIDENCE_PREFIXES = ["evidence", "reddit", "linkedin", "multiple signals", "manual workflows lead"];
const BUSINESS_CONTEXT_TERMS = new Set(["crm", "invoice", "client", "sales", "agency", "workflow", "onboarding", "billing", "follow", "approval", "automation", "operations", "reporting", "spreadsheet", "customer", "lead", "handoff"]);
const PROBLEM_CONTEXT_TERMS = new Set(["bottleneck", "friction", "delay", "delays", "breakdown", "errors", "mistakes", "disconnected", "fragmented", "manual", "scattered", "follow", "approval", "handoff"]);

function safeLogTitle(value: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "unknown";
}

function specificityScore(value: string) {
  const words = normalize(value).split(" ").filter(Boolean);
  if (words.length === 0) return 0;
  const lengthScore = Math.min(10, words.length * 2);
  const descriptiveBonus = words.some((word) => word.length >= 8) ? 1 : 0;
  return clampScore(lengthScore + descriptiveBonus, 0);
}

function isGenericTitle(title: string, normalizedTitle = normalize(title)) {
  const words = normalizedTitle.split(" ").filter(Boolean);
  if (words.length === 0) return true;
  if (words.length === 1 && GENERIC_TITLES.has(words[0])) return true;
  return words.length <= 2 && words.every((word) => GENERIC_TITLES.has(word));
}

function titleCase(value: string) {
  return normalize(value).split(" ").filter(Boolean).map((word) => (
    word.length <= 3 && ["crm", "smb", "api"].includes(word) ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`
  )).join(" ");
}

function rawTitleRejectionReasons(title: string) {
  const normalizedTitle = normalize(title);
  const words = normalizedTitle.split(" ").filter(Boolean);
  return [
    RAW_EVIDENCE_PREFIXES.some((prefix) => normalizedTitle.startsWith(prefix)) ? "raw_evidence_prefix" : "",
    /["“”‘’]/.test(title) ? "quoted_text" : "",
    words.length > 7 ? "long_copied_phrase" : "",
    /\b(reddit|linkedin|discussion|discussions|source|sources|signals|evidence)\b/.test(normalizedTitle) ? "source_sentence_language" : "",
    normalizedTitle.includes("lead to") || normalizedTitle.includes("leads to") ? "sentence_causality_phrase" : "",
    isGenericTitle(title, normalizedTitle) ? "generic_low_information_title" : "",
  ].filter(Boolean);
}

function semanticProblemPhrase(seed: SynthesisSeed) {
  const cluster = seed.problemCluster !== "unknown" ? seed.problemCluster : "";
  const title = normalize(seed.title);
  const problemWords = [...new Set([...cluster.split(" "), ...title.split(" ")].filter((word) => BUSINESS_CONTEXT_TERMS.has(word) || PROBLEM_CONTEXT_TERMS.has(word)))];
  const context = problemWords.slice(0, 4).join(" ");
  if (context.includes("client") && context.includes("onboarding")) return "client onboarding friction";
  if (context.includes("invoice") && context.includes("approval")) return "invoice approval bottleneck";
  if (context.includes("crm")) return "disconnected crm operations";
  if (context.includes("sales") && context.includes("follow")) return "manual sales follow up";
  if (context.includes("spreadsheet") && context.includes("workflow")) return "spreadsheet based workflow management";
  if (context.includes("agency") && context.includes("operations")) return "fragmented agency operations";
  if (context) return context;
  return cluster || title || "workflow automation";
}

function semanticTitleForSeed(seed: SynthesisSeed) {
  const phrase = semanticProblemPhrase(seed);
  const market = seed.market !== "unknown" ? seed.market : "";
  const audience = seed.audience !== "unknown" ? seed.audience : "";
  const title = titleCase(phrase);
  if (normalize(title).split(" ").length >= 3) return title;
  if (market) return `${title} for ${titleCase(market)}`;
  if (audience) return `${title} for ${titleCase(audience)}`;
  return title;
}

function semanticTitleScore(seed: SynthesisSeed, engineSupport: string[], rawRejected: boolean) {
  const title = semanticTitleForSeed(seed);
  const normalizedTitle = normalize(title);
  const words = normalizedTitle.split(" ").filter(Boolean);
  const businessContext = words.filter((word) => BUSINESS_CONTEXT_TERMS.has(word)).length;
  const problemContext = words.filter((word) => PROBLEM_CONTEXT_TERMS.has(word)).length;
  const marketContext = seed.market !== "unknown" || seed.audience !== "unknown" ? 1 : 0;
  const canonicalReuse = seed.problemCluster !== "unknown" && normalizedTitle.includes(seed.problemCluster.split(" ")[0]) ? 1 : 0;
  return Math.round(clampScore(
    Math.min(10, words.length * 1.6) * 0.2
    + Math.min(10, businessContext * 2.2) * 0.2
    + Math.min(10, problemContext * 2.4) * 0.2
    + Math.min(10, engineSupport.length * 2.5) * 0.18
    + marketContext * 1.2
    + canonicalReuse * 0.8
    + (rawRejected ? 0.7 : 0),
    0
  ) * 100) / 100;
}

function candidateSeeds(input: ProblemSynthesisInput): SynthesisSeed[] {
  const toSeed = (engine: string, candidate: { title?: string; normalizedTitle?: string; score?: { totalScore?: number; confidenceScore?: number; evidenceScore?: number }; rank?: number; context?: Record<string, unknown>; marketContext?: Record<string, unknown>; evidence?: Array<{ sourceQualityScore?: number; claim?: string }> }): SynthesisSeed => {
    const context = candidate.context || {};
    const marketContext = candidate.marketContext || {};
    const markets = Array.isArray(context.markets) ? context.markets : [];
    const audiences = Array.isArray(context.audiences) ? context.audiences : [];
    const market = firstText(context.market, marketContext.market, markets[0], context.nicheCategory, marketContext.nicheCategory);
    const audience = firstText(context.audience, marketContext.audience, audiences[0], context.nicheCategory, marketContext.nicheCategory);
    const title = firstText(candidate.title, context.primaryProblem, marketContext.primaryProblem, context.primaryClaim, context.primaryTheme);
    const normalizedTitle = candidate.normalizedTitle || normalize(title);
    const evidenceItems = candidate.evidence || [];
    const claims = evidenceItems.map((item) => item.claim).filter(Boolean) as string[];
    const problemCluster = normalize(firstText(context.primaryTheme, context.primaryProblem, marketContext.primaryProblem, context.nicheCategory, marketContext.nicheCategory, title)) || "unknown";
    return {
      title,
      normalizedTitle,
      market: normalize(market) || "unknown",
      audience: normalize(audience) || "unknown",
      problemCluster,
      engine,
      baseScore: clampScore(candidate.score?.totalScore, 0),
      rank: candidate.rank || 999,
      evidenceCount: evidenceItems.length,
      sourceQualityScore: average(evidenceItems.map((item) => item.sourceQualityScore), clampScore(candidate.score?.confidenceScore, 0)),
      titleSpecificityScore: specificityScore(title),
      claimSpecificityScore: average(claims.map(specificityScore), specificityScore(firstText(context.primaryClaim, context.primaryProblem, marketContext.primaryProblem, title))),
      genericTitle: isGenericTitle(title, normalizedTitle),
    };
  };

  return [
    ...(input.painDetection?.candidates || []).map((candidate) => toSeed("pain", candidate)),
    ...(input.patternDetection?.candidates || []).map((candidate) => toSeed("pattern", candidate)),
    ...(input.trendDetection?.candidates || []).map((candidate) => toSeed("trend", candidate)),
    ...(input.opportunityDetection?.candidates || []).map((candidate) => toSeed("opportunity", candidate)),
    ...(input.monetizationEvaluation?.candidates || []).map((candidate) => toSeed("monetization", candidate)),
    ...(input.confidenceEvaluation?.candidates || []).map((candidate) => toSeed("confidence", candidate)),
  ];
}

function rankSeeds(seeds: SynthesisSeed[]): RankedSynthesisSeed[] {
  const groups = new Map<string, SynthesisSeed[]>();
  for (const seed of seeds) {
    const clusterKey = [seed.normalizedTitle, seed.market, seed.audience, seed.problemCluster].join("|");
    groups.set(clusterKey, [...(groups.get(clusterKey) || []), seed]);
  }

  return [...groups.values()].map((group) => {
    const representative = [...group].sort((a, b) => b.baseScore - a.baseScore || a.rank - b.rank || a.normalizedTitle.localeCompare(b.normalizedTitle))[0];
    const engineSupport = unique(group.map((seed) => seed.engine)).sort();
    const evidenceCount = group.reduce((sum, seed) => sum + seed.evidenceCount, 0);
    const genericTitle = group.some((seed) => seed.genericTitle);
    const hasContext = representative.market !== "unknown" || representative.audience !== "unknown" || representative.problemCluster !== representative.normalizedTitle;
    const downrankedGeneric = genericTitle && (!hasContext || evidenceCount < MIN_EVIDENCE_FOR_STRONG_SEED);
    const rawRejectionReasons = rawTitleRejectionReasons(representative.title);
    const rawTitleRejected = rawRejectionReasons.length > 0;
    const semanticTitle = semanticTitleForSeed(representative);
    const semanticScore = semanticTitleScore(representative, engineSupport, rawTitleRejected);
    const rejectionReasons = [
      downrankedGeneric ? "generic_title_without_enough_context" : "",
      rawTitleRejected ? "raw_title_replaced_by_semantic_title" : "",
      evidenceCount < MIN_EVIDENCE_FOR_STRONG_SEED ? "not_enough_evidence" : "",
      engineSupport.length < 2 ? "single_engine_support" : "",
    ].filter(Boolean);
    const score = Math.round(clampScore(
      average(group.map((seed) => seed.baseScore), 0) * 0.36
      + Math.min(10, evidenceCount * 1.5) * 0.14
      + average(group.map((seed) => seed.sourceQualityScore), 0) * 0.12
      + representative.titleSpecificityScore * 0.14
      + representative.claimSpecificityScore * 0.1
      + Math.min(10, engineSupport.length * 2) * 0.14
      + semanticScore * 0.08
      - (downrankedGeneric ? 3 : 0),
      0
    ) * 100) / 100;

    return { ...representative, evidenceCount, score, engineSupport, rejectionReasons, genericTitle, downrankedGeneric, semanticTitle, semanticTitleScore: semanticScore, rawTitleRejected, rawTitleRejectionReasons: rawRejectionReasons };
  }).sort((a, b) => b.score - a.score || b.semanticTitleScore - a.semanticTitleScore || a.rank - b.rank || a.normalizedTitle.localeCompare(b.normalizedTitle));
}

function seedDiagnostic(seed: RankedSynthesisSeed): ProblemSynthesisSeedDiagnostic {
  return {
    title: safeLogTitle(seed.title),
    normalizedTitle: seed.normalizedTitle,
    market: seed.market,
    audience: seed.audience,
    problemCluster: seed.problemCluster,
    score: seed.score,
    rejectionReasons: seed.rejectionReasons,
    engineSupport: seed.engineSupport,
    evidenceCount: seed.evidenceCount,
    genericTitle: seed.genericTitle,
    downrankedGeneric: seed.downrankedGeneric,
    semanticTitle: seed.semanticTitle,
    semanticTitleScore: seed.semanticTitleScore,
    rawTitleRejected: seed.rawTitleRejected,
    rawTitleRejectionReasons: seed.rawTitleRejectionReasons,
  };
}

function countReasons(seeds: RankedSynthesisSeed[]) {
  const counts = new Map<string, number>();
  for (const seed of seeds) {
    for (const reason of seed.rejectionReasons) counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({ reason, count }));
}

function countRawTitleReasons(seeds: RankedSynthesisSeed[]) {
  const counts = new Map<string, number>();
  for (const seed of seeds) {
    for (const reason of seed.rawTitleRejectionReasons) counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({ reason, count }));
}

function scoreDistribution(scores: number[]) {
  if (scores.length === 0) return { min: 0, max: 0, average: 0 };
  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
    average: Math.round(average(scores, 0) * 100) / 100,
  };
}

function isMultiCandidateDiagnosticsEnabled() {
  return process.env.PROBLEM_SYNTHESIS_MULTI_CANDIDATE_DIAGNOSTICS === "1";
}

type CandidateSelection = {
  emittedSeeds: RankedSynthesisSeed[];
  rejectedSeeds: Array<{ seed: RankedSynthesisSeed; reasons: string[] }>;
  maxCandidateCount: number;
  multiCandidateModeEnabled: boolean;
};

function selectionRejectionReasons(seed: RankedSynthesisSeed, emittedSeeds: RankedSynthesisSeed[], confidence: number, hasMeaningfulSummary: boolean) {
  const normalizedSemanticTitle = normalize(seed.semanticTitle);
  const emittedTitleKeys = new Set(emittedSeeds.map((item) => normalize(item.semanticTitle)));
  const emittedMarketAudienceClusters = new Set(emittedSeeds.map((item) => [item.market, item.audience].join("|")));
  return [
    !normalizedSemanticTitle || isGenericTitle(seed.semanticTitle, normalizedSemanticTitle) || seed.semanticTitleScore < MIN_SEMANTIC_TITLE_SCORE ? "generic_or_weak_semantic_title" : "",
    seed.evidenceCount < MIN_EVIDENCE_FOR_STRONG_SEED || seed.engineSupport.length < 2 ? "weak_evidence_support" : "",
    !hasMeaningfulSummary ? "weak_summary" : "",
    emittedTitleKeys.has(normalizedSemanticTitle) ? "duplicate_normalized_title" : "",
    emittedMarketAudienceClusters.has([seed.market, seed.audience].join("|")) ? "duplicate_market_audience_cluster" : "",
    confidence < MIN_SYNTHESIS_CONFIDENCE ? "confidence_below_threshold" : "",
    rawTitleRejectionReasons(seed.semanticTitle).length > 0 ? "semantic_title_matches_raw_evidence_pattern" : "",
  ].filter(Boolean);
}

function selectSynthesisSeeds(input: ProblemSynthesisInput, confidence: number, hasMeaningfulSummary: boolean): CandidateSelection {
  const rankedSeeds = rankSeeds(candidateSeeds(input));
  const multiCandidateModeEnabled = isMultiCandidateDiagnosticsEnabled();
  const maxCandidateCount = multiCandidateModeEnabled ? MAX_DIAGNOSTIC_SYNTHESIS_CANDIDATES : 1;
  const emittedSeeds: RankedSynthesisSeed[] = [];
  const rejectedSeeds: Array<{ seed: RankedSynthesisSeed; reasons: string[] }> = [];

  for (const seed of rankedSeeds) {
    if (!multiCandidateModeEnabled && emittedSeeds.length >= 1) {
      rejectedSeeds.push({ seed, reasons: ["single_candidate_mode_retains_only_top_ranked_cluster"] });
      continue;
    }

    const reasons = multiCandidateModeEnabled
      ? selectionRejectionReasons(seed, emittedSeeds, confidence, hasMeaningfulSummary)
      : [];

    if (reasons.length === 0 && emittedSeeds.length < maxCandidateCount) {
      emittedSeeds.push(seed);
    } else {
      rejectedSeeds.push({ seed, reasons: reasons.length > 0 ? reasons : ["max_candidate_count_reached"] });
    }
  }

  return { emittedSeeds, rejectedSeeds, maxCandidateCount, multiCandidateModeEnabled };
}

function buildCandidateCollapseReport(input: ProblemSynthesisInput, selection: CandidateSelection): ProblemSynthesisCandidateCollapseReport {
  const seeds = candidateSeeds(input);
  const rankedSeeds = rankSeeds(seeds);
  const normalizedTitles = new Set(seeds.map((seed) => seed.normalizedTitle).filter(Boolean));
  const eligibleSynthesisClusterCount = rankedSeeds.length;
  const emittedCandidateCount = selection.emittedSeeds.length;
  const rejectedSynthesisClusterCount = Math.max(0, eligibleSynthesisClusterCount - emittedCandidateCount);
  const rejectedSeeds = selection.rejectedSeeds.map((item) => item.seed);
  const topPotentialNextCandidateTitles = rejectedSeeds.map((seed) => safeLogTitle(seed.semanticTitle)).filter(Boolean).slice(0, 5);
  const rejectionReasonCounts = new Map<string, number>();
  for (const rejection of selection.rejectedSeeds) {
    for (const reason of rejection.reasons) rejectionReasonCounts.set(reason, (rejectionReasonCounts.get(reason) || 0) + 1);
  }
  const rejectionReasons = [...rejectionReasonCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason, count]) => ({ reason, count }));
  const seedRejectionReasons = countReasons(rejectedSeeds);
  const semanticScores = rankedSeeds.map((seed) => seed.semanticTitleScore);

  return {
    upstreamCandidateCounts: {
      pain: input.painDetection?.candidates.length || 0,
      pattern: input.patternDetection?.candidates.length || 0,
      trend: input.trendDetection?.candidates.length || 0,
      opportunity: input.opportunityDetection?.candidates.length || 0,
      monetization: input.monetizationEvaluation?.candidates.length || 0,
      confidence: input.confidenceEvaluation?.candidates.length || 0,
    },
    totalPossibleSynthesisSeedCount: seeds.length,
    uniqueNormalizedTitleCount: normalizedTitles.size,
    uniqueTitleMarketAudienceClusterCount: eligibleSynthesisClusterCount,
    eligibleSynthesisClusterCount,
    emittedSynthesisCandidateCount: emittedCandidateCount,
    rejectedSynthesisClusterCount,
    rejectionReasons,
    topPotentialNextCandidateTitles,
    extractedSeedCount: seeds.length,
    rankedSeedCount: rankedSeeds.length,
    genericTitleSeedCount: rankedSeeds.filter((seed) => seed.genericTitle).length,
    downrankedGenericSeedCount: rankedSeeds.filter((seed) => seed.downrankedGeneric).length,
    topRankedSeedTitles: rankedSeeds.slice(0, 5).map((seed) => safeLogTitle(seed.title)),
    topRankedSeedScores: rankedSeeds.slice(0, 5).map((seed) => seed.score),
    topRejectedSeedTitles: rejectedSeeds.slice(0, 5).map((seed) => safeLogTitle(seed.title)),
    topRejectionReasons: seedRejectionReasons.slice(0, 5).map((item) => item.reason),
    seedsWithCrossEngineSupport: rankedSeeds.filter((seed) => seed.engineSupport.length > 1).length,
    seedsWithoutEnoughEvidence: rankedSeeds.filter((seed) => seed.evidenceCount < MIN_EVIDENCE_FOR_STRONG_SEED).length,
    rankedSeeds: rankedSeeds.slice(0, 10).map(seedDiagnostic),
    singleCandidateMode: !selection.multiCandidateModeEnabled,
    semanticTitlesGenerated: rankedSeeds.length,
    semanticTitlesSelected: emittedCandidateCount,
    rawTitlesRejected: rankedSeeds.filter((seed) => seed.rawTitleRejected).length,
    semanticTitleScoreDistribution: scoreDistribution(semanticScores),
    topSemanticTitles: rankedSeeds.slice(0, 5).map((seed) => ({ title: seed.semanticTitle, score: seed.semanticTitleScore, sourceTitle: safeLogTitle(seed.title) })),
    rawTitleRejectionReasons: countRawTitleReasons(rankedSeeds),
    multiCandidateModeEnabled: selection.multiCandidateModeEnabled,
    maxCandidateCount: selection.maxCandidateCount,
    emittedCandidateCount,
    rejectedCandidateCount: selection.rejectedSeeds.length,
    emittedCandidateTitles: selection.emittedSeeds.map((seed) => safeLogTitle(seed.semanticTitle)),
    rejectedCandidateTitles: selection.rejectedSeeds.map((item) => safeLogTitle(item.seed.semanticTitle)),
    duplicateRejectionCount: rejectionReasons.filter((item) => item.reason.includes("duplicate")).reduce((sum, item) => sum + item.count, 0),
    weakEvidenceRejectionCount: rejectionReasonCounts.get("weak_evidence_support") || 0,
    genericTitleRejectionCount: rejectionReasonCounts.get("generic_or_weak_semantic_title") || 0,
    semanticTitleQualityScores: rankedSeeds.map((seed) => ({ title: seed.semanticTitle, score: seed.semanticTitleScore })),
    collapseExplanation: selection.multiCandidateModeEnabled
      ? `Problem synthesis is operating in diagnostic-only multi-candidate mode, so up to ${selection.maxCandidateCount} quality-gated semantic candidates are emitted only inside modular diagnostics.`
      : emittedCandidateCount > 0
        ? "Problem synthesis is intentionally operating in legacy-compatible single-candidate mode, so only the top ranked synthesis cluster is emitted and all other eligible clusters are diagnostics-only."
        : "Problem synthesis is intentionally operating in legacy-compatible single-candidate mode, but no candidate was emitted because no reusable normalized evidence was available.",
  };
}

function primaryTitle(input: ProblemSynthesisInput) {
  const ranked = rankSeeds(candidateSeeds(input));
  return ranked[0]?.semanticTitle || input.evidence.find((item) => item.detectedProblemTitle && rawTitleRejectionReasons(item.detectedProblemTitle).length === 0)?.detectedProblemTitle || "Synthesized market problem";
}

function canonicalCluster(title: string, input: ProblemSynthesisInput) {
  return input.opportunityDetection?.candidates[0]?.context.primaryTheme || input.patternDetection?.candidates[0]?.context.primaryTheme || input.trendDetection?.candidates[0]?.context.primaryTheme || normalize(title) || "general_problem";
}

function suggestedSolutions(input: ProblemSynthesisInput) {
  const opportunitySolutions = (input.opportunityDetection?.candidates || []).map((candidate) => {
    const underserved = candidate.marketContext.underservedSignals[0];
    return underserved ? `Workflow product addressing ${underserved}` : `Focused solution for ${candidate.marketContext.primaryProblem}`;
  });
  const monetizationSolutions = (input.monetizationEvaluation?.candidates || []).map((candidate) => `${candidate.pricingHypothesis.replaceAll("_", " ")} SaaS for ${candidate.context.primaryProblem}`);
  return unique([...opportunitySolutions, ...monetizationSolutions]).slice(0, 5);
}

function buildScoreBreakdown(input: ProblemSynthesisInput): ProblemScoreBreakdown {
  const evidence = input.evidence;
  const confidenceScores = input.confidenceEvaluation?.candidates.map((candidate) => candidate.score.totalScore) || [];
  const breakdown = {
    painScore: average(input.painDetection?.candidates.map((candidate) => candidate.score.totalScore) || evidence.map((item) => item.painIntensity), 0),
    urgencyScore: average(input.opportunityDetection?.candidates.map((candidate) => candidate.score.problemUrgencyScore) || [], average(evidence.map((item) => item.painIntensity), 0)),
    frequencyScore: average(evidence.map((item) => item.frequencySignal), 0),
    trendScore: average(input.trendDetection?.candidates.map((candidate) => candidate.score.totalScore) || [], 0),
    opportunityScore: average(input.opportunityDetection?.candidates.map((candidate) => candidate.score.totalScore) || [], 0),
    revenueScore: average(input.monetizationEvaluation?.candidates.map((candidate) => candidate.score.totalScore) || [], 0),
    buyingSignalScore: average(evidence.map((item) => item.buyingIntentSignal), 0),
    sourceQualityScore: average(evidence.map((item) => item.sourceQualityScore), 0),
    confidenceScore: average(confidenceScores, average(evidence.map((item) => item.confidenceScore), 0)),
    totalScore: 0,
  };
  breakdown.totalScore = average(Object.entries(breakdown).filter(([key]) => key !== "totalScore").map(([, value]) => value), 0);
  return Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, Math.round(clampScore(value, 0) * 100) / 100])) as ProblemScoreBreakdown;
}

function completeness(input: ProblemSynthesisInput, evidenceCount: number) {
  const checks = [
    evidenceCount > 0,
    Boolean(input.painDetection?.candidates.length),
    Boolean(input.patternDetection?.candidates.length),
    Boolean(input.trendDetection?.candidates.length),
    Boolean(input.opportunityDetection?.candidates.length),
    Boolean(input.monetizationEvaluation?.candidates.length),
    Boolean(input.confidenceEvaluation?.candidates.length),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100) / 100;
}

export class ProblemIntelligenceSynthesisEngine {
  run(input: ProblemSynthesisInput): ProblemSynthesisResult {
    const runId = input.runId || "problem_synthesis_dry_run";
    const synthesizedAt = input.synthesizedAt ? new Date(input.synthesizedAt).toISOString() : new Date().toISOString();
    const evidence = [...input.evidence].sort((a, b) => a.deduplicationFingerprint.localeCompare(b.deduplicationFingerprint));
    const evidenceReferences = evidence.map(evidenceReference);
    const claims = unique(evidence.map((item) => item.extractedClaim || item.detectedProblemTitle || item.capturedText)).slice(0, 5);
    const markets = unique(evidence.map((item) => item.market || item.nicheCategory));
    const audiences = unique(evidence.map((item) => item.audience || item.nicheCategory));
    const sourceNames = unique(evidence.map((item) => item.sourceName));
    const scoreBreakdown = buildScoreBreakdown(input);
    const confidence = Math.round(clampScore(scoreBreakdown.confidenceScore || scoreBreakdown.totalScore, 0) * 100) / 100;
    const conciseEvidenceSummary = claims.length > 0 ? claims.slice(0, 3).map(sentence).join(" ") : "No reusable evidence claims were available for synthesis.";
    const hasMeaningfulSummary = claims.length > 0 && conciseEvidenceSummary.length >= 40;
    const selection = evidence.length === 0
      ? { emittedSeeds: [], rejectedSeeds: [], maxCandidateCount: isMultiCandidateDiagnosticsEnabled() ? MAX_DIAGNOSTIC_SYNTHESIS_CANDIDATES : 1, multiCandidateModeEnabled: isMultiCandidateDiagnosticsEnabled() }
      : selectSynthesisSeeds(input, confidence, hasMeaningfulSummary);
    const fallbackTitle = primaryTitle(input);
    const emittedTitles = selection.emittedSeeds.length > 0 ? selection.emittedSeeds.map((seed) => seed.semanticTitle) : (evidence.length === 0 || selection.multiCandidateModeEnabled ? [] : [fallbackTitle]);
    const candidateCollapseReport = buildCandidateCollapseReport(input, selection.emittedSeeds.length > 0 || evidence.length === 0 ? selection : { ...selection, emittedSeeds: rankSeeds(candidateSeeds(input)).slice(0, 1) });
    const warnings = evidence.length === 0 ? ["Problem synthesis produced no candidates because no normalized evidence was available."] : [];
    const engineCandidateCounts = {
      pain: input.painDetection?.candidates.length || 0,
      pattern: input.patternDetection?.candidates.length || 0,
      trend: input.trendDetection?.candidates.length || 0,
      opportunity: input.opportunityDetection?.candidates.length || 0,
      monetization: input.monetizationEvaluation?.candidates.length || 0,
      confidence: input.confidenceEvaluation?.candidates.length || 0,
      feedback: input.feedbackLearning?.signals.length || 0,
    };

    const diagnostics: ProblemSynthesisDiagnostics[] = emittedTitles.map((title) => {
      const synthesizedSummary = sentence(`${title} is supported by ${evidence.length} evidence item${evidence.length === 1 ? "" : "s"}${markets.length ? ` across ${markets.slice(0, 3).join(", ")}` : ""}${audiences.length ? ` for ${audiences.slice(0, 3).join(", ")}` : ""}`);
      return {
        synthesizedTitle: title,
        synthesizedSummary,
        evidenceCount: evidence.length,
        evidenceReferences,
        confidence,
        synthesisCompleteness: completeness(input, evidence.length),
        candidateCollapseReport,
        engineCandidateCounts,
        warnings,
      };
    });

    const candidates: ProblemSynthesisCandidate[] = emittedTitles.map((title, index) => {
      const diagnostic = diagnostics[index];
      const cluster = canonicalCluster(title, input);
      return {
        id: `${runId}:problem-synthesis:${normalize(title) || "candidate"}`,
        synthesizedProblemTitle: title,
        synthesizedSummary: diagnostic.synthesizedSummary,
        affectedMarkets: markets,
        affectedAudiences: audiences,
        suggestedSolutions: suggestedSolutions(input),
        conciseEvidenceSummary,
        canonicalProblemCluster: cluster,
        scoreBreakdown,
        supportingEvidenceReferences: evidenceReferences,
        confidence,
        narrative: { title, summary: diagnostic.synthesizedSummary, primaryTheme: cluster, rationale: ["Deterministically selected a quality-gated semantic engine title.", "Synthesized evidence, market, audience, score, and confidence signals without AI."] },
        evidenceSummary: { evidenceCount: evidence.length, sourceCount: sourceNames.length, sourceNames, markets, audiences, claims, references: evidenceReferences, summary: conciseEvidenceSummary },
        diagnostics: diagnostic,
      };
    });
    const diagnostic = diagnostics[0] || { synthesizedTitle: fallbackTitle, synthesizedSummary: "", evidenceCount: evidence.length, evidenceReferences, confidence, synthesisCompleteness: completeness(input, evidence.length), candidateCollapseReport, engineCandidateCounts, warnings };

    return {
      runId,
      synthesizedAt,
      candidates,
      diagnostics: diagnostics.length > 0 ? diagnostics : [diagnostic],
      warnings,
      summary: { evidenceCount: evidence.length, candidateCount: candidates.length, averageConfidence: confidence, averageCompleteness: diagnostic.synthesisCompleteness },
    };
  }
}
