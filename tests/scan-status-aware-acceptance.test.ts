import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildScanRequestFingerprint } from "../lib/scan/request-fingerprint.ts";
import { claimScanExecution } from "../lib/scan/acceptance.ts";

const migration = readFileSync("supabase/migrations/20260804000000_status_aware_scan_acceptance.sql", "utf8");

test("request identity normalizes intent and includes uploaded content but not browser metadata", () => {
  const base = { intent: { market: "  Agencies  ", audience: "OWNERS" }, pastedEvidence: " Manual   reports ", files: [{ filename: "private-a.txt", mimeType: "text/plain", byteLength: 4, bytes: Buffer.from("same") }] };
  const equivalent = { intent: { market: "agencies", audience: " owners " }, pastedEvidence: "manual reports", files: [{ filename: "different-name.txt", mimeType: "application/octet-stream", byteLength: 4, bytes: Buffer.from("same") }] };
  const different = { ...equivalent, files: [{ ...equivalent.files[0], bytes: Buffer.from("different") }] };
  assert.equal(buildScanRequestFingerprint("user-1", base).fingerprint, buildScanRequestFingerprint("user-1", equivalent).fingerprint);
  assert.notEqual(buildScanRequestFingerprint("user-1", base).fingerprint, buildScanRequestFingerprint("user-1", different).fingerprint);
  assert.notEqual(buildScanRequestFingerprint("user-1", base).fingerprint, buildScanRequestFingerprint("user-2", base).fingerprint);
});

test("claim contract maps one successful claim and one closed rejection", async () => {
  const rows = [{ claimed: true, scan_id: "scan-1", resulting_status: "processing", rejection_code: null }, { claimed: false, scan_id: "scan-1", resulting_status: "processing", rejection_code: "not_claimed" }];
  const client = { rpc: async () => ({ data: rows.shift(), error: null }) };
  assert.equal((await claimScanExecution("user-1", "scan-1", "a".repeat(64), client as never)).claimed, true);
  assert.equal((await claimScanExecution("user-1", "scan-1", "a".repeat(64), client as never)).claimed, false);
});

test("migration defines the complete status matrix, retry identity, quota, and concurrency locks", () => {
  for (const disposition of ["created", "reused_pending", "already_processing", "already_completed", "retry_created", "rejected_limit"]) assert.match(migration, new RegExp(`'${disposition}'`));
  assert.match(migration, /v_existing\.status = 'failed'[\s\S]+v_retry_of := v_existing\.id/);
  assert.match(migration, /v_attempt := v_existing\.attempt_number \+ 1/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /scan_one_active_attempt_per_request/);
  assert.match(migration, /status IN \('pending', 'processing', 'completed', 'failed'\)\) NOT VALID/);
  assert.match(migration, /IF NOT v_unlimited THEN[\s\S]+scans_used = scans_used \+ 1/);
});

test("claim is atomic, identity scoped, service-role only, and fail closed", () => {
  assert.match(migration, /UPDATE public\.scan s SET status = 'processing'[\s\S]+s\.status = 'pending'/);
  assert.match(migration, /s\.user_id = p_user_id[\s\S]+s\.request_fingerprint = p_request_fingerprint/);
  assert.match(migration, /SECURITY INVOKER/g);
  assert.match(migration, /SET search_path = public, pg_temp/g);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.claim_scan_execution_v1\(uuid,uuid,text\) FROM anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_scan_execution_v1\(uuid,uuid,text\) TO service_role/);
});
