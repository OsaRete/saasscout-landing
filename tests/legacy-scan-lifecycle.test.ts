import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const scanPage = readFileSync("app/scan/page.tsx", "utf8");

test("legacy accepted scan lifecycle uses one transition helper for terminal states", () => {
  assert.match(scanPage, /type LegacyScanStatus = "pending" \| "processing" \| "completed" \| "failed";/);
  assert.match(scanPage, /async function transitionLegacyScanStatus/);
  assert.match(scanPage, /status: LegacyScanStatus/);
  assert.match(scanPage, /async function failAcceptedScan/);
  assert.match(scanPage, /status: "failed"/);
  assert.match(scanPage, /status: "completed"/);
  assert.match(scanPage, /status: "processing"/);
});

test("successful legacy scan path reaches completed without failure transition", () => {
  assert.match(scanPage, /status: "pending"/);
  assert.match(scanPage, /reason: "scan_accepted"/);
  assert.match(scanPage, /reason: "opportunities_persisted"/);
  assert.match(scanPage, /if \(!completedTransitioned\)/);
  assert.doesNotMatch(scanPage, /await failAcceptedScan\(scanData\.id, "opportunities_persisted"\)/);
});

test("failure paths after acceptance transition the legacy scan to failed", () => {
  for (const reason of [
    "processing_transition_failed",
    "evidence_analysis_persistence_failed",
    "source_persistence_failed",
    "file_url_persistence_failed",
    "evidence_file_upload_failed",
    "opportunity_generation_failed",
    "opportunity_generation_empty",
    "opportunity_persistence_failed",
    "completed_transition_failed",
    "unexpected_exception",
  ]) {
    assert.match(scanPage, new RegExp(`failAcceptedScan\\([^)]*${reason}`));
  }
});

test("public legacy scan errors are safe after acceptance", () => {
  assert.match(scanPage, /const SAFE_SCAN_FAILURE_MESSAGE = "Your scan could not be completed\. Please try again\.";/);
  assert.doesNotMatch(scanPage, /uploadError instanceof Error\s*\?\s*uploadError\.message/);
  assert.doesNotMatch(scanPage, /result\.error \|\| "AI generation failed/);
});
