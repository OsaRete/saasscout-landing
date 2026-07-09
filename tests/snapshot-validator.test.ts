import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, validateSnapshot, type SnapshotBuilderInput } from "../lib/intelligence/snapshots/index.ts";

const input: SnapshotBuilderInput = {
  metadata: { snapshotId: "snapshot-1", discoveryId: "discovery-1", createdAt: "2026-07-08T00:00:00.000Z" },
  discoveryContext: {
    searchTopic: "agency onboarding",
    discoveryMode: "market_discovery",
    sourceProviders: ["external_search"],
    execution: { requestedAt: "2026-07-08T00:00:00.000Z", completedAt: "2026-07-08T00:01:00.000Z" },
  },
  problemIntelligence: {
    title: "Agency onboarding is fragmented",
    summary: "Agency teams coordinate client onboarding manually.",
    painSeverity: { value: 0.8 },
    frequency: { value: 0.7 },
    urgency: { value: 0.6 },
    existingWorkarounds: ["Spreadsheets"],
    relatedNiches: ["Agency operations"],
    evidenceIds: ["evidence-1"],
  },
  opportunityIntelligence: {
    summary: "A focused workflow can reduce onboarding coordination work.",
    opportunityScore: { value: 0.75 },
    marketSizeSignals: ["Recurring onboarding projects"],
    competitiveSignals: ["Generic project tools"],
    buildSimplicity: { value: 0.65 },
    willingnessToPay: { value: 0.7 },
    revenuePotential: { value: 0.72 },
    riskIndicators: ["Crowded workflows"],
    validationIndicators: ["Manual workaround intensity"],
    evidenceIds: ["evidence-2"],
  },
  evidence: [
    {
      evidenceId: "evidence-1",
      kind: "external_source",
      relationship: "supports_problem",
      claim: "Agency owners describe onboarding coordination pain.",
      supports: [{ section: "problem_intelligence", field: "pain_severity" }],
      confidence: { value: 0.81 },
      provenanceIds: ["source-1"],
    },
    {
      evidenceId: "evidence-2",
      kind: "supporting_observation",
      relationship: "supports_opportunity",
      claim: "Teams use generic tools as a workaround.",
      supports: [{ section: "opportunity_intelligence", field: "competitive_signals" }],
      confidence: { value: 0.74 },
      provenanceIds: ["source-2"],
    },
  ],
  confidence: { overall: { value: 0.77 }, evidence: { value: 0.78 }, opportunity: { value: 0.75 } },
  provenance: {
    discoveryOrigin: { discoveryId: "discovery-1", runId: "run-1" },
    engineAttribution: [
      { engineName: "problem", engineVersion: "1.0", section: "problemIntelligence" },
      { engineName: "opportunity", engineVersion: "1.0", section: "opportunityIntelligence" },
      { engineName: "confidence", engineVersion: "1.0", section: "confidence" },
    ],
    sourceReferences: [
      { sourceId: "source-1", sourceType: "forum" },
      { sourceId: "source-2", sourceType: "historical" },
    ],
    evidenceLineage: [
      { evidenceId: "evidence-1", derivedFrom: ["source-1"] },
      { evidenceId: "evidence-2", derivedFrom: ["source-2"] },
    ],
    processingHistory: [{ step: "discovery_completed", completedAt: "2026-07-08T00:01:00.000Z", version: "1.0" }],
  },
};

type MutableSnapshot = Record<string, unknown>;

function mutableSnapshot(): MutableSnapshot {
  return JSON.parse(JSON.stringify(buildSnapshot(input)));
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function asRecord(value: unknown): MutableSnapshot {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as MutableSnapshot;
}

function asArray(value: unknown): unknown[] {
  assert.equal(Array.isArray(value), true);
  return value as unknown[];
}

function validateChanged(change: (snapshot: MutableSnapshot) => void) {
  const snapshot = mutableSnapshot();
  change(snapshot);
  return validateSnapshot(freeze(snapshot));
}

test("validateSnapshot accepts a valid immutable Snapshot", () => {
  const result = validateSnapshot(buildSnapshot(input));
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.summary.evidenceCount, 2);
});

