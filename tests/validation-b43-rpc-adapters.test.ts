import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { ValidationServerError } from "../lib/validation/server/contracts.ts";
import { classifyOwnedLookup } from "../lib/validation/server/owned-lookup.ts";

// Transpile this existing Next module for an offline test without changing its
// import/constructor conventions or loading a production admin client.
const compiled = ts.transpileModule(readFileSync("lib/validation/server/repository.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
runInNewContext(compiled, { module: loaded, exports: loaded.exports, require(name: string) {
  if (name === "server-only") return {};
  if (name === "./contracts") return { ValidationServerError };
  if (name === "./owned-lookup") return { classifyOwnedLookup };
  throw new Error(`Unexpected runtime dependency: ${name}`);
} });
const { ValidationRepository } = loaded.exports as typeof import("../lib/validation/server/repository.ts");
const owner = "11111111-1111-4111-8111-111111111111";
const subject = "22222222-2222-4222-8222-222222222222";

function fixture(result: unknown, code?: string, missing = false) {
  const requests: Array<{ url: URL; method: string; body: Record<string, unknown> | null }> = [];
  const db = createClient("https://offline.invalid", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      const rpc = url.pathname.includes("/rpc/");
      return new Response(JSON.stringify(rpc ? (code ? { code, message: "private upstream detail" } : result) : missing ? null : { id: subject }), {
        status: rpc && code ? 400 : 200, headers: { "Content-Type": "application/json" },
      });
    } },
  });
  return { repository: new ValidationRepository(db), requests };
}

const link = { source_type: "discover", source_row_id: subject, source_version: "v1", link_role: "supporting_context", context_snapshot: { label: "context" } };

test("link adapter retains owned prechecks and sends only individually typed fields", async () => {
  const result = { id: subject, subject_id: subject, ...link };
  const { repository, requests } = fixture(result);
  assert.deepEqual(await repository.addSubjectLink(owner, subject, { ...link, owner_id: "forged", id: "forged" }), result);
  assert.equal(requests.length, 3);
  for (const request of requests.slice(0, 2)) {
    assert.equal(request.method, "GET");
    assert.equal(request.url.searchParams.get(request.url.pathname.endsWith("validation_subjects") ? "owner_id" : "user_id"), `eq.${owner}`);
  }
  assert.equal(requests[2].url.pathname, "/rest/v1/rpc/validation_add_subject_link");
  assert.deepEqual(requests[2].body, { p_owner_id: owner, p_subject_id: subject, p_source_type: "discover", p_source_row_id: subject,
    p_source_version: "v1", p_link_role: "supporting_context", p_context_snapshot: link.context_snapshot });
});

test("duplicate links remain a generic 409, not successful existing-row reuse", async () => {
  const { repository } = fixture(null);
  await assert.rejects(repository.addSubjectLink(owner, subject, link), (e: unknown) =>
    e instanceof ValidationServerError && e.status === 409 && e.code === "constraint_conflict");
});

test("missing subject stops before RPC; SQL recheck not-found remains 404", async () => {
  const denied = fixture(null, undefined, true);
  await assert.rejects(denied.repository.addSubjectLink(owner, subject, link), (e: unknown) => e instanceof ValidationServerError && e.status === 404);
  assert.equal(denied.requests.length, 1);
  const raced = fixture(null, "P0002");
  await assert.rejects(raced.repository.addSubjectLink(owner, subject, link), (e: unknown) => e instanceof ValidationServerError && e.status === 404);
});

test("participant adapter preserves returns and excludes caller status, IDs and owner", async () => {
  const result = { id: subject, status: "active", experiment_id: null, identity_mode: "anonymous" };
  const { repository, requests } = fixture(result);
  assert.deepEqual(await repository.createParticipant(owner, { identity_mode: "anonymous", owner_id: "forged", status: "withdrawn", id: subject }), result);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, "/rest/v1/rpc/validation_create_participant");
  assert.deepEqual(requests[0].body, { p_owner_id: owner, p_experiment_id: null, p_identity_mode: "anonymous",
    p_pseudonymous_reference: null, p_independence_key: null, p_consent_mode: null, p_consent_purpose: null, p_consent_captured_at: null });
});

test("participant experiment ownership is checked before RPC", async () => {
  const { repository, requests } = fixture(null, undefined, true);
  await assert.rejects(repository.createParticipant(owner, { experiment_id: subject, identity_mode: "experiment_pseudonymous" }),
    (e: unknown) => e instanceof ValidationServerError && e.status === 404);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get("owner_id"), `eq.${owner}`);
});

test("participant constraint errors stay generic and expose no upstream detail", async () => {
  const { repository } = fixture(null, "23505");
  await assert.rejects(repository.createParticipant(owner, { identity_mode: "anonymous", independence_key: "same" }),
    (e: unknown) => e instanceof ValidationServerError && e.status === 409 && e.code === "constraint_conflict" && !e.message.includes("private"));
});
