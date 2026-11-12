"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Field, TextInput, TextArea } from "@/components/ui";
import {
  externalMvpContent,
  externalMvpTemplate,
  type ExternalMvpContent,
} from "@/lib/validation/external-mvp";
import type { ExternalMvpDashboard } from "@/lib/validation/server/external-mvp";
import { validationRequest, validationErrorMessage, displayDate } from "./api";
import { useValidationCapabilities } from "./release-capabilities";
import { ExternalMvpExperience } from "./external-mvp-experience";
export function ExternalMvpWorkspace({
  versionId,
  lifecycle,
}: {
  versionId: string;
  lifecycle: string;
}) {
  const capabilities = useValidationCapabilities();
  const [data, setData] = useState<ExternalMvpDashboard | null>(null),
    [draft, setDraft] = useState(externalMvpTemplate),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [tab, setTab] = useState("edit"),
    [mobile, setMobile] = useState(false),
    [link, setLink] = useState("");
  const base = `/api/validation/external-mvp/${versionId}`;
  const load = useCallback(async () => {
    try {
      const x = await validationRequest<ExternalMvpDashboard>(base);
      setData(x);
      setDraft(x.page?.content || externalMvpTemplate());
      setDirty(false);
      setError("");
    } catch (e) {
      setError(validationErrorMessage(e, "Could not load the MVP test."));
    }
  }, [base]);
  useEffect(() => {
    let active = true;
    validationRequest<ExternalMvpDashboard>(base)
      .then((x) => {
        if (active) {
          setData(x);
          setDraft(x.page?.content || externalMvpTemplate());
          setDirty(false);
          setError("");
        }
      })
      .catch((e) => {
        if (active)
          setError(validationErrorMessage(e, "Could not load the MVP test."));
      });
    return () => {
      active = false;
    };
  }, [base]);
  function edit(patch: Partial<ExternalMvpContent>) {
    setDraft({ ...draft, ...patch });
    setDirty(true);
    setStatus("");
  }
  async function command(action: string, submissionId?: string) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const content = action === "save" ? externalMvpContent(draft) : undefined;
      const x = await validationRequest<ExternalMvpDashboard>(
        `${base}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({
            revision: data?.page?.revision || 0,
            ...(content ? { content } : {}),
            ...(submissionId ? { submissionId } : {}),
          }),
        },
      );
      setData(x);
      if (action === "save" || action === "publish") {
        setDraft(x.page?.content || draft);
        setDirty(false);
      }
      if (x.publicPath) setLink(location.origin + x.publicPath);
      if (action === "unpublish") setLink("");
      setStatus(
        action === "publish"
          ? "Published. Copy and keep the secret link now; it cannot be recovered later."
          : action === "remove"
            ? "Contact removed. Retried responses cannot restore it."
            : action === "save"
              ? "Revision saved. Publish explicitly to replace participant content."
              : "Participant link closed.",
      );
    } catch (e) {
      setError(validationErrorMessage(e, "Could not complete this action."));
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="mt-5 p-5">
        <p role={error ? "alert" : "status"}>{error || "Loading MVP test…"}</p>
        {error && <Button onClick={() => void load()}>Retry</Button>}
      </section>
    );
  const terminal = ["completed", "cancelled"].includes(lifecycle);
  return (
    <section
      aria-label="External MVP Testing"
      className="mt-6 space-y-5 border-t border-white/10 pt-6"
    >
      <h3 className="text-xl font-semibold">External MVP Testing</h3>
      <p className="text-sm text-slate-400">
        Invite participants to try your externally hosted MVP and share
        structured feedback. SaaSScout does not generate, host, deploy or run
        it.
      </p>
      <div className="flex flex-wrap gap-2">
        {["edit", "preview", "results"].map((t) => (
          <Button
            key={t}
            variant="secondary"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>
      {tab === "edit" && (
        <fieldset disabled={busy || terminal} className="grid min-w-0 gap-4">
          <Field label="Test title">
            <TextInput
              maxLength={180}
              value={draft.title}
              onChange={(e) => edit({ title: e.target.value })}
            />
          </Field>
          <Field
            label="External MVP URL"
            helper="Public HTTPS only. No credentials, custom ports, IP addresses or fragments. SaaSScout never fetches this URL."
          >
            <TextInput
              type="url"
              maxLength={2000}
              value={draft.url}
              onChange={(e) => edit({ url: e.target.value })}
              placeholder="https://your-product.com/try"
            />
          </Field>
          <Field label="Test objective">
            <TextArea
              maxLength={1000}
              value={draft.purpose}
              onChange={(e) => edit({ purpose: e.target.value })}
            />
          </Field>
          <Field label="Participant instructions">
            <TextArea
              maxLength={2000}
              rows={4}
              value={draft.instructions}
              onChange={(e) => edit({ instructions: e.target.value })}
            />
          </Field>
          <p className="text-sm text-slate-400">
            Ask 1–5 focused questions. Avoid requesting personal information;
            email is optional and separately consented.
          </p>
          {draft.questions.map((q, i) => (
            <div key={i} className="grid gap-2">
              <Field label={`Feedback question ${i + 1}`}>
                <TextInput
                  maxLength={240}
                  value={q}
                  onChange={(e) =>
                    edit({
                      questions: draft.questions.map((v, n) =>
                        n === i ? e.target.value : v,
                      ),
                    })
                  }
                />
              </Field>
              <Button
                variant="ghost"
                disabled={draft.questions.length <= 1}
                onClick={() =>
                  edit({ questions: draft.questions.filter((_, n) => n !== i) })
                }
              >
                Remove question {i + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            disabled={draft.questions.length >= 5}
            onClick={() => edit({ questions: [...draft.questions, ""] })}
          >
            Add question
          </Button>
          <Button disabled={!dirty} onClick={() => void command("save")}>
            Save revision
          </Button>
        </fieldset>
      )}
      {terminal && tab === "edit" && (
        <p>
          This experiment has ended. Results and contact removal remain
          available.
        </p>
      )}
      {tab === "preview" && (
        <>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              aria-pressed={!mobile}
              onClick={() => setMobile(false)}
            >
              Desktop
            </Button>
            <Button
              variant="secondary"
              aria-pressed={mobile}
              onClick={() => setMobile(true)}
            >
              Mobile
            </Button>
          </div>
          <div className={mobile ? "mx-auto w-full max-w-[390px]" : "w-full"}>
            <ExternalMvpExperience
              key={JSON.stringify(draft)}
              content={draft}
            />
          </div>
        </>
      )}
      {tab === "results" && (
        <div className="space-y-4">
          <h4 className="font-semibold">
            Private results · all published revisions
          </h4>
          <p>
            {data.metrics.submissions} feedback submissions ·{" "}
            {data.metrics.contacts} retained contacts
          </p>
          <p className="text-sm text-slate-400">
            Submissions and self-reported outcomes do not prove external MVP
            use, verified identity, independent people or market demand. Bots
            and repeat submissions can affect counts. No shared Data Moat
            promotion.
          </p>
          <ul className="flex flex-wrap gap-4 text-sm">
            {data.metrics.outcomes.map((x) => (
              <li key={x.outcome}>
                {
                  (
                    {
                      yes: "Reported completion",
                      partly: "Reported partial completion",
                      no: "Reported no completion",
                      not_tried: "Did not try",
                    } as Record<string, string>
                  )[x.outcome]
                }
                : {x.count}
              </li>
            ))}
          </ul>
          <p className="text-sm text-slate-300">
            Next: review blockers and conflicting responses, then follow up with
            relevant participants before changing your hypothesis.
          </p>
          <p className="text-xs text-slate-400">
            Latest 100 submissions; totals include all retained feedback.
            Answers show the questions from the exact published revision.
          </p>
          {!data.submissions.length && (
            <p>
              No feedback yet. Share the participant link with your target
              audience.
            </p>
          )}
          {data.submissions.map((s) => (
            <article
              key={s.id}
              className="space-y-3 rounded-xl border border-white/10 p-4"
            >
              <p className="text-xs text-cyan-200">
                Revision {s.revision} · self-report: {s.outcome} ·{" "}
                {displayDate(s.submitted_at)}
              </p>
              {s.answers.map((a, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold">{a.question}</p>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-300">
                    {a.answer}
                  </p>
                </div>
              ))}
              {s.email && (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="break-all text-sm">
                    Unverified contact: {s.email}
                  </p>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Remove this email permanently? Raw feedback will remain.",
                        )
                      )
                        void command("remove", s.id);
                    }}
                  >
                    Remove contact
                  </Button>
                </div>
              )}
            </article>
          ))}
          <Button
            variant="secondary"
            disabled={busy || dirty}
            onClick={() => void load()}
          >
            Refresh results
          </Button>
          {dirty && <p>Save edits before refreshing.</p>}
        </div>
      )}
      <div className="space-y-3 rounded-xl border border-cyan-400/20 p-4">
        <p>
          {data.publication
            ? `Participant link active · published revision ${data.publication.revision}`
            : "No active participant link"}
        </p>
        <p className="text-xs text-slate-400">
          Save, mark ready and start the experiment above, then publish. Editing
          leaves the current publication unchanged. Anyone with the secret link
          can respond; share it privately through your own invitation channel.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              busy ||
              dirty ||
              !data.page ||
              lifecycle !== "running" ||
              !capabilities.publicExternalMvpParticipation
            }
            onClick={() => void command("publish")}
          >
            {data.publication
              ? "Replace participant link"
              : "Publish private link"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !data.publication}
            onClick={() => void command("unpublish")}
          >
            Unpublish
          </Button>
        </div>
        {!capabilities.publicExternalMvpParticipation && (
          <p className="text-xs text-amber-200">
            Public participation is disabled in this release.
          </p>
        )}
        {link && (
          <Field label="Private participant link">
            <TextInput
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(link)
                  .then(() => setStatus("Link copied."))
                  .catch(() => setError("Select and copy the link manually."))
              }
            >
              Copy link
            </Button>
          </Field>
        )}
      </div>
      {busy && <p role="status">Saving changes…</p>}
      {error && (
        <p role="alert" className="text-rose-200">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-emerald-200">
          {status}
        </p>
      )}
    </section>
  );
}
