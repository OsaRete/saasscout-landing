import {
  summarizeScanGrounding,
  validateScanGroundedClaim,
  type ScanGroundedClaim,
  type ScanGroundingSummary,
} from "./grounding.ts";

export type ScanOutputErrorCode =
  | "model_schema_validation_failed"
  | "model_output_out_of_range"
  | "model_grounding_missing"
  | "model_grounding_invalid"
  | "model_grounding_unknown_evidence_id"
  | "model_grounding_mismatch";

export type ScanValidationIssue = {
  path: string;
  code: ScanOutputErrorCode;
  message: string;
};

export class ScanOutputValidationError extends Error {
  readonly code: ScanOutputErrorCode;
  readonly issues: readonly ScanValidationIssue[];

  constructor(issues: readonly ScanValidationIssue[]) {
    super("Scan model output failed validation.");
    this.name = "ScanOutputValidationError";
    this.issues = issues;
    this.code = issues.find((issue) => issue.code.startsWith("model_grounding_"))?.code ??
      (issues.some((issue) => issue.code === "model_output_out_of_range")
        ? "model_output_out_of_range"
        : "model_schema_validation_failed");
  }
}

export type AnalyzeEvidenceOutput = {
  inferred_market: string;
  audience_summary: string;
  evidence_summary: string;
  pain_points: string;
  repeated_patterns: string;
  workflow_problems: string;
  willingness_to_pay_signals: string;
  opportunity_angles: string;
  confidence_score: number;
  grounding: AnalyzeEvidenceGrounding;
  groundingSummary: ScanGroundingSummary;
};

export type AnalyzeEvidenceGrounding = {
  inferred_market: ScanGroundedClaim;
  audience_summary: ScanGroundedClaim;
  evidence_summary: ScanGroundedClaim;
  pain_points: readonly ScanGroundedClaim[];
  repeated_patterns: readonly ScanGroundedClaim[];
  workflow_problems: readonly ScanGroundedClaim[];
  willingness_to_pay_signals: readonly ScanGroundedClaim[];
  opportunity_angles: readonly ScanGroundedClaim[];
  confidence_score: ScanGroundedClaim;
};

export type GeneratedOpportunity = {
  title: string;
  score: number;
  pain: string;
  customer: string;
  mvp: string;
  pricing: string;
  difficulty: "Easy" | "Medium" | "Hard";
  problem_summary: string;
  target_customer: string;
  mvp_roadmap: string;
  validation_questions: string;
  landing_page_idea: string;
  acquisition_channels: string;
  grounding: OpportunityGrounding;
};

export type OpportunityGrounding = {
  pain: ScanGroundedClaim;
  customer: ScanGroundedClaim;
  rationale: ScanGroundedClaim;
  mvp: ScanGroundedClaim;
  pricing: ScanGroundedClaim;
  score: ScanGroundedClaim;
  difficulty: ScanGroundedClaim;
};

export type GenerateOpportunitiesOutput = {
  opportunities: GeneratedOpportunity[];
  groundingSummary: ScanGroundingSummary;
};

const ANALYZE_STRING_FIELDS = [
  "inferred_market",
  "audience_summary",
  "evidence_summary",
  "pain_points",
  "repeated_patterns",
  "workflow_problems",
  "willingness_to_pay_signals",
  "opportunity_angles",
] as const;

const OPPORTUNITY_STRING_FIELDS = [
  "title",
  "pain",
  "customer",
  "mvp",
  "pricing",
  "problem_summary",
  "target_customer",
  "mvp_roadmap",
  "validation_questions",
  "landing_page_idea",
  "acquisition_channels",
] as const;

const DIFFICULTIES = new Set(["Easy", "Medium", "Hard"]);
export const SCAN_OUTPUT_SCORE_RANGE = Object.freeze({
  min: 1,
  max: 10,
  interpretation:
    "Scan AI confidence_score and opportunity score are canonical API scores on a 1-10 scale.",
});
const MAX_STRING_LENGTH = 1200;
const MAX_TITLE_LENGTH = 160;
const OPPORTUNITY_COUNT = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(
  path: string,
  code: ScanOutputErrorCode,
  message: string,
): ScanValidationIssue {
  return { path, code, message };
}

function getAllowedEvidenceIds(options?: { evidenceIds?: readonly string[] }) {
  return new Set(options?.evidenceIds?.length ? options.evidenceIds : ["scan-user-evidence"]);
}

function splitLegacyList(value: string) {
  return value.split("|").map((item) => item.trim()).filter(Boolean);
}

function pushGroundingIssues(
  issues: ScanValidationIssue[],
  groundingIssues: ReturnType<typeof validateScanGroundedClaim>["issues"],
) {
  for (const groundingIssue of groundingIssues) {
    issues.push(issue(groundingIssue.path, groundingIssue.code, groundingIssue.message));
  }
}

