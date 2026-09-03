/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEvidenceSnapshot,
  hashEvidenceSnapshot,
  SNAPSHOT_LIMITS,
} from "../lib/validation/intelligence/snapshot.ts";
import {
  parseValidationIntelligenceOutput,
  ValidationIntelligenceOutputError,
  VALIDATION_INTELLIGENCE_VALIDATION_REASONS,
  type ValidationIntelligenceValidationReason,
} from "../lib/validation/intelligence/model-output.ts";
import {
  buildSafeFailureDiagnostic,
  VALIDATION_INTELLIGENCE_MODEL,
} from "../lib/validation/intelligence/diagnostics.ts";
const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const sql = read(
    "supabase/migrations/20260902000000_validation_intelligence.sql",
  ),
  ui = read("components/validation/validation-intelligence.tsx"),
  service = read("lib/validation/intelligence/service.ts"),
  route = read("app/api/validation/subjects/[id]/intelligence/route.ts");
const input: any = {
  subject: { id: "s", label: "Subject" },
  hypothesis: {
    id: "hv",
    hypothesis_id: "h",
    version_number: 2,
    target_segment: "Operators",
    problem_claim: "Manual work recurs",
    expected_observable_behavior: "Describe recent work",
    commercial_assumption: null,
    support_criteria: ["recent"],
    contradiction_criteria: ["none"],
    inconclusive_criteria: ["unknown"],
  },
  experimentVersions: [
    { id: "ev", family: "customer_interview", version_number: 1 },
  ],
  sessions: [
    {
      id: "session",
      participant_id: "p",
      participant_relevance: "target_segment_match",
      status: "completed",
      created_at: "2026-01-01",
    },
  ],
  observations: [
    {
      id: "o",
      experiment_version_id: "ev",
      participant_id: "p",
      interview_session_id: "session",
      observation_content: { summary: "Recent manual work" },
      observed_at: "2026-01-02",
    },
  ],
  classifications: [
    {
      observation_id: "o",
      polarity: "supporting",
      authority_status: "authoritative",
      classified_at: "2026-01-01",
    },
  ],
  surveyPlans: [
    { id: "sp", version_number: 1, questions: [{ questionRef: "q" }] },
  ],
  submissions: [
    { id: "sub", survey_plan_version_id: "sp", submitted_at: "2026-01-03" },
  ],
  answers: [
    {
      id: "a",
      submission_id: "sub",
      survey_plan_version_id: "sp",
      question_id: "q",
      question_type: "short_text",
      raw_answer: "Daily",
    },
    {
      id: "b",
      submission_id: "sub",
      survey_plan_version_id: "sp",
      question_id: "q2",
      question_type: "number",
      raw_answer: 2,
    },
  ],
};
test("snapshot preserves lineage, explicit observations, survey provenance, independence and stable hash", () => {
  const a = buildEvidenceSnapshot(input),
    b = buildEvidenceSnapshot({
      ...input,
      answers: [...input.answers].reverse(),
    });
  assert.equal(a.hypothesis.id, "hv");
  assert.equal(a.counts.interviewParticipants, 1);
  assert.equal(a.counts.humanObservations, 1);
  assert.equal(a.counts.surveyRespondents, 1);
  assert.equal(a.surveys[0].answers.length, 2);
  assert.equal(a.surveys[0].surveyPlanVersionId, "sp");
  assert.equal(hashEvidenceSnapshot(a), hashEvidenceSnapshot(b));
  assert.notEqual(
    hashEvidenceSnapshot(a),
    hashEvidenceSnapshot(
      buildEvidenceSnapshot({
        ...input,
        submissions: [
          ...input.submissions,
          { id: "sub2", survey_plan_version_id: "sp" },
        ],
      }),
    ),
  );
});
test("all unordered database collections normalize before hashing", () => {
  const expanded = {
    ...input,
    experimentVersions: [
      ...input.experimentVersions,
      { id: "survey-ev", family: "survey", version_number: 2 },
    ],
    sessions: [
      ...input.sessions,
      {
        id: "session-2",
        participant_id: "p2",
        participant_relevance: "adjacent_segment",
        status: "completed",
        created_at: "2026-01-04",
      },
    ],
    observations: [
      ...input.observations,
      {
        id: "o2",
        experiment_version_id: "ev",
        participant_id: "p2",
        interview_session_id: "session-2",
        observation_content: { detail: "Workaround", frequency: "weekly" },
        observed_at: "2026-01-05",
      },
    ],
    classifications: [
      ...input.classifications,
      {
        id: "c2",
        observation_id: "o2",
        polarity: "mixed",
        authority_status: "authoritative",
        classified_at: "2026-01-06",
      },
    ],
    surveyPlans: [
      ...input.surveyPlans,
      { id: "sp2", version_number: 2, questions: [{ questionRef: "second" }] },
    ],
    submissions: [
      ...input.submissions,
      { id: "sub2", survey_plan_version_id: "sp2", submitted_at: "2026-01-07" },
    ],
    answers: [
      ...input.answers,
      {
        id: "a2",
        submission_id: "sub2",
        survey_plan_version_id: "sp2",
        question_id: "second",
        question_type: "short_text",
        raw_answer: "Often",
      },
    ],
  };
  const ordered = buildEvidenceSnapshot(expanded);
  const reversed = buildEvidenceSnapshot({
    ...expanded,
    experimentVersions: [...expanded.experimentVersions].reverse(),
    sessions: [...expanded.sessions].reverse(),
    observations: [...expanded.observations].reverse(),
    classifications: [...expanded.classifications].reverse(),
    surveyPlans: [...expanded.surveyPlans].reverse(),
    submissions: [...expanded.submissions].reverse(),
    answers: [...expanded.answers].reverse(),
  });
  assert.deepEqual(reversed, ordered);
  assert.equal(hashEvidenceSnapshot(reversed), hashEvidenceSnapshot(ordered));
});
test("recursive key order is hash-insensitive while authoritative changes alter identity", () => {
  const reorderedA = buildEvidenceSnapshot({
    ...input,
    observations: input.observations.map((row: any) => ({
      ...row,
      observation_content: { z: { second: 2, first: 1 }, a: true },
    })),
  });
  const reorderedB = buildEvidenceSnapshot({
    ...input,
    observations: input.observations.map((row: any) => ({
      ...row,
      observation_content: { a: true, z: { first: 1, second: 2 } },
    })),
  });
  assert.equal(
    hashEvidenceSnapshot(reorderedA),
    hashEvidenceSnapshot(reorderedB),
  );
  const base = hashEvidenceSnapshot(buildEvidenceSnapshot(input));
  const changed = (patch: any) =>
    hashEvidenceSnapshot(buildEvidenceSnapshot({ ...input, ...patch }));
  assert.notEqual(
    changed({
      submissions: [
        ...input.submissions,
        {
          id: "new-sub",
          survey_plan_version_id: "sp",
          submitted_at: "2026-02-01",
        },
      ],
    }),
    base,
  );
  assert.notEqual(
    changed({
      observations: [
        ...input.observations,
        {
          ...input.observations[0],
          id: "new-observation",
          observed_at: "2026-02-01",
        },
      ],
    }),
    base,
  );
  assert.notEqual(
    changed({
      answers: input.answers.map((answer: any, index: number) =>
        index ? answer : { ...answer, raw_answer: "Changed" },
      ),
    }),
    base,
  );
  assert.notEqual(
    changed({
      classifications: [
        {
          ...input.classifications[0],
          id: "changed-class",
          polarity: "contradicting",
        },
      ],
    }),
    base,
  );
  assert.notEqual(
    changed({
      hypothesis: { ...input.hypothesis, id: "hv-next", version_number: 3 },
    }),
    base,
  );
});
test("large histories retain full counts, deterministic bounded excerpts and explicit truncation", () => {
  const large = {
    ...input,
    observations: Array.from({ length: 200 }, (_, index) => ({
      ...input.observations[0],
      id: `o-${String(index).padStart(3, "0")}`,
      participant_id: `p-${String(index).padStart(3, "0")}`,
      observed_at: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`,
      observation_content: { text: "x".repeat(8_000), index },
    })),
    submissions: Array.from({ length: 200 }, (_, index) => ({
      id: `s-${String(index).padStart(3, "0")}`,
      survey_plan_version_id: "sp",
      submitted_at: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
    })),
    answers: Array.from({ length: 200 }, (_, index) => ({
      id: `a-${index}`,
      submission_id: `s-${String(index).padStart(3, "0")}`,
      survey_plan_version_id: "sp",
      question_id: "question_1",
      question_type: "long_text",
      raw_answer: "y".repeat(8_000),
    })),
  };
  const first = buildEvidenceSnapshot(large);
  const second = buildEvidenceSnapshot({
    ...large,
    observations: [...large.observations].reverse(),
    submissions: [...large.submissions].reverse(),
    answers: [...large.answers].reverse(),
  });
  assert.equal(first.counts.interviewParticipants, 200);
  assert.equal(first.counts.surveyRespondents, 200);
  assert.equal(
    first.selection.interviewParticipantsSelected,
    SNAPSHOT_LIMITS.interviewParticipants,
  );
  assert.equal(
    first.selection.surveyRespondentsSelected,
    SNAPSHOT_LIMITS.surveyRespondents,
  );
  assert.equal(first.selection.truncated, true);
  assert.ok(
    Buffer.byteLength(JSON.stringify(first)) <= SNAPSHOT_LIMITS.maximumBytes,
  );
  assert.deepEqual(first, second);
});
const valid: any = {
  dimensions: Object.fromEntries(
    [
      "problemEvidence",
      "targetCustomerEvidence",
      "problemFrequencySeverity",
      "existingBehaviorWorkarounds",
      "behavioralIntent",
      "commercialEvidence",
    ].map((k) => [
      k,
      {
        state: "limited",
        summary: "Sparse human evidence.",
        evidenceBasis: ["One grouped participant"],
      },
    ]),
  ),
  whatSupportsHypothesis: [],
  whatContradictsHypothesis: [],
  whatRemainsUncertain: ["More evidence needed"],
  overallAssessment: { label: "inconclusive", summary: "Evidence is sparse." },
  recommendedNextExperiment: {
    goal: "Test budget",
    reason: "Commercial evidence is insufficient.",
    suggestedFamily: "customer_interview",
    targetEvidenceGap: "Commercial Evidence",
  },
};
test("strict output requires six dimensions, contradiction and uncertainty and rejects scores/probability", () => {
  assert.equal(
    parseValidationIntelligenceOutput(valid).overallAssessment.label,
    "inconclusive",
  );
  const missing = structuredClone(valid);
  delete missing.dimensions.commercialEvidence;
  assert.throws(() => parseValidationIntelligenceOutput(missing));
  const noContradiction = structuredClone(valid);
  delete noContradiction.whatContradictsHypothesis;
  assert.throws(() => parseValidationIntelligenceOutput(noContradiction));
  assert.throws(() =>
    parseValidationIntelligenceOutput({ ...valid, validationScore: 87 }),
  );
  assert.throws(() =>
    parseValidationIntelligenceOutput({ ...valid, successProbability: 0.9 }),
  );
});
test("every authoritative output rejection branch has a typed bounded reason", () => {
  const cases: Array<[ValidationIntelligenceValidationReason, () => unknown]> =
    [
      ["output_not_object", () => null],
      [
        "forbidden_claim",
        () => ({ ...structuredClone(valid), validationScore: 87 }),
      ],
      [
        "dimensions_invalid",
        () => ({ ...structuredClone(valid), dimensions: [] }),
      ],
      [
        "dimension_missing",
        () => {
          const value = structuredClone(valid);
          delete value.dimensions.commercialEvidence;
          return value;
        },
      ],
      [
        "dimension_state_invalid",
        () => {
          const value = structuredClone(valid);
          value.dimensions.problemEvidence.state = "certain";
          return value;
        },
      ],
      [
        "dimension_summary_invalid",
        () => {
          const value = structuredClone(valid);
          value.dimensions.problemEvidence.summary = "";
          return value;
        },
      ],
      [
        "dimension_evidence_basis_invalid",
        () => {
          const value = structuredClone(valid);
          value.dimensions.problemEvidence.evidenceBasis = "not-a-list";
          return value;
        },
      ],
      [
        "supporting_synthesis_invalid",
        () => ({ ...structuredClone(valid), whatSupportsHypothesis: null }),
      ],
      [
        "contradicting_synthesis_invalid",
        () => ({ ...structuredClone(valid), whatContradictsHypothesis: null }),
      ],
      [
        "uncertainty_synthesis_invalid",
        () => ({ ...structuredClone(valid), whatRemainsUncertain: null }),
      ],
      [
        "overall_assessment_invalid",
        () => ({ ...structuredClone(valid), overallAssessment: null }),
      ],
      [
        "overall_assessment_label_invalid",
        () => ({
          ...structuredClone(valid),
          overallAssessment: { label: "certain", summary: "Summary" },
        }),
      ],
      [
        "overall_assessment_summary_invalid",
        () => ({
          ...structuredClone(valid),
          overallAssessment: { label: "mixed", summary: "" },
        }),
      ],
      [
        "next_experiment_recommendation_invalid",
        () => ({ ...structuredClone(valid), recommendedNextExperiment: null }),
      ],
      [
        "next_experiment_goal_invalid",
        () => ({
          ...structuredClone(valid),
          recommendedNextExperiment: {
            ...valid.recommendedNextExperiment,
            goal: "",
          },
        }),
      ],
      [
        "next_experiment_reason_invalid",
        () => ({
          ...structuredClone(valid),
          recommendedNextExperiment: {
            ...valid.recommendedNextExperiment,
            reason: "",
          },
        }),
      ],
      [
        "next_experiment_evidence_gap_invalid",
        () => ({
          ...structuredClone(valid),
          recommendedNextExperiment: {
            ...valid.recommendedNextExperiment,
            targetEvidenceGap: "",
          },
        }),
      ],
      [
        "next_experiment_family_invalid",
        () => ({
          ...structuredClone(valid),
          recommendedNextExperiment: {
            ...valid.recommendedNextExperiment,
            suggestedFamily: "automatic_retry",
          },
        }),
      ],
      [
        "unexpected_output_shape",
        () => {
          const value = structuredClone(valid);
          value.circular = value;
          return value;
        },
      ],
    ];
  assert.deepEqual(
    cases.map(([reason]) => reason).sort(),
    [...VALIDATION_INTELLIGENCE_VALIDATION_REASONS].sort(),
  );
  for (const [reason, makeValue] of cases)
    assert.throws(
      () => parseValidationIntelligenceOutput(makeValue()),
      (error) =>
        error instanceof ValidationIntelligenceOutputError &&
        error.code === reason,
      reason,
    );
});
test("model contract diagnostics expose only their server-controlled reason", () => {
  const sensitive =
    "participant@example.com said sk-secret interview note survey answer token-123";
  const value = structuredClone(valid);
  value.dimensions.problemEvidence.state = sensitive;
  let error: unknown;
  try {
    parseValidationIntelligenceOutput(value);
  } catch (caught) {
    error = caught;
  }
  const diagnostic = buildSafeFailureDiagnostic(
    error,
    "model_output_contract",
    12,
  );
  assert.deepEqual(diagnostic, {
    failureCategory: "model_output_contract_failed",
    provider: "openrouter",
    model: "openai/gpt-5.1",
    elapsedMs: 12,
    validationReason: "dimension_state_invalid",
  });
  assert.equal(JSON.stringify(diagnostic).includes(sensitive), false);
  assert.equal(
    JSON.stringify(diagnostic).includes("participant@example.com"),
    false,
  );
});
test("failure diagnostics are bounded by phase and provider status without retaining sensitive content", () => {
  const secret = "private participant answer and sk-secret";
  const cases = [
    [
      new Error("provider_not_configured"),
      "provider_request",
      "provider_configuration_missing",
    ],
    [
      Object.assign(new Error(secret), { status: 400 }),
      "provider_request",
      "provider_request_rejected",
    ],
    [
      Object.assign(new Error(secret), { status: 429 }),
      "provider_request",
      "provider_rate_limited",
    ],
    [
      Object.assign(new Error(secret), { status: 503 }),
      "provider_request",
      "provider_server_error",
    ],
    [
      Object.assign(new Error(secret), { name: "APIConnectionTimeoutError" }),
      "provider_request",
      "provider_timeout",
    ],
    [new Error(secret), "provider_request", "provider_transport_error"],
    [
      new Error("empty_model_output"),
      "provider_request",
      "provider_empty_response",
    ],
    [
      new SyntaxError(secret),
      "provider_request",
      "provider_response_parse_failed",
    ],
    [
      new Error(secret),
      "model_output_contract",
      "model_output_contract_failed",
    ],
    [
      new Error(secret),
      "persistence_completion",
      "persistence_completion_failed",
    ],
  ] as const;
  for (const [error, phase, expected] of cases) {
    const diagnostic = buildSafeFailureDiagnostic(error, phase, 4_700.4);
    assert.equal(diagnostic.failureCategory, expected);
    assert.equal(diagnostic.elapsedMs, 4_700);
    assert.equal(JSON.stringify(diagnostic).includes(secret), false);
    if (phase !== "model_output_contract")
      assert.equal("validationReason" in diagnostic, false);
  }
});
test("schema is immutable, owner-readable, service-only mutable and concurrency/cost bounded", () => {
  assert.match(
    sql,
    /unique index validation_intelligence_active_snapshot_uidx/,
  );
  assert.match(sql, /for update/);
  assert.match(sql, /status in\('running','completed'\)/);
  assert.match(sql, /history is immutable/);
  assert.match(sql, /interval '10 minutes'/);
  assert.match(sql, /prior\.lease_expires_at>clock_timestamp\(\)/);
  assert.match(sql, /failure_code='running_lease_expired'/);
  assert.match(sql, /status='failed'.+failed_at=clock_timestamp\(\)/);
  assert.match(sql, /select \* into root.+for update/);
  assert.match(sql, /coalesce\(max\(analysis_version_number\),0\)\+1/);
  assert.match(sql, /for select to authenticated/);
  assert.match(
    sql,
    /revoke all on public\.validation_intelligence_runs from public,anon,authenticated/,
  );
  assert.match(sql, /grant execute[\s\S]+to service_role/);
  assert.doesNotMatch(
    sql,
    /canonical_problems|problem_intelligence|problem_observations|problem_evolution_snapshots|problem_feedback_events/,
  );
});
test("run state constraint makes running, completed and failed shapes mutually exclusive", () => {
  const state = sql.slice(
    sql.indexOf("constraint validation_intelligence_state"),
    sql.indexOf("constraint validation_intelligence_hypothesis_fk"),
  );
  const running = state.slice(
    state.indexOf("(status='running'"),
    state.indexOf("(status='completed'"),
  );
  const completed = state.slice(
    state.indexOf("(status='completed'"),
    state.indexOf("(status='failed'"),
  );
  const failed = state.slice(state.indexOf("(status='failed'"));
  const resultFields = [
    "dimension_assessments",
    "supporting_synthesis",
    "contradicting_synthesis",
    "uncertainty_synthesis",
    "overall_assessment",
    "next_experiment_recommendation",
  ];
  assert.match(running, /lease_expires_at is not null/);
  assert.match(running, /failure_code is null/);
  for (const field of resultFields)
    assert.match(running, new RegExp(`${field} is null`));
  assert.match(completed, /failure_code is null/);
  assert.match(completed, /completed_at is not null/);
  for (const field of resultFields)
    assert.match(completed, new RegExp(`${field} is not null`));
  assert.match(failed, /failure_code is not null/);
  assert.match(failed, /failed_at is not null/);
  for (const field of resultFields)
    assert.match(failed, new RegExp(`${field} is null`));
  const completeRpc = sql.slice(
    sql.indexOf("create function public.validation_complete_intelligence_run"),
    sql.indexOf("create function public.validation_fail_intelligence_run"),
  );
  const failRpc = sql.slice(
    sql.indexOf("create function public.validation_fail_intelligence_run"),
    sql.indexOf("alter table public.validation_intelligence_runs"),
  );
  assert.match(
    completeRpc,
    /status='completed',lease_expires_at=null,dimension_assessments=p_dimension_assessments.+completed_at=clock_timestamp\(\)/s,
  );
  assert.match(
    failRpc,
    /status='failed',lease_expires_at=null,failure_code=left\(p_failure_code,80\),failed_at=clock_timestamp\(\)/,
  );
  assert.doesNotMatch(
    failRpc,
    /p_dimension|p_supporting|p_contradicting|p_uncertainty|p_overall|p_next/,
  );
});
test("database claim matrix serializes fresh, completed, failed and stale identical runs", () => {
  const claim = sql.slice(
    sql.indexOf("create function public.validation_claim_intelligence_run"),
    sql.indexOf("create function public.validation_complete_intelligence_run"),
  );
  assert.match(claim, /status in\('running','completed'\)/);
  assert.match(claim, /prior\.status='completed'.+'completed'/s);
  assert.match(
    claim,
    /prior\.status='running' and prior\.lease_expires_at>clock_timestamp\(\).+'in_progress'/s,
  );
  assert.match(
    claim,
    /prior\.status='running'.+status='failed'.+running_lease_expired/s,
  );
  assert.match(claim, /for update/);
  assert.match(claim, /analysis_version_number.+n/s);
  assert.match(claim, /status,lease_expires_at.+10 minutes/s);
  assert.doesNotMatch(claim, /delete from|p_lease|p_stale|p_now/);
  const terminalCommands = sql.slice(
    sql.indexOf("create function public.validation_complete_intelligence_run"),
    sql.indexOf("alter table public.validation_intelligence_runs"),
  );
  assert.equal(
    (terminalCommands.match(/validation_subjects.+for update/g) || []).length,
    2,
  );
});
test("GET is read-only, POST is explicit intent, provider has one attempt and safe projection", () => {
  assert.match(route, /GET[\s\S]+false/);
  assert.match(route, /POST[\s\S]+true/);
  assert.equal((service.match(/chat\.completions\.create/g) || []).length, 1);
  assert.equal(VALIDATION_INTELLIGENCE_MODEL, "openai/gpt-5.1");
  assert.match(service, /temperature: 0\.1/);
  assert.match(service, /max_tokens: 3500/);
  assert.match(service, /response_format: \{ type: "json_object" \}/);
  assert.match(service, /AbortSignal\.timeout\(8 \* 60 \* 1000\)/);
  assert.doesNotMatch(
    service.slice(
      service.indexOf("const projection="),
      service.indexOf(";", service.indexOf("const projection=")),
    ),
    /provider|model|evidence_snapshot,/,
  );
  assert.match(service, /eq\("owner_id", ownerId\)/);
  assert.doesNotMatch(service, /interview_sessions","[^\n]*notes/);
  assert.doesNotMatch(route, /lease|expires|owner_id|snapshot_hash/);
});
test("UI exposes manual states, six dimensions, contradiction, uncertainty, recommendation and boundary", () => {
  for (const text of [
    "Analyze evidence",
    "Analysis up to date",
    "New evidence available",
    "Update analysis",
    "AI interpretation — not human evidence",
    "What contradicts the hypothesis",
    "What remains uncertain",
    "Recommended next experiment",
  ])
    assert.match(ui, new RegExp(text));
  for (const label of Object.keys(valid.dimensions))
    assert.match(ui, new RegExp(label));
  assert.match(ui, /disabled=\{busy/);
  assert.doesNotMatch(ui, /progress|% validated|validation score/i);
});
