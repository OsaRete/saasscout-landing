import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260718000000_add_scan_owner_update_policy.sql",
  "utf8"
);
const scanPage = readFileSync("app/scan/page.tsx", "utf8");
const orchestration = readFileSync("lib/scan/server-orchestration.ts", "utf8");

test("legacy scan migration adds a duplicate-safe owner-scoped authenticated UPDATE policy", () => {
  assert.match(migration, /from pg_policies/i);
  assert.match(migration, /policyname = 'authenticated users can update own scans'/i);
  assert.match(migration, /create policy "authenticated users can update own scans"\s+on public\.scan\s+for update\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)\s+with check \(auth\.uid\(\) = user_id\)/i);
  assert.doesNotMatch(migration, /status\s+in|create type|alter table public\.scan[\s\S]*check/i);
});

test("legacy scan completed status transition is server-owned before redirect", () => {
  assert.match(orchestration, /await persistLegacyResults\(client, userId, acceptance\.scanId, workflow, input\.legacyContext\)/);
  assert.match(orchestration, /await finishLegacyScan\(client, acceptance\.scanId, userId, "completed"\)/);
  assert.match(scanPage, /await runServerScanWorkflow/);
  assert.match(scanPage, /router\.push\("\/results"\)/);
  assert.doesNotMatch(scanPage, /const completedTransitioned/);
});

test("legacy failure status transition is server-owned and sanitized", () => {
  assert.match(orchestration, /finishLegacyScan\(client, acceptance\.scanId, userId, "failed"\)/);
  assert.match(scanPage, /setMessage\(error instanceof ScanSubmissionError \? error\.message : SAFE_SCAN_FAILURE_MESSAGE\)/);
  assert.doesNotMatch(scanPage, /file_url_persistence_failed/);
});