function requiredGroundedClaim(
  input: unknown,
  path: string,
  allowedEvidenceIds: ReadonlySet<string>,
  issues: ScanValidationIssue[],
) {
  const result = validateScanGroundedClaim(input, { path, allowedEvidenceIds });
  pushGroundingIssues(issues, result.issues);
  return result.claim;
}

function requiredGroundingArray(
  value: Record<string, unknown>,
  key: string,
  expectedCount: number,
  path: string,
  allowedEvidenceIds: ReadonlySet<string>,
  issues: ScanValidationIssue[],
) {
  const raw = value[key];
  const fieldPath = `${path}.${key}`;
  if (!Array.isArray(raw)) {
    issues.push(issue(fieldPath, "model_grounding_missing", "Grounding array is required."));
    return [] as ScanGroundedClaim[];
  }
  if (raw.length !== expectedCount) {
    issues.push(issue(fieldPath, "model_grounding_mismatch", "Grounding array must align with the corresponding claim list."));
  }
  return raw.map((item, index) => requiredGroundedClaim(item, `${fieldPath}.${index}`, allowedEvidenceIds, issues)).filter((item): item is ScanGroundedClaim => Boolean(item));
}

function validateKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ScanValidationIssue[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      issues.push(
        issue(
          path ? `${path}.${key}` : key,
          "model_schema_validation_failed",
          "Unknown field is not allowed.",
        ),
      );
  }
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  maxLength: number,
  path: string,
  issues: ScanValidationIssue[],
) {
  const raw = value[key];
  const fieldPath = path ? `${path}.${key}` : key;
  if (typeof raw !== "string") {
    issues.push(
      issue(
        fieldPath,
        "model_schema_validation_failed",
        "Required field must be a string.",
      ),
    );
    return "";
  }
  const trimmed = raw.trim();
  if (!trimmed)
    issues.push(
      issue(
        fieldPath,
        "model_schema_validation_failed",
        "Required string must be non-empty.",
      ),
    );
  if (trimmed.length > maxLength)
    issues.push(
      issue(
        fieldPath,
        "model_schema_validation_failed",
        "String exceeds maximum length.",
      ),
    );
  return trimmed;
}

function requiredScore(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ScanValidationIssue[],
) {
  const raw = value[key];
  const fieldPath = path ? `${path}.${key}` : key;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    issues.push(
      issue(
        fieldPath,
        "model_schema_validation_failed",
        "Required score must be a finite number.",
      ),
    );
    return 0;
  }
  if (raw < SCAN_OUTPUT_SCORE_RANGE.min || raw > SCAN_OUTPUT_SCORE_RANGE.max) {
    issues.push(
      issue(
        fieldPath,
        "model_output_out_of_range",
        "Score must be between 1 and 10.",
      ),
    );
  }
  return raw;
}

export function validateAnalyzeEvidenceOutput(
  input: unknown,
  options: { evidenceIds?: readonly string[] } = {},
): AnalyzeEvidenceOutput {
  const issues: ScanValidationIssue[] = [];
  if (!isRecord(input))
    throw new ScanOutputValidationError([
      issue(
        "$",
        "model_schema_validation_failed",
        "Root value must be an object.",
      ),
    ]);

  validateKnownKeys(
    input,
    [...ANALYZE_STRING_FIELDS, "confidence_score", "grounding", "groundingSummary"],
    "",
    issues,
  );

  const output = Object.fromEntries(
    ANALYZE_STRING_FIELDS.map((field) => [
      field,
      requiredString(input, field, MAX_STRING_LENGTH, "", issues),
    ]),
  ) as Pick<AnalyzeEvidenceOutput, typeof ANALYZE_STRING_FIELDS[number]>;
  const confidence_score = requiredScore(input, "confidence_score", "", issues);
  const allowedEvidenceIds = getAllowedEvidenceIds(options);
  const rawGrounding = input.grounding;
  let grounding = {} as AnalyzeEvidenceGrounding;
  const groundingClaims: ScanGroundedClaim[] = [];
  if (!isRecord(rawGrounding)) {
    issues.push(issue("grounding", "model_grounding_missing", "Analyze Evidence grounding is required."));
  } else {
    validateKnownKeys(rawGrounding, [...ANALYZE_STRING_FIELDS, "confidence_score"], "grounding", issues);
    const scalarFields = ["inferred_market", "audience_summary", "evidence_summary", "confidence_score"] as const;
    const scalarClaims = Object.fromEntries(scalarFields.map((field) => {
      const claim = requiredGroundedClaim(rawGrounding[field], `grounding.${field}`, allowedEvidenceIds, issues);
      if (claim) groundingClaims.push(claim);
      return [field, claim];
    }));
    const arrays = {
      pain_points: requiredGroundingArray(rawGrounding, "pain_points", splitLegacyList(output.pain_points).length, "grounding", allowedEvidenceIds, issues),
      repeated_patterns: requiredGroundingArray(rawGrounding, "repeated_patterns", splitLegacyList(output.repeated_patterns).length, "grounding", allowedEvidenceIds, issues),
      workflow_problems: requiredGroundingArray(rawGrounding, "workflow_problems", splitLegacyList(output.workflow_problems).length, "grounding", allowedEvidenceIds, issues),
      willingness_to_pay_signals: requiredGroundingArray(rawGrounding, "willingness_to_pay_signals", splitLegacyList(output.willingness_to_pay_signals).length, "grounding", allowedEvidenceIds, issues),
      opportunity_angles: requiredGroundingArray(rawGrounding, "opportunity_angles", splitLegacyList(output.opportunity_angles).length, "grounding", allowedEvidenceIds, issues),
    };
    groundingClaims.push(...Object.values(arrays).flat());
    grounding = Object.freeze({ ...scalarClaims, ...arrays }) as unknown as AnalyzeEvidenceGrounding;
  }

  if (issues.length) throw new ScanOutputValidationError(issues);
  return Object.freeze({ ...output, confidence_score, grounding, groundingSummary: summarizeScanGrounding(groundingClaims, allowedEvidenceIds) });
}

