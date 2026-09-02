import "server-only";
import OpenAI from "openai";
import type { SupabaseAdminClient } from "@/lib/supabase/server-admin";
import { buildEvidenceSnapshot, hashEvidenceSnapshot } from "./snapshot";
import { parseValidationIntelligenceOutput } from "./model-output";
import type { EvidenceSnapshot } from "./contracts";
import {
  buildSafeFailureDiagnostic,
  VALIDATION_INTELLIGENCE_MODEL as MODEL,
  type ValidationIntelligenceFailurePhase,
} from "./diagnostics";
const projection =
  "id,subject_id,hypothesis_id,hypothesis_version_id,analysis_version_number,evidence_snapshot_hash,status,dimension_assessments,supporting_synthesis,contradicting_synthesis,uncertainty_synthesis,overall_assessment,next_experiment_recommendation,created_at,completed_at,failed_at";
function event(name: string, meta: Record<string, unknown>) {
  console.info(name, meta);
}
async function query(
  db: SupabaseAdminClient,
  table: string,
  select: string,
  ownerId: string,
  subjectId: string,
): Promise<Record<string, unknown>[]> {
  const r = await db
    .from(table)
    .select(select)
    .eq("owner_id", ownerId)
    .eq("subject_id", subjectId);
  if (r.error) throw new Error(`snapshot_${table}`);
  return (r.data || []) as unknown as Record<string, unknown>[];
}
export class ValidationIntelligenceService {
  constructor(
    private db: SupabaseAdminClient,
    private completion?: (snapshot: EvidenceSnapshot) => Promise<unknown>,
  ) {}
  async snapshot(ownerId: string, subjectId: string) {
    const subjectResult = await this.db
      .from("validation_subjects")
      .select("id,label")
      .eq("owner_id", ownerId)
      .eq("id", subjectId)
      .maybeSingle();
    if (subjectResult.error || !subjectResult.data)
      throw Object.assign(new Error("not_found"), { status: 404 });
    const hypothesisResult = await this.db
      .from("validation_hypothesis_versions")
      .select(
        "id,hypothesis_id,version_number,target_segment,problem_claim,expected_observable_behavior,commercial_assumption,support_criteria,contradiction_criteria,inconclusive_criteria",
      )
      .eq("owner_id", ownerId)
      .eq("subject_id", subjectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hypothesisResult.error) throw new Error("snapshot_hypothesis");
    if (!hypothesisResult.data) return null;
    const [
      experimentVersions,
      sessions,
      observations,
      surveyPlans,
      submissions,
    ] = await Promise.all([
      query(
        this.db,
        "validation_experiment_versions",
        "id,family,version_number",
        ownerId,
        subjectId,
      ),
      query(
        this.db,
        "validation_interview_sessions",
        "id,participant_id,participant_relevance,status,created_at",
        ownerId,
        subjectId,
      ),
      query(
        this.db,
        "validation_evidence_observations",
        "id,experiment_version_id,participant_id,interview_session_id,participant_independence_key,observation_content,observed_at",
        ownerId,
        subjectId,
      ),
      query(
        this.db,
        "validation_survey_plan_versions",
        "id,version_number,questions,created_at",
        ownerId,
        subjectId,
      ),
      query(
        this.db,
        "validation_survey_submissions",
        "id,survey_plan_version_id,submitted_at",
        ownerId,
        subjectId,
      ),
    ]);
    const observationIds = observations.map((row) => row.id);
    const submissionIds = submissions.map((row) => row.id);
    const classificationsResult = observationIds.length
      ? await this.db
          .from("validation_evidence_classifications")
          .select("id,observation_id,polarity,authority_status,classified_at")
          .eq("owner_id", ownerId)
          .in("observation_id", observationIds)
      : { data: [], error: null };
    const answersResult = submissionIds.length
      ? await this.db
          .from("validation_survey_answers")
          .select(
            "id,submission_id,survey_plan_version_id,question_id,question_type,raw_answer",
          )
          .eq("owner_id", ownerId)
          .in("submission_id", submissionIds)
      : { data: [], error: null };
    if (classificationsResult.error || answersResult.error)
      throw new Error("snapshot_children");
    const classifications = classificationsResult.data || [],
      answers = answersResult.data || [];
    const snapshot = buildEvidenceSnapshot({
      subject: subjectResult.data,
      hypothesis: hypothesisResult.data,
      experimentVersions,
      sessions,
      observations,
      classifications,
      surveyPlans,
      submissions,
      answers,
    });
    const hash = hashEvidenceSnapshot(snapshot);
    event("validation_intelligence_snapshot_built", {
      ownerId,
      subjectId,
      hash,
      counts: snapshot.counts,
    });
    return { snapshot, hash };
  }
  async status(ownerId: string, subjectId: string) {
    const current = await this.snapshot(ownerId, subjectId);
    const runs = await this.db
      .from("validation_intelligence_runs")
      .select(projection)
      .eq("owner_id", ownerId)
      .eq("subject_id", subjectId)
      .order("analysis_version_number", { ascending: false })
      .limit(20);
    if (runs.error) throw new Error("runs_read_failed");
    const safeRuns = runs.data || [];
    return {
      currentEvidence: current
        ? {
            hash: current.hash,
            counts: current.snapshot.counts,
            hypothesisVersionId: current.snapshot.hypothesis.id,
          }
        : null,
      isCurrent: Boolean(
        current &&
        safeRuns.some(
          (r) =>
            r.status === "completed" &&
            r.evidence_snapshot_hash === current.hash,
        ),
      ),
      runs: safeRuns,
    };
  }
  async analyze(ownerId: string, subjectId: string) {
    event("validation_intelligence_requested", { ownerId, subjectId });
    const current = await this.snapshot(ownerId, subjectId);
    if (!current)
      throw Object.assign(new Error("hypothesis_required"), { status: 409 });
    const claim = await this.db.rpc("validation_claim_intelligence_run", {
      p_owner_id: ownerId,
      p_subject_id: subjectId,
      p_hypothesis_id: current.snapshot.hypothesis.hypothesisId,
      p_hypothesis_version_id: current.snapshot.hypothesis.id,
      p_evidence_snapshot: current.snapshot,
      p_evidence_snapshot_hash: current.hash,
      p_provider: "openrouter",
      p_model: MODEL,
    });
    if (claim.error || !claim.data) throw new Error("claim_failed");
    const claimed = claim.data as { disposition: string; run_id: string };
    if (claimed.disposition !== "claimed") {
      event("validation_intelligence_reused", {
        ownerId,
        subjectId,
        hash: current.hash,
        disposition: claimed.disposition,
      });
      return this.status(ownerId, subjectId);
    }
    const modelStartedAt = Date.now();
    let failurePhase: ValidationIntelligenceFailurePhase = "provider_request";
    try {
      event("validation_intelligence_model_started", {
        ownerId,
        subjectId,
        runId: claimed.run_id,
        hash: current.hash,
      });
      const raw = await (this.completion
        ? this.completion(current.snapshot)
        : this.callModel(current.snapshot));
      failurePhase = "model_output_contract";
      const result = parseValidationIntelligenceOutput(raw);
      event("validation_intelligence_model_completed", {
        ownerId,
        subjectId,
        runId: claimed.run_id,
      });
      failurePhase = "persistence_completion";
      const done = await this.db.rpc("validation_complete_intelligence_run", {
        p_owner_id: ownerId,
        p_run_id: claimed.run_id,
        p_dimension_assessments: result.dimensions,
        p_supporting_synthesis: result.whatSupportsHypothesis,
        p_contradicting_synthesis: result.whatContradictsHypothesis,
        p_uncertainty_synthesis: result.whatRemainsUncertain,
        p_overall_assessment: result.overallAssessment,
        p_next_experiment_recommendation: result.recommendedNextExperiment,
      });
      if (done.error || done.data !== true)
        throw new Error("completion_failed");
      event("validation_intelligence_completed", {
        ownerId,
        subjectId,
        runId: claimed.run_id,
      });
      return this.status(ownerId, subjectId);
    } catch (error) {
      const diagnostic = buildSafeFailureDiagnostic(
        error,
        failurePhase,
        Date.now() - modelStartedAt,
      );
      event(
        diagnostic.failureCategory === "model_output_contract_failed"
          ? "validation_intelligence_model_validation_failed"
          : "validation_intelligence_failed",
        { ownerId, subjectId, runId: claimed.run_id, ...diagnostic },
      );
      const failed = await this.db.rpc("validation_fail_intelligence_run", {
        p_owner_id: ownerId,
        p_run_id: claimed.run_id,
        p_failure_code: "analysis_unavailable",
      });
      if (failed.error || failed.data !== true)
        event("validation_intelligence_failure_persistence_failed", {
          ownerId,
          subjectId,
          runId: claimed.run_id,
          failureCategory: "persistence_failure_mark_failed",
          provider: "openrouter",
          model: MODEL,
          elapsedMs: Math.max(0, Math.round(Date.now() - modelStartedAt)),
        });
      throw Object.assign(new Error("analysis_unavailable"), { status: 502 });
    }
  }
  private async callModel(snapshot: EvidenceSnapshot) {
    if (!process.env.OPENROUTER_API_KEY)
      throw new Error("provider_not_configured");
    const client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
    const completion = await client.chat.completions.create(
      {
        model: MODEL,
        temperature: 0.1,
        max_tokens: 3500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Return strict JSON only. Interpret only supplied human evidence. Never invent facts, probabilities, numeric validation scores, or statistical significance. Preserve contradictions and mark missing evidence insufficient.",
          },
          {
            role: "user",
            content: JSON.stringify({
              contract: {
                dimensionStates: [
                  "strong",
                  "moderate",
                  "limited",
                  "insufficient",
                ],
                overallLabels: ["promising", "mixed", "weak", "inconclusive"],
                requiredDimensions: [
                  "problemEvidence",
                  "targetCustomerEvidence",
                  "problemFrequencySeverity",
                  "existingBehaviorWorkarounds",
                  "behavioralIntent",
                  "commercialEvidence",
                ],
                requiredSections: [
                  "whatSupportsHypothesis",
                  "whatContradictsHypothesis",
                  "whatRemainsUncertain",
                  "overallAssessment",
                  "recommendedNextExperiment",
                ],
              },
              evidenceSnapshot: snapshot,
            }),
          },
        ],
      },
      { signal: AbortSignal.timeout(8 * 60 * 1000) },
    );
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("empty_model_output");
    return JSON.parse(content);
  }
}
