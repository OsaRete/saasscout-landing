import { createHash } from "node:crypto";
import type { EvidenceSnapshot } from "./contracts.ts";

export const SNAPSHOT_LIMITS = {
  interviewParticipants: 20,
  observationsPerParticipant: 6,
  surveyRespondents: 20,
  answersPerRespondent: 6,
  surveyPlanVersions: 10,
  questionsPerPlan: 15,
  provenanceVersions: 50,
  excerptCharacters: 320,
  maximumBytes: 220_000,
} as const;

const compareText = (a: unknown, b: unknown) => {
  const left = String(a ?? "");
  const right = String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
};
const compareTimeId = (a: Row, b: Row, time: string) =>
  compareText(a[time], b[time]) || compareText(a.id, b.id);

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => compareText(a, b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`)
    .join(",")}}`;
}
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalize(value)).digest("hex");
export function hashEvidenceSnapshot(snapshot: EvidenceSnapshot) {
  return digest(snapshot);
}
const excerpt = (value: unknown) =>
  canonicalize(value).slice(0, SNAPSHOT_LIMITS.excerptCharacters);

// Database rows are normalized at this deterministic boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export function buildEvidenceSnapshot(input: {
  subject: Row;
  hypothesis: Row;
  experimentVersions: Row[];
  sessions: Row[];
  observations: Row[];
  classifications: Row[];
  surveyPlans: Row[];
  submissions: Row[];
  answers: Row[];
}): EvidenceSnapshot {
  const experimentVersions = [...input.experimentVersions].sort(
    (a, b) =>
      Number(a.version_number) - Number(b.version_number) ||
      compareText(a.id, b.id),
  );
  const sessions = [...input.sessions].sort((a, b) =>
    compareTimeId(a, b, "created_at"),
  );
  const observations = [...input.observations].sort((a, b) =>
    compareTimeId(a, b, "observed_at"),
  );
  const classifications = [...input.classifications].sort((a, b) =>
    compareTimeId(a, b, "classified_at"),
  );
  const surveyPlans = [...input.surveyPlans].sort(
    (a, b) =>
      Number(a.version_number) - Number(b.version_number) ||
      compareText(a.id, b.id),
  );
  const submissions = [...input.submissions].sort((a, b) =>
    compareTimeId(a, b, "submitted_at"),
  );
  const answers = [...input.answers].sort(
    (a, b) =>
      compareText(a.submission_id, b.submission_id) ||
      compareText(a.question_id, b.question_id) ||
      compareText(a.id, b.id),
  );

  const currentClass = new Map<string, Row>();
  for (const classification of classifications)
    if (classification.authority_status === "authoritative")
      currentClass.set(classification.observation_id, classification);
  const sessionByParticipant = new Map(
    sessions.map((session) => [session.participant_id, session]),
  );
  const observationGroups = new Map<string, Row[]>();
  for (const observation of observations) {
    const key =
      observation.participant_id ||
      observation.participant_independence_key ||
      `observation:${observation.id}`;
    observationGroups.set(key, [
      ...(observationGroups.get(key) || []),
      observation,
    ]);
  }
  const orderedGroups = [...observationGroups.entries()].sort(([a], [b]) =>
    compareText(a, b),
  );
  const interviews = orderedGroups
    .slice(0, SNAPSHOT_LIMITS.interviewParticipants)
    .map(([, rows], index) => {
      const session = sessionByParticipant.get(rows[0].participant_id);
      return {
        participantRef: `participant-${index + 1}`,
        experimentVersionId: rows[0].experiment_version_id,
        sessionId: rows[0].interview_session_id || null,
        relevance: session?.participant_relevance || "unknown_relevance",
        observations: rows
          .slice(0, SNAPSHOT_LIMITS.observationsPerParticipant)
          .map((observation) => ({
            observationId: observation.id,
            contentExcerpt: excerpt(observation.observation_content),
            polarity: currentClass.get(observation.id)?.polarity || null,
          })),
      };
    });

  const answerGroups = new Map<string, Row[]>();
  for (const answer of answers)
    answerGroups.set(answer.submission_id, [
      ...(answerGroups.get(answer.submission_id) || []),
      answer,
    ]);
  const surveys = submissions
    .slice(0, SNAPSHOT_LIMITS.surveyRespondents)
    .map((submission, index) => ({
      respondentRef: `respondent-${index + 1}`,
      submissionId: submission.id,
      surveyPlanVersionId: submission.survey_plan_version_id,
      answers: (answerGroups.get(submission.id) || [])
        .slice(0, SNAPSHOT_LIMITS.answersPerRespondent)
        .map((answer) => ({
          questionId: answer.question_id,
          questionType: answer.question_type,
          answerExcerpt: excerpt(answer.raw_answer),
        })),
    }));
  const relevance = { targetSegmentMatch: 0, adjacentSegment: 0, unknown: 0 };
  for (const session of sessions) {
    if (session.participant_relevance === "target_segment_match")
      relevance.targetSegmentMatch++;
    else if (session.participant_relevance === "adjacent_segment")
      relevance.adjacentSegment++;
    else relevance.unknown++;
  }
  const interviewVersionIds = [
    ...new Set(
      experimentVersions
        .filter((version) => version.family === "customer_interview")
        .map((version) => String(version.id)),
    ),
  ].sort(compareText);
  const selectedPlans = surveyPlans.slice(
    0,
    SNAPSHOT_LIMITS.surveyPlanVersions,
  );
  const interviewObservationsSelected = interviews.reduce(
    (total, participant) => total + participant.observations.length,
    0,
  );
  const surveyAnswersSelected = surveys.reduce(
    (total, respondent) => total + respondent.answers.length,
    0,
  );
  const questionCount = (plan: Row) =>
    Array.isArray(plan.questions) ? plan.questions.length : 0;
  const snapshot: EvidenceSnapshot = {
    schemaVersion: 1,
    evidenceStateDigest: digest({
      experimentVersions,
      sessions,
      observations,
      classifications: classifications.filter(
        (classification) => classification.authority_status === "authoritative",
      ),
      surveyPlans,
      submissions,
      answers,
    }),
    subject: { id: input.subject.id, label: input.subject.label },
    hypothesis: {
      id: input.hypothesis.id,
      hypothesisId: input.hypothesis.hypothesis_id,
      versionNumber: input.hypothesis.version_number,
      targetSegment: input.hypothesis.target_segment,
      problemClaim: input.hypothesis.problem_claim,
      expectedObservableBehavior: input.hypothesis.expected_observable_behavior,
      commercialAssumption: input.hypothesis.commercial_assumption || null,
      supportCriteria: input.hypothesis.support_criteria || [],
      contradictionCriteria: input.hypothesis.contradiction_criteria || [],
      inconclusiveCriteria: input.hypothesis.inconclusive_criteria || [],
    },
    counts: {
      surveyRespondents: submissions.length,
      interviewParticipants: orderedGroups.length,
      humanObservations: observations.length,
      surveyPlanVersions: surveyPlans.length,
      interviewExperimentVersions: interviewVersionIds.length,
      completedInterviewSessions: sessions.filter(
        (session) => session.status === "completed",
      ).length,
      participantRelevance: relevance,
    },
    selection: {
      interviewParticipantsSelected: interviews.length,
      interviewObservationsSelected,
      surveyRespondentsSelected: surveys.length,
      surveyAnswersSelected,
      surveyPlanVersionsSelected: selectedPlans.length,
      truncated:
        interviews.length < orderedGroups.length ||
        interviewObservationsSelected < observations.length ||
        surveys.length < submissions.length ||
        surveyAnswersSelected < answers.length ||
        selectedPlans.length < surveyPlans.length ||
        interviewVersionIds.length > SNAPSHOT_LIMITS.provenanceVersions ||
        surveyPlans.length > SNAPSHOT_LIMITS.provenanceVersions ||
        selectedPlans.some(
          (plan) => questionCount(plan) > SNAPSHOT_LIMITS.questionsPerPlan,
        ),
    },
    interviews,
    surveys,
    surveyPlans: selectedPlans.map((plan) => ({
      id: plan.id,
      versionNumber: plan.version_number,
      // Survey question order is product-significant and intentionally preserved.
      questionDefinitions: (Array.isArray(plan.questions) ? plan.questions : [])
        .slice(0, SNAPSHOT_LIMITS.questionsPerPlan)
        .map(excerpt),
    })),
    provenance: {
      hypothesisVersionId: input.hypothesis.id,
      interviewExperimentVersionIds: interviewVersionIds.slice(
        0,
        SNAPSHOT_LIMITS.provenanceVersions,
      ),
      surveyPlanVersionIds: surveyPlans
        .slice(0, SNAPSHOT_LIMITS.provenanceVersions)
        .map((plan) => String(plan.id)),
    },
  };
  if (
    Buffer.byteLength(JSON.stringify(snapshot), "utf8") >
    SNAPSHOT_LIMITS.maximumBytes
  )
    throw new Error("snapshot_bound_exceeded");
  return snapshot;
}
