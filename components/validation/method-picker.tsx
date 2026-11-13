"use client";
import { useId, useState } from "react";
import { Badge, Button, Field, SelectInput } from "@/components/ui";
import { useValidationCapabilities } from "./release-capabilities";
import {
  validationMethods,
  methodAvailable,
  methodCollectionAvailable,
  type MethodFamily,
} from "./methods";
import { card } from "./validation-shell";

export function MethodPicker({
  value,
  onSelect,
}: {
  value?: MethodFamily;
  onSelect: (family: MethodFamily) => void;
}) {
  const capabilities = useValidationCapabilities();
  const [goal, setGoal] = useState("");
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-5">
      <div>
        <h2 id={headingId} className="text-2xl font-semibold">
          Choose a validation method
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Start with what you need to learn. Each method collects a different
          signal; none alone confirms demand.
        </p>
      </div>
      <Field label="What do you want to learn?">
        <SelectInput
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
        >
          <option value="">Compare all methods</option>
          {validationMethods.map((method) => (
            <option key={method.family} value={method.family}>
              {method.goal}
            </option>
          ))}
        </SelectInput>
      </Field>
      <p className="text-sm text-slate-300">
        Suggestions match your objective to a method. Compare the alternatives
        below.
      </p>
      <p role="status" className="text-sm text-cyan-200">
        {goal
          ? `Suggested starting point: ${validationMethods.find((method) => method.family === goal)?.label}. ${
              methodAvailable(
                validationMethods.find((method) => method.family === goal)!,
                capabilities,
              )
                ? "Review its use case below."
                : "This method is unavailable in this release; compare the available alternatives."
            }`
          : "Choose the method that matches your next question."}
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {validationMethods.map((method) => {
          const available = methodAvailable(method, capabilities);
          const collecting = methodCollectionAvailable(method, capabilities);
          return (
            <article
              key={method.family}
              className={`${card} flex min-w-0 flex-col ${goal === method.family || value === method.family ? "border-cyan-300/60" : ""}`}
            >
              <div className="flex flex-wrap gap-2">
                <Badge tone={available ? "cyan" : "neutral"}>
                  {available ? "Available" : "Unavailable in this release"}
                </Badge>
                {goal === method.family && (
                  <Badge>Suggested for your goal</Badge>
                )}
                {value === method.family && (
                  <Badge tone="green">Selected</Badge>
                )}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{method.label}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {method.description}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {method.useCase}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                <strong>What you collect:</strong> {method.signal}
              </p>
              {available && method.publicCapability !== null && (
                <p className="mt-3 text-sm text-slate-300">
                  {collecting
                    ? "Participant links are available after setup and starting the experiment."
                    : "Private setup only. Publishing and public collection are disabled in this release."}
                </p>
              )}
              <div className="mt-auto pt-5">
                <Button
                  variant="secondary"
                  disabled={!available}
                  onClick={() => onSelect(method.family)}
                >
                  {value === method.family
                    ? `${method.label} selected`
                    : `Choose ${method.label}`}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
