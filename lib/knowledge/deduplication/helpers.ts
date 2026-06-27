const STOP_WORDS = new Set(["a","an","and","are","as","because","but","by","for","from","in","into","is","it","need","needs","of","on","or","that","the","their","they","to","with","without","do","does","not","can","cannot","lose","loses"]);

/** Normalizes problem language so future Knowledge Layer services can compare market pains consistently across sources. */
export function normalizeProblemText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/[^\s]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Extracts stable, non-trivial tokens that let SaaSScout compare problem meaning without depending on exact titles. */
export function extractProblemTokens(value: string | null | undefined) {
  return Array.from(new Set(normalizeProblemText(value).split(" ").filter((token) => token.length > 2 && !STOP_WORDS.has(token)))).sort();
}

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 33) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

/** Generates a deterministic semantic-problem fingerprint for future canonical Knowledge Layer identities. */
export function generateProblemFingerprint(input: { title: string | null; market?: string | null; audience?: string | null }) {
  const tokens = extractProblemTokens(input.title).join(" ");
  const context = [normalizeProblemText(input.market), normalizeProblemText(input.audience)].join("|");
  return `pd1:${hashString(`${tokens}|${context}`)}`;
}

/** Clamps scoring signals to SaaSScout's shared deterministic 0-10 intelligence scale. */
export function normalizeSimilarityScore(value: number | null | undefined) {
  const score = Number(value ?? 0);
  if (!Number.isFinite(score)) return 0;
  return Math.min(10, Math.max(0, Number(score.toFixed(1))));
}

/** Calculates set overlap so deduplication can reuse tokens and engine identifiers as objective similarity evidence. */
export function calculateOverlapScore(left: string[], right: string[]) {
  const a = new Set(left.filter(Boolean));
  const b = new Set(right.filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = Array.from(a).filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return normalizeSimilarityScore((intersection / union) * 10);
}

/** Returns a unique sorted list for relationship helpers that aggregate evidence and engine links into canonical identities. */
export function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

/** Validates whether a candidate has enough problem information to participate in future consolidation workflows. */
export function validateProblemDeduplicationCandidate(candidate: { id?: string; title?: string; fingerprint?: string }) {
  const errors: string[] = [];
  if (!candidate.id) errors.push("Candidate id is required.");
  if (!candidate.title) errors.push("Candidate title is required.");
  if (!candidate.fingerprint) errors.push("Candidate fingerprint is required.");
  return { valid: errors.length === 0, errors };
}
