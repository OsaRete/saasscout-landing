"use client";

import { useState } from "react";
import {
  Button,
  Field,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import type { ExperimentDesignDraft } from "@/lib/validation/design-assistant/contracts";
import { validationRequest, words } from "./api";
import { card } from "./validation-shell";

export function ExperimentForm({
  subjectId,
  hypothesisVersionId,
  onDone,
  onCancel,
}: {
  subjectId: string;
  hypothesisVersionId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [family, setFamily] = useState<"customer_interview" | "survey">(
    "customer_interview",
  );
  const [audience, setAudience] = useState("");
  const [method, setMethod] = useState("");
  const [screening, setScreening] = useState("");
  const [privacy, setPrivacy] = useState("anonymous_notes");
  const [draft, setDraft] = useState<ExperimentDesignDraft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  async function generateDraft() {
    setAiBusy(true);
    setError("");
    try {
      setDraft(
        await validationRequest<ExperimentDesignDraft>(
          "/api/validation/design-assistant",
          {
            method: "POST",
            body: JSON.stringify({
              mode: "experiment",
              subjectId,
              hypothesisVersionId,
              ...(audience.trim()
                ? { draftInput: { targetAudience: audience } }
                : {}),
            }),
          },
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message !== "auth"
          ? caught.message
          : "Please sign in again.",
      );
    } finally {
      setAiBusy(false);
    }
  }

  function applyDraft() {
    if (!draft) return;
    setFamily(draft.recommendedFamily);
    setAudience(draft.targetAudience.join("\n"));
    setMethod(draft.suggestedCollectionMethod);
    setScreening(draft.screeningCriteria.join("\n"));
    setPrivacy(draft.privacyMode);
    setDraft(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await validationRequest(
        `/api/validation/subjects/${subjectId}/experiments`,
        {
          method: "POST",
        body: JSON.stringify({hypothesisVersionId,family,targetAudience: words(audience),
            collectionMethod: method,
            designSnapshot: {
              purpose:
                family === "customer_interview"
                  ? "Focused conversations"
                  : "Structured responses",
            },
            screeningCriteria: words(screening),
            consentPrivacyMode: privacy,
          }),
        },
      );
      onDone();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message !== "auth"
          ? caught.message
          : "Please sign in again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const questions = draft
    ? draft.recommendedFamily === "customer_interview"
      ? draft.interviewQuestions.map((question) => question.prompt)
      : draft.surveyQuestions.map(
          (question) =>
            `${question.prompt}${question.options.length ? ` — ${question.options.join(" / ")}` : ""}`,
        )
    : [];
  return (
    <form onSubmit={submit} className={`${card} grid gap-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">Create experiment shell</h3>
        <Button
          variant="secondary"
          onClick={generateDraft}
          disabled={aiBusy || busy}
        >
          {aiBusy ? "Generating one draft…" : "Design experiment with AI"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Optional. Each click requests one draft. Applying it never creates or
        starts an experiment.
      </p>
      <Field label="Experiment family">
        <SelectInput
          value={family}
          onChange={(event) => setFamily(event.target.value as typeof family)}
        >
          <option value="customer_interview">Customer Interview</option>
          <option value="survey">Survey</option>
        </SelectInput>
      </Field>
      <div className="rounded-xl bg-white/[.035] p-4 text-sm text-slate-400">
        {family === "customer_interview"
          ? "Have focused conversations to understand pain, behavior, workarounds, and context."
          : "Collect structured responses at greater breadth to test specific assumptions."}
      </div>
      <Field label="Target audience" helper="One audience criterion per line.">
        <TextArea
          required
          rows={3}
          value={audience}
          onChange={(event) => setAudience(event.target.value)}
        />
      </Field>
      <Field label="Collection method">
        <TextInput
          required
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          placeholder={
            family === "customer_interview"
              ? "Scheduled one-to-one conversations"
              : "Manually distributed survey"
          }
        />
      </Field>
      <Field label="Screening criteria (optional)">
        <TextArea
          rows={2}
          value={screening}
          onChange={(event) => setScreening(event.target.value)}
        />
      </Field>
      <Field label="Consent / privacy mode">
        <SelectInput
          value={privacy}
          onChange={(event) => setPrivacy(event.target.value)}
        >
          <option value="anonymous_notes">Anonymous notes</option>
          <option value="pseudonymous_notes">Pseudonymous notes</option>
          <option value="identified_with_explicit_consent">
            Identified with explicit consent
          </option>
        </SelectInput>
      </Field>
      {draft && (
        <aside className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[.06] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            AI-assisted draft
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Review and edit before saving. This is design assistance, not
            evidence.
          </p>
          <p className="mt-4 text-sm">
            <strong>Recommendation:</strong>{" "}
            {draft.recommendedFamily.replaceAll("_", " ")} — {draft.rationale}
          </p>
          <p className="mt-3 text-sm">
            <strong>Evidence gap:</strong> {draft.evidenceGap}
          </p>
          <p className="mt-3 text-sm">
            <strong>Goal:</strong> {draft.goal}
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            {questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            Suggested questions remain guidance here; save the experiment shell,
            then review them while authoring the existing immutable plan.
          </p>
          <div className="mt-4 flex gap-3">
            <Button onClick={applyDraft}>Use this draft</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Discard
            </Button>
          </div>
        </aside>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-200">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy || aiBusy}>
          {busy ? "Creating…" : "Create experiment"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
