import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { promoteCustomerInterviewEvidence } from "../lib/validation/promotion/promotion-service.ts";
import { readTrustedQualifiedValidationEvidence } from "../lib/validation/promotion/trusted-qualified-evidence-reader.ts";

// This runner refuses arbitrary URLs/credentials. It only discovers credentials
// from the disposable Supabase CLI instance created by the dedicated CI job.
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const apiUrl = "http://127.0.0.1:54321";
const owner = "10000000-0000-0000-0000-000000000001";
const canonical = "20000000-0000-0000-0000-000000000001";
const otherCanonical = "20000000-0000-0000-0000-000000000002";
const uuid = (prefix: string, i: number) => `${prefix}0000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const source = (i: number) => uuid("b", i);
const participant = (i: number) => uuid("9", i);
const classification = (i: number) => uuid("c", i);
const sharedId = (i: number) => uuid("d", i);
let phase = "disposable prerequisites";

function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function sql(statement: string, label: string): string {
  const result = spawnSync("psql", [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
    input: `set statement_timeout='10s';\n${statement}`,
    encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024,
  });
  // Never forward SQL, private row values, connection errors or credentials.
  check(result.status === 0, `${label}: SQL failed`);
  return result.stdout.split(/\r?\n/).filter((line) => line && line !== "SET").join("\n");
}

function fingerprint(i: number, polarity = "supporting", policy = "v8-b1.2", resolver = "v8-b3.0.2-exact.1", projection = "v8-b3.1-projection.1") {
  return createHash("sha256").update(JSON.stringify({
    canonicalProblemId: canonical,
    classificationId: classification(i),
    observationId: source(i),
    polarity,
    policyVersion: policy,
    projectionVersion: projection,
    resolverVersion: resolver,
  })).digest("hex");
}

async function run() {
  check(process.env.VALIDATION_B41_DISPOSABLE === "1", "explicit disposable test opt-in required; no skip");
  const statusResult = spawnSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024,
  });
  check(statusResult.status === 0, "disposable Supabase status unavailable");
  const status = JSON.parse(statusResult.stdout) as Record<string, string>;
  check(status.API_URL === apiUrl && status.DB_URL === databaseUrl, "only fixed local disposable endpoints allowed");
  check(status.SERVICE_ROLE_KEY && status.ANON_KEY && status.JWT_SECRET, "local role credentials unavailable");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(apiUrl, status.SERVICE_ROLE_KEY, options);
  const anonymous = createClient(apiUrl, status.ANON_KEY, options);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const tokenInput = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role: "authenticated", sub: owner, aud: "authenticated", iss: "supabase",
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
  })}`;
  const token = `${tokenInput}.${createHmac("sha256", status.JWT_SECRET).update(tokenInput).digest("base64url")}`;
  const authenticated = createClient(apiUrl, status.ANON_KEY, {
    ...options, global: { headers: { Authorization: `Bearer ${token}` } },
  });

  phase = "fixture isolation";
  check(sql("select count(*) from public.validation_evidence_promotions;", phase) === "0", "fresh db reset required");
  // Reuse B3.1's real relational fixture, extending only the isolated test data.
  // Do not create its PUBLIC test helper RPC: genuine positives use the actual
  // TypeScript preparation/service and existing atomic B3.1 promotion RPC.
  const fixture = readFileSync(new URL("../tests/sql/validation-b31.sql", import.meta.url), "utf8");
  check(fixture.split("create function public.b31_test_promote(").length === 2, "B3.1 fixture helper boundary changed");
  const setup = fixture.split("create function public.b31_test_promote(")[0]
    .replaceAll("generate_series(1,14)", "generate_series(1,120)")
    .replaceAll("generate_series(1,15)", "generate_series(1,120)")
    .replaceAll("least(i,14)", "i");
  const rpcCatalog = sql("select md5(string_agg(oid::text, ',' order by oid)) from pg_proc where pronamespace='public'::regnamespace;", phase);
  sql(`begin;${setup}\ncommit;`, phase);

  phase = "genuine B3.1 promotions and composite embedding";
  for (const i of [1, 2, 3]) {
    try {
      await promoteCustomerInterviewEvidence(owner, source(i), admin);
    } catch {
      throw new Error("actual B3.1 service promotion failed");
    }
  }
  const positive = await readTrustedQualifiedValidationEvidence(canonical, admin);
  check(positive.complete && positive.observations.length === 3, "real composite embed did not return three promotions");
  check(["supporting", "contradicting", "mixed"].every((pol) => positive.observations.some((row) => row.evidence_polarity === pol)), "polarity lost");
  check(positive.observations.every((row) => row.canonical_problem_id === canonical && row.problem_title === "Slow reports"), "exact canonical identity/title lost");
  check(positive.observations.every((row) => /^Approved statement [123]$/.test(row.source_evidence)), "approved shareable statement lost");
  check(positive.observations.every((row) => Object.keys(row).sort().join(",") === [
    "id", "canonical_problem_id", "problem_title", "source_evidence", "source_type",
    "evidence_polarity", "observed_at", "projection_version",
  ].sort().join(",")), "private output field present");
  const serialized = JSON.stringify(positive);
  check(!serialized.includes(owner) && !serialized.includes("PRIVATE RAW"), "private source leaked");
  for (const i of [1, 2, 3]) {
    check(![source(i), participant(i), classification(i), uuid("a", i)].some((id) => serialized.includes(id)), "private identity leaked");
  }
  console.log("PASS real service promotion, composite embedding, polarity and sanitized output");

  phase = "real privileges, RLS and RPC exposure";
  check(sql(`select bool_and(relrowsecurity) from pg_class where oid in
    ('public.problem_observations'::regclass,'public.validation_evidence_promotions'::regclass);`, phase) === "t", "RLS absent");
  check(sql(`select has_table_privilege('service_role','public.validation_evidence_promotions','SELECT')
    and has_table_privilege('service_role','public.problem_observations','SELECT')
    and not has_table_privilege('anon','public.validation_evidence_promotions','SELECT')
    and not has_table_privilege('authenticated','public.validation_evidence_promotions','SELECT')
    and not has_table_privilege('anon','public.problem_observations','SELECT')
    and not has_table_privilege('authenticated','public.problem_observations','SELECT')
    and not has_table_privilege('anon','public.problem_observations','UPDATE')
    and not has_table_privilege('authenticated','public.problem_observations','UPDATE');`, phase) === "t", "unexpected table grants");
  check(sql(`select count(*) > 0 and bool_and(
    not has_function_privilege('anon',oid,'EXECUTE') and
    not has_function_privilege('authenticated',oid,'EXECUTE')) from pg_proc
    where pronamespace='public'::regnamespace and
    (proname like 'validation_b31_%' or proname='validation_promote_customer_interview_evidence');`, phase) === "t", "public promotion RPC privilege");
  check(sql(`select bool_and(prosecdef and proowner='postgres'::regrole and
    'search_path=public, extensions'=any(proconfig)) from pg_proc
    where pronamespace='public'::regnamespace and proname='validation_promote_customer_interview_evidence';`, phase) === "t", "unexpected existing promotion owner/search_path");
  for (const client of [anonymous, authenticated]) {
    const access = await client.from("validation_evidence_promotions").select("problem_observation_id");
    check(access.error?.code === "42501", "browser role could read ledger or token was invalid");
    const sharedAccess = await client.from("problem_observations").select("id");
    check(sharedAccess.error?.code === "42501", "browser role could directly read shared rows");
    let denied = false;
    try { await readTrustedQualifiedValidationEvidence(canonical, client); }
    catch (error) { denied = error instanceof Error && error.message === "trusted_qualified_evidence_read_failed" && !("cause" in error); }
    check(denied, "browser role obtained privileged join");
  }
  console.log("PASS service SELECT, RLS, role restrictions and existing RPC catalog privileges");

  // Synthetic negatives are constrained INSERTs, not genuine promotions. They
  // explicitly distinguish impossible SQL states from possible reader rejects.
  const ledger = (i: number, extra: Record<string, unknown> = {}) => ({
    owner_id: owner, observation_id: source(i), classification_id: classification(i),
    subject_id: uuid("3", 1), hypothesis_id: uuid("4", 1), hypothesis_version_id: uuid("5", 1),
    experiment_id: uuid("6", 1), experiment_version_id: uuid("7", 1),
    participant_id: participant(i), interview_session_id: uuid("a", i),
    policy_version: "v8-b1.2", resolver_version: "v8-b3.0.2-exact.1", projection_version: "v8-b3.1-projection.1",
    eligible: true, eligibility_reasons: ["eligible"], representative_selected: true,
    independence_kind: "participant", independence_private_id: participant(i), polarity: "supporting",
    representative_group_key: `participant:${participant(i)}|${canonical}|supporting`,
    canonical_problem_id: canonical, resolution_status: "resolved", resolution_reason: "server_exact_authority_snapshot",
    problem_observation_id: sharedId(i), promotion_fingerprint: fingerprint(i), ...extra,
  });
  const shared = (i: number, extra: Record<string, unknown> = {}) => ({
    id: sharedId(i), canonical_problem_id: canonical, problem_title: "Slow reports", normalized_problem_title: "slow reports",
    source_type: "customer_interview_human_reviewed", source_evidence: `Approved statement ${i}`,
    evidence_polarity: "supporting", observed_at: "2026-09-26T00:00:00+00:00",
    observation_fingerprint: `validation-promotion:${fingerprint(i)}`,
    metadata: { projectionVersion: "v8-b3.1-projection.1" }, ...extra,
  });
  async function insert(table: string, row: Record<string, unknown>) {
    const result = await admin.from(table).insert(row);
    check(!result.error, `${phase}: fixture INSERT rejected`);
  }
  async function unchanged() {
    const result = await readTrustedQualifiedValidationEvidence(canonical, admin);
    check(result.complete && result.observations.length === 3 &&
      result.observations.every((row) => positive.observations.some((original) => original.id === row.id)), `${phase}: forged evidence returned`);
  }

  phase = "shared marker impersonation and legacy exclusion";
  for (const [i, extra] of [
    [130, {}], // all markers present, no ledger
    [131, { observation_fingerprint: "source-only" }],
    [132, { source_type: "reddit" }],
    [133, { metadata: {} }],
    [134, { evidence_polarity: null }],
  ] as const) {
    await insert("problem_observations", shared(i, extra));
    await unchanged();
  }
  console.log("PASS actual shared-only source/prefix/metadata impersonation, legacy and null polarity exclusion");

  phase = "SQL constraints vs reader rejection";
  await insert("canonical_problems", { id: otherCanonical, canonical_key: "other-fixture", canonical_title: "Other fixture", normalized_title: "other fixture", status: "active" });
  await insert("problem_observations", shared(5));
  for (const [label, extra, code] of [
    ["canonical mismatch", { canonical_problem_id: otherCanonical }, "23503"],
    ["ineligible final", { eligible: false, representative_selected: false }, "23514"],
    ["nonrepresentative final", { representative_selected: false }, "23514"],
    ["unresolved final", { resolution_status: "unmatched", canonical_problem_id: null }, "23514"],
  ] as const) {
    const result = await admin.from("validation_evidence_promotions").insert(ledger(5, extra));
    check(result.error?.code === code, `${label}: expected real SQL constraint rejection`);
  }
  const duplicate = await admin.from("problem_observations").insert(shared(135, { observation_fingerprint: shared(5).observation_fingerprint }));
  check(duplicate.error?.code === "23505", "shared fingerprint uniqueness missing");
  const wrong = "0".repeat(64);
  await insert("validation_evidence_promotions", ledger(5, { promotion_fingerprint: wrong }));
  await unchanged();
  for (const [i, extra] of [
    [6, { policy_version: "unsupported" }], [7, { resolver_version: "unsupported" }],
    [8, { projection_version: "unsupported" }],
    [9, { problem_observation_id: null }],
    [10, { problem_observation_id: null, eligible: false, representative_selected: false }],
    [11, { problem_observation_id: null, representative_selected: false }],
    [12, { problem_observation_id: null, representative_selected: false, resolution_status: "unmatched", canonical_problem_id: null }],
  ] as const) {
    await insert("problem_observations", shared(i));
    await insert("validation_evidence_promotions", ledger(i, extra));
    await unchanged();
  }
  for (const [i, extra] of [
    [13, { evidence_polarity: "mixed" }],
    [14, { metadata: { projectionVersion: "unsupported" } }],
    [15, { source_type: "reddit", evidence_polarity: null }],
  ] as const) {
    await insert("problem_observations", shared(i, extra));
    await insert("validation_evidence_promotions", ledger(i));
    await unchanged();
  }
  const duplicateFinal = await admin.from("validation_evidence_promotions").insert(ledger(5));
  check(duplicateFinal.error?.code === "23505", "final uniqueness missing");
  const appendOnly = await admin.from("validation_evidence_promotions").update({ eligible: false }).eq("observation_id", source(1));
  check(appendOnly.error?.code === "55000", "ledger append-only trigger missing");
  const empty = await readTrustedQualifiedValidationEvidence(otherCanonical, admin);
  check(empty.complete && empty.observations.length === 0, "empty query fabricated evidence");
  console.log("PASS real FK/CHECK/unique/append-only constraints and possible inconsistent/nonfinal reader rejects");

  phase = "shared content integrity trusted-writer limitation";
  const original = positive.observations[0];
  const mutation = { source_evidence: "Synthetic changed statement", problem_title: "Synthetic changed title", observed_at: "2026-10-01T00:00:00+00:00" };
  const changed = await admin.from("problem_observations").update(mutation).eq("id", original.id);
  check(!changed.error, "shared fields unexpectedly immutable; review controls");
  const after = await readTrustedQualifiedValidationEvidence(canonical, admin);
  const returned = after.observations.find((row) => row.id === original.id);
  check(returned?.source_evidence === mutation.source_evidence && returned.problem_title === mutation.problem_title &&
    Date.parse(returned.observed_at) === Date.parse(mutation.observed_at), "shared mutation behavior changed; review trust contract");
  const restore = await admin.from("problem_observations").update({
    source_evidence: original.source_evidence, problem_title: original.problem_title, observed_at: original.observed_at,
  }).eq("id", original.id);
  check(!restore.error, "fixture shared fields could not be restored");
  console.log("CONFIRMED LIMITATION service_role can change linked shared text/title/time without invalidating qualification");

  phase = "candidate limit and completeness";
  // Low shared UUIDs deterministically precede genuine promotion result UUIDs.
  // SQL permits these final-looking but invalid-fingerprint authority rows.
  // Their presence must not make a truncated empty result look complete.
  check(positive.observations.every((row) => row.id > uuid("0", 119)), "fixture ordering prerequisite failed");
  for (let i = 20; i < 120; i++) {
    const id = uuid("0", i);
    const fp = createHash("sha256").update(`invalid-fixture-${i}`).digest("hex");
    await insert("problem_observations", shared(i, { id, observation_fingerprint: `validation-promotion:${fp}` }));
    await insert("validation_evidence_promotions", ledger(i, { problem_observation_id: id, promotion_fingerprint: fp }));
  }
  const capped = await readTrustedQualifiedValidationEvidence(canonical, admin);
  check(!capped.complete && capped.observations.length === 0, "candidate cap silently omitted valid evidence");
  check(sql(`select count(*) from public.validation_evidence_promotions where observation_id in
    ('${source(1)}','${source(2)}','${source(3)}') and problem_observation_id is not null;`, phase) === "3", "genuine evidence missing after cap test");
  check(sql("select md5(string_agg(oid::text, ',' order by oid)) from pg_proc where pronamespace='public'::regnamespace;", phase) === rpcCatalog, "test or reader added public RPCs");
  console.log("PASS real PostgREST exact count exposes omitted valid evidence as complete=false");
  console.log("PASS B4.1-B disposable PostgreSQL/PostgREST suite; security review still required");
}

try { await run(); }
catch {
  console.error(`FAIL B4.1-B: ${phase}; details suppressed to protect private qualification data`);
  process.exitCode = 1;
}
