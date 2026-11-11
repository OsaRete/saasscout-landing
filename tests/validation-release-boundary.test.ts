import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  getValidationReleasePolicy,
  validationOperationAllowed,
  assertValidationOperation,
  assertValidationFamily,
  validationAdmission,
  validationDisabledResponse,
} from "../lib/validation/server/release-policy.ts";
import { validationTestModule } from "./support/validation-module.ts";

const read = (path: string) => readFileSync(path, "utf8");
const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const operations: Record<string, Record<string, string>> = {
  "landing-pages/[versionId]": { GET: "landing.read" },
  "landing-pages/[versionId]/remove": { POST: "landing.remove" },
  "landing-pages/[versionId]/save": { POST: "landing.save" },
  "landing-pages/[versionId]/publish": { POST: "landing.publish" },
  "landing-pages/[versionId]/unpublish": { POST: "landing.unpublish" },
  subjects: { GET: "subject.list", POST: "subject.create" },
  "subjects/[id]": { GET: "subject.read", POST: "subject.link" },
  "subjects/[id]/hypotheses": { POST: "hypothesis.create" },
  "hypotheses/[id]/versions": { POST: "hypothesis.version" },
  "subjects/[id]/experiments": { POST: "experiment.create" },
  "experiments/[id]/versions": { POST: "experiment.version" },
  "experiment-versions/[id]/transition": { POST: "experiment.transition" },
  participants: { POST: "participant.create" },
  classifications: { POST: "classification.create" },
  "interview-plans": { POST: "interview.plan" },
  interviews: { POST: "interview.create" },
  "interviews/[id]": { POST: "interview.update" },
  "interview-observations": { POST: "interview.observation" },
  "survey-plans": { POST: "survey.plan" },
  "survey-publications": { POST: "survey.publish" },
  "survey-publications/[id]/revoke": { POST: "survey.revoke" },
  observations: { POST: "observation.generic" },
  promotions: { POST: "shared.promote" },
  "design-assistant": { POST: "ai.design" },
  "subjects/[id]/intelligence": { GET: "ai.status", POST: "ai.analyze" },
};
const core = new Set([
  "subject.list",
  "subject.create",
  "subject.read",
  "subject.link",
  "hypothesis.create",
  "hypothesis.version",
  "experiment.create",
  "experiment.version",
  "experiment.transition",
]);
const interview = new Set([
  "participant.create",
  "classification.create",
  "interview.plan",
  "interview.create",
  "interview.update",
  "interview.observation",
]);
function expected(op: string | undefined, mode: string, pub: string) {
  if (!op) return false;
  const interviews = mode === "INTERVIEWS" || mode === "INTERVIEWS_AND_SURVEYS",
    surveys = mode === "SURVEYS" || mode === "INTERVIEWS_AND_SURVEYS";
  if (core.has(op)) return interviews || surveys;
  if (interview.has(op)) return interviews;
  if (op === "survey.plan" || op === "survey.revoke") return surveys;
  if (["survey.publish", "survey.resolve", "survey.submit"].includes(op))
    return surveys && pub === "ENABLED";
  return false;
}
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(root + "/" + e.name)
        : e.name === "route.ts"
          ? [root + "/" + e.name]
          : [],
    )
    .sort();
}
const routes = [
  ...files("app/api/validation"),
  ...files("app/api/public/surveys"),
  ...files("app/api/public/validation/landing"),
];
function mode(value: string | undefined, pub = "DISABLED") {
  if (value === undefined) delete process.env.VALIDATION_PRIVATE_MODE;
  else process.env.VALIDATION_PRIVATE_MODE = value;
  process.env.VALIDATION_PUBLIC_SURVEYS = pub;
}
const priorMode = process.env.VALIDATION_PRIVATE_MODE,
  priorPublic = process.env.VALIDATION_PUBLIC_SURVEYS;
test.after(() => {
  if (priorMode === undefined) delete process.env.VALIDATION_PRIVATE_MODE;
  else process.env.VALIDATION_PRIVATE_MODE = priorMode;
  if (priorPublic === undefined) delete process.env.VALIDATION_PUBLIC_SURVEYS;
  else process.env.VALIDATION_PUBLIC_SURVEYS = priorPublic;
});
const bad: unknown[] = [
  undefined,
  null,
  "",
  " ",
  "ENABLED",
  "interviews",
  "INTERVIEWS\n",
  true,
  false,
  1,
  {},
  [],
  "PRIVATE_BETA",
];
for (const [i, value] of bad.entries())
  test(`malformed/default private configuration ${i} denies`, () => {
    const p = getValidationReleasePolicy({
      privateMode: value,
      publicSurveys: "ENABLED",
    });
    assert.equal(p.mode, "DISABLED");
    assert.equal(p.privateInterviews, false);
    assert.equal(p.privateSurveys, false);
    assert.equal(p.publicSurveyParticipation, false);
  });
