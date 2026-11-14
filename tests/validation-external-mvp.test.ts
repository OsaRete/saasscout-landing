import assert from "node:assert/strict";
import test from "node:test";
import { validationTestModule } from "./support/validation-module.ts";
const pure = validationTestModule(
  "lib/validation/external-mvp.ts",
) as typeof import("../lib/validation/external-mvp.ts");
const policy = validationTestModule(
  "lib/validation/server/release-policy.ts",
) as typeof import("../lib/validation/server/release-policy.ts");
test("external URL is navigation-only public HTTPS; rejects parser and local address tricks", () => {
  for (const url of [
    "https://example.com",
    "https://app.example.com/try?q=one",
  ])
    assert.ok(pure.externalMvpUrl(url).startsWith("https://"));
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "//example.com",
    "http://example.com",
    "https://a:b@example.com",
    "https://example.com:444",
    "https://127.0.0.1",
    "https://2130706433",
    "https://0x7f000001",
    "https://[::1]",
    "https://[::ffff:127.0.0.1]",
    "https://localhost",
    "https://app.local",
    "https://app.internal",
    "https://metadata.google.internal",
    "https://example.com/#token",
    "https://example.com\\@localhost",
    "https://example.com\n/path",
    "https://example.com.",
    "https://10.0.0.1.nip.io:444",
  ])
    assert.throws(() => pure.externalMvpUrl(url), url);
});
test("bounded authored plan projects only participant fields and feedback requires separate contact consent", () => {
  const c = { ...pure.externalMvpTemplate(), url: "https://example.com" };
  assert.equal(
    pure.externalMvpContent({ ...c, consent: "fake", owner_id: "claim" })
      .consent,
    pure.EXTERNAL_MVP_CONSENT,
  );
  for (const patch of [
    { questions: [] },
    { questions: Array(6).fill("q") },
    { questions: [" Same ", "same"] },
    { instructions: "" },
    { url: "http://example.com" },
  ])
    assert.throws(() => pure.externalMvpContent({ ...c, ...patch }));
  const f = {
    outcome: "not_tried",
    answers: ["Could not access it"],
    consent: true,
    website: "",
  };
  assert.equal(pure.externalMvpFeedback(f).email, null);
  for (const patch of [
    { consent: false },
    { website: "bot" },
    { answers: [] },
    { answers: ["a".repeat(2001)] },
    { email: "person@example.com" },
    { outcome: "verified" },
    { answers: [{ ai: "generated" }] },
  ])
    assert.throws(() => pure.externalMvpFeedback({ ...f, ...patch }));
  assert.equal(
    pure.externalMvpFeedback({
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
    for (const privateExternalMvp of [
      undefined,
      "ENABLED",
      "enabled",
      "DISABLED",
    ])
      for (const publicExternalMvp of [undefined, "ENABLED", "enabled"]) {
        const p = policy.getValidationReleasePolicy({
          privateMode,
          privateExternalMvp,
          publicExternalMvp,
        });
        const admitted =
          ["INTERVIEWS", "SURVEYS", "INTERVIEWS_AND_SURVEYS"].includes(
            privateMode || "",
          ) && privateExternalMvp === "ENABLED";
        assert.equal(p.privateExternalMvp, admitted);
        assert.equal(
          p.publicExternalMvpParticipation,
          admitted && publicExternalMvp === "ENABLED",
        );
        for (const action of ["read", "save", "remove", "unpublish"])
          assert.equal(
            policy.validationOperationAllowed(
              `external-mvp.${action}`,
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
  process.env.VALIDATION_PRIVATE_EXTERNAL_MVP = "ENABLED";
  process.env.VALIDATION_PUBLIC_EXTERNAL_MVP = "ENABLED";
  const { ExternalMvpService, externalMvpHash } = validationTestModule(
    "lib/validation/server/external-mvp.ts",
  ) as typeof import("../lib/validation/server/external-mvp.ts");
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
  const service = new ExternalMvpService({
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
  result = { data: { family: "external_mvp" }, error: null };
  const x = await service.owner("o", "v", "publish", { revision: 1 });
  const token = x.publicPath!.split("/").pop()!;
  assert.equal(token.length, 43);
  assert.equal(args.p_token_hash, externalMvpHash(token));
  assert.ok(!JSON.stringify(args).includes(token));
  await assert.rejects(service.public("bad", "resolve", undefined, "network"));
  const f = {
    requestId: "10000000-0000-4000-8000-000000000001",
    consent: true,
    website: "",
    outcome: "no",
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
  assert.equal(args.p_network_hash, externalMvpHash(`${token}:network`));
  assert.equal(args.p_request_id, f.requestId);
  assert.ok(!JSON.stringify(args).includes('"network"'));
  delete process.env.VALIDATION_PRIVATE_EXTERNAL_MVP;
  delete process.env.VALIDATION_PUBLIC_EXTERNAL_MVP;
  delete process.env.VALIDATION_PRIVATE_MODE;
});
test("HTTP verifies auth before client/body and rejects foreign-origin public POST", async () => {
  let client = false,
    read = false;
  class AuthError extends Error { status = 401; }
  const h = validationTestModule(
    "lib/validation/server/external-mvp-http.ts",
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
    externalMvpOwnerHandler: (...a: unknown[]) => Promise<Response>;
    externalMvpPublicHandler: (...a: unknown[]) => Promise<Response>;
  };
  assert.equal(
    (
      await h.externalMvpOwnerHandler(
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
      await h.externalMvpPublicHandler(
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

test("external MVP shells require explicit contact consent mode before persistence", () => {
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
    family: "external_mvp",
    targetAudience: ["operators"],
    collectionMethod: "External MVP",
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
