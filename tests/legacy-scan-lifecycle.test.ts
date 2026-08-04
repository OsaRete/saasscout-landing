import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const scanPage = readFileSync("app/scan/page.tsx", "utf8");
const orchestration = readFileSync("lib/scan/server-orchestration.ts", "utf8");

test("legacy accepted scan lifecycle is server-owned behind workflow endpoint", () => {
  assert.match(scanPage, /fetch\("\/api\/scan\/workflow"/);
  assert.doesNotMatch(scanPage, /transitionLegacyScanStatus/);
  assert.doesNotMatch(scanPage, /failAcceptedScan/);
  assert.match(orchestration, /acceptScanRequest/);
  assert.match(orchestration, /claimScanExecution/);
  assert.match(orchestration, /finishLegacyScan/);
  assert.match(orchestration, /"processing"/);
  assert.match(orchestration, /"completed"/);
  assert.match(orchestration, /"failed"/);
});

test("successful server scan path reaches completed after Results-compatible persistence", () => {
  assert.match(orchestration, /await claimScanExecution/);
  assert.match(orchestration, /await persistLegacyResults\(client, userId, acceptance\.scanId, workflow, input\.legacyContext\)/);
  assert.match(orchestration, /await finishLegacyScan\(client, acceptance\.scanId, userId, "completed"\)/);
  assert.doesNotMatch(scanPage, /status:\s*"completed"/);
});

test("failure paths after acceptance transition the legacy scan to failed", () => {
  assert.match(orchestration, /catch \(error\) \{[\s\S]*finishLegacyScan\(client, acceptance\.scanId, userId, "failed"\)[\s\S]*throw error;[\s\S]*\}/);
});

test("public legacy scan errors are safe after server workflow failure", () => {
  assert.match(scanPage, /const SAFE_SCAN_FAILURE_MESSAGE = "Your scan could not be completed\. Please try again\.";/);
  assert.match(scanPage, /setMessage\(error instanceof ScanSubmissionError \? error\.message : SAFE_SCAN_FAILURE_MESSAGE\)/);
  assert.doesNotMatch(scanPage, /error instanceof Error\s*\?\s*error\.message/);
});
