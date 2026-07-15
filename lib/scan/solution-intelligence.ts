import {
  summarizeScanGrounding,
  validateScanGroundedClaim,
  type ScanEvidenceReference,
  type ScanGroundedClaim,
  type ScanGroundingSummary,
} from "./grounding.ts";

export const SOLUTION_INTELLIGENCE_VERSION =
  "scan-solution-intelligence@1" as const;
export const SOLUTION_CATEGORIES = [
  "software_product",
  "ai_enabled_software",
  "automation",
  "api_or_infrastructure",
  "productized_service",
  "consulting",
  "managed_service",
  "marketplace",
  "education_or_training",
  "physical_product",
  "operational_process",
  "data_product",
  "community",
  "hybrid_solution",
  "validate_first",
  "no_build_recommended",
] as const;
export type SolutionCategory = (typeof SOLUTION_CATEGORIES)[number];
export type SolutionSuitabilityBand =
  "poor" | "weak" | "possible" | "strong" | "best_fit";
export type ExistingAlternativeType =
  | "direct_competitor"
  | "manual_workaround"
  | "service"
  | "spreadsheet"
  | "generic_tool"
  | "doing_nothing"
  | "category_level_alternative";
export type EvidenceCoverage = "none" | "limited" | "moderate" | "strong";
export type InnovationMode =
  | "incremental_improvement"
  | "workflow_combination"
  | "delivery_model_change"
  | "automation_of_validated_process"
  | "new_market_application"
  | "unproven_concept"
  | "no_innovation_needed";
export type NoveltyRisk = "low" | "moderate" | "high";
export type ValidationReadiness =
  | "not_ready"
  | "problem_validation_ready"
  | "solution_validation_ready"
  | "demand_test_ready";
export type CheapestNextTest =
  | "customer_interviews"
  | "email_outreach"
  | "survey"
  | "landing_page"
  | "waitlist"
  | "social_post"
  | "community_post"
  | "concierge_test"
  | "manual_service_pilot"
  | "prototype_test"
  | "pricing_test"
  | "competitor_research"
  | "additional_evidence_collection";

export type SolutionCategoryAssessment = Readonly<{
  category: SolutionCategory;
  suitability: number;
  suitabilityBand: SolutionSuitabilityBand;
  rationale: ScanGroundedClaim;
  advantages: readonly ScanGroundedClaim[];
  limitations: readonly ScanGroundedClaim[];
  prerequisites: readonly ScanGroundedClaim[];
}>;
export type ExistingAlternative = Readonly<{
  nameOrCategory: string;
  alternativeType: ExistingAlternativeType;
  observedStrengths: readonly ScanGroundedClaim[];
  observedWeaknesses: readonly ScanGroundedClaim[];
  evidenceRefs: readonly ScanEvidenceReference[];
}>;
export type ExistingSolutionAssessment = Readonly<{
  knownAlternatives: readonly ExistingAlternative[];
  evidenceCoverage: EvidenceCoverage;
  whatAppearsValidated: readonly ScanGroundedClaim[];
  whatAppearsPoorlySolved: readonly ScanGroundedClaim[];
  replacementRisk: ScanGroundedClaim;
}>;
export type InnovationAssessment = Readonly<{
  innovationMode: InnovationMode;
  verifiedFoundation: readonly ScanGroundedClaim[];
  proposedDifferentiation: readonly ScanGroundedClaim[];
  unverifiedAssumptions: readonly ScanGroundedClaim[];
  feasibilityConstraints: readonly ScanGroundedClaim[];
  noveltyRisk: NoveltyRisk;
}>;
export type ValidationReadinessAssessment = Readonly<{
  readiness: ValidationReadiness;
  knownFacts: readonly ScanGroundedClaim[];
  criticalUnknowns: readonly ScanGroundedClaim[];
  cheapestNextTest: CheapestNextTest;
  testRationale: ScanGroundedClaim;
  successSignal: ScanGroundedClaim;
  failureSignal: ScanGroundedClaim;
}>;
export type SolutionIntelligenceResult = Readonly<{
  version: typeof SOLUTION_INTELLIGENCE_VERSION;
  problemFraming: ScanGroundedClaim;
  evaluatedCategories: readonly SolutionCategoryAssessment[];
  recommendedCategory: SolutionCategory;
  secondaryCategory?: SolutionCategory;
  recommendation: ScanGroundedClaim;
  existingSolutionAssessment: ExistingSolutionAssessment;
  innovationAssessment: InnovationAssessment;
  validationReadiness: ValidationReadinessAssessment;
  keyAssumptions: readonly ScanGroundedClaim[];
  risks: readonly ScanGroundedClaim[];
  nextValidationAction: ScanGroundedClaim;
  groundingSummary: ScanGroundingSummary;
}>;
export type SolutionIntelligenceErrorCode =
  | "solution_model_schema_validation_failed"
  | "solution_model_output_out_of_range"
  | "solution_model_grounding_missing"
  | "solution_model_grounding_invalid"
  | "solution_model_grounding_unknown_evidence_id"
  | "solution_model_grounding_mismatch";
