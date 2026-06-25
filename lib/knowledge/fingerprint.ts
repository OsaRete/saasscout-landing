const PROBLEM_FINGERPRINT_VERSION = "kp1";

export function normalizeKnowledgeText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/[^\s]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hashString(value: string) {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

export function generateKnowledgeProblemFingerprint({
  title,
  market,
  audience,
}: {
  title: string | null;
  market?: string | null;
  audience?: string | null;
}) {
  const parts = [
    PROBLEM_FINGERPRINT_VERSION,
    normalizeKnowledgeText(title),
    normalizeKnowledgeText(market),
    normalizeKnowledgeText(audience),
  ];

  return `${PROBLEM_FINGERPRINT_VERSION}:${hashString(parts.join("|"))}`;
}

export function generateKnowledgeId(prefix: string, ...parts: Array<string | null | undefined>) {
  return `${prefix}:${hashString(parts.map(normalizeKnowledgeText).join("|"))}`;
}
