import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { readTrustedQualifiedValidationEvidence } from "../lib/validation/promotion/trusted-qualified-evidence-reader.ts";

type Row = Record<string, unknown>;
const canonicalId = "11111111-1111-4111-8111-111111111111";
const otherId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const resultId = "44444444-4444-4444-8444-444444444444";
const privateMarker = "PRIVATE_LINEAGE_MUST_NOT_ESCAPE";

function fixture(value: "supporting" | "contradicting" | "mixed" = "supporting") {
  const contract = {
    observationId: "33333333-3333-4333-8333-333333333333",
    classificationId: "22222222-2222-4222-8222-222222222222",
    canonicalProblemId: canonicalId,
    polarity: value,
    policyVersion: "v8-b1.2",
    resolverVersion: "v8-b3.0.2-exact.1",
    projectionVersion: "v8-b3.1-projection.1",
  };
  // Fixture uses B3.1's sorted-key serialization, independent of reader order.
  const fingerprint = createHash("sha256").update(JSON.stringify(
    Object.fromEntries(Object.entries(contract).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
  )).digest("hex");
  return {
    observation_id: contract.observationId,
    classification_id: contract.classificationId,
    participant_id: "55555555-5555-4555-8555-555555555555",
    independence_private_id: "55555555-5555-4555-8555-555555555555",
    independence_kind: "participant",
    representative_group_key: `participant:55555555-5555-4555-8555-555555555555|${canonicalId}|${value}`,
    policy_version: contract.policyVersion,
    resolver_version: contract.resolverVersion,
    projection_version: contract.projectionVersion,
    polarity: value,
    eligible: true,
    eligibility_reasons: ["eligible"],
    representative_selected: true,
    resolution_status: "resolved",
    resolution_reason: "server_exact_authority_snapshot",
    canonical_problem_id: canonicalId,
    problem_observation_id: resultId,
    promotion_fingerprint: fingerprint,
    supersedes_promotion_id: null,
    deactivation_reason: null,
    shared: {
      id: resultId,
      canonical_problem_id: canonicalId,
      problem_title: "Persisted canonical display title",
      source_evidence: "Approved shareable statement",
      source_type: "customer_interview_human_reviewed",
      evidence_polarity: value,
      observed_at: "2026-09-26T12:30:00.123456+00:00",
      observation_fingerprint: `validation-promotion:${fingerprint}`,
      metadata: { projectionVersion: contract.projectionVersion },
    },
  };
}

function databaseResponse(data: unknown, options: { status?: number; throws?: boolean; count?: number; omitCount?: boolean } = {}) {
  const requests: { url: URL; method: string; body: unknown; prefer: string | null }[] = [];
  const db = createClient("https://mock-database.invalid", "mock-service-role", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        requests.push({ url: new URL(String(input)), method: init?.method ?? "GET", body: init?.body,
          prefer: new Headers(init?.headers).get("prefer") });
        if (options.throws) throw new Error(privateMarker);
        return new Response(JSON.stringify(data), {
          status: options.status ?? 200,
          headers: { "Content-Type": "application/json",
            ...(!options.omitCount && Array.isArray(data) ? { "Content-Range": `*/${options.count ?? data.length}` } : {}),
          },
        });
      },
    },
  });
  return { db, requests };
}

test("valid persisted B3.1 linkage returns only the sanitized allowlist", async () => {
  const row = fixture();
  assert.equal(row.promotion_fingerprint, "5fc08cc960f917a79e1cab31e916daa4b641fba668fcb571f543afd90330097f");
  const { db } = databaseResponse([row]);
  const { observations: evidence } = await readTrustedQualifiedValidationEvidence(canonicalId, db);
  assert.deepEqual(evidence, [{
    id: resultId,
    canonical_problem_id: canonicalId,
    problem_title: row.shared.problem_title,
    source_evidence: row.shared.source_evidence,
    source_type: "customer_interview_human_reviewed",
    evidence_polarity: "supporting",
    observed_at: row.shared.observed_at,
    projection_version: "v8-b3.1-projection.1",
  }]);
  assert.ok(Object.isFrozen(evidence));
  assert.ok(Object.isFrozen(evidence[0]));
});

