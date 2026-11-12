"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Field,
  SelectInput,
  TextInput,
  TextArea,
} from "@/components/ui";
import {
  prototypeContent,
  prototypeTemplate,
  type PrototypeContent,
} from "@/lib/validation/prototypes";
import type { PrototypeDashboard } from "@/lib/validation/server/prototypes";
import { validationRequest, validationErrorMessage, displayDate } from "./api";
import { PrototypePreview } from "./prototype-preview";
import { useValidationCapabilities } from "./release-capabilities";
export function PrototypeWorkspace({
  versionId,
  lifecycle,
}: {
  versionId: string;
  lifecycle: string;
}) {
  const capabilities = useValidationCapabilities();
  const [data, setData] = useState<PrototypeDashboard | null>(null),
    [draft, setDraft] = useState<PrototypeContent>(() =>
      prototypeTemplate("workflow"),
    );
  const [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [mobile, setMobile] = useState(false),
    [tab, setTab] = useState("edit"),
    [selected, setSelected] = useState(0),
    [publicPath, setPublicPath] = useState("");
  const base = `/api/validation/prototypes/${versionId}`;
  const load = useCallback(async () => {
    try {
      const next = await validationRequest<PrototypeDashboard>(base);
      setData(next);
      setDraft(next.page?.content || prototypeTemplate("workflow"));
      setDirty(false);
      setError("");
    } catch (e) {
      setError(validationErrorMessage(e, "Could not load this prototype."));
    }
  }, [base]);
  useEffect(() => {
    let active = true;
    validationRequest<PrototypeDashboard>(base)
      .then((next) => {
        if (!active) return;
        setData(next);
        setDraft(next.page?.content || prototypeTemplate("workflow"));
        setDirty(false);
        setError("");
      })
      .catch((e) => {
        if (active)
          setError(validationErrorMessage(e, "Could not load this prototype."));
      });
    return () => {
      active = false;
    };
  }, [base]);
  const terminal = ["completed", "cancelled"].includes(lifecycle);
  const edit = (next: PrototypeContent) => {
    setDraft(next);
    setDirty(true);
    setStatus("");
  };
  async function command(action: string) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const content = action === "save" ? prototypeContent(draft) : undefined;
      const next = await validationRequest<PrototypeDashboard>(
        `${base}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({
            revision: data?.page?.revision || 0,
            ...(content ? { content } : {}),
          }),
        },
      );
      setData(next);
      setDraft(next.page?.content || draft);
      setDirty(false);
      if (next.publicPath)
        setPublicPath(window.location.origin + next.publicPath);
      else if (["remove", "unpublish"].includes(action)) setPublicPath("");
      setStatus(
        action === "save"
          ? "Revision saved. Publish explicitly to replace the participant version."
          : action === "publish"
            ? "Published. Copy and keep this private link; it cannot be recovered after leaving this page."
            : action === "remove"
              ? "Prototype removed from participation. Existing feedback and published revisions are preserved."
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
      <section className="mt-5 rounded-xl border border-white/10 p-5">
        <p role={error ? "alert" : "status"}>{error || "Loading prototype…"}</p>
        {error && <Button onClick={() => void load()}>Retry</Button>}
      </section>
    );
  const screen = draft.screens[selected] || draft.screens[0];
  function updateScreen(patch: Partial<typeof screen>) {
    edit({
      ...draft,
      screens: draft.screens.map((s) =>
        s.id === screen.id ? { ...s, ...patch } : s,
      ),
    });
  }
  return (
    <section
      aria-label="Interactive prototype"
      className="mt-6 space-y-5 border-t border-white/10 pt-6"
    >
      <div>
        <h3 className="text-xl font-semibold">Interactive Prototype</h3>
        <p className="mt-2 text-sm text-slate-400">
          Build a small visual journey, share privately, and learn where people
          get stuck. No code or AI generation.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Prototype sections">
        {["edit", "preview", "results"].map((t) => (
          <Button
            key={t}
            variant={tab === t ? "primary" : "secondary"}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>
      {data.page?.removed && (
        <p role="status" className="text-amber-200">
          Removed. Historical feedback remains below. Save a revision to restore
          authoring.
        </p>
      )}
      {tab === "edit" && (
        <fieldset
          disabled={busy || terminal}
          className="grid gap-4 disabled:opacity-70"
        >
          {!data.page && (
            <Field label="Start from a template">
              <SelectInput
                defaultValue="workflow"
                onChange={(e) => {
                  edit(
                    prototypeTemplate(
                      e.target.value as "workflow" | "workspace" | "booking",
                    ),
                  );
                  setSelected(0);
                }}
              >
                <option value="workflow">Task workflow</option>
                <option value="workspace">Project workspace</option>
                <option value="booking">Booking journey</option>
              </SelectInput>
            </Field>
          )}
          <Field label="Prototype name">
            <TextInput
              maxLength={180}
              value={draft.title}
              onChange={(e) => edit({ ...draft, title: e.target.value })}
            />
          </Field>
          <Field
            label="Task for participants"
            helper="Describe a realistic task without giving away the steps."
          >
            <TextArea
              maxLength={1000}
              value={draft.purpose}
              onChange={(e) => edit({ ...draft, purpose: e.target.value })}
            />
          </Field>
          <Field label="Screen to edit">
            <SelectInput
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
            >
              {draft.screens.map((s, i) => (
                <option key={s.id} value={i}>
                  {i + 1}. {s.title}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="grid gap-4 rounded-xl bg-white/[.03] p-4">
            <Field label="Screen layout">
              <SelectInput
                value={screen.layout}
                onChange={(e) =>
                  updateScreen({
                    layout: e.target.value as typeof screen.layout,
                  })
                }
              >
                <option value="dashboard">Dashboard cards</option>
                <option value="detail">Detail / review</option>
                <option value="confirmation">Confirmation</option>
              </SelectInput>
            </Field>
            <Field label="Screen title">
              <TextInput
                value={screen.title}
                maxLength={120}
                onChange={(e) => updateScreen({ title: e.target.value })}
              />
            </Field>
            <Field label="Screen description">
              <TextArea
                value={screen.description}
                maxLength={800}
                onChange={(e) => updateScreen({ description: e.target.value })}
              />
            </Field>
            <Field label="Card labels (one per line, up to four)">
              <TextArea
                value={screen.labels.join("\n")}
                onChange={(e) =>
                  updateScreen({ labels: e.target.value.split("\n") })
                }
              />
            </Field>
            {screen.actions.map((a, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                <Field label={`Action ${i + 1} label`}>
                  <TextInput
                    value={a.label}
                    maxLength={60}
                    onChange={(e) =>
                      updateScreen({
                        actions: screen.actions.map((x, j) =>
                          i === j ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={`Action ${i + 1} destination`}>
                  <SelectInput
                    value={a.target}
                    onChange={(e) =>
                      updateScreen({
                        actions: screen.actions.map((x, j) =>
                          i === j ? { ...x, target: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {draft.screens.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                {screen.actions.length > 1 && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      updateScreen({
                        actions: screen.actions.filter((_, j) => i !== j),
                      })
                    }
                  >
                    Remove action {i + 1}
                  </Button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={screen.actions.length >= 3}
                onClick={() =>
                  updateScreen({
                    actions: [
                      ...screen.actions,
                      { label: "Learn more", target: draft.screens[0].id },
                    ],
                  })
                }
              >
                Add action
              </Button>
              <Button
                variant="secondary"
                disabled={draft.screens.length >= 6}
                onClick={() => {
                  const id = `s_${crypto.randomUUID().slice(0, 8)}`;
                  edit({
                    ...draft,
                    screens: draft.screens
                      .map((s) =>
                        s.id === screen.id
                          ? {
                              ...s,
                              actions: [
                                ...s.actions.slice(0, 2),
                                { label: "Continue", target: id },
                              ],
                            }
                          : s,
                      )
                      .concat({
                        id,
                        layout: "detail",
                        title: "New screen",
                        description: "Describe this step.",
                        labels: [],
                        actions: [{ label: "Back", target: screen.id }],
                      }),
                  });
                  setSelected(draft.screens.length);
                }}
              >
                Add screen
              </Button>
              <Button
                variant="ghost"
                disabled={draft.screens.length <= 2 || selected === 0}
                onClick={() => {
                  const first = draft.screens[0].id;
                  edit({
                    ...draft,
                    screens: draft.screens
                      .filter((s) => s.id !== screen.id)
                      .map((s) => ({
                        ...s,
                        actions: s.actions.map((a) =>
                          a.target === screen.id ? { ...a, target: first } : a,
                        ),
                      })),
                  });
                  setSelected(0);
                }}
              >
                Remove screen
              </Button>
            </div>
          </div>
          <Button
            disabled={busy || !dirty}
            onClick={() => void command("save")}
          >
            Save revision
          </Button>
        </fieldset>
      )}
      {terminal && tab === "edit" && (
        <p className="text-sm text-slate-400">
          This experiment has ended. Its prototype and feedback remain available
          for review.
        </p>
      )}
      {tab === "preview" && (
        <>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setMobile(false)}
              aria-pressed={!mobile}
            >
              Desktop
            </Button>
            <Button
              variant="secondary"
              onClick={() => setMobile(true)}
              aria-pressed={mobile}
            >
              Mobile
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Preview uses current edits and records no activity.
          </p>
          <PrototypePreview
            key={JSON.stringify(draft)}
            content={draft}
            mobile={mobile}
          />
        </>
      )}
      {tab === "results" && (
        <div className="space-y-4">
          <h4 className="font-semibold">
            Private results · all published revisions
          </h4>
          <p className="text-sm text-slate-300">
            {data.metrics.browsers} browser identifiers · {data.metrics.events}{" "}
            recorded interactions · {data.metrics.submissions} feedback
            submissions
          </p>
          <p className="text-xs leading-5 text-slate-400">
            Browser identifiers are publication-scoped, not verified people.
            Events are unverified telemetry, not qualified human evidence. Task
            outcomes are participant self-reports. Repeat visits, bots and link
            replacements can affect counts. Nothing is promoted to the shared
            Data Moat.
          </p>
          <ul className="flex flex-wrap gap-4 text-sm">
            {data.metrics.outcomes.map((x) => (
              <li key={x.outcome}>
                {x.outcome === "yes"
                  ? "Completed"
                  : x.outcome === "partly"
                    ? "Partly completed"
                    : "Could not complete"}
                : {x.count}
              </li>
            ))}
          </ul>
          <details>
            <summary className="cursor-pointer text-sm text-cyan-200">
              Recorded screen views
            </summary>
            <ul className="mt-2 text-sm text-slate-400">
              {data.metrics.screens.map((x) => (
                <li key={x.screen}>
                  {draft.screens.find((s) => s.id === x.screen)?.title ||
                    x.screen}
                  : {x.count}
                </li>
              ))}
            </ul>
          </details>
          {!data.submissions.length ? (
            <p className="text-sm text-slate-400">
              No feedback yet. Share the published link with relevant
              participants.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                Latest 100 submissions. Totals include all retained responses.
              </p>
              {data.submissions.map((s) => (
                <article
                  key={s.id}
                  className="rounded-xl border border-white/10 p-4"
                >
                  <p className="text-xs text-cyan-200">
                    Revision {s.revision} · Task: {s.outcome} ·{" "}
                    {displayDate(s.submitted_at)}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {s.comment}
                  </p>
                </article>
              ))}
            </>
          )}
          <Button
            disabled={busy || dirty}
            variant="secondary"
            onClick={() => void load()}
          >
            Refresh results
          </Button>
          {dirty && (
            <p className="text-xs text-amber-200">
              Save edits before refreshing results.
            </p>
          )}
        </div>
      )}
      <div className="space-y-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[.04] p-4">
        <p className="text-sm">
          {data.publication
            ? `Participant link active · published revision ${data.publication.revision}`
            : "No active participant link"}
        </p>
        <p className="text-xs text-slate-400">
          Save, mark ready, then start the experiment above before publishing.
          Published content stays unchanged until you publish a replacement.
          Anyone with the secret link can participate; share it privately.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              busy ||
              dirty ||
              !data.page ||
              data.page.removed ||
              lifecycle !== "running" ||
              !capabilities.publicPrototypeParticipation
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
          {data.page && !data.page.removed && (
            <Button
              variant="ghost"
              disabled={busy || dirty}
              onClick={() => {
                if (
                  window.confirm(
                    "Remove this prototype and close its participant link? Feedback and published revisions will be preserved.",
                  )
                )
                  void command("remove");
              }}
            >
              Remove prototype
            </Button>
          )}
        </div>
        {!capabilities.publicPrototypeParticipation && (
          <p className="text-xs text-amber-200">
            Public participation is disabled in this release.
          </p>
        )}
        {publicPath && (
          <Field label="Private participant link">
            <TextInput
              readOnly
              value={publicPath}
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(publicPath)
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
