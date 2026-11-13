import type { ValidationUiCapabilities } from "./release-capabilities";

// Presentation guidance only. Server admission remains authoritative.
export const validationMethods = [
  {
    family: "customer_interview",
    label: "Interviews",
    capability: "privateInterviews",
    publicCapability: null,
    goal: "Understand the problem",
    description:
      "Have focused conversations about past behavior, pain and workarounds.",
    useCase: "Choose when you need depth and follow-up questions.",
    signal: "Reported experiences and private research notes.",
    collection: "Scheduled one-to-one conversations",
    privacy: "anonymous_notes",
  },
  {
    family: "survey",
    label: "Surveys",
    capability: "privateSurveys",
    publicCapability: "publicSurveyParticipation",
    goal: "Compare structured feedback",
    description: "Ask the same questions across your target audience.",
    useCase: "Choose when you have specific assumptions to compare.",
    signal: "Raw answers and literal response counts.",
    collection: "Manually distributed survey",
    privacy: "anonymous_notes",
  },
  {
    family: "landing_waitlist",
    label: "Landing Pages",
    capability: "privateLandingPages",
    publicCapability: "publicLandingParticipation",
    goal: "Collect interest in an offer",
    description:
      "Present a focused offer and invite consented waitlist signups.",
    useCase: "Choose before building to explore interest in your message.",
    signal: "Recorded views and retained signups; not verified demand.",
    collection: "Validation landing page and consented waitlist",
    privacy: "identified_with_explicit_consent",
  },
  {
    family: "interactive_prototype",
    label: "Interactive Prototypes",
    capability: "privatePrototypes",
    publicCapability: "publicPrototypeParticipation",
    goal: "Explore a concept's usability",
    description: "Let people navigate a visual concept and share feedback.",
    useCase: "Choose to explore a workflow before implementing it.",
    signal: "Unverified navigation signals and self-reported outcomes.",
    collection: "Privately shared navigable concept test",
    privacy: "anonymous_notes",
  },
  {
    family: "external_mvp",
    label: "External MVP Testing",
    capability: "privateExternalMvp",
    publicCapability: "publicExternalMvpParticipation",
    goal: "Get feedback on a working MVP",
    description: "Invite people to try your externally hosted MVP.",
    useCase: "Choose when you already have a working product elsewhere.",
    signal: "Self-reported task completion and feedback; use is not verified.",
    collection: "Privately shared external MVP and structured feedback",
    privacy: "identified_with_explicit_consent",
  },
  {
    family: "commercial_intent",
    label: "Commercial Intent",
    capability: "privateCommercialIntent",
    publicCapability: "publicCommercialIntentParticipation",
    goal: "Explore nonbinding buying interest",
    description:
      "Ask about demos, quotes, pilots, early access or willingness to pay.",
    useCase: "Choose to explore a specific offer and its conditions.",
    signal: "Nonbinding statements; no purchase, payment or confirmed demand.",
    collection: "Consented nonbinding commercial intent",
    privacy: "identified_with_explicit_consent",
  },
] as const;
export type ValidationMethod = (typeof validationMethods)[number];
export type MethodFamily = ValidationMethod["family"];
export function findValidationMethod(value: unknown) {
  return validationMethods.find((method) => method.family === value);
}
export function methodAvailable(
  method: ValidationMethod,
  capabilities: ValidationUiCapabilities,
) {
  return capabilities[method.capability] === true;
}
export function methodCollectionAvailable(
  method: ValidationMethod,
  capabilities: ValidationUiCapabilities,
) {
  return (
    methodAvailable(method, capabilities) &&
    (method.publicCapability === null ||
      capabilities[method.publicCapability] === true)
  );
}