for (const value of ["supporting", "contradicting", "mixed"] as const) {
  test(`preserves ${value} without classification or weights`, async () => {
    const { db } = databaseResponse([fixture(value)]);
    const { observations: evidence } = await readTrustedQualifiedValidationEvidence(canonicalId, db);
    assert.equal(evidence[0]?.evidence_polarity, value);
    assert.equal("score" in evidence[0], false);
  });
}

const rejectedProofs: [string, (row: Row) => void][] = [
  ["source_type impersonation with no ledger", (row) => {
    const shared = row.shared;
    for (const key of Object.keys(row)) delete row[key];
    Object.assign(row, shared);
  }],
  ["prefix and projection metadata impersonation without authority", (row) => {
    const shared = row.shared;
    for (const key of Object.keys(row)) delete row[key];
    row.shared = shared;
  }],
  ["missing final result", (row) => { row.problem_observation_id = null; }],
  ["missing joined shared row", (row) => { row.shared = null; }],
  ["ambiguous joined relationship array", (row) => { row.shared = [row.shared]; }],
  ["result observation mismatch", (row) => { (row.shared as Row).id = otherId; }],
  ["ledger canonical mismatch", (row) => { row.canonical_problem_id = otherId; }],
  ["shared canonical mismatch", (row) => { (row.shared as Row).canonical_problem_id = otherId; }],
  ["polarity mismatch", (row) => { (row.shared as Row).evidence_polarity = "mixed"; }],
  ["ledger fingerprint mismatch", (row) => { row.promotion_fingerprint = "0".repeat(64); }],
  ["shared fingerprint mismatch despite valid prefix", (row) => { (row.shared as Row).observation_fingerprint = `validation-promotion:${"0".repeat(64)}`; }],
  ["fingerprint binds classification", (row) => { row.classification_id = otherId; }],
  ["fingerprint binds private source observation", (row) => { row.observation_id = otherId; }],
  ["missing classification authority", (row) => { row.classification_id = null; }],
  ["unsupported policy", (row) => { row.policy_version = "future"; }],
  ["unsupported resolver", (row) => { row.resolver_version = "future"; }],
  ["unsupported projection", (row) => { row.projection_version = "future"; }],
  ["unsupported shared projection metadata", (row) => { (row.shared as Row).metadata = { projectionVersion: "future" }; }],
  ["missing projection metadata", (row) => { (row.shared as Row).metadata = null; }],
  ["ineligible", (row) => { row.eligible = false; }],
  ["nonrepresentative", (row) => { row.representative_selected = false; }],
  ["unresolved", (row) => { row.resolution_status = "unmatched"; }],
  ["unsupported qualification authority", (row) => { row.resolution_reason = "client_claimed"; }],
  ["malformed eligibility", (row) => { row.eligible = "true"; }],
  ["incomplete eligibility proof", (row) => { row.eligibility_reasons = []; }],
  ["conflicting eligibility proof", (row) => { row.eligibility_reasons = ["eligible", "unqualified"]; }],
  ["malformed representative group", (row) => { row.representative_group_key = "anything"; }],
  ["independence identity mismatch", (row) => { row.independence_private_id = otherId; }],
  ["unsupported independence authority", (row) => { row.independence_kind = "survey_submission"; }],
  ["unsupported correction", (row) => { row.supersedes_promotion_id = otherId; }],
  ["deactivation", (row) => { row.deactivation_reason = "withdrawn"; }],
  ["missing final contract field", (row) => { delete row.deactivation_reason; }],
  ["legacy source", (row) => { (row.shared as Row).source_type = "reddit"; }],
  ["null shared polarity", (row) => { (row.shared as Row).evidence_polarity = null; }],
  ["null ledger polarity", (row) => { row.polarity = null; }],
  ["neutral ledger polarity", (row) => { row.polarity = "neutral"; }],
  ["missing approved statement", (row) => { (row.shared as Row).source_evidence = null; }],
  ["empty statement", (row) => { (row.shared as Row).source_evidence = " "; }],
  ["oversized statement", (row) => { (row.shared as Row).source_evidence = "x".repeat(501); }],
  ["missing canonical display title", (row) => { (row.shared as Row).problem_title = ""; }],
  ["malformed authoritative time", (row) => { (row.shared as Row).observed_at = "infinity"; }],
  ["impossible authoritative date", (row) => { (row.shared as Row).observed_at = "2026-02-30T00:00:00Z"; }],
  ["timestamp without timezone", (row) => { (row.shared as Row).observed_at = "2026-09-26T12:00:00"; }],
];

