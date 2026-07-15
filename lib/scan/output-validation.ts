export type ScanOutputErrorCode =
  "model_schema_validation_failed" | "model_output_out_of_range";

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
    this.code = issues.some(
      (issue) => issue.code === "model_output_out_of_range",
    )
      ? "model_output_out_of_range"
      : "model_schema_validation_failed";
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
};

export type GenerateOpportunitiesOutput = {
  opportunities: GeneratedOpportunity[];
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
    [...ANALYZE_STRING_FIELDS, "confidence_score"],
    "",
    issues,
  );

  const output = Object.fromEntries(
    ANALYZE_STRING_FIELDS.map((field) => [
      field,
      requiredString(input, field, MAX_STRING_LENGTH, "", issues),
    ]),
  ) as Omit<AnalyzeEvidenceOutput, "confidence_score">;
  const confidence_score = requiredScore(input, "confidence_score", "", issues);

  if (issues.length) throw new ScanOutputValidationError(issues);
  return Object.freeze({ ...output, confidence_score });
}

function validateOpportunity(
  input: unknown,
  index: number,
  issues: ScanValidationIssue[],
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
    [...OPPORTUNITY_STRING_FIELDS, "score", "difficulty"],
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
  ) as Omit<GeneratedOpportunity, "score" | "difficulty">;
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

  return {
    ...strings,
    score,
    difficulty: rawDifficulty as GeneratedOpportunity["difficulty"],
  };
}

export function validateGenerateOpportunitiesOutput(
  input: unknown,
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

  validateKnownKeys(input, ["opportunities"], "", issues);
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

  const opportunities = input.opportunities.map((item, index) =>
    validateOpportunity(item, index, issues),
  );

  if (issues.length) throw new ScanOutputValidationError(issues);
  return Object.freeze({
    opportunities: Object.freeze(
      opportunities.map((item) => Object.freeze(item)),
    ) as GeneratedOpportunity[],
  });
}
