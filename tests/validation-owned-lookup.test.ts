import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyOwnedLookup } from "../lib/validation/server/owned-lookup.ts";

test("owned lookup returns a matching owned row", () => {
  const row = { id: "owned-version" };
  assert.deepEqual(classifyOwnedLookup({ data: row, error: null }), {
    ok: true,
    data: row,
  });
});

test("owned lookup classifies a successful no-row result as not found", () => {
  assert.deepEqual(classifyOwnedLookup({ data: null, error: null }), {
    ok: false,
    failure: "not_found",
  });
});

test("owned lookup classifies query errors without leaking raw details", () => {
  const raw = "postgres secret detail at https://database.invalid";
  assert.deepEqual(
    classifyOwnedLookup({
      data: null,
      error: { code: "XX000", message: raw, details: "private SQL" },
    }),
    { ok: false, failure: "lookup_failed" },
  );

  const repository = readFileSync(
    new URL("../lib/validation/server/repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(repository, /503[\s\S]+validation_owned_lookup_failed/);
  assert.match(
    repository,
    /Validation is temporarily unavailable\. Please try again\./,
  );
  assert.doesNotMatch(
    repository,
    /postgres secret|database\.invalid|private SQL/,
  );
});
