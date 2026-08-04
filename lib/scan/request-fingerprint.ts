import "server-only";

import { createHash } from "node:crypto";
import type { ScanWorkflowInput } from "./workflow.ts";

export const SCAN_REQUEST_FINGERPRINT_VERSION = "scan-request@1" as const;

function normalize(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase("en-US") || null;
}

function digest(value: string | ArrayBuffer | Uint8Array) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizedItems(items: ScanWorkflowInput["externalSnippets"] | ScanWorkflowInput["discoverContext"]) {
  return (items ?? []).map((item) => ({ title: normalize(item.title), content: normalize(item.content) }));
}

/** Builds the authoritative identity only after the server has parsed all evidence. */
export function buildScanRequestFingerprint(userId: string, input: ScanWorkflowInput) {
  const canonical = {
    version: SCAN_REQUEST_FINGERPRINT_VERSION,
    userId,
    intent: {
      market: normalize(input.intent.market),
      niche: normalize(input.intent.niche),
      audience: normalize(input.intent.audience),
      region: normalize(input.intent.region),
      description: normalize(input.intent.description),
    },
    pastedEvidence: normalize(input.pastedEvidence),
    // Names and MIME labels are presentation metadata. Content owns document identity.
    uploadedContentHashes: (input.files ?? []).map((file) => digest(file.bytes)).sort(),
    externalSnippets: normalizedItems(input.externalSnippets),
    discoverContext: normalizedItems(input.discoverContext),
  };

  return Object.freeze({ version: SCAN_REQUEST_FINGERPRINT_VERSION, fingerprint: digest(JSON.stringify(canonical)) });
}
