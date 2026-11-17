import assert from "node:assert/strict";
import test from "node:test";
import { validationTestModule } from "./support/validation-module.ts";
import type { LandingContent } from "../lib/validation/landing-pages.ts";
const pure = validationTestModule("lib/validation/landing-pages.ts") as {
  landingContent: (x: unknown) => LandingContent;
  landingEmail: (x: unknown) => string;
  landingInterpretation: (...x: number[]) => {
    state: string;
    rate: number | null;
  };
  LANDING_CONSENT: string;
};
const content = {
  template: "spotlight",
  headline: "Faster research",
  description: "Find what matters.",
  benefits: ["Save time"],
  cta: "Join",
  visual: "✦",
  minimumVisitors: 100,
  targetRate: 10,
};
test("landing authoring bounds and fixed consent", () => {
  const result = pure.landingContent({
    ...content,
    consent: "silently enroll me",
  });
  assert.equal(result.consent, pure.LANDING_CONSENT);
  for (const patch of [
    { template: "html" },
    { headline: "" },
    { description: "x".repeat(1501) },
    { benefits: Array(6).fill("x") },
    { visual: "https://tracker.test/a" },
    { minimumVisitors: 0 },
    { minimumVisitors: 20.5 },
    { targetRate: NaN },
    { targetRate: 101 },
  ])
    assert.throws(() => pure.landingContent({ ...content, ...patch }));
  assert.equal(pure.landingEmail(" Person@Example.com "), "person@example.com");
  for (const email of [
    "bad",
    "a@b",
    "a @b.com",
    null,
    "a".repeat(255) + "@b.com",
  ])
    assert.throws(() => pure.landingEmail(email));
});
test("interest interpretation never divides by zero and compares only after minimum traffic", () => {
  assert.deepEqual(pure.landingInterpretation(0, 0, 100, 10), {
    rate: null,
    state: "inconclusive",
  });
  assert.equal(
    pure.landingInterpretation(99, 50, 100, 10).state,
    "inconclusive",
  );
  assert.deepEqual(pure.landingInterpretation(100, 10, 100, 10), {
    rate: 10,
    state: "supporting",
  });
  assert.deepEqual(pure.landingInterpretation(100, 9, 100, 10), {
    rate: 9,
    state: "contradicting",
  });
});
test("landing capability exact-value matrix keeps shared and AI boundaries closed", () => {
  const { getValidationReleasePolicy, validationOperationAllowed } =
    validationTestModule(
      "lib/validation/server/release-policy.ts",
    ) as typeof import("../lib/validation/server/release-policy.ts");
  for (const mode of [
    undefined,
    "DISABLED",
    "SURVEYS",
    "INTERVIEWS",
    "INTERVIEWS_AND_SURVEYS",
    "enabled",
  ])
    for (const authoring of [
      undefined,
      "DISABLED",
      "ENABLED",
      "enabled",
      " ENABLED",
    ])
      for (const publicFlag of [undefined, "DISABLED", "ENABLED", "enabled"]) {
        const policy = getValidationReleasePolicy({
          privateMode: mode,
          privateLandingPages: authoring,
          publicLandingPages: publicFlag,
          landingCookieSecret: "synthetic-secret-with-at-least-32-characters",
        });
        const privateOk =
          ["SURVEYS", "INTERVIEWS", "INTERVIEWS_AND_SURVEYS"].includes(
            mode || "",
          ) && authoring === "ENABLED";
        assert.equal(
          validationOperationAllowed("landing.save", "POST", policy),
          privateOk,
        );
        assert.equal(
          validationOperationAllowed("landing.unpublish", "POST", policy),
          privateOk,
        );
        for (const [op, method] of [
          ["landing.publish", "POST"],
          ["landing.resolve", "GET"],
          ["landing.view", "POST"],
          ["landing.submit", "POST"],
        ])
          assert.equal(
            validationOperationAllowed(op, method, policy),
            privateOk && publicFlag === "ENABLED",
          );
        assert.equal(
          validationOperationAllowed("landing.submit", "GET", policy),
          false,
        );
        for (const op of [
          "shared.promote",
          "shared.prepare",
          "shared.consume",
          "ai.design",
        ])
          assert.equal(validationOperationAllowed(op, "POST", policy), false);
      }
});
function serviceModule(
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  owned?: (...args: unknown[]) => Promise<unknown>,
) {
  return validationTestModule(
    "lib/validation/server/landing-pages.ts",
    (specifier) => {
      if (
        specifier.endsWith("/release-policy") ||
        specifier === "./release-policy"
      )
        return { assertValidationOperation() {} };
      if (specifier === "./resource-policy")
        return { ownedValidationVersion: owned || (async () => ({})) };
    },
  ) as {
    LandingService: new (db: unknown) => {
      owner: (...args: unknown[]) => Promise<unknown>;
      public: (...args: unknown[]) => Promise<unknown>;
    };
  };
}
test("owner commands verify owned persisted landing family before RPC, derive owner and hash opaque links", async () => {
  const calls: Record<string, unknown>[] = [];
  let checked = false;
  const { LandingService } = serviceModule(
    async () => null,
    async (...args) => {
      assert.equal(args[1], "owner");
      assert.equal(args[2], "version");
      assert.equal(args[3], "landing_waitlist");
      checked = true;
    },
  );
  const svc = new LandingService({
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(checked, true);
      assert.equal(name, "validation_landing_owner");
      calls.push(args);
      return { data: { page: null }, error: null };
    },
  });
  const result = (await svc.owner("owner", "version", "publish", {
    revision: 1,
  })) as { publicPath: string };
  assert.match(result.publicPath, /^\/validation\/landing\/[A-Za-z0-9_-]{43}$/);
  assert.match(String(calls[0].p_token_hash), /^[a-f0-9]{64}$/);
  assert.equal(calls[0].p_owner_id, "owner");
  assert.ok(
    !JSON.stringify(calls).includes(result.publicPath.split("/").at(-1)!),
  );
  const denied = serviceModule(
    async () => null,
    async () => {
      throw new Error("not_found");
    },
  );
  let touched = false;
  await assert.rejects(() =>
    new denied.LandingService({
      rpc: () => {
        touched = true;
      },
    }).owner("other", "version", "read"),
  );
  assert.equal(touched, false);
});
test("public submission requires strict consent, honeypot, email and server browser identity before transport", async () => {
  let writes = 0;
  const { LandingService } = serviceModule(async () => null);
  const svc = new LandingService({
    rpc: async () => {
      writes++;
      return { data: { accepted: true }, error: null };
    },
  });
  const token = "a".repeat(43),
    input = { email: "person@example.com", consent: true, website: "" };
  for (const value of [
    { ...input, consent: false },
    { ...input, consent: "true" },
    { ...input, website: "spam" },
    { ...input, email: "invalid" },
    { ...input, ownerId: "other" },
  ])
    await assert.rejects(() =>
      svc.public(token, "submit", value, "browser", "network"),
    );
  await assert.rejects(() =>
    svc.public(token, "submit", input, undefined, "network"),
  );
  assert.equal(writes, 0);
  assert.deepEqual(
    await svc.public(token, "submit", input, "browser", "network"),
    { accepted: true },
  );
  assert.equal(writes, 1);
});
test("landing HTTP authenticates owners before reading bodies or creating clients, rejects cross-origin public posts", async () => {
  let client = false,
    read = false;
  class AuthError extends Error { status = 401; }
  const httpModule = validationTestModule(
    "lib/validation/server/landing-http.ts",
    (specifier) => {
      if (specifier.endsWith("/auth"))
        return {
          AuthError,
          requireUser: async () => {
            throw new AuthError();
          },
        };
      if (specifier.endsWith("server-admin"))
        return {
          createSupabaseAdminClient() {
            client = true;
            throw new Error("must not create");
          },
        };
      if (specifier === "./http")
        return {
          body: async () => {
            read = true;
            return {};
          },
        };
      if (specifier === "./release-policy")
        return {
          validationAdmission: () => null,
          VALIDATION_PRIVATE_HEADERS: { "Cache-Control": "private, no-store" },
          ValidationReleaseDeniedError: class extends Error {},
        };
    },
  ) as {
    landingOwnerHandler: (...args: unknown[]) => Promise<Response>;
    landingPublicHandler: (...args: unknown[]) => Promise<Response>;
  };
  assert.equal(
    (
      await httpModule.landingOwnerHandler(
        new Request("http://localhost"),
        "version",
        "save",
      )
    ).status,
    401,
  );
  assert.equal(client, false);
  assert.equal(read, false);
  assert.equal(
    (
      await httpModule.landingPublicHandler(
        new Request("http://localhost", {
          method: "POST",
          headers: {
            origin: "https://other.test",
            "content-type": "application/json",
          },
        }),
        "token",
        "submit",
      )
    ).status,
    400,
  );
  assert.equal(client, false);
});

