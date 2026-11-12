import { assertObject, text, ValidationServerError } from "./server/contracts";
export const PROTOTYPE_CONSENT =
  "I agree to share my anonymous navigation activity and feedback with the prototype creator for idea validation. I will not include personal or sensitive information.";
export type PrototypeScreen = {
  id: string;
  layout: "dashboard" | "detail" | "confirmation";
  title: string;
  description: string;
  labels: string[];
  actions: { label: string; target: string }[];
};
export type PrototypeContent = {
  title: string;
  purpose: string;
  screens: PrototypeScreen[];
  consent: string;
};
function invalid(message: string): never {
  throw new ValidationServerError(400, "invalid_request", message);
}
export function prototypeContent(raw: unknown): PrototypeContent {
  assertObject(raw);
  if (
    !Array.isArray(raw.screens) ||
    raw.screens.length < 2 ||
    raw.screens.length > 6
  )
    invalid("Use 2–6 screens.");
  const screens = raw.screens.map((s): PrototypeScreen => {
    assertObject(s);
    const id = text(s.id, "screen id", 40);
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id))
      invalid("Invalid screen identifier.");
    if (!["dashboard", "detail", "confirmation"].includes(String(s.layout)))
      invalid("Choose a built-in screen layout.");
    if (
      !Array.isArray(s.labels) ||
      s.labels.length > 4 ||
      !Array.isArray(s.actions) ||
      !s.actions.length ||
      s.actions.length > 3
    )
      invalid("Use up to four labels and 1–3 navigation actions per screen.");
    return {
      id,
      layout: s.layout as PrototypeScreen["layout"],
      title: text(s.title, "screen title", 120),
      description: text(s.description, "screen description", 800),
      labels: s.labels.map((x) => text(x, "label", 120)),
      actions: s.actions.map((a) => {
        assertObject(a);
        return {
          label: text(a.label, "action", 60),
          target: text(a.target, "destination", 40),
        };
      }),
    };
  });
  const ids = new Set(screens.map((s) => s.id));
  if (
    ids.size !== screens.length ||
    screens.some((s) => s.actions.some((a) => !ids.has(a.target)))
  )
    invalid("Every action must lead to an existing, uniquely named screen.");
  const reached = new Set([screens[0].id]);
  for (let i = 0; i < screens.length; i++)
    for (const s of screens)
      if (reached.has(s.id)) for (const a of s.actions) reached.add(a.target);
  if (reached.size !== screens.length)
    invalid("Every screen must be reachable from the first screen.");
  return {
    title: text(raw.title, "prototype title", 180),
    purpose: text(raw.purpose, "participant task", 1000),
    screens,
    consent: PROTOTYPE_CONSENT,
  };
}
export function prototypeFeedback(raw: unknown) {
  assertObject(raw);
  if (raw.consent !== true || raw.website !== "")
    invalid("Explicit consent is required.");
  if (!["yes", "partly", "no"].includes(String(raw.outcome)))
    invalid("Choose whether you could complete the task.");
  return {
    outcome: raw.outcome as "yes" | "partly" | "no",
    comment: text(raw.comment, "feedback", 2000),
    consent: PROTOTYPE_CONSENT,
  };
}
export function prototypeTemplate(
  template: "workflow" | "workspace" | "booking",
): PrototypeContent {
  const labels =
    template === "booking"
      ? ["Choose a time", "Review booking", "Booking confirmed"]
      : template === "workspace"
        ? ["Your workspace", "Project overview", "Project created"]
        : ["Your dashboard", "Review your task", "Task complete"];
  return {
    title: "My product concept",
    purpose:
      "Explore the concept and complete the main task. What would help you in your real work?",
    consent: PROTOTYPE_CONSENT,
    screens: labels.map((title, i) => ({
      id: `screen_${i + 1}`,
      layout: (["dashboard", "detail", "confirmation"] as const)[i],
      title,
      description: [
        "Everything you need to get started, in one place.",
        "Review the details before you continue.",
        "You’re all set. What would you do next?",
      ][i],
      labels:
        i === 0
          ? ["Upcoming work", "Recent activity", "Your progress"]
          : i === 1
            ? ["Overview", "Details"]
            : ["Completed"],
      actions: [
        {
          label:
            i === 0 ? "Get started" : i === 1 ? "Confirm" : "Back to dashboard",
          target: `screen_${i === 2 ? 1 : i + 2}`,
        },
      ],
    })),
  };
}
