import type { DiscoveredProblem } from "@/lib/intelligence/discovery-response-normalization";

export type DiscoverDeduplicationCandidate = DiscoveredProblem;

export type DiscoverHistoricalProblem = Pick<
  DiscoveredProblem,
  "problem_title" | "problem_summary" | "affected_niches" | "suggested_solutions" | "problem_cluster"
>;

export type DiscoverDeduplicationDecision = Readonly<{
  candidate: DiscoverDeduplicationCandidate;
  accepted: boolean;
  reason?: "duplicate_in_generation" | "duplicate_in_user_history" | "low_diversity_in_generation";
  matchedField?: "title" | "summary" | "combined" | "diversity";
}>;

export type DiscoverDeduplicationDiagnostics = Readonly<{
  inputCount: number;
  acceptedCount: number;
  generationDuplicateCount: number;
  historyDuplicateCount: number;
  diversityRejectedCount: number;
}>;

export type DiscoverDeduplicationResult = Readonly<{
  accepted: DiscoverDeduplicationCandidate[];
  rejected: DiscoverDeduplicationDecision[];
  diagnostics: DiscoverDeduplicationDiagnostics;
}>;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "without",
  "manual",
  "automated",
  "automation",
  "tool",
  "platform",
  "system",
  "software",
  "saas",
]);

export function normalizeDiscoveryText(value: unknown): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: unknown): Set<string> {
  const normalized = normalizeDiscoveryText(value);
  if (!normalized) return new Set();

  return new Set(
    normalized
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function titleSimilarity(a: DiscoverHistoricalProblem, b: DiscoverHistoricalProblem): number {
  const titleA = normalizeDiscoveryText(a.problem_title);
  const titleB = normalizeDiscoveryText(b.problem_title);
  if (!titleA || !titleB) return 0;
  if (titleA === titleB) return 1;
  return jaccardSimilarity(tokenize(titleA), tokenize(titleB));
}

function summarySimilarity(a: DiscoverHistoricalProblem, b: DiscoverHistoricalProblem): number {
  const summaryA = normalizeDiscoveryText(a.problem_summary);
  const summaryB = normalizeDiscoveryText(b.problem_summary);
  if (!summaryA || !summaryB) return 0;
  if (summaryA === summaryB) return 1;
  return jaccardSimilarity(tokenize(summaryA), tokenize(summaryB));
}

function combinedSimilarity(a: DiscoverHistoricalProblem, b: DiscoverHistoricalProblem): number {
  return jaccardSimilarity(
    tokenize(`${a.problem_title} ${a.problem_summary} ${a.affected_niches} ${a.suggested_solutions}`),
    tokenize(`${b.problem_title} ${b.problem_summary} ${b.affected_niches} ${b.suggested_solutions}`)
  );
}

function getDuplicateMatch(
  candidate: DiscoverHistoricalProblem,
  existing: DiscoverHistoricalProblem[]
): DiscoverDeduplicationDecision["matchedField"] | null {
  for (const item of existing) {
    if (titleSimilarity(candidate, item) >= 0.82) return "title";
    if (summarySimilarity(candidate, item) >= 0.72) return "summary";
    if (combinedSimilarity(candidate, item) >= 0.68) return "combined";
  }
  return null;
}

function diversityKey(problem: DiscoverHistoricalProblem) {
  return normalizeDiscoveryText(
    `${problem.problem_cluster} ${problem.affected_niches.split("|")[0] || ""}`
  );
}

function isLowDiversityCandidate(candidate: DiscoverHistoricalProblem, accepted: DiscoverHistoricalProblem[]) {
  const key = diversityKey(candidate);
  if (!key) return false;
  const sameKeyCount = accepted.filter((item) => diversityKey(item) === key).length;
  if (sameKeyCount < 2) return false;
  return accepted.some((item) => combinedSimilarity(candidate, item) >= 0.35);
}

export function deduplicateDiscoverProblems({
  candidates,
  userHistory = [],
  targetCount = 8,
}: {
  candidates: DiscoverDeduplicationCandidate[];
  userHistory?: DiscoverHistoricalProblem[];
  targetCount?: number;
}): DiscoverDeduplicationResult {
  const accepted: DiscoverDeduplicationCandidate[] = [];
  const rejected: DiscoverDeduplicationDecision[] = [];

  for (const candidate of candidates) {
    const historyMatch = getDuplicateMatch(candidate, userHistory);
    if (historyMatch) {
      rejected.push({ candidate, accepted: false, reason: "duplicate_in_user_history", matchedField: historyMatch });
      continue;
    }

    const generationMatch = getDuplicateMatch(candidate, accepted);
    if (generationMatch) {
      rejected.push({ candidate, accepted: false, reason: "duplicate_in_generation", matchedField: generationMatch });
      continue;
    }

    if (isLowDiversityCandidate(candidate, accepted)) {
      rejected.push({ candidate, accepted: false, reason: "low_diversity_in_generation", matchedField: "diversity" });
      continue;
    }

    accepted.push(candidate);
    if (accepted.length >= targetCount) break;
  }

  return {
    accepted,
    rejected,
    diagnostics: {
      inputCount: candidates.length,
      acceptedCount: accepted.length,
      generationDuplicateCount: rejected.filter((item) => item.reason === "duplicate_in_generation").length,
      historyDuplicateCount: rejected.filter((item) => item.reason === "duplicate_in_user_history").length,
      diversityRejectedCount: rejected.filter((item) => item.reason === "low_diversity_in_generation").length,
    },
  };
}
