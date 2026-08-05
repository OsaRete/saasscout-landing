import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SCAN_MANUAL_FILE_FIELD,
  classifyScanManualFile,
  hasUsefulManualEvidence,
  normalizeScanManualIntent,
  normalizeScanManualLegacyContext,
} from "../lib/scan/manual-contract.ts";
import { preflightScanEvidenceMultipartFiles, ScanEvidenceIngestionError } from "../lib/scan/evidence-ingestion.ts";
import { validateMultipartScanOrchestrationRequest } from "../lib/scan/server-orchestration.ts";

function file(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}

test("visible manual fields normalize into canonical intent and prior empty-intent regression is avoided", () => {
  assert.deepEqual(normalizeScanManualIntent({ market: " Agencies ", audience: " Owners ", region: " US " }), { market: "Agencies", audience: "Owners", region: "US" });
  assert.deepEqual(normalizeScanManualIntent({ market: " ", audience: "\t", region: "" }), {});
});

test("empty legacy context is omitted while meaningful Discover context is preserved", () => {
  assert.equal(normalizeScanManualLegacyContext({}), undefined);
  assert.deepEqual(normalizeScanManualLegacyContext({ sourceProblemTitle: " Problem ", sourceProblemId: "p1", sourceDiscoveryId: "d1" }), { sourceProblemTitle: "Problem", sourceProblemId: "p1", sourceDiscoveryId: "d1" });
});

test("manual client preflight uses actual bytes and classifies file failures", () => {
  assert.equal(hasUsefulManualEvidence({ pastedEvidence: "short", file: null }), false);
  assert.equal(hasUsefulManualEvidence({ pastedEvidence: "Useful evidence content that is long enough", file: null }), true);
  assert.equal(classifyScanManualFile(file("empty.txt", "text/plain", 0)), "scan_manual_file_empty");
  assert.equal(classifyScanManualFile(file("bad.csv", "text/csv", 100)), "scan_manual_file_unsupported");
  assert.equal(classifyScanManualFile(file("large.txt", "text/plain", 5 * 1024 * 1024 + 1)), "scan_manual_file_too_large");
  assert.equal(classifyScanManualFile(file("small.txt", "text/plain", 1)), "ok");
});

test("multipart file field name and cardinality match the server boundary", () => {
  assert.equal(SCAN_MANUAL_FILE_FIELD, "files");
  const accepted = preflightScanEvidenceMultipartFiles([file("evidence.txt", "text/plain", 42)]);
  assert.equal(accepted.files.length, 1);
  assert.throws(() => preflightScanEvidenceMultipartFiles([file("a.txt", "text/plain", 1), file("b.txt", "text/plain", 1)]), ScanEvidenceIngestionError);
});

test("production-shaped multipart request carries normalized intent and omits empty legacy context", async () => {
  const form = new FormData();
  form.append("intent", JSON.stringify(normalizeScanManualIntent({ market: " Agencies ", audience: " Founders ", region: " US " })));
  form.append("files", new File(["Useful evidence content that is long enough"], "evidence.txt", { type: "text/plain" }));
  const request = new Request("https://example.test/api/scan/workflow", { method: "POST", body: form });
  const input = await validateMultipartScanOrchestrationRequest(request);
  assert.deepEqual(input.intent, { market: "Agencies", audience: "Founders", region: "US" });
  assert.equal(input.legacyContext, undefined);
  assert.equal(input.files?.length, 1);
});

test("manual page posts to the authoritative Scan workflow only", () => {
  const source = readFileSync("app/scan/page.tsx", "utf8");
  assert.match(source, /api\/scan\/workflow/);
  assert.doesNotMatch(source, /api\/analyze-evidence|api\/solution-intelligence/);
});
