import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";
import { buildB43Fixture, diagnosticFetch, protocolDiagnostic, requirePromotionResult, singleMutation, waitForMarker, waitForExit } from "../scripts/validation-b43-harness.ts";

const fixture = readFileSync("tests/sql/validation-b31.sql", "utf8");
const runner = readFileSync("scripts/validation-b43-db.ts", "utf8");

test("B4.3 positives have approved review; missing review remains an explicit separate negative", () => {
  const setup = buildB43Fixture(fixture);
  assert.match(fixture, /where i <> 4;/); // B3.1 negative remains unchanged.
  assert.doesNotMatch(setup, /where i <> 4;/);
  assert.match(setup, /where i <> 18;/);
  assert.equal(setup.match(/generate_series\(1,120\)/g)?.length, 5);
  assert.doesNotMatch(setup, /least\(i,14\)|create function/);
  assert.match(runner, /missing_review_negative_control: expected_23514_and_no_promotion/);
  for (const broken of [fixture.replace("where i <> 4;", "where i <> 5;"), fixture.replace("generate_series(1,14)", "generate_series(1,13)"), fixture.replace("create function public.b31_test_promote(", "changed boundary")]) {
    assert.throws(() => buildB43Fixture(broken), /fixture_/);
  }
});

test("promotion identity is validated from actual return, rejecting absent or partial identities", () => {
  const result = { promotionId: "10000000-0000-0000-0000-000000000099", problemObservationId: "f0000000-0000-0000-0000-000000000013", duplicate: false };
  assert.deepEqual(requirePromotionResult(result), result);
  for (const bad of [null, {}, { ...result, promotionId: "" }, { ...result, problemObservationId: "bad" }, { ...result, duplicate: "false" }]) {
    assert.throws(() => requirePromotionResult(bad), /promotion_result_malformed/);
  }
  assert.doesNotMatch(runner, /sharedId\(2\)|select id from public.validation_evidence_consumption_authority/);
  assert.match(runner, /select a.id from public.validation_evidence_consumption_authority/);
});

test("diagnostic fetch preserves response, records only validated status/code, and suppresses raw failures", async () => {
  const categories: string[] = [];
  for (const [status, code, expected] of [[400, "23514", "http:400;sqlstate:23514"], [403,"42501","http:403;sqlstate:42501"], [404,"PGRST202","http:404;postgrest:PGRST202"], [500,"PRIVATE_SENTINEL","http:500;protocol_error"]] as const) {
    const response = new Response(JSON.stringify({ code, message: "PRIVATE_SENTINEL", details: "PRIVATE_SENTINEL" }), { status });
    const request = diagnosticFetch((c) => categories.push(c), async () => response);
    assert.equal(await request("http://localhost"), response);
    assert.equal(categories.at(-1), expected);
    assert.equal((await response.json()).message, "PRIVATE_SENTINEL");
  }
  const transport = diagnosticFetch((c) => categories.push(c), async () => { throw new Error("PRIVATE_SENTINEL"); });
  await assert.rejects(transport("http://localhost"), /^Error: transport_exception$/);
  assert.equal(categories.at(-1), "transport_exception");
  assert.ok(categories.every((c) => !c.includes("PRIVATE_SENTINEL")));
  assert.equal(protocolDiagnostic("PRIVATE_SENTINEL", "PRIVATE_SENTINEL"), "http:unknown;protocol_error");
});

test("fault probes guard mutation reachability and restore exact proof transactions", () => {
  assert.match(singleMutation("update fixture set value=1"), /get diagnostics changed = row_count/);
  assert.match(singleMutation("update fixture set value=1"), /changed <> 1.*errcode='ZX002'/s);
  assert.doesNotMatch(runner.slice(runner.indexOf('phase = "missing authority')), /disable trigger all|restoreSnapshot/);
  assert.match(runner, /fault_transaction_not_restored/);
  const probe = runner.slice(runner.indexOf("function probeUnavailable"), runner.indexOf("async function verifyPostgrestExecutionBoundary"));
  assert.ok(probe.indexOf("${statement}") < probe.indexOf("select session_user"), "fixture failure must occur before the reader identity marker");
  assert.match(runner, /promoted.get\(2\)!\.problemObservationId/);
  assert.match(runner, /probeUnavailable\(singleMutation\(`perform public.validation_insert_classification/);
  assert.match(runner, /consistent_merged_canonical_not_complete/);
  assert.match(runner, /candidate_population_101_after_valid_100/);
  assert.match(runner, /<> 100/);
  assert.match(runner, /<> 101/);
  assert.doesNotMatch(runner, /candidateShared|candidateLedger|\.neq\("id", ""\)|\.update\(\{\}\)/);
});

test("backend markers tolerate chunk-split PIDs and completion listeners precede execution", async () => {
  const child = spawn("/bin/sh", ["-c", "printf PID:12; sleep 0.02; printf '34\\n'; sleep 0.02"]);
  const exit = waitForExit(child, 2000);
  assert.equal(await waitForMarker(child, "PID:", () => {}, 2000), "1234");
  assert.equal(await exit, 0);
});

test("clean early exit cannot satisfy a missing marker, and hung processes are bounded", async () => {
  const early = spawn("/bin/sh", ["-c", "exit 0"]);
  await assert.rejects(waitForMarker(early, "PID:", () => {}, 2000), /exited before marker/);
  const hung = spawn("/bin/sh", ["-c", "exec sleep 10"]);
  await assert.rejects(waitForExit(hung, 50), /concurrency_exit_timeout/);
});

test("source SQL assertions expose a fixed invariant category through SQLSTATE-only diagnostics", async () => {
  const { SOURCE_INVARIANTS, sourceInvariantDiagnostic } = await import("../scripts/validation-b43-harness.ts");
  const sql = readFileSync("tests/sql/validation-b43-source-transitions.sql", "utf8");
  for (const [code, label] of Object.entries(SOURCE_INVARIANTS)) {
    assert.match(sql, new RegExp(code));
    assert.equal(sourceInvariantDiagnostic(`sqlstate:${code}`), `sqlstate:${code};invariant:${label}`);
  }
  assert.equal(sourceInvariantDiagnostic("sqlstate:23514"), "sqlstate:23514");
  assert.equal(sourceInvariantDiagnostic("PRIVATE_SENTINEL"), "unclassified_sql_error");
});
