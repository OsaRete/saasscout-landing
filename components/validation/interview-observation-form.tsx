"use client";

import { useRef, useState } from "react";
import { Button, Field, SelectInput, TextArea } from "@/components/ui";
import { validationErrorMessage, validationRequest } from "./api";

type PendingObservationCommand = {
  ingestionKey: string;
  observedAt: string;
};

const observationErrorMessage = (cause: unknown) => {
  const error = cause as { code?: unknown };
  if (error?.code === "idempotency_conflict") {
    return "This observation conflicts with an earlier submission. Refresh the evidence list before starting a new observation.";
  }
  return validationErrorMessage(
    cause,
    "Could not record interview observation.",
  );
};

export function InterviewObservationForm({
  sessionId,
  onDone,
}: {
  sessionId: string;
  onDone: () => void | Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("other");
  const [kind, setKind] = useState("summary");
  const [polarity, setPolarity] = useState("");
  const [shareableStatement, setShareableStatement] = useState("");
  const [shareableReviewed, setShareableReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pendingCommand = useRef<PendingObservationCommand | null>(null);

  async function record() {
    if (saving) return;

    // One command identity and observation time survive every uncertain retry.
    // They rotate only after the server has confirmed the complete command.
    const command =
      pendingCommand.current ??
      (pendingCommand.current = {
        ingestionKey: crypto.randomUUID(),
        observedAt: new Date().toISOString(),
      });

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const statement = shareableStatement.trim();
      const observation = await validationRequest<{ id: string }>(
        "/api/validation/interview-observations",
        {
          method: "POST",
          body: JSON.stringify({
            interviewSessionId: sessionId,
            observedAt: command.observedAt,
            category,
            statementKind: kind,
            content,
            ingestionKey: command.ingestionKey,
            ...(statement
              ? {
                  shareableEvidence: {
                    statement,
                    reviewedForSharedEvidenceUse:shareableReviewed,
                  },
                }
              : {}),
          }),
        },
      );
      if (polarity) {
        await validationRequest("/api/validation/classifications", {
          method: "POST",
          body: JSON.stringify({
            observationId: observation.id,
            polarity,
            classificationSource: "user_supplied",
            authorityStatus: "authoritative",
          }),
        });
      }
      await onDone();
      pendingCommand.current = null;
      setContent("");
      setCategory("other");
      setKind("summary");
      setPolarity("");
      setShareableStatement("");
      setShareableReviewed(false);
      setSuccess("Observation recorded. The form is ready for new evidence.");
    } catch (cause) {
      setError(observationErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  const hasShareableStatement = Boolean(shareableStatement.trim());
  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      <p className="text-sm font-semibold">Explicit evidence observation</p>
      <p className="text-xs text-slate-400">
        Choose what becomes immutable private evidence. Negative and
        contradictory findings are legitimate.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <SelectInput
          aria-label="Observation category"
          value={category}
          disabled={saving}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="problem_experienced">Problem experienced</option>
          <option value="problem_not_experienced">
            Problem not experienced
          </option>
          <option value="frequency">Frequency</option>
          <option value="current_workaround">Current workaround</option>
          <option value="contradiction">Contradiction</option>
          <option value="other">Other</option>
        </SelectInput>
        <SelectInput
          aria-label="Statement kind"
          value={kind}
          disabled={saving}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="summary">User summary</option>
          <option value="direct_quote">Direct quote (verbatim)</option>
        </SelectInput>
        <SelectInput
          aria-label="Optional classification"
          value={polarity}
          disabled={saving}
          onChange={(event) => setPolarity(event.target.value)}
        >
          <option value="">No classification</option>
          <option value="supporting">Supporting</option>
          <option value="contradicting">Contradicting</option>
          <option value="mixed">Mixed</option>
          <option value="neutral">Neutral</option>
          <option value="inconclusive">Inconclusive</option>
        </SelectInput>
      </div>
      <Field
        label="Private observation content"
        helper="Immutable source evidence. Nothing is inferred from the working notes above."
      >
        <TextArea
          rows={3}
          maxLength={4000}
          value={content}
          disabled={saving}
          onChange={(event) => setContent(event.target.value)}
        />
      </Field>
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[.04] p-3">
        <Field
          label="Shareable evidence statement (optional)"
          helper="A concise human statement that may later contribute to shared Problem Intelligence. Leaving it empty keeps this observation private-only; it is not published or promoted here."
        >
          <TextArea
            rows={2}
            maxLength={500}
            value={shareableStatement}
            disabled={saving}
            onChange={(event) => {
              setShareableStatement(event.target.value);
              setShareableReviewed(false);
            }}
          />
        </Field>
        <p className="mt-2 text-xs text-slate-400">
          Describe the observed problem without names, company names, contact
          details, addresses, private links, participant or session references,
          secrets, or uniquely identifying details.
        </p>
        {hasShareableStatement && (
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={shareableReviewed}
              disabled={saving}
              onChange={(event) => setShareableReviewed(event.target.checked)}
            />
            <span>
              I wrote or reviewed this exact statement and confirm it is
              faithful to the private evidence and prepared for shared evidence
              use.
            </span>
          </label>
        )}
      </div>
      <Button
        disabled={
          saving ||
          !content.trim() ||
          (hasShareableStatement && !shareableReviewed)
        }
        onClick={record}
      >
        {saving ? "Recording…" : "Record immutable observation"}
      </Button>
      <div aria-live="polite" aria-atomic="true">
        {saving && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-cyan-200"
          >
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-200/30 border-t-cyan-200"
            />
            Recording immutable observation…
          </p>
        )}
        {!saving && error && (
          <p role="alert" className="text-sm text-rose-200">
            {error}
          </p>
        )}
        {!saving && !error && success && (
          <p role="status" className="text-sm text-emerald-200">
            {success}
          </p>
        )}
      </div>
    </div>
  );
}
