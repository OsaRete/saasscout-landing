// TEST ONLY: compare sensitive synthetic evidence without assertion diff output.
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

export function assertBrowserEvidenceEqual(actual, expected) {
  assert.equal(
    isDeepStrictEqual(actual, expected),
    true,
    "Browser evidence invariant failed",
  );
}
