import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { recordOperationalEvent, sanitizeOperationalMetadata } from "../lib/operational-events.ts";

function clientThatFails() {
  return {
    from() {
      return {
        async insert() {
          return { error: new Error("insert unavailable") };
        },
      };
    },
  };
}

function captureClient(rows: Record<string, unknown>[]) {
  return {
    from(table: string) {
      assert.equal(table, "operational_events");
      return {
        async insert(row: Record<string, unknown>) {
          rows.push(row);
          return { error: null };
        },
      };
    },
  };
}

test("recordOperationalEvent never throws when insert fails", async () => {
  await assert.doesNotReject(() => recordOperationalEvent({ workflow: "scan", eventType: "completed", status: "completed" }, clientThatFails() as never));
});

test("workflow behavior can remain identical if operational insert fails", async () => {
  async function workflow() {
    await recordOperationalEvent({ workflow: "discover", eventType: "completed", status: "completed" }, clientThatFails() as never);
    return { success: true, value: 42 };
  }

  assert.deepEqual(await workflow(), { success: true, value: 42 });
});

test("safe metadata excludes sensitive keys", async () => {
  const safe = sanitizeOperationalMetadata({
    scanId: "scan_1",
    prompt: "never",
    response: "never",
    evidence: "never",
    tokens: 123,
    providerOutput: "never",
    userText: "never",
    nested: { auth_header: "never", plan: "free" },
  });

  assert.deepEqual(safe, { scanId: "scan_1", nested: { plan: "free" } });
});

test("Scan completed and failed events are representable", async () => {
  const rows: Record<string, unknown>[] = [];
  const client = captureClient(rows);
  await recordOperationalEvent({ workflow: "scan", eventType: "completed", status: "completed", safeMetadata: { scanId: "scan_1", provider: "openrouter" } }, client as never);
  await recordOperationalEvent({ workflow: "scan", eventType: "failed", status: "failed", failureCategory: "scan_workflow_internal_failed" }, client as never);
  assert.equal(rows[0].workflow, "scan");
  assert.equal(rows[0].status, "completed");
  assert.equal(rows[1].status, "failed");
});

test("Weekly completed, reused, and failed events are representable", async () => {
  const rows: Record<string, unknown>[] = [];
  const client = captureClient(rows);
  await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "completed", status: "completed", safeMetadata: { runId: "run_1", generatedProblems: 3, plan: "pro" } }, client as never);
  await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "reused", status: "reused", safeMetadata: { runId: "run_1", reused: true } }, client as never);
  await recordOperationalEvent({ workflow: "weekly_intelligence", eventType: "failed", status: "failed", failureCategory: "Error" }, client as never);
  assert.deepEqual(rows.map((row) => row.status), ["completed", "reused", "failed"]);
});

test("Results completed and degraded events are representable", async () => {
  const rows: Record<string, unknown>[] = [];
  const client = captureClient(rows);
  await recordOperationalEvent({ workflow: "results_validation", eventType: "completed", status: "completed", safeMetadata: { batchSize: 2, ideasValidated: 2, aggregationSources: 4 } }, client as never);
  await recordOperationalEvent({ workflow: "results_validation", eventType: "degraded", status: "degraded", safeMetadata: { batchSize: 2, ideasValidated: 2, aggregationSources: 4 } }, client as never);
  assert.deepEqual(rows.map((row) => row.status), ["completed", "degraded"]);
});

test("Discover completed, partial persistence, and failed events are representable", async () => {
  const rows: Record<string, unknown>[] = [];
  const client = captureClient(rows);
  await recordOperationalEvent({ workflow: "discover", eventType: "completed", status: "completed", safeMetadata: { discoveryId: "disco_1", problemsGenerated: 5, replacementAttempts: 1 } }, client as never);
  await recordOperationalEvent({ workflow: "discover", eventType: "partial_persistence", status: "partial_persistence", failureCategory: "knowledge_evolution_persistence" }, client as never);
  await recordOperationalEvent({ workflow: "discover", eventType: "failed", status: "failed", failureCategory: "Error" }, client as never);
  assert.deepEqual(rows.map((row) => row.status), ["completed", "partial_persistence", "failed"]);
});

test("browser cannot create operational events through app routes or grants", () => {
  const routeFiles = [
    "app/api/scan/workflow/route.ts",
    "app/api/weekly-intelligence/route.ts",
    "app/api/cron/route.ts",
    "app/api/discover-opportunities/route.ts",
    "app/api/results/idea-validation/route.ts",
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  const migration = readFileSync("supabase/migrations/20260722000000_create_operational_events.sql", "utf8");

  assert.doesNotMatch(routeFiles, /from\(["']operational_events["']\)\.insert/);
  assert.match(migration, /revoke all on table public\.operational_events from public, anon, authenticated;/);
  assert.doesNotMatch(migration, /grant\s+insert\s+on table public\.operational_events to authenticated/i);
});
