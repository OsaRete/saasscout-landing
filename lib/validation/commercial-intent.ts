import { assertObject, text, ValidationServerError } from "./server/contracts";
export const COMMERCIAL_INTENT_CONSENT =
  "I agree to share my response privately with the experiment creator for commercial research. This is a nonbinding expression only: no purchase, payment, reservation, subscription or financial commitment is created. I will not include personal or sensitive information in my answers.";
export const COMMERCIAL_INTENT_CONTACT_CONSENT =
  "I agree to share my email with the creator for follow-up about this offer only. I can ask the creator to remove it through the channel that supplied this link.";
export const COMMERCIAL_OBJECTIVES = {
  demo: "Request a product demonstration",
  quote: "Request a quote or pricing information",
  pilot: "Express interest in a pilot program",
  early_access: "Join an early-access or commercial-interest list",
  willingness_to_pay: "Express nonbinding willingness to pay",
} as const;
export type CommercialObjective = keyof typeof COMMERCIAL_OBJECTIVES;
export type CommercialIntentContent = {
  title: string;
  objective: CommercialObjective;
  purpose: string;
  instructions: string;
  questions: string[];
  consent: string;
};
function invalid(message: string): never {
  throw new ValidationServerError(400, "invalid_request", message);
}
export function commercialIntentContent(raw: unknown): CommercialIntentContent {
  assertObject(raw);
  if (
    typeof raw.objective !== "string" ||
    !Object.hasOwn(COMMERCIAL_OBJECTIVES, raw.objective)
  )
    invalid("Choose a commercial-intent objective.");
  if (
    !Array.isArray(raw.questions) ||
    raw.questions.length < 1 ||
    raw.questions.length > 5
  )
    invalid("Use 1–5 research questions.");
  const questions = raw.questions.map((q) => text(q, "question", 240));
  if (new Set(questions.map((q) => q.toLowerCase())).size !== questions.length)
    invalid("Use distinct questions.");
  return {
    title: text(raw.title, "offer title", 180),
    objective: raw.objective as CommercialObjective,
    purpose: text(raw.purpose, "offer description", 1000),
    instructions: text(raw.instructions, "nonbinding conditions", 2000),
    questions,
    consent: COMMERCIAL_INTENT_CONSENT,
  };
}
export function commercialIntentFeedback(raw: unknown) {
  assertObject(raw);
  if (raw.consent !== true || raw.website !== "")
    invalid("Explicit research consent is required.");
  if (raw.outcome !== "interested" && raw.outcome !== "not_now")
    invalid("Choose your response to the offer.");
  if (
    !Array.isArray(raw.answers) ||
    raw.answers.length < 1 ||
    raw.answers.length > 5
  )
    invalid("Answer the research questions.");
  let email: string | null = null;
  if (raw.email !== undefined && raw.email !== "") {
    email = text(raw.email, "email", 254).toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      raw.contactConsent !== true
    )
      invalid(
        "A valid email and separate offer follow-up consent are required.",
      );
  }
  // Demo/quote/pilot requests are still recorded without requiring contact data.
  // A contact is optional and never treated as verified identity.
  return {
    outcome: raw.outcome as "interested" | "not_now",
    answers: raw.answers.map((a) => text(a, "answer", 2000)),
    email,
    consent: COMMERCIAL_INTENT_CONSENT,
    contactConsent: email ? COMMERCIAL_INTENT_CONTACT_CONSENT : null,
  };
}
export const commercialIntentTemplate = (): CommercialIntentContent => ({
  title: "Explore our offer",
  objective: "demo",
  purpose:
    "Describe who this offer is for, the problem it addresses and what is available today.",
  instructions:
    "Describe what happens after a request, availability and any proposed price, currency, billing period and conditions. All responses are nonbinding. No payment or purchase is required or taken.",
  questions: ["What would you need from this offer before taking a next step?"],
  consent: COMMERCIAL_INTENT_CONSENT,
});
