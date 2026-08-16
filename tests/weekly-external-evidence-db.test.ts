import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const databaseUrl = process.env.WEEKLY_EXTERNAL_EVIDENCE_TEST_DATABASE_URL;

test("W-B migration preserves server-only access and permits one observation per source per run", { skip: !databaseUrl }, () => {
  const migration = readFileSync("supabase/migrations/20260816000000_weekly_external_evidence_contract.sql", "utf8");
  assert.match(databaseUrl!, /localhost|127\.0\.0\.1|postgres/i, "Use only a disposable PostgreSQL database.");
  execFileSync("psql", [databaseUrl!, "-v", "ON_ERROR_STOP=1", "-c", "begin;", "-f", "supabase/migrations/20260628000000_create_historical_application_schema.sql", "-f", "supabase/migrations/20260816000000_weekly_external_evidence_contract.sql", "-c", "select evidence_id, freshness_class, origin_class from public.weekly_sources limit 0;", "-c", "rollback;"], { stdio: "pipe" });
  assert.match(migration, /revoke all on table public\.weekly_sources from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.weekly_sources to service_role/);
  assert.match(migration, /unique index[\s\S]+\(run_id, evidence_id\)/);
  assert.doesNotMatch(migration, /update public\.weekly_sources|delete from public\.weekly_sources/i);
});
