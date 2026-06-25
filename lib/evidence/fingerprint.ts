const FINGERPRINT_VERSION = "ev1";

function normalizeFingerprintPart(value: string | null | undefined) {
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

export function generateEvidenceFingerprint({
  sourceType,
  sourceUrl,
  capturedText,
  extractedClaim,
  market,
  detectedProblemTitle,
}: {
  sourceType?: string | null;
  sourceUrl?: string | null;
  capturedText?: string | null;
  extractedClaim?: string | null;
  market?: string | null;
  detectedProblemTitle?: string | null;
}) {
  const canonicalUrl = String(sourceUrl || "").trim().toLowerCase();
  const textBasis = normalizeFingerprintPart(
    extractedClaim || capturedText || detectedProblemTitle || ""
  ).slice(0, 500);

  const parts = [
    FINGERPRINT_VERSION,
    normalizeFingerprintPart(sourceType),
    canonicalUrl,
    normalizeFingerprintPart(market),
    normalizeFingerprintPart(detectedProblemTitle),
    textBasis,
  ];

  return `${FINGERPRINT_VERSION}:${hashString(parts.join("|"))}`;
}
