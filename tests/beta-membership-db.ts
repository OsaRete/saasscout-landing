/** Opt-in, fixed local Auth/PostgREST acceptance. Never connects to remote URLs.
 * Run upgrade on a freshly started baseline-only beta-membership-disposable
 * stack, then fresh after an explicitly authorized local reset with the new
 * migration included. No reset, container creation or Production mutation here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { validationTestModule } from "./support/validation-module.ts";

const phase = process.argv[2];
assert.ok(phase === "upgrade" || phase === "fresh", "Explicit upgrade/fresh phase required");
assert.equal(process.env.BETA_MEMBERSHIP_DISPOSABLE, "1", "Disposable opt-in required");
const workdir = process.env.BETA_MEMBERSHIP_LOCAL_WORKDIR;
assert.ok(workdir && resolve(workdir) !== process.cwd(), "Separate disposable workdir required");
const container = "supabase_db_beta-membership-disposable";
function command(binary: string, args: string[], input?: string): string {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 60_000, maxBuffer: 4_000_000 });
  // Do not echo stdout/stderr: status contains local keys, SQL may contain fixture PII.
  assert.equal(result.status, 0, `Local ${binary} command failed; inspect private task logs`);
  return result.stdout.trim();
}
function sql(statement: string): string {
  return command("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", container,
    "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"], statement);
}
assert.equal(sql("select count(*) from auth.users;"), "0", "Only an empty fresh disposable database is allowed");
const status = JSON.parse(readFileSync(resolve(workdir, "connection.json"), "utf8")) as Record<string, string>;
assert.equal(status.phase, phase);
const owned = JSON.parse(command("docker", ["--host=unix:///var/run/docker.sock", "inspect", container]));
assert.equal(owned[0].Config.Labels["saasscout.beta-membership-disposable"], status.fixture_id);
assert.equal(status.API_URL, "http://127.0.0.1:56321");
const url = status.API_URL;
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
const client = () => createClient(url, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Disposable-${randomUUID()}!`;
const users: { id: string; email: string; client: SupabaseClient; token: string }[] = [];
for (let i = 0; i < 3; i += 1) {
  const email = `beta-${phase}-${i}@example.test`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null);
  assert.ok(created.data.user);
  const browser = client();
  const login = await browser.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null);
  assert.ok(login.data.session);
  users.push({ id: created.data.user.id, email, client: browser, token: login.data.session.access_token });
}
const [a, b, outsider] = users;
assert.equal((await admin.from("application_user_access").insert({
  user_id: a.id, access_role: "internal_tester", is_active: true, unlimited_scans: true,
})).error, null);
if (phase === "upgrade") {
  assert.equal(sql("select to_regprocedure('public.application_beta_access()') is null;"), "t");
  sql(readFileSync("supabase/migrations/20261116000000_beta_membership_access.sql", "utf8"));
  // PostgREST schema cache reload is asynchronous; retry only this local cache lookup.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await a.client.rpc("application_beta_access")).error) break;
    await new Promise((done) => setTimeout(done, 250));
  }
}
const existingAccess = await admin.from("application_user_access").select("*").eq("user_id", a.id).single();
assert.equal(existingAccess.error, null);
assert.equal(existingAccess.data.beta_admitted, false, "Existing internal privilege does not imply membership");
assert.equal(existingAccess.data.unlimited_scans, true);
for (const u of users) {
  assert.equal((await u.client.auth.getUser()).data.user?.id, u.id, "Real Auth token remains valid");
  assert.deepEqual(await u.client.rpc("application_beta_access").then(({ data, error }) => ({ data, error })), { data: false, error: null });
  const profiles = await u.client.from("user_profiles").select("*");
  assert.equal(profiles.error, null);
  assert.deepEqual(profiles.data, [], "Direct profile RLS denies non-members");
  assert.ok((await u.client.from("founder_profiles").insert({ user_id: u.id })).error, "Direct owner insert denied");
}
function owner(action: "admit" | "revoke", id: string, expires = "") {
  command("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", container,
    "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", `beta_user_id=${id}`,
    "-v", `beta_action=${action}`, "-v", `beta_expires_at=${expires}`],
  readFileSync("scripts/beta-membership-owner.sql", "utf8"));
}
owner("admit", a.id);
owner("admit", b.id);
assert.equal((await a.client.rpc("application_beta_access")).data, true);
assert.equal((await b.client.rpc("application_beta_access")).data, true);
const retained = await admin.from("application_user_access").select("access_role,is_active,unlimited_scans,expires_at").eq("user_id", a.id).single();
assert.deepEqual(retained.data, { access_role: "internal_tester", is_active: true, unlimited_scans: true, expires_at: null });
const ordinary = await admin.from("application_user_access").select("access_role,unlimited_scans").eq("user_id", b.id).single();
assert.deepEqual(ordinary.data, { access_role: "beta_member", unlimited_scans: false });

const signup = client();
const registered = await signup.auth.signUp({ email: `new-${phase}@example.test`, password,
  options: { data: { beta_admitted: true, role: "internal_tester", scan_limit: 999 } } });
assert.equal(registered.error, null, "Real public signup remains usable");
assert.ok(registered.data.user && registered.data.session);
assert.equal((await signup.rpc("application_beta_access")).data, false, "New signup cannot self-admit");
assert.deepEqual((await admin.from("application_user_access").select("user_id").eq("user_id", registered.data.user.id)).data, []);

// Actual browser forgery attempts: editable metadata cannot become authority.
assert.equal((await outsider.client.auth.updateUser({ data: { beta_admitted: true, access_role: "internal_tester", plan: "paid" } })).error, null);
assert.equal((await outsider.client.rpc("application_beta_access")).data, false);
for (const browser of [a.client, outsider.client]) {
  assert.ok((await browser.from("application_user_access").select("*")).error);
  assert.ok((await browser.from("application_user_access").upsert({ user_id: outsider.id, access_role: "beta_member", beta_admitted: true })).error);
  assert.ok((await browser.from("user_profiles").update({ scan_limit: 999, plan: "paid" }).eq("user_id", outsider.id)).error);
  assert.ok((await browser.rpc("application_beta_member", { p_user_id: a.id })).error);
  assert.ok((await browser.rpc("application_beta_access", { p_user_id: a.id })).error);
  assert.ok((await browser.rpc("accept_scan_request_v2", {
    p_user_id: a.id, p_request_fingerprint: "a".repeat(64), p_market: "x", p_audience: "x", p_region: "x", p_evidence: "x",
  })).error);
}
for (const u of users) {
  assert.equal((await admin.from("scan").insert({ user_id: u.id, market: `private-${u.id}` })).error, null);
  assert.equal((await admin.from("validation_subjects").insert({ owner_id: u.id, creation_origin: "user_entered", label: `private-${u.id}` })).error, null);
}
for (const u of [a, b]) {
  for (const [table, ownerColumn] of [["scan", "user_id"], ["validation_subjects", "owner_id"]]) {
    const own = await u.client.from(table).select("*");
    assert.equal(own.error, null);
    assert.equal(own.data?.length, 1);
    assert.equal(own.data[0][ownerColumn], u.id);
    assert.deepEqual((await u.client.from(table).select("*").eq(ownerColumn, outsider.id)).data, []);
  }
  assert.equal((await u.client.from("founder_profiles").insert({ user_id: u.id, technical_skills: "private" })).error, null);
}
assert.deepEqual((await a.client.from("founder_profiles").update({ technical_skills: "cross-owner" }).eq("user_id", b.id).select()).data, []);
assert.deepEqual((await outsider.client.from("scan").select("*")).data, []);
assert.deepEqual((await outsider.client.from("validation_subjects").select("*")).data, []);

// Existing durable Scan admission is exercised without executing the workflow.
const scanArgs = { p_user_id: b.id, p_request_fingerprint: "1".repeat(64),
  p_market: "fixture", p_audience: "fixture", p_region: "fixture", p_evidence: "fixture" };
const accepted = await admin.rpc("accept_scan_request_v2", scanArgs);
assert.equal(accepted.error, null);
assert.equal(accepted.data[0].accepted, true);
const duplicate = await admin.rpc("accept_scan_request_v2", scanArgs);
assert.equal(duplicate.data[0].scan_id, accepted.data[0].scan_id);
const claims = await Promise.all(Array.from({ length: 2 }, () => admin.rpc("claim_scan_execution_v1", {
  p_user_id: b.id, p_scan_id: accepted.data[0].scan_id, p_request_fingerprint: scanArgs.p_request_fingerprint,
})));
assert.equal(claims.filter((claim) => claim.data?.[0].claimed === true).length, 1);
for (const digit of ["2", "3"]) assert.equal((await admin.rpc("accept_scan_request_v2", { ...scanArgs, p_request_fingerprint: digit.repeat(64) })).data[0].accepted, true);
assert.equal((await admin.rpc("accept_scan_request_v2", { ...scanArgs, p_request_fingerprint: "4".repeat(64) })).data[0].rejection_code, "scan_limit_exceeded");
const profile = await admin.from("user_profiles").select("scan_limit,scans_used,plan").eq("user_id", b.id).single();
assert.deepEqual(profile.data, { scan_limit: 3, scans_used: 3, plan: "free" });

// Real API code, real Auth/PostgREST, no paid provider. Existing capability route
// proves both authorization and preserved tester/ordinary projections.
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
const { GET } = validationTestModule("app/api/user/capabilities/route.ts") as { GET(r: Request): Promise<Response> };
const request = (token: string) => new Request("http://127.0.0.1/api/user/capabilities", { headers: { Authorization: `Bearer ${token}` } });
assert.equal((await GET(request(a.token))).status, 200);
const ordinaryResponse = await GET(request(b.token));
assert.equal(ordinaryResponse.status, 200);
assert.equal((await ordinaryResponse.json()).capabilities.unlimitedScans, false);
assert.equal((await GET(request(outsider.token))).status, 403);
owner("revoke", a.id);
assert.equal((await a.client.auth.getUser(a.token)).data.user?.id, a.id, "Revocation does not break recovery/Auth");
assert.equal((await GET(request(a.token))).status, 403, "Same previously issued bearer loses API access");
assert.equal((await a.client.rpc("application_beta_access")).data, false);
for (const table of ["user_profiles", "scan", "validation_subjects", "founder_profiles"]) {
  assert.deepEqual((await a.client.from(table).select("*")).data, [], `${table}: same session loses direct reads`);
}
assert.ok((await a.client.from("founder_profiles").upsert({ user_id: a.id, technical_skills: "forged" }, { onConflict: "user_id" })).error);
assert.equal((await b.client.rpc("application_beta_access")).data, true, "Other admitted user remains authorized");
assert.equal((await a.client.auth.updateUser({ password: `Recovery-${password}` })).error, null, "Password update remains independent of membership");
const recovered = await a.client.auth.signInWithPassword({ email: a.email, password: `Recovery-${password}` });
assert.equal(recovered.error, null);
assert.equal((await GET(request(recovered.data.session!.access_token))).status, 403, "New login cannot undo revocation");
assert.equal((await admin.from("application_user_access").update({ beta_expires_at: "2000-01-01T00:00:00Z" }).eq("user_id", b.id)).error, null);
assert.equal((await GET(request(b.token))).status, 403, "Independent membership expiry takes effect");

// Inventory backstop: no browser-readable/writable protected base table lacks
// the restrictive policy. New service-only participant tables need no grant.
assert.equal(sql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname<>'beta-signups'
and (has_table_privilege('authenticated',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'INSERT') or has_table_privilege('authenticated',c.oid,'UPDATE') or has_table_privilege('authenticated',c.oid,'DELETE'))
and not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='beta_membership_required' and not p.polpermissive);`), "0");
assert.equal((await client().rpc("application_beta_access")).error?.code, "42501");
assert.equal((await client().from("beta-signups").insert({ name: "fixture", email: "fixture@example.test", role: "founder", niche: "fixture" })).error, null, "Public acquisition remains separate");
console.log(`${phase}: real Auth/PostgREST admission, forgery, direct RLS, cross-owner, revocation, expiry and grant inventory passed; no paid providers called.`);
