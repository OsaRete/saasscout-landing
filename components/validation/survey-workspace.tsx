"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Field,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import { validationRequest } from "./api";
import { card } from "./validation-shell";
type Q = {
  questionRef: string;
  prompt: string;
  type:
    "single_choice" | "multiple_choice" | "short_text" | "long_text" | "number";
  required: boolean;
  options?: string[];
};
type Plan = {
  id: string;
  version_number: number;
  title: string;
  purpose: string;
  questions: Q[];
};
type Pub = {
  id: string;
  survey_plan_version_id: string;
  state: "published" | "revoked";
};
type Submission = { id: string; survey_plan_version_id: string };
type Answer = {
  submission_id: string;
  question_id: string;
  raw_answer: unknown;
};
type SuggestedQuestion = Q & { options: string[] };
const isChoice = (type: Q["type"]) =>
  type === "single_choice" || type === "multiple_choice";
const choiceKey = (option: string) =>
  option.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
function choiceError(question: Q): string {
  if (!isChoice(question.type)) return "";
  const options = question.options || [];
  if (options.length < 2 || options.some((option) => !option.trim()))
    return "Add at least two complete choices before saving this survey.";
  if (new Set(options.map(choiceKey)).size !== options.length)
    return "Each choice must be distinct.";
  return "";
}
export function SurveyWorkspace({
  versionId,
  plans,
  publications,
  submissions,
  answers,
  onChange,
  suggestedQuestions,
  onSuggestionsDone,
}: {
  versionId: string;
  plans: Plan[];
  publications: Pub[];
  submissions: Submission[];
  answers: Answer[];
  onChange: () => Promise<unknown> | void;
  suggestedQuestions?: SuggestedQuestion[];
  onSuggestionsDone: () => void;
}) {
  const current = [...plans].sort(
      (a, b) => b.version_number - a.version_number,
    )[0],
    publication = publications.find((p) => p.state === "published"),
    [editing, setEditing] = useState(!current),
    [title, setTitle] = useState(current?.title || ""),
    [purpose, setPurpose] = useState(current?.purpose || ""),
    [questions, setQuestions] = useState<Q[]>(current?.questions || []),
    [questionsEdited, setQuestionsEdited] = useState(Boolean(current)),
    [replaceWarning, setReplaceWarning] = useState(false),
    [link, setLink] = useState(""),
    [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
      "idle",
    ),
    [error, setError] = useState(""),
    [questionErrors, setQuestionErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    copyReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyReset.current) clearTimeout(copyReset.current);
    },
    [],
  );
  const counts = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const a of answers) {
      const key = JSON.stringify(a.raw_answer),
        q = map.get(a.question_id) || new Map<string, number>();
      q.set(key, (q.get(key) || 0) + 1);
      map.set(a.question_id, q);
    }
    return map;
  }, [answers]);
  function add() {
    if (questions.length < 15) {
      setQuestionsEdited(true);
      setQuestions((q) => [
        ...q,
        {
          questionRef: crypto.randomUUID().replaceAll("-", "_"),
          prompt: "",
          type: "short_text",
          required: false,
        },
      ]);
    }
  }
  function applySuggestions() {
    if (!suggestedQuestions) return;
    if (questionsEdited && !replaceWarning) {
      setReplaceWarning(true);
      return;
    }
    setQuestions(
      suggestedQuestions.map((question) => ({
        ...question,
        options: isChoice(question.type) ? [...question.options] : undefined,
      })),
    );
    setQuestionErrors({});
    setQuestionsEdited(false);
    setReplaceWarning(false);
    onSuggestionsDone();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const nextQuestionErrors = Object.fromEntries(
      questions
        .map((question) => [question.questionRef, choiceError(question)])
        .filter(([, message]) => message),
    );
    setQuestionErrors(nextQuestionErrors);
    if (Object.keys(nextQuestionErrors).length) return;
    setBusy(true);
    try {
      await validationRequest("/api/validation/survey-plans", {
        method: "POST",
        body: JSON.stringify({
          experimentVersionId: versionId,
          title,
          purpose,
          questions,
          supersedesSurveyPlanVersionId: current?.id,
        }),
      });
      await onChange();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save plan.");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!current) return;
    const result = await validationRequest<{ publicPath: string }>(
      "/api/validation/survey-publications",
      {
        method: "POST",
        body: JSON.stringify({ surveyPlanVersionId: current.id }),
      },
    );
    setLink(`${location.origin}${result.publicPath}`);
    await onChange();
  }
  async function copyLink() {
    if (!link) return;
    if (copyReset.current) clearTimeout(copyReset.current);
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    copyReset.current = setTimeout(() => setCopyStatus("idle"), 2500);
  }
  async function revoke() {
    if (publication) {
      await validationRequest(
        `/api/validation/survey-publications/${publication.id}/revoke`,
        { method: "POST" },
      );
      setLink("");
      setCopyStatus("idle");
      await onChange();
    }
  }
  return (
    <div className="mt-6 space-y-5 border-t border-white/10 pt-6">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-semibold">Survey plan</p>
          <p className="mt-1 text-xs text-slate-400">
            Keep it short: 5–10 high-value questions. Changing it creates an
            immutable version.
          </p>
        </div>
        {current && !editing && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Create new version
          </Button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={save}
          className="space-y-4 rounded-xl bg-white/[.035] p-4"
        >
          {suggestedQuestions && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[.06] p-3">
              <p className="text-sm font-medium text-cyan-200">
                AI suggested questions available
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Applying only changes this editable draft. Review it before
                saving an immutable plan.
              </p>
              {replaceWarning && (
                <p role="alert" className="mt-2 text-xs text-amber-200">
                  This will replace your edited question draft. Select replace
                  to confirm.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={applySuggestions}
                >
                  {replaceWarning
                    ? "Replace my questions"
                    : "Use AI suggested questions"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onSuggestionsDone}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}
          <Field label="Participant-facing title">
            <TextInput
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Research purpose">
            <TextArea
              required
              maxLength={1000}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </Field>
          {questions.map((q, i) => (
            <div
              key={q.questionRef}
              className="grid gap-3 rounded-xl border border-white/10 p-3"
            >
              <Field label={`Question ${i + 1}`}>
                <TextInput
                  required
                  maxLength={500}
                  value={q.prompt}
                  onChange={(e) => (
                    setQuestionsEdited(true),
                    setQuestions((old) =>
                      old.map((x) =>
                        x === q ? { ...x, prompt: e.target.value } : x,
                      ),
                    )
                  )}
                />
              </Field>
              <SelectInput
                aria-label={`Question ${i + 1} type`}
                value={q.type}
                onChange={(e) =>
                  setQuestions((old) =>
                    old.map((x) =>
                      x === q
                        ? {
                            ...x,
                            type: e.target.value as Q["type"],
                            options: e.target.value.includes("choice")
                              ? x.options || ["", ""]
                              : undefined,
                          }
                        : x,
                    ),
                  )
                }
              >
                <option value="single_choice">Single choice</option>
                <option value="multiple_choice">Multiple choice</option>
                <option value="short_text">Short text</option>
                <option value="long_text">Long text</option>
                <option value="number">Number</option>
              </SelectInput>
              {q.options && (
                <div>
                  <p className="text-sm font-medium">Options</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Enter 2–12 distinct choices.
                  </p>
                  <div className="mt-2 space-y-2">
                    {q.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex gap-2">
                        <TextInput
                          aria-label={`Question ${i + 1} option ${optionIndex + 1}`}
                          maxLength={200}
                          value={option}
                          placeholder={`Option ${optionIndex + 1}`}
                          onChange={(e) =>
                            setQuestions((old) =>
                              old.map((x) =>
                                x === q
                                  ? {
                                      ...x,
                                      options: x.options?.map((value, index) =>
                                        index === optionIndex
                                          ? e.target.value
                                          : value,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            setQuestions((old) =>
                              old.map((x) =>
                                x === q
                                  ? {
                                      ...x,
                                      options: x.options?.filter(
                                        (_, index) => index !== optionIndex,
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  {q.options.length < 12 && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setQuestions((old) =>
                          old.map((x) =>
                            x === q
                              ? { ...x, options: [...(x.options || []), ""] }
                              : x,
                          ),
                        )
                      }
                    >
                      Add choice
                    </Button>
                  )}
                  {questionErrors[q.questionRef] && (
                    <p role="alert" className="mt-2 text-sm text-rose-200">
                      {questionErrors[q.questionRef]}
                    </p>
                  )}
                </div>
              )}
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) =>
                    setQuestions((old) =>
                      old.map((x) =>
                        x === q ? { ...x, required: e.target.checked } : x,
                      ),
                    )
                  }
                />{" "}
                Required
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setQuestionsEdited(true);
                  setQuestions((old) => old.filter((item) => item !== q));
                }}
              >
                Remove question
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={add}
              disabled={questions.length >= 15}
            >
              Add question
            </Button>
            <Button type="submit" disabled={busy || !questions.length}>
              {busy ? "Saving…" : "Save immutable plan"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-rose-200">
              {error}
            </p>
          )}
        </form>
      ) : (
        current && (
          <div className="rounded-xl bg-white/[.035] p-4">
            <Badge>Plan V{current.version_number}</Badge>
            <p className="mt-3 font-semibold">{current.title}</p>
            <p className="mt-1 text-sm text-slate-400">
              {current.questions.length} questions · Responses remain linked to
              this exact version.
            </p>
          </div>
        )
      )}
      <div className={`${card} !bg-white/[.025]`}>
        <p className="font-semibold">Publication</p>
        <p className="mt-2 text-sm text-slate-400">
          {publication ? "Published" : "Unpublished or closed"}
        </p>
        <div className="mt-3 flex gap-2">
          {current && !publication && (
            <Button onClick={publish}>Publish public link</Button>
          )}
          {publication && (
            <Button variant="destructive" onClick={revoke}>
              Revoke link
            </Button>
          )}
        </div>
        {link && (
          <div className="mt-3">
            <label
              className="text-xs text-slate-400"
              htmlFor={`survey-link-${versionId}`}
            >
              Shareable public URL
            </label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <input
                id={`survey-link-${versionId}`}
                readOnly
                value={link}
                className="min-w-0 flex-1 rounded-lg bg-black/30 p-2 text-xs"
              />
              <Button
                variant="secondary"
                onClick={copyLink}
                aria-label="Copy shareable public Survey link"
              >
                {copyStatus === "copied" ? "Copied" : "Copy link"}
              </Button>
            </div>
            {copyStatus === "failed" && (
              <p role="status" className="mt-2 text-xs text-rose-200">
                Could not copy. Select the URL and copy it manually.
              </p>
            )}
          </div>
        )}
      </div>
      <div>
        <p className="font-semibold">Responses</p>
        <p className="mt-1 text-3xl font-bold">{submissions.length}</p>
        <p className="text-sm text-slate-400">
          {submissions.length} respondents. One submission remains one
          respondent, regardless of answer count.
        </p>
        <p className="mt-3 text-sm text-slate-300">
          Responses are real human evidence and are preserved as submitted. No
          AI interpretation is performed in this step.
        </p>
        {current?.questions
          .filter((q) => q.type.includes("choice"))
          .map((q) => (
            <div
              key={q.questionRef}
              className="mt-4 rounded-xl bg-white/[.035] p-3"
            >
              <p className="text-sm font-medium">{q.prompt}</p>
              {[...(counts.get(q.questionRef)?.entries() || [])].map(
                ([value, count]) => (
                  <p key={value} className="mt-1 text-xs text-slate-400">
                    {value}: {count} of {submissions.length} respondents
                  </p>
                ),
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
