// Run against a separate Supabase local workdir whose project_id starts with
// beta01-privacy-. Upgrade starts at 20261126000000, fresh starts with all migrations.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const [phase, workdir] = process.argv.slice(2);
assert.ok(workdir && ["upgrade", "fresh"].includes(phase), "Use <upgrade|fresh> <disposable workdir>");
const root = fileURLToPath(new URL("..", import.meta.url));
const fixtureRoot = realpathSync(workdir);
assert.notEqual(fixtureRoot, realpathSync(root), "Refusing to use the application workdir");
const config = readFileSync(join(fixtureRoot, "supabase/config.toml"), "utf8");
const project = /^project_id\s*=\s*"(beta01-privacy-[a-z0-9-]+)"$/m.exec(config)?.[1];
assert.ok(project, "Dedicated BETA-01 privacy fixture project required");
const container = `supabase_db_${project}`;
const docker = (args, options = {}) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options,
});
const labels = JSON.parse(docker(["inspect", "--format", "{{json .Config.Labels}}", container]));
assert.equal(labels["com.supabase.cli.project"], project);
assert.equal(realpathSync(labels["com.supabase.cli.workdir"]), fixtureRoot);
const cliEnv = { ...process.env };
delete cliEnv.SUPABASE_STACK;
const supabase = (...args) => execFileSync("supabase", ["--workdir", fixtureRoot, ...args], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: cliEnv,
});
const status = JSON.parse(supabase("status", "--output-format", "json"));
const api = new URL(status.API_URL);
const db = new URL(status.DB_URL);
assert.equal(api.protocol, "http:");
assert.equal(api.hostname, "127.0.0.1");
assert.notEqual(api.port, "54321", "Refusing the ordinary application API port");
assert.equal(db.hostname, "127.0.0.1");
assert.notEqual(db.port, "54322", "Refusing the ordinary application database port");
assert.equal(status.linked_project, null, "Fixture must be unlinked");
const sql = (input) => docker(["exec", "-i", container, "psql", "-XqAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input }).trim();
const migrations = join(root, "supabase/migrations");
const migration = readdirSync(migrations).find((name) => name.endsWith("_beta01_shared_intelligence_quarantine.sql"));
assert.ok(migration, "BETA-01 migration missing");
const migrationVersion = migration.split("_")[0];
const version = () => sql("select max(version) from supabase_migrations.schema_migrations;");
assert.equal(version(), phase === "upgrade" ? "20261126000000" : migrationVersion);
if (phase === "fresh") {
  assert.equal(sql("select open_free_beta from public.application_beta_release where singleton;"), "f");
}

const client = (key) => createClient(api.origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
const service = client(status.SERVICE_ROLE_KEY);
const anon = client(status.ANON_KEY);
async function founder() {
  const email = `beta01-${randomUUID()}@saasscout.test`;
  const password = `${randomUUID()}-BETA01!`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  const browser = client(status.ANON_KEY);
  const { data: login, error: signInError } = await browser.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert.equal(login.user.id, data.user.id);
  return { id: data.user.id, browser, token: login.session.access_token };
}
const founderA = await founder();
const founderB = await founder();
const marker = `private-founder-a-${randomUUID()}`;
const [discovery, problem, weekly, weeklyProblem, global, ownerless, legacyReport, legacyNiche, scan, opportunity, saved] = Array.from({ length: 11 }, randomUUID);
const periodStart = "2026-11-02T00:00:00Z";
const periodEnd = "2026-11-09T00:00:00Z";

sql(`begin;
insert into public.application_beta_invitations (user_id, expires_at)
  values ('${founderA.id}', now() + interval '1 hour'), ('${founderB.id}', now() + interval '1 hour');
insert into public.opportunity_discoveries (id, user_id, summary) values ('${discovery}', '${founderA.id}', '${marker}');
insert into public.discovered_problems (id, discovery_id, user_id, problem_title)
  values ('${problem}', '${discovery}', '${founderA.id}', '${marker}');
insert into public.weekly_intelligence_runs (id, user_id, summary)
  values ('${weekly}', '${founderA.id}', '${marker}');
insert into public.weekly_detected_problems (id, run_id, problem_title)
  values ('${weeklyProblem}', '${weekly}', '${marker}');
insert into public.scan (id, user_id, evidence, status)
  values ('${scan}', '${founderA.id}', '${marker}', 'completed');
insert into public.opportunities (id, user_id, scan_id, title)
  values ('${opportunity}', '${founderA.id}', '${scan}', '${marker}');
insert into public.saved_ideas (id, user_id, opportunity_id) values ('${saved}', '${founderA.id}', '${opportunity}');
commit;`);

const archiveSnapshot = () => sql(`select to_jsonb(a) from (
  select
    (select row_to_json(t) from public.problem_intelligence t where t.problem_title='${marker}') as catalog,
    (select row_to_json(t) from public.opportunity_intelligence t where t.opportunity_id='${opportunity}') as projection,
    (select row_to_json(t) from public.weekly_reports t where t.id='${legacyReport}') as report,
    (select row_to_json(t) from public.weekly_niches t where t.id='${legacyNiche}') as niche,
    (select row_to_json(t) from public.weekly_intelligence_runs t where t.id='${global}') as global,
    (select row_to_json(t) from public.weekly_intelligence_runs t where t.id='${ownerless}') as ownerless,
    (select jsonb_agg(to_jsonb(t) order by t.id) from public.weekly_detected_problems t where t.run_id in ('${ownerless}', '${global}')) as problems,
    (select jsonb_agg(to_jsonb(t) order by t.id) from public.weekly_sources t where t.run_id in ('${ownerless}', '${global}')) as sources
) a;`);

if (phase === "upgrade") {
  sql(`begin;
insert into public.problem_intelligence (problem_title, intelligence_score) values ('${marker}', 91);
insert into public.opportunity_intelligence (opportunity_id, user_id, recommendation)
  values ('${opportunity}', '${founderA.id}', '${marker}');
insert into public.weekly_reports (id, user_id, week_start, week_end, summary, is_global)
  values ('${legacyReport}', '${founderA.id}', '${periodStart}', '${periodEnd}', '${marker}', true);
insert into public.weekly_niches (id, weekly_report_id, user_id, niche, is_global)
  values ('${legacyNiche}', '${legacyReport}', '${founderA.id}', '${marker}', true);
insert into public.weekly_intelligence_runs (id, user_id, period_start, period_end, summary, is_global)
  values ('${global}', '${founderA.id}', '${periodStart}', '${periodEnd}', '${marker}', true),
    ('${ownerless}', null, '${periodStart}', '${periodEnd}', '${marker}', false);
insert into public.weekly_detected_problems (run_id, problem_title)
  values ('${global}', '${marker}'), ('${ownerless}', '${marker}');
insert into public.weekly_sources (run_id, source_title)
  values ('${global}', '${marker}'), ('${ownerless}', '${marker}');
commit;`);
  const before = archiveSnapshot();
  for (const row of Object.values(JSON.parse(before))) assert.ok(row, "Expected populated archive fixture");
  copyFileSync(join(migrations, migration), join(fixtureRoot, "supabase/migrations", migration));
  supabase("migration", "up");
  assert.equal(version(), migrationVersion);
  assert.equal(archiveSnapshot(), before, "Migration must preserve archival rows exactly");
}

const isDenied = (error) => ["42501", "PGRST202", "PGRST205"].includes(error?.code);
const quarantine = ["problem_intelligence", "opportunity_intelligence", "weekly_reports", "weekly_niches"];
const forbiddenGrants = sql(`select count(*) from unnest(array['anon','authenticated','service_role']) role,
  unnest(array[${quarantine.map((table) => `'public.${table}'`).join(",")}]) relation
  where has_table_privilege(role, relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`);
assert.equal(forbiddenGrants, "0");
for (const browser of [anon, founderA.browser, founderB.browser, service]) {
  for (const table of quarantine) {
    const response = await browser.from(table).select("*");
    assert.ok(isDenied(response.error), `Expected ${table} client read denial, received ${response.status}/${response.error?.code}`);
  }
  const write = await browser.from("problem_intelligence").insert({ problem_title: `${marker}-new` });
  assert.ok(isDenied(write.error), `Expected catalog write denial, received ${write.status}/${write.error?.code}`);
}
const restResponse = await fetch(`${api.origin}/rest/v1/problem_intelligence?select=problem_title`, {
  headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${founderB.token}` },
});
assert.ok([401, 403, 404].includes(restResponse.status));
assert.ok(!(await restResponse.text()).includes(marker));

for (const [table, id, columns, value] of [
  ["opportunity_discoveries", discovery, "summary", { summary: marker }],
  ["discovered_problems", problem, "problem_title", { problem_title: marker }],
  ["weekly_intelligence_runs", weekly, "summary", { summary: marker }],
  ["weekly_detected_problems", weeklyProblem, "problem_title", { problem_title: marker }],
  ["scan", scan, "evidence", { evidence: marker }],
  ["opportunities", opportunity, "title", { title: marker }],
  ["saved_ideas", saved, "opportunity_id", { opportunity_id: opportunity }],
]) {
  const owner = await founderA.browser.from(table).select(columns).eq("id", id);
  const nonOwner = await founderB.browser.from(table).select(columns).eq("id", id);
  assert.ifError(owner.error);
  assert.ifError(nonOwner.error);
  assert.deepEqual(owner.data, [value]);
  assert.deepEqual(nonOwner.data, []);
}

for (const browser of [founderA.browser, founderB.browser]) {
  const runs = await browser.from("weekly_intelligence_runs").select("id,summary").in("id", [global, ownerless]);
  const problems = await browser.from("weekly_detected_problems").select("id,problem_title").in("run_id", [global, ownerless]);
  const sources = await browser.from("weekly_sources").select("id,source_title").in("run_id", [global, ownerless]);
  assert.ifError(runs.error);
  assert.ifError(problems.error);
  assert.deepEqual(runs.data, []);
  assert.deepEqual(problems.data, []);
  assert.ok(isDenied(sources.error), "Weekly sources must remain inaccessible to browser roles");
}

const args = {
  p_user_id: founderA.id, p_period_start: periodStart, p_period_end: periodEnd,
  p_timezone: "UTC", p_stale_before: "2026-11-01T00:00:00Z",
};
for (const browser of [anon, founderA.browser, founderB.browser]) {
  const unauthorizedClaim = await browser.rpc("claim_weekly_intelligence_run", args);
  assert.ok(isDenied(unauthorizedClaim.error), "Weekly claim remains server-only");
}
// Keep the spending policy off. Insert a legitimate completed owner run in the
// same period as the historical global one, then exercise the real reuse RPC.
const scoped = await service.from("weekly_intelligence_runs").insert({
  user_id: founderA.id, period_start: periodStart, period_end: periodEnd, status: "completed",
}).select("id").single();
assert.ifError(scoped.error);
const claim = await service.rpc("claim_weekly_intelligence_run", args).single();
assert.ifError(claim.error);
assert.equal(claim.data.claim_status, "completed");
assert.equal(claim.data.run.user_id, founderA.id);
assert.equal(claim.data.run.is_global, false);
assert.equal(claim.data.run.id, scoped.data.id);
assert.ok(!JSON.stringify(claim.data).includes(marker));

for (const record of [{ user_id: null }, { user_id: founderA.id, is_global: true }]) {
  const unsafe = await service.from("weekly_intelligence_runs").insert(record);
  assert.equal(unsafe.error?.code, "23514", "Database must reject new ownerless/global runs");
}
console.log(`BETA-01 ${phase} passed with real local Auth, PostgREST, PostgreSQL, and two isolated founders`);
