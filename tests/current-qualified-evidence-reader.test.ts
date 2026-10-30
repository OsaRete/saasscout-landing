import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { readCurrentQualifiedValidationEvidence } from "../lib/validation/promotion/current-qualified-evidence-reader.ts";

const canonical = "11111111-1111-4111-8111-111111111111";
const privateMarker = "PRIVATE_B43_MARKER";
const migrationPath = "supabase/migrations/20261030000000_b43_current_evidence_authority.sql";
const migration = readFileSync(migrationPath, "utf8");

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
  assert.match(migration, /authority_state text not null check \(authority_state='withheld'\)/);
  assert.match(migration, /after insert on public\.validation_evidence_promotions[\s\S]+when \(new\.problem_observation_id is not null\)/i);
  assert.match(migration, /validation_b43_authority_immutable before update or delete/i);
  assert.match(migration, /enable row level security[\s\S]+force row level security/i);
  assert.match(migration, /revoke all on public\.validation_evidence_consumption_authority[\s\S]+from public,anon,authenticated,service_role/i);
  const issueWithheld = migration.slice(migration.indexOf("create function public.validation_b43_capture_new_promotion_authority"),
    migration.indexOf("create function public.validation_b43_insert_restriction"));
  assert.match(issueWithheld, /'withheld'/i);
  assert.doesNotMatch(issueWithheld, /'active'/i);
  assert.doesNotMatch(migration, /update public\.validation_evidence_consumption_authority/i);
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