test("public HTTP signs a page-scoped cookie and rejects missing/tampered identities", async () => {
  const previous = process.env.VALIDATION_LANDING_COOKIE_SECRET;
  process.env.VALIDATION_LANDING_COOKIE_SECRET =
    "synthetic-secret-with-at-least-32-characters";
  const jar = new Map<string, string>();
  const seen: unknown[][] = [];
  const httpModule = validationTestModule(
    "lib/validation/server/landing-http.ts",
    (specifier) => {
      if (specifier === "next/headers")
        return {
          cookies: async () => ({
            get: (name: string) =>
              jar.has(name) ? { value: jar.get(name) } : undefined,
            set: (
              name: string,
              value: string,
              options: Record<string, unknown>,
            ) => {
              assert.equal(options.httpOnly, true);
              assert.equal(options.sameSite, "strict");
              assert.match(
                String(options.path),
                /^\/api\/public\/validation\/landing\//,
              );
              jar.set(name, value);
            },
          }),
        };
      if (specifier.endsWith("server-admin"))
        return { createSupabaseAdminClient: () => ({}) };
      if (specifier === "./landing-pages")
        return {
          landingHash: () => "a".repeat(64),
          LandingService: class {
            async public(...args: unknown[]) {
              seen.push(args);
              return { accepted: true };
            }
          },
        };
      if (specifier === "./release-policy")
        return {
          validationAdmission: () => null,
          VALIDATION_PRIVATE_HEADERS: { "Cache-Control": "private, no-store" },
          ValidationReleaseDeniedError: class extends Error {},
        };
    },
  ) as { landingPublicHandler: (...args: unknown[]) => Promise<Response> };
  const request = () =>
    new Request("http://localhost/api/public/validation/landing/token/view", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.1",
      },
      body: JSON.stringify({ requestId: "synthetic" }),
    });
  try {
    assert.equal(
      (await httpModule.landingPublicHandler(request(), "token", "submit"))
        .status,
      400,
    );
    assert.equal(
      (await httpModule.landingPublicHandler(request(), "token", "view"))
        .status,
      200,
    );
    assert.equal(jar.size, 1);
    const signed = [...jar.values()][0];
    assert.match(signed, /^[a-f0-9]{32}\.[a-f0-9]{64}$/);
    assert.equal(
      (await httpModule.landingPublicHandler(request(), "token", "submit"))
        .status,
      200,
    );
    assert.equal(seen[0][3], seen[1][3]);
    assert.equal(seen[1][4], "192.0.2.1");
    jar.set(
      [...jar.keys()][0],
      signed.slice(0, -1) + (signed.endsWith("0") ? "1" : "0"),
    );
    assert.equal(
      (await httpModule.landingPublicHandler(request(), "token", "submit"))
        .status,
      400,
    );
    assert.equal(seen.length, 2);
  } finally {
    if (previous === undefined)
      delete process.env.VALIDATION_LANDING_COOKIE_SECRET;
    else process.env.VALIDATION_LANDING_COOKIE_SECRET = previous;
  }
});

test("landing experiment shells require explicit contact consent mode before persistence", () => {
  let persisted = 0;
  const { ValidationService } = validationTestModule(
    "lib/validation/server/service.ts",
    (specifier) =>
      specifier === "./release-policy"
        ? { assertValidationOperation() {}, assertValidationFamily() {} }
        : undefined,
  ) as {
    ValidationService: new (repo: unknown) => {
      createExperiment: (...args: unknown[]) => unknown;
    };
  };
  const service = new ValidationService({
    createExperiment: () => {
      persisted++;
      return {};
    },
  });
  const input = {
    hypothesisVersionId: "hypothesis",
    family: "landing_waitlist",
    targetAudience: ["Founders"],
    collectionMethod: "Landing page",
    designSnapshot: {},
    screeningCriteria: [],
    consentPrivacyMode: "anonymous_notes",
  };
  assert.throws(
    () => service.createExperiment("owner", "subject", input),
    /explicit consent/,
  );
  assert.equal(persisted, 0);
  service.createExperiment("owner", "subject", {
    ...input,
    consentPrivacyMode: "identified_with_explicit_consent",
  });
  assert.equal(persisted, 1);
});
