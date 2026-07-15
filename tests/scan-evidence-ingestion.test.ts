import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSafeScanEvidenceIngestionLog,
  hashScanEvidence,
  ingestScanEvidence,
  normalizeScanEvidenceContent,
  publicScanEvidenceError,
  ScanEvidenceIngestionError,
  SCAN_DOCUMENT_INGESTION_POLICY_V1,
  toEvidenceEnvelopeInputs,
  type ScanEvidenceFileInput,
} from "../lib/scan/evidence-ingestion.ts";

const txt = (name: string, content: string, mimeType = "text/plain"): ScanEvidenceFileInput => {
  const bytes = Buffer.from(content, "utf8");
  return { filename: name, mimeType, byteLength: bytes.length, bytes };
};
const pdf = (name = "safe.pdf", content = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"): ScanEvidenceFileInput => {
  const bytes = Buffer.from(content, "utf8");
  return { filename: name, mimeType: "application/pdf", byteLength: bytes.length, bytes };
};
const docx = (name = "safe.docx", content = "PK\u0003\u0004not a real docx"): ScanEvidenceFileInput => {
  const bytes = Buffer.from(content, "binary");
  return { filename: name, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", byteLength: bytes.length, bytes };
};

test("pasted evidence is accepted, normalized, bounded, hashed, and deterministically identified", async () => {
  const first = await ingestScanEvidence({ pastedEvidence: "\uFEFFPain\r\n\r\n\r\n  repeats\t for teams with manual reporting." });
  const second = await ingestScanEvidence({ pastedEvidence: "\uFEFFPain\n\n\n repeats for teams with manual reporting." });
  assert.equal(first.evidenceItems[0].evidenceId, "pasted-evidence-001");
  assert.equal(first.evidenceItems[0].normalizedContent, second.evidenceItems[0].normalizedContent);
  assert.equal(first.evidenceItems[0].contentHash, second.evidenceItems[0].contentHash);
  assert.equal(first.evidenceItems[0].truncated, false);
});

test("multiple sources receive separate deterministic granular IDs and classifications", async () => {
  const result = await ingestScanEvidence({
    pastedEvidence: "Pasted private customer interview evidence.",
    files: [txt("secret-name.txt", "Uploaded TXT evidence with enough useful text."), txt("duplicate.txt", "Uploaded TXT evidence with enough useful text.")],
    externalSnippets: [{ title: "Public", content: "Public external snippet with enough useful text." }],
    discoverContext: [{ title: "Discover", content: "Discover-derived context with enough useful text." }],
    derivedAnalysis: "Model-derived prior analysis with enough useful text.",
  });
  assert.deepEqual(result.evidenceItems.map((i) => i.evidenceId), ["pasted-evidence-001", "uploaded-txt-001", "uploaded-txt-002", "external-snippet-001", "discover-context-001", "derived-analysis-001"]);
  assert.equal(new Set(result.evidenceItems.map((i) => i.evidenceId)).size, 6);
  assert.deepEqual(result.independentEvidenceIds, ["pasted-evidence-001", "uploaded-txt-001", "uploaded-txt-002", "external-snippet-001"]);
  assert.deepEqual(result.derivedContextIds, ["discover-context-001", "derived-analysis-001"]);
});

test("TXT extraction handles BOM and line endings and rejects binary, empty, and MIME mismatch", async () => {
  const ok = await ingestScanEvidence({ files: [txt("evidence.txt", "\uFEFFLine one\r\n\rLine two with useful content.")] });
  assert.equal(ok.evidenceItems[0].normalizedContent.includes("\r"), false);
  await assert.rejects(() => ingestScanEvidence({ files: [txt("bad.txt", "abc\u0000\u0000def with useful text")] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_text_binary");
  await assert.rejects(() => ingestScanEvidence({ files: [txt("empty.txt", "    \n\n")] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_empty");
  await assert.rejects(() => ingestScanEvidence({ files: [txt("bad.txt", "Useful text content", "application/pdf")] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_mime_mismatch");
});

test("PDF validations reject corrupt, renamed, no-text, and oversized inputs with controlled codes", async () => {
  await assert.rejects(() => ingestScanEvidence({ files: [pdf("renamed.pdf", "not a pdf but enough readable text")]}), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_signature_invalid");
  const oversized = pdf(); oversized.byteLength = SCAN_DOCUMENT_INGESTION_POLICY_V1.maxFileBytes + 1;
  await assert.rejects(() => ingestScanEvidence({ files: [oversized] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_file_too_large");
  try { await ingestScanEvidence({ files: [pdf()] }); } catch (e) { assert.equal(e instanceof ScanEvidenceIngestionError, true); assert.match((e as ScanEvidenceIngestionError).code, /scan_evidence_(pdf_no_text|extraction_failed)/); }
});

test("DOCX validations reject invalid zip/docx, empty/corrupt containers, and apply size limit", async () => {
  await assert.rejects(() => ingestScanEvidence({ files: [docx("bad.docx", "not zip but useful text")] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_signature_invalid");
  const oversized = docx(); oversized.byteLength = SCAN_DOCUMENT_INGESTION_POLICY_V1.maxFileBytes + 1;
  await assert.rejects(() => ingestScanEvidence({ files: [oversized] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_file_too_large");
  await assert.rejects(() => ingestScanEvidence({ files: [docx()] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_docx_invalid");
});

test("limits reject too many files, total byte excess, long filenames, unsupported extensions, HTML TXT, and total content excess", async () => {
  await assert.rejects(() => ingestScanEvidence({ files: Array.from({ length: 6 }, (_, i) => txt(`a${i}.txt`, "Useful evidence text for file limit test.")) }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_file_count_exceeded");
  await assert.rejects(() => ingestScanEvidence({ files: [txt("x.exe", "Useful evidence text")] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_type_unsupported");
  await assert.rejects(() => ingestScanEvidence({ files: [txt(`${"a".repeat(121)}.txt`, "Useful evidence text")] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_request_invalid");
  await assert.rejects(() => ingestScanEvidence({ files: [txt("x.txt", "<html><script>alert(1)</script> enough text</html>")] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_text_binary");
  await assert.rejects(() => ingestScanEvidence({ pastedEvidence: "a".repeat(12_000), externalSnippets: Array.from({ length: 4 }, () => ({ content: "b".repeat(4_000) })) }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_total_content_exceeded");
});

test("normalization removes controls, preserves paragraphs, and hashing is deterministic", () => {
  const normalized = normalizeScanEvidenceContent("A\u0001  B\r\n\r\n\r\nC\tD", 100);
  assert.equal(normalized.normalizedContent, "A B\n\nC D");
  assert.equal(normalized.removedControlCharacterCount, 1);
  assert.equal(hashScanEvidence("pasted_evidence", normalized.normalizedContent), hashScanEvidence("pasted_evidence", normalized.normalizedContent));
});

test("IDs do not contain private filename or content and repeated equal input is deterministic", async () => {
  const input = { files: [txt("alice@example.com-secret-company.txt", "Private Company Name has a reporting pain."), txt("copy.txt", "Private Company Name has a reporting pain.")] };
  const first = await ingestScanEvidence(input);
  const second = await ingestScanEvidence(input);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  for (const id of first.allowedEvidenceIds) assert.equal(/alice|example|company|secret/i.test(id), false);
});

test("derived analysis is non-independent and prompt adapter preserves independent granular IDs", async () => {
  const result = await ingestScanEvidence({ pastedEvidence: "Independent evidence about manual invoices.", derivedAnalysis: "Derived synthesis is not independent evidence." });
  const adapter = toEvidenceEnvelopeInputs(result);
  assert.deepEqual(adapter.allowedEvidenceIds, ["pasted-evidence-001"]);
  assert.deepEqual(adapter.evidence.map((i) => i.evidenceId), ["pasted-evidence-001"]);
  assert.equal(adapter.derivedAnalysis?.content.includes("Derived synthesis"), true);
});

test("public errors and safe logs do not leak parser messages, content, filenames, IDs, hashes, or users", async () => {
  const result = await ingestScanEvidence({ pastedEvidence: "Private pasted evidence from user@example.com with useful content." });
  const log = JSON.stringify(buildSafeScanEvidenceIngestionLog({ result, durationMs: 3, totalInputBytes: 55, fileCount: 1, pastedEvidencePresent: true }));
  assert.equal(log.includes("user@example.com"), false);
  assert.equal(log.includes("pasted-evidence-001"), false);
  assert.equal(log.includes("sha256:"), false);
  assert.equal(log.includes("Private pasted"), false);
  const publicError = JSON.stringify(publicScanEvidenceError(new Error("stack trace raw parser password /tmp/file.pdf")));
  assert.equal(publicError.includes("/tmp/file.pdf"), false);
  assert.equal(publicError.includes("stack trace"), false);
});

test("legacy prompt builders and route contracts remain present", () => {
  const scanPage = readFileSync("app/scan/page.tsx", "utf8");
  const analyzeRoute = readFileSync("app/api/analyze-evidence/route.ts", "utf8");
  const generateRoute = readFileSync("app/api/generate-opportunities/route.ts", "utf8");
  const solutionRoute = readFileSync("app/api/solution-intelligence/route.ts", "utf8");
  assert.match(scanPage, /\/api\/extract-file-text/);
  assert.match(analyzeRoute, /scan-user-evidence/);
  assert.match(generateRoute, /scan-user-evidence/);
  assert.match(solutionRoute, /scan-user-evidence/);
});
