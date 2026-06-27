import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveDetectedProblemTitle,
  estimateBuyingIntentSignal,
  estimateFrequencySignal,
  estimatePainIntensity,
  extractConciseEvidenceClaim,
  isGenericProblemTitle,
} from "../lib/evidence/extraction.ts";
import { normalizeExternalSourceToEvidence } from "../lib/evidence/normalize.ts";

test("extracts a concise claim from a long snippet", () => {
  const claim = extractConciseEvidenceClaim({
    title: "Spreadsheet operations",
    snippet:
      "A short intro. Finance teams manually reconcile subscription invoices in spreadsheets every week, causing delays and rework before month-end close. Another unrelated sentence follows with background details.",
  });

  assert.equal(
    claim,
    "Finance teams manually reconcile subscription invoices in spreadsheets every week, causing delays and rework before month-end close."
  );
});

test("rejects generic one-word titles", () => {
  assert.equal(isGenericProblemTitle("manual"), true);
  assert.equal(isGenericProblemTitle("billing"), true);
  assert.equal(isGenericProblemTitle("Client billing approval delays"), false);
});

test("derives a useful problem title from workflow pain language", () => {
  assert.equal(
    deriveDetectedProblemTitle({
      title: "automation",
      snippet:
        "Support teams repeatedly copy customer escalation notes between tools, creating a manual workflow bottleneck every week.",
    }),
    "Support teams repeatedly copy customer escalation notes between…"
  );
});

test("estimates buying intent from lost revenue and paid tools language", () => {
  const score = estimateBuyingIntentSignal(
    "Teams report lost revenue while paying for three tools and asking for budget to replace the workflow."
  );

  assert.ok((score || 0) >= 7);
});

test("estimates pain and frequency from manual spreadsheet workflow language", () => {
  const text = "Operators manually copy data into spreadsheets every week, causing repeated rework and painful workflow delays.";

  assert.ok((estimatePainIntensity(text) || 0) >= 7);
  assert.ok((estimateFrequencySignal(text) || 0) >= 7);
});

test("normalizes external sources with richer fields while preserving fingerprints", () => {
  const evidence = normalizeExternalSourceToEvidence({
    id: "source-1",
    title: "Manual approval workflow delays paid onboarding",
    url: "https://example.com/approval",
    snippet: "Teams lose revenue when approvals are copied manually into spreadsheets every week.",
    source_type: "google_search",
    signal_score: 30,
  });

  assert.equal(evidence.sourceUrl, "https://example.com/approval");
  assert.equal(evidence.provenance.raw?.id, "source-1");
  assert.match(evidence.deduplicationFingerprint, /^ev1:/);
  assert.equal(evidence.detectedProblemTitle, "Manual approval workflow delays paid onboarding");
  assert.ok(evidence.extractedClaim && evidence.extractedClaim.length < 220);
});
