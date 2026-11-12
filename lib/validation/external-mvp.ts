import { assertObject, text, ValidationServerError } from "./server/contracts";
export const EXTERNAL_MVP_CONSENT =
  "I agree to share my feedback privately with the experiment creator for product research. I will not include personal or sensitive information in my answers.";
export const EXTERNAL_MVP_CONTACT_CONSENT =
  "I agree to share my email with the creator for follow-up about this test. I can ask the creator to remove it through the channel that supplied this link.";
export type ExternalMvpContent = {
  title: string;
  url: string;
  purpose: string;
  instructions: string;
  questions: string[];
  consent: string;
};
function invalid(message: string): never {
  throw new ValidationServerError(400, "invalid_request", message);
}
// A navigation-only HTTPS URL. Never fetch, probe DNS, embed, crawl or execute it.
export function externalMvpUrl(raw: unknown): string {
  const value = text(raw, "external MVP URL", 2000);
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return invalid("Enter a public HTTPS URL.");
  }
  const host = u.hostname;
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.hash ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(
      host,
    ) ||
    /(?:^|\.)(?:localhost|metadata)\./.test(host) ||
    /[\s\\\u0000-\u001f\u007f]/.test(value)
  )
    invalid(
      "Use a public HTTPS hostname without credentials, a custom port or a fragment. Local and IP addresses are not supported.",
    );
  return u.href;
}
export function externalMvpContent(raw: unknown): ExternalMvpContent {
  assertObject(raw);
  if (
    !Array.isArray(raw.questions) ||
    raw.questions.length < 1 ||
    raw.questions.length > 5
  )
    invalid("Use 1–5 feedback questions.");
  const questions = raw.questions.map((q) => text(q, "question", 240));
  if (new Set(questions.map((q) => q.toLowerCase())).size !== questions.length)
    invalid("Use distinct questions.");
  return {
    title: text(raw.title, "test title", 180),
    url: externalMvpUrl(raw.url),
    purpose: text(raw.purpose, "objective", 1000),
    instructions: text(raw.instructions, "instructions", 2000),
    questions,
    consent: EXTERNAL_MVP_CONSENT,
  };
}
export function externalMvpFeedback(raw: unknown) {
  assertObject(raw);
  if (raw.consent !== true || raw.website !== "")
    invalid("Explicit feedback consent is required.");
  if (!["yes", "partly", "no", "not_tried"].includes(String(raw.outcome)))
    invalid("Choose a self-reported outcome.");
  if (
    !Array.isArray(raw.answers) ||
    raw.answers.length < 1 ||
    raw.answers.length > 5
  )
    invalid("Answer the feedback questions.");
  let email: string | null = null;
  if (raw.email !== undefined && raw.email !== "") {
    email = text(raw.email, "email", 254).toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      raw.contactConsent !== true
    )
      invalid("A valid email and separate follow-up consent are required.");
  }
  return {
    outcome: raw.outcome as string,
    answers: raw.answers.map((a) => text(a, "answer", 2000)),
    email,
    consent: EXTERNAL_MVP_CONSENT,
    contactConsent: email ? EXTERNAL_MVP_CONTACT_CONSENT : null,
  };
}
export const externalMvpTemplate = (): ExternalMvpContent => ({
  title: "Try our MVP",
  url: "",
  purpose: "Learn whether the main task helps you solve your problem.",
  instructions:
    "Open the MVP in a new tab, try the main task, then return here to share what happened. You can give feedback even if you did not try it.",
  questions: [
    "What worked or stopped you from completing the task?",
    "What would you change before using this again?",
  ],
  consent: EXTERNAL_MVP_CONSENT,
});
