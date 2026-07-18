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

test("legacy scan completed status update captures and handles Supabase errors before redirect", () => {
  assert.match(scanPage, /const \{ error: completedStatusUpdateError \} = await supabase\s*\.from\("scan"\)\s*\.update\(\{ status: "completed" \}\)\s*\.eq\("id", scanData\.id\)\s*\.eq\("user_id", userId\);/);
  assert.match(scanPage, /if \(completedStatusUpdateError\) \{[\s\S]*console\.error\("Scan completed status update error:"[\s\S]*attemptedStatus: "completed"[\s\S]*setMessage\("Opportunities were saved, but the scan could not be marked as completed\. Please try again\."\);[\s\S]*return;[\s\S]*\}/);
  assert.match(scanPage, /if \(completedStatusUpdateError\)[\s\S]*return;[\s\S]*setLoadingStep\("completed"\);[\s\S]*router\.push\("\/results"\);/);
});

test("legacy scan file_url update captures and handles Supabase errors", () => {
  assert.match(scanPage, /const \{ error: fileUrlUpdateError \} = await supabase\s*\.from\("scan"\)\s*\.update\(\{ file_url: filePath \}\)\s*\.eq\("id", scanData\.id\)\s*\.eq\("user_id", userId\);/);
  assert.match(scanPage, /if \(fileUrlUpdateError\) \{[\s\S]*console\.error\("Scan file_url update error:"[\s\S]*filePath[\s\S]*setMessage\("Your file was uploaded, but the scan could not be linked to it\. Please try again\."\);[\s\S]*return;[\s\S]*\}/);
});