export type SolutionIntelligenceIssue = Readonly<{
  path: string;
  code: SolutionIntelligenceErrorCode;
  message: string;
}>;
export class SolutionIntelligenceValidationError extends Error {
  readonly code: SolutionIntelligenceErrorCode;
  readonly issues: readonly SolutionIntelligenceIssue[];
  constructor(issues: readonly SolutionIntelligenceIssue[]) {
    super("Solution Intelligence model output failed validation.");
    this.name = "SolutionIntelligenceValidationError";
    this.issues = issues;
    this.code =
      issues.find((i) => i.code.includes("grounding"))?.code ??
      (issues.some((i) => i.code === "solution_model_output_out_of_range")
        ? "solution_model_output_out_of_range"
        : "solution_model_schema_validation_failed");
  }
}

const categorySet = new Set<string>(SOLUTION_CATEGORIES);
const buildCategories = new Set<SolutionCategory>([
  "software_product",
  "ai_enabled_software",
  "automation",
  "api_or_infrastructure",
  "marketplace",
  "data_product",
  "physical_product",
  "hybrid_solution",
]);
const serviceCategories = new Set<SolutionCategory>([
  "productized_service",
  "consulting",
  "managed_service",
  "operational_process",
  "education_or_training",
  "community",
  "hybrid_solution",
]);
const bands = new Set(["poor", "weak", "possible", "strong", "best_fit"]);
const coverages = new Set(["none", "limited", "moderate", "strong"]);
const altTypes = new Set([
  "direct_competitor",
  "manual_workaround",
  "service",
  "spreadsheet",
  "generic_tool",
  "doing_nothing",
  "category_level_alternative",
]);
const innovationModes = new Set([
  "incremental_improvement",
  "workflow_combination",
  "delivery_model_change",
  "automation_of_validated_process",
  "new_market_application",
  "unproven_concept",
  "no_innovation_needed",
]);
const noveltyRisks = new Set(["low", "moderate", "high"]);
const readiness = new Set([
  "not_ready",
  "problem_validation_ready",
  "solution_validation_ready",
  "demand_test_ready",
]);
const tests = new Set([
  "customer_interviews",
  "email_outreach",
  "survey",
  "landing_page",
  "waitlist",
  "social_post",
  "community_post",
  "concierge_test",
  "manual_service_pilot",
  "prototype_test",
  "pricing_test",
  "competitor_research",
  "additional_evidence_collection",
]);
const MAX_STRING = 240;
const MAX_CATEGORIES = 8;
const MAX_CLAIMS = 8;
const MAX_ALTS = 6;
function rec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function issue(
  path: string,
  code: SolutionIntelligenceErrorCode,
  message: string,
): SolutionIntelligenceIssue {
  return Object.freeze({ path, code, message });
}
function keys(
  v: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: SolutionIntelligenceIssue[],
) {
  for (const k of Object.keys(v))
    if (!allowed.includes(k))
      issues.push(
        issue(
          path ? `${path}.${k}` : k,
          "solution_model_schema_validation_failed",
          "Unknown field is not allowed.",
        ),
      );
}
function str(
  v: Record<string, unknown>,
  k: string,
  path: string,
  issues: SolutionIntelligenceIssue[],
  max = MAX_STRING,
) {
  const raw = v[k];
  const p = path ? `${path}.${k}` : k;
  if (typeof raw !== "string" || !raw.trim() || raw.trim().length > max) {
    issues.push(
      issue(
        p,
        "solution_model_schema_validation_failed",
        "String must be non-empty and bounded.",
      ),
    );
    return "";
  }
  return raw.trim();
}
function enumv<T extends string>(
  raw: unknown,
  vals: ReadonlySet<string>,
  p: string,
  issues: SolutionIntelligenceIssue[],
): T {
  if (typeof raw !== "string" || !vals.has(raw))
    issues.push(
      issue(
        p,
        "solution_model_schema_validation_failed",
        "Enum value is invalid.",
      ),
    );
  return raw as T;
}
function refs(
  raw: unknown,
  p: string,
  allowed: ReadonlySet<string>,
  issues: SolutionIntelligenceIssue[],
) {
  const out: ScanEvidenceReference[] = [];
  if (!Array.isArray(raw)) {
    issues.push(
      issue(
        p,
        "solution_model_grounding_invalid",
        "Evidence refs must be an array.",
      ),
    );
    return out;
  }
  for (const [i, r] of raw.entries()) {
    if (!rec(r)) {
      issues.push(
        issue(
          `${p}.${i}`,
          "solution_model_grounding_invalid",
          "Evidence ref must be an object.",
        ),
      );
      continue;
    }
    keys(r, ["evidenceId", "relevance"], `${p}.${i}`, issues);
    const id = typeof r.evidenceId === "string" ? r.evidenceId.trim() : "";
    if (!id || !allowed.has(id))
      issues.push(
        issue(
          `${p}.${i}.evidenceId`,
          "solution_model_grounding_unknown_evidence_id",
          "Evidence ID is not allowed.",
        ),
      );
    out.push(
      Object.freeze({
        evidenceId: id,
        ...(r.relevance
          ? { relevance: r.relevance as ScanEvidenceReference["relevance"] }
          : {}),
      }),
    );
  }
  return out;
}
function claim(
  raw: unknown,
  p: string,
  allowed: ReadonlySet<string>,
  issues: SolutionIntelligenceIssue[],
) {
  const res = validateScanGroundedClaim(raw, {
    path: p,
    allowedEvidenceIds: allowed,
  });
  for (const gi of res.issues)
    issues.push(
      issue(
        gi.path,
        gi.code.replace(
          "model_",
          "solution_model_",
        ) as SolutionIntelligenceErrorCode,
        gi.message,
      ),
    );
  return res.claim;
}
function claimArr(
  v: Record<string, unknown>,
  k: string,
  p: string,
  allowed: ReadonlySet<string>,
  issues: SolutionIntelligenceIssue[],
  min = 0,
) {
  const raw = v[k];
  const fp = `${p}.${k}`;
  if (!Array.isArray(raw) || raw.length < min || raw.length > MAX_CLAIMS) {
    issues.push(
      issue(
        fp,
        "solution_model_schema_validation_failed",
        "Claim array size is invalid.",
      ),
    );
    return [] as ScanGroundedClaim[];
  }
  return raw
    .map((x, i) => claim(x, `${fp}.${i}`, allowed, issues))
    .filter(Boolean) as ScanGroundedClaim[];
}
function assess(
  raw: unknown,
  i: number,
  allowed: ReadonlySet<string>,
  issues: SolutionIntelligenceIssue[],
) {
  const p = `evaluatedCategories.${i}`;
  if (!rec(raw)) {
    issues.push(
      issue(
        p,
        "solution_model_schema_validation_failed",
        "Assessment must be an object.",
      ),
    );
    return {} as SolutionCategoryAssessment;
  }
  keys(
    raw,
    [
      "category",
      "suitability",
      "suitabilityBand",
      "rationale",
      "advantages",
      "limitations",
      "prerequisites",
    ],
    p,
    issues,
  );
  const category = enumv<SolutionCategory>(
    raw.category,
    categorySet,
    `${p}.category`,
    issues,
  );
  const suitability =
    typeof raw.suitability === "number" && Number.isFinite(raw.suitability)
      ? raw.suitability
      : NaN;
  if (!Number.isFinite(suitability) || suitability < 0 || suitability > 1)
    issues.push(
      issue(
        `${p}.suitability`,
        "solution_model_output_out_of_range",
        "Suitability must be finite on a 0-1 scale.",
      ),
    );
  return Object.freeze({
    category,
    suitability,
    suitabilityBand: enumv<SolutionSuitabilityBand>(
      raw.suitabilityBand,
      bands,
      `${p}.suitabilityBand`,
      issues,
    ),
    rationale: claim(raw.rationale, `${p}.rationale`, allowed, issues)!,
    advantages: claimArr(raw, "advantages", p, allowed, issues),
    limitations: claimArr(raw, "limitations", p, allowed, issues),
    prerequisites: claimArr(raw, "prerequisites", p, allowed, issues),
  });
}
function existing(
  raw: unknown,
  allowed: ReadonlySet<string>,
  issues: SolutionIntelligenceIssue[],
) {
  const p = "existingSolutionAssessment";
  if (!rec(raw)) {
    issues.push(
      issue(
        p,
        "solution_model_schema_validation_failed",
        "Existing solution assessment is required.",
      ),
    );
    return {} as ExistingSolutionAssessment;
  }
  keys(
    raw,
    [
      "knownAlternatives",
      "evidenceCoverage",
      "whatAppearsValidated",
      "whatAppearsPoorlySolved",
      "replacementRisk",
    ],
    p,
    issues,
  );
  const known =
    Array.isArray(raw.knownAlternatives) &&
    raw.knownAlternatives.length <= MAX_ALTS
      ? raw.knownAlternatives.map((a, i) => {
          const ap = `${p}.knownAlternatives.${i}`;
          if (!rec(a)) {
            issues.push(
              issue(
                ap,
                "solution_model_schema_validation_failed",
                "Alternative must be an object.",
              ),
            );
            return {} as ExistingAlternative;
          }
          keys(
            a,
            [
              "nameOrCategory",
              "alternativeType",
              "observedStrengths",
              "observedWeaknesses",
              "evidenceRefs",
            ],
            ap,
            issues,
          );
          const alternativeType = enumv<ExistingAlternativeType>(
            a.alternativeType,
            altTypes,
            `${ap}.alternativeType`,
            issues,
          );
          const evidenceRefs = refs(
            a.evidenceRefs,
            `${ap}.evidenceRefs`,
            allowed,
            issues,
          );
          const nameOrCategory = str(a, "nameOrCategory", ap, issues);
          if (
            alternativeType === "direct_competitor" &&
            evidenceRefs.length === 0
          )
            issues.push(
              issue(
                `${ap}.evidenceRefs`,
                "solution_model_grounding_missing",
                "Named direct competitors require evidence.",
              ),
            );
          return Object.freeze({
            nameOrCategory,
            alternativeType,
            observedStrengths: claimArr(
              a,
              "observedStrengths",
              ap,
              allowed,
              issues,
            ),
            observedWeaknesses: claimArr(
              a,
              "observedWeaknesses",
              ap,
              allowed,
              issues,
            ),
            evidenceRefs,
          });
        })
      : (issues.push(
          issue(
            `${p}.knownAlternatives`,
            "solution_model_schema_validation_failed",
            "Known alternatives array is invalid.",
          ),
        ),
        []);
  return Object.freeze({
    knownAlternatives: known,
    evidenceCoverage: enumv<EvidenceCoverage>(
      raw.evidenceCoverage,
      coverages,
      `${p}.evidenceCoverage`,
      issues,
    ),
    whatAppearsValidated: claimArr(
      raw,
      "whatAppearsValidated",
      p,
      allowed,
      issues,
    ),
    whatAppearsPoorlySolved: claimArr(
      raw,
      "whatAppearsPoorlySolved",
      p,
      allowed,
      issues,
    ),
    replacementRisk: claim(
      raw.replacementRisk,
      `${p}.replacementRisk`,
      allowed,
      issues,
    )!,
  });
}
function innovation(
  raw: unknown,
  allowed: ReadonlySet<string>,
  issues: SolutionIntelligenceIssue[],
) {
  const p = "innovationAssessment";
  if (!rec(raw)) {
    issues.push(
      issue(
        p,
        "solution_model_schema_validation_failed",
        "Innovation assessment is required.",
      ),
    );
    return {} as InnovationAssessment;
  }
  keys(
    raw,
    [
      "innovationMode",
      "verifiedFoundation",
      "proposedDifferentiation",
      "unverifiedAssumptions",
      "feasibilityConstraints",
      "noveltyRisk",
    ],
    p,
    issues,
  );
  const mode = enumv<InnovationMode>(
    raw.innovationMode,
    innovationModes,
    `${p}.innovationMode`,
    issues,
  );
  const vf = claimArr(raw, "verifiedFoundation", p, allowed, issues);
  const assumptions = claimArr(
    raw,
    "unverifiedAssumptions",
    p,
    allowed,
    issues,
    mode === "unproven_concept" ? 1 : 0,
  );
  if (
    mode !== "unproven_concept" &&
    mode !== "no_innovation_needed" &&
    vf.length === 0
  )
    issues.push(
      issue(
        `${p}.verifiedFoundation`,
        "solution_model_grounding_missing",
        "Innovation requires a verified foundation unless classified as unproven or no innovation needed.",
      ),
    );
  return Object.freeze({
    innovationMode: mode,
    verifiedFoundation: vf,
    proposedDifferentiation: claimArr(
      raw,
      "proposedDifferentiation",
      p,
      allowed,
      issues,
    ),
    unverifiedAssumptions: assumptions,
    feasibilityConstraints: claimArr(
      raw,
      "feasibilityConstraints",
      p,
      allowed,
      issues,
    ),
    noveltyRisk: enumv<NoveltyRisk>(
      raw.noveltyRisk,
      noveltyRisks,
      `${p}.noveltyRisk`,
      issues,
    ),
  });
}
function validation(
  raw: unknown,
  allowed: ReadonlySet<string>,
  issues: SolutionIntelligenceIssue[],
) {
  const p = "validationReadiness";
  if (!rec(raw)) {
    issues.push(
      issue(
        p,
        "solution_model_schema_validation_failed",
        "Validation readiness is required.",
      ),
    );
    return {} as ValidationReadinessAssessment;
  }
  keys(
    raw,
    [
      "readiness",
      "knownFacts",
      "criticalUnknowns",
      "cheapestNextTest",
      "testRationale",
      "successSignal",
      "failureSignal",
    ],
    p,
    issues,
  );
  return Object.freeze({
    readiness: enumv<ValidationReadiness>(
      raw.readiness,
      readiness,
      `${p}.readiness`,
      issues,
    ),
    knownFacts: claimArr(raw, "knownFacts", p, allowed, issues),
    criticalUnknowns: claimArr(raw, "criticalUnknowns", p, allowed, issues),
    cheapestNextTest: enumv<CheapestNextTest>(
      raw.cheapestNextTest,
      tests,
      `${p}.cheapestNextTest`,
      issues,
    ),
    testRationale: claim(
      raw.testRationale,
      `${p}.testRationale`,
      allowed,
      issues,
    )!,
    successSignal: claim(
      raw.successSignal,
      `${p}.successSignal`,
      allowed,
      issues,
    )!,
    failureSignal: claim(
      raw.failureSignal,
      `${p}.failureSignal`,
      allowed,
      issues,
    )!,
  });
}
function collect(r: SolutionIntelligenceResult) {
  return [
    r.problemFraming,
    r.recommendation,
    r.nextValidationAction,
    ...r.keyAssumptions,
    ...r.risks,
    ...r.evaluatedCategories.flatMap((c) => [
      c.rationale,
      ...c.advantages,
      ...c.limitations,
      ...c.prerequisites,
    ]),
    ...r.existingSolutionAssessment.knownAlternatives.flatMap((a) => [
      ...a.observedStrengths,
      ...a.observedWeaknesses,
    ]),
    ...r.existingSolutionAssessment.whatAppearsValidated,
    ...r.existingSolutionAssessment.whatAppearsPoorlySolved,
    r.existingSolutionAssessment.replacementRisk,
    ...r.innovationAssessment.verifiedFoundation,
    ...r.innovationAssessment.proposedDifferentiation,
    ...r.innovationAssessment.unverifiedAssumptions,
    ...r.innovationAssessment.feasibilityConstraints,
    ...r.validationReadiness.knownFacts,
    ...r.validationReadiness.criticalUnknowns,
    r.validationReadiness.testRationale,
    r.validationReadiness.successSignal,
    r.validationReadiness.failureSignal,
  ].filter(Boolean);
}
export function validateSolutionIntelligenceOutput(
  input: unknown,
  options: { evidenceIds?: readonly string[] } = {},
): SolutionIntelligenceResult {
  const issues: SolutionIntelligenceIssue[] = [];
  if (!rec(input))
    throw new SolutionIntelligenceValidationError([
      issue(
        "$",
        "solution_model_schema_validation_failed",
        "Root value must be an object.",
      ),
    ]);
  keys(
    input,
    [
      "version",
      "problemFraming",
      "evaluatedCategories",
      "recommendedCategory",
      "secondaryCategory",
      "recommendation",
      "existingSolutionAssessment",
      "innovationAssessment",
      "validationReadiness",
      "keyAssumptions",
      "risks",
      "nextValidationAction",
      "groundingSummary",
    ],
    "",
    issues,
  );
  if (input.version !== SOLUTION_INTELLIGENCE_VERSION)
    issues.push(
      issue(
        "version",
        "solution_model_schema_validation_failed",
        "Version is invalid.",
      ),
    );
  const allowed = new Set(
    options.evidenceIds?.length ? options.evidenceIds : ["scan-user-evidence"],
  );
  if (
    !Array.isArray(input.evaluatedCategories) ||
    input.evaluatedCategories.length < 3 ||
    input.evaluatedCategories.length > MAX_CATEGORIES
  )
    issues.push(
      issue(
        "evaluatedCategories",
        "solution_model_schema_validation_failed",
        "Evaluate 3 to 8 categories.",
      ),
    );
  const evaluated = Array.isArray(input.evaluatedCategories)
    ? input.evaluatedCategories.map((x, i) => assess(x, i, allowed, issues))
    : [];
  const cats = evaluated.map((x) => x.category).filter(Boolean);
  if (new Set(cats).size !== cats.length)
    issues.push(
      issue(
        "evaluatedCategories",
        "solution_model_schema_validation_failed",
        "Duplicate category assessments are not allowed.",
      ),
    );
  if (!cats.some((c) => buildCategories.has(c)))
    issues.push(
      issue(
        "evaluatedCategories",
        "solution_model_schema_validation_failed",
        "At least one build-oriented category is required.",
      ),
    );
  if (!cats.some((c) => serviceCategories.has(c)))
    issues.push(
      issue(
        "evaluatedCategories",
        "solution_model_schema_validation_failed",
        "At least one service/process-oriented category is required.",
      ),
    );
  if (
    !cats.includes("validate_first") &&
    !cats.includes("no_build_recommended")
  )
    issues.push(
      issue(
        "evaluatedCategories",
        "solution_model_schema_validation_failed",
        "Validate-first or no-build must be considered.",
      ),
    );
  const recommended = enumv<SolutionCategory>(
    input.recommendedCategory,
    categorySet,
    "recommendedCategory",
    issues,
  );
  if (recommended && !cats.includes(recommended))
    issues.push(
      issue(
        "recommendedCategory",
        "solution_model_schema_validation_failed",
        "Recommended category must be evaluated.",
      ),
    );
  const secondary =
    input.secondaryCategory === undefined
      ? undefined
      : enumv<SolutionCategory>(
          input.secondaryCategory,
          categorySet,
          "secondaryCategory",
          issues,
        );
  if (secondary && secondary === recommended)
    issues.push(
      issue(
        "secondaryCategory",
        "solution_model_schema_validation_failed",
        "Secondary category must differ.",
      ),
    );
  const result = Object.freeze({
    version: SOLUTION_INTELLIGENCE_VERSION,
    problemFraming: claim(
      input.problemFraming,
      "problemFraming",
      allowed,
      issues,
    )!,
    evaluatedCategories: Object.freeze(evaluated),
    recommendedCategory: recommended,
    ...(secondary ? { secondaryCategory: secondary } : {}),
    recommendation: claim(
      input.recommendation,
      "recommendation",
      allowed,
      issues,
    )!,
    existingSolutionAssessment: existing(
      input.existingSolutionAssessment,
      allowed,
      issues,
    ),
    innovationAssessment: innovation(
      input.innovationAssessment,
      allowed,
      issues,
    ),
    validationReadiness: validation(input.validationReadiness, allowed, issues),
    keyAssumptions: claimArr(input, "keyAssumptions", "", allowed, issues),
    risks: claimArr(input, "risks", "", allowed, issues),
    nextValidationAction: claim(
      input.nextValidationAction,
      "nextValidationAction",
      allowed,
      issues,
    )!,
    groundingSummary: summarizeScanGrounding([], allowed),
  });
  if (issues.length) throw new SolutionIntelligenceValidationError(issues);
  return Object.freeze({
    ...result,
    groundingSummary: summarizeScanGrounding(collect(result), allowed),
  });
}
export type SolutionIntelligenceDiagnostics = Readonly<{
  categoryCount: number;
  uniqueCategoryCount: number;
  recommendedCategoryPresent: boolean;
  validateFirstConsidered: boolean;
  evidenceGroundedClaimPercentage: number;
  inferenceClaimPercentage: number;
  independentEvidenceIdsReferenced: number;
  invalidReferenceCount: number;
  existingAlternativeCount: number;
  namedAlternativesWithEvidence: number;
  innovationVerifiedFoundationCount: number;
  innovationAssumptionCount: number;
  criticalUnknownCount: number;
  validationReadiness: ValidationReadiness;
  cheapestNextTest: CheapestNextTest;
  contradictionReferenceCount: number;
}>;
export function computeSolutionIntelligenceDiagnostics(
  result: SolutionIntelligenceResult,
): SolutionIntelligenceDiagnostics {
  const cats = result.evaluatedCategories.map((c) => c.category);
  const summary = result.groundingSummary;
  return Object.freeze({
    categoryCount: cats.length,
    uniqueCategoryCount: new Set(cats).size,
    recommendedCategoryPresent: cats.includes(result.recommendedCategory),
    validateFirstConsidered:
      cats.includes("validate_first") || cats.includes("no_build_recommended"),
    evidenceGroundedClaimPercentage: summary.totalClaims
      ? summary.evidenceGroundedClaims / summary.totalClaims
      : 0,
    inferenceClaimPercentage: summary.totalClaims
      ? summary.inferenceClaims / summary.totalClaims
      : 0,
    independentEvidenceIdsReferenced: summary.distinctEvidenceIdsReferenced,
    invalidReferenceCount: summary.invalidReferenceCount,
    existingAlternativeCount:
      result.existingSolutionAssessment.knownAlternatives.length,
    namedAlternativesWithEvidence:
      result.existingSolutionAssessment.knownAlternatives.filter(
        (a) =>
          a.alternativeType === "direct_competitor" &&
          a.evidenceRefs.length > 0,
      ).length,
    innovationVerifiedFoundationCount:
      result.innovationAssessment.verifiedFoundation.length,
    innovationAssumptionCount:
      result.innovationAssessment.unverifiedAssumptions.length,
    criticalUnknownCount: result.validationReadiness.criticalUnknowns.length,
    validationReadiness: result.validationReadiness.readiness,
    cheapestNextTest: result.validationReadiness.cheapestNextTest,
    contradictionReferenceCount: summary.contradictingReferenceCount,
  });
}
export function publicSolutionIntelligenceError(
  code: SolutionIntelligenceErrorCode,
) {
  return {
    success: false,
    error: code,
    message:
      "The Solution Intelligence response could not be safely validated. Please try again.",
  };
}