for (const value of bad.filter((value) => value !== "ENABLED"))
  test(`invalid public setting ${String(value)} does not admit participation`, () => {
    const p = getValidationReleasePolicy({
      privateMode: "SURVEYS",
      publicSurveys: value,
    });
    assert.equal(p.privateSurveys, true);
    assert.equal(p.publicSurveyParticipation, false);
  });
test("missing runtime environment, legacy flag and unknown/prototype operations never grant authority", () => {
  mode(undefined, "ENABLED");
  process.env.VALIDATION_RELEASE_MODE = "ENABLED";
  assert.equal(validationOperationAllowed("subject.list", "GET"), false);
  for (const op of [
    undefined,
    "unknown",
    "toString",
    "constructor",
    "__proto__",
  ])
    assert.equal(validationOperationAllowed(op, "POST"), false);
  delete process.env.VALIDATION_RELEASE_MODE;
});
for (const current of [
  "DISABLED",
  "INTERVIEWS",
  "SURVEYS",
  "INTERVIEWS_AND_SURVEYS",
])
  for (const pub of ["DISABLED", "ENABLED"]) {
    for (const path of routes)
      for (const method of methods) {
        const key = path.slice(
          "app/api/validation/".length,
          -"/route.ts".length,
        );
        const publicOperations: Record<string, string> = path.includes(
          "/validation/landing/",
        )
          ? {}
          : path.includes("/responses/")
            ? { POST: "survey.submit" }
            : { GET: "survey.resolve" };
        const op = path.includes("api/public/")
          ? publicOperations[method]
          : operations[key]?.[method];
        const allow = expected(op, current, pub);
        test(`${current}/${pub}: ${method} ${path} ${allow ? "admits only named operation" : "denies before side effects"}`, async () => {
          mode(current, pub);
          let touched = false;
          const stop = new Error("ADMITTED_OPERATION");
          const trap = new Proxy(
            {},
            {
              get() {
                touched = true;
                throw stop;
              },
            },
          );
          const route = validationTestModule(path, (specifier) =>
            /release-policy(?:\.ts)?$/.test(specifier)
              ? { validationAdmission, validationDisabledResponse }
              : trap,
          );
          const handler = route[method] as (
            req: Request,
            ctx: unknown,
          ) => Promise<Response> | Response;
          assert.equal(typeof handler, "function");
          const req = new Request(
            "http://localhost/private-token?secret=sentinel",
            {
              method,
              headers: { authorization: "Bearer private-auth-sentinel" },
              ...(["GET", "HEAD"].includes(method)
                ? {}
                : { body: "{bad-private-evidence" }),
            },
          );
          const ctx = {
            get params() {
              touched = true;
              throw stop;
            },
          };
          if (allow) {
            await assert.rejects(
              async () => handler(req, ctx),
              (e) => e === stop,
            );
            assert.equal(touched, true);
          } else {
            const res = await handler(req, ctx);
            assert.equal(touched, false);
            assert.equal(res.status, 503);
            assert.match(
              res.headers.get("cache-control")!,
              /private.*no-store/,
            );
            assert.deepEqual(await res.json(), {
              error: {
                code: "validation_disabled",
                message: "Validation is unavailable in this release.",
              },
            });
          }
        });
      }
  }
