import type { EvidenceSourceType } from "./types";

const GENERIC_TITLES = new Set([
  "manual",
  "billing",
  "approval",
  "automation",
  "spreadsheet",
  "spreadsheets",
  "operations",
]);

const PAIN_PATTERNS = [
  /\b(painful|pain|frustrat(?:e|ing|ed)|struggle|struggling|broken|block(?:ed|er|ing)?|slow|wast(?:e|ing|ed)|tedious|error-prone|hard|difficult|chaos|messy|bottleneck|delay(?:ed|s)?|complain(?:ing|s)?|manual)\b/gi,
  /\b(can(?:no|')t|cannot|unable to|fails? to|lose|lost|leak(?:ing)?|churn|rework|duplicate|copy(?:ing)?|paste|spreadsheet)\b/gi,
];

const FREQUENCY_PATTERNS = [
  /\b(repeated|recurring|every\s+(day|week|month|friday)|daily|weekly|monthly|constantly|always|again and again|often|frequent(?:ly)?|ongoing)\b/gi,
  /\b(workflow|manual|spreadsheet|spreadsheets|copy(?:ing)?|paste|rework|handoff|approval queue|backlog)\b/gi,
];

const BUYING_PATTERNS = [
  /\b(pay(?:ing)?|paid|pricing|price|subscription|budget|spend(?:ing)?|cost(?:s|ly)?|invoice|revenue|lost revenue|sales lost|hire|hiring|contractor|agency|tool|tools|software|vendor|seat|license)\b/gi,
  /\$\s?\d+[\d,]*(?:\.\d+)?|\b\d+[kKmM]\b/g,
];

const SPECIFICITY_PATTERNS = [
  /\b\d+[\d,]*(?:\.\d+)?%?\b/g,
  /\b(smb|agency|agencies|founder|operator|finance|sales|support|clinic|legal|real estate|client|customer|team|teams)\b/gi,
];

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function text(value: unknown) {
  return typeof value === "string" ? compactWhitespace(value) : "";
}

function sentenceCandidates(value: string) {
  return compactWhitespace(value)
    .split(/(?<=[.!?])\s+|\s+[•|]\s+|\n+/)
    .map((item) => item.replace(/^[-–—:;\s]+|[-–—:;\s]+$/g, "").trim())
    .filter(Boolean);
}

function wordCount(value: string) {
  return compactWhitespace(value).split(/\s+/).filter(Boolean).length;
}

function limitWords(value: string, maxWords: number) {
  const words = compactWhitespace(value).split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ")}…`;
}

function countMatches(value: string, patterns: RegExp[]) {
  return patterns.reduce((sum, pattern) => sum + (value.match(pattern) || []).length, 0);
}

function clampScore(value: number) {
  return Math.min(10, Math.max(0, Number(value.toFixed(1))));
}

function stripSourcePrefix(value: string) {
  return value.replace(/^(x signal|data moat problem|weekly problem):\s*/i, "");
}

export function isGenericProblemTitle(value: unknown) {
  const normalized = text(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return !normalized || GENERIC_TITLES.has(normalized);
}

export function extractConciseEvidenceClaim({
  title,
  snippet,
  rawText,
  maxWords = 24,
}: {
  title?: unknown;
  snippet?: unknown;
  rawText?: unknown;
  maxWords?: number;
}) {
  const candidates = [text(snippet), text(rawText), text(title)]
    .flatMap(sentenceCandidates)
    .filter((candidate) => wordCount(candidate) >= 5);
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score:
        countMatches(candidate, PAIN_PATTERNS) * 3 +
        countMatches(candidate, FREQUENCY_PATTERNS) * 2 +
        countMatches(candidate, BUYING_PATTERNS) * 2 +
        Math.min(3, wordCount(candidate) / 8),
    }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0]?.candidate || text(snippet) || text(rawText) || text(title);
  return best ? limitWords(stripSourcePrefix(best), maxWords) : null;
}

export function deriveDetectedProblemTitle({
  title,
  snippet,
  rawText,
  maxWords = 8,
}: {
  title?: unknown;
  snippet?: unknown;
  rawText?: unknown;
  maxWords?: number;
}) {
  const titleText = stripSourcePrefix(text(title));
  if (wordCount(titleText) >= 3 && wordCount(titleText) <= 12 && !isGenericProblemTitle(titleText)) {
    return titleText;
  }

  const claim = extractConciseEvidenceClaim({ title, snippet, rawText, maxWords: 18 }) || "";
  const withoutLead = claim
    .replace(/^\b(teams|companies|agencies|users|operators|founders|people)\b\s+(still\s+)?/i, "")
    .replace(/^\b(we|they|i|our)\b\s+/i, "")
    .replace(/\b(every day|every week|daily|weekly|monthly|again and again)\b/gi, "")
    .replace(/[.!?]+$/g, "");
  const compact = limitWords(withoutLead, maxWords);
  if (wordCount(compact) >= 3 && !isGenericProblemTitle(compact)) return compact;
  return null;
}

export function estimatePainIntensity(value: unknown) {
  const source = text(value);
  if (!source) return null;
  return clampScore(2 + Math.min(8, countMatches(source, PAIN_PATTERNS) * 1.6));
}

export function estimateFrequencySignal(value: unknown) {
  const source = text(value);
  if (!source) return null;
  return clampScore(1.5 + Math.min(8.5, countMatches(source, FREQUENCY_PATTERNS) * 1.4));
}

export function estimateBuyingIntentSignal(value: unknown) {
  const source = text(value);
  if (!source) return null;
  return clampScore(1 + Math.min(9, countMatches(source, BUYING_PATTERNS) * 1.7));
}

export function estimateSourceQualityScore({
  title,
  snippet,
  rawText,
  sourceUrl,
  sourceType,
  signalScore,
}: {
  title?: unknown;
  snippet?: unknown;
  rawText?: unknown;
  sourceUrl?: unknown;
  sourceType?: EvidenceSourceType | string | null;
  signalScore?: unknown;
}) {
  const combined = [title, snippet, rawText].map(text).filter(Boolean).join(" ");
  if (!combined) return null;
  const snippetLength = text(snippet).length || text(rawText).length;
  const numericSignal = Number(signalScore);
  const sourceTypeScore = sourceType === "data_moat" ? 1.4 : sourceType ? 0.8 : 0;
  return clampScore(
    2 +
      (text(sourceUrl) ? 1.2 : 0) +
      sourceTypeScore +
      Math.min(2, snippetLength / 140) +
      Math.min(2, countMatches(combined, SPECIFICITY_PATTERNS) * 0.7) +
      (Number.isFinite(numericSignal) ? Math.min(1.4, Math.max(0, numericSignal) / 50) : 0)
  );
}
