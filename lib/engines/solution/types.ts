export type SolutionCategory =
  | "saas_software"
  | "mobile_app"
  | "api"
  | "physical_product"
  | "hardware"
  | "marketplace"
  | "service"
  | "automation"
  | "ai_product"
  | "education_product"
  | "consulting"
  | "hybrid_model"
  | "new_business_model";

export type SolutionComplexityLevel = "low" | "medium" | "high" | "very_high";

export type SolutionScalabilityProfile = "low" | "moderate" | "high" | "network_effects" | "variable";

export type SolutionScore = number;

export type SolutionEvaluationScoreBreakdown = {
  problemSolutionFitScore: SolutionScore;
  willingnessToPayScore: SolutionScore;
  scalabilityScore: SolutionScore;
  implementationComplexityScore: SolutionScore;
  operationalComplexityScore: SolutionScore;
  distributionFitScore: SolutionScore;
  defensibilityScore: SolutionScore;
  evidenceStrengthScore: SolutionScore;
  confidenceScore: SolutionScore;
  overallSolutionScore: SolutionScore;
};

export type SolutionCategoryDefinition = {
  category: SolutionCategory;
  label: string;
  description: string;
  typicalBusinessModels: string[];
  commonStrengths: string[];
  commonRisks: string[];
  capitalIntensity: SolutionComplexityLevel;
  technicalComplexity: SolutionComplexityLevel;
  operationalComplexity: SolutionComplexityLevel;
  scalabilityProfile: SolutionScalabilityProfile;
};

export type SolutionCandidate = {
  id: string;
  category: SolutionCategory;
  title: string;
  summary: string;
  targetCustomer: string | null;
  primaryUseCase: string;
  expectedBusinessModel: string | null;
  rationale: string[];
  assumptions: string[];
  risks: string[];
  supportingEvidenceReferences: string[];
  missingEvidence: string[];
};

export type SolutionEvaluation = {
  candidate: SolutionCandidate;
  scoreBreakdown: SolutionEvaluationScoreBreakdown;
  rationale: string[];
  assumptions: string[];
  risks: string[];
  supportingEvidenceReferences: string[];
  missingEvidence: string[];
};

export type RejectedSolutionCategory = {
  category: SolutionCategory;
  rejectedReasons: string[];
  rationale: string[];
  assumptions: string[];
  risks: string[];
  supportingEvidenceReferences: string[];
  missingEvidence: string[];
};

export type SolutionRecommendation = {
  recommendedCategory: SolutionCategory | null;
  recommendedCandidate: SolutionCandidate | null;
  evaluation: SolutionEvaluation | null;
  rationale: string[];
  assumptions: string[];
  risks: string[];
  supportingEvidenceReferences: string[];
  missingEvidence: string[];
  rejectedCategories: RejectedSolutionCategory[];
};

export type SolutionIntelligenceInput = {
  runId?: string;
  problemId?: string | null;
  problemTitle: string;
  problemSummary: string;
  affectedMarkets?: string[];
  affectedAudiences?: string[];
  evidenceReferences?: string[];
  context?: Record<string, unknown>;
  evaluatedAt?: string | Date;
};

export type SolutionIntelligenceDiagnostics = {
  evaluatedCategoryCount: number;
  rejectedCategoryCount: number;
  recommendedCategory: SolutionCategory | null;
  lowConfidenceReasonCount: number;
  missingEvidenceCount: number;
  fallbackUsed: boolean;
  warnings: string[];
};

export type SolutionIntelligenceResult = {
  runId: string;
  evaluatedAt: string;
  evaluations: SolutionEvaluation[];
  rejectedCategories: RejectedSolutionCategory[];
  recommendation: SolutionRecommendation | null;
  diagnostics: SolutionIntelligenceDiagnostics;
  warnings: string[];
};