for (const [name, mutate] of rejectedProofs) {
  test(`rejects ${name} even if database filters are bypassed in the mock`, async () => {
    const row: Row = fixture();
    mutate(row);
    const { db } = databaseResponse([row]);
    assert.deepEqual(await readTrustedQualifiedValidationEvidence(canonicalId, db), { observations: [], complete: true });
  });
}

test("zero ledger candidates and malformed candidate rows fabricate no evidence", async () => {
  for (const rows of [[], [null, {}, "malformed"], [fixture(), null]]) {
    const { db } = databaseResponse(rows);
    const { observations: evidence } = await readTrustedQualifiedValidationEvidence(canonicalId, db);
    assert.equal(evidence.length, rows.length === 2 ? 1 : 0);
  }
});

test("select is bounded, canonical-scoped, explicit composite-FK embedding; no writes or downstream calls", async () => {
  const { db, requests } = databaseResponse([fixture()]);
  await readTrustedQualifiedValidationEvidence(canonicalId, db);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.method, "GET");
  assert.equal(request.body, undefined);
  assert.equal(request.prefer, "count=exact");
  assert.equal(request.url.pathname, "/rest/v1/validation_evidence_promotions");
  assert.equal(request.url.searchParams.get("canonical_problem_id"), `eq.${canonicalId}`);
  assert.equal(request.url.searchParams.get("eligible"), "eq.true");
  assert.equal(request.url.searchParams.get("representative_selected"), "eq.true");
  assert.equal(request.url.searchParams.get("resolution_status"), "eq.resolved");
  assert.equal(request.url.searchParams.get("policy_version"), "eq.v8-b1.2");
  assert.equal(request.url.searchParams.get("resolver_version"), "eq.v8-b3.0.2-exact.1");
  assert.equal(request.url.searchParams.get("projection_version"), "eq.v8-b3.1-projection.1");
  assert.equal(request.url.searchParams.get("problem_observation_id"), "not.is.null");
  assert.equal(request.url.searchParams.get("limit"), "100");
  assert.equal(request.url.searchParams.get("order"), "problem_observation_id.asc");
  const select = request.url.searchParams.get("select")!;
  assert.equal(select, [
    "observation_id,classification_id,participant_id",
    "policy_version,eligible,eligibility_reasons",
    "independence_kind,independence_private_id,polarity",
    "representative_group_key,representative_selected",
    "canonical_problem_id,resolution_status,resolution_reason,resolver_version",
    "problem_observation_id,promotion_fingerprint,projection_version",
    "supersedes_promotion_id,deactivation_reason",
    "shared:problem_observations!validation_promotions_result_canonical_fk!inner(id,canonical_problem_id,problem_title,source_evidence,source_type,evidence_polarity,observed_at,observation_fingerprint,metadata)",
  ].join(","));
  assert.equal(select.includes("*"), false);
});

