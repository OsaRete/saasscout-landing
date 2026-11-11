"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Field, SelectInput, TextArea } from "@/components/ui";
import type { PrototypeContent } from "@/lib/validation/prototypes";
import { PrototypePreview } from "@/components/validation/prototype-preview";
export default function PublicPrototype({ token }: { token: string }) {
  const [content, setContent] = useState<PrototypeContent | null>(null),
    [error, setError] = useState(""),
    [started, setStarted] = useState(false),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [outcome, setOutcome] = useState(""),
    [comment, setComment] = useState(""),
    [website, setWebsite] = useState("");
  const [responseHeld, setResponseHeld] = useState(false);
  const entryId = useRef(""),
    submission = useRef<{
      requestId: string;
      outcome: string;
      comment: string;
    } | null>(null);
  const base = `/api/public/validation/prototype/${token}`;
  async function request(action: string, payload?: object) {
    const response = await fetch(
      base + (action ? `/${action}` : ""),
      payload
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, consent: true, website }),
            cache: "no-store",
          }
        : { cache: "no-store" },
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result?.error?.message || "This prototype is unavailable.",
      );
    return result.data;
  }
  useEffect(() => {
    let live = true;
    fetch(base, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("This prototype is closed or unavailable.");
        return r.json();
      })
      .then((x) => {
        if (live) setContent(x.data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [base]);
  async function start() {
    if (!content || !consent) return;
    setBusy(true);
    setError("");
    try {
      entryId.current ||= crypto.randomUUID();
      await request("event", {
        requestId: entryId.current,
        screen: content.screens[0].id,
      });
      setStarted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function navigate(screen: string, target: string) {
    setError("");
    try {
      await request("event", {
        requestId: crypto.randomUUID(),
        screen,
        target,
      });
      await request("event", {
        requestId: crypto.randomUUID(),
        screen: target,
      });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || !outcome || !comment.trim()) return;
    setBusy(true);
    setError("");
    try {
      submission.current ||= {
        requestId: crypto.randomUUID(),
        outcome,
        comment,
      };
      setResponseHeld(true);
      await request("submit", submission.current);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen bg-[#070b14]">
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
          SaaSScout · Private concept test
        </p>
        {!content ? (
          <p role={error ? "alert" : "status"} className="mt-6">
            {error || "Loading prototype…"}
          </p>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-semibold">{content.title}</h1>
            <p className="my-4 whitespace-pre-wrap text-slate-300">
              {content.purpose}
            </p>
            <p className="mb-5 text-sm text-slate-400">
              This is a visual concept. Buttons simulate navigation; they do not
              make purchases, bookings or real changes.
            </p>
            {done ? (
              <div
                role="status"
                className="rounded-2xl border border-emerald-400/30 p-8"
              >
                <h2 className="text-xl">Thank you for your feedback.</h2>
                <p className="mt-3 text-slate-300">
                  Your response was saved privately for the creator.
                </p>
              </div>
            ) : !started ? (
              <section className="space-y-5 rounded-2xl border border-white/10 p-6">
                <label className="flex items-start gap-3 text-sm leading-6">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1"
                  />
                  {content.consent}
                </label>
                <p className="text-xs text-slate-400">
                  Participation is optional. A cookie lasting up to 30 days
                  groups activity for this link. No name or email is requested.
                  Close this page to leave before submitting feedback.
                </p>
                <Button
                  disabled={!consent || busy}
                  onClick={() => void start()}
                >
                  {busy ? "Starting…" : "Explore prototype"}
                </Button>
              </section>
            ) : (
              <>
                <PrototypePreview content={content} onNavigate={navigate} />
                <form
                  onSubmit={submit}
                  className="mt-8 grid gap-4 rounded-2xl border border-white/10 p-6"
                >
                  <h2 className="text-xl font-semibold">
                    Tell us what happened
                  </h2>
                  <p className="text-sm text-slate-400">
                    Feedback is welcome at any point, including if you could not
                    finish. Do not include personal or sensitive information.
                  </p>
                  <fieldset
                    disabled={busy || responseHeld}
                    className="grid gap-4"
                  >
                    <Field label="Could you complete the task?">
                      <SelectInput
                        required
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value)}
                      >
                        <option value="">Choose an answer</option>
                        <option value="yes">Yes</option>
                        <option value="partly">Partly</option>
                        <option value="no">No</option>
                      </SelectInput>
                    </Field>
                    <Field label="What worked, what was confusing, and what would you change?">
                      <TextArea
                        required
                        maxLength={2000}
                        rows={4}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </Field>
                  </fieldset>
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
                  <p className="text-xs text-slate-400">
                    By submitting, you share this feedback under the consent you
                    gave before exploring.
                  </p>
                  <Button
                    type="submit"
                    disabled={busy || !outcome || !comment.trim()}
                  >
                    {busy
                      ? "Submitting…"
                      : responseHeld
                        ? "Retry same response"
                        : "Send feedback"}
                  </Button>
                  {responseHeld && error && (
                    <p className="text-xs text-amber-200">
                      Your response is held unchanged for a safe retry.
                    </p>
                  )}
                </form>
              </>
            )}
            {error && (
              <p role="alert" className="mt-4 text-rose-200">
                {error}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
