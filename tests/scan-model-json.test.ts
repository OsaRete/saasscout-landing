import assert from "node:assert/strict";
import test from "node:test";

import {
  ModelJsonError,
  parseStrictModelJson,
  publicModelOutputError,
} from "../lib/scan/model-json.ts";

test("accepts plain valid JSON", () => {
  assert.deepEqual(parseStrictModelJson('{"ok":true}'), { ok: true });
});

test("accepts one complete fenced JSON block", () => {
  assert.deepEqual(parseStrictModelJson('```json\n{"ok":true}\n```'), {
    ok: true,
  });
});

test("rejects surrounding prose", () => {
  assert.throws(
    () => parseStrictModelJson('Here you go {"ok":true}'),
    ModelJsonError,
  );
});

test("rejects multiple JSON blocks", () => {
  assert.throws(
    () => parseStrictModelJson("```json\n{}\n```\n```json\n{}\n```"),
    ModelJsonError,
  );
});

test("rejects malformed JSON", () => {
  assert.throws(() => parseStrictModelJson('{"ok":'), ModelJsonError);
});

test("rejects empty response", () => {
  assert.throws(() => parseStrictModelJson("   "), /empty/i);
});

test("public errors do not include raw model content", () => {
  const raw = "secret evidence and model payload";
  const body = publicModelOutputError("model_invalid_json");
  assert.equal(JSON.stringify(body).includes(raw), false);
  assert.equal(body.error, "model_invalid_json");
});
