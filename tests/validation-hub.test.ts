import assert from "node:assert/strict";
import test from "node:test";
import {
  validationMethods,
  findValidationMethod,
  methodAvailable,
  methodCollectionAvailable,
} from "../components/validation/methods.ts";
import { validationTestModule } from "./support/validation-module.ts";
import type { ValidationUiCapabilities } from "../components/validation/release-capabilities";
const policy = validationTestModule(
  "lib/validation/server/release-policy.ts",
) as typeof import("../lib/validation/server/release-policy");
test("six method choices match authoritative private and public admission", () => {
  for (const privateMode of [
    undefined,
    "DISABLED",
    "INTERVIEWS",
    "SURVEYS",
    "INTERVIEWS_AND_SURVEYS",
    "interviews",
    " INTERVIEWS",
  ])
    for (const enabled of [undefined, "ENABLED", "enabled"])
      for (const publicEnabled of [undefined, "ENABLED"]) {
        const capabilities = policy.getValidationReleasePolicy({
          privateMode,
          privateLandingPages: enabled,
          privatePrototypes: enabled,
          privateExternalMvp: enabled,
          privateCommercialIntent: enabled,
          publicSurveys: publicEnabled,
          publicLandingPages: publicEnabled,
          publicPrototypes: publicEnabled,
          publicExternalMvp: publicEnabled,
          publicCommercialIntent: publicEnabled,
          landingCookieSecret: "synthetic-".repeat(4),
          prototypeCookieSecret: "synthetic-".repeat(4),
        });
        const admitted = policy.admittedValidationFamilies(capabilities);
        for (const method of validationMethods) {
          assert.equal(
            methodAvailable(method, capabilities),
            admitted.includes(method.family),
            `${privateMode}/${enabled}/${method.family}`,
          );
          const operation = {
            survey: "survey.publish",
            landing_waitlist: "landing.publish",
            interactive_prototype: "prototype.publish",
            external_mvp: "external-mvp.publish",
            commercial_intent: "commercial-intent.publish",
            customer_interview: "interview.create",
          }[method.family];
          assert.equal(
            methodCollectionAvailable(method, capabilities),
            policy.validationOperationAllowed(operation, "POST", capabilities),
          );
        }
      }
});
test("missing UI capabilities fail closed and unknown query values cannot choose a method", () => {
  const off: ValidationUiCapabilities = {
    privateInterviews: false,
    privateSurveys: false,
    publicSurveyParticipation: false,
    privateAiDesign: false,
    privateAiInterpretation: false,
  };
  assert.equal(validationMethods.length, 6);
  assert.equal(
    new Set(validationMethods.map((method) => method.family)).size,
    6,
  );
  for (const method of validationMethods) {
    assert.equal(methodAvailable(method, off), false);
    assert.equal(methodCollectionAvailable(method, off), false);
  }
  for (const value of [
    null,
    undefined,
    "__proto__",
    "toString",
    "purchase",
    "https://example.com",
    "SURVEY",
  ])
    assert.equal(findValidationMethod(value), undefined);
});
test("landing/prototype public collection requires the server secret as well as flags", () => {
  const capabilities = policy.getValidationReleasePolicy({
    privateMode: "INTERVIEWS",
    privateLandingPages: "ENABLED",
    privatePrototypes: "ENABLED",
    publicLandingPages: "ENABLED",
    publicPrototypes: "ENABLED",
  });
  for (const family of ["landing_waitlist", "interactive_prototype"]) {
    const method = findValidationMethod(family)!;
    assert.equal(methodAvailable(method, capabilities), true);
    assert.equal(methodCollectionAvailable(method, capabilities), false);
  }
});
