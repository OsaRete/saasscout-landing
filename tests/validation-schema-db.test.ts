import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const databaseUrl = process.env.VALIDATION_SCHEMA_TEST_DATABASE_URL;

test("Validation migration executes and enforces reviewed integrity invariants", { skip: !databaseUrl }, () => {
  assert.match(databaseUrl!, /localhost|127\.0\.0\.1|postgres/i, "Use only a disposable local PostgreSQL database.");
  execFileSync("psql", [
    databaseUrl!, "-v", "ON_ERROR_STOP=1",
    "-c", "begin;",
    "-f", "tests/sql/validation-schema-bootstrap.sql",
    "-f", "supabase/migrations/20260828000000_create_validation_domain.sql",
    "-f", "tests/sql/validation-schema-integrity.sql",
    "-c", "rollback;",
  ], { stdio: "pipe" });
});
