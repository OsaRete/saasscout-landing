import "server-only";

export type ValidationPrivateMode =
  "DISABLED" | "INTERVIEWS" | "SURVEYS" | "INTERVIEWS_AND_SURVEYS";
export function getValidationReleasePolicy(
  config: {
    privateMode?: unknown;
    publicSurveys?: unknown;
    privateExternalMvp?: unknown;
    publicExternalMvp?: unknown;
    privatePrototypes?: unknown;
    publicPrototypes?: unknown;
    prototypeCookieSecret?: unknown;
    privateLandingPages?: unknown;
    publicLandingPages?: unknown;
    landingCookieSecret?: unknown;
  } = {
    privateMode: process.env.VALIDATION_PRIVATE_MODE,
    privateExternalMvp: process.env.VALIDATION_PRIVATE_EXTERNAL_MVP,
    publicExternalMvp: process.env.VALIDATION_PUBLIC_EXTERNAL_MVP,
    privatePrototypes: process.env.VALIDATION_PRIVATE_PROTOTYPES,
    publicPrototypes: process.env.VALIDATION_PUBLIC_PROTOTYPES,
    prototypeCookieSecret: process.env.VALIDATION_PROTOTYPE_COOKIE_SECRET,
    publicSurveys: process.env.VALIDATION_PUBLIC_SURVEYS,
    privateLandingPages: process.env.VALIDATION_PRIVATE_LANDING_PAGES,
    publicLandingPages: process.env.VALIDATION_PUBLIC_LANDING_PAGES,
    landingCookieSecret: process.env.VALIDATION_LANDING_COOKIE_SECRET,
  },
) {
  const mode: ValidationPrivateMode =
    config.privateMode === "INTERVIEWS" ||
    config.privateMode === "SURVEYS" ||
    config.privateMode === "INTERVIEWS_AND_SURVEYS"
      ? config.privateMode
      : "DISABLED";
  const privateInterviews =
    mode === "INTERVIEWS" || mode === "INTERVIEWS_AND_SURVEYS";
  const privateSurveys =
    mode === "SURVEYS" || mode === "INTERVIEWS_AND_SURVEYS";
  return Object.freeze({
    mode,
    privateExternalMvp:
      mode !== "DISABLED" && config.privateExternalMvp === "ENABLED",
    publicExternalMvpParticipation:
      mode !== "DISABLED" &&
      config.privateExternalMvp === "ENABLED" &&
      config.publicExternalMvp === "ENABLED",
    privatePrototypes:
      mode !== "DISABLED" && config.privatePrototypes === "ENABLED",
    publicPrototypeParticipation:
      mode !== "DISABLED" &&
      config.privatePrototypes === "ENABLED" &&
      config.publicPrototypes === "ENABLED" &&
      typeof config.prototypeCookieSecret === "string" &&
      config.prototypeCookieSecret.length >= 32,
    privateLandingPages:
      mode !== "DISABLED" && config.privateLandingPages === "ENABLED",
    publicLandingParticipation:
      mode !== "DISABLED" &&
      config.privateLandingPages === "ENABLED" &&
      config.publicLandingPages === "ENABLED" &&
      typeof config.landingCookieSecret === "string" &&
      config.landingCookieSecret.length >= 32,
    privateInterviews,
    privateSurveys,
    publicSurveyParticipation:
      privateSurveys && config.publicSurveys === "ENABLED",
    privateAiDesign: false as const,
    privateAiInterpretation: false as const,
    sharedPreparation: false as const,
    sharedPromotion: false as const,
    qualifiedSharedConsumption: false as const,
  });
}
export type ValidationReleasePolicy = ReturnType<
  typeof getValidationReleasePolicy
>;

