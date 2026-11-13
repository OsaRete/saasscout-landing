import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { validationTestModule } from "./support/validation-module.ts";
import { isFounderWorkspacePath } from "../lib/auth/workspace-path.ts";

function harness(t: TestContext, admitted: unknown = false, failure = false) {
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
    const previous = process.env[name];
    process.env[name] = "synthetic";
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
  }
  const calls: string[] = [];
  let permission = admitted;
  const load = (path: string) => validationTestModule(path, (specifier) => {
    if (specifier === "@supabase/supabase-js") return {
      createClient: () => ({
        auth: { getUser: async (token: string) => {
          calls.push("auth");
          return token === "invalid" ? { error: true, data: {} } : {
            error: null, data: { user: { id: "owner-a", app_metadata: {},
              user_metadata: { beta_admitted: true, role: "service_role", plan: "paid" },
              identities: [{ provider: token === "oauth" ? "google" : "email" }] } },
          };
        } },
        rpc: async (name: string, args?: unknown) => {
          calls.push(name);
          assert.equal(name, "application_beta_access");
          assert.equal(args, undefined, "browser supplies no membership identity");
          return { data: permission, error: failure ? { code: "failure" } : null };
        },
        from: () => { throw new Error("Database/provider work before admission"); },
      }),
    };
    if (specifier === "openai") return class { constructor() { throw new Error("Provider constructed before admission"); } };
    return undefined;
  });
  const req = (token = "password") => new Request("http://local.test/api/protected", {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
    body: "body must not be read before denial",
  });
  return { calls, load, req, setMembership: (value: unknown) => { permission = value; } };
}

for (const provider of ["password", "oauth"]) {
  test(`${provider}: identity and forged metadata cannot self-authorize; explicit membership works`, async (t) => {
    const h = harness(t);
    const { requireUser } = h.load("app/api/_utils/auth.ts") as { requireUser(r: Request): Promise<{ id: string }> };
    await assert.rejects(requireUser(h.req(provider)), { status: 403 });
    h.setMembership(true);
    assert.equal((await requireUser(h.req(provider))).id, "owner-a");
    h.setMembership(false);
    await assert.rejects(requireUser(h.req(provider)), { status: 403 }, "same issued credential denied after revoke");
    assert.deepEqual(h.calls, ["auth", "application_beta_access", "auth", "application_beta_access", "auth", "application_beta_access"]);
  });
}

for (const value of [null, undefined, {}, [], "true", 1]) {
  test(`malformed admission ${JSON.stringify(value)} fails closed`, async (t) => {
    const h = harness(t, value);
    h.setMembership(value);
    const { requireUser } = h.load("app/api/_utils/auth.ts") as { requireUser(r: Request): Promise<unknown> };
    await assert.rejects(requireUser(h.req()), { status: 503 });
  });
}

test("unavailable membership fails closed; missing/invalid identity never asks for admission", async (t) => {
  const h = harness(t, true, true);
  const { requireUser } = h.load("app/api/_utils/auth.ts") as { requireUser(r: Request): Promise<unknown> };
  await assert.rejects(requireUser(h.req()), { status: 503 });
  h.calls.length = 0;
  await assert.rejects(requireUser(new Request("http://local.test")), { status: 401 });
  await assert.rejects(requireUser(h.req("invalid")), { status: 401 });
  assert.deepEqual(h.calls, ["auth"]);
});

for (const route of ["discover-opportunities", "collect-sources", "scan/acceptance", "scan/workflow", "weekly-intelligence", "saved-ideas"]) {
  test(`direct ${route} request stops at membership before body/provider/privileged work`, async (t) => {
    const h = harness(t);
    if (route === "scan/workflow") {
      const old = process.env.SCAN_SERVER_WORKFLOW_ENABLED;
      process.env.SCAN_SERVER_WORKFLOW_ENABLED = "true";
      t.after(() => { if (old === undefined) delete process.env.SCAN_SERVER_WORKFLOW_ENABLED; else process.env.SCAN_SERVER_WORKFLOW_ENABLED = old; });
    }
    t.mock.method(console, "error", () => {});
    t.mock.method(console, "info", () => {});
    const { POST } = h.load(`app/api/${route}/route.ts`) as { POST(r: Request): Promise<Response> };
    assert.equal((await POST(h.req())).status, 403);
    assert.deepEqual(h.calls, ["auth", "application_beta_access"]);
  });
}

test("scheduled membership uses the same persisted predicate and denies revoked users", async () => {
  const { requireBetaMember } = validationTestModule("lib/auth/beta-membership.ts") as {
    requireBetaMember(id: string, client: unknown): Promise<void>;
  };
  const calls: unknown[] = [];
  let admitted = true;
  const client = { rpc: async (name: string, args: unknown) => {
    calls.push([name, args]); return { data: admitted, error: null };
  } };
  await requireBetaMember("owner-a", client);
  admitted = false;
  await assert.rejects(requireBetaMember("owner-a", client), { status: 403 });
  assert.deepEqual(calls, Array(2).fill(["application_beta_member", { p_user_id: "owner-a" }]));
  assert.match(readFileSync("app/api/weekly-intelligence/route.ts", "utf8"), /await requireBetaMember\(userId\);\s+return runAuthoritativeWeeklyGenerationForUser/);
});

test("x-search retains its Production 404 and denies non-member development calls", async (t) => {
  const h = harness(t);
  const previous = process.env.NODE_ENV;
  t.after(() => { if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: previous }); });
  const { GET } = h.load("app/api/x-search/route.ts") as { GET(r: Request): Promise<Response> };
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.equal((await GET(h.req())).status, 404);
  assert.deepEqual(h.calls, []);
  Object.assign(process.env, { NODE_ENV: "development" });
  assert.equal((await GET(h.req())).status, 403);
  assert.deepEqual(h.calls, ["auth", "application_beta_access"]);
});

test("account recovery/public participants are outside founder navigation admission", () => {
  for (const path of ["/login", "/reset-password", "/update-password", "/auth/callback", "/", "/validation/survey/token", "/validation/landing/token", "/validation/prototype/token", "/validation/external-mvp/token", "/validation/commercial-intent/token"]) {
    assert.equal(isFounderWorkspacePath(path), false, path);
  }
  for (const path of ["/dashboard", "/scan", "/discover", "/validation", "/validation/new", "/validation/study-a", "/founder-profile"]) assert.equal(isFounderWorkspacePath(path), true, path);
});

test("public survey release policy does not acquire founder identity or membership", async (t) => {
  const previous = { ...process.env };
  process.env.VALIDATION_PRIVATE_MODE = "SURVEYS";
  process.env.VALIDATION_PUBLIC_SURVEYS = "ENABLED";
  t.after(() => { for (const key of ["VALIDATION_PRIVATE_MODE", "VALIDATION_PUBLIC_SURVEYS"]) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  let operations = 0;
  const { publicSurveyHandler } = validationTestModule("lib/validation/server/public-survey-http.ts", (specifier) => {
    if (/server-admin$/.test(specifier)) return { createSupabaseAdminClient: () => ({}) };
    if (/surveys$/.test(specifier)) return { SurveyService: class {} };
    if (/auth$/.test(specifier)) throw new Error("Public participant requested founder auth");
    return undefined;
  }) as { publicSurveyHandler(r: Request, action: string, callback: () => Promise<unknown>): Promise<Response> };
  const response = await publicSurveyHandler(new Request("http://local.test/public/token"), "survey.resolve", async () => { operations += 1; return { published: true }; });
  assert.equal(response.status, 200);
  assert.equal(operations, 1);
});
