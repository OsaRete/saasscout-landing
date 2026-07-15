export type ScanGroundingMode = "evidence" | "inference";
export type ScanEvidenceReferenceRelevance =
  | "primary"
  | "supporting"
  | "contradicting";

export type ScanEvidenceReference = Readonly<{
  evidenceId: string;
  relevance?: ScanEvidenceReferenceRelevance;
}>;

export type ScanGroundedClaim = Readonly<{
  text: string;
  groundingMode: ScanGroundingMode;
  evidenceRefs: readonly ScanEvidenceReference[];
  inferenceReason?: string;
}>;

export type ScanGroundingSummary = Readonly<{
  totalClaims: number;
  evidenceGroundedClaims: number;
  inferenceClaims: number;
  unsupportedClaims: number;
  groundingCoverage: number;
  distinctEvidenceIdsReferenced: number;
  contradictingReferenceCount: number;
  invalidReferenceCount: number;
}>;

export type ScanGroundingValidationIssue = Readonly<{
  path: string;
  code:
    | "model_grounding_missing"
    | "model_grounding_invalid"
    | "model_grounding_unknown_evidence_id"
    | "model_grounding_mismatch";
  message: string;
}>;

export const SCAN_GROUNDED_CLAIM_MAX_LENGTH = 1200;
export const SCAN_INFERENCE_REASON_MAX_LENGTH = 280;

const RELEVANCE_VALUES = new Set<ScanEvidenceReferenceRelevance>([
  "primary",
  "supporting",
  "contradicting",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function groundingIssue(
  path: string,
  code: ScanGroundingValidationIssue["code"],
  message: string,
): ScanGroundingValidationIssue {
  return Object.freeze({ path, code, message });
}

function validateKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ScanGroundingValidationIssue[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push(
        groundingIssue(
          path ? `${path}.${key}` : key,
          "model_grounding_invalid",
          "Unknown grounding field is not allowed.",
        ),
      );
    }
  }
}

export function validateScanGroundedClaim(
  input: unknown,
  options: { allowedEvidenceIds: ReadonlySet<string>; path: string },
): { claim: ScanGroundedClaim | null; issues: readonly ScanGroundingValidationIssue[] } {
  const issues: ScanGroundingValidationIssue[] = [];
  const path = options.path;

  if (!isRecord(input)) {
    return {
      claim: null,
      issues: [
        groundingIssue(path, "model_grounding_missing", "Grounded claim is required."),
      ],
    };
  }

  validateKnownKeys(
    input,
    ["text", "groundingMode", "evidenceRefs", "inferenceReason"],
    path,
    issues,
  );

  const rawText = input.text;
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text || text.length > SCAN_GROUNDED_CLAIM_MAX_LENGTH) {
    issues.push(
      groundingIssue(
        `${path}.text`,
        "model_grounding_invalid",
        "Claim text must be non-empty and bounded.",
      ),
    );
  }

  const groundingMode = input.groundingMode;
  if (groundingMode !== "evidence" && groundingMode !== "inference") {
    issues.push(
      groundingIssue(
        `${path}.groundingMode`,
        "model_grounding_invalid",
        "Grounding mode must be evidence or inference.",
      ),
    );
  }

  const evidenceRefs: ScanEvidenceReference[] = [];
  const seenRefs = new Set<string>();
  if (!Array.isArray(input.evidenceRefs)) {
    issues.push(
      groundingIssue(
        `${path}.evidenceRefs`,
        "model_grounding_invalid",
        "Evidence references must be an array.",
      ),
    );
  } else {
    input.evidenceRefs.forEach((ref, index) => {
      const refPath = `${path}.evidenceRefs.${index}`;
      if (!isRecord(ref)) {
        issues.push(
          groundingIssue(refPath, "model_grounding_invalid", "Evidence reference must be an object."),
        );
        return;
      }
      validateKnownKeys(ref, ["evidenceId", "relevance"], refPath, issues);
      const evidenceId = typeof ref.evidenceId === "string" ? ref.evidenceId.trim() : "";
      if (!evidenceId) {
        issues.push(groundingIssue(`${refPath}.evidenceId`, "model_grounding_invalid", "Evidence ID is required."));
        return;
      }
      if (!options.allowedEvidenceIds.has(evidenceId)) {
        issues.push(groundingIssue(`${refPath}.evidenceId`, "model_grounding_unknown_evidence_id", "Evidence reference must point to the current evidence envelope."));
      }
      if (seenRefs.has(evidenceId)) {
        issues.push(groundingIssue(`${refPath}.evidenceId`, "model_grounding_invalid", "Duplicate evidence references are not allowed."));
      }
      seenRefs.add(evidenceId);
      const relevance = ref.relevance;
      if (relevance !== undefined && !RELEVANCE_VALUES.has(relevance as ScanEvidenceReferenceRelevance)) {
        issues.push(groundingIssue(`${refPath}.relevance`, "model_grounding_invalid", "Evidence relevance is invalid."));
      }
      evidenceRefs.push(Object.freeze({ evidenceId, ...(relevance ? { relevance: relevance as ScanEvidenceReferenceRelevance } : {}) }));
    });
  }

  const inferenceReason = typeof input.inferenceReason === "string" ? input.inferenceReason.trim() : undefined;
  if (groundingMode === "evidence" && evidenceRefs.length === 0) {
    issues.push(groundingIssue(`${path}.evidenceRefs`, "model_grounding_missing", "Evidence-grounded claims require at least one evidence reference."));
  }
  if (groundingMode === "inference") {
    if (evidenceRefs.length > 0) {
      issues.push(groundingIssue(`${path}.evidenceRefs`, "model_grounding_invalid", "Inference claims must not include evidence references."));
    }
    if (!inferenceReason || inferenceReason.length > SCAN_INFERENCE_REASON_MAX_LENGTH) {
      issues.push(groundingIssue(`${path}.inferenceReason`, "model_grounding_missing", "Inference claims require a short reason."));
    }
  }

  if (issues.length) return { claim: null, issues };
  return {
    claim: Object.freeze({
      text,
      groundingMode: groundingMode as ScanGroundingMode,
      evidenceRefs: Object.freeze(evidenceRefs),
      ...(inferenceReason ? { inferenceReason } : {}),
    }),
    issues,
  };
}

export function summarizeScanGrounding(
  claims: readonly ScanGroundedClaim[],
  allowedEvidenceIds: ReadonlySet<string>,
): ScanGroundingSummary {
  const referenced = new Set<string>();
  let contradictingReferenceCount = 0;
  let invalidReferenceCount = 0;
  let evidenceGroundedClaims = 0;
  let inferenceClaims = 0;

  for (const claim of claims) {
    if (claim.groundingMode === "evidence") evidenceGroundedClaims += 1;
    if (claim.groundingMode === "inference") inferenceClaims += 1;
    for (const ref of claim.evidenceRefs) {
      referenced.add(ref.evidenceId);
      if (ref.relevance === "contradicting") contradictingReferenceCount += 1;
      if (!allowedEvidenceIds.has(ref.evidenceId)) invalidReferenceCount += 1;
    }
  }

  const totalClaims = claims.length;
  return Object.freeze({
    totalClaims,
    evidenceGroundedClaims,
    inferenceClaims,
    unsupportedClaims: Math.max(0, totalClaims - evidenceGroundedClaims - inferenceClaims),
    groundingCoverage: totalClaims === 0 ? 0 : evidenceGroundedClaims / totalClaims,
    distinctEvidenceIdsReferenced: referenced.size,
    contradictingReferenceCount,
    invalidReferenceCount,
  });
}
