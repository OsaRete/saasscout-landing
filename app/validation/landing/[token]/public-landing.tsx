"use client";
import { useEffect, useRef, useState } from "react";
import { LandingPreview } from "@/components/validation/landing-preview";
import type { LandingPublicContent } from "@/lib/validation/landing-pages";
export default function PublicLanding({ token }: { token: string }) {
  const [content, setContent] = useState<LandingPublicContent | null>(null),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [consent, setConsent] = useState(false),
    [website, setWebsite] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const requestId = useRef("");
  const base = `/api/public/validation/landing/${encodeURIComponent(token)}`;
  async function api(path: string, input?: unknown) {
    const r = await fetch(path, {
      method: input ? "POST" : "GET",
      cache: "no-store",
      ...(input
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }
        : {}),
    });
    const payload = await r.json();
    if (!r.ok)
      throw new Error(payload?.error?.message || "This page is unavailable.");
    return payload.data;
  }
  useEffect(() => {
    let active = true;
    if (!requestId.current) requestId.current = crypto.randomUUID();
    void (async () => {
      try {
        const page = await api(base);
        if (!active) return;
        setContent(page);
        await api(`${base}/view`, { requestId: requestId.current });
        if (active) setReady(true);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "This page is unavailable.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [base]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`${base}/submit`, { email, consent, website });
      setDone(true);
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#070b16] px-4 py-10 text-white sm:py-20">
      <div className="mx-auto max-w-5xl">
        {!content && !error && <p role="status">Loading…</p>}
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-rose-400/30 p-4 text-rose-200"
          >
            {error}
          </p>
        )}
        {content && (
          <LandingPreview content={content}>
            {done ? (
              <p
                role="status"
                className="rounded-xl bg-cyan-300/10 p-6 text-cyan-200"
              >
                Thank you. Your interest has been recorded.
              </p>
            ) : (
              <form onSubmit={submit} className="space-y-4 text-left">
                <label className="block text-sm">
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/15 bg-slate-950 p-3"
                  />
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
                <label className="flex items-start gap-3 text-xs leading-5 text-slate-300">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1"
                  />
                  {content.consent}
                </label>
                <button
                  type="submit"
                  disabled={!ready || busy || !consent}
                  className="w-full rounded-xl bg-cyan-300 px-6 py-4 font-bold text-slate-950 disabled:opacity-50"
                >
                  {busy ? "Submitting…" : content.cta}
                </button>
              </form>
            )}
          </LandingPreview>
        )}
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-slate-500">
          Research page powered by SaaSScout. This is an early idea, not a
          purchase or a promise of availability. If you interact, a first-party
          cookie measures browser visits and signups for this page. Your email
          is shared only with the page creator for the stated purpose. Contact
          the creator through the channel where they shared this link to request
          removal.
        </p>
      </div>
    </main>
  );
}
