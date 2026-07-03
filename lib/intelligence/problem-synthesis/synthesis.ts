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
  semanticSummary: string;
  semanticSummaryScore: number;
  semanticSummaryRejectionReasons: string[];
  semanticSummaryWarnings: string[];
  titleRefinementGenerated: number;
  titleSpecificityScoreRefined: number;
  titleRefinementRejectionReasons: string[];
  genericTitlePenaltyApplied: boolean;
  canonicalTitleBonusApplied: boolean;
  businessContextBonusApplied: boolean;
  duplicateTitlePenaltyApplied: boolean;
};

type CandidateDiversityProfile = {
  businessProcess: string;
  operationalDomain: string;
  affectedAudience: string;
  workflowCategory: string;
  businessProblemKey: string;
};

const GENERIC_TITLES = new Set(["manual", "billing", "approval", "workflow", "automation", "software", "tool", "app", "service", "operations", "process", "management", "bottlenecks", "fragmentation"]);
const MIN_EVIDENCE_FOR_STRONG_SEED = 2;
const MAX_DIAGNOSTIC_SYNTHESIS_CANDIDATES = 5;
const MIN_SYNTHESIS_CONFIDENCE = 5;
const MIN_SEMANTIC_TITLE_SCORE = 3;
const MIN_SEMANTIC_TITLE_WORDS = 3;
const RAW_EVIDENCE_PREFIXES = ["evidence", "reddit", "linkedin", "multiple signals", "weekly intelligence", "data moat", "manual workflows lead"];
const BUSINESS_CONTEXT_TERMS = new Set(["crm", "invoice", "client", "sales", "agency", "workflow", "workflows", "onboarding", "billing", "follow", "up", "approval", "automation", "operations", "operational", "process", "reporting", "spreadsheet", "spreadsheets", "customer", "lead", "leads", "handoff", "handoffs", "gap", "gaps", "management"]);
const PROBLEM_CONTEXT_TERMS = new Set(["bottleneck", "bottlenecks", "dependency", "dependencies", "fragmentation", "friction", "delay", "delays", "breakdown", "errors", "mistakes", "disconnected", "fragmented", "manual", "scattered", "follow", "approval", "handoff", "handoffs", "gap", "gaps", "management"]);
const TITLE_STOP_WORDS = new Set(["a", "an", "and", "are", "as", "because", "by", "for", "from", "in", "into", "is", "of", "on", "or", "that", "the", "to", "with"]);
const GENERIC_SEMANTIC_TITLES = new Set(["workflow automation", "manual workflow automation", "operations automation", "business automation", "process automation", "manual errors", "workflow errors", "manual delays", "operations bottlenecks", "workflow bottlenecks", "operations fragmentation", "operational process fragmentation", "lead automation", "manual lead management", "operational process bottlenecks"]);
const BROAD_DIAGNOSTIC_TITLES = new Set(["operational process fragmentation", "workflow automation", "operations bottlenecks", "operations automation", "business automation", "process automation"]);
const MIN_EMITTED_TITLE_SPECIFICITY = 80;
const SUMMARY_BLOCKED_PHRASES = ["evidence shows", "multiple sources", "weekly intelligence", "data moat", "internal signals", "external posts", "evidence"];
const SUMMARY_IMPACT_TERMS = ["delays", "errors", "reduced visibility", "administrative workload", "revenue leakage", "missed revenue opportunities", "inconsistent customer engagement", "operational inefficiency", "cash collection", "rework", "pipeline visibility", "payment status", "operational decisions"];

