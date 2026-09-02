export const VALIDATION_DIMENSIONS = [
  "problemEvidence",
  "targetCustomerEvidence",
  "problemFrequencySeverity",
  "existingBehaviorWorkarounds",
  "behavioralIntent",
  "commercialEvidence",
] as const;
export const DIMENSION_STATES = [
  "strong",
  "moderate",
  "limited",
  "insufficient",
] as const;
export type DimensionKey = (typeof VALIDATION_DIMENSIONS)[number];
export type ValidationIntelligenceResult = {
  dimensions: Record<
    DimensionKey,
    {
      state: (typeof DIMENSION_STATES)[number];
      summary: string;
      evidenceBasis: string[];
    }
  >;
  whatSupportsHypothesis: string[];
  whatContradictsHypothesis: string[];
  whatRemainsUncertain: string[];
  overallAssessment: {
    label: "promising" | "mixed" | "weak" | "inconclusive";
    summary: string;
  };
  recommendedNextExperiment: {
    goal: string;
    reason: string;
    suggestedFamily: "customer_interview" | "survey" | "other_future_family";
    targetEvidenceGap: string;
  };
};
export type EvidenceSnapshot = {
  schemaVersion: 1;
  evidenceStateDigest: string;
  subject: { id: string; label: string };
  hypothesis: {
    id: string;
    hypothesisId: string;
    versionNumber: number;
    targetSegment: string;
    problemClaim: string;
    expectedObservableBehavior: string;
    commercialAssumption: string | null;
    supportCriteria: string[];
    contradictionCriteria: string[];
    inconclusiveCriteria: string[];
  };
  counts: {
    surveyRespondents: number;
    interviewParticipants: number;
    humanObservations: number;
    surveyPlanVersions: number;
    interviewExperimentVersions: number;
    completedInterviewSessions: number;
    participantRelevance: {
      targetSegmentMatch: number;
      adjacentSegment: number;
      unknown: number;
    };
  };
  selection: {
    interviewParticipantsSelected: number;
    interviewObservationsSelected: number;
    surveyRespondentsSelected: number;
    surveyAnswersSelected: number;
    surveyPlanVersionsSelected: number;
    truncated: boolean;
  };
  interviews: Array<{
    participantRef: string;
    experimentVersionId: string;
    sessionId: string | null;
    relevance: string;
    observations: Array<{
      observationId: string;
      contentExcerpt: string;
      polarity: string | null;
    }>;
  }>;
  surveys: Array<{
    respondentRef: string;
    submissionId: string;
    surveyPlanVersionId: string;
    answers: Array<{
      questionId: string;
      questionType: string;
      answerExcerpt: string;
    }>;
  }>;
  surveyPlans: Array<{
    id: string;
    versionNumber: number;
    questionDefinitions: string[];
  }>;
  provenance: {
    hypothesisVersionId: string;
    interviewExperimentVersionIds: string[];
    surveyPlanVersionIds: string[];
  };
};
