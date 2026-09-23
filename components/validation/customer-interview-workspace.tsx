"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Field,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  DEFAULT_INTERVIEW_QUESTIONS,
  INTERVIEW_PLAN_GUIDANCE,
} from "@/lib/validation/interviews";
import { validationErrorMessage, validationRequest } from "./api";
import { InterviewObservationForm } from "./interview-observation-form";

type Plan = {
  id: string;
  version_number: number;
  questions: Array<{ prompt: string; followUp?: string }>;
};
type Participant = {
  id: string;
  experiment_id?: string;
  identity_mode: string;
  pseudonymous_reference?: string;
};
type Session = {
  id: string;
  participant_id: string;
  interview_plan_version_id: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  participant_relevance: string;
  created_at: string;
};
type Feedback = { tone: "success" | "error"; message: string };

function ActionFeedback({ feedback }: { feedback?: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.tone === "error" ? "alert" : "status"}
      className={
        feedback.tone === "error"
          ? "text-sm text-rose-200"
          : "text-sm text-emerald-200"
      }
    >
      {feedback.message}
    </p>
  );
}

export function CustomerInterviewWorkspace({
  experimentId,
  versionId,
  lifecycle,
  targetAudience,
  plans,
  participants,
  sessions,
  onChange,
  suggestedQuestions,
  onSuggestionsDone,
}: {
  experimentId: string;
  versionId: string;
  lifecycle: string;
  targetAudience: string[];
  plans: Plan[];
  participants: Participant[];
  sessions: Session[];
  onChange: () => Promise<void>;
  suggestedQuestions?: Array<{ prompt: string }>;
  onSuggestionsDone: () => void;
}) {
  const current = [...plans].sort(
    (a, b) => b.version_number - a.version_number,
  )[0];
  const [editing, setEditing] = useState(!current);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState(
    (
      current?.questions.map((question) => question.prompt) ??
      DEFAULT_INTERVIEW_QUESTIONS
    ).join("\n"),
  );
  const [questionsEdited, setQuestionsEdited] = useState(Boolean(current));
  const [replaceWarning, setReplaceWarning] = useState(false);
  const [alias, setAlias] = useState("");
  const [mode, setMode] = useState("experiment_pseudonymous");
  const [participantId, setParticipantId] = useState("");
  const [relevance, setRelevance] = useState("unknown_relevance");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [planFeedback, setPlanFeedback] = useState<Feedback>();
  const [participantPending, setParticipantPending] = useState(false);
  const [participantFeedback, setParticipantFeedback] = useState<Feedback>();
  const [interviewPending, setInterviewPending] = useState(false);
  const [interviewFeedback, setInterviewFeedback] = useState<Feedback>();
  const [sessionPending, setSessionPending] = useState<Record<string, string>>(
    {},
  );
  const [sessionFeedback, setSessionFeedback] = useState<
    Record<string, Feedback>
  >({});

  function applySuggestions() {
    if (!suggestedQuestions) return;
    if (questionsEdited && !replaceWarning) {
      setReplaceWarning(true);
      return;
    }
    setQuestions(
      suggestedQuestions.map((question) => question.prompt).join("\n"),
    );
    setQuestionsEdited(false);
    setReplaceWarning(false);
    onSuggestionsDone();
  }

  async function savePlan() {
    if (saving) return;
    setSaving(true);
    setPlanFeedback(undefined);
    try {
      const items = questions
        .split("\n")
        .map((question) => question.trim())
        .filter(Boolean)
        .map((prompt) => ({ prompt }));
      await validationRequest("/api/validation/interview-plans", {
        method: "POST",
        body: JSON.stringify({
          experimentVersionId: versionId,
          questions: items,
          supersedesPlanVersionId: current?.id,
        }),
      });
      await onChange();
      setEditing(false);
      setPlanFeedback({ tone: "success", message: "Interview plan saved." });
    } catch (cause) {
      setPlanFeedback({
        tone: "error",
        message: validationErrorMessage(cause, "Could not save plan."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function addParticipant() {
    if (participantPending) return;
    setParticipantPending(true);
    setParticipantFeedback(undefined);
    try {
      const participant = await validationRequest<{ id: string }>(
        "/api/validation/participants",
        {
          method: "POST",
          body: JSON.stringify({
            experimentId:
              mode === "experiment_pseudonymous" ? experimentId : undefined,
            identityMode: mode,
            pseudonymousReference: alias || undefined,
            consent: {
              mode: "acknowledged",
              purpose: "Private customer interview research",
            },
          }),
        },
      );
      setParticipantId(participant.id);
      setAlias("");
      await onChange();
      setParticipantFeedback({
        tone: "success",
        message: "Participant created and selected.",
      });
    } catch (cause) {
      setParticipantFeedback({
        tone: "error",
        message: validationErrorMessage(cause, "Could not add participant."),
      });
    } finally {
      setParticipantPending(false);
    }
  }

  async function createInterview() {
    if (!current || interviewPending) return;
    setInterviewPending(true);
    setInterviewFeedback(undefined);
    try {
      await validationRequest("/api/validation/interviews", {
        method: "POST",
        body: JSON.stringify({
          experimentVersionId: versionId,
          participantId,
          interviewPlanVersionId: current.id,
          participantRelevance: relevance,
        }),
      });
      await onChange();
      setInterviewFeedback({
        tone: "success",
        message: "Interview created.",
      });
    } catch (cause) {
      setInterviewFeedback({
        tone: "error",
        message: validationErrorMessage(cause, "Could not create interview."),
      });
    } finally {
      setInterviewPending(false);
    }
  }

  async function move(session: Session, targetStatus: string) {
    if (sessionPending[session.id]) return;
    setSessionPending((pending) => ({
      ...pending,
      [session.id]: targetStatus,
    }));
    setSessionFeedback((feedback) => {
      const next = { ...feedback };
      delete next[session.id];
      return next;
    });
    try {
      await validationRequest(`/api/validation/interviews/${session.id}`, {
        method: "POST",
        body: JSON.stringify({
          expectedStatus: session.status,
          targetStatus,
          notes: notes[session.id] ?? "",
        }),
      });
      await onChange();
      const action =
        targetStatus === "in_progress"
          ? "started"
          : targetStatus === "completed"
            ? "completed"
            : "cancelled";
      setSessionFeedback((feedback) => ({
        ...feedback,
        [session.id]: {
          tone: "success",
          message: `Interview ${action}.`,
        },
      }));
    } catch (cause) {
      setSessionFeedback((feedback) => ({
        ...feedback,
        [session.id]: {
          tone: "error",
          message: validationErrorMessage(cause, "Could not update interview."),
        },
      }));
    } finally {
      setSessionPending((pending) => {
        const next = { ...pending };
        delete next[session.id];
        return next;
      });
    }
  }

  return (
    <div className="mt-6 space-y-5 border-t border-white/10 pt-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">
          Interview plan
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Target participant: {targetAudience.join(" · ")}
        </p>
        <ul className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
          {INTERVIEW_PLAN_GUIDANCE.map((guidance) => (
            <li key={guidance}>• {guidance}</li>
          ))}
        </ul>
      </div>
      {editing || !current ? (
        <div className="space-y-3">
          {suggestedQuestions && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[.06] p-3">
              <p className="text-sm font-medium text-cyan-200">
                AI suggested questions available
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Applying only changes this editable draft. Review it before
                saving an immutable plan.
              </p>
              {replaceWarning && (
                <p role="alert" className="mt-2 text-xs text-amber-200">
                  This will replace your edited question draft. Select replace
                  to confirm.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={applySuggestions}>
                  {replaceWarning
                    ? "Replace my questions"
                    : "Use AI suggested questions"}
                </Button>
                <Button variant="ghost" onClick={onSuggestionsDone}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
          <Field
            label="Primary questions"
            helper="One question per line. Keep the plan short and behavioral."
          >
            <TextArea
              rows={8}
              value={questions}
              disabled={saving}
              onChange={(event) => {
                setQuestions(event.target.value);
                setQuestionsEdited(true);
                setReplaceWarning(false);
              }}
              maxLength={6000}
            />
          </Field>
          <Button disabled={saving} onClick={savePlan}>
            {saving ? "Saving plan…" : "Save plan version"}
          </Button>
          {current && (
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between">
            <Badge tone="neutral">Plan V{current.version_number}</Badge>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Revise plan
            </Button>
          </div>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            {current.questions.map((question, index) => (
              <li key={`${index}-${question.prompt}`}>{question.prompt}</li>
            ))}
          </ol>
        </div>
      )}
      <div aria-live="polite" aria-atomic="true">
        <ActionFeedback feedback={planFeedback} />
      </div>
      {current && ["running", "paused"].includes(lifecycle) && (
        <div className="grid gap-4 rounded-2xl bg-white/[.035] p-4 lg:grid-cols-2">
          <div className="space-y-3">
            <h4 className="font-semibold">Participant</h4>
            <Field label="Privacy mode">
              <SelectInput
                value={mode}
                disabled={participantPending}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="experiment_pseudonymous">
                  Experiment pseudonym
                </option>
                <option value="owner_pseudonymous">Owner pseudonym</option>
                <option value="identified_interview">
                  Identified with consent
                </option>
                <option value="anonymous">Anonymous</option>
              </SelectInput>
            </Field>
            <Field
              label="Optional research alias"
              helper="Do not enter contact details or sensitive data."
            >
              <TextInput
                value={alias}
                disabled={participantPending}
                onChange={(event) => setAlias(event.target.value)}
                maxLength={200}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={participantPending}
              onClick={addParticipant}
            >
              {participantPending
                ? "Creating participant…"
                : "Create participant"}
            </Button>
            <div aria-live="polite" aria-atomic="true">
              <ActionFeedback feedback={participantFeedback} />
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="font-semibold">New interview</h4>
            <Field label="Participant">
              <SelectInput
                value={participantId}
                disabled={interviewPending}
                onChange={(event) => setParticipantId(event.target.value)}
              >
                <option value="">Select a participant</option>
                {participants
                  .filter(
                    (participant) =>
                      !participant.experiment_id ||
                      participant.experiment_id === experimentId,
                  )
                  .map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.pseudonymous_reference ||
                        participant.identity_mode.replaceAll("_", " ")}
                    </option>
                  ))}
              </SelectInput>
            </Field>
            <Field label="Research relevance">
              <SelectInput
                value={relevance}
                disabled={interviewPending}
                onChange={(event) => setRelevance(event.target.value)}
              >
                <option value="target_segment_match">
                  Target segment match
                </option>
                <option value="adjacent_segment">Adjacent segment</option>
                <option value="unknown_relevance">Unknown relevance</option>
              </SelectInput>
            </Field>
            <Button
              disabled={!participantId || interviewPending}
              onClick={createInterview}
            >
              {interviewPending ? "Creating interview…" : "Create interview"}
            </Button>
            <div aria-live="polite" aria-atomic="true">
              <ActionFeedback feedback={interviewFeedback} />
            </div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500">
            No interview sessions yet. Calls happen outside SaaSScout; this
            workspace records the research.
          </p>
        ) : (
          sessions.map((session) => {
            const pendingTarget = sessionPending[session.id];
            return (
              <div
                key={session.id}
                className="rounded-2xl border border-white/10 p-4"
              >
                <div className="flex justify-between">
                  <Badge
                    tone={
                      session.status === "completed"
                        ? "green"
                        : session.status === "cancelled"
                          ? "red"
                          : "neutral"
                    }
                  >
                    {session.status.replaceAll("_", " ")}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {session.participant_relevance.replaceAll("_", " ")}
                  </span>
                </div>
                {!(["completed", "cancelled"] as string[]).includes(
                  session.status,
                ) && (
                  <>
                    <Field
                      label="Bounded working notes"
                      helper="Notes are private working material. They never become evidence automatically."
                    >
                      <TextArea
                        className="mt-3"
                        rows={5}
                        maxLength={12000}
                        value={notes[session.id] ?? ""}
                        disabled={Boolean(pendingTarget)}
                        onChange={(event) =>
                          setNotes({
                            ...notes,
                            [session.id]: event.target.value,
                          })
                        }
                      />
                    </Field>
                    {session.status === "in_progress" && (
                      <InterviewObservationForm
                        sessionId={session.id}
                        onDone={onChange}
                      />
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {session.status === "draft" && (
                        <Button
                          disabled={Boolean(pendingTarget)}
                          onClick={() => move(session, "in_progress")}
                        >
                          {pendingTarget === "in_progress"
                            ? "Starting interview…"
                            : "Start interview"}
                        </Button>
                      )}
                      {session.status === "in_progress" && (
                        <Button
                          disabled={Boolean(pendingTarget)}
                          onClick={() => move(session, "completed")}
                        >
                          {pendingTarget === "completed"
                            ? "Completing interview…"
                            : "Complete interview"}
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        disabled={Boolean(pendingTarget)}
                        onClick={() => move(session, "cancelled")}
                      >
                        {pendingTarget === "cancelled"
                          ? "Cancelling interview…"
                          : "Cancel interview"}
                      </Button>
                    </div>
                  </>
                )}
                <div className="mt-3" aria-live="polite" aria-atomic="true">
                  <ActionFeedback feedback={sessionFeedback[session.id]} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
