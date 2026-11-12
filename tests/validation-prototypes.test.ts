import assert from "node:assert/strict";
import test from "node:test";
import { validationTestModule } from "./support/validation-module.ts";
const pure = validationTestModule(
  "lib/validation/prototypes.ts",
) as typeof import("../lib/validation/prototypes.ts");
const policy = validationTestModule(
  "lib/validation/server/release-policy.ts",
) as typeof import("../lib/validation/server/release-policy.ts");
test("all templates have bounded reachable navigation and fixed consent", () => {
  for (const template of ["workflow", "workspace", "booking"] as const) {
    const c = pure.prototypeTemplate(template);
    assert.deepEqual(pure.prototypeContent(c), c);
    assert.equal(c.screens.length, 3);
    assert.equal(c.consent, pure.PROTOTYPE_CONSENT);
  }
  const c = pure.prototypeTemplate("workflow");
  for (const patch of [
    { title: "" },
    { purpose: "x".repeat(1001) },
    { screens: [] },
    { screens: Array(7).fill(c.screens[0]) },
    { screens: [c.screens[0], c.screens[0]] },
    { screens: c.screens.map((s) => ({ ...s, layout: "html" })) },
    {
      screens: c.screens.map((s) => ({
        ...s,
        actions: [{ label: "Go", target: "missing" }],
      })),
    },
    {
      screens: c.screens.map((s) => ({
        ...s,
        actions: [{ label: "Go", target: s.id }],
      })),
    },
  ])
    assert.throws(() => pure.prototypeContent({ ...c, ...patch }));
  assert.equal(
    pure.prototypeContent({ ...c, consent: "override", html: "<script>" })
      .consent,
    pure.PROTOTYPE_CONSENT,
  );
  assert.equal(
    "html" in pure.prototypeContent({ ...c, html: "<script>" }),
    false,
  );
});
test("feedback requires actual explicit consent and bounded nonempty input", () => {
  const response = {
    outcome: "no",
    comment: "I could not find the next step.",
    consent: true,
    website: "",
  };
  assert.equal(pure.prototypeFeedback(response).outcome, "no");
  for (const patch of [
    { consent: false },
    { website: "bot" },
    { outcome: "success" },
    { comment: "" },
    { comment: "x".repeat(2001) },
  ])
    assert.throws(() => pure.prototypeFeedback({ ...response, ...patch }));
});
test("prototype exact capability matrix remains default off and shared denied", () => {
  for (const mode of [
    undefined,
    "DISABLED",
    "INTERVIEWS",
    "SURVEYS",
    "INTERVIEWS_AND_SURVEYS",
    "interviews",
  ])
    for (const privateFlag of [undefined, "ENABLED", "enabled", "DISABLED"])
      for (const publicFlag of [undefined, "ENABLED", "enabled"])
        for (const secret of [undefined, "short", "a".repeat(32)]) {
          const p = policy.getValidationReleasePolicy({
            privateMode: mode,
            privatePrototypes: privateFlag,
            publicPrototypes: publicFlag,
            prototypeCookieSecret: secret,
          });
          const authoring =
            ["INTERVIEWS", "SURVEYS", "INTERVIEWS_AND_SURVEYS"].includes(
              mode || "",
            ) && privateFlag === "ENABLED";
          assert.equal(p.privatePrototypes, authoring);
          assert.equal(
            p.publicPrototypeParticipation,
            authoring && publicFlag === "ENABLED" && secret?.length === 32,
          );
          for (const action of ["read", "save", "remove", "unpublish"])
            assert.equal(
              policy.validationOperationAllowed(
                `prototype.${action}`,
                action === "read" ? "GET" : "POST",
                p,
              ),
              authoring,
            );
          assert.equal(
            policy.validationOperationAllowed("prototype.publish", "POST", p),
            p.publicPrototypeParticipation,
          );
          assert.equal(
            policy.validationOperationAllowed("shared.promote", "POST", p),
            false,
          );
          assert.equal(p.privateAiDesign, false);
        }
});
const previous = { ...process.env };
test.after(() => {
  for (const key of [
    "VALIDATION_PRIVATE_MODE",
    "VALIDATION_PRIVATE_PROTOTYPES",
    "VALIDATION_PUBLIC_PROTOTYPES",
    "VALIDATION_PROTOTYPE_COOKIE_SECRET",
  ])
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
});
test("owner lookup precedes prototype RPC and refuses cross-owner/family and failures", async () => {
  process.env.VALIDATION_PRIVATE_MODE = "INTERVIEWS";
  process.env.VALIDATION_PRIVATE_PROTOTYPES = "ENABLED";
  const { PrototypeService } = validationTestModule(
    "lib/validation/server/prototypes.ts",
  ) as typeof import("../lib/validation/server/prototypes.ts");
  for (const result of [
    { data: null, error: null },
    { data: null, error: { code: "XX" } },
    { data: { family: "survey" }, error: null },
  ]) {
    let called = false;
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
    const service = new PrototypeService({
      from: () => chain,
      rpc: () => {
        called = true;
        return { data: {}, error: null };
      },
    } as never);
    await assert.rejects(service.owner("owner-a", "version-b", "read"));
    assert.equal(called, false);
    assert.deepEqual(filters, [
      ["id", "version-b"],
      ["owner_id", "owner-a"],
    ]);
  }
});
test("publication token is hashed; safe normalized content and public validation", async () => {
  process.env.VALIDATION_PRIVATE_MODE = "INTERVIEWS";
  process.env.VALIDATION_PRIVATE_PROTOTYPES = "ENABLED";
  process.env.VALIDATION_PUBLIC_PROTOTYPES = "ENABLED";
  process.env.VALIDATION_PROTOTYPE_COOKIE_SECRET = "a".repeat(32);
  const { PrototypeService, prototypeHash } = validationTestModule(
    "lib/validation/server/prototypes.ts",
  ) as typeof import("../lib/validation/server/prototypes.ts");
  let args: Record<string, unknown> = {};
  const chain = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return { data: { family: "interactive_prototype" }, error: null };
    },
  };
  const service = new PrototypeService({
    from: () => chain,
    rpc: async (_name: string, x: Record<string, unknown>) => {
      args = x;
      return { data: { accepted: true }, error: null };
    },
  } as never);
  const published = await service.owner("o", "v", "publish", { revision: 1 });
  const token = published.publicPath!.split("/").pop()!;
  assert.equal(token.length, 43);
  assert.equal(args.p_token_hash, prototypeHash(token));
  assert.equal(JSON.stringify(args).includes(token), false);
  await assert.rejects(service.public("bad", "resolve"));
  for (const payload of [
    { requestId: "bad", consent: true, website: "", screen: "s" },
    {
      requestId: "10000000-0000-4000-8000-000000000001",
      consent: false,
      website: "",
      screen: "s",
    },
  ])
    await assert.rejects(
      service.public(token, "event", payload, "browser", "network"),
    );
  await service.public(
    token,
    "event",
    {
      requestId: "10000000-0000-4000-8000-000000000001",
      consent: true,
      website: "",
      screen: "s",
    },
    "browser",
    "network",
  );
  assert.equal(args.p_visitor_hash, prototypeHash(`${token}:browser`));
  assert.equal(JSON.stringify(args).includes("network" + '"'), false);
});

