"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, LoadingState } from "@/components/ui";
import {
  BackLink,
  ContextNotice,
  ValidationPage,
  card,
} from "@/components/validation/validation-shell";
import { displayDate, validationRequest } from "@/components/validation/api";
import {
  HypothesisForm,
  type HypothesisVersion,
} from "@/components/validation/hypothesis-form";
import { ExperimentForm } from "@/components/validation/experiment-form";
import { CustomerInterviewWorkspace } from "@/components/validation/customer-interview-workspace";
import { SurveyWorkspace } from "@/components/validation/survey-workspace";
import {
  matchesPlanDraftHandoff,
  type PlanDraftHandoff,
} from "@/components/validation/plan-draft-handoff";
import { ValidationIntelligence } from "@/components/validation/validation-intelligence";
type ExperimentVersion = {
  id: string;
  experiment_id: string;
  hypothesis_version_id: string;
  version_number: number;
  family: "customer_interview" | "survey";
  target_audience: string[];
  collection_method: string;
  consent_privacy_mode: string;
  lifecycle:
    "draft" | "ready" | "running" | "paused" | "completed" | "cancelled";
  created_at: string;
};
type Workspace = {
  subject: {
    id: string;
    creation_origin: string;
    label: string;
    context_snapshot: Record<string, unknown>;
    created_at: string;
  };
  links: Array<{
    source_type: string;
    source_row_id: string;
    source_version?: string;
  }>;
  hypotheses: Array<{
    id: string;
    status: string;
    versions: HypothesisVersion[];
  }>;
  experiments: Array<{ id: string; versions: ExperimentVersion[] }>;
  participant_count: number;
  participants: Array<{
    id: string;
    experiment_id?: string;
    identity_mode: string;
    pseudonymous_reference?: string;
  }>;
  interview_plans: Array<{
    id: string;
    experiment_id: string;
    experiment_version_id: string;
    version_number: number;
    questions: Array<{ prompt: string; followUp?: string }>;
  }>;
  interview_sessions: Array<{
    id: string;
    experiment_id: string;
    experiment_version_id: string;
    participant_id: string;
    interview_plan_version_id: string;
    status: "draft" | "in_progress" | "completed" | "cancelled";
    participant_relevance: string;
    created_at: string;
  }>;
  survey_plans: Array<{
    id: string;
    experiment_id: string;
    experiment_version_id: string;
    version_number: number;
    title: string;
    purpose: string;
    questions: Array<{
      questionRef: string;
      prompt: string;
      type:
        | "single_choice"
        | "multiple_choice"
        | "short_text"
        | "long_text"
        | "number";
      required: boolean;
      options?: string[];
    }>;
  }>;
  survey_publications: Array<{
    id: string;
    experiment_id: string;
    survey_plan_version_id: string;
    state: "published" | "revoked";
  }>;
  survey_submissions: Array<{
    id: string;
    experiment_id: string;
    survey_plan_version_id: string;
  }>;
  survey_answers: Array<{
    submission_id: string;
    survey_plan_version_id: string;
    question_id: string;
    raw_answer: unknown;
  }>;
  observations: Array<{
    id: string;
    origin: string;
    modality: string;
    observed_at: string;
  }>;
  classifications: Array<{
    id: string;
    observation_id: string;
    polarity: string;
    rationale?: string;
  }>;
};
const transitions = {
  draft: [
    ["Mark ready", "ready"],
    ["Cancel", "cancelled"],
  ],
  ready: [
    ["Return to draft", "draft"],
    ["Start", "running"],
    ["Cancel", "cancelled"],
  ],
  running: [
    ["Pause", "paused"],
    ["Complete", "completed"],
    ["Cancel", "cancelled"],
  ],
  paused: [
    ["Resume", "running"],
    ["Complete", "completed"],
    ["Cancel", "cancelled"],
  ],
  completed: [],
  cancelled: [],
} as const;
export default function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [revise, setRevise] = useState(false);
  const [experiment, setExperiment] = useState(false);
  const [conflict, setConflict] = useState("");
  const [planDraftHandoff, setPlanDraftHandoff] =
    useState<PlanDraftHandoff | null>(null);
  const mounted = useRef(false),
    hasData = useRef(false),
    refreshInFlight = useRef<Promise<void> | null>(null);
  const load = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const request = validationRequest<Workspace>(
      `/api/validation/subjects/${id}`,
    )
      .then((next) => {
        if (!mounted.current) return;
        hasData.current = true;
        setData(next);
        setError("");
      })
      .catch((e) => {
        if (!mounted.current) return;
        if ((e as { status?: number }).status === 404)
          setError(
            "This validation workspace was not found or is not available to you.",
          );
        else if (e instanceof Error && e.message === "auth")
          router.push("/login");
        else if (!hasData.current)
          setError("We couldn't load this validation workspace.");
      })
      .finally(() => {
        if (refreshInFlight.current === request) refreshInFlight.current = null;
      });
    refreshInFlight.current = request;
    return request;
  }, [id, router]);
  useEffect(() => {
    mounted.current = true;
    void load();
    const refreshOnFocus = () => {
      void load();
    };
    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    return () => {
      mounted.current = false;
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [load]);
  const latestHypothesis = useMemo(
    () =>
      data?.hypotheses
        .flatMap((h) => h.versions)
        .sort((a, b) => b.version_number - a.version_number)[0],
    [data],
  );
  async function move(v: ExperimentVersion, target: string) {
    setConflict("");
    try {
      await validationRequest(
        `/api/validation/experiment-versions/${v.id}/transition`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedLifecycle: v.lifecycle,
            targetLifecycle: target,
          }),
        },
      );
      await load();
    } catch (e) {
      if ((e as { status?: number }).status === 409) {
        setConflict(
          "The experiment changed since this page was loaded. Refreshing current state.",
        );
        await load();
      } else setConflict("The lifecycle action could not be completed.");
    }
  }
  if (!data && !error)
    return (
      <LoadingState
        title="Loading validation workspace"
        description="Reading the owner-scoped workspace projection."
      />
    );
  if (error)
    return (
      <ValidationPage>
        <BackLink />
        <div role="alert" className={`${card} text-rose-100`}>
          {error}
        </div>
      </ValidationPage>
    );
  if (!data) return null;
  const description = String(
    data.subject.context_snapshot.description ||
      "No additional context was recorded.",
  );
  return (
    <ValidationPage>
      <BackLink />
      <header className="flex flex-col gap-5 border-b border-white/10 pb-7 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge
              tone={
                data.subject.creation_origin === "user_entered"
                  ? "neutral"
                  : "cyan"
              }
            >
              {data.subject.creation_origin.replaceAll("_", " ")}
            </Badge>
            <Badge tone="neutral">
              Created {displayDate(data.subject.created_at)}
            </Badge>
          </div>
          <h1 className="mt-4 text-3xl font-bold md:text-4xl">
            {data.subject.label}
          </h1>
        </div>
        <Button href="/validation/new" variant="secondary">
          New validation
        </Button>
      </header>
      <section className="mt-7">
        <ContextNotice>
          <p>{description}</p>
          {data.links.map((l) => (
            <p
              key={`${l.source_type}-${l.source_row_id}`}
              className="mt-2 text-xs"
            >
              Source: {l.source_type.replaceAll("_", " ")} · {l.source_row_id}
              {l.source_version ? ` · ${l.source_version}` : ""}
            </p>
          ))}
        </ContextNotice>
      </section>
      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <div className="space-y-8">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300">
                  Testable claim
                </p>
                <h2 className="mt-1 text-2xl font-semibold">Hypothesis</h2>
              </div>
              {latestHypothesis && !revise && (
                <Button variant="secondary" onClick={() => setRevise(true)}>
                  Revise hypothesis
                </Button>
              )}
            </div>
            {!latestHypothesis || revise ? (
              <HypothesisForm
                subjectId={id}
                hypothesisId={latestHypothesis?.hypothesis_id}
                current={revise ? latestHypothesis : undefined}
                onDone={() => {
                  setRevise(false);
                  load();
                }}
                onCancel={revise ? () => setRevise(false) : undefined}
              />
            ) : (
              <div className={card}>
                <div className="flex justify-between">
                  <Badge>
                    Current hypothesis — V{latestHypothesis.version_number}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    Immutable version
                  </span>
                </div>
                <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2">
                  <Fact
                    label="Target segment"
                    value={latestHypothesis.target_segment}
                  />
                  <Fact
                    label="Problem claim"
                    value={latestHypothesis.problem_claim}
                  />
                  <Fact
                    label="Expected behavior"
                    value={latestHypothesis.expected_observable_behavior}
                  />
                  {latestHypothesis.commercial_assumption && (
                    <Fact
                      label="Commercial assumption"
                      value={latestHypothesis.commercial_assumption}
                    />
                  )}
                  <Criteria
                    label="Supporting"
                    values={latestHypothesis.support_criteria}
                  />
                  <Criteria
                    label="Contradicting"
                    values={latestHypothesis.contradiction_criteria}
                  />
                  <Criteria
                    label="Inconclusive"
                    values={latestHypothesis.inconclusive_criteria}
                  />
                </dl>
                {data.hypotheses
                  .flatMap((h) => h.versions)
                  .filter((v) => v.id !== latestHypothesis.id).length > 0 && (
                  <div className="mt-6 border-t border-white/10 pt-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Previous versions
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {data.hypotheses
                        .flatMap((h) => h.versions)
                        .filter((v) => v.id !== latestHypothesis.id)
                        .map((v) => (
                          <Badge key={v.id} tone="neutral">
                            V{v.version_number} · {displayDate(v.created_at)}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">
                  Real-world tests
                </p>
                <h2 className="mt-1 text-2xl font-semibold">Experiments</h2>
              </div>
              {latestHypothesis && !experiment && (
                <Button onClick={() => setExperiment(true)}>
                  Create experiment
                </Button>
              )}
            </div>
            {!latestHypothesis ? (
              <div className={`${card} text-sm text-slate-400`}>
                Define a hypothesis before creating an experiment.
              </div>
            ) : experiment ? (
              <ExperimentForm
                subjectId={id}
                hypothesisVersionId={latestHypothesis.id}
                onDone={(handoff) => {
                  setPlanDraftHandoff(handoff);
                  setExperiment(false);
                  load();
                }}
                onCancel={() => setExperiment(false)}
              />
            ) : data.experiments.length === 0 ? (
              <div className={`${card} text-sm text-slate-400`}>
                No experiments yet. Create a Customer Interview or Survey shell
                when you are ready.
              </div>
            ) : (
              <div className="space-y-4">
                {data.experiments.map((e) => {
                  const v = [...e.versions].sort(
                    (a, b) => b.version_number - a.version_number,
                  )[0];
                  const applicableHandoff = matchesPlanDraftHandoff(
                    planDraftHandoff,
                    {
                      subjectId: id,
                      hypothesisVersionId: v.hypothesis_version_id,
                      experimentId: e.id,
                      experimentVersionId: v.id,
                      family: v.family,
                    },
                  )
                    ? planDraftHandoff
                    : null;
                  return (
                    <article key={e.id} className={card}>
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <Badge tone="cyan">
                            {v.family.replaceAll("_", " ")}
                          </Badge>
                          <h3 className="mt-3 font-semibold">
                            Experiment V{v.version_number}
                          </h3>
                        </div>
                        <Badge
                          tone={
                            v.lifecycle === "completed"
                              ? "green"
                              : v.lifecycle === "cancelled"
                                ? "red"
                                : "violet"
                          }
                        >
                          {v.lifecycle}
                        </Badge>
                      </div>
                      <p className="mt-4 text-sm text-slate-400">
                        {v.target_audience.join(" · ")}
                      </p>
                      <p className="mt-2 text-sm text-slate-400">
                        Collection: {v.collection_method}
                      </p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {transitions[v.lifecycle].map(([label, target]) => (
                          <Button
                            key={target}
                            variant={
                              target === "cancelled"
                                ? "destructive"
                                : "secondary"
                            }
                            onClick={() => move(v, target)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                      {v.family === "customer_interview" && (
                        <CustomerInterviewWorkspace
                          experimentId={e.id}
                          versionId={v.id}
                          lifecycle={v.lifecycle}
                          targetAudience={v.target_audience}
                          plans={data.interview_plans.filter(
                            (p) => p.experiment_id === e.id,
                          )}
                          participants={data.participants}
                          sessions={data.interview_sessions.filter(
                            (s) => s.experiment_id === e.id,
                          )}
                          onChange={load}
                          suggestedQuestions={
                            applicableHandoff?.family === "customer_interview"
                              ? applicableHandoff.interviewQuestions
                              : undefined
                          }
                          onSuggestionsDone={() => setPlanDraftHandoff(null)}
                        />
                      )}
                      {v.family === "survey" && (
                        <SurveyWorkspace
                          versionId={v.id}
                          plans={data.survey_plans.filter(
                            (p) => p.experiment_id === e.id,
                          )}
                          publications={data.survey_publications.filter(
                            (p) => p.experiment_id === e.id,
                          )}
                          submissions={data.survey_submissions.filter(
                            (s) => s.experiment_id === e.id,
                          )}
                          answers={data.survey_answers.filter((a) =>
                            data.survey_submissions.some(
                              (s) =>
                                s.id === a.submission_id &&
                                s.experiment_id === e.id,
                            ),
                          )}
                          onChange={load}
                          suggestedQuestions={
                            applicableHandoff?.family === "survey"
                              ? applicableHandoff.surveyQuestions
                              : undefined
                          }
                          onSuggestionsDone={() => setPlanDraftHandoff(null)}
                        />
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {conflict && (
              <p role="status" className="mt-3 text-sm text-amber-200">
                {conflict}
              </p>
            )}
          </section>
        </div>
        <aside className="space-y-6">
          <section className={card}>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300">
              Evidence
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {data.observations.length} observations
            </h2>
            {data.observations.length === 0 ? (
              <>
                <p className="mt-4 text-sm font-medium">
                  No real-world evidence has been recorded yet.
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Responses from interviews, surveys, or observed behavior will
                  appear here as future experiment workflows collect them.
                </p>
              </>
            ) : (
              <ul className="mt-4 space-y-3">
                {data.observations.map((o) => (
                  <li
                    key={o.id}
                    className="rounded-xl bg-white/[.04] p-3 text-sm"
                  >
                    <span className="text-slate-200">
                      {o.origin.replaceAll("_", " ")}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {o.modality.replaceAll("_", " ")} ·{" "}
                      {displayDate(o.observed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={card}>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">
              Classifications
            </p>
            {data.classifications.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                No classifications recorded.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.classifications.map((c) => (
                  <Badge
                    key={c.id}
                    tone={c.polarity === "contradicting" ? "red" : "neutral"}
                  >
                    {c.polarity}
                  </Badge>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      <ValidationIntelligence
        subjectId={id}
        hasHypothesis={Boolean(latestHypothesis)}
      />
    </ValidationPage>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 leading-6 text-slate-200">{value}</dd>
    </div>
  );
}
function Criteria({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label} criteria
      </dt>
      <dd className="mt-2">
        <ul className="list-disc space-y-1 pl-4 text-slate-300">
          {values.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </dd>
    </div>
  );
}
