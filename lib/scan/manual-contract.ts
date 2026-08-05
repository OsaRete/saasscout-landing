export const SCAN_MANUAL_CONTRACT_VERSION = "scan-manual-contract@1" as const;
export const SCAN_MANUAL_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const SCAN_MANUAL_MAX_FILE_COUNT = 1;
export const SCAN_MANUAL_MIN_PASTED_EVIDENCE_CHARACTERS = 20;
export const SCAN_MANUAL_FILE_FIELD = "files" as const;
export const SCAN_MANUAL_SUPPORTED_EXTENSIONS = [".txt", ".pdf", ".docx"] as const;
export const SCAN_MANUAL_SUPPORTED_MIME_PREFIXES = ["text/plain", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;

export type ScanManualIntentInput = Readonly<{ market?: string | null; niche?: string | null; audience?: string | null; region?: string | null; description?: string | null }>;
export type ScanManualLegacyContextInput = Readonly<{ sourceProblemTitle?: string | null; sourceProblemId?: string | null; sourceDiscoveryId?: string | null }>;

function normalizeText(value: string | null | undefined, max: number) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
  return normalized || undefined;
}

export function normalizeScanManualIntent(input: ScanManualIntentInput) {
  const market = normalizeText(input.market ?? input.niche, 120);
  const audience = normalizeText(input.audience, 120);
  const region = normalizeText(input.region, 80);
  const description = normalizeText(input.description, 600);
  return Object.freeze({ ...(market ? { market } : {}), ...(audience ? { audience } : {}), ...(region ? { region } : {}), ...(description ? { description } : {}) });
}

export function normalizeScanManualLegacyContext(input: ScanManualLegacyContextInput) {
  const sourceProblemTitle = normalizeText(input.sourceProblemTitle, 200);
  const sourceProblemId = normalizeText(input.sourceProblemId, 120);
  const sourceDiscoveryId = normalizeText(input.sourceDiscoveryId, 120);
  const normalized = { ...(sourceProblemTitle ? { sourceProblemTitle } : {}), ...(sourceProblemId ? { sourceProblemId } : {}), ...(sourceDiscoveryId ? { sourceDiscoveryId } : {}) };
  return Object.keys(normalized).length > 0 ? Object.freeze(normalized) : undefined;
}

export function getScanManualFileExtension(name: string) {
  const lower = name.toLowerCase();
  return SCAN_MANUAL_SUPPORTED_EXTENSIONS.find((extension) => lower.endsWith(extension));
}

export function classifyScanManualFile(file: Pick<File, "name" | "type" | "size">): "ok" | "scan_manual_file_empty" | "scan_manual_file_unsupported" | "scan_manual_file_too_large" {
  if (file.size <= 0) return "scan_manual_file_empty";
  if (!getScanManualFileExtension(file.name)) return "scan_manual_file_unsupported";
  if (file.size > SCAN_MANUAL_MAX_FILE_SIZE_BYTES) return "scan_manual_file_too_large";
  return "ok";
}

export function hasUsefulManualEvidence(input: { pastedEvidence?: string | null; file?: Pick<File, "name" | "type" | "size"> | null }) {
  return String(input.pastedEvidence || "").trim().length >= SCAN_MANUAL_MIN_PASTED_EVIDENCE_CHARACTERS || Boolean(input.file && classifyScanManualFile(input.file) === "ok");
}