const CANONICAL_TITLE_RULES: Array<{ title: string; terms: string[]; any?: string[] }> = [
  { title: "Fragmented CRM Operations", terms: ["crm"], any: ["fragmentation", "fragmented", "disconnected", "handoff", "handoffs"] },
  { title: "Manual Sales Follow-up Automation", terms: ["sales"], any: ["follow", "up", "lead", "leads", "customer", "manual"] },
  { title: "Manual Lead Qualification", terms: ["lead"], any: ["qualification", "qualify", "manual"] },
  { title: "Manual Customer Follow-up", terms: ["customer"], any: ["follow", "up", "manual"] },
  { title: "Manual Workflow Fragmentation", terms: ["manual", "workflow"], any: ["automation", "errors", "delays", "operations", "fragmented", "fragmentation"] },
  { title: "Spreadsheet-Based Workflow Management", terms: ["spreadsheet"], any: ["spreadsheets", "dependency", "workflow", "manual", "reporting"] },
  { title: "Client Onboarding Workflow Friction", terms: ["client", "onboarding"], any: ["friction", "handoff", "handoffs", "scattered", "workflow"] },
  { title: "Fragmented Client Operations", terms: ["client"], any: ["fragmentation", "fragmented", "scattered", "disconnected", "operations"] },
  { title: "Billing Approval Delays", terms: ["billing"], any: ["workflow", "automation", "approval", "invoice", "delay", "delays"] },
  { title: "Invoice Approval Bottlenecks", terms: ["invoice", "approval"], any: ["bottleneck", "bottlenecks", "delay", "delays"] },
  { title: "Operational Workflow Fragmentation", terms: ["operations"], any: ["fragmentation", "fragmented", "disconnected", "process", "manual"] },
  { title: "Manual Operational Process Bottlenecks", terms: ["operations"], any: ["bottleneck", "bottlenecks", "delay", "delays", "process", "manual"] },
];

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
  const title = normalize(value).split(" ").filter(Boolean).map((word) => (
    word.length <= 3 && ["crm", "smb", "api"].includes(word) ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`
  )).join(" ");
  return title
    .replace(/Follow Up/g, "Follow-up")
    .replace(/Spreadsheet Based/g, "Spreadsheet-Based")
    .replace(/ And /g, " and ");
}

function canonicalTitleKey(title: string) {
  return normalize(title).replace(/\b(workflows|workflow)\b/g, "workflow").replace(/\b(errors|mistakes)\b/g, "errors").replace(/\b(delays|delay)\b/g, "delays");
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
  const text = normalize([seed.title, cluster, seed.market, seed.audience].filter(Boolean).join(" "));
  const words = text.split(" ").filter((word) => word && !TITLE_STOP_WORDS.has(word));
  const wordSet = new Set(words);
  for (const rule of CANONICAL_TITLE_RULES) {
    const requiredMatch = rule.terms.every((term) => wordSet.has(term));
    const optionalMatch = !rule.any || rule.any.some((term) => wordSet.has(term));
    if (requiredMatch && optionalMatch) return rule.title;
  }
  const businessWords = unique(words.map((word) => {
    if (word === "workflows") return "workflow";
    if (word === "leads") return "lead";
    if (word === "spreadsheets") return "spreadsheet";
    if (word === "operational") return "operations";
    return word;
  }).filter((word) => BUSINESS_CONTEXT_TERMS.has(word)));
  const problemWords = unique(words.map((word) => {
    if (word === "fragmented" || word === "disconnected" || word === "scattered") return "fragmentation";
    if (word === "bottleneck") return "bottlenecks";
    if (word === "dependency" || word === "dependencies") return "dependency";
    if (word === "delay") return "delays";
    return word;
  }).filter((word) => PROBLEM_CONTEXT_TERMS.has(word) || ["fragmentation", "dependency", "bottlenecks", "gaps", "management"].includes(word)));
  const subject = businessWords.filter((word) => !["workflow", "automation", "manual"].includes(word)).slice(0, 2);
  const concept = subject.length > 0 ? subject.join(" ") : businessWords.includes("workflow") ? "workflow" : "operations";
  const problem = problemWords.includes("fragmentation") ? "fragmentation"
    : problemWords.includes("dependency") ? "dependency"
      : problemWords.includes("bottlenecks") || problemWords.includes("delays") ? "bottlenecks"
        : businessWords.includes("automation") || problemWords.includes("manual") ? "automation"
          : "bottlenecks";
  return `${concept} ${problem}`;
}

function semanticTitleForSeed(seed: SynthesisSeed) {
  const phrase = semanticProblemPhrase(seed);
  const title = titleCase(phrase);
  return canonicalTitleKey(title) === "crm workflow fragmentation" ? "CRM Workflow Fragmentation" : title;
}


type TitleRefinement = {
  title: string;
  generatedCount: number;
  specificityScore: number;
  rejectionReasons: string[];
  genericPenaltyApplied: boolean;
  canonicalBonusApplied: boolean;
  businessContextBonusApplied: boolean;
};

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function inferTitleBusinessContext(seed: SynthesisSeed) {
  const text = normalize([seed.title, seed.problemCluster, seed.market, seed.audience].join(" "));
  if (hasAny(text, ["crm"])) return "CRM operations";
  if (hasAny(text, ["agency", "agencies"]) && hasAny(text, ["workflow", "workflows", "automation"])) return "agency workflow automation";
  if (hasAny(text, ["sales", "lead", "leads"])) return hasAny(text, ["qualify", "qualification"]) ? "lead qualification" : "sales follow-up";
  if (hasAny(text, ["customer", "follow up", "follow"])) return "customer follow-up";
  if (hasAny(text, ["spreadsheet", "spreadsheets"])) return "spreadsheet-based workflow";
  if (hasAny(text, ["invoice", "billing", "approval"])) return "billing approval workflow";
  if (hasAny(text, ["client", "onboarding"])) return "client onboarding workflow";
  if (hasAny(text, ["client"])) return "client operations";
  if (hasAny(text, ["workflow", "workflows"])) return "workflow automation";
  return "operational process";
}

function inferTitleProblemContext(seed: SynthesisSeed) {
  const text = normalize([seed.title, seed.problemCluster, seed.market, seed.audience].join(" "));
  if (hasAny(text, ["fragmented", "fragmentation", "disconnected", "scattered"])) return "fragmentation";
  if (hasAny(text, ["manual"]) && hasAny(text, ["workflow", "automation", "process", "operations"])) return "manual fragmentation";
  if (hasAny(text, ["dependency", "dependencies", "spreadsheet", "spreadsheets"])) return "dependency";
  if (hasAny(text, ["delay", "delays", "bottleneck", "bottlenecks"])) return "bottlenecks";
  if (hasAny(text, ["friction", "handoff", "handoffs"])) return "friction";
  if (hasAny(text, ["manual"])) return "manual processes";
  return "fragmentation";
}

function refinedTitleCandidates(seed: SynthesisSeed) {
  const semantic = semanticTitleForSeed(seed);
  const businessContext = inferTitleBusinessContext(seed);
  const problemContext = inferTitleProblemContext(seed);
  const candidates = [semantic];

  if (businessContext === "agency workflow automation") candidates.push("Agency Workflow Automation Gaps", "Manual Agency Workflow Automation");
  if (businessContext === "sales follow-up") candidates.push("Manual Sales Follow-up Automation", "Sales Follow-up Process Gaps");
  if (businessContext === "lead qualification") candidates.push("Manual Lead Qualification", "Manual Lead Qualification Processes");
  if (businessContext === "customer follow-up") candidates.push("Manual Customer Follow-up", "Customer Follow-up Process Gaps");
  if (businessContext === "CRM operations") candidates.push("Fragmented CRM Operations", "Disconnected CRM Workflow Operations");
  if (businessContext === "spreadsheet-based workflow") candidates.push("Spreadsheet-Based Workflow Management", "Spreadsheet-Driven Business Operations");
  if (businessContext === "billing approval workflow") candidates.push("Billing Approval Delays", "Invoice Approval Bottlenecks");
  if (businessContext === "client onboarding workflow") candidates.push("Client Onboarding Workflow Friction", "Client Onboarding Handoff Friction");
  if (businessContext === "client operations") candidates.push("Fragmented Client Operations", "Client Operations Fragmentation");
  if (businessContext === "workflow automation" && problemContext === "manual fragmentation") candidates.push("Manual Workflow Fragmentation", "Disconnected Operations Workflows");
  if (businessContext === "operational process") candidates.push(problemContext === "fragmentation" ? "Operational Workflow Fragmentation" : "Manual Operational Bottlenecks");

  return unique(candidates.map(titleCase));
}

function refinedTitleRejectionReasons(title: string) {
  const normalizedTitle = normalize(title);
  const words = normalizedTitle.split(" ").filter(Boolean);
  const businessContext = words.filter((word) => BUSINESS_CONTEXT_TERMS.has(word)).length;
  const problemContext = words.filter((word) => PROBLEM_CONTEXT_TERMS.has(word) || ["fragmentation", "dependency", "bottlenecks", "gaps", "management"].includes(word)).length;
  return [
    ...semanticTitleRejectionReasons(title),
    words.length < 3 ? "refined_title_too_short" : "",
    words.length > 6 ? "refined_title_too_long" : "",
    businessContext < 1 ? "refined_title_missing_business_context" : "",
    problemContext < 1 ? "refined_title_missing_problem_context" : "",
  ].filter(Boolean);
}

function titleSpecificityMetric(title: string) {
  const tokens = normalize(title).split(" ").filter(Boolean);
  const uniqueTokens = new Set(tokens);
  if (tokens.length === 0) return 0;
  const lengthScore = Math.min(1, tokens.length / 5);
  const uniquenessScore = uniqueTokens.size / tokens.length;
  const contextScore = Math.min(1, tokens.filter((token) => BUSINESS_CONTEXT_TERMS.has(token) || PROBLEM_CONTEXT_TERMS.has(token) || ["fragmentation", "dependency", "bottlenecks", "gaps", "management"].includes(token)).length / 3);
  const genericPenalty = GENERIC_SEMANTIC_TITLES.has(normalize(title)) || isGenericTitle(title) || tokens.length <= 2 ? 0.65 : 1;
  return Math.round(((lengthScore * 0.5 + uniquenessScore * 0.25 + contextScore * 0.25) * 100) * genericPenalty * 100) / 100;
}


function meaningfulTitleDimensionCount(title: string) {
  const tokens = normalize(title).split(" ").filter(Boolean);
  const hasBusinessProcess = tokens.some((token) => BUSINESS_CONTEXT_TERMS.has(token)) || /follow up|spreadsheet based/.test(normalize(title));
  const hasPainMechanism = tokens.some((token) => PROBLEM_CONTEXT_TERMS.has(token) || ["fragmentation", "dependency", "bottlenecks", "gaps"].includes(token));
  const hasToolContext = tokens.some((token) => ["crm", "spreadsheet", "spreadsheets", "billing", "invoice", "sales", "client"].includes(token));
  const hasWorkflowContext = tokens.some((token) => ["workflow", "workflows", "automation", "approval", "follow", "onboarding"].includes(token));
  const hasAudienceOrDomain = tokens.some((token) => ["agency", "agencies", "sales", "billing", "client", "customer", "operations", "operational"].includes(token));
  return [hasBusinessProcess, hasPainMechanism, hasToolContext, hasWorkflowContext, hasAudienceOrDomain].filter(Boolean).length;
}

function emittedTitleQualityScore(title: string) {
  const normalizedTitle = normalize(title);
  const specificity = titleSpecificityMetric(title);
  const dimensions = meaningfulTitleDimensionCount(title);
  const broadPenalty = BROAD_DIAGNOSTIC_TITLES.has(normalizedTitle) ? 18 : 0;
  const genericPenalty = GENERIC_SEMANTIC_TITLES.has(normalizedTitle) || isGenericTitle(title, normalizedTitle) ? 18 : 0;
  return Math.max(0, Math.min(100, Math.round((specificity + Math.min(3, dimensions) * 4 - broadPenalty - genericPenalty) * 100) / 100));
}

function finalTitleQualityGateRejectionReasons(seed: RankedSynthesisSeed) {
  const normalizedTitle = normalize(seed.semanticTitle);
  const specificity = titleSpecificityMetric(seed.semanticTitle);
  const quality = emittedTitleQualityScore(seed.semanticTitle);
  return [
    BROAD_DIAGNOSTIC_TITLES.has(normalizedTitle) ? "broad_emitted_title" : "",
    meaningfulTitleDimensionCount(seed.semanticTitle) < 2 ? "missing_two_business_dimensions" : "",
    specificity < MIN_EMITTED_TITLE_SPECIFICITY ? "low_emitted_title_specificity" : "",
    quality < MIN_EMITTED_TITLE_SPECIFICITY ? "low_emitted_title_quality" : "",
  ].filter(Boolean);
}

function refineSemanticTitle(seed: SynthesisSeed, engineSupport: string[], rawRejected: boolean): TitleRefinement {
  const candidates = refinedTitleCandidates(seed).map((title) => {
    const normalizedTitle = normalize(title);
    const words = normalizedTitle.split(" ").filter(Boolean);
    const rejectionReasons = refinedTitleRejectionReasons(title);
    const genericPenaltyApplied = GENERIC_SEMANTIC_TITLES.has(normalizedTitle) || isGenericTitle(title, normalizedTitle) || words.length <= 2;
    const canonicalBonusApplied = CANONICAL_TITLE_RULES.some((rule) => normalize(rule.title) === normalizedTitle);
    const businessContextBonusApplied = words.filter((word) => BUSINESS_CONTEXT_TERMS.has(word)).length >= 2 || normalizedTitle.includes("follow up") || normalizedTitle.includes("spreadsheet based");
    const score = titleSpecificityMetric(title)
      + (canonicalBonusApplied ? 8 : 0)
      + (businessContextBonusApplied ? 6 : 0)
      + Math.min(8, engineSupport.length * 2)
      + (rawRejected ? 3 : 0)
      - (genericPenaltyApplied ? 25 : 0)
      - (rejectionReasons.length * 6);
    return { title, score, rejectionReasons, genericPenaltyApplied, canonicalBonusApplied, businessContextBonusApplied };
  }).sort((a, b) => b.score - a.score || b.title.length - a.title.length || a.title.localeCompare(b.title));

  const selected = candidates.find((candidate) => candidate.rejectionReasons.length === 0) || candidates[0] || { title: semanticTitleForSeed(seed), rejectionReasons: [], genericPenaltyApplied: false, canonicalBonusApplied: false, businessContextBonusApplied: false };
  return {
    title: selected.title,
    generatedCount: candidates.length,
    specificityScore: titleSpecificityMetric(selected.title),
    rejectionReasons: selected.rejectionReasons,
    genericPenaltyApplied: selected.genericPenaltyApplied,
    canonicalBonusApplied: selected.canonicalBonusApplied,
    businessContextBonusApplied: selected.businessContextBonusApplied,
  };
}

function semanticTitleRejectionReasons(title: string) {
  const normalizedTitle = normalize(title);
  const words = normalizedTitle.split(" ").filter(Boolean);
  const uniqueWords = new Set(words);
  const repeatedConcept = uniqueWords.size < words.length || words.some((word, index) => words.indexOf(word) !== index);
  const businessContext = words.filter((word) => BUSINESS_CONTEXT_TERMS.has(word)).length;
  const problemContext = words.filter((word) => PROBLEM_CONTEXT_TERMS.has(word) || ["fragmentation", "dependency", "bottlenecks", "gaps", "management"].includes(word)).length;
  return [
    RAW_EVIDENCE_PREFIXES.some((prefix) => normalizedTitle.startsWith(prefix)) ? "blocked_raw_evidence_prefix" : "",
    words.length < MIN_SEMANTIC_TITLE_WORDS ? "below_semantic_word_threshold" : "",
    words.length > 5 ? "sentence_fragment_too_long" : "",
    GENERIC_SEMANTIC_TITLES.has(normalizedTitle) || isGenericTitle(title, normalizedTitle) ? "overly_generic_business_title" : "",
    repeatedConcept ? "repeated_word_or_concept" : "",
    businessContext === 0 ? "missing_business_context" : "",
    problemContext === 0 ? "missing_problem_context" : "",
    rawTitleRejectionReasons(title).length > 0 ? "matches_raw_evidence_pattern" : "",
  ].filter(Boolean);
}

function semanticTitleScore(seed: SynthesisSeed, engineSupport: string[], rawRejected: boolean) {
  const title = seed.title;
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

function readablePhrase(value: string, fallback: string) {
  const words = normalize(value).split(" ").filter(Boolean);
  if (words.length === 0 || value === "unknown") return fallback;
  return words.slice(0, 5).join(" ");
}


function inferBusinessProcess(seed: SynthesisSeed, title: string, claims: string[]) {
  const text = normalize([title, seed.title, seed.problemCluster, seed.market, seed.audience, ...claims].join(" "));
  if (text.includes("crm")) return "fragmented CRM processes";
  if (text.includes("sales") || text.includes("lead") || text.includes("follow")) return "sales follow-up workflows";
  if (text.includes("spreadsheet")) return "spreadsheet-dependent operations";
  if (text.includes("invoice") || text.includes("billing") || text.includes("approval")) return "billing and approval workflows";
  if (text.includes("onboarding")) return "client onboarding workflows";
  if (text.includes("customer")) return "customer management workflows";
  if (text.includes("operations") || text.includes("operational")) return "operational workflows";
  return `${readablePhrase(seed.market, "businesses")} workflows`;
}

function inferAffectedUsers(seed: SynthesisSeed, claims: string[]) {
  const text = normalize([seed.audience, seed.market, seed.title, ...claims].join(" "));
  if (text.includes("sales")) return "sales teams";
  if (text.includes("agency") || text.includes("agencies")) return "agencies";
  if (text.includes("small business") || text.includes("smb")) return "small businesses";
  if (text.includes("client")) return "client-facing teams";
  if (text.includes("operations") || text.includes("operational")) return "operations teams";
  return readablePhrase(seed.audience, readablePhrase(seed.market, "business teams"));
}

function inferOperationalConsequence(seed: SynthesisSeed, title: string, claims: string[]) {
  const text = normalize([title, seed.title, seed.problemCluster, ...claims].join(" "));
  if (text.includes("crm") || text.includes("sales") || text.includes("lead") || text.includes("follow")) return "inconsistent follow-up and missed revenue opportunities";
  if (text.includes("spreadsheet")) return "administrative workload and limited cross-process visibility";
  if (text.includes("invoice") || text.includes("billing") || text.includes("approval")) return "approval delays and slower cash collection";
  if (text.includes("onboarding")) return "handoff friction and slower customer activation";
  if (text.includes("error") || text.includes("mistake")) return "avoidable errors and rework";
  if (text.includes("delay") || text.includes("bottleneck")) return "process delays and operational bottlenecks";
  return "delays, errors and reduced operational efficiency";
}

function inferBusinessImpact(seed: SynthesisSeed, title: string, claims: string[]) {
  const consequence = inferOperationalConsequence(seed, title, claims);
  if (consequence.includes("revenue")) return "creating revenue leakage";
  if (consequence.includes("visibility")) return "reducing visibility across business processes";
  if (consequence.includes("cash")) return "weakening financial control";
  if (consequence.includes("activation")) return "slowing time to value for customers";
  if (consequence.includes("errors")) return "increasing rework and operational risk";
  return "reducing operational efficiency";
}

function cleanSummary(summary: string) {
  const deduped = summary.replace(/\b(\w+)(\s+\1\b)+/gi, "$1").replace(/\s+/g, " ").trim();
  return sentence(deduped.charAt(0).toUpperCase() + deduped.slice(1));
}

function summaryQualityScore(summary: string) {
  const normalizedSummary = normalize(summary);
  const words = normalizedSummary.split(" ").filter(Boolean);
  const blocked = SUMMARY_BLOCKED_PHRASES.some((phrase) => normalizedSummary.includes(normalize(phrase)));
  const repeated = words.some((word, index) => words.indexOf(word) !== index && !TITLE_STOP_WORDS.has(word));
  const hasImpact = SUMMARY_IMPACT_TERMS.some((term) => normalizedSummary.includes(normalize(term))) || /revenue|visibility|efficiency|workload|risk|cash|rework/.test(normalizedSummary);
  const lengthScore = words.length >= 16 && words.length <= 34 ? 3 : words.length >= 12 && words.length <= 40 ? 2 : 0;
  const businessScore = Array.from(BUSINESS_CONTEXT_TERMS).some((term) => normalizedSummary.includes(term)) ? 2 : 0;
  const problemScore = Array.from(PROBLEM_CONTEXT_TERMS).some((term) => normalizedSummary.includes(term)) || /fragmentation|dependency|bottleneck|manual/.test(normalizedSummary) ? 2 : 0;
  return clampScore(lengthScore + businessScore + problemScore + (hasImpact ? 2 : 0) - (blocked ? 3 : 0) - (repeated ? 1 : 0), 0);
}

function summaryLength(summary: string) {
  return normalize(summary).split(" ").filter(Boolean).length;
}

function titleOverlapScore(summary: string, title: string) {
  const summaryTokens = new Set(normalize(summary).split(" ").filter((token) => token && !TITLE_STOP_WORDS.has(token)));
  const titleTokens = new Set(normalize(title).split(" ").filter((token) => token && !TITLE_STOP_WORDS.has(token)));
  if (summaryTokens.size === 0 || titleTokens.size === 0) return 0;
  const overlap = [...titleTokens].filter((token) => summaryTokens.has(token)).length;
  return Math.round((overlap / titleTokens.size) * 100) / 100;
}

function semanticSummaryRejectionReasons(summary: string) {
  const normalizedSummary = normalize(summary);
  const words = normalizedSummary.split(" ").filter(Boolean);
  const uniqueWords = new Set(words.filter((word) => !TITLE_STOP_WORDS.has(word)));
  return [
    words.length < 20 ? "summary_too_short" : "",
    words.length > 40 ? "summary_too_long" : "",
    SUMMARY_BLOCKED_PHRASES.some((phrase) => normalizedSummary.includes(normalize(phrase))) ? "blocked_source_language" : "",
    uniqueWords.size < Math.max(6, words.filter((word) => !TITLE_STOP_WORDS.has(word)).length * 0.7) ? "duplicated_summary_terms" : "",
    !/[.!?]$/.test(summary.trim()) ? "missing_sentence_ending" : "",
    !/because|causing|creating|reducing|increasing|slowing|weakening/.test(normalizedSummary) ? "missing_business_causality" : "",
  ].filter(Boolean);
}

function semanticSummaryWarnings(summary: string) {
  const normalizedSummary = normalize(summary);
  return [
    !/users|teams|businesses|agencies/.test(normalizedSummary) ? "affected_users_inferred_generically" : "",
    !/revenue|visibility|efficiency|workload|risk|cash|rework|delays|errors/.test(normalizedSummary) ? "business_impact_inferred_generically" : "",
    summaryLength(summary) < 20 || summaryLength(summary) > 30 ? "outside_target_summary_length" : "",
  ].filter(Boolean);
}

function inferFailureMode(seed: SynthesisSeed, title: string, claims: string[]) {
  const text = normalize([title, seed.title, seed.problemCluster, ...claims].join(" "));
  if (hasAny(text, ["fragmented", "fragmentation", "disconnected", "scattered"])) return "fragmented handoffs";
  if (hasAny(text, ["spreadsheet", "spreadsheets"])) return "manual file dependencies";
  if (hasAny(text, ["approval", "invoice", "billing"])) return "slow approval routing";
  if (hasAny(text, ["delay", "delays", "bottleneck", "bottlenecks"])) return "process bottlenecks";
  if (hasAny(text, ["error", "errors", "mistake", "mistakes"])) return "error-prone execution";
  if (hasAny(text, ["manual"])) return "manual coordination gaps";
  return "fragmented manual coordination";
}

function domainSpecificSummary(seed: SynthesisSeed, title: string, claims: string[]) {
  const text = normalize([title, seed.title, seed.problemCluster, seed.market, seed.audience, ...claims].join(" "));
  if (hasAny(text, ["sales", "lead", "leads", "follow"])) {
    return "Sales teams coordinate follow-up across CRM updates and manual handoffs, causing inconsistent lead engagement, missed revenue opportunities, and reduced pipeline visibility.";
  }
  if (hasAny(text, ["crm"])) {
    return "Revenue teams manage customer workflows across disconnected CRM processes, creating handoff gaps, stale account context, and limited visibility into pipeline execution.";
  }
  if (hasAny(text, ["spreadsheet", "spreadsheets"])) {
    return "Spreadsheet-dependent teams manage invoices, reports, and project updates through manual files, increasing administrative workload, reporting delays, and error-prone operational decisions.";
  }
  if (hasAny(text, ["invoice", "billing", "invoicing", "approval"])) {
    return "Billing teams route invoice approvals through fragmented manual workflows, creating delayed cash collection, avoidable rework, and limited visibility into payment status.";
  }
  if (hasAny(text, ["client", "onboarding", "handoff", "customer"])) {
    return "Client-facing teams coordinate onboarding and service updates across scattered workflows, causing handoff friction, slower customer activation, and avoidable delivery rework.";
  }
  if (hasAny(text, ["ai", "artificial intelligence", "llm", "model"])) {
    return "Operations teams adopt AI automation inside fragmented workflows, creating inconsistent execution, unclear ownership, and limited confidence in business-critical outputs.";
  }
  if (hasAny(text, ["bottleneck", "bottlenecks", "delay", "delays", "operations", "operational"])) {
    return "Operations teams depend on manual process coordination across disconnected tools, causing bottlenecks, delayed decisions, and reduced visibility into business execution.";
  }
  if (hasAny(text, ["workflow", "workflows", "automation", "manual", "process"])) {
    return "Business teams coordinate recurring workflows through manual handoffs and disconnected tools, creating fragmented execution, avoidable rework, and reduced operational visibility.";
  }
  return null;
}

function semanticSummaryForSeed(seed: SynthesisSeed, title: string, claims: string[]) {
  const domainSummary = domainSpecificSummary(seed, title, claims);
  if (domainSummary) return cleanSummary(domainSummary);
  const users = inferAffectedUsers(seed, claims);
  const process = inferBusinessProcess(seed, title, claims);
  const failureMode = inferFailureMode(seed, title, claims);
  const impact = inferBusinessImpact(seed, title, claims);
  const consequence = inferOperationalConsequence(seed, title, claims);
  return cleanSummary(`${users} rely on ${process} across manual handoffs, creating ${failureMode}, ${consequence}, and ${impact}`);
}


function inferOperationalDomain(seed: SynthesisSeed, title: string) {
  const text = normalize([title, seed.title, seed.problemCluster, seed.market, seed.audience].join(" "));
  if (hasAny(text, ["crm", "sales", "lead", "follow", "customer"])) return "revenue operations";
  if (hasAny(text, ["invoice", "billing", "approval", "cash"])) return "finance operations";
  if (hasAny(text, ["onboarding", "client", "handoff"])) return "client delivery";
  if (hasAny(text, ["spreadsheet", "reporting", "visibility"])) return "operations reporting";
  if (hasAny(text, ["agency", "workflow", "automation", "process"])) return "business operations";
  return readablePhrase(seed.market, "general operations");
}

function inferWorkflowCategory(seed: SynthesisSeed, title: string) {
  const text = normalize([title, seed.title, seed.problemCluster, seed.market, seed.audience].join(" "));
  if (hasAny(text, ["approval", "invoice", "billing"])) return "approval workflow";
  if (hasAny(text, ["follow", "lead", "qualification"])) return "follow-up workflow";
  if (hasAny(text, ["onboarding", "handoff"])) return "onboarding workflow";
  if (hasAny(text, ["spreadsheet", "reporting"])) return "reporting workflow";
  if (hasAny(text, ["crm", "customer"])) return "customer workflow";
  if (hasAny(text, ["automation", "manual", "process"])) return "manual process workflow";
  return "operational workflow";
}

function diversityProfile(seed: RankedSynthesisSeed): CandidateDiversityProfile {
  const claims = [seed.title, seed.problemCluster];
  const businessProcess = normalize(inferBusinessProcess(seed, seed.semanticTitle, claims));
  const operationalDomain = normalize(inferOperationalDomain(seed, seed.semanticTitle));
  const affectedAudience = normalize(inferAffectedUsers(seed, claims));
  const workflowCategory = normalize(inferWorkflowCategory(seed, seed.semanticTitle));
  return {
    businessProcess,
    operationalDomain,
    affectedAudience,
    workflowCategory,
    businessProblemKey: [businessProcess, operationalDomain, affectedAudience, workflowCategory].join("|"),
  };
}

function diversityScore(seed: RankedSynthesisSeed, emittedSeeds: RankedSynthesisSeed[]) {
  if (emittedSeeds.length === 0) return 1;
  const profile = diversityProfile(seed);
  const scores = emittedSeeds.map((emitted) => {
    const emittedProfile = diversityProfile(emitted);
    const differentDimensions = [
      profile.businessProcess !== emittedProfile.businessProcess,
      profile.operationalDomain !== emittedProfile.operationalDomain,
      profile.affectedAudience !== emittedProfile.affectedAudience,
      profile.workflowCategory !== emittedProfile.workflowCategory,
    ].filter(Boolean).length;
    return Math.round((differentDimensions / 4) * 100) / 100;
  });
  return Math.min(...scores);
}

function emittedCandidateDiversity(emittedSeeds: RankedSynthesisSeed[]) {
  if (emittedSeeds.length <= 1) return emittedSeeds.length;
  const scores: number[] = [];
  for (let index = 0; index < emittedSeeds.length; index += 1) {
    scores.push(diversityScore(emittedSeeds[index], emittedSeeds.filter((_, otherIndex) => otherIndex !== index)));
  }
  return Math.round(average(scores, 0) * 100) / 100;
}

function suppressedDuplicateClusters(rejectedSeeds: CandidateSelection["rejectedSeeds"]) {
  const clusters = new Map<string, { cluster: string; count: number; titles: string[] }>();
  for (const rejection of rejectedSeeds) {
    if (!rejection.reasons.some((reason) => reason.includes("duplicate") || reason === "low_candidate_diversity")) continue;
    const profile = diversityProfile(rejection.seed);
    const current = clusters.get(profile.businessProblemKey) || { cluster: profile.businessProblemKey, count: 0, titles: [] };
    current.count += 1;
    current.titles = unique([...current.titles, safeLogTitle(rejection.seed.semanticTitle)]).slice(0, 5);
    clusters.set(profile.businessProblemKey, current);
  }
  return [...clusters.values()].sort((a, b) => b.count - a.count || a.cluster.localeCompare(b.cluster)).slice(0, 10);
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
    const titleRefinement = refineSemanticTitle(representative, engineSupport, rawTitleRejected);
    const semanticTitle = titleRefinement.title;
    const semanticScore = semanticTitleScore({ ...representative, title: semanticTitle, normalizedTitle: normalize(semanticTitle) }, engineSupport, rawTitleRejected);
    const semanticSummary = semanticSummaryForSeed(representative, semanticTitle, group.flatMap((seed) => [seed.title, seed.problemCluster]));
    const semanticSummaryRejections = semanticSummaryRejectionReasons(semanticSummary);
    const semanticSummaryQuality = summaryQualityScore(semanticSummary);
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
      + Math.min(10, titleRefinement.specificityScore / 10) * 0.08
      + (titleRefinement.canonicalBonusApplied ? 0.4 : 0)
      + (titleRefinement.businessContextBonusApplied ? 0.3 : 0)
      - (titleRefinement.genericPenaltyApplied ? 1.2 : 0)
      - (downrankedGeneric ? 3 : 0),
      0
    ) * 100) / 100;

    return { ...representative, evidenceCount, score, engineSupport, rejectionReasons, genericTitle, downrankedGeneric, semanticTitle, semanticTitleScore: semanticScore, rawTitleRejected, rawTitleRejectionReasons: rawRejectionReasons, semanticSummary, semanticSummaryScore: semanticSummaryQuality, semanticSummaryRejectionReasons: semanticSummaryRejections, semanticSummaryWarnings: semanticSummaryWarnings(semanticSummary), titleRefinementGenerated: titleRefinement.generatedCount, titleSpecificityScoreRefined: titleRefinement.specificityScore, titleRefinementRejectionReasons: titleRefinement.rejectionReasons, genericTitlePenaltyApplied: titleRefinement.genericPenaltyApplied, canonicalTitleBonusApplied: titleRefinement.canonicalBonusApplied, businessContextBonusApplied: titleRefinement.businessContextBonusApplied, duplicateTitlePenaltyApplied: false };
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


type CandidateDomain = "sales_follow_up" | "workflow_automation" | "spreadsheet_operations" | "crm_operations" | "billing_invoicing" | "client_operations" | "ai_automation" | "general_operations";

function candidateDomain(seed: RankedSynthesisSeed): CandidateDomain {
  const text = normalize([seed.semanticTitle, seed.title, seed.problemCluster, seed.market, seed.audience].join(" "));
  if (hasAny(text, ["spreadsheet", "spreadsheets", "reporting"])) return "spreadsheet_operations";
  if (hasAny(text, ["invoice", "billing", "invoicing", "cash", "approval"])) return "billing_invoicing";
  if (hasAny(text, ["crm"])) return "crm_operations";
  if (hasAny(text, ["sales", "lead", "leads", "follow", "qualification"])) return "sales_follow_up";
  if (hasAny(text, ["client", "onboarding", "handoff", "customer"])) return "client_operations";
  if (hasAny(text, ["ai", "artificial intelligence", "llm", "model"])) return "ai_automation";
  if (hasAny(text, ["workflow", "workflows", "automation", "manual", "process"])) return "workflow_automation";
  return "general_operations";
}

function isHighQualitySelectable(seed: RankedSynthesisSeed, confidence: number, hasMeaningfulSummary: boolean) {
  const normalizedSemanticTitle = normalize(seed.semanticTitle);
  const semanticRejectionReasons = semanticTitleRejectionReasons(seed.semanticTitle);
  return [
    !normalizedSemanticTitle || isGenericTitle(seed.semanticTitle, normalizedSemanticTitle) || seed.semanticTitleScore < MIN_SEMANTIC_TITLE_SCORE || semanticRejectionReasons.length > 0 ? "generic_or_weak_semantic_title" : "",
    seed.evidenceCount < MIN_EVIDENCE_FOR_STRONG_SEED || seed.engineSupport.length < 2 ? "weak_evidence_support" : "",
    !hasMeaningfulSummary ? "weak_summary" : "",
    confidence < MIN_SYNTHESIS_CONFIDENCE ? "confidence_below_threshold" : "",
    semanticRejectionReasons.length > 0 ? "semantic_title_quality_rejected" : "",
    ...finalTitleQualityGateRejectionReasons(seed),
  ].filter(Boolean);
}

type CandidateSelection = {
  emittedSeeds: RankedSynthesisSeed[];
  rejectedSeeds: Array<{ seed: RankedSynthesisSeed; reasons: string[] }>;
  maxCandidateCount: number;
  multiCandidateModeEnabled: boolean;
  domainFillAttempts: Array<{ pass: string; seed: RankedSynthesisSeed; accepted: boolean; reasons: string[] }>;
  availableHighQualityDomainCount: number;
  replacementCandidateAttempts: number;
};

function selectionRejectionReasons(seed: RankedSynthesisSeed, emittedSeeds: RankedSynthesisSeed[], confidence: number, hasMeaningfulSummary: boolean) {
  const qualityReasons = isHighQualitySelectable(seed, confidence, hasMeaningfulSummary);
  const emittedTitleKeys = new Set(emittedSeeds.map((item) => canonicalTitleKey(item.semanticTitle)));
  const emittedBusinessProblemKeys = new Set(emittedSeeds.map((item) => `${candidateDomain(item)}|${diversityProfile(item).businessProblemKey}`));
  const candidateDiversityScore = diversityScore(seed, emittedSeeds);
  return [
    ...qualityReasons,
    emittedTitleKeys.has(canonicalTitleKey(seed.semanticTitle)) ? "duplicate_normalized_title" : "",
    emittedBusinessProblemKeys.has(`${candidateDomain(seed)}|${diversityProfile(seed).businessProblemKey}`) ? "duplicate_business_problem_cluster" : "",
    emittedSeeds.length > 0 && candidateDiversityScore < 0.5 && emittedSeeds.some((item) => candidateDomain(item) === candidateDomain(seed)) ? "low_candidate_diversity" : "",
  ].filter(Boolean);
}

function selectSynthesisSeeds(input: ProblemSynthesisInput, confidence: number, hasMeaningfulSummary: boolean): CandidateSelection {
  const rankedSeeds = rankSeeds(candidateSeeds(input));
  const multiCandidateModeEnabled = isMultiCandidateDiagnosticsEnabled();
  const maxCandidateCount = multiCandidateModeEnabled ? MAX_DIAGNOSTIC_SYNTHESIS_CANDIDATES : 1;
  const emittedSeeds: RankedSynthesisSeed[] = [];
  const rejectedSeeds: Array<{ seed: RankedSynthesisSeed; reasons: string[] }> = [];
  const domainFillAttempts: CandidateSelection["domainFillAttempts"] = [];
  const rejectedSeedKeys = new Set<string>();
  const seedKey = (seed: RankedSynthesisSeed) => [seed.semanticTitle, seed.normalizedTitle, seed.market, seed.audience, seed.problemCluster].join("|");
  const rejectSeed = (seed: RankedSynthesisSeed, reasons: string[]) => {
    const key = seedKey(seed);
    if (rejectedSeedKeys.has(key) || emittedSeeds.includes(seed)) return;
    rejectedSeedKeys.add(key);
    rejectedSeeds.push({ seed, reasons });
  };

  if (!multiCandidateModeEnabled) {
    for (const seed of rankedSeeds) {
      if (emittedSeeds.length < 1) emittedSeeds.push(seed);
      else rejectSeed(seed, ["single_candidate_mode_retains_only_top_ranked_cluster"]);
    }
    return { emittedSeeds, rejectedSeeds, maxCandidateCount, multiCandidateModeEnabled, domainFillAttempts, availableHighQualityDomainCount: new Set(rankedSeeds.map(candidateDomain)).size, replacementCandidateAttempts: 0 };
  }

  const qualityEligibleSeeds = rankedSeeds.filter((seed) => isHighQualitySelectable(seed, confidence, hasMeaningfulSummary).length === 0);
  const availableHighQualityDomainCount = new Set(qualityEligibleSeeds.map(candidateDomain)).size;
  const usedDomains = new Set<CandidateDomain>();

  for (const seed of qualityEligibleSeeds) {
    if (emittedSeeds.length >= maxCandidateCount) break;
    const domain = candidateDomain(seed);
    const reasons = selectionRejectionReasons(seed, emittedSeeds, confidence, hasMeaningfulSummary);
    if (usedDomains.has(domain)) reasons.push("domain_already_represented_first_pass");
    const accepted = reasons.length === 0;
    domainFillAttempts.push({ pass: "domain_first_pass", seed, accepted, reasons });
    if (accepted) {
      emittedSeeds.push(seed);
      usedDomains.add(domain);
    }
  }

  for (const seed of qualityEligibleSeeds) {
    if (emittedSeeds.length >= maxCandidateCount) break;
    if (emittedSeeds.includes(seed)) continue;
    const reasons = selectionRejectionReasons(seed, emittedSeeds, confidence, hasMeaningfulSummary);
    const accepted = reasons.length === 0;
    domainFillAttempts.push({ pass: "remaining_slot_fill", seed, accepted, reasons });
    if (accepted) emittedSeeds.push(seed);
  }

  for (const seed of rankedSeeds) {
    if (emittedSeeds.includes(seed)) continue;
    const qualityReasons = isHighQualitySelectable(seed, confidence, hasMeaningfulSummary);
    const reasons = qualityReasons.length > 0 ? qualityReasons : selectionRejectionReasons(seed, emittedSeeds, confidence, hasMeaningfulSummary);
    rejectSeed(seed, reasons.length > 0 ? reasons : ["max_candidate_count_reached"]);
  }

  return { emittedSeeds, rejectedSeeds, maxCandidateCount, multiCandidateModeEnabled, domainFillAttempts, availableHighQualityDomainCount, replacementCandidateAttempts: domainFillAttempts.filter((attempt) => !attempt.accepted).length };
}

function candidateSelectionRejections(selection: CandidateSelection) {
  return selection.rejectedSeeds.slice(0, 25).map((item) => ({
    title: safeLogTitle(item.seed.semanticTitle),
    reasons: item.reasons,
    diversity_score: diversityScore(item.seed, selection.emittedSeeds),
  }));
}

function countItems(items: string[], label: "reason" | "warning") {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([item, count]) => ({ [label]: item, count })) as Array<{ reason: string; count: number }> & Array<{ warning: string; count: number }>;
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
  const summaryScores = rankedSeeds.map((seed) => seed.semanticSummaryScore);
  const selectedSummaryKeys = selection.emittedSeeds.map((seed) => normalize(seed.semanticSummary));
  const duplicatedSummaryCount = selectedSummaryKeys.length - new Set(selectedSummaryKeys).size;
  const emittedSummaryQualityScores = selection.emittedSeeds.map((seed) => ({ title: safeLogTitle(seed.semanticTitle), score: seed.semanticSummaryScore }));
  const emittedSummaryLengths = selection.emittedSeeds.map((seed) => ({ title: safeLogTitle(seed.semanticTitle), length: summaryLength(seed.semanticSummary) }));
  const emittedSummaryTitleOverlapScores = selection.emittedSeeds.map((seed) => ({ title: safeLogTitle(seed.semanticTitle), score: titleOverlapScore(seed.semanticSummary, seed.semanticTitle) }));
  const emittedSummaryGenerationWarnings = selection.emittedSeeds.map((seed) => ({
    title: safeLogTitle(seed.semanticTitle),
    warnings: seed.semanticSummaryWarnings,
  }));
  const semanticRejected = rankedSeeds.filter((seed) => semanticTitleRejectionReasons(seed.semanticTitle).length > 0);
  const semanticReasonCounts = new Map<string, number>();
  for (const seed of semanticRejected) {
    for (const reason of semanticTitleRejectionReasons(seed.semanticTitle)) semanticReasonCounts.set(reason, (semanticReasonCounts.get(reason) || 0) + 1);
  }
  const semanticTitleRejectionReasonsReport = [...semanticReasonCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({ reason, count }));
  const canonicalTitleCounts = new Map<string, number>();
  for (const seed of rankedSeeds) canonicalTitleCounts.set(seed.semanticTitle, (canonicalTitleCounts.get(seed.semanticTitle) || 0) + 1);
  const canonicalTitleCountsReport = [...canonicalTitleCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([title, count]) => ({ title, count }));
  const duplicateCanonicalTitleCount = Math.max(0, rankedSeeds.length - canonicalTitleCounts.size);
  const diversityScores = rankedSeeds.map((seed) => diversityScore(seed, selection.emittedSeeds.filter((emittedSeed) => emittedSeed !== seed)));
  const availableHighQualityDomainCount = selection.availableHighQualityDomainCount;
  const allDomains = new Set([...rankedSeeds.map(candidateDomain), ...selection.emittedSeeds.map(candidateDomain), ...selection.rejectedSeeds.map((item) => candidateDomain(item.seed))]);
  const domainDiversityBuckets = [...allDomains].sort().map((domain) => {
    const domainRankedSeeds = rankedSeeds.filter((seed) => candidateDomain(seed) === domain);
    const domainEmittedSeeds = selection.emittedSeeds.filter((seed) => candidateDomain(seed) === domain);
    const domainRejectedSeeds = selection.rejectedSeeds.filter((item) => candidateDomain(item.seed) === domain);
    return {
      domain,
      count: domainRankedSeeds.length,
      emitted: domainEmittedSeeds.length,
      rejected: domainRejectedSeeds.length,
      titles: unique(domainRankedSeeds.map((seed) => safeLogTitle(seed.semanticTitle))).slice(0, 5),
    };
  });
  const domainSuppressionCounts = new Map<string, { domain: string; reason: string; count: number }>();
  for (const rejection of selection.rejectedSeeds) {
    const domain = candidateDomain(rejection.seed);
    for (const reason of rejection.reasons) {
      const key = `${domain}|${reason}`;
      const current = domainSuppressionCounts.get(key) || { domain, reason, count: 0 };
      current.count += 1;
      domainSuppressionCounts.set(key, current);
    }
  }
  const domainFillAttempts = selection.domainFillAttempts.map((attempt) => ({
    pass: attempt.pass,
    title: safeLogTitle(attempt.seed.semanticTitle),
    domain: candidateDomain(attempt.seed),
    accepted: attempt.accepted,
    reasons: attempt.reasons,
  }));
  const domainBlockingReasons = rejectionReasons.filter((item) => item.reason !== "max_candidate_count_reached").map((item) => `${item.reason}:${item.count}`).join(", ");
  const underfilledCandidateSlotsReason = emittedCandidateCount >= selection.maxCandidateCount ? null
    : rankedSeeds.length === 0 ? "no_ranked_synthesis_seeds_available"
      : availableHighQualityDomainCount <= emittedCandidateCount ? `only_${availableHighQualityDomainCount}_high_quality_distinct_domain(s)_available_after_quality_gates`
        : domainBlockingReasons ? `remaining_candidates_blocked_by_quality_or_duplicate_gates (${domainBlockingReasons})`
          : "no_additional_quality_gated_candidates_available";

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
    semanticTitlesRejected: semanticRejected.length,
    semanticTitleRejectionReasons: semanticTitleRejectionReasonsReport,
    semanticTitleCanonicalization: {
      generatedCount: rankedSeeds.length,
      uniqueCanonicalTitleCount: canonicalTitleCounts.size,
      duplicateCanonicalTitleCount,
      canonicalTitleCounts: canonicalTitleCountsReport.slice(0, 10),
    },
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
    genericTitleRejectionCount: (rejectionReasonCounts.get("generic_or_weak_semantic_title") || 0) + selection.rejectedSeeds.filter((item) => item.seed.genericTitle || item.seed.genericTitlePenaltyApplied).length,
    semanticTitleQualityScores: rankedSeeds.map((seed) => ({ title: seed.semanticTitle, score: seed.semanticTitleScore })),
    emitted_title_quality_scores: selection.emittedSeeds.map((seed) => ({ title: safeLogTitle(seed.semanticTitle), score: emittedTitleQualityScore(seed.semanticTitle) })),
    emitted_title_specificity_scores: selection.emittedSeeds.map((seed) => ({ title: safeLogTitle(seed.semanticTitle), score: titleSpecificityMetric(seed.semanticTitle) })),
    title_quality_gate_rejections: selection.rejectedSeeds
      .filter((item) => item.reasons.some((reason) => ["broad_emitted_title", "missing_two_business_dimensions", "low_emitted_title_specificity", "low_emitted_title_quality", "generic_or_weak_semantic_title", "semantic_title_quality_rejected"].includes(reason)))
      .map((item) => ({ title: safeLogTitle(item.seed.semanticTitle), reasons: item.reasons, quality_score: emittedTitleQualityScore(item.seed.semanticTitle), specificity_score: titleSpecificityMetric(item.seed.semanticTitle) }))
      .slice(0, 50),
    title_refinement_applied_count: rankedSeeds.filter((seed) => normalize(seed.title) !== normalize(seed.semanticTitle)).length,
    low_specificity_emitted_count: selection.emittedSeeds.filter((seed) => titleSpecificityMetric(seed.semanticTitle) < MIN_EMITTED_TITLE_SPECIFICITY).length,
    replacement_candidate_attempts: selection.replacementCandidateAttempts,
    title_quality_preservation_score: selection.emittedSeeds.length === 0 ? 0 : Math.round(average(selection.emittedSeeds.map((seed) => emittedTitleQualityScore(seed.semanticTitle)), 0) * 100) / 100,
    diversity_score: emittedCandidateDiversity(selection.emittedSeeds),
    emitted_candidate_diversity: selection.emittedSeeds.map((seed) => ({ title: safeLogTitle(seed.semanticTitle), ...diversityProfile(seed), diversity_score: diversityScore(seed, selection.emittedSeeds.filter((emittedSeed) => emittedSeed !== seed)) })),
    suppressed_duplicate_clusters: suppressedDuplicateClusters(selection.rejectedSeeds),
    candidate_selection_rejections: candidateSelectionRejections(selection),
    diversity_distribution: scoreDistribution(diversityScores),
    domain_diversity_buckets: domainDiversityBuckets,
    emitted_candidate_domains: selection.emittedSeeds.map((seed) => ({ title: safeLogTitle(seed.semanticTitle), domain: candidateDomain(seed) })),
    rejected_candidate_domains: selection.rejectedSeeds.map((item) => ({ title: safeLogTitle(item.seed.semanticTitle), domain: candidateDomain(item.seed), reasons: item.reasons })).slice(0, 50),
    domain_suppression_reasons: [...domainSuppressionCounts.values()].sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain) || a.reason.localeCompare(b.reason)),
    domain_fill_attempts: domainFillAttempts,
    available_high_quality_domain_count: availableHighQualityDomainCount,
    underfilled_candidate_slots_reason: underfilledCandidateSlotsReason,
    refined_titles_generated: rankedSeeds.reduce((sum, seed) => sum + seed.titleRefinementGenerated, 0),
    refined_titles_selected: selection.emittedSeeds.length,
    title_specificity_distribution: scoreDistribution(rankedSeeds.map((seed) => seed.titleSpecificityScoreRefined)),
    generic_title_penalty_count: rankedSeeds.filter((seed) => seed.genericTitlePenaltyApplied).length,
    canonical_title_bonus_count: rankedSeeds.filter((seed) => seed.canonicalTitleBonusApplied).length,
    business_context_bonus_count: rankedSeeds.filter((seed) => seed.businessContextBonusApplied).length,
    duplicate_title_penalty_count: duplicateCanonicalTitleCount,
    title_refinement_rejections: countItems(rankedSeeds.flatMap((seed) => seed.titleRefinementRejectionReasons), "reason"),
    semantic_summaries_generated: rankedSeeds.length,
    semantic_summaries_selected: selection.emittedSeeds.filter((seed) => seed.semanticSummaryRejectionReasons.length === 0).length,
    average_summary_length: Math.round(average(rankedSeeds.map((seed) => normalize(seed.semanticSummary).split(" ").filter(Boolean).length), 0) * 100) / 100,
    duplicated_summary_count: duplicatedSummaryCount,
    emitted_summary_quality_scores: emittedSummaryQualityScores,
    emitted_summary_lengths: emittedSummaryLengths,
    emitted_summary_title_overlap_scores: emittedSummaryTitleOverlapScores,
    emitted_summary_generation_warnings: emittedSummaryGenerationWarnings,
    low_quality_emitted_summary_count: selection.emittedSeeds.filter((seed) => seed.semanticSummaryScore < 7 || seed.semanticSummaryRejectionReasons.length > 0).length,
    summary_refinement_applied_count: rankedSeeds.filter((seed) => domainSpecificSummary(seed, seed.semanticTitle, [seed.title, seed.problemCluster]) !== null).length,
    summary_quality_distribution: scoreDistribution(summaryScores),
    summary_generation_rejections: countItems(rankedSeeds.flatMap((seed) => seed.semanticSummaryRejectionReasons), "reason"),
    summary_generation_warnings: countItems(rankedSeeds.flatMap((seed) => seed.semanticSummaryWarnings), "warning"),
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
      ? { emittedSeeds: [], rejectedSeeds: [], maxCandidateCount: isMultiCandidateDiagnosticsEnabled() ? MAX_DIAGNOSTIC_SYNTHESIS_CANDIDATES : 1, multiCandidateModeEnabled: isMultiCandidateDiagnosticsEnabled(), domainFillAttempts: [], availableHighQualityDomainCount: 0, replacementCandidateAttempts: 0 }
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
      const selectedSeed = selection.emittedSeeds.find((seed) => seed.semanticTitle === title);
      const synthesizedSummary = selectedSeed?.semanticSummary || semanticSummaryForSeed({ title, normalizedTitle: normalize(title), market: normalize(markets[0] || "unknown") || "unknown", audience: normalize(audiences[0] || "unknown") || "unknown", problemCluster: normalize(canonicalCluster(title, input)), engine: "fallback", baseScore: 0, rank: 999, evidenceCount: evidence.length, sourceQualityScore: 0, titleSpecificityScore: specificityScore(title), claimSpecificityScore: 0, genericTitle: false }, title, claims);
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
