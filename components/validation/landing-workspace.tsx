"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Field,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  LANDING_CONSENT,
  LANDING_TEMPLATES,
  landingContent,
  landingInterpretation,
  type LandingContent,
} from "@/lib/validation/landing-pages";
import type { LandingDashboard } from "@/lib/validation/server/landing-pages";
import { validationRequest } from "./api";
import { useValidationCapabilities } from "./release-capabilities";
import { LandingPreview } from "./landing-preview";
const initial: LandingContent = {
  template: "spotlight",
  headline: "",
  description: "",
  benefits: [],
  cta: "Join the waitlist",
  visual: "✦",
  consent: LANDING_CONSENT,
  minimumVisitors: 100,
  targetRate: 10,
};
export function LandingWorkspace({
  versionId,
  lifecycle,
}: {
  versionId: string;
  lifecycle: string;
}) {
  const capabilities = useValidationCapabilities();
  const [data, setData] = useState<LandingDashboard | null>(null),
    [draft, setDraft] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [path, setPath] = useState(""),
    [status, setStatus] = useState("");
  const base = `/api/validation/landing-pages/${versionId}`;
  const load = useCallback(async () => {
    try {
      const next = await validationRequest<LandingDashboard>(base);
      setData(next);
      setDraft(next.page?.content || initial);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load landing page.");
    }
  }, [base]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const terminal = ["completed", "cancelled"].includes(lifecycle);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(data?.page?.content || initial);
  async function command(
    action: "save" | "publish" | "unpublish" | "remove",
    submissionId?: string,
  ) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const next = await validationRequest<LandingDashboard>(
        `${base}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({
            revision: data?.page?.revision || 0,
            ...(submissionId ? { submissionId } : {}),
            ...(action === "save"
              ? {
                  content: landingContent({
                    ...draft,
                    benefits: draft.benefits.filter((b) => b.trim()),
                  }),
                }
              : {}),
          }),
        },
      );
      setData(next);
      if (action === "save") setDraft(next.page?.content || initial);
      if (next.publicPath)
        setPath(new URL(next.publicPath, window.location.origin).href);
      if (action === "unpublish") setPath("");
      setStatus(
        action === "save"
          ? "Draft saved. Publish when you are ready to share."
          : action === "remove"
            ? "Contact removed. Metrics now reflect retained submissions."
            : action === "publish"
              ? "Published. Copy the link below; it is shown only now."
              : "Unpublished. The link no longer accepts visits or signups.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action failed.");
    } finally {
      setBusy(false);
    }
  }
  function field<K extends keyof LandingContent>(
    key: K,
    value: LandingContent[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  const metrics = data?.metrics;
  const outcome =
    metrics && data?.page
      ? landingInterpretation(
          metrics.visitors,
          metrics.convertedVisitors,
          data.page.content.minimumVisitors,
          data.page.content.targetRate,
        )
      : null;
  return (
    <section className="mt-6 space-y-6 border-t border-white/10 pt-6">
      <header>
        <h3 className="text-xl font-semibold">Landing Page</h3>
        <p className="mt-2 text-sm text-slate-400">
          Test the hypothesis above by asking your target audience to express
          interest. Set the target before sharing.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-rose-200">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Reload saved page
          </button>
        </p>
      )}
      {!data && !error && <p role="status">Loading landing page…</p>}
      {data && (
        <>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void command("save");
            }}
          >
            <Field label="1. Choose a template">
              <SelectInput
                value={draft.template}
                onChange={(e) =>
                  field(
                    "template",
                    e.target.value as LandingContent["template"],
                  )
                }
              >
                {LANDING_TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Optional visual">
              <SelectInput
                value={draft.visual}
                onChange={(e) => field("visual", e.target.value)}
              >
                <option value="">None</option>
                {["✦", "◎", "↗"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="2. Headline">
              <TextInput
                required
                maxLength={180}
                value={draft.headline}
                onChange={(e) => field("headline", e.target.value)}
              />
            </Field>
            <Field label="CTA label">
              <TextInput
                required
                maxLength={60}
                value={draft.cta}
                onChange={(e) => field("cta", e.target.value)}
              />
            </Field>
            <Field label="Description">
              <TextArea
                required
                maxLength={1500}
                value={draft.description}
                onChange={(e) => field("description", e.target.value)}
              />
            </Field>
            <Field label="Benefits (up to five, one per line)">
              <TextArea
                value={draft.benefits.join("\n")}
                onChange={(e) => field("benefits", e.target.value.split("\n"))}
              />
            </Field>
            <Field label="3. Minimum browser identifiers before interpreting">
              <TextInput
                type="number"
                min={20}
                max={100000}
                required
                value={draft.minimumVisitors}
                onChange={(e) =>
                  field("minimumVisitors", Number(e.target.value))
                }
              />
            </Field>
            <Field label="Target visitor signup rate (%)">
              <TextInput
                type="number"
                min={1}
                max={100}
                required
                value={draft.targetRate}
                onChange={(e) => field("targetRate", Number(e.target.value))}
              />
            </Field>
            <p className="text-xs text-slate-400 md:col-span-2">
              The public form asks only for email and explicit consent. Built-in
              visuals make no external tracking requests. Changing the target
              after seeing results makes the conclusion exploratory.
            </p>
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <Button type="submit" disabled={busy || terminal}>
                Save draft
              </Button>
              <Button variant="secondary" onClick={() => setPreview((p) => !p)}>
                {preview ? "Hide preview" : "Preview page"}
              </Button>
            </div>
          </form>
          {preview && (
            <div>
              <p className="mb-3 text-xs text-cyan-200">
                Preview — form disabled; no views or submissions recorded.
              </p>
              <LandingPreview content={draft} />
              <p className="mt-2 text-xs text-slate-400">
                Consent: {LANDING_CONSENT}
              </p>
            </div>
          )}
          <div className="rounded-2xl bg-white/5 p-5">
            <h4 className="font-semibold">4. Publish and share</h4>
            <p className="my-3 text-sm text-slate-400">
              {data.publication
                ? `Published revision ${data.publication.revision}. Draft revision ${data.page?.revision}. Republish replaces the link and keeps earlier results.`
                : "Not published."}{" "}
              Publication accepts participation only while this experiment is
              running. Save, mark ready and start the experiment using the
              controls above.
            </p>
            {!capabilities.publicLandingParticipation && (
              <p className="mb-3 text-sm text-amber-200">
                Public participation is disabled for this release.
                Owner-approved activation is required before publishing.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  busy ||
                  dirty ||
                  !data.page ||
                  lifecycle !== "running" ||
                  !capabilities.publicLandingParticipation
                }
                onClick={() => void command("publish")}
              >
                {data.publication ? "Republish with a new link" : "Publish"}
              </Button>
              {data.publication && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void command("unpublish")}
                >
                  Unpublish
                </Button>
              )}
            </div>
            {dirty && (
              <p className="mt-2 text-xs text-slate-400">
                Save your draft before publishing.
              </p>
            )}
            {path && (
              <div className="mt-4">
                <label className="text-sm">
                  Share URL
                  <input
                    aria-label="Share URL"
                    className="mt-2 w-full rounded-lg bg-slate-950 p-3 text-sm"
                    readOnly
                    value={path}
                  />
                </label>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(path)
                      .then(() => setStatus("Link copied."))
                      .catch(() => setStatus("Select and copy the link above."))
                  }
                >
                  Copy link
                </Button>
              </div>
            )}
            {data.publication && !path && (
              <p className="mt-3 text-xs text-slate-400">
                For privacy, the secret URL cannot be recovered. Use your saved
                link or republish to generate a replacement.
              </p>
            )}
          </div>
          <p role="status" className="text-sm text-cyan-200">
            {status}
          </p>
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">5. Review interest</h4>
              <Button
                variant="ghost"
                disabled={dirty || busy}
                onClick={() => void load()}
              >
                Refresh results
              </Button>
            </div>
            {metrics && data.page && (
              <>
                <dl className="my-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {[
                    ["Recorded views", metrics.views],
                    ["Unique browser identifiers", metrics.visitors],
                    ["Valid retained email submissions", metrics.submissions],
                    [
                      "Visitor signup rate",
                      outcome?.rate == null
                        ? "—"
                        : `${outcome.rate.toFixed(1)}%`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-white/5 p-4">
                      <dt className="text-xs text-slate-400">{label}</dt>
                      <dd className="mt-2 text-2xl font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-sm">
                  <strong className="capitalize">{outcome?.state}</strong> for
                  the saved interest target of {data.page?.content.targetRate}%
                  after {data.page?.content.minimumVisitors} browser
                  identifiers.
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {outcome?.state === "supporting"
                    ? "Interest meets your target. Interview signups to check their problem and test a concrete commitment."
                    : outcome?.state === "contradicting"
                      ? "Interest is below your target. Review audience fit and the offer; test a revised hypothesis before building."
                      : "Collect more relevant traffic before drawing a conclusion."}{" "}
                  This is a descriptive comparison, not statistical proof. It
                  tests interest in this offer, not the entire hypothesis or
                  willingness to pay.
                </p>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Counts include retained submissions across all published
                  revisions of this page. Removing a contact updates the counts.
                  Browser identifiers are scoped to each share link and expire
                  with cookies; they are not verified people. Multiple emails
                  from one browser count as contacts, but only one converted
                  visitor. Bots, shared devices, cookie clearing, link rotation
                  and blocked tracking affect counts. No visit is counted until
                  the browser records it. Email ownership is unverified.
                </p>
              </>
            )}
            <h5 className="mb-3 mt-5 font-semibold">Consented submissions</h5>
            <p className="mb-3 text-xs text-slate-400">
              Latest 100 contacts; totals above include every accepted
              submission. Use contact data only for the consented purpose.
              Handle removal requests before further contact.
            </p>
            <ul className="space-y-2">
              {data.submissions.map((s) => (
                <li key={s.id} className="rounded-xl bg-white/5 p-3 text-sm">
                  <p className="break-all">{s.email}</p>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void command("remove", s.id)}
                  >
                    Remove contact
                  </Button>
                  <p className="text-xs text-slate-400">
                    {new Date(s.submitted_at).toLocaleString()} · Explicit
                    consent recorded
                  </p>
                </li>
              ))}
            </ul>
            {!data.submissions.length && (
              <p className="text-sm text-slate-400">
                No valid submissions yet.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
