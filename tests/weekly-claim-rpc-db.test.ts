import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const databaseUrl = process.env.WEEKLY_CLAIM_RPC_DATABASE_URL;
const serviceRole = process.env.WEEKLY_CLAIM_RPC_SERVICE_ROLE || "service_role";
const browserRole = process.env.WEEKLY_CLAIM_RPC_BROWSER_ROLE || "authenticated";

function psql(sql: string) {
  assert.ok(databaseUrl, "WEEKLY_CLAIM_RPC_DATABASE_URL is required for PostgreSQL-backed Weekly claim RPC tests.");
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-At"], { input: sql, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}\nSQL:\n${sql}`);
  return result.stdout.trim();
}

const runIfDb = databaseUrl ? test : test.skip;

runIfDb("claim_weekly_intelligence_run is service-owned, idempotent, and does not write child or Data Moat rows", () => {
  const output = psql(`
    begin;
    create extension if not exists pgcrypto;
    insert into auth.users(id) values
      ('00000000-0000-4000-8000-000000000101'),
      ('00000000-0000-4000-8000-000000000102'),
      ('00000000-0000-4000-8000-000000000103')
    on conflict (id) do nothing;

    delete from public.weekly_detected_problems where run_id in (select id from public.weekly_intelligence_runs where user_id in ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000103'));
    delete from public.weekly_sources where run_id in (select id from public.weekly_intelligence_runs where user_id in ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000103'));
    delete from public.weekly_intelligence_runs where user_id in ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000103');

    set local role ${serviceRole};
    select claim_status || ':' || (run ? 'id') || ':' || (run ? 'user_id') || ':' || (run ? 'period_start') || ':' || (run ? 'period_end') || ':' || (run ? 'timezone') || ':' || (run ? 'status') from public.claim_weekly_intelligence_run('00000000-0000-4000-8000-000000000101','2026-08-03T00:00:00Z','2026-08-10T00:00:00Z','UTC', now() - interval '15 minutes');
    select claim_status from public.claim_weekly_intelligence_run('00000000-0000-4000-8000-000000000101','2026-08-03T00:00:00Z','2026-08-10T00:00:00Z','UTC', now() - interval '15 minutes');
    update public.weekly_intelligence_runs set status = 'completed' where user_id = '00000000-0000-4000-8000-000000000101' and period_start = '2026-08-03T00:00:00Z';
    select claim_status from public.claim_weekly_intelligence_run('00000000-0000-4000-8000-000000000101','2026-08-03T00:00:00Z','2026-08-10T00:00:00Z','UTC', now() - interval '15 minutes');
    insert into public.weekly_intelligence_runs(user_id, period_start, period_end, timezone, status, updated_at) values
      ('00000000-0000-4000-8000-000000000101','2026-08-10T00:00:00Z','2026-08-17T00:00:00Z','UTC','claimed', now()),
      ('00000000-0000-4000-8000-000000000101','2026-08-17T00:00:00Z','2026-08-24T00:00:00Z','UTC','processing', now()),
      ('00000000-0000-4000-8000-000000000101','2026-08-24T00:00:00Z','2026-08-31T00:00:00Z','UTC','failed', now());
    select claim_status from public.claim_weekly_intelligence_run('00000000-0000-4000-8000-000000000101','2026-08-10T00:00:00Z','2026-08-17T00:00:00Z','UTC', now() - interval '15 minutes');
    select claim_status from public.claim_weekly_intelligence_run('00000000-0000-4000-8000-000000000101','2026-08-17T00:00:00Z','2026-08-24T00:00:00Z','UTC', now() - interval '15 minutes');
    select claim_status from public.claim_weekly_intelligence_run('00000000-0000-4000-8000-000000000101','2026-08-24T00:00:00Z','2026-08-31T00:00:00Z','UTC', now() - interval '15 minutes');
    select claim_status from public.claim_weekly_intelligence_run('00000000-0000-4000-8000-000000000102','2026-08-03T00:00:00Z','2026-08-10T00:00:00Z','UTC', now() - interval '15 minutes');
    select count(*) from public.weekly_intelligence_runs where user_id = '00000000-0000-4000-8000-000000000101' and period_start = '2026-08-03T00:00:00Z';
    select count(*) from public.weekly_detected_problems where run_id in (select id from public.weekly_intelligence_runs where user_id in ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102'));
    select count(*) from public.weekly_sources where run_id in (select id from public.weekly_intelligence_runs where user_id in ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102'));
    set local role ${browserRole};
    select has_function_privilege(current_user, 'public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone)', 'execute');
    rollback;
  `).split("\n");

  assert.deepEqual(output, [
    "claimed:t:t:t:t:t:t",
    "processing",
    "completed",
    "reclaimed",
    "processing",
    "reclaimed",
    "claimed",
    "1",
    "0",
    "0",
    "f",
  ]);
});

runIfDb("claim_weekly_intelligence_run fails closed for malformed users and periods", () => {
  assert.throws(() => psql(`begin; set local role ${serviceRole}; select * from public.claim_weekly_intelligence_run(null, '2026-08-03T00:00:00Z', '2026-08-10T00:00:00Z', 'UTC', now()); rollback;`), /p_user_id is required/);
  assert.throws(() => psql(`begin; set local role ${serviceRole}; select * from public.claim_weekly_intelligence_run('00000000-0000-4000-8000-000000000103', '2026-08-10T00:00:00Z', '2026-08-03T00:00:00Z', 'UTC', now()); rollback;`), /valid p_period_start and p_period_end are required/);
});