function validateOpportunity(
  input: unknown,
  index: number,
  issues: ScanValidationIssue[],
  allowedEvidenceIds: ReadonlySet<string>,
): GeneratedOpportunity {
  const path = `opportunities.${index}`;
  if (!isRecord(input)) {
    issues.push(
      issue(
        path,
        "model_schema_validation_failed",
        "Opportunity must be an object.",
      ),
    );
    return {} as GeneratedOpportunity;
  }

  validateKnownKeys(
    input,
    [...OPPORTUNITY_STRING_FIELDS, "score", "difficulty", "grounding"],
    path,
    issues,
  );
  const strings = Object.fromEntries(
    OPPORTUNITY_STRING_FIELDS.map((field) => [
      field,
      requiredString(
        input,
        field,
        field === "title" ? MAX_TITLE_LENGTH : MAX_STRING_LENGTH,
        path,
        issues,
      ),
    ]),
  ) as Pick<GeneratedOpportunity, typeof OPPORTUNITY_STRING_FIELDS[number]>;
  const score = requiredScore(input, "score", path, issues);
  const rawDifficulty = input.difficulty;
  if (typeof rawDifficulty !== "string" || !DIFFICULTIES.has(rawDifficulty)) {
    issues.push(
      issue(
        `${path}.difficulty`,
        "model_schema_validation_failed",
        "Difficulty must be Easy, Medium, or Hard.",
      ),
    );
  }

  let grounding = {} as OpportunityGrounding;
  const rawGrounding = input.grounding;
  if (!isRecord(rawGrounding)) {
    issues.push(issue(`${path}.grounding`, "model_grounding_missing", "Opportunity grounding is required."));
  } else {
    const groundingFields = ["pain", "customer", "rationale", "mvp", "pricing", "score", "difficulty"] as const;
    validateKnownKeys(rawGrounding, groundingFields, `${path}.grounding`, issues);
    grounding = Object.freeze(Object.fromEntries(groundingFields.map((field) => [
      field,
      requiredGroundedClaim(rawGrounding[field], `${path}.grounding.${field}`, allowedEvidenceIds, issues),
    ]))) as OpportunityGrounding;
  }

  return {
    ...strings,
    score,
    difficulty: rawDifficulty as GeneratedOpportunity["difficulty"],
    grounding,
  };
}

export function validateGenerateOpportunitiesOutput(
  input: unknown,
  options: { evidenceIds?: readonly string[] } = {},
): GenerateOpportunitiesOutput {
  const issues: ScanValidationIssue[] = [];
  if (!isRecord(input))
    throw new ScanOutputValidationError([
      issue(
        "$",
        "model_schema_validation_failed",
        "Root value must be an object.",
      ),
    ]);

  validateKnownKeys(input, ["opportunities", "groundingSummary"], "", issues);
  if (!Array.isArray(input.opportunities)) {
    throw new ScanOutputValidationError([
      issue(
        "opportunities",
        "model_schema_validation_failed",
        "Required opportunities array is missing or invalid.",
      ),
    ]);
  }

  if (input.opportunities.length !== OPPORTUNITY_COUNT) {
    issues.push(
      issue(
        "opportunities",
        "model_schema_validation_failed",
        "Exactly three opportunities are required.",
      ),
    );
  }

  const allowedEvidenceIds = getAllowedEvidenceIds(options);
  const opportunities = input.opportunities.map((item, index) =>
    validateOpportunity(item, index, issues, allowedEvidenceIds),
  );
  const claims = opportunities.flatMap((opportunity) => Object.values(opportunity.grounding || {}).filter((claim): claim is ScanGroundedClaim => Boolean(claim)));

  if (issues.length) throw new ScanOutputValidationError(issues);
  return Object.freeze({
    opportunities: Object.freeze(
      opportunities.map((item) => Object.freeze(item)),
    ) as GeneratedOpportunity[],
    groundingSummary: summarizeScanGrounding(claims, allowedEvidenceIds),
  });
}
