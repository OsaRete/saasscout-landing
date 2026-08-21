import assert from "node:assert/strict";
import test from "node:test";
import { extractWeeklyOpenRouterResponse, parseWeeklyModelResponse, WeeklyModelResponseError } from "../lib/weekly-model-output.ts";
import { validateWeeklyModelOutput } from "../lib/weekly-intelligence.ts";

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