test("prototype HTTP authenticates owners before reading bodies or creating clients, rejects cross-origin public posts", async () => {
  let client = false,
    read = false;
  class AuthError extends Error {}
  const httpModule = validationTestModule(
    "lib/validation/server/prototype-http.ts",
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
    prototypeOwnerHandler: (...args: unknown[]) => Promise<Response>;
    prototypePublicHandler: (...args: unknown[]) => Promise<Response>;
  };
  assert.equal(
    (
      await httpModule.prototypeOwnerHandler(
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
      await httpModule.prototypePublicHandler(
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
  const previous = process.env.VALIDATION_PROTOTYPE_COOKIE_SECRET;
  process.env.VALIDATION_PROTOTYPE_COOKIE_SECRET =
    "synthetic-secret-with-at-least-32-characters";
  const jar = new Map<string, string>();
  const seen: unknown[][] = [];
  const httpModule = validationTestModule(
    "lib/validation/server/prototype-http.ts",
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
                /^\/api\/public\/validation\/prototype\//,
              );
              jar.set(name, value);
            },
          }),
        };
      if (specifier.endsWith("server-admin"))
        return { createSupabaseAdminClient: () => ({}) };
      if (specifier === "./prototypes")
        return {
          prototypeHash: () => "a".repeat(64),
          PrototypeService: class {
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
  ) as { prototypePublicHandler: (...args: unknown[]) => Promise<Response> };
  const request = () =>
    new Request(
      "http://localhost/api/public/validation/prototype/token/event",
      {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.1",
        },
        body: JSON.stringify({ requestId: "synthetic" }),
      },
    );
  try {
    assert.equal(
      (await httpModule.prototypePublicHandler(request(), "token", "submit"))
        .status,
      400,
    );
    assert.equal(
      (await httpModule.prototypePublicHandler(request(), "token", "event"))
        .status,
      200,
    );
    assert.equal(jar.size, 1);
    const signed = [...jar.values()][0];
    assert.match(signed, /^[a-f0-9]{32}\.[a-f0-9]{64}$/);
    assert.equal(
      (await httpModule.prototypePublicHandler(request(), "token", "submit"))
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
      (await httpModule.prototypePublicHandler(request(), "token", "submit"))
        .status,
      400,
    );
    assert.equal(seen.length, 2);
  } finally {
    if (previous === undefined)
      delete process.env.VALIDATION_PROTOTYPE_COOKIE_SECRET;
    else process.env.VALIDATION_PROTOTYPE_COOKIE_SECRET = previous;
  }
});
