import "server-only";

export const SCAN_TRUSTED_INTENT_KEYS = ["market", "niche", "audience", "region", "description"] as const;
export type ScanTrustedIntentKey = (typeof SCAN_TRUSTED_INTENT_KEYS)[number];
export type ScanTrustedIntent = Readonly<Partial<Record<ScanTrustedIntentKey, string>>>;

export class ScanTrustedIntentValidationError extends Error {
  readonly code: string; readonly path: string;
  constructor(code = "scan_trusted_intent_invalid", path = "intent") {
    super("Scan trusted intent is invalid.");
    this.name = "ScanTrustedIntentValidationError"; this.code = code; this.path = path;
  }
}

const LIMITS: Record<ScanTrustedIntentKey, number> = { market: 120, niche: 120, audience: 120, region: 80, description: 600 };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function validateScanTrustedIntent(input: unknown): ScanTrustedIntent {
  if (!isPlainRecord(input)) throw new ScanTrustedIntentValidationError("scan_trusted_intent_invalid", "intent");
  const output: Partial<Record<ScanTrustedIntentKey, string>> = {};
  for (const key of Object.keys(input)) {
    if (!SCAN_TRUSTED_INTENT_KEYS.includes(key as ScanTrustedIntentKey)) throw new ScanTrustedIntentValidationError("scan_trusted_intent_invalid", `intent.${key}`);
    const value = input[key];
    if (typeof value !== "string") throw new ScanTrustedIntentValidationError("scan_trusted_intent_invalid", `intent.${key}`);
    if (value !== value.trim() || value.length === 0 || value.length > LIMITS[key as ScanTrustedIntentKey]) throw new ScanTrustedIntentValidationError("scan_trusted_intent_invalid", `intent.${key}`);
    output[key as ScanTrustedIntentKey] = value;
  }
  if (!Object.keys(output).length) throw new ScanTrustedIntentValidationError("scan_trusted_intent_invalid", "intent");
  return Object.freeze(output) as ScanTrustedIntent;
}
