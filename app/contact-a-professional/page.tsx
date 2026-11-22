"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Field, PageHeader, Panel, SelectInput, TextArea, TextInput } from "@/components/ui";
import {
  budgetRanges,
  inquiryLimits,
  inquiryRecipient,
  inquirySubject,
  prepareInquiry,
  projectTypes,
  timelines,
} from "@/lib/project-inquiry";

const benefits = [
  ["Personal project evaluation", "The SaaSScout founder will personally review what you want to build and discuss possible next steps."],
  ["Ideas at any stage", "Bring a web application, SaaS, MVP, automation, or AI integration idea."],
  ["Direct contact with a developer", "Start with an email conversation. There’s no obligation to hire."],
];

export default function ContactProfessionalPage() {
  const [result, setResult] = useState<ReturnType<typeof prepareInquiry> | null>(null);
  const draftLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (result?.draft) draftLink.current?.focus();
  }, [result]);

  function prepareDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const next = prepareInquiry(new FormData(form));
    setResult(next);
    if (next.error) form.querySelector<HTMLElement>(`#inquiry-${next.error.field}`)?.focus();
  }

  function inputProps(field: string) {
    const invalid = result?.error?.field === field;
    return {
      id: `inquiry-${field}`,
      name: field,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? "inquiry-error" : undefined,
    };
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Contact a Professional"
        title="Turn your idea into a real product."
        description="Have an idea worth building? Tell us about your project and get in touch to discuss the next steps."
      />
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel accent>
          <h2 className="text-xl font-semibold">What to expect</h2>
          <ul className="mt-4 divide-y divide-white/10">
            {benefits.map(([title, description]) => (
              <li key={title} className="py-4 first:pt-0 last:pb-0">
                <h3 className="text-sm font-semibold text-cyan-200">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{description}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <h2 className="text-xl font-semibold">Project inquiry</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Prepare a draft, then open your email app to review and send it.
          </p>
          <form className="mt-6 grid gap-5" onSubmit={prepareDraft} onChange={() => setResult(null)}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name">
                <TextInput {...inputProps("name")} autoComplete="name" maxLength={inquiryLimits.name} required />
              </Field>
              <Field label="Contact email">
                <TextInput {...inputProps("email")} type="email" autoComplete="email" maxLength={inquiryLimits.email} required />
              </Field>
            </div>
            <Field label="Project type">
              <SelectInput {...inputProps("projectType")} defaultValue="" required>
                <option value="" disabled>Select a project type</option>
                {projectTypes.map((type) => <option key={type}>{type}</option>)}
              </SelectInput>
            </Field>
            <Field label="Project description" helper={`Up to ${inquiryLimits.description.toLocaleString("en-US")} characters.`}>
              <TextArea {...inputProps("description")} rows={5} maxLength={inquiryLimits.description} required
                placeholder="What would you like to build, and who is it for?" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Estimated budget (USD, optional)">
                <SelectInput {...inputProps("budget")} defaultValue="">
                  <option value="">Select a range</option>
                  {budgetRanges.map((range) => <option key={range}>{range}</option>)}
                </SelectInput>
              </Field>
              <Field label="Desired timeline (optional)">
                <SelectInput {...inputProps("timeline")} defaultValue="">
                  <option value="">Select a timeline</option>
                  {timelines.map((timeline) => <option key={timeline}>{timeline}</option>)}
                </SelectInput>
              </Field>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-300">
              <p id="inquiry-privacy">SaaSScout will use the contact information and project details you share to respond to your inquiry.</p>
              <label className="mt-3 flex cursor-pointer items-start gap-3 font-medium text-slate-100">
                <input {...inputProps("consent")} value="yes" type="checkbox" required
                  aria-describedby={result?.error?.field === "consent" ? "inquiry-privacy inquiry-error" : "inquiry-privacy"}
                  className="mt-1 h-4 w-4 shrink-0 accent-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300" />
                <span>I agree to be contacted about this project.</span>
              </label>
            </div>
            {result?.error && <p id="inquiry-error" role="alert" className="text-sm text-rose-200">{result.error.message}</p>}
            {!result?.draft && <div><Button type="submit" className="w-full sm:w-auto">Prepare email draft</Button></div>}
          </form>
          {result?.draft && (
            <div className="mt-5 grid gap-3">
              <p role="status" className="text-sm text-cyan-200">Draft ready. Review and send it from your email app.</p>
              <a ref={draftLink} href={result.draft.href}
                className="inline-flex justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-cyan-300 sm:justify-self-start">
                Open email app
              </a>
              <details className="text-sm text-slate-300">
                <summary className="cursor-pointer">Email app didn’t open or load the full message?</summary>
                <p className="my-3 break-words">Try opening it again, or copy the draft below into a new email to {inquiryRecipient} with the subject “{inquirySubject}”.</p>
                <TextArea aria-label="Prepared email message" rows={6} readOnly value={result.draft.body} />
              </details>
            </div>
          )}
        </Panel>
      </div>
    </main>
  );
}