// The operation and method are server-owned constants, never request payload claims.
const operations = {
  "subject.list": ["GET", "core"],
  "subject.create": ["POST", "core"],
  "subject.read": ["GET", "core"],
  "subject.link": ["POST", "core"],
  "hypothesis.create": ["POST", "core"],
  "hypothesis.version": ["POST", "core"],
  "experiment.create": ["POST", "core"],
  "experiment.version": ["POST", "core"],
  "experiment.transition": ["POST", "core"],
  "participant.create": ["POST", "privateInterviews"],
  "classification.create": ["POST", "privateInterviews"],
  "interview.plan": ["POST", "privateInterviews"],
  "interview.create": ["POST", "privateInterviews"],
  "interview.update": ["POST", "privateInterviews"],
  "interview.observation": ["POST", "privateInterviews"],
  "external-mvp.read": ["GET", "privateExternalMvp"],
  "external-mvp.save": ["POST", "privateExternalMvp"],
  "external-mvp.remove": ["POST", "privateExternalMvp"],
  "external-mvp.publish": ["POST", "publicExternalMvpParticipation"],
  "external-mvp.unpublish": ["POST", "privateExternalMvp"],
  "external-mvp.resolve": ["GET", "publicExternalMvpParticipation"],
  "external-mvp.submit": ["POST", "publicExternalMvpParticipation"],
  "prototype.read": ["GET", "privatePrototypes"],
  "prototype.save": ["POST", "privatePrototypes"],
  "prototype.remove": ["POST", "privatePrototypes"],
  "prototype.publish": ["POST", "publicPrototypeParticipation"],
  "prototype.unpublish": ["POST", "privatePrototypes"],
  "prototype.resolve": ["GET", "publicPrototypeParticipation"],
  "prototype.event": ["POST", "publicPrototypeParticipation"],
  "prototype.submit": ["POST", "publicPrototypeParticipation"],
  "landing.read": ["GET", "privateLandingPages"],
  "landing.remove": ["POST", "privateLandingPages"],
  "landing.save": ["POST", "privateLandingPages"],
  "landing.publish": ["POST", "publicLandingParticipation"],
  "landing.unpublish": ["POST", "privateLandingPages"],
  "landing.resolve": ["GET", "publicLandingParticipation"],
  "landing.view": ["POST", "publicLandingParticipation"],
  "landing.submit": ["POST", "publicLandingParticipation"],
  "survey.plan": ["POST", "privateSurveys"],
  "survey.publish": ["POST", "publicSurveyParticipation"],
  "survey.revoke": ["POST", "privateSurveys"],
  "survey.resolve": ["GET", "publicSurveyParticipation"],
  "survey.submit": ["POST", "publicSurveyParticipation"],
  "ai.design": ["POST", "privateAiDesign"],
  "ai.status": ["GET", "privateAiInterpretation"],
  "ai.analyze": ["POST", "privateAiInterpretation"],
  "observation.generic": ["POST", "sharedPreparation"],
  "shared.prepare": ["POST", "sharedPreparation"],
  "shared.promote": ["POST", "sharedPromotion"],
  "shared.consume": ["GET", "qualifiedSharedConsumption"],
} as const;
export type ValidationOperation = keyof typeof operations;
export function validationOperationAllowed(
  operation: unknown,
  method: string,
  policy = getValidationReleasePolicy(),
): boolean {
  if (
    typeof operation === "string" &&
    (operation.startsWith("shared.") ||
      operation.startsWith("ai.") ||
      operation === "observation.generic")
  )
    return false;
  if (typeof operation !== "string" || !Object.hasOwn(operations, operation))
    return false;
  const [expectedMethod, capability] =
    operations[operation as ValidationOperation];
  if (method !== expectedMethod) return false;
  return capability === "core"
    ? policy.privateInterviews || policy.privateSurveys
    : policy[capability];
}
export function admittedValidationFamilies(
  policy = getValidationReleasePolicy(),
): string[] {
  return [
    ...(policy.privateInterviews ? ["customer_interview"] : []),
    ...(policy.privateSurveys ? ["survey"] : []),
    ...(policy.privateExternalMvp ? ["external_mvp"] : []),
    ...(policy.privatePrototypes ? ["interactive_prototype"] : []),
    ...(policy.privateLandingPages ? ["landing_waitlist"] : []),
  ];
}
export class ValidationReleaseDeniedError extends Error {
  constructor() {
    super("validation_disabled");
    this.name = "ValidationReleaseDeniedError";
  }
}
export function assertValidationOperation(
  operation: unknown,
  method = "POST",
): void {
  if (!validationOperationAllowed(operation, method))
    throw new ValidationReleaseDeniedError();
}
export function assertValidationFamily(
  family: unknown,
  expectedFamily?:
    | "customer_interview"
    | "survey"
    | "landing_waitlist"
    | "interactive_prototype"
    | "external_mvp",
): void {
  if (
    typeof family !== "string" ||
    !admittedValidationFamilies().includes(family) ||
    (expectedFamily !== undefined && family !== expectedFamily)
  )
    throw new ValidationReleaseDeniedError();
}
export const VALIDATION_PRIVATE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
});
export function validationDisabledResponse(): Response {
  return Response.json(
    {
      error: {
        code: "validation_disabled",
        message: "Validation is unavailable in this release.",
      },
    },
    { status: 503, headers: VALIDATION_PRIVATE_HEADERS },
  );
}
export function validationAdmission(
  operation: unknown,
  method: string,
): Response | null {
  return validationOperationAllowed(operation, method)
    ? null
    : validationDisabledResponse();
}
