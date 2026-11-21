"use client";
import { useEffect, useState } from "react";
import { usePublicSubmission } from "@/components/validation/use-public-submission";
import {
  SURVEY_CONSENT_LABEL,
  SURVEY_NOTICE,
  SURVEY_NOTICE_VERSION,
} from "@/lib/validation/survey-participation";

type Question = {
  questionRef: string;
  prompt: string;
  type:
    "single_choice" | "multiple_choice" | "short_text" | "long_text" | "number";
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
};
type Survey = {
  title: string;
  purpose: string;
  questions: Question[];
};
export default function PublicSurvey({ token }: { token: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null),
    [answers, setAnswers] = useState<
      Record<string, string | string[] | number>
    >({}),
    [status, setStatus] = useState<"loading" | "ready" | "closed">("loading");
  const [consent, setConsent] = useState(false);
  const {
    submit: send,
    busy,
    held,
    done,
    stopped,
    waiting,
    error,
  } = usePublicSubmission();
  useEffect(() => {
    fetch(`/api/public/surveys/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return (await r.json()).data;
      })
      .then((data) => {
        setSurvey(data);
        setStatus("ready");
      })
      .catch(() => setStatus("closed"));
  }, [token]);
  function set(id: string, value: string | string[] | number) {
    setAnswers((old) => ({ ...old, [id]: value }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) return;
    await send(
      `/api/public/surveys/${encodeURIComponent(token)}/responses`,
      () => ({
        consent,
        consentNoticeVersion: SURVEY_NOTICE_VERSION,
        idempotencyKey: crypto.randomUUID(),
        answers: survey!.questions
          .filter(
            (q) =>
              answers[q.questionRef] !== undefined &&
              answers[q.questionRef] !== "",
          )
          .map((q) => ({
            questionRef: q.questionRef,
            value: answers[q.questionRef],
          })),
      }),
    );
  }
  if (status === "loading")
    return (
      <Shell>
        <p>Loading survey…</p>
      </Shell>
    );
  if (status === "closed")
    return (
      <Shell>
        <h1 className="text-3xl font-bold">Survey unavailable</h1>
        <p className="mt-4 text-slate-600">
          This survey is closed or the link is invalid.
        </p>
      </Shell>
    );
  if (done)
    return (
      <Shell>
        <h1 className="text-3xl font-bold">Thank you</h1>
        <p className="mt-4 text-slate-600">
          Your research response was submitted successfully.
        </p>
      </Shell>
    );
  return (
    <Shell>
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-violet-700">
          Independent research survey
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-950">
          {survey!.title}
        </h1>
        <p className="mt-3 leading-7 text-slate-600">{survey!.purpose}</p>
      </header>
      <form onSubmit={submit} className="mt-8 space-y-8">
        {survey!.questions.map((q, i) => (
          <fieldset
            disabled={busy || held}
            key={q.questionRef}
            className="border-0 p-0"
          >
            <legend className="font-semibold text-slate-900">
              {i + 1}. {q.prompt}{" "}
              {q.required && (
                <span className="text-rose-600" aria-label="required">
                  *
                </span>
              )}
            </legend>
            <Question
              question={q}
              value={answers[q.questionRef]}
              set={(v) => set(q.questionRef, v)}
            />
          </fieldset>
        ))}
        <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <p id="survey-participation-notice">
            {SURVEY_NOTICE}{" "}
            <a
              href="/privacy"
              referrerPolicy="no-referrer"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-violet-700 underline"
            >
              Privacy Policy (opens in a new tab)
            </a>
          </p>
          <label className="flex min-h-11 items-start gap-3 py-2 font-medium text-slate-900">
            <input
              type="checkbox"
              required
              checked={consent}
              disabled={busy || held || stopped}
              onChange={(event) => setConsent(event.target.checked)}
              aria-describedby="survey-participation-notice"
              className="mt-1 size-4 shrink-0 accent-violet-700"
            />
            {SURVEY_CONSENT_LABEL}
          </label>
        </div>
        {held && !stopped && (
          <p className="text-sm text-amber-900">
            Your response is held unchanged for a safe retry.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <button
          disabled={busy || stopped || waiting}
          className="w-full rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy
            ? "Submitting…"
            : waiting
              ? "Please wait…"
              : stopped
                ? "Submission unavailable"
                : held
                  ? "Retry same response"
                  : "Submit response"}
        </button>
      </form>
    </Shell>
  );
}
function Question({
  question: q,
  value,
  set,
}: {
  question: Question;
  value: unknown;
  set: (v: string | string[] | number) => void;
}) {
  if (q.type === "single_choice")
    return (
      <div className="mt-3 space-y-2">
        {q.options!.map((o) => (
          <label key={o} className="flex gap-3">
            <input
              required={q.required}
              type="radio"
              name={q.questionRef}
              checked={value === o}
              onChange={() => set(o)}
            />
            {o}
          </label>
        ))}
      </div>
    );
  if (q.type === "multiple_choice")
    return (
      <div className="mt-3 space-y-2">
        {q.options!.map((o) => {
          const selected = Array.isArray(value) ? (value as string[]) : [];
          return (
            <label key={o} className="flex gap-3">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) =>
                  set(
                    e.target.checked
                      ? [...selected, o]
                      : selected.filter((x) => x !== o),
                  )
                }
              />
              {o}
            </label>
          );
        })}
      </div>
    );
  if (q.type === "long_text")
    return (
      <textarea
        required={q.required}
        maxLength={4000}
        rows={5}
        value={String(value ?? "")}
        onChange={(e) => set(e.target.value)}
        className="mt-3 w-full rounded-xl border border-slate-300 p-3"
      />
    );
  return (
    <input
      required={q.required}
      type={q.type === "number" ? "number" : "text"}
      min={q.min}
      max={q.max}
      maxLength={q.type === "short_text" ? 500 : undefined}
      value={String(value ?? "")}
      onChange={(e) =>
        set(q.type === "number" ? e.target.valueAsNumber : e.target.value)
      }
      className="mt-3 w-full rounded-xl border border-slate-300 p-3"
    />
  );
}
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-950">
      <section className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-sm sm:p-10">
        {children}
      </section>
    </main>
  );
}
