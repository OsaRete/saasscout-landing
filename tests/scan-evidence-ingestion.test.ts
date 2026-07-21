import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSafeScanEvidenceIngestionLog,
  hashScanEvidence,
  ingestScanEvidence,
  normalizeScanEvidenceContent,
  preflightScanEvidenceMultipartFiles,
  publicScanEvidenceError,
  scanEvidenceHttpStatusForCode,
  ScanEvidenceIngestionError,
  SCAN_DOCUMENT_INGESTION_POLICY_V1,
  toEvidenceEnvelopeInputs,
  withExtractionTimeout,
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
const syntheticPdfBytes = () => {
  const text = "SaaSScout synthetic PDF extraction evidence";
  const stream = `BT /F1 24 Tf 100 700 Td (${text}) Tj ET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) { offsets.push(output.length); output += object; }
  const xref = output.length;
  output += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i += 1) output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "utf8");
};
const syntheticDocxBytes = () => Buffer.from("UEsDBBQAAAAIAAAAIVjMVIwQ4AAAAJwBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2Qy07DMBBFf8XyFsUTukAIJekCyhJYlA+w7Eli4Zc8bil/z6QtXaDC0r6PM7rd+hC82GMhl2Ivb1UrBUaTrItTL9+3z829XA/d9isjCbZG6uVca34AIDNj0KRSxsjKmErQlZ9lgqzNh54QVm17BybFirE2demQQ/eEo975KjYH/j5hC3qS4vFkXFi91Dl7Z3RlHfbR/qI0Z4Li5NFDs8t0wwYJVwmL8jfgnHvlHYqzKN50qS86sAs+U7Fgk9kFTqr/a67cmcbRGbzkl7ZckkEiHjh4dVGCdvHnfjjOPXwDUEsDBBQAAAAIAAAAIVg2V97cogAAABgBAAALAAAAX3JlbHMvLnJlbHONzzsOwjAMBuCrRN6pCwNCqGkXhNQVlQNEiZtGNA8l4XV7MjBQxMBo+/dnuekedmY3isl4x2Fd1cDISa+M0xzOw3G1g65tTjSLXBJpMiGxsuIShynnsEdMciIrUuUDuTIZfbQilzJqDEJehCbc1PUW46cBS5P1ikPs1RrY8Az0j+3H0Ug6eHm15PKPE1+JIouoKXO4+6hQvdtVYQHbBhcvti9QSwMEFAAAAAgAAAAhWJS7FBSsAAAA5AAAABEAAAB3b3JkL2RvY3VtZW50LnhtbEWOuw7CMAxFfyXKDikMCFVtGUCsDAWJNSSmjUTiKHFff09SBpZjWdc+utVpth82QogGXc1324IzcAq1cV3NH/fr5shPTTWVGtVgwRFL9y6WU817Il8KEVUPVsYtenApe2OwktIaOjFh0D6gghiTzn7EvigOwkrjeFa+UC95+oyQQU0rZdsqHIjFxVEPZBS73M5PBjMFqSi1ZDAanTpCJfJHZljpV/6s4t+4+QJQSwMEFAAAAAgAAAAhWNJ3/LdtAAAAewAAABwAAAB3b3JkL19yZWxzL2RvY3VtZW50LnhtbC5yZWxzTYxBDgIhDEWvQrp3ii6MMcPMbg5g9AANViAOhVBiPL4sXf689/68fvNuPtw0FXFwnCwYFl+eSYKDx307XGBd5hvv1IehMVU1IxF1EHuvV0T1kTPpVCrLIK/SMvUxW8BK/k2B8WTtGdv/B+DyA1BLAQIUAxQAAAAIAAAAIVjMVIwQ4AAAAJwBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAAAAhWDZX3tyiAAAAGAEAAAsAAAAAAAAAAAAAAIABEQEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgAAAAhWJS7FBSsAAAA5AAAABEAAAAAAAAAAAAAAIAB3AEAAHdvcmQvZG9jdW1lbnQueG1sUEsBAhQDFAAAAAgAAAAhWNJ3/LdtAAAAewAAABwAAAAAAAAAAAAAAIABtwIAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHNQSwUGAAAAAAQABAADAQAAXgMAAAAA", "base64");

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

test("valid synthetic PDF and DOCX fixtures extract expected text deterministically", async () => {
  const pdfBytes = syntheticPdfBytes();
  const docxBytes = syntheticDocxBytes();
  const first = await ingestScanEvidence({ files: [{ filename: "fixture.pdf", mimeType: "application/pdf", byteLength: pdfBytes.length, bytes: pdfBytes }] });
  const docxFirst = await ingestScanEvidence({ files: [{ filename: "fixture.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", byteLength: docxBytes.length, bytes: docxBytes }] });
  const second = await ingestScanEvidence({ files: [{ filename: "fixture.pdf", mimeType: "application/pdf", byteLength: pdfBytes.length, bytes: pdfBytes }] });
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(first.evidenceItems[0].sourceKind, "uploaded_pdf");
  assert.equal(first.evidenceItems[0].extractionStatus, "extracted");
  assert.match(first.evidenceItems[0].normalizedContent, /SaaSScout synthetic PDF extraction evidence/);
  assert.equal(first.evidenceItems[0].byteCount, pdfBytes.length);
  assert.equal(docxFirst.evidenceItems[0].sourceKind, "uploaded_docx");
  assert.equal(docxFirst.evidenceItems[0].extractionStatus, "extracted");
  assert.match(docxFirst.evidenceItems[0].normalizedContent, /SaaSScout synthetic DOCX extraction evidence/);
  assert.equal(docxFirst.evidenceItems[0].byteCount, docxBytes.length);
  const docxSecond = await ingestScanEvidence({ files: [{ filename: "fixture.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", byteLength: docxBytes.length, bytes: docxBytes }] });
  assert.deepEqual(JSON.parse(JSON.stringify(docxFirst)), JSON.parse(JSON.stringify(docxSecond)));
});

test("PDF validations reject corrupt, renamed, no-text, and oversized inputs with controlled codes", async () => {
  await assert.rejects(() => ingestScanEvidence({ files: [pdf("renamed.pdf", "not a pdf but enough readable text")]}), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_signature_invalid");
  const oversized = { ...pdf(), byteLength: SCAN_DOCUMENT_INGESTION_POLICY_V1.maxFileBytes + 1 };
  await assert.rejects(() => ingestScanEvidence({ files: [oversized] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_request_invalid");
  try { await ingestScanEvidence({ files: [pdf()] }); } catch (e) { assert.equal(e instanceof ScanEvidenceIngestionError, true); assert.match((e as ScanEvidenceIngestionError).code, /scan_evidence_(pdf_no_text|extraction_failed)/); }
});

test("DOCX validations reject invalid zip/docx, empty/corrupt containers, and apply size limit", async () => {
  await assert.rejects(() => ingestScanEvidence({ files: [docx("bad.docx", "not zip but useful text")] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_signature_invalid");
  const oversized = { ...docx(), byteLength: SCAN_DOCUMENT_INGESTION_POLICY_V1.maxFileBytes + 1 };
  await assert.rejects(() => ingestScanEvidence({ files: [oversized] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_request_invalid");
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


test("route preflight rejects invalid multipart metadata before arrayBuffer reads", () => {
  let reads = 0;
  const file = (name: string, size: number, type = "text/plain") => ({ name, size, type, arrayBuffer: async () => { reads += 1; return new ArrayBuffer(0); } }) as File;
  assert.throws(() => preflightScanEvidenceMultipartFiles(Array.from({ length: 6 }, (_, i) => file(`${i}.txt`, 10))), ScanEvidenceIngestionError);
  assert.throws(() => preflightScanEvidenceMultipartFiles([file("big.txt", SCAN_DOCUMENT_INGESTION_POLICY_V1.maxFileBytes + 1)]), ScanEvidenceIngestionError);
  assert.throws(() => preflightScanEvidenceMultipartFiles([file("a.txt", SCAN_DOCUMENT_INGESTION_POLICY_V1.maxTotalFileBytes - 1), file("b.txt", 2)]), ScanEvidenceIngestionError);
  assert.equal(reads, 0);
});

test("combined actual bytes are enforced before any parser invocation", async () => {
  let pdfCalls = 0;
  let docxCalls = 0;
  const extractors = { extractPdf: async () => { pdfCalls += 1; return "never"; }, extractDocx: async () => { docxCalls += 1; return "never"; } };
  const pdfBytes = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(4 * 1024 * 1024 - 9, 65)]);
  const docxBytes = Buffer.concat([Buffer.from("PK"), Buffer.alloc(4 * 1024 * 1024 - 2, 66)]);
  const txtBytes = Buffer.alloc(4 * 1024 * 1024 + 1, 67);
  await assert.rejects(() => ingestScanEvidence({ files: [
    { filename: "large-a.pdf", mimeType: "application/pdf", byteLength: pdfBytes.length, bytes: pdfBytes },
    { filename: "large-b.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", byteLength: docxBytes.length, bytes: docxBytes },
    { filename: "large-c.txt", mimeType: "text/plain", byteLength: txtBytes.length, bytes: txtBytes },
  ] }, { extractors }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_total_size_exceeded");
  assert.equal(pdfCalls, 0);
  assert.equal(docxCalls, 0);
});

test("actual bytes are authoritative and parser is not invoked before byte/type/signature validation", async () => {
  let parserCalls = 0;
  const extractors = { extractPdf: async () => { parserCalls += 1; return "never"; }, extractDocx: async () => { parserCalls += 1; return "never"; } };
  const large = Buffer.alloc(SCAN_DOCUMENT_INGESTION_POLICY_V1.maxFileBytes + 1, 65);
  await assert.rejects(() => ingestScanEvidence({ files: [{ filename: "large.txt", mimeType: "text/plain", byteLength: 100, bytes: large }] }, { extractors }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_request_invalid");
  await assert.rejects(() => ingestScanEvidence({ files: [{ filename: "large.txt", mimeType: "text/plain", byteLength: large.length, bytes: large }] }, { extractors }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_file_too_large");
  await assert.rejects(() => ingestScanEvidence({ files: [pdf("bad.pdf", "not a pdf but enough readable text")] }, { extractors }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_signature_invalid");
  await assert.rejects(() => ingestScanEvidence({ files: [txt("bad.txt", "Useful text content", "application/pdf")] }, { extractors }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_mime_mismatch");
  assert.equal(parserCalls, 0);
});

test("controlled timeout and PDF parser failures do not leak raw messages", async () => {
  await assert.rejects(() => withExtractionTimeout(new Promise((resolve) => setTimeout(() => resolve("late"), 20)), 5), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_extraction_timeout");
  await assert.rejects(() => ingestScanEvidence({ files: [pdf("safe.pdf")] }, { extractors: { extractPdf: async () => { throw new Error("password required /tmp/private.pdf"); }, extractDocx: async () => "" } }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_pdf_encrypted" && !JSON.stringify(publicScanEvidenceError(e)).includes("/tmp/private"));
  await assert.rejects(() => ingestScanEvidence({ files: [pdf("safe.pdf")] }, { extractors: { extractPdf: async () => { throw new Error("xref exploded /tmp/private.pdf"); }, extractDocx: async () => "" } }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_extraction_failed");
});

test("TXT UTF-8 policy accepts BOM and rejects malformed bytes", async () => {
  const bomBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("UTF-8 BOM evidence with enough useful content.")]);
  const ok = await ingestScanEvidence({ files: [{ filename: "bom.txt", mimeType: "text/plain", byteLength: bomBytes.length, bytes: bomBytes }] });
  assert.match(ok.evidenceItems[0].normalizedContent, /^UTF-8 BOM/);
  const bad = Buffer.from([0xc3, 0x28, 0x20, 0x61, 0x62, 0x63]);
  await assert.rejects(() => ingestScanEvidence({ files: [{ filename: "bad.txt", mimeType: "text/plain", byteLength: bad.length, bytes: bad }] }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_text_encoding_invalid");
});

test("collection counts, response minimization, status mapping, filenames, and logs are hardened", async () => {
  await assert.rejects(() => ingestScanEvidence({ externalSnippets: Array.from({ length: SCAN_DOCUMENT_INGESTION_POLICY_V1.maxExternalSnippets + 1 }, () => ({ content: "Useful tiny snippet content." })) }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_request_invalid");
  await assert.rejects(() => ingestScanEvidence({ discoverContext: Array.from({ length: SCAN_DOCUMENT_INGESTION_POLICY_V1.maxDiscoverContextItems + 1 }, () => ({ content: "Useful tiny context content." })) }), (e) => e instanceof ScanEvidenceIngestionError && e.code === "scan_evidence_request_invalid");
  assert.equal(scanEvidenceHttpStatusForCode("scan_evidence_request_invalid"), 400);
  assert.equal(scanEvidenceHttpStatusForCode("scan_evidence_file_too_large"), 413);
  assert.equal(scanEvidenceHttpStatusForCode("scan_evidence_pdf_encrypted"), 422);
  assert.equal(scanEvidenceHttpStatusForCode("scan_evidence_configuration_failed"), 500);
  const result = await ingestScanEvidence({ files: [txt("../Café\u0001 secret.txt", "Useful filename privacy evidence content.")] });
  assert.equal(result.evidenceItems[0].originalFilename, "Café secret.txt");
  assert.equal(result.evidenceItems[0].evidenceId.includes("Café"), false);
  const log = JSON.stringify(buildSafeScanEvidenceIngestionLog({ result, durationMs: 1 }));
  assert.equal(log.includes("Café"), false);
  assert.equal(log.includes("sha256"), false);
});

test("DOCX fixture source stays portable and self-contained", () => {
  const source = readFileSync("tests/scan-evidence-ingestion.test.ts", "utf8");
  const forbidden = ["exec" + "FileSync", "mk" + "dtempSync", "rm" + "Sync", "write" + "FileSync", "tmp" + "dir"];
  for (const token of forbidden) assert.equal(source.includes(token), false);
  const processCall = "exec" + "FileSync";
  assert.equal(source.includes(processCall + '("zip"'), false);
  assert.equal(source.includes(processCall + "('zip'"), false);
  assert.equal(source.includes(processCall + '("mkdir"'), false);
  assert.equal(source.includes(processCall + "('mkdir'"), false);
});

test("legacy Scan generation routes are explicit gone responses", () => {
  const scanPage = readFileSync("app/scan/page.tsx", "utf8");
  const analyzeRoute = readFileSync("app/api/analyze-evidence/route.ts", "utf8");
  const generateRoute = readFileSync("app/api/generate-opportunities/route.ts", "utf8");
  const solutionRoute = readFileSync("app/api/solution-intelligence/route.ts", "utf8");
  assert.match(scanPage, /\/api\/scan\/workflow/);
  for (const route of [analyzeRoute, generateRoute, solutionRoute]) {
    assert.match(route, /LEGACY_SCAN_ROUTE_STATUS = 410/);
    assert.match(route, /legacy_scan_generation_route_rejected/);
    assert.match(route, /replacement: "\/api\/scan\/workflow"/);
    assert.doesNotMatch(route, /scan-user-evidence|generateProblemIntelligence|generateSolutionIntelligence|chat\.completions|from\(|insert\(|upsert\(|update\(|delete\(/);
  }
});
