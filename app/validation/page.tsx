"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/supabase";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import {
  ContextNotice,
  ValidationPage,
  card,
} from "@/components/validation/validation-shell";
import { displayDate, validationRequest } from "@/components/validation/api";
import { MethodPicker } from "@/components/validation/method-picker";
import {
  findValidationMethod,
  type MethodFamily,
} from "@/components/validation/methods";

type Subject = {
  id: string;
  creation_origin: string;
  label: string;
  created_at: string;
  latest_hypothesis: { problem_claim: string } | null;
  experiment_count: number;
  experiment_lifecycles: string[];
  observation_count: number;
};
export default function ValidationIndex() {
  const router = useRouter();
  const [items, setItems] = useState<Subject[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<MethodFamily>();
  const studies = useRef<HTMLElement>(null);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (current !== requestId.current) return;
      if (authError && authError.name !== "AuthSessionMissingError")
        throw authError;
      if (!data.user) {
        router.push("/login");
        return;
      }
      const next = await validationRequest<Subject[]>(
        "/api/validation/subjects",
      );
      if (current === requestId.current) setItems(next);
    } catch (caught) {
      if (current !== requestId.current) return;
      if (caught instanceof Error && caught.message === "auth")
        router.push("/login");
      else
        setError("We couldn't load your validation studies. Please try again.");
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const suffix = method ? `?method=${method}` : "";
  const selected = findValidationMethod(method);
  return (
    <ValidationPage>
      <PageHeader
        eyebrow="Evidence from reality"
        title="Validation Hub"
        description="Learn from real people before you invest in building. Choose a question, run a focused experiment and review what people actually say or do."
        actions={
          <Button href={`/validation/new${suffix}`}>Start a validation</Button>
        }
      />
      <nav
        aria-label="Validation navigation"
        className="my-6 flex flex-wrap gap-4 text-sm text-cyan-200"
      >
        <a
          className="rounded focus-visible:outline-2 focus-visible:outline-cyan-300"
          href="#methods"
        >
          Explore methods
        </a>
        <a
          className="rounded focus-visible:outline-2 focus-visible:outline-cyan-300"
          href="#studies"
        >
          Your studies and experiments
        </a>
        <Link
          href="/results"
          className="rounded focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          Back to opportunities
        </Link>
      </nav>
      <ol
        aria-label="How validation works"
        className="mb-6 grid gap-4 sm:grid-cols-3"
      >
        {[
          [
            "1. Define a question",
            "Start with an opportunity or your own idea. Write a claim you can test.",
          ],
          [
            "2. Run an experiment",
            "Choose a method, prepare it, then start collecting with consent.",
          ],
          [
            "3. Review and decide",
            "Read results, look for conflicting signals and choose what to test next.",
          ],
        ].map(([title, description]) => (
          <li key={title} className={card}>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {description}
            </p>
          </li>
        ))}
      </ol>
      <ContextNotice>
        SaaSScout opportunities and AI output help you decide what to test.
        Validation collects interest, feedback, usability signals or nonbinding
        commercial intent. These signals do not establish verified demand or
        confirmed purchases.
      </ContextNotice>
      <div id="methods" className="mt-10 scroll-mt-24">
        <MethodPicker
          value={method}
          onSelect={(family) => {
            setMethod(family);
            requestAnimationFrame(() => studies.current?.focus());
          }}
        />
      </div>
      <section
        id="studies"
        ref={studies}
        tabIndex={-1}
        aria-labelledby="studies-heading"
        className="mt-10 scroll-mt-24 rounded focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        <h2 id="studies-heading" className="text-2xl font-semibold">
          Your studies and experiments
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          A study keeps your idea, hypothesis and experiments together. Open one
          to manage experiments and review method-specific results.
        </p>
        {selected && (
          <div className={`${card} mt-5`}>
            <p role="status" className="text-cyan-200">
              Selected method: {selected.label}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Open a study below or start a new validation. Define a hypothesis
              before creating your experiment.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button href={`/validation/new${suffix}`}>
                Start a study with {selected.label}
              </Button>
              <Button variant="ghost" onClick={() => setMethod(undefined)}>
                Clear method
              </Button>
            </div>
          </div>
        )}
        {loading ? (
          <p role="status" className={`${card} mt-5 text-slate-300`}>
            Loading your validation studies…
          </p>
        ) : error ? (
          <div className={`${card} mt-5`}>
            <p role="alert" className="text-rose-200">
              {error}
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </div>
        ) : items?.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              title="Start your first validation study"
              description="Choose a method above, then add your idea and a testable hypothesis. For an existing opportunity, open its report and choose “Validate this opportunity”."
              primaryAction={
                <Button href={`/validation/new${suffix}`}>
                  Start a validation
                </Button>
              }
              secondaryAction={
                <Button variant="secondary" href="/results">
                  Browse opportunities
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm text-slate-300">
              Showing {items?.length} studies ·{" "}
              {items?.reduce((sum, item) => sum + item.experiment_count, 0)}{" "}
              experiments in these studies. Only methods available in this
              release are included. Up to 100 recent studies are shown.
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {items?.map((item) => (
                <article
                  key={item.id}
                  className={`${card} min-w-0 break-words`}
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <Badge
                      tone={
                        item.creation_origin === "user_entered"
                          ? "neutral"
                          : "cyan"
                      }
                    >
                      {item.creation_origin.replaceAll("_", " ")}
                    </Badge>
                    <span className="text-xs text-slate-300">
                      Created {displayDate(item.created_at)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-xl font-semibold">{item.label}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {item.latest_hypothesis?.problem_claim ||
                      "Next step: define a hypothesis, then create an experiment."}
                  </p>
                  <p className="mt-4 text-sm text-slate-300">
                    {item.experiment_count} experiments ·{" "}
                    {item.observation_count} recorded interview observations
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...new Set(item.experiment_lifecycles)].map((state) => (
                      <Badge key={state} tone="neutral">
                        {state}:{" "}
                        {
                          item.experiment_lifecycles.filter(
                            (value) => value === state,
                          ).length
                        }
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-5">
                    <Button
                      variant="secondary"
                      href={`/validation/${item.id}${suffix}${method ? "#experiments" : ""}`}
                    >
                      {selected
                        ? `Continue with ${selected.label}`
                        : "Open study and experiments"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </ValidationPage>
  );
}
