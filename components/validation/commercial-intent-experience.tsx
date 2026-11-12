"use client";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Field,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  COMMERCIAL_INTENT_CONTACT_CONSENT,
  COMMERCIAL_OBJECTIVES,
  type CommercialIntentContent,
} from "@/lib/validation/commercial-intent";
export function CommercialIntentExperience({
  content,
  token,
}: {
  content: CommercialIntentContent;
  token?: string;
}) {
  const [answers, setAnswers] = useState<string[]>(
      content.questions.map(() => ""),
    ),
    [outcome, setOutcome] = useState(""),
    [email, setEmail] = useState(""),
    [consent, setConsent] = useState(false),
    [contactConsent, setContactConsent] = useState(false),
    [website, setWebsite] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState(""),
    [held, setHeld] = useState(false);
  const pending = useRef<object | null>(null);
  const viewRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!token) return;
    viewRequest.current ||= crypto.randomUUID();
    void fetch(`/api/public/validation/commercial-intent/${token}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ requestId: viewRequest.current, website: "" }),
    }).catch(() => {});
  }, [token]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !consent) return;
    setBusy(true);
    setError("");
    pending.current ||= {
      requestId: crypto.randomUUID(),
      outcome,
      answers,
      email,
      consent,
      contactConsent,
      website,
    };
    setHeld(true);
    try {
      const r = await fetch(
        `/api/public/validation/commercial-intent/${token}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(pending.current),
        },
      );
      const x = await r.json();
      if (!r.ok)
        throw new Error(x?.error?.message || "Could not save response.");
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <section
        role="status"
        className="rounded-2xl border border-emerald-400/30 p-6"
      >
        <h2 className="text-xl">Thank you for your response.</h2>
        <p className="mt-3 text-slate-300">
          Your response was saved privately for the creator.
        </p>
      </section>
    );
  return (
    <section className="grid gap-5 rounded-2xl border border-white/10 bg-[#0b1220] p-5 text-white sm:p-7">
      <h1 className="text-2xl font-semibold">{content.title}</h1>
      <p className="whitespace-pre-wrap text-slate-300">{content.purpose}</p>
      <p className="whitespace-pre-wrap text-slate-300">
        {content.instructions}
      </p>
      <aside className="rounded-xl border border-amber-300/20 p-4 text-sm text-slate-300">
        {COMMERCIAL_OBJECTIVES[content.objective]}. This is nonbinding research.
        No purchase, payment, reservation, subscription or financial commitment
        is created. The creator may follow up only if you separately consent to
        sharing your email.
      </aside>
      {!token && (
        <p className="text-sm text-cyan-200">
          Preview only. Nothing is submitted or counted.
        </p>
      )}
      <form onSubmit={submit} className="grid gap-5">
        <h2 className="text-xl font-semibold">Respond to the offer</h2>
        <p className="text-sm text-slate-400">
          Choose whether you want the action described above under the stated
          conditions. You can decline. Do not put personal or sensitive
          information in answers.
        </p>
        <fieldset disabled={busy || held} className="grid min-w-0 gap-4">
          <Field label="Your nonbinding response">
            <SelectInput
              required
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              <option value="">Choose an answer</option>
              <option value="interested">
                {COMMERCIAL_OBJECTIVES[content.objective]}
              </option>
              <option value="not_now">Not interested at this time</option>
            </SelectInput>
          </Field>
          {content.questions.map((q, i) => (
            <Field key={i} label={q}>
              <TextArea
                required
                maxLength={2000}
                rows={3}
                value={answers[i] || ""}
                onChange={(e) =>
                  setAnswers(
                    answers.map((a, n) => (n === i ? e.target.value : a)),
                  )
                }
              />
            </Field>
          ))}
          <Field label="Email for follow-up (optional)">
            <TextInput
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {email && (
            <label className="flex items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                required
                checked={contactConsent}
                onChange={(e) => setContactConsent(e.target.checked)}
                className="mt-1"
              />
              {COMMERCIAL_INTENT_CONTACT_CONSENT}
            </label>
          )}
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            {content.consent}
          </label>
          <div className="hidden" aria-hidden="true">
            <label>
              Website
              <input
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <p className="text-xs leading-5 text-slate-400">
          Anonymous page loads are recorded as events, without cookies or unique-person tracking. Participation is optional. Close this page to leave before submitting.
          Response and any consented email are retained privately by the
          creator. For contact removal, use the channel that supplied this link.
          No identity or independent participant verification is performed.
        </p>
        <Button
          type="submit"
          disabled={
            !token ||
            busy ||
            !consent ||
            !outcome ||
            answers.some((a) => !a.trim()) ||
            (!!email && !contactConsent)
          }
        >
          {busy
            ? "Submitting…"
            : held
              ? "Retry same response"
              : "Submit nonbinding response"}
        </Button>
        {error && (
          <p role="alert" className="text-rose-200">
            {error}
          </p>
        )}
        {held && error && (
          <p className="text-sm text-amber-200">
            Your response is held unchanged for a safe retry. Contact the
            creator if the link has closed.
          </p>
        )}
      </form>
    </section>
  );
}
