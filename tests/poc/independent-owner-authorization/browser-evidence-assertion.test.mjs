import assert from "node:assert/strict";
import test from "node:test";
import { inspect } from "node:util";
import { assertBrowserEvidenceEqual } from "./browser-evidence-assertion.mjs";

test("browser evidence equality preserves strict comparisons and redacts failure payloads", () => {
  assertBrowserEvidenceEqual(
    { bytes: Buffer.from([1]), value: "same" },
    {
      bytes: Buffer.from([1]),
      value: "same",
    },
  );
  for (const [actual, expected] of [
    [
      { evidence: "synthetic-actual-sentinel" },
      { evidence: "synthetic-expected-sentinel" },
    ],
    ["synthetic-actual-sentinel", "synthetic-expected-sentinel"],
    [{ value: 1 }, { value: "1" }],
    [Buffer.from([1]), Buffer.from([2])],
  ]) {
    assert.throws(
      () => assertBrowserEvidenceEqual(actual, expected),
      (error) => {
        assert.equal(error.actual, false);
        assert.equal(error.expected, true);
        assert.equal(
          error.message.includes("Browser evidence invariant failed"),
          true,
        );
        assert.equal(
          /synthetic-(actual|expected)-sentinel/.test(inspect(error)),
          false,
        );
        return true;
      },
    );
  }
});