test("extra private fields in mocked joined rows cannot leak through objects, logs or errors", async (t) => {
  const logs: unknown[][] = [];
  for (const method of ["log", "warn", "error", "info", "debug"] as const) {
    t.mock.method(console, method, (...args: unknown[]) => { logs.push(args); });
  }
  const row = fixture();
  const privateFields = Object.fromEntries([
    "owner_id", "participant_id", "session_id", "interview_session_id", "experiment_id",
    "hypothesis_id", "classification_id", "source_observation_id", "command_id",
    "private_notes", "raw_interview_text", "review_metadata", "ai_drafts", "ledger_id",
  ].map((key) => [key, privateMarker]));
  Object.assign(row, { id: privateMarker, private_notes: privateMarker, owner_id: privateMarker });
  Object.assign(row.shared, privateFields);
  Object.assign(row.shared.metadata, privateFields);
  const { db } = databaseResponse([row]);
  const { observations: evidence } = await readTrustedQualifiedValidationEvidence(canonicalId, db);
  assert.equal(evidence.length, 1);
  assert.equal(JSON.stringify(evidence).includes(privateMarker), false);
  assert.equal(JSON.stringify(evidence).includes(row.observation_id), false);
  assert.equal(JSON.stringify(evidence).includes(row.classification_id), false);
  assert.equal(JSON.stringify(evidence).includes(row.participant_id), false);
  assert.deepEqual(Object.keys(evidence[0]).sort(), [
    "id", "canonical_problem_id", "problem_title", "source_evidence", "source_type",
    "evidence_polarity", "observed_at", "projection_version",
  ].sort());
  const failed = databaseResponse({ message: privateMarker, details: privateFields }, { status: 400 });
  await assert.rejects(readTrustedQualifiedValidationEvidence(canonicalId, failed.db), (error: Error) => {
    assert.equal(error.message, "trusted_qualified_evidence_read_failed");
    assert.equal("cause" in error, false);
    assert.equal(JSON.stringify(error).includes(privateMarker), false);
    assert.equal(String(error).includes(privateMarker), false);
    return true;
  });
  assert.deepEqual(logs, []);
});

test("transport failures and malformed response envelopes fail closed with generic errors", async () => {
  for (const [data, options] of [
    [null, {}], [{ shared: fixture().shared }, {}],
    [{ message: privateMarker, code: "PGRST201" }, { status: 300 }],
    [[], { throws: true }],
    [Array.from({ length: 101 }, () => fixture()), {}],
    [[fixture(), fixture()], {}],
  ] as const) {
    const { db } = databaseResponse(data, options);
    await assert.rejects(readTrustedQualifiedValidationEvidence(canonicalId, db), {
      message: "trusted_qualified_evidence_read_failed",
    });
  }
});

test("invalid canonical ID is rejected before any database request", async () => {
  const { db, requests } = databaseResponse([]);
  await assert.rejects(readTrustedQualifiedValidationEvidence(privateMarker, db), {
    message: "trusted_qualified_evidence_invalid_canonical_id",
  });
  assert.deepEqual(requests, []);
});

test("exact candidate count exposes incomplete results before qualification filtering", async () => {
  const malformed = { ...fixture(), promotion_fingerprint: "0".repeat(64) };
  const { db } = databaseResponse(Array.from({ length: 100 }, () => malformed), { count: 101 });
  assert.deepEqual(await readTrustedQualifiedValidationEvidence(canonicalId, db), {
    observations: [], complete: false,
  });
  const full = databaseResponse([fixture()], { count: 1 });
  assert.equal((await readTrustedQualifiedValidationEvidence(canonicalId, full.db)).complete, true);
  const serverTruncated = databaseResponse([fixture()], { count: 100 });
  assert.equal((await readTrustedQualifiedValidationEvidence(canonicalId, serverTruncated.db)).complete, false);
});

test("missing or inconsistent exact candidate counts fail closed", async () => {
  for (const options of [{ omitCount: true }, { count: 0 }]) {
    const { db } = databaseResponse([fixture()], options);
    await assert.rejects(readTrustedQualifiedValidationEvidence(canonicalId, db), {
      message: "trusted_qualified_evidence_read_failed",
    });
  }
});

test("browser-condition import executes the existing server-only guard", () => {
  // Execute actual module import under browser/default package conditions.
  // This tests the guard; the full build separately checks ordinary Next use.
  const loader = `export async function resolve(s,c,n) {
    return n(s, s === 'server-only' ? {...c, conditions:['browser','default']} : c);
  }`;
  const result = spawnSync(process.execPath, [
    "--loader", `data:text/javascript,${encodeURIComponent(loader)}`,
    "--input-type=module", "-e",
    `import ${JSON.stringify(new URL("../lib/validation/promotion/trusted-qualified-evidence-reader.ts", import.meta.url).href)}`,
  ], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /server-only modules must not be imported from browser or Client Component code/);
});
