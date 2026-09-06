"use client";

import { useRef, useState } from "react";
import { Button, Field, TextArea, TextInput } from "@/components/ui";
import type { HypothesisDesignDraft } from "@/lib/validation/design-assistant/contracts";
import { validationRequest, words } from "./api";
import { card } from "./validation-shell";

export type HypothesisVersion = {
  id: string;
  hypothesis_id: string;
  version_number: number;
  target_segment: string;
  problem_claim: string;
  expected_observable_behavior: string;
  commercial_assumption: string | null;
  support_criteria: string[];
  contradiction_criteria: string[];
  inconclusive_criteria: string[];
  scope_included: string[];
  scope_excluded: string[];
  created_at: string;
};

export function HypothesisForm({
  subjectId,
  hypothesisId,
  current,
  onDone,
  onCancel,
}: {
  subjectId: string;
  hypothesisId?: string;
  current?: HypothesisVersion;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState({
    targetSegment: current?.target_segment || "",
    problemClaim: current?.problem_claim || "",
    expectedObservableBehavior: current?.expected_observable_behavior || "",
    commercialAssumption: current?.commercial_assumption || "",
    support: (current?.support_criteria || []).join("\n"),
    contradiction: (current?.contradiction_criteria || []).join("\n"),
    inconclusive: (current?.inconclusive_criteria || []).join("\n"),
  });
  const [draft, setDraft] = useState<HypothesisDesignDraft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const draftPanel = useRef<HTMLElement>(null);
  const field =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: event.target.value });

  async function generateDraft() {
    setAiBusy(true);
    setAiStatus("Generating draft…");
    setError("");
    try {
      const result = await validationRequest<HypothesisDesignDraft>(
        "/api/validation/design-assistant",
        {
          method: "POST",
          body: JSON.stringify({
            mode: "hypothesis",
            subjectId,
            draftInput: {
              targetSegment: form.targetSegment,
              problemClaim: form.problemClaim,
              ...(form.expectedObservableBehavior
                ? {
                    expectedObservableBehavior: form.expectedObservableBehavior,
                  }
                : {}),
            },
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
    setForm((value) => ({
      ...value,
      targetSegment: draft.targetCustomerAssumption,
      problemClaim: draft.problemAssumption,
      expectedObservableBehavior: draft.expectedCurrentBehavior,
      contradiction: draft.weakeningEvidence.join("\n"),
    }));
    setDraft(null);
    setAiStatus("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body={targetSegment: form.targetSegment,
      problemClaim: form.problemClaim,
      expectedObservableBehavior: form.expectedObservableBehavior,
      ...(form.commercialAssumption
        ? { commercialAssumption: form.commercialAssumption }
        : {}),
      supportCriteria: words(form.support),
      contradictionCriteria: words(form.contradiction),
      inconclusiveCriteria: words(form.inconclusive),
      scope: { included: [], excluded: [] },
      ...(current ? { supersedesVersionId: current.id } : {}),
    };
    try {
      await validationRequest(
        hypothesisId
          ? `/api/validation/hypotheses/${hypothesisId}/versions`
          : `/api/validation/subjects/${subjectId}/hypotheses`,
        { method: "POST", body: JSON.stringify(body) },
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

  const hasSeed =
    form.targetSegment.trim().length >= 8 &&
    form.problemClaim.trim().length >= 8;
  return (
    <form onSubmit={submit} className={`${card} grid gap-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">
          {current
            ? `Revise hypothesis — creates V${current.version_number + 1}`
            : "Define hypothesis"}
        </h3>
        <Button
          variant="secondary"
          onClick={generateDraft}
          disabled={!hasSeed || aiBusy || busy}
        >
          {aiBusy ? "Generating one draft…" : "Improve with AI"}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Optional. Add a target customer and problem first. Each click requests
        one AI draft.
      </p>
      <p role="status" aria-live="polite" className="text-sm text-cyan-200">
        {aiStatus}
      </p>
      <Field label="Target customer / segment">
        <TextInput
          required
          minLength={8}
          value={form.targetSegment}
          onChange={field("targetSegment")}
        />
      </Field>
      <Field label="Problem or pain hypothesis">
        <TextArea
          required
          minLength={12}
          rows={3}
          value={form.problemClaim}
          onChange={field("problemClaim")}
        />
      </Field>
      <Field label="Expected observable behavior">
        <TextArea
          required
          minLength={8}
          rows={2}
          value={form.expectedObservableBehavior}
          onChange={field("expectedObservableBehavior")}
        />
      </Field>
      <Field label="Commercial assumption (optional)">
        <TextInput
          value={form.commercialAssumption}
          onChange={field("commercialAssumption")}
        />
      </Field>
      {[
        ["What evidence would support this?", "support"],
        ["What evidence would contradict this?", "contradiction"],
        ["What would be inconclusive?", "inconclusive"],
      ].map(([label, key]) => (
        <Field key={key} label={label} helper="One criterion per line.">
          <TextArea
            required
            rows={2}
            value={form[key as keyof typeof form]}
            onChange={field(key as keyof typeof form)}
          />
        </Field>
      ))}
      {draft && (
        <aside
          ref={draftPanel}
          tabIndex={-1}
          aria-labelledby="hypothesis-ai-draft-heading"
          className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[.06] p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
            <span id="hypothesis-ai-draft-heading">AI-assisted draft</span>
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Review and edit before saving. This is design assistance, not
            evidence.
          </p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Suggested statement</dt>
              <dd>{draft.hypothesisStatement}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Most important uncertainty</dt>
              <dd>{draft.mostImportantUncertainty}</dd>
            </div>
          </dl>
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
        <Button type="submit" disabled={busy || aiBusy}>
          {busy
            ? "Saving…"
            : current
              ? "Create new version"
              : "Define hypothesis"}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
