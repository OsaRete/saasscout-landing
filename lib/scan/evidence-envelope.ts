export type EvidenceSourceKind =
  | "pasted_evidence"
  | "uploaded_document"
  | "external_snippet"
  | "previous_analysis"
  | "unknown";

export type EvidenceTrustLevel = "trusted_user_intent" | "untrusted_evidence";

export type TrustedUserIntent = {
  market: string;
  audience: string;
  region: string;
};

export type UntrustedEvidenceItem = {
  evidenceId: string;
  sourceKind: EvidenceSourceKind;
  trustLevel: "untrusted_evidence";
  normalizedContent: string;
  boundedLength: number;
};

export type EvidenceEnvelopeInput = {
  evidenceId?: string;
  sourceKind?: EvidenceSourceKind;
  content: string;
};

export const DEFAULT_EVIDENCE_ITEM_MAX_LENGTH = 6000;

const DELIMITER_TOKEN_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [
    /==========\s*BEGIN\s+UNTRUSTED\s+EVIDENCE\s*==========/gi,
    "[escaped begin untrusted evidence delimiter]",
  ],
  [
    /==========\s*END\s+UNTRUSTED\s+EVIDENCE\s*==========/gi,
    "[escaped end untrusted evidence delimiter]",
  ],
  [
    /----------\s*BEGIN\s+EVIDENCE\s+ITEM\s*----------/gi,
    "[escaped begin evidence item delimiter]",
  ],
  [
    /----------\s*END\s+EVIDENCE\s+ITEM\s*----------/gi,
    "[escaped end evidence item delimiter]",
  ],
];

export function buildTrustedUserIntent(input: {
  market?: unknown;
  audience?: unknown;
  region?: unknown;
}): TrustedUserIntent {
  return {
    market: normalizeTrustedIntentField(input.market),
    audience: normalizeTrustedIntentField(input.audience),
    region: normalizeTrustedIntentField(input.region),
  };
}

export function createUntrustedEvidenceItem(
  input: EvidenceEnvelopeInput,
  options: { maxLength?: number } = {},
): UntrustedEvidenceItem {
  const maxLength = options.maxLength ?? DEFAULT_EVIDENCE_ITEM_MAX_LENGTH;
  const normalizedContent = normalizeEvidenceContent(input.content, maxLength);

  return {
    evidenceId: normalizeEvidenceId(input.evidenceId),
    sourceKind: input.sourceKind ?? "unknown",
    trustLevel: "untrusted_evidence",
    normalizedContent,
    boundedLength: normalizedContent.length,
  };
}

export function createUntrustedEvidenceEnvelope(
  inputs: EvidenceEnvelopeInput[],
  options: { maxLengthPerItem?: number } = {},
): UntrustedEvidenceItem[] {
  return inputs
    .map((input, index) =>
      createUntrustedEvidenceItem(
        {
          ...input,
          evidenceId:
            input.evidenceId ??
            `evidence-${String(index + 1).padStart(3, "0")}`,
        },
        { maxLength: options.maxLengthPerItem },
      ),
    )
    .sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
}

export function formatUntrustedEvidenceForPrompt(
  evidenceItems: UntrustedEvidenceItem[],
): string {
  const orderedItems = [...evidenceItems].sort((a, b) =>
    a.evidenceId.localeCompare(b.evidenceId),
  );

  if (orderedItems.length === 0) {
    return (
      "========== BEGIN UNTRUSTED EVIDENCE ==========" +
      "\nNo user-provided evidence.\n" +
      "========== END UNTRUSTED EVIDENCE =========="
    );
  }

  const formattedItems = orderedItems
    .map((item) =>
      [
        "---------- BEGIN EVIDENCE ITEM ----------",
        `evidenceId: ${item.evidenceId}`,
        `sourceKind: ${item.sourceKind}`,
        `trustLevel: ${item.trustLevel}`,
        `boundedLength: ${item.boundedLength}`,
        "normalizedContent:",
        item.normalizedContent || "[empty evidence item]",
        "---------- END EVIDENCE ITEM ----------",
      ].join("\n"),
    )
    .join("\n\n");

  return [
    "========== BEGIN UNTRUSTED EVIDENCE ==========",
    formattedItems,
    "========== END UNTRUSTED EVIDENCE ==========",
  ].join("\n");
}

function normalizeTrustedIntentField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function normalizeEvidenceId(value: string | undefined): string {
  const normalized = (value || "evidence-001")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "evidence-001";
}

function normalizeEvidenceContent(content: string, maxLength: number): string {
  const escaped = DELIMITER_TOKEN_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    content.trim().replace(/\r\n?/g, "\n"),
  );

  return escaped.length > maxLength ? escaped.slice(0, maxLength) : escaped;
}
