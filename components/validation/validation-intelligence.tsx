"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@/components/ui";
import { card } from "./validation-shell";
import { displayDate, validationRequest } from "./api";
const labels = {
  problemEvidence: "Problem Evidence",
  targetCustomerEvidence: "Target Customer Evidence",
  problemFrequencySeverity: "Problem Frequency / Severity",
  existingBehaviorWorkarounds: "Existing Behavior / Workarounds",
  behavioralIntent: "Behavioral Intent",
  commercialEvidence: "Commercial Evidence",
} as const;
type Run = {
  id: string;
  analysis_version_number: number;
  evidence_snapshot_hash: string;
  status: "running" | "completed" | "failed";
  dimension_assessments?: Record<
    keyof typeof labels,
    { state: string; summary: string; evidenceBasis: string[] }
  >;
  supporting_synthesis?: string[];
  contradicting_synthesis?: string[];
  uncertainty_synthesis?: string[];
  overall_assessment?: { label: string; summary: string };
  next_experiment_recommendation?: {
    goal: string;
    reason: string;
    suggestedFamily: string;
    targetEvidenceGap: string;
  };
  created_at: string;
  completed_at?: string;
};
type Status = {
  currentEvidence: null | {
    hash: string;
    counts: {
      surveyRespondents: number;
      interviewParticipants: number;
      humanObservations: number;
      surveyPlanVersions: number;
      interviewExperimentVersions: number;
    };
  };
  isCurrent: boolean;
  runs: Run[];
};
export function ValidationIntelligence({
  subjectId,
  hasHypothesis,
}: {
  subjectId: string;
  hasHypothesis: boolean;
}) {
  const [data, setData] = useState<Status | null>(null),
    [selected, setSelected] = useState<string>(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const next = await validationRequest<Status>(
        `/api/validation/subjects/${subjectId}/intelligence`,
      );
      setData(next);
      setSelected(
        (s) => s || next.runs.find((r) => r.status === "completed")?.id || "",
      );
    } catch {
      setError("Validation Intelligence could not be loaded.");
    }
  }, [subjectId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function analyze() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await validationRequest<Status>(
        `/api/validation/subjects/${subjectId}/intelligence`,
        { method: "POST" },
      );
      setData(next);
      setSelected(next.runs.find((r) => r.status === "completed")?.id || "");
    } catch {
      setError(
        "Analysis could not be completed. Your human evidence was not changed. You can try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const run =
    data?.runs.find((r) => r.id === selected) ||
    data?.runs.find((r) => r.status === "completed");
  const changed = Boolean(
    data?.currentEvidence &&
    run &&
    data.currentEvidence.hash !== run.evidence_snapshot_hash,
  );
  const counts = data?.currentEvidence?.counts;
  return (
    <section
      aria-labelledby="validation-intelligence-title"
      className="mt-10 border-t border-white/10 pt-10"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-amber-300">
            Validation intelligence
          </p>
          <h2
            id="validation-intelligence-title"
            className="mt-1 text-2xl font-semibold"
          >
            Validation Intelligence
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            AI interpretation of your real-world validation evidence.
          </p>
        </div>
        {hasHypothesis && (
          <Button onClick={analyze} disabled={busy || Boolean(data?.isCurrent)}>
            {busy
              ? "Analyzing evidence..."
              : data?.isCurrent
                ? "Analysis up to date"
                : run
                  ? "Update analysis"
                  : "Analyze evidence"}
          </Button>
        )}
      </div>
      <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/[.07] px-4 py-3 text-xs font-bold uppercase tracking-[.16em] text-amber-200">
        AI interpretation — not human evidence
      </div>
      {!hasHypothesis ? (
        <div className={`${card} mt-5 text-sm text-slate-400`}>
          Define a hypothesis before analyzing evidence.
        </div>
      ) : !data && !error ? (
        <div className={`${card} mt-5 text-sm text-slate-400`}>
          Loading the deterministic evidence basis…
        </div>
      ) : (
        <>
          {counts && (
            <div className={`${card} mt-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">Evidence basis</h3>
                <Badge tone={changed ? "violet" : "green"}>
                  {changed
                    ? "New evidence available"
                    : run
                      ? "Up to date"
                      : "No analysis yet"}
                </Badge>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
                {[
                  ["Survey respondents", counts.surveyRespondents],
                  ["Interview participants", counts.interviewParticipants],
                  ["Human observations", counts.humanObservations],
                  ["Survey plan versions", counts.surveyPlanVersions],
                  [
                    "Interview experiment versions",
                    counts.interviewExperimentVersions,
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="mt-1 text-xl font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              {counts.surveyRespondents + counts.interviewParticipants ===
                0 && (
                <p className="mt-4 text-sm text-amber-200">
                  Evidence volume is currently empty. Analysis will identify the
                  resulting uncertainty without implying significance.
                </p>
              )}
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[.06] p-4 text-sm text-rose-100"
            >
              {error}
            </p>
          )}
          {data && data.runs.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-slate-500">
                History
              </span>
              {data.runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => r.status === "completed" && setSelected(r.id)}
                  disabled={r.status !== "completed"}
                  className={`rounded-full border px-3 py-1 text-xs ${r.id === run?.id ? "border-cyan-300/50 text-cyan-200" : "border-white/10 text-slate-400"}`}
                >
                  Analysis V{r.analysis_version_number} · {r.status}
                </button>
              ))}
            </div>
          )}
          {run && run.status === "completed" && run.dimension_assessments && (
            <div className="mt-6 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="cyan">
                  {run.overall_assessment?.label || "inconclusive"}
                </Badge>
                <p className="text-sm text-slate-300">
                  Based on the evidence currently collected,{" "}
                  {run.overall_assessment?.summary}
                </p>
                <span className="text-xs text-slate-500">
                  Last analyzed{" "}
                  {displayDate(run.completed_at || run.created_at)}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(labels).map(([key, label]) => {
                  const d =
                    run.dimension_assessments![key as keyof typeof labels];
                  return (
                    <article key={key} className={card}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold">{label}</h3>
                        <Badge
                          tone={
                            d.state === "strong"
                              ? "green"
                              : d.state === "insufficient"
                                ? "red"
                                : "violet"
                          }
                        >
                          {d.state}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {d.summary}
                      </p>
                      <ul className="mt-3 space-y-1 text-xs text-slate-500">
                        {d.evidenceBasis.map((x, i) => (
                          <li key={i}>• {x}</li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Synthesis
                  title="What supports the hypothesis"
                  items={run.supporting_synthesis || []}
                />
                <Synthesis
                  title="What contradicts the hypothesis"
                  items={run.contradicting_synthesis || []}
                />
                <Synthesis
                  title="What remains uncertain"
                  items={run.uncertainty_synthesis || []}
                />
              </div>
              {run.next_experiment_recommendation && (
                <div className={`${card} border-cyan-300/20`}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                    Recommended next experiment
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {run.next_experiment_recommendation.goal}
                  </h3>
                  <p className="mt-2 text-sm text-slate-300">
                    {run.next_experiment_recommendation.reason}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Suggested family:{" "}
                    {run.next_experiment_recommendation.suggestedFamily.replaceAll(
                      "_",
                      " ",
                    )}{" "}
                    · Gap:{" "}
                    {run.next_experiment_recommendation.targetEvidenceGap}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Recommendation only. No experiment will be created
                    automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
function Synthesis({ title, items }: { title: string; items: string[] }) {
  return (
    <article className={card}>
      <h3 className="font-semibold">{title}</h3>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
          {items.map((x, i) => (
            <li key={i}>• {x}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          No claim was returned for this section.
        </p>
      )}
    </article>
  );
}
