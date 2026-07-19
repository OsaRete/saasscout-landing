import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20260718000000_add_scan_owner_update_policy.sql",
  "utf8"
);
const scanPage = readFileSync("app/scan/page.tsx", "utf8");

test("legacy scan migration adds a duplicate-safe owner-scoped authenticated UPDATE policy", () => {
  assert.match(migration, /from pg_policies/i);
  assert.match(migration, /policyname = 'authenticated users can update own scans'/i);
  assert.match(migration, /create policy "authenticated users can update own scans"\s+on public\.scan\s+for update\s+to authenticated\s+using \(auth\.uid\(\) = user_id\)\s+with check \(auth\.uid\(\) = user_id\)/i);
  assert.doesNotMatch(migration, /status\s+in|create type|alter table public\.scan[\s\S]*check/i);
});

test("legacy scan completed status transition captures and handles Supabase errors before redirect", () => {
  assert.match(scanPage, /const completedTransitioned = await transitionLegacyScanStatus\(\{[\s\S]*status: "completed",[\s\S]*reason: "opportunities_persisted"/);
  assert.match(scanPage, /if \(!completedTransitioned\) \{[\s\S]*console\.error\("Scan completed status update error:"[\s\S]*attemptedStatus: "completed"[\s\S]*await failAcceptedScan\(scanAcceptance\.scanId, "completed_transition_failed"\);[\s\S]*setMessage\(SAFE_SCAN_FAILURE_MESSAGE\);[\s\S]*return;[\s\S]*\}/);
  assert.match(scanPage, /if \(!completedTransitioned\)[\s\S]*return;[\s\S]*setLoadingStep\("completed"\);[\s\S]*router\.push\("\/results"\);/);
});

test("legacy scan file_url update captures and handles Supabase errors", () => {
  assert.match(scanPage, /const \{ error: fileUrlUpdateError \} = await supabase\s*\.from\("scan"\)\s*\.update\(\{ file_url: filePath \}\)\s*\.eq\("id", scanAcceptance\.scanId\)\s*\.eq\("user_id", userId\);/);
  assert.match(scanPage, /if \(fileUrlUpdateError\) \{[\s\S]*console\.error\("Scan file_url update error:"[\s\S]*filePath[\s\S]*await failAcceptedScan\(scanAcceptance\.scanId, "file_url_persistence_failed"\);[\s\S]*setMessage\(SAFE_SCAN_FAILURE_MESSAGE\);[\s\S]*return;[\s\S]*\}/);
});
