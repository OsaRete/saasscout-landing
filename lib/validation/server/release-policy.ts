import "server-only";

export type ValidationPrivateMode =
  "DISABLED" | "INTERVIEWS" | "SURVEYS" | "INTERVIEWS_AND_SURVEYS";
export function getValidationReleasePolicy(
  config: { privateMode?: unknown; publicSurveys?: unknown } = {
    privateMode: process.env.VALIDATION_PRIVATE_MODE,
    publicSurveys: process.env.VALIDATION_PUBLIC_SURVEYS,
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
  expectedFamily?: "customer_interview" | "survey",
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
