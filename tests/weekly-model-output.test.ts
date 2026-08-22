import assert from "node:assert/strict";
import test from "node:test";
import { extractWeeklyOpenRouterResponse, parseWeeklyModelResponse, WeeklyModelResponseError } from "../lib/weekly-model-output.ts";
import { buildWeeklyIntelligencePrompt, selectWeeklyModelEvidence, validateWeeklyModelOutput, WEEKLY_MODEL_ENVELOPE_LIMITS, type WeeklyEvidenceSource } from "../lib/weekly-intelligence.ts";

const valid = JSON.stringify({ summary: "Grounded", problems: [] });

test("Weekly model parser accepts direct JSON, whitespace, and one complete fence", () => {
  assert.equal(parseWeeklyModelResponse(valid).parserStrategy, "direct_json");
  assert.equal(parseWeeklyModelResponse(` \n${valid}\n `).output.summary, "Grounded");
  assert.equal(parseWeeklyModelResponse(`\`\`\`json\n${valid}\n\`\`\``).parserStrategy, "json_fence");
  assert.equal(parseWeeklyModelResponse(`\`\`\`\n${valid}\n\`\`\``).parserStrategy, "plain_fence");
});

test("Weekly model parser conservatively rejects ambiguous and malformed responses", () => {
  assert.throws(() => parseWeeklyModelResponse(`${valid}\n${valid}`), (error) => error instanceof WeeklyModelResponseError && error.code === "weekly_response_parse_failed");
  assert.throws(() => parseWeeklyModelResponse('{"summary":'), (error) => error instanceof WeeklyModelResponseError && error.code === "weekly_response_parse_failed");
});

test("OpenRouter extraction distinguishes empty and truncated responses without retaining content", () => {
  assert.throws(() => extractWeeklyOpenRouterResponse({ choices: [{ finish_reason: "length", message: { content: '{"private":' } }] }), (error) => error instanceof WeeklyModelResponseError && error.code === "weekly_response_truncated" && !error.message.includes("private"));
  assert.throws(() => extractWeeklyOpenRouterResponse({ choices: [{ finish_reason: "stop", message: { content: null } }] }), (error) => error instanceof WeeklyModelResponseError && error.code === "weekly_response_empty");
});

test("parsing does not weaken authoritative Weekly schema or evidence validation", () => {
  const evidence = [{ type: "external" as const, id: "weekly_external_1", title: "Pain", summary: "Manual errors", created_at: "2026-08-20T00:00:00Z" }];
  assert.throws(() => validateWeeklyModelOutput(parseWeeklyModelResponse(JSON.stringify({ summary: "x", problems: "bad" })).output, evidence), /Malformed/);
  assert.throws(() => validateWeeklyModelOutput(parseWeeklyModelResponse(JSON.stringify({ summary: "x", problems: [{ problem_title: "Pain", evidence_references: ["unknown"] }] })).output, evidence), /invalid evidence references/);
});

const externalEvidence = (count = 40): WeeklyEvidenceSource[] => Array.from({ length: count }, (_, index) => ({
  type: "external", id: `weekly_external_${String(index).padStart(2, "0")}`, title: `Title ${index} ${"T".repeat(200)}`,
  summary: `PRIVATE_SNIPPET_${index} ${"S".repeat(600)}`, created_at: `2026-08-${String(20 - (index % 4)).padStart(2, "0")}T00:00:00Z`,
  monitoring_topic: `Topic ${index % 4}`, source_type: "google_search", freshness: index % 5 === 0 ? "changed" : "new", published_at: "2026-08-20T00:00:00Z",
}));

test("model evidence selection is bounded, deterministic, topic-fair, and preserves IDs", () => {
  const available = externalEvidence();
  const first = selectWeeklyModelEvidence(available);
  const second = selectWeeklyModelEvidence([...available].reverse());
  assert.equal(first.length, WEEKLY_MODEL_ENVELOPE_LIMITS.externalEvidence);
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.deepEqual(new Set(first.map((item) => item.monitoring_topic)), new Set(["Topic 0", "Topic 1", "Topic 2", "Topic 3"]));
  assert.ok(first.every((item) => available.some((source) => source.id === item.id)));
});

test("production-shaped prompt compacts evidence and keeps metadata and URLs out", () => {
  const selected = selectWeeklyModelEvidence(externalEvidence());
  const prompt = buildWeeklyIntelligencePrompt({ period: { period_start: "2026-08-17T00:00:00.000Z", period_end: "2026-08-24T00:00:00.000Z", timezone: "UTC", boundary: "[start,end)" }, userEvidence: selected, priorUserContext: Array.from({ length: 8 }, (_, index) => ({ type: "scan" as const, id: `history-${index}`, title: "H".repeat(200), summary: "C".repeat(500), created_at: "2026-08-01T00:00:00Z" })), sharedContext: [{ type: "data_moat", id: "db-private-id", title: "Context", summary: "Theme", created_at: null }], executionMode: "fresh_market" });
  assert.doesNotMatch(prompt, /https?:\/\//);
  assert.doesNotMatch(prompt, /db-private-id/);
  assert.equal((prompt.match(/"evidenceId"/g) || []).length, WEEKLY_MODEL_ENVELOPE_LIMITS.externalEvidence);
  assert.equal((prompt.match(/historical_context_non_citable/g) || []).length, WEEKLY_MODEL_ENVELOPE_LIMITS.historicalContext);
  assert.ok(prompt.length < 19_000);
});

test("authoritative validation enforces compact output and selected-reference boundary", () => {
  const selected = selectWeeklyModelEvidence(externalEvidence());
  const omitted = externalEvidence().find((item) => !selected.some((chosen) => chosen.id === item.id))!;
  assert.throws(() => validateWeeklyModelOutput({ summary: "Grounded", problems: [{ problem_title: "Unknown", evidence_references: [omitted.id] }] }, selected), /invalid evidence references/);
  assert.throws(() => validateWeeklyModelOutput({ summary: "Grounded", problems: Array.from({ length: 4 }, () => ({ problem_title: "Pain", evidence_references: [selected[0].id] })) }, selected), /problem limit/);
  assert.throws(() => validateWeeklyModelOutput({ summary: "Grounded", problems: [{ problem_title: "Pain", problem_summary: "x".repeat(361), evidence_references: [selected[0].id] }] }, selected), /output bound/);
  assert.equal(validateWeeklyModelOutput(JSON.parse(JSON.stringify({ summary: "Grounded", problems: [{ problem_title: "Pain", problem_summary: "Concise", evidence_references: [selected[0].id] }] })), selected).problems.length, 1);
});
