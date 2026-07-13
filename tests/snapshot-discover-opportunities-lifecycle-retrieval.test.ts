import test from "node:test";
import assert from "node:assert/strict";

import { buildDiscoverOpportunitiesSnapshotInput } from "../lib/intelligence/snapshots/discover-opportunities-adapter.ts";
import {
  createSnapshotPersistenceInputFromPipeline,
  mapSnapshotPersistenceInputToStorageRecords,
  runSnapshotPipeline,
} from "../lib/intelligence/snapshots/index.ts";
import { buildSupabaseSnapshotPersistencePayload } from "../lib/intelligence/snapshots/supabase-persistence-adapter.ts";
import type { SnapshotIdentityStorageRecord, SnapshotSectionStorageRecord, SnapshotStorageMapping } from "../lib/intelligence/snapshots/storage-mapper.ts";
import { rankSnapshotRetrievalCandidates } from "../lib/intelligence/snapshots/retrieval/ranker.ts";
import type { SnapshotRetrievalCandidate, SnapshotRetrievalQuery } from "../lib/intelligence/snapshots/retrieval/types.ts";

const uuidDiscoveryId = "550e8400-e29b-41d4-a716-446655440000";
const createdAt = "2026-07-13T00:00:00.000Z";

const adapterInput = buildDiscoverOpportunitiesSnapshotInput({
  discoveryId: uuidDiscoveryId,
  createdAt,
  completedAt: "2026-07-13T00:01:00.000Z",
  userId: "user-1",
  plan: "pro",
  sourcesLimit: 5,
  externalSources: [
    {
      source_type: "reddit",
      title: "Operators describe manual onboarding work",
      url: "https://example.com/manual-onboarding",
      snippet: "Agency operators repeatedly describe client onboarding delays caused by scattered spreadsheets and Slack threads.",
      signal_score: 8,
    },
  ],
  moatSources: [
    {
      source_type: "data_moat",
      title: "Prior agency onboarding signal",
      snippet: "Historical SaaSScout observations show recurring onboarding coordination pain for client service agencies.",
      signal_score: 8,
    },
  ],
  problems: [
    {
      problem_title: "Agency onboarding work is scattered",
      problem_summary: "Agency teams lose time coordinating onboarding across disconnected tools.",
      affected_niches: "Agencies | Client services",
      suggested_solutions: "Client onboarding workflow | Approval tracker",
      pain_score: 8,
      revenue_score: 7,
      urgency_score: 7,
      trend_score: 6,
      buying_signal_score: 7,
      frequency_score: 8,
      source_quality_score: 8,
      opportunity_score: 82,
      problem_cluster: "Agency Operations",
      build_difficulty: "Medium",
      source_evidence: "Multiple sources describe manual onboarding coordination.",
    },
  ],
  summary: "Agency onboarding friction appears repeatedly across external and Data Moat signals.",
});

function acceptedMapping(): SnapshotStorageMapping {
  const pipeline = runSnapshotPipeline(adapterInput);
  const persistence = createSnapshotPersistenceInputFromPipeline(pipeline);
  assert.equal(persistence.status, "accepted");
  return mapSnapshotPersistenceInputToStorageRecords(persistence.input);
}

function section(mapping: SnapshotStorageMapping, name: SnapshotSectionStorageRecord["section"]): SnapshotSectionStorageRecord {
  const record = mapping.records.find((item): item is SnapshotSectionStorageRecord => item.kind === "snapshot_section" && item.section === name);
  assert.ok(record, `expected ${name} section`);
  return record;
}

function identity(mapping: SnapshotStorageMapping): SnapshotIdentityStorageRecord {
  const record = mapping.records.find((item): item is SnapshotIdentityStorageRecord => item.kind === "snapshot_identity");
  assert.ok(record, "expected snapshot_identity record");
  return record;
}

function candidateFromMapping(mapping: SnapshotStorageMapping): SnapshotRetrievalCandidate {
  const identityRecord = identity(mapping);
  const problem = section(mapping, "problem_intelligence").payload as SnapshotRetrievalCandidate["problem"];
  const opportunity = section(mapping, "opportunity_intelligence").payload as SnapshotRetrievalCandidate["opportunity"];
  const confidence = section(mapping, "confidence").payload as SnapshotRetrievalCandidate["confidence"];
  return Object.freeze({
    snapshotId: mapping.snapshotId,
    discoveryId: mapping.discoveryId,
    contractVersion: mapping.contractVersion,
    createdAt: identityRecord.createdAt,
    lifecycleState: identityRecord.lifecycleState as SnapshotRetrievalCandidate["lifecycleState"],
    ownership: { userId: "user-1", discoveryId: mapping.discoveryId, scope: "user" },
    problem,
    opportunity,
    confidence: { overall: confidence?.overall == null ? undefined : confidence.overall.value },
    evidenceSignals: [{ claimSnippet: "Agency onboarding coordination pain", confidence: 0.8, supportingTargetCount: 1 }],
    sourceTypes: ["reddit", "data_moat"],
  });
}

const query: SnapshotRetrievalQuery = {
  rawQueryText: "agency onboarding coordination",
  userId: "user-1",
  referenceTimestamp: "2026-07-13T00:05:00.000Z",
};

test("Discover Opportunities producer supplies validated lifecycle before pipeline persistence mapping", () => {
  assert.equal(adapterInput.metadata.lifecycleState, "validated");

  const pipeline = runSnapshotPipeline(adapterInput);
  assert.equal(pipeline.valid, true);
  assert.equal(pipeline.snapshot?.metadata.lifecycleState, "validated");

  const persistence = createSnapshotPersistenceInputFromPipeline(pipeline);
  assert.equal(persistence.status, "accepted");
  if (persistence.status !== "accepted") throw new Error("expected accepted persistence input");
  assert.equal(persistence.input.snapshot.metadata.lifecycleState, "validated");

  const mapping = mapSnapshotPersistenceInputToStorageRecords(persistence.input);
  assert.equal(identity(mapping).lifecycleState, "validated");

  const payload = buildSupabaseSnapshotPersistencePayload(mapping);
  const payloadIdentity = payload.records.find((item) => item.kind === "snapshot_identity");
  assert.equal(payloadIdentity?.lifecycleState, "validated");
});

test("producer-generated Snapshot fixture is retrieval eligible while created lifecycle remains excluded", () => {
  const mapping = acceptedMapping();
  assert.equal(mapping.discoveryId, uuidDiscoveryId);
  assert.equal(identity(mapping).discoveryId, uuidDiscoveryId);

  const validatedCandidate = candidateFromMapping(mapping);
  assert.equal(validatedCandidate.lifecycleState, "validated");
  assert.equal(rankSnapshotRetrievalCandidates(query, [validatedCandidate]).length, 1);

  const createdCandidate = { ...validatedCandidate, snapshotId: "created-snapshot", lifecycleState: "created" as never };
  assert.deepEqual(rankSnapshotRetrievalCandidates(query, [createdCandidate]), []);
});
