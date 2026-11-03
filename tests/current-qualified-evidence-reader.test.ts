import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { readCurrentQualifiedValidationEvidence } from "../lib/validation/promotion/current-qualified-evidence-reader.ts";
import { classifyPostgrestDenial } from "../scripts/validation-b43-isolation.ts";

const canonical = "11111111-1111-4111-8111-111111111111";
const privateMarker = "PRIVATE_B43_MARKER";
const migrationPath = "supabase/migrations/20261030000000_b43_current_evidence_authority.sql";
const migration = readFileSync(migrationPath, "utf8");
const databaseRunner = readFileSync("scripts/validation-b43-db.ts", "utf8");

test("denial classifier handles real SDK error envelopes without accepting success or broken responses", async () => {
  const cases = [
    { status: 403, body: { code: "42501", message: privateMarker, details: null, hint: null }, expected: "expected_denial" },
    { status: 401, body: { code: "42501", message: privateMarker }, expected: "expected_denial" },
    { status: 200, body: { complete: true, observations: [] }, expected: "unexpected_success" },
    { status: 500, body: { code: "XX000", message: privateMarker }, expected: "unexpected_sqlstate:XX000" },
    { status: 403, body: { code: "42501" }, expected: "malformed_response" },
  ];
  for (const fixture of cases) {
    const client = createClient("http://127.0.0.1:55431", "synthetic-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => new Response(JSON.stringify(fixture.body), { status: fixture.status }) },
    });
    const response = await client.rpc("validation_b43_read_current_evidence", { p_canonical_problem_id: canonical });
    const diagnostic = classifyPostgrestDenial(response);
    assert.equal(diagnostic, fixture.expected);
    assert.ok(!diagnostic.includes(privateMarker));
  }
  const client = createClient("http://127.0.0.1:55431", "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => { throw new Error(privateMarker); } },
  });
  assert.equal(classifyPostgrestDenial(await client.rpc("validation_b43_read_current_evidence")), "transport_error");
});

function mockRpc(data: unknown, fail = false) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const db = createClient("https://mock-b43.invalid", "mock-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests.push({ url: new URL(String(input)), method: init?.method ?? "GET", body: init?.body });
      if (fail) throw new Error(privateMarker);
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { db, requests };
}

test("current reader calls only the fixed-purpose RPC with the canonical UUID", async () => {
  const { db, requests } = mockRpc({ observations: [], complete: true });
  const result = await readCurrentQualifiedValidationEvidence(canonical, db);
  assert.deepEqual(result, { observations: [], complete: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url.pathname, "/rest/v1/rpc/validation_b43_read_current_evidence");
  assert.deepEqual(JSON.parse(String(requests[0].body)), { p_canonical_problem_id: canonical });
});

test("sanitized output preserves all three polarities and is immutable", async () => {
  const rows = (["supporting", "contradicting", "mixed"] as const).map((polarity, index) => ({
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
    canonical_problem_id: canonical,
    problem_title: "Persisted title",
    source_evidence: `Statement ${index + 1}`,
    source_type: "customer_interview_human_reviewed",
    evidence_polarity: polarity,
    observed_at: "2026-10-30T10:00:00.000Z",
    projection_version: "v8-b3.1-projection.1",
  }));
  const { db } = mockRpc({ observations: rows, complete: true });
  const result = await readCurrentQualifiedValidationEvidence(canonical, db);
  assert.deepEqual(result.observations.map((row) => row.evidence_polarity), ["supporting", "contradicting", "mixed"]);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.observations) && Object.isFrozen(result.observations[0]));
  assert.deepEqual(Object.keys(result.observations[0]).sort(), Object.keys(rows[0]).sort());
});

test("malformed, incomplete, oversized, or private RPC responses fail generically", async () => {
  const extra = { id: "22222222-2222-4222-8222-000000000001", canonical_problem_id: canonical,
    problem_title: "Title", source_evidence: "Statement", source_type: "customer_interview_human_reviewed",
    evidence_polarity: "supporting", observed_at: "2026-10-30T10:00:00.000Z",
    projection_version: "v8-b3.1-projection.1", participant_id: privateMarker };
  for (const response of [null, [], { complete: false, observations: [] }, { complete: true, observations: [extra] }]) {
    const { db } = mockRpc(response);
    await assert.rejects(readCurrentQualifiedValidationEvidence(canonical, db), {
      message: "current_qualified_evidence_read_failed",
    });
  }
  const { db } = mockRpc(null, true);
  await assert.rejects(readCurrentQualifiedValidationEvidence(canonical, db), (error: Error) => {
    assert.equal(error.message, "current_qualified_evidence_read_failed");
    assert.equal("cause" in error, false);
    assert.equal(error.message.includes(privateMarker), false);
    return true;
  });
});

