import assert from "node:assert/strict";
import test from "node:test";
import { validationTestModule } from "./support/validation-module.ts";
const pure = validationTestModule(
  "lib/validation/commercial-intent.ts",
) as typeof import("../lib/validation/commercial-intent.ts");
const policy = validationTestModule(
  "lib/validation/server/release-policy.ts",
) as typeof import("../lib/validation/server/release-policy.ts");
test("bounded authored plan projects only participant fields and feedback requires separate contact consent", () => {
  const c = pure.commercialIntentTemplate();
  assert.equal(
    pure.commercialIntentContent({ ...c, consent: "fake", owner_id: "claim" })
      .consent,
    pure.COMMERCIAL_INTENT_CONSENT,
  );
  for (const patch of [
    { questions: [] },
    { questions: Array(6).fill("q") },
    { questions: [" Same ", "same"] },
    { instructions: "" },
    { objective: "purchase" },
  ])
    assert.throws(() => pure.commercialIntentContent({ ...c, ...patch }));
  const f = {
    outcome: "not_now",
    answers: ["Could not access it"],
    consent: true,
    website: "",
  };
  assert.equal(pure.commercialIntentFeedback(f).email, null);
  for (const patch of [
    { consent: false },
    { website: "bot" },
    { answers: [] },
    { answers: ["a".repeat(2001)] },
    { email: "person@example.com" },
    { outcome: "verified" },
    { answers: [{ ai: "generated" }] },
  ])
    assert.throws(() => pure.commercialIntentFeedback({ ...f, ...patch }));
  assert.equal(
    pure.commercialIntentFeedback({
      ...f,
      email: "PERSON@example.com",
      contactConsent: true,
    }).email,
    "person@example.com",
  );
});
test("exact private/public admission matrix preserves default-off and all shared denials", () => {
  for (const privateMode of [
    undefined,
    "DISABLED",
    "INTERVIEWS",
    "SURVEYS",
    "INTERVIEWS_AND_SURVEYS",
    "interviews",
    " INTERVIEWS",
  ])
    for (const privateCommercialIntent of [
      undefined,
      "ENABLED",
      "enabled",
      "DISABLED",
    ])
      for (const publicCommercialIntent of [undefined, "ENABLED", "enabled"]) {
        const p = policy.getValidationReleasePolicy({
          privateMode,
          privateCommercialIntent,
          publicCommercialIntent,
        });
        const admitted =
          ["INTERVIEWS", "SURVEYS", "INTERVIEWS_AND_SURVEYS"].includes(
            privateMode || "",
          ) && privateCommercialIntent === "ENABLED";
        assert.equal(p.privateCommercialIntent, admitted);
        assert.equal(
          p.publicCommercialIntentParticipation,
          admitted && publicCommercialIntent === "ENABLED",
        );
        for (const action of ["read", "save", "remove", "unpublish"])
          assert.equal(
            policy.validationOperationAllowed(
              `commercial-intent.${action}`,
              action === "read" ? "GET" : "POST",
              p,
            ),
            admitted,
          );
        for (const op of [
          "shared.prepare",
          "shared.promote",
          "shared.consume",
          "ai.analyze",
          "observation.generic",
        ])
          assert.equal(policy.validationOperationAllowed(op, "POST", p), false);
      }
});
test("owner predicate/family checks precede RPC; hash-only token publication and narrow public payload", async () => {
  process.env.VALIDATION_PRIVATE_MODE = "INTERVIEWS";
  process.env.VALIDATION_PRIVATE_COMMERCIAL_INTENT = "ENABLED";
  process.env.VALIDATION_PUBLIC_COMMERCIAL_INTENT = "ENABLED";
  const { CommercialIntentService, commercialIntentHash } =
    validationTestModule(
      "lib/validation/server/commercial-intent.ts",
    ) as typeof import("../lib/validation/server/commercial-intent.ts");
  let result: unknown = { data: null, error: null },
    called = 0,
    args: Record<string, unknown> = {};
  const filters: unknown[] = [];
  const chain = {
    select() {
      return this;
    },
    eq(...x: unknown[]) {
      filters.push(x);
      return this;
    },
    async maybeSingle() {
      return result;
    },
  };
  const service = new CommercialIntentService({
    from: () => chain,
    rpc: async (_n: string, x: Record<string, unknown>) => {
      called++;
      args = x;
      return { data: { accepted: true }, error: null };
    },
  } as never);
  await assert.rejects(service.owner("owner-a", "version-b", "read"));
  assert.equal(called, 0);
  assert.deepEqual(filters, [
    ["id", "version-b"],
    ["owner_id", "owner-a"],
  ]);
  result = { data: { family: "survey" }, error: null };
  await assert.rejects(service.owner("o", "v", "read"));
  assert.equal(called, 0);
  result = { data: { family: "commercial_intent" }, error: null };
  const x = await service.owner("o", "v", "publish", { revision: 1 });
  const token = x.publicPath!.split("/").pop()!;
  assert.equal(token.length, 43);
  assert.equal(args.p_token_hash, commercialIntentHash(token));
  assert.ok(!JSON.stringify(args).includes(token));
  await assert.rejects(service.public("bad", "resolve", undefined, "network"));
  const f = {
    requestId: "10000000-0000-4000-8000-000000000001",
    consent: true,
    website: "",
    outcome: "not_now",
    answers: ["Blocked"],
  };
  for (const patch of [
    { owner_id: "forged" },
    { requestId: "bad" },
    { consent: false },
    { website: "spam" },
  ])
    await assert.rejects(
      service.public(token, "submit", { ...f, ...patch }, "network"),
    );
  await service.public(token, "submit", f, "network");
  assert.equal(args.p_network_hash, commercialIntentHash(`${token}:network`));
  assert.equal(args.p_request_id, f.requestId);
  assert.ok(!JSON.stringify(args).includes('"network"'));
  delete process.env.VALIDATION_PRIVATE_COMMERCIAL_INTENT;
  delete process.env.VALIDATION_PUBLIC_COMMERCIAL_INTENT;
  delete process.env.VALIDATION_PRIVATE_MODE;
});
test("HTTP verifies auth before client/body and rejects foreign-origin public POST", async () => {
  let client = false,
    read = false;
  class AuthError extends Error {}
  const h = validationTestModule(
    "lib/validation/server/commercial-intent-http.ts",
    (s) => {
      if (s.endsWith("/auth"))
        return {
          AuthError,
          requireUser: async () => {
            throw new AuthError();
          },
        };
      if (s.endsWith("server-admin"))
        return {
          createSupabaseAdminClient() {
            client = true;
            throw new Error("forbidden");
          },
        };
      if (s === "./http")
        return {
          body: async () => {
            read = true;
            return {};
          },
        };
      if (s === "./release-policy")
        return {
          validationAdmission: () => null,
          VALIDATION_PRIVATE_HEADERS: { "Cache-Control": "private, no-store" },
          ValidationReleaseDeniedError: class extends Error {},
        };
    },
  ) as {
    commercialIntentOwnerHandler: (...a: unknown[]) => Promise<Response>;
    commercialIntentPublicHandler: (...a: unknown[]) => Promise<Response>;
  };
  assert.equal(
    (
      await h.commercialIntentOwnerHandler(
        new Request("https://example.com"),
        "v",
        "save",
      )
    ).status,
    401,
  );
  assert.equal(client, false);
  assert.equal(read, false);
  assert.equal(
    (
      await h.commercialIntentPublicHandler(
        new Request("https://example.com", {
          method: "POST",
          headers: {
            origin: "https://evil.example",
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

test("commercial intent shells require explicit contact consent mode before persistence", () => {
  let writes = 0;
  const { ValidationService } = validationTestModule(
    "lib/validation/server/service.ts",
    (s) =>
      s === "./release-policy"
        ? { assertValidationOperation() {}, assertValidationFamily() {} }
        : undefined,
  ) as {
    ValidationService: new (repo: unknown) => {
      createExperiment: (...a: unknown[]) => unknown;
    };
  };
  const service = new ValidationService({
    createExperiment: () => {
      writes++;
      return {};
    },
  });
  const input = {
    hypothesisVersionId: "h",
    family: "commercial_intent",
    targetAudience: ["operators"],
    collectionMethod: "Commercial intent",
    designSnapshot: {},
    screeningCriteria: [],
    consentPrivacyMode: "anonymous_notes",
  };
  assert.throws(
    () => service.createExperiment("o", "s", input),
    /explicit consent/,
  );
  assert.equal(writes, 0);
  service.createExperiment("o", "s", {
    ...input,
    consentPrivacyMode: "identified_with_explicit_consent",
  });
  assert.equal(writes, 1);
});

test("five distinct objectives stay nonbinding; purchases, revenue and invented objective keys are rejected", () => {
  for (const objective of Object.keys(pure.COMMERCIAL_OBJECTIVES)) {
    const c = pure.commercialIntentContent({
      ...pure.commercialIntentTemplate(),
      objective,
    });
    assert.equal(c.objective, objective);
    assert.match(c.consent, /nonbinding/);
    assert.match(c.consent, /no purchase, payment/);
  }
  for (const objective of [
    "purchase",
    "revenue",
    "verified_demand",
    "toString",
    "__proto__",
    null,
    true,
  ])
    assert.throws(() =>
      pure.commercialIntentContent({
        ...pure.commercialIntentTemplate(),
        objective,
      }),
    );
  for (const outcome of ["purchased", "paid", "verified", true, null])
    assert.throws(() =>
      pure.commercialIntentFeedback({
        outcome,
        answers: ["text"],
        consent: true,
        website: "",
      }),
    );
});

test("public operations require both exact gates and private mode; cleanup remains private when ingress closes", () => {
  const p = policy.getValidationReleasePolicy({
    privateMode: "SURVEYS",
    privateCommercialIntent: "ENABLED",
    publicCommercialIntent: "ENABLED",
  });
  assert.ok(policy.admittedValidationFamilies(p).includes("commercial_intent"));
  for (const [op, method] of [
    ["publish", "POST"],
    ["resolve", "GET"],
    ["view", "POST"],
    ["submit", "POST"],
  ]) {
    assert.equal(
      policy.validationOperationAllowed(`commercial-intent.${op}`, method, p),
      true,
    );
    assert.equal(
      policy.validationOperationAllowed(`commercial-intent.${op}`, "DELETE", p),
      false,
    );
    const closed = policy.getValidationReleasePolicy({
      privateMode: "SURVEYS",
      privateCommercialIntent: "ENABLED",
    });
    assert.equal(
      policy.validationOperationAllowed(
        `commercial-intent.${op}`,
        method,
        closed,
      ),
      false,
    );
    assert.equal(
      policy.validationOperationAllowed(
        "commercial-intent.unpublish",
        "POST",
        closed,
      ),
      true,
    );
    assert.equal(
      policy.validationOperationAllowed(
        "commercial-intent.remove",
        "POST",
        closed,
      ),
      true,
    );
  }
});
