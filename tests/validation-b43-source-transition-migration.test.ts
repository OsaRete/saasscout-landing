import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

test("C1 replaces only the source lock function and preserves its lock/security contract", () => {
  const original = migration("20261030000000_b43_current_evidence_authority.sql");
  const start = original.indexOf("create function public.validation_b43_lock_source_change()");
  const end = original.indexOf("create function public.validation_b43_capture_participant_restrictions()");
  const expected = original.slice(start, end)
    .replace("create function", "create or replace function")
    .replace("  if tg_op='INSERT' then return new; end if;\n  return old;", "  return new;");
  const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
  assert.equal(stripComments(migration("20261103000000_b43_source_transition_integrity.sql")), stripComments(expected));
});