test("invalid canonical IDs fail before a database call", async () => {
  const { db, requests } = mockRpc({ observations: [], complete: true });
  await assert.rejects(readCurrentQualifiedValidationEvidence(privateMarker, db), {
    message: "current_qualified_evidence_invalid_canonical_id",
  });
  assert.equal(requests.length, 0);
});

test("migration makes authority withheld-only, immutable, private, and new-row-only", () => {
  assert.match(migration, /current_user <> 'postgres'/i);
  assert.match(migration, /rolbypassrls/i);
  assert.doesNotMatch(migration, /rolsuper|set local role postgres|create role saasscout_b43|alter function public\.validation_b43_[^\n]+ owner to/i);
  assert.match(migration, /SECURITY DEFINER code therefore runs with BYPASSRLS/i);
  assert.doesNotMatch(migration, /grant execute on function public\.validation_b43_read_current_evidence/i);
  assert.match(migration, /revoke all on function public\.validation_b43_read_current_evidence\(uuid\) from public,anon,authenticated,service_role,authenticator/i);
  assert.match(migration, /authority_state text not null check \(authority_state='withheld'\)/);
  assert.match(migration, /after insert on public\.validation_evidence_promotions[\s\S]+when \(new\.problem_observation_id is not null\)/i);
  assert.match(migration, /validation_b43_authority_immutable before update or delete/i);
  assert.match(migration, /enable row level security[\s\S]+force row level security/i);
  assert.match(migration, /revoke all on public\.validation_evidence_consumption_authority[\s\S]+from public,anon,authenticated,service_role,authenticator/i);
  const issueWithheld = migration.slice(migration.indexOf("create function public.validation_b43_capture_new_promotion_authority"),
    migration.indexOf("create function public.validation_b43_insert_restriction"));
  assert.match(issueWithheld, /'withheld'/i);
  assert.doesNotMatch(issueWithheld, /'active'/i);
  assert.doesNotMatch(migration, /update public\.validation_evidence_consumption_authority/i);
});

test("migration uses only the postgres principal and provisions no roles or memberships", () => {
  assert.doesNotMatch(migration, /create role|grant\s+\w+\s+to\s+\w+|alter function public\.validation_b43_[^\n]+ owner to/i);
  assert.equal((migration.match(/revoke all on function public\.validation_b43_/gi) ?? []).length, 11);
  assert.match(databaseRunner, /session_user\|\|'\|'\|\|current_user/i);
  assert.match(databaseRunner, /rolbypassrls/i);
  assert.match(databaseRunner, /sql\(buildRoleBoundaryQuery\(roles, owners\)\) === "t"/);
  assert.match(databaseRunner, /p\.proowner='postgres'::regrole/i);
  assert.match(databaseRunner, /not has_function_privilege\('service_role',p\.oid/i);
  assert.match(databaseRunner, /not has_function_privilege\('anon',p\.oid/i);
  assert.match(databaseRunner, /not has_function_privilege\('authenticated',p\.oid/i);
  assert.match(databaseRunner, /not has_function_privilege\('authenticator',p\.oid/i);
});

test("migration records permanent restrictions for approved source transitions", () => {
  for (const reason of ["participant_withdrawn", "participant_archived", "consent_metadata_changed", "session_cancelled",
    "session_relevance_lost", "experiment_cancelled", "classification_superseded", "canonical_deactivated", "canonical_merged"]) {
    assert.ok(migration.includes(`'${reason}'`), `missing reason ${reason}`);
  }
  assert.match(migration, /on public\.validation_evidence_observations[\s\S]+after insert/i);
  assert.match(migration, /participant_relevance='target_segment_match'[\s\S]+session_relevance_lost/);
  assert.match(migration, /new\.lifecycle='cancelled'[\s\S]+experiment_cancelled/);
  assert.doesNotMatch(migration, /new\.lifecycle='completed'[\s\S]{0,100}experiment_cancelled/);
  assert.match(migration, /new\.supersedes_classification_id[\s\S]+classification_superseded/);
  assert.match(migration, /validation_b43_restrictions_immutable before update or delete/i);
});

test("current SQL boundary is stable, bounded, generic, and does not expose restriction details", () => {
  assert.match(migration, /validation_b43_read_current_evidence\(p_canonical_problem_id uuid\)[\s\S]+language plpgsql stable security definer/i);
  assert.match(migration, /candidate_count>100[\s\S]+raise exception 'unavailable'/);
  assert.match(migration, /authority\.authority_state is distinct from 'withheld'/);
  assert.match(migration, /exception when others then[\s\S]+raise exception 'current evidence unavailable'/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create function public.validation_b43_read_current_evidence")), /'reason_code'\s*,|'participant_id'\s*,|'owner_id'\s*,/i);
});
