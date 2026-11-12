"use client";
import { useRef, useState } from "react";
import {
  Button,
  Field,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  EXTERNAL_MVP_CONTACT_CONSENT,
  externalMvpUrl,
  type ExternalMvpContent,
} from "@/lib/validation/external-mvp";
export function ExternalMvpExperience({
  content,
  token,
}: {
  content: ExternalMvpContent;
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
  let url = "";
  try {
    url = externalMvpUrl(content.url);
  } catch {}
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
        `/api/public/validation/external-mvp/${token}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(pending.current),
        },
      );
      const x = await r.json();
      if (!r.ok)
        throw new Error(x?.error?.message || "Could not save feedback.");
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
        <h2 className="text-xl">Thank you for your feedback.</h2>
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
        The MVP is hosted by its creator outside SaaSScout. Its privacy
        practices and content are separate. Review the destination before
        continuing; avoid sharing sensitive information. Opening it does not
        verify use.
      </aside>
      {url && token ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          referrerPolicy="no-referrer"
          className="break-all rounded-lg border border-cyan-400/30 p-3 text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          Open external MVP (new tab)
          <span className="mt-1 block text-xs">{url}</span>
        </a>
      ) : (
        <p className="break-all text-sm text-cyan-200">
          Preview destination: {url || "Enter a valid HTTPS URL"}. Preview opens
          no external site and saves nothing.
        </p>
      )}
      <form onSubmit={submit} className="grid gap-5">
        <h2 className="text-xl font-semibold">Share your feedback</h2>
        <p className="text-sm text-slate-400">
          You may respond without trying the MVP. These are self-reports, not
          verified usage. Do not put personal or sensitive information in
          answers.
        </p>
        <fieldset disabled={busy || held} className="grid min-w-0 gap-4">
          <Field label="Did you complete the task? (self-reported)">
            <SelectInput
              required
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            >
              <option value="">Choose an answer</option>
              <option value="yes">Yes</option>
              <option value="partly">Partly</option>
              <option value="no">No</option>
              <option value="not_tried">I did not try it</option>
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
              {EXTERNAL_MVP_CONTACT_CONSENT}
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
          Participation is optional. Close this page to leave before submitting.
          Feedback and any consented email are retained privately by the
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
              : "Send feedback"}
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