test("validateSnapshot rejects missing metadata", () => {
  const result = validateChanged((snapshot) => { delete snapshot.metadata; });
  assert.equal(result.valid, false);
  assert.match(result.errors.map((error) => error.code).join(" "), /MISSING_REQUIRED_SECTION/);
});

test("validateSnapshot rejects invalid scores, NaN, and Infinity", () => {
  const outOfRange = validateChanged((snapshot) => { asRecord(asRecord(snapshot.problemIntelligence).painSeverity).value = 1.2; });
  assert.equal(outOfRange.errors.some((error) => error.code === "SCORE_OUT_OF_RANGE"), true);

  const nan = validateChanged((snapshot) => { asRecord(asRecord(snapshot.confidence).overall).value = Number.NaN; });
  assert.equal(nan.errors.some((error) => error.code === "INVALID_SCORE_NUMBER"), true);

  const infinity = validateChanged((snapshot) => { asRecord(asRecord(asArray(snapshot.evidence)[0]).confidence).value = Infinity; });
  assert.equal(infinity.errors.some((error) => error.code === "INVALID_SCORE_NUMBER"), true);
});

test("validateSnapshot rejects invalid confidence values", () => {
  const result = validateChanged((snapshot) => { asRecord(asRecord(snapshot.confidence).overall).value = -0.1; });
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.path === "snapshot.confidence.overall.value"), true);
});

test("validateSnapshot rejects duplicated evidence IDs", () => {
  const result = validateChanged((snapshot) => { asRecord(asArray(snapshot.evidence)[1]).evidenceId = "evidence-1"; });
  assert.equal(result.errors.some((error) => error.code === "DUPLICATE_EVIDENCE_ID"), true);
});

test("validateSnapshot rejects orphan evidence references and unreferenced evidence", () => {
  const missingReference = validateChanged((snapshot) => { asRecord(snapshot.problemIntelligence).evidenceIds = ["missing-evidence"]; });
  assert.equal(missingReference.errors.some((error) => error.code === "ORPHAN_EVIDENCE_REFERENCE"), true);

  const unreferencedEvidence = validateChanged((snapshot) => { asArray(snapshot.evidence).push({ ...asRecord(asArray(snapshot.evidence)[0]), evidenceId: "evidence-3", provenanceIds: ["source-3"] }); });
  assert.equal(unreferencedEvidence.errors.some((error) => error.code === "ORPHAN_EVIDENCE"), true);
});

test("validateSnapshot rejects invalid support targets", () => {
  const result = validateChanged((snapshot) => { asRecord(asArray(asRecord(asArray(snapshot.evidence)[0]).supports)[0]).section = "runtime_payload"; });
  assert.equal(result.errors.some((error) => error.code === "INVALID_SUPPORT_TARGET"), true);
});

test("validateSnapshot rejects missing provenance", () => {
  const result = validateChanged((snapshot) => { asRecord(asArray(snapshot.evidence)[0]).provenanceIds = []; });
  assert.equal(result.errors.some((error) => error.code === "MISSING_EVIDENCE_PROVENANCE"), true);
});

test("validateSnapshot rejects forbidden runtime fields recursively", () => {
  const result = validateChanged((snapshot) => { asRecord(snapshot.problemIntelligence).runtimeDebug = { tokenUsage: 42 }; });
  assert.equal(result.errors.filter((error) => error.code === "FORBIDDEN_RUNTIME_FIELD").length, 2);
});

test("validateSnapshot rejects unknown top-level sections", () => {
  const result = validateChanged((snapshot) => { snapshot.runtimeState = {}; });
  assert.equal(result.errors.some((error) => error.code === "UNKNOWN_TOP_LEVEL_SECTION"), true);
});

test("validateSnapshot is deterministic for repeated validation", () => {
  const snapshot = buildSnapshot(input);
  assert.deepEqual(validateSnapshot(snapshot), validateSnapshot(snapshot));
});
