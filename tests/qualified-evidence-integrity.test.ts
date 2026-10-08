import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const baseline = readFileSync("supabase/migrations/20260926000000_controlled_customer_interview_promotion.sql", "utf8");
const migration = readFileSync("supabase/migrations/20261008000000_qualified_evidence_integrity.sql", "utf8");

test("the complete B3.1 RPC contract is unchanged except the final atomic snapshot INSERT", () => {
  const original = baseline.slice(baseline.indexOf("create function public.validation_promote_customer_interview_evidence("),
    baseline.indexOf("-- ---------------------------------------------------------------------\n-- Membership-changing coordinators"));
  const updated = migration.slice(migration.indexOf("create or replace function public.validation_promote_customer_interview_evidence("),
    migration.indexOf("alter function public.validation_promote_customer_interview_evidence("));
  const start = updated.indexOf("  -- B4.2-B1: only a NEW controlled promotion creates an attestation.");
  const end = updated.indexOf("  return jsonb_build_object(\n    'promotionId',\n    ledger_id,", start);
  assert.ok(start > 0 && end > start);
  assert.equal((updated.slice(0, start) + updated.slice(end)).replace("create or replace function", "create function"), original);
});
