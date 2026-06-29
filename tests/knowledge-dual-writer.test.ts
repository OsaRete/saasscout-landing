import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDualWriteReport,
  shouldWriteKnowledgeEvolution,
  writeDual,
  writeKnowledgeEvolution,
  writeLegacy,
  type DualWriteReport,
} from "../lib/knowledge/dual-writer/index.ts";
import type { ProblemObservationInput } from "../lib/knowledge/problem-observations.ts";

const validObservation = (overrides: Partial<ProblemObservationInput> = {}): ProblemObservationInput => ({
  title: "Manual onboarding follow-up is slow",
  observedAt: "2026-01-15T12:00:00.000Z",
  source: {
    sourceType: "discovery",
    sourceName: "SaaSScout Discovery",
    sourceUrl: "https://example.com/source",
    sourceRank: 1,
    sourceId: "problem_1",
    sourceTable: "discovered_problems",
  },
  provenance: {
    sourceTable: "discovered_problems",
    sourceId: "problem_1",
    userId: "user_1",
  },
  evidenceSummary: "Founders repeatedly mention manual onboarding follow-up.",
  affectedNiches: "Agencies | Consultants",
  problemCluster: "client_onboarding",
  scores: {
    pain: 8,
    revenue: 7,
    urgency: 6,
    trend: 7,
    buyingSignal: 8,
    frequency: 7,
    sourceQuality: 8,
    opportunity: 82,
    intelligence: 7.5,
    confidence: 8,
  },
  ...overrides,
});

const logger = { info() {}, warn() {} };

describe("Knowledge Evolution dual writer", () => {
  it("detects whether Knowledge Evolution dual-write is enabled", () => {
    assert.equal(shouldWriteKnowledgeEvolution("1"), true);
    assert.equal(shouldWriteKnowledgeEvolution("0"), false);
    assert.equal(shouldWriteKnowledgeEvolution(undefined), false);
  });

  it("writes only legacy persistence when the flag is disabled", async () => {
    let legacyWrites = 0;
    let knowledgeWrites = 0;

    const result = await writeDual({
      legacy: {
        write: () => {
          legacyWrites += 1;
          return { id: "legacy" };
        },
      },
      knowledgeEvolution: {
        observationInputs: [validObservation()],
        write: () => {
          knowledgeWrites += 1;
          throw new Error("should not run");
        },
      },
      featureFlag: "0",
      now: (() => {
        const values = [100, 125];
        return () => values.shift() || 125;
      })(),
      logger,
    });

    assert.equal(legacyWrites, 1);
    assert.equal(knowledgeWrites, 0);
    assert.deepEqual(result.legacyResult, { id: "legacy" });
    assert.equal(result.knowledgeResult, null);
    assert.equal(result.report.legacy_success, true);
    assert.equal(result.report.knowledge_skipped, true);
    assert.equal(result.report.skipped_observations, 1);
    assert.equal(result.report.execution_time_ms, 25);
  });

  it("runs legacy first and then Knowledge Evolution when the flag is enabled", async () => {
    const order: string[] = [];

    const result = await writeDual({
      legacy: {
        write: () => {
          order.push("legacy");
          return { id: "legacy" };
        },
      },
      knowledgeEvolution: {
        observationInputs: [validObservation()],
        write: (options) => {
          order.push("knowledge");
          return writeKnowledgeEvolution(options);
        },
      },
      featureFlag: "1",
      logger,
    });

    assert.deepEqual(order, ["legacy", "knowledge"]);
    assert.equal(result.report.legacy_success, true);
    assert.equal(result.report.knowledge_success, true);
    assert.equal(result.report.observation_count, 1);
    assert.equal(result.knowledgeResult?.observations[0].problem_title, "Manual onboarding follow-up is slow");
  });

  it("fails the request when legacy persistence fails and attaches a structured report", async () => {
    await assert.rejects(
      async () =>
        writeDual({
          legacy: {
            write: () => {
              throw new Error("legacy insert failed");
            },
          },
          knowledgeEvolution: { observationInputs: [validObservation()] },
          featureFlag: "1",
          logger,
        }),
      (error: unknown) => {
        const report = (error as { dualWriteReport?: DualWriteReport }).dualWriteReport;
        assert.equal(report?.legacy_success, false);
        assert.equal(report?.knowledge_skipped, true);
        assert.deepEqual(report?.persistence_failures, [
          { stage: "legacy", message: "legacy insert failed" },
        ]);
        return true;
      }
    );
  });

  it("does not fail the request when Knowledge Evolution persistence fails", async () => {
    const result = await writeDual({
      legacy: { write: () => ({ id: "legacy" }) },
      knowledgeEvolution: {
        observationInputs: [validObservation()],
        write: () => {
          throw new Error("knowledge persistence unavailable");
        },
      },
      featureFlag: "1",
      logger,
    });

    assert.deepEqual(result.legacyResult, { id: "legacy" });
    assert.equal(result.report.legacy_success, true);
    assert.equal(result.report.knowledge_success, false);
    assert.deepEqual(result.report.persistence_failures, [
      { stage: "knowledge_evolution", message: "knowledge persistence unavailable" },
    ]);
  });

  it("captures partial success and validation failures without database persistence", async () => {
    const result = await writeKnowledgeEvolution({
      observationInputs: [
        validObservation({ title: "Valid problem" }),
        validObservation({ observedAt: "not-a-date" }),
      ],
    });

    assert.equal(result.observations.length, 1);
    assert.equal(result.serializedObservations.length, 1);
    assert.equal(result.report.knowledge_success, false);
    assert.equal(result.report.observation_count, 1);
    assert.equal(result.report.skipped_observations, 1);
    assert.match(result.report.validation_failures[0], /timestamps\.observed_at/);
  });

  it("generates diagnostics reports with defaults and overrides", async () => {
    assert.deepEqual(createDualWriteReport({ legacy_success: true, observation_count: 2 }), {
      legacy_success: true,
      knowledge_success: false,
      knowledge_skipped: false,
      execution_time_ms: 0,
      observation_count: 2,
      skipped_observations: 0,
      validation_failures: [],
      persistence_failures: [],
    });

    assert.deepEqual(await writeLegacy({ write: () => "legacy-result" }), "legacy-result");
  });
});
