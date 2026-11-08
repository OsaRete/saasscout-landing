import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareF4Promotion } from "../scripts/validation-b43-f4-preparation.ts";
import { probeF4RlsReads, probeF4TypedRpcs, verifiedF4Clients } from "../scripts/validation-b43-f4-rpc.ts";
import type { PersistedPromotionRows } from "../lib/validation/promotion/read-repository.ts";

const fixture = (): PersistedPromotionRows => JSON.parse(readFileSync("tests/fixtures/b43-f4-preparation.json", "utf8"));
const observation = String(fixture().observations[0].id);

test("fresh preparation rebuilds terminal classification, polarity, group and fingerprint", () => {
  const rows = fixture();
  const first = prepareF4Promotion(rows, observation);
  assert.equal(first.disposition, "prepared");
  rows.classifications.push({ ...rows.classifications[0], id: "e0000000-0000-0000-0000-000000000201",
    supersedes_classification_id: rows.classifications[0].id, polarity: "contradicting" });
  const second = prepareF4Promotion(rows, observation);
  assert.equal(second.disposition, "prepared");
  if (first.disposition !== "prepared" || second.disposition !== "prepared") throw new Error("fixture");
  assert.notEqual(second.contract.classificationId, first.contract.classificationId);
  assert.equal(second.contract.polarity, "contradicting");
  assert.notEqual(second.groupKey, first.groupKey);
  assert.notEqual(second.fingerprint, first.fingerprint);
  assert.equal(second.fingerprint, createHash("sha256").update(JSON.stringify(second.contract)).digest("hex"));
  assert.deepEqual(Object.keys(second.contract), Object.keys(second.contract).sort());
});

test("withdrawal, AI successors, ambiguity and canonical loss defer fresh attempts", () => {
  for (const change of [
    (r: PersistedPromotionRows) => { r.participants[0].status = "withdrawn"; },
    (r: PersistedPromotionRows) => { r.classifications.push({ ...r.classifications[0], id: "next", supersedes_classification_id: r.classifications[0].id, classification_source: "ai_model_suggested", authority_status: "suggested" }); },
    (r: PersistedPromotionRows) => { r.classifications.push({ ...r.classifications[0], id: "ambiguous" }); },
    (r: PersistedPromotionRows) => { r.canonicalProblems[0].status = "deprecated"; },
  ]) {
    const rows = fixture(); change(rows);
    assert.deepEqual(prepareF4Promotion(rows, observation), { disposition: "qualification_deferred" });
  }
});

test("representative selection remains the production TypeScript decision", () => {
  const rows = fixture();
  rows.observations.push({ ...rows.observations[0], id: "preferred", observation_content: { content: "Synthetic specific human report", specificity: "commercial_behavior", statementKind: "direct_quote" } });
  rows.classifications.push({ ...rows.classifications[0], id: "preferred-classification", observation_id: "preferred" });
  assert.equal(prepareF4Promotion(rows, observation).disposition, "qualification_deferred");
  assert.equal(prepareF4Promotion(rows, "preferred").disposition, "prepared");
});

test("supporting, contradicting and mixed remain equally preparable", () => {
  for (const polarity of ["supporting", "contradicting", "mixed"]) {
    const rows = fixture(); rows.classifications[0].polarity = polarity;
    const prepared = prepareF4Promotion(rows, observation);
    assert.equal(prepared.disposition, "prepared");
    if (prepared.disposition === "prepared") assert.equal(prepared.contract.polarity, polarity);
  }
});

const secret = "synthetic-local-secret";
function token(role: string) {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}`;
  return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}
const status = { API_URL: "http://127.0.0.1:55431", JWT_SECRET: secret, SERVICE_ROLE_KEY: token("service_role"), ANON_KEY: token("anon") };
const ids = { owner: "10000000-0000-0000-0000-000000000001", subject: "30000000-0000-0000-0000-000000000201",
  experiment: "60000000-0000-0000-0000-000000000201", observation, canonical: "20000000-0000-0000-0000-000000000201",
  upstream: "e0000000-0000-0000-0000-000000000201", number: 201 };

function mockTransport(corrupt = false): typeof fetch {
  let links = 0, markets = 0;
  return async (input, init) => {
    const path = new URL(String(input)).pathname;
    const bearer = new Headers(init?.headers).get("Authorization")!.split(" ")[1];
    const claims = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString());
    const role = claims.role;
    const args = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    let data: unknown, code: string | undefined;
    if (path.endsWith("/validation_subjects") && role === "authenticated") data = claims.sub === ids.owner ? [{ id: ids.subject }] : [];
    else if (role !== "service_role" || path.endsWith("validation_b43_read_current_evidence")) code = "42501";
    else if (args.p_owner_id && args.p_owner_id !== ids.owner) code = "P0002";
    else if (path.endsWith("validation_create_participant")) data = { id: "new", experiment_id: null, identity_mode: "anonymous", pseudonymous_reference: null,
      status: "active", consent_mode: null, consent_purpose: null, consent_captured_at: null, created_at: "2026-01-01", ...(corrupt ? { owner_id: ids.owner } : {}) };
    else if (path.endsWith("validation_add_subject_link")) data = links++ ? null : { id: "link", subject_id: ids.subject, source_type: "scan", source_row_id: ids.upstream, source_version: null, link_role: "supporting_context", context_snapshot: {}, created_at: "2026-01-01" };
    else if (path.endsWith("knowledge_insert_problem_observations")) {
      if ((args.p_rows as unknown[]).length === 2) code = "23502";
      else data = markets++ ? [] : [{ observation_fingerprint: "f4-market-201" }];
    } else if (path.endsWith("validation_insert_classification")) code = "23514";
    else throw new Error("unexpected_mock_request");
    return new Response(JSON.stringify(code ? { code, message: "PRIVATE_SENTINEL" } : data), {
      status: code === "42501" ? 403 : code === "P0002" ? 404 : code ? 400 : 200, headers: { "Content-Type": "application/json" },
    });
  };
}

test("typed RPC decoding and denial controls run through mocked SDK envelopes", async () => {
  const result = await probeF4TypedRpcs(verifiedF4Clients(status, ids.owner, mockTransport()), ids);
  assert.deepEqual(result, { typed_rpc_decoding: true, owner_boundaries: true, browser_denials: true,
    reader_denials: true, expected_batch_failure: "23502" });
});

test("unexpected private projection fails rather than relaxing the server contract", async () => {
  await assert.rejects(probeF4TypedRpcs(verifiedF4Clients(status, ids.owner, mockTransport(true)), ids), /participant_projection/);
});

test("wrong destinations and wrong-role keys reject before HTTP", () => {
  let calls = 0;
  const request: typeof fetch = async () => { calls++; throw new Error("network_forbidden"); };
  for (const changed of [{ ...status, API_URL: "https://production.invalid" }, { ...status, SERVICE_ROLE_KEY: token("authenticated") }]) {
    assert.throws(() => verifiedF4Clients(changed, ids.owner, request));
  }
  assert.equal(calls, 0);
});

test("owner and foreign-owner JWT reads exercise distinct RLS response controls", async () => {
  const request = mockTransport();
  const owner = verifiedF4Clients(status, ids.owner, request);
  const foreign = verifiedF4Clients(status, "10000000-0000-0000-0000-999999999999", request);
  await probeF4RlsReads(owner.authenticated, foreign.authenticated, owner.anon, ids.subject);
});
