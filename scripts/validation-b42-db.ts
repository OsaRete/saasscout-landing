import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { persistProblemObservations } from "../lib/knowledge/observation-store.ts";
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
let failedAssertion = "unexpected error";

function check(condition: unknown, label: string): asserts condition {
  if (!condition) {
    // Labels are fixed test descriptions/SQLSTATEs, never row data or DB errors.
    failedAssertion = label;
    throw new Error(label);
  }
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
  check(process.env.VALIDATION_B42_DISPOSABLE === "1", "explicit disposable test opt-in required; no skip");
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

  async function expectReadFailure() {
    let rejected = false;
    try { await readTrustedQualifiedValidationEvidence(canonical, admin); }
    catch (error) {
      rejected = error instanceof Error && error.message === "trusted_qualified_evidence_read_failed" && !("cause" in error);
    }
    check(rejected, `${phase}: falsely complete integrity result`);
  }
  // Administrator-only disposable fault injection, never runtime privileges.
  function removeHistorical(i: number, id: string) {
    sql(`begin; alter table public.validation_evidence_promotions disable trigger USER;
      delete from public.validation_evidence_promotions where observation_id='${source(i)}';
      alter table public.validation_evidence_promotions enable trigger USER;
      delete from public.problem_observations where id='${id}'; commit;`, phase);
  }
  const baselineMigration = readFileSync(new URL("../supabase/migrations/20260926000000_controlled_customer_interview_promotion.sql", import.meta.url), "utf8");
  const oldRpc = baselineMigration.slice(baselineMigration.indexOf("create function public.validation_promote_customer_interview_evidence("),
    baselineMigration.indexOf("-- ---------------------------------------------------------------------\n-- Membership-changing coordinators"))
    .replace("create function", "create or replace function");
  const migrated = readFileSync(new URL("../supabase/migrations/20261008010000_qualified_evidence_snapshot_v2.sql", import.meta.url), "utf8");
  const newRpc = migrated.slice(migrated.indexOf("create or replace function public.validation_promote_customer_interview_evidence("));
  async function historicalPromotion() {
    sql(oldRpc, phase);
    try { return await promoteCustomerInterviewEvidence(owner, source(19), admin); }
    finally { sql(newRpc, phase); }
  }
  phase = "historical-only complete population";
  const historicalOnly = await historicalPromotion();
  await expectReadFailure();
  check((await promoteCustomerInterviewEvidence(owner, source(19), admin)).duplicate, "historical-only retry changed");
  check(sql(`select count(*) from public.validation_qualified_evidence_snapshots;`, phase) === "0", "historical-only retry attested history");
  removeHistorical(19, historicalOnly.problemObservationId);
  console.log("PASS historical-only qualified population fails generically; retry never attests history");

  phase = "persisted shared row capture including trigger/default changes";
  sql(`create function public.b42_test_persisted_row() returns trigger language plpgsql as $$
    begin
      new.source_table := 'persisted trigger source';
      new.source_row_id := '';
      new.source_metrics := '{"exact":900719925474099312345,"null":null,"nested":[null,"text"]}'::jsonb;
      new.affected_niches := '[0:2]={"quoted,text",NULL,""}'::text[];
      new.pain_score := 1.23;
      new.problem_summary := null;
      new.ingested_at := '2026-10-08T12:34:56.123456+05:30';
      return new;
    end $$;
    create trigger b42_test_persisted_row before insert on public.problem_observations
      for each row execute function public.b42_test_persisted_row();`, phase);

  phase = "genuine B3.1 promotions and composite embedding";
  for (const i of [1, 2, 3]) {
    try {
      await promoteCustomerInterviewEvidence(owner, source(i), admin);
    } catch {
      throw new Error("actual B3.1 service promotion failed");
    }
  }
  sql("drop trigger b42_test_persisted_row on public.problem_observations; drop function public.b42_test_persisted_row();", phase);
  check(sql(`select count(*)=3 and bool_and(
    s.attestation_version='v8-b4.2-b1-full-row.2' and cardinality(s.protected_schema)=31
    and s.protected_record::public.problem_observations is not distinct from po
    and po.source_table='persisted trigger source' and po.source_row_id=''
    and po.problem_summary is null and array_lower(po.affected_niches,1)=0
    and po.affected_niches[1] is null and po.affected_niches[2]=''
    and po.source_metrics->>'exact'='900719925474099312345'
    and po.source_metrics->'null'='null'::jsonb and po.pain_score=1.23
    and po.ingested_at='2026-10-08T12:34:56.123456+05:30'::timestamptz)
    from public.validation_qualified_evidence_snapshots s join public.problem_observations po on po.id=s.problem_observation_id;`, phase) === "t", "persisted full row codec changed SQL values");
  console.log("PASS actual persisted 31-column capture preserves SQL NULL, JSONB precision, arrays, text, numeric and timestamp semantics");
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
    ('public.problem_observations'::regclass,'public.validation_evidence_promotions'::regclass,'public.validation_qualified_evidence_snapshots'::regclass);`, phase) === "t", "RLS absent");
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
    (proname like 'validation_b31_%' or proname like 'validation_b42_%' or proname='validation_promote_customer_interview_evidence');`, phase) === "t", "public promotion RPC privilege");
  check(sql(`select bool_and(prosecdef and proowner='postgres'::regrole and
    'search_path=public, extensions'=any(proconfig)) from pg_proc
    where pronamespace='public'::regnamespace and proname='validation_promote_customer_interview_evidence';`, phase) === "t", "unexpected existing promotion owner/search_path");
  for (const client of [anonymous, authenticated]) {
    const access = await client.from("validation_evidence_promotions").select("problem_observation_id");
    check(access.error?.code === "42501", "browser role could read ledger or token was invalid");
    const snapshotAccess = await client.from("validation_qualified_evidence_snapshots").select("problem_observation_id");
    check(snapshotAccess.error?.code === "42501", "browser role could read snapshots");
    const sharedAccess = await client.from("problem_observations").select("id");
    check(sharedAccess.error?.code === "42501", "browser role could directly read shared rows");
    let denied = false;
    try { await readTrustedQualifiedValidationEvidence(canonical, client); }
    catch (error) { denied = error instanceof Error && error.message === "trusted_qualified_evidence_read_failed" && !("cause" in error); }
    check(denied, "browser role obtained privileged join");
  }
  check(sql(`select has_table_privilege('service_role','public.validation_qualified_evidence_snapshots','SELECT')
    and not has_table_privilege('service_role','public.validation_evidence_promotions','INSERT')
    and not has_table_privilege('service_role','public.validation_qualified_evidence_snapshots','INSERT')
    and not has_function_privilege('service_role','public.validation_b42_guard_attested_observation()','EXECUTE')
    and not has_function_privilege('anon','public.validation_b42_guard_attested_observation()','EXECUTE')
    and not has_function_privilege('authenticated','public.validation_b42_guard_attested_observation()','EXECUTE');`, phase) === "t", "unexpected B4.2 runtime grants");
  console.log("PASS service SELECT, RLS, role restrictions and RPC catalog privileges");

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
  function insertStatement(table: string, row: Record<string, unknown>) {
    // Trusted, fixed synthetic fixtures only; bypass runtime DML grants as the
    // disposable database administrator to exercise SQL-impossible states.
    const keys = Object.keys(row);
    check(keys.every((key) => /^[a-z_]+$/.test(key)), "unsafe fixture column");
    check(["problem_observations", "validation_evidence_promotions", "canonical_problems"].includes(table), "unsafe fixture table");
    const columns = keys.join(",");
    return `insert into public.${table} (${columns}) select ${columns} from
      jsonb_populate_record(null::public.${table}, '${JSON.stringify(row).replaceAll("'", "''")}'::jsonb);`;
  }
  function sqlCode(statement: string): string {
    const result = spawnSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"], {
      input: `set statement_timeout='10s';\n${statement}`, encoding: "utf8", timeout: 15000,
    });
    check(!result.error && result.status !== null, "disposable SQL tool unavailable");
    if (result.status === 0) return "00000";
    const code = /ERROR:\s+([0-9A-Z]{5})/.exec(result.stderr)?.[1];
    check(code, "SQL failed without expected SQLSTATE");
    return code;
  }
  async function insert(table: string, row: Record<string, unknown>) {
    sql(insertStatement(table, row), phase);
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

  phase = "existing Discovery ingestion and canonical bootstrap";
  const discoveryInputs = [1, 2].map((i) => ({
    title: "Disposable delayed invoice delivery", observedAt: `2026-10-0${i}T00:00:00Z`,
    source: { sourceType: "discovery", sourceTable: "discovered_problems", sourceId: `b42-fixture-${i}` },
    evidenceSummary: `Disposable public evidence ${i}`, scores: { pain: 7, sourceQuality: 8 },
  }));
  const ingested = await persistProblemObservations(admin, discoveryInputs);
  check(ingested.diagnostics.inserted_count === 2 && ingested.diagnostics.failed_count === 0, "existing ingestion failed");
  const ingestRetry = await persistProblemObservations(admin, discoveryInputs);
  check(ingestRetry.diagnostics.inserted_count === 0 && ingestRetry.diagnostics.failed_count === 0, "existing ingestion idempotency changed");
  const discovered = await admin.from("problem_observations").select("id")
    .in("observation_fingerprint", ingested.rows.map((row) => row.observation_fingerprint));
  check(!discovered.error && discovered.data?.length === 2, "ingested rows absent");
  const candidate = {
    candidateId: "cb1_" + "a".repeat(24), candidateSnapshotHash: "a".repeat(64),
    bootstrapRuleVersion: "canonical_bootstrap_v1", activationEligibilityRuleVersion: "canonical_bootstrap_activation_v1",
    crossCandidateAuditRuleVersion: "canonical_bootstrap_cross_candidate_audit_v1",
    candidateCanonicalTitle: "Disposable delayed invoice delivery", candidateNormalizedTitle: "disposable delayed invoice delivery",
    baseActivationDisposition: "auto_activatable", crossCandidateAuditDisposition: "clearly_unique",
    finalActivationDisposition: "auto_activatable", observationIds: discovered.data.map((row) => row.id), aliases: [],
  };
  const bootstrap = await admin.rpc("apply_canonical_bootstrap_activation", { p_plan_hash: "b".repeat(64), p_candidates: [candidate] });
  check(!bootstrap.error && bootstrap.data?.observationsLinked === 2, "bootstrap could not update unguarded observations");
  const bootstrapRetry = await admin.rpc("apply_canonical_bootstrap_activation", { p_plan_hash: "b".repeat(64), p_candidates: [candidate] });
  check(!bootstrapRetry.error && bootstrapRetry.data?.status === "already_applied", "bootstrap retry contract changed");
  check(!(await admin.from("problem_observations").update({ source_evidence: "Discovery update still allowed" }).eq("id", discovered.data[0].id)).error, "blanket shared UPDATE restriction");
  check(!(await admin.from("problem_observations").delete().eq("id", discovered.data[1].id)).error, "blanket shared DELETE restriction");
  await unchanged();
  console.log("PASS actual Discovery ingestion/retry, canonical bootstrap/retry and unguarded shared UPDATE/DELETE");

  phase = "SQL constraints vs reader rejection";
  await insert("canonical_problems", { id: otherCanonical, canonical_key: "other-fixture", canonical_title: "Other fixture", normalized_title: "other fixture", status: "active" });
  await insert("problem_observations", shared(5));
  for (const [label, extra, code] of [
    ["canonical mismatch", { canonical_problem_id: otherCanonical }, "23503"],
    ["ineligible final", { eligible: false, representative_selected: false }, "23514"],
    ["nonrepresentative final", { representative_selected: false }, "23514"],
    ["unresolved final", { resolution_status: "unmatched", canonical_problem_id: null }, "23514"],
  ] as const) {
    const result = sqlCode(insertStatement("validation_evidence_promotions", ledger(5, extra)));
    check(result === code, `${label}: expected ${code}, received ${result}`);
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
    await expectReadFailure();
    removeHistorical(i, sharedId(i));
    await unchanged();
  }
  const duplicateFinal = sqlCode(insertStatement("validation_evidence_promotions", ledger(5)));
  check(duplicateFinal === "23505", "final uniqueness missing");
  const appendOnly = await admin.from("validation_evidence_promotions").update({ eligible: false }).eq("observation_id", source(1));
  check(appendOnly.error?.code === "42501", "runtime ledger UPDATE privilege was retained");
  const empty = await readTrustedQualifiedValidationEvidence(otherCanonical, admin);
  check(empty.complete && empty.observations.length === 0, "empty query fabricated evidence");
  console.log("PASS real FK/CHECK/unique/append-only constraints and possible inconsistent/nonfinal reader rejects");

  phase = "service-role preparation trust boundary";
  const state = await admin.rpc("validation_b31_representative_state", {
    p_owner_id: owner, p_participant_id: participant(16),
  });
  const authority = await admin.rpc("validation_b31_authority_snapshot", {
    p_subject_id: uuid("3", 1), p_hypothesis_version_id: uuid("5", 1),
  });
  check(!state.error && !authority.error, "trusted preparation state unavailable");
  const alternateFingerprint = createHash("sha256").update(JSON.stringify({
    canonicalProblemId: otherCanonical, classificationId: classification(16), observationId: source(16),
    polarity: "supporting", policyVersion: "v8-b1.2", projectionVersion: "v8-b3.1-projection.1",
    resolverVersion: "v8-b3.0.2-exact.1",
  })).digest("hex");
  const directParameters = {
    p_owner_id: owner, p_observation_id: source(16), p_classification_id: classification(16),
    p_canonical_problem_id: otherCanonical, p_polarity: "supporting",
    p_representative_group_key: `participant:${participant(16)}|${otherCanonical}|supporting`,
    p_promotion_fingerprint: alternateFingerprint, p_representative_state: state.data,
    p_authority_snapshot: authority.data, p_canonical_title: "Other fixture", p_normalized_title: "other fixture",
    p_policy_version: "v8-b1.2", p_resolver_version: "v8-b3.0.2-exact.1", p_projection_version: "v8-b3.1-projection.1",
  };
  for (const client of [anonymous, authenticated]) {
    const denied = await client.rpc("validation_promote_customer_interview_evidence", directParameters);
    check(denied.error?.code === "42501", "SECURITY BLOCKER: browser bypassed trusted promotion preparation");
  }
  const direct = await admin.rpc("validation_promote_customer_interview_evidence", directParameters);
  check(!direct.error && direct.data, "service-role direct invocation contract changed");
  check((await readTrustedQualifiedValidationEvidence(otherCanonical, admin)).observations.length === 1,
    "service-role selected canonical not persisted");
  console.log("PASS browser RPC rejection; service-role can independently supply canonical selection: trusted application boundary required");

  phase = "runtime integrity and immutable snapshots";
  const original = positive.observations[0];
  for (const changes of [
    { source_evidence: "Synthetic changed statement" }, { problem_title: "Synthetic changed title" },
    { observed_at: "2026-10-01T00:00:00+00:00" }, { evidence_polarity: "mixed" },
    { canonical_problem_id: otherCanonical }, { metadata: {} },
    { observation_fingerprint: "replacement" }, { normalized_problem_title: "replacement" },
  ]) {
    const changed = await admin.from("problem_observations").update(changes).eq("id", original.id);
    check(changed.error?.code === "55000", "runtime changed an attested row");
  }
  check((await admin.from("problem_observations").delete().eq("id", original.id)).error?.code === "55000", "attested DELETE permitted");
  check((await admin.from("vali…3059 tokens truncated…nd schema drift fail closed");

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
  let cappedFailed = false;
  try { await readTrustedQualifiedValidationEvidence(canonical, admin); }
  catch (error) { cappedFailed = error instanceof Error && error.message === "trusted_qualified_evidence_read_failed"; }
  check(cappedFailed, "incomplete real read did not fail closed");
  check(sql(`select count(*) from public.validation_evidence_promotions where observation_id in
    ('${source(1)}','${source(2)}','${source(3)}') and problem_observation_id is not null;`, phase) === "3", "genuine evidence missing after cap test");
  check(sql("select md5(string_agg(oid::text, ',' order by oid)) from pg_proc where pronamespace='public'::regnamespace;", phase) === rpcCatalog, "test or reader added public RPCs");
  console.log("PASS real PostgREST exact count exposes omitted valid evidence as generic failure");
  console.log("PASS B4.2-B1 disposable PostgreSQL/PostgREST suite; security review still required");
}

try { await run(); }
catch {
  console.error(`FAIL B4.2-B1: ${phase}; ${failedAssertion}; database/private details suppressed`);
  process.exitCode = 1;
}
