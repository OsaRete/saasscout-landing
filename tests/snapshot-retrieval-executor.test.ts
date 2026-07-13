import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { executeSnapshotRetrieval, fingerprintSnapshotRetrievalQuery } from "../lib/intelligence/snapshots/retrieval/server-retrieval-executor.ts";
import type { SnapshotRetrievalCandidate, SnapshotRetrievalQuery } from "../lib/intelligence/snapshots/retrieval/index.ts";
import type { SnapshotRetrievalRepository } from "../lib/intelligence/snapshots/retrieval/repository.ts";

const query: SnapshotRetrievalQuery = { rawQueryText: "secret raw agency onboarding", userId: "user-1", referenceTimestamp: "2026-07-13T00:00:00.000Z" };
const candidate: SnapshotRetrievalCandidate = { snapshotId: "snapshot-1", discoveryId: "discovery-1", contractVersion: "1", createdAt: "2026-07-12T00:00:00.000Z", lifecycleState: "persisted", ownership: { userId: "user-1", discoveryId: "discovery-1", scope: "user" }, problem: { title: "Agency onboarding", summary: "Manual workflow", affectedMarket: "Agencies", relatedNiches: ["onboarding"] }, opportunity: { summary: "Workflow product" }, confidence: { overall: 0.8 }, evidenceSignals: [{ claimSnippet: "candidate private content", confidence: 0.8, supportingTargetCount: 1 }], sourceTypes: ["forum"] };

test("disabled mode never calls repository", async () => {
  let calls = 0;
  const outcome = await executeSnapshotRetrieval({ mode: "disabled", query, repository: { async findCandidates() { calls += 1; return []; } } });
  assert.equal(calls, 0);
  assert.equal(outcome.status, "disabled");
});
test("shadow mode calls repository once and returns ranked results/context without prompt or API mutation fields", async () => {
  let calls = 0;
  const repo: SnapshotRetrievalRepository = { async findCandidates() { calls += 1; return [candidate]; } };
  const outcome = await executeSnapshotRetrieval({ mode: "shadow", query, repository: repo });
  assert.equal(calls, 1);
  assert.equal(outcome.status, "shadow_success");
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.historicalContext.length, 1);
  assert.equal("prompt" in (outcome as object), false);
  assert.equal("response" in (outcome as object), false);
});
test("repository errors map to controlled error outcome", async () => {
  const outcome = await executeSnapshotRetrieval({ mode: "shadow", query, repository: { async findCandidates() { throw new Error("boom"); } } });
  assert.equal(outcome.status, "error");
  assert.equal(outcome.error?.code, "SNAPSHOT_RETRIEVAL_REPOSITORY_ERROR");
});
test("influence mode is not active", async () => {
  const outcome = await executeSnapshotRetrieval({ mode: "influence", query, repository: { async findCandidates() { return [candidate]; } } });
  assert.equal(outcome.status, "unsupported_mode");
  assert.equal(outcome.diagnostics.unsupportedMode, true);
});
test("fingerprint is deterministic and safe logger omits raw query/candidate content", async () => {
  const logs: string[] = [];
  await executeSnapshotRetrieval({ mode: "shadow", query, repository: { async findCandidates() { return [candidate]; } }, logger: { info: (_e, m) => logs.push(JSON.stringify(m)) } });
  assert.equal(fingerprintSnapshotRetrievalQuery(query), fingerprintSnapshotRetrievalQuery({ ...query }));
  const logText = logs.join(" ");
  assert.equal(logText.includes("secret raw agency onboarding"), false);
  assert.equal(logText.includes("candidate private content"), false);
});
test("server-only import exists", () => {
  const source = fs.readFileSync("lib/intelligence/snapshots/retrieval/server-retrieval-executor.ts", "utf8");
  assert.match(source, /import "server-only"/);
});
