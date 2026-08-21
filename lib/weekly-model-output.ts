import type { WeeklyModelOutput } from "./weekly-intelligence.ts";

export type WeeklyModelParserStrategy = "direct_json" | "json_fence" | "plain_fence" | "single_object";
export class WeeklyModelResponseError extends Error {
  readonly code: "weekly_response_empty" | "weekly_response_truncated" | "weekly_response_parse_failed";
  constructor(code: "weekly_response_empty" | "weekly_response_truncated" | "weekly_response_parse_failed") { super(code); this.code = code; this.name = "WeeklyModelResponseError"; }
}

function completeJsonObjects(value: string) {
  const ranges: Array<[number, number]> = []; let start = -1; let depth = 0; let quoted = false; let escaped = false;
  for (let index = 0; index < value.length; index += 1) { const character = value[index];
    if (quoted) { if (escaped) escaped = false; else if (character === "\\") escaped = true; else if (character === '"') quoted = false; continue; }
    if (character === '"') quoted = true;
    else if (character === "{") { if (depth === 0) start = index; depth += 1; }
    else if (character === "}" && depth > 0) { depth -= 1; if (depth === 0 && start >= 0) ranges.push([start, index + 1]); }
  }
  return ranges;
}

export function parseWeeklyModelResponse(content: string): { output: WeeklyModelOutput; parserStrategy: WeeklyModelParserStrategy; parseAttemptCount: number } {
  const trimmed = content.trim(); if (!trimmed) throw new WeeklyModelResponseError("weekly_response_empty");
  let candidate = trimmed; let parserStrategy: WeeklyModelParserStrategy = "direct_json";
  const fenced = trimmed.match(/^```(json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenced) { candidate = fenced[2].trim(); parserStrategy = fenced[1] ? "json_fence" : "plain_fence"; }
  else if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    const ranges = completeJsonObjects(trimmed); if (ranges.length !== 1) throw new WeeklyModelResponseError("weekly_response_parse_failed");
    const [start, end] = ranges[0]; const wrappers = trimmed.slice(0, start).trim() + trimmed.slice(end).trim();
    if (wrappers.length > 160 || /[{}]|```/.test(wrappers)) throw new WeeklyModelResponseError("weekly_response_parse_failed");
    candidate = trimmed.slice(start, end); parserStrategy = "single_object";
  }
  try { return { output: JSON.parse(candidate) as WeeklyModelOutput, parserStrategy, parseAttemptCount: 1 }; }
  catch { throw new WeeklyModelResponseError("weekly_response_parse_failed"); }
}

export function extractWeeklyOpenRouterResponse(completion: { choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null } }> }) {
  const choice = completion.choices?.[0]; const finishReason = choice?.finish_reason ?? "unknown";
  if (finishReason === "length" || finishReason === "max_tokens") throw new WeeklyModelResponseError("weekly_response_truncated");
  const content = choice?.message?.content; if (typeof content !== "string" || !content.trim()) throw new WeeklyModelResponseError("weekly_response_empty");
  return { content, finishReason };
}
