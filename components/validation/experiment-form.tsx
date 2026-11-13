"use client";

import { MethodPicker } from "./method-picker";
import {
  validationMethods,
  findValidationMethod,
  methodAvailable,
  type MethodFamily,
} from "./methods";
import { useValidationCapabilities } from "./release-capabilities";
import { useRef, useState } from "react";
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
import {
  createPlanDraftHandoff,
  type PlanDraftHandoff,
} from "./plan-draft-handoff";

export function ExperimentForm({
  initialFamily,
  subjectId,
  hypothesisVersionId,
  onDone,
  onCancel,
}: {
  initialFamily?: MethodFamily;
  subjectId: string;
  hypothesisVersionId: string;
  onDone: (handoff: PlanDraftHandoff | null) => void;
  onCancel: () => void;
}) {
  const capabilities = useValidationCapabilities();
  const initialMethod =
    validationMethods.find(
      (method) =>
        method.family === initialFamily &&
        methodAvailable(method, capabilities),
    ) ||
    validationMethods.find((method) => methodAvailable(method, capabilities));
  const [family, setFamily] = useState<MethodFamily | undefined>(
    initialMethod?.family,
  );
  const [audience, setAudience] = useState("");
  const [method, setMethod] = useState<string>(initialMethod?.collection || "");
  const [screening, setScreening] = useState("");
  const [privacy, setPrivacy] = useState<string>(
    initialMethod?.privacy || "anonymous_notes",
  );
  const [draft, setDraft] = useState<ExperimentDesignDraft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [appliedDraft, setAppliedDraft] =
    useState<ExperimentDesignDraft | null>(null);
  const [aiStatus, setAiStatus] = useState("");
  const draftPanel = useRef<HTMLElement>(null);

  async function generateDraft() {
    setAiBusy(true);
    setAiStatus("Designing experiment…");
    setError("");
    try {
      const result = await validationRequest<ExperimentDesignDraft>(
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
      );
      setDraft(result);
      setAiStatus("AI draft ready");
      requestAnimationFrame(() => {
        draftPanel.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
        draftPanel.current?.focus({ preventScroll: true });
      });
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message !== "auth"
          ? caught.message
          : "Please sign in again.",
      );
      setAiStatus("AI draft could not be generated. Continue manually.");
    } finally {
      setAiBusy(false);
    }
  }

  function applyDraft() {
    if (!draft) return;
    const recommended = findValidationMethod(draft.recommendedFamily);
    if (!recommended || !methodAvailable(recommended, capabilities)) return;
    setFamily(draft.recommendedFamily);
    setAudience(draft.targetAudience.join("\n"));
    setMethod(draft.suggestedCollectionMethod);
    setScreening(draft.screeningCriteria.join("\n"));
    setPrivacy(draft.privacyMode);
    setAppliedDraft(draft);
    setDraft(null);
    setAiStatus("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const selected = findValidationMethod(family);
    if (!selected || !methodAvailable(selected, capabilities)) {
      setError("Choose a method available in this release.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await validationRequest<{
        experiment: { id: string };
        version: {
          id: string;
          hypothesis_version_id: string;
          family: MethodFamily;
        };
      }>(`/api/validation/subjects/${subjectId}/experiments`, {
        method: "POST",
        body: JSON.stringify({
          hypothesisVersionId,
          family,
          targetAudience: words(audience),
          collectionMethod: method,
          designSnapshot: {
            purpose:
              family === "customer_interview"
                ? "Focused conversations"
                : family === "landing_waitlist"
                  ? "Consented interest in a published offer"
                  : family === "interactive_prototype"
                    ? "Navigation task and explicit participant feedback"
                    : "Structured responses",
          },
          screeningCriteria: words(screening),
          consentPrivacyMode:
            selected.privacy === "identified_with_explicit_consent"
              ? selected.privacy
              : privacy,
        }),
      });
      onDone(
        family === "commercial_intent" ||
          family === "external_mvp" ||
          family === "landing_waitlist" ||
          family === "interactive_prototype"
          ? null
          : createPlanDraftHandoff(
              subjectId,
              hypothesisVersionId,
              appliedDraft,
              created,
            ),
      );
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
        <h3 className="text-xl font-semibold">Create experiment</h3>
        {capabilities.privateAiDesign && (
          <Button
            variant="secondary"
            onClick={generateDraft}
            disabled={aiBusy || busy}
          >
            {aiBusy ? "Generating one draft…" : "Design experiment with AI"}
          </Button>
        )}
      </div>
      {capabilities.privateAiDesign && (
        <p className="text-sm text-slate-300">
          Optional. Each click requests one draft. Applying it never creates or
          starts an experiment.
        </p>
      )}
      <p role="status" aria-live="polite" className="text-sm text-cyan-200">
        {aiStatus}
      </p>
      <MethodPicker
        value={family}
        onSelect={(next) => {
          const selected = findValidationMethod(next);
          if (!selected || !methodAvailable(selected, capabilities)) return;
          setFamily(next);
          setMethod(selected.collection);
          setPrivacy(selected.privacy);
          setAppliedDraft(null);
        }}
      />
      <p className="text-sm text-slate-300">
        Creating an experiment saves a draft. Prepare its content, mark it ready
        and start it before collecting. Publishing a participant link is a
        separate action when available.
      </p>
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
              : family === "landing_waitlist"
                ? "Public validation landing page"
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
          value={
            family === "landing_waitlist" ||
            family === "commercial_intent" ||
            family === "external_mvp"
              ? "identified_with_explicit_consent"
              : privacy
          }
          disabled={
            family === "landing_waitlist" ||
            family === "commercial_intent" ||
            family === "external_mvp"
          }
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
        <aside
          ref={draftPanel}
          tabIndex={-1}
          aria-labelledby="experiment-ai-draft-heading"
          className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[.06] p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            <span id="experiment-ai-draft-heading">AI-assisted draft</span>
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
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setAiStatus("");
              }}
            >
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
        <Button type="submit" disabled={busy || aiBusy || !family}>
          {busy ? "Creating…" : "Create experiment"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