test("route inventory is explicit and complete", () => {
  assert.equal(routes.length, 30);
  assert.equal(Object.keys(operations).length, 25);
});
test("persisted unknown families and cross-capability families deny", () => {
  for (const current of [
    "DISABLED",
    "INTERVIEWS",
    "SURVEYS",
    "INTERVIEWS_AND_SURVEYS",
  ]) {
    mode(current);
    for (const family of [
      "customer_interview",
      "survey",
      "landing_waitlist",
      "social_validation_post",
      "prototype",
      undefined,
    ]) {
      const allowed =
        (family === "customer_interview" && current.includes("INTERVIEWS")) ||
        (family === "survey" && current.includes("SURVEYS"));
      if (allowed) assert.doesNotThrow(() => assertValidationFamily(family));
      else
        assert.throws(
          () => assertValidationFamily(family),
          /validation_disabled/,
        );
    }
  }
});
test("permanent denials cannot be changed by environment or a forged policy projection", () => {
  mode("INTERVIEWS_AND_SURVEYS", "ENABLED");
  for (const key of [
    "VALIDATION_SHARED_PROMOTION",
    "VALIDATION_QUALIFIED_CONSUMPTION",
    "VALIDATION_AI",
  ])
    process.env[key] = "ENABLED";
  for (const [op, method] of [
    ["shared.prepare", "POST"],
    ["shared.promote", "POST"],
    ["shared.consume", "GET"],
    ["ai.design", "POST"],
    ["ai.analyze", "POST"],
    ["ai.status", "GET"],
    ["observation.generic", "POST"],
  ]) {
    assert.equal(validationOperationAllowed(op, method), false);
    assert.throws(
      () => assertValidationOperation(op, method),
      /validation_disabled/,
    );
  }
  const p = getValidationReleasePolicy();
  assert.equal(Object.isFrozen(p), true);
  assert.equal(
    validationOperationAllowed("shared.promote", "POST", {
      ...p,
      sharedPromotion: true,
    } as unknown as typeof p),
    false,
  );
  for (const key of [
    "VALIDATION_SHARED_PROMOTION",
    "VALIDATION_QUALIFIED_CONSUMPTION",
    "VALIDATION_AI",
  ])
    delete process.env[key];
});
for (const [file, name, args] of [
  [
    "promotion/promotion-service.ts",
    "promoteCustomerInterviewEvidence",
    ["owner", "observation"],
  ],
  ["promotion/read-repository.ts", "readValidationPromotionRows", []],
  [
    "promotion/read-repository.ts",
    "readValidationPromotionRowsForOwner",
    ["owner", "observation"],
  ],
  [
    "promotion/current-qualified-evidence-reader.ts",
    "readCurrentQualifiedValidationEvidence",
    ["canonical"],
  ],
  [
    "promotion/trusted-qualified-evidence-reader.ts",
    "readTrustedQualifiedValidationEvidence",
    ["canonical"],
  ],
] as const)
  test(`real ${name} rejects before client creation or reads, with and without injected db`, async () => {
    mode("INTERVIEWS_AND_SURVEYS", "ENABLED");
    let calls = 0;
    const moduleExports = validationTestModule(
      "lib/validation/" + file,
      (specifier) => {
        if (/server-admin(?:\.ts)?$/.test(specifier))
          return {
            createSupabaseAdminClient() {
              calls++;
              throw new Error("client created");
            },
          };
        return undefined;
      },
    );
    const fn = moduleExports[name] as (...args: unknown[]) => Promise<unknown>;
    await assert.rejects(() => fn(...args), /validation_disabled/);
    const db = new Proxy(
      {},
      {
        get() {
          calls++;
          throw new Error("DB read");
        },
      },
    );
    await assert.rejects(() => fn(...args, db), /validation_disabled/);
    assert.equal(calls, 0);
  });
test("private workspace has no promotion read, controls or historical authority badges", () => {
  assert.doesNotMatch(
    read("lib/validation/server/repository.ts"),
    /validation_evidence_promotions|promotions:/,
  );
  assert.doesNotMatch(
    read("app/validation/[id]/page.tsx"),
    /api\/validation\/promotions|Shared Data Moat evidence|Promote reviewed evidence|data\.promotions/,
  );
});
test("direct-entry Validation is independent of Discovery, Scan and AI", () => {
  const service = read("lib/validation/server/service.ts"),
    repo = read("lib/validation/server/repository.ts"),
    ui = read("app/validation/new/page.tsx");
  assert.match(service, /user_entered/);
  assert.match(service, /else if\(input.provenance!=null\)/);
  assert.match(repo, /if \(link\) await this.verifyUpstream/);
  assert.match(repo, /validation_create_subject/);
  assert.match(ui, /Enter my own idea/);
  assert.match(ui, /creationOrigin:"user_entered"/);
});
test("layout projects capabilities; token page independently denies before reading token", async () => {
  mode("SURVEYS", "DISABLED");
  const page = validationTestModule(
    "app/validation/survey/[token]/page.tsx",
    (s) =>
      s === "./public-survey"
        ? {
            default() {
              throw new Error("survey mounted");
            },
          }
        : undefined,
  );
  const result = await (page.default as (p: unknown) => Promise<unknown>)({
    get params() {
      throw new Error("token read");
    },
  });
  assert.ok(result);
  assert.match(
    read("app/validation/layout.tsx"),
    /ValidationCapabilityProvider/,
  );
});
for (const [file, name, methodsToCall] of [
  ["design-assistant/service.ts", "ValidationDesignService", ["generate"]],
  [
    "intelligence/service.ts",
    "ValidationIntelligenceService",
    ["snapshot", "status", "analyze"],
  ],
] as const)
  test(`direct ${name} never reads private evidence or calls a provider in Beta`, async () => {
    mode("INTERVIEWS_AND_SURVEYS", "ENABLED");
    let calls = 0;
    const exports = validationTestModule("lib/validation/" + file);
    const Constructor = exports[name] as new (
      db: unknown,
      provider: () => Promise<unknown>,
    ) => Record<string, (...args: unknown[]) => Promise<unknown>>;
    const service = new Constructor(
      new Proxy(
        {},
        {
          get() {
            calls++;
            throw new Error("db touched");
          },
        },
      ),
      async () => {
        calls++;
        return {};
      },
    );
    for (const name of methodsToCall)
      await assert.rejects(
        () => service[name]("owner", "subject"),
        /validation_disabled/,
      );
    assert.equal(calls, 0);
  });
test("promotion CLI is tied to permanent preparation denial before artifact work", () => {
  const cli = read("scripts/validation-promotion-dry-run.ts");
  assert.ok(
    cli.indexOf('assertValidationOperation("shared.prepare")') <
      cli.indexOf("const outputPath"),
  );
});
