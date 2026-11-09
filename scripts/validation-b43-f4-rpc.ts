// Prepared disposable PostgREST controls. Importing this module makes no requests.
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { B43_API_URL, classifyPostgrestDenial, isExpectedLocalRpcCredential } from "./validation-b43-isolation.ts";
import { diagnosticFetch } from "./validation-b43-harness.ts";

type Fixture = { owner: string; subject: string; experiment: string; observation: string; canonical: string; upstream: string; number: number };
function check(value: unknown, label: string): asserts value { if (!value) throw new Error(label); }

export function verifiedF4Clients(status: Record<string, string>, owner: string, request: typeof fetch = fetch, report: (value: string) => void = () => {}) {
  check(status.API_URL === B43_API_URL, "rpc_destination");
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "authenticated", sub: owner,
    aud: "authenticated", iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 })}`;
  check(typeof status.JWT_SECRET === "string" && status.JWT_SECRET.length > 0, "rpc_credentials");
  const token = `${input}.${createHmac("sha256", status.JWT_SECRET).update(input).digest("base64url")}`;
  for (const [role, credential] of [["service_role", status.SERVICE_ROLE_KEY], ["anon", status.ANON_KEY], ["authenticated", token]]) {
    check(isExpectedLocalRpcCredential(B43_API_URL, credential, status.JWT_SECRET, role), "rpc_credentials");
  }
  const observed = diagnosticFetch(report, request);
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: observed } };
  return { service: createClient(B43_API_URL, status.SERVICE_ROLE_KEY, options),
    anon: createClient(B43_API_URL, status.ANON_KEY, options),
    authenticated: createClient(B43_API_URL, status.ANON_KEY, { ...options,
      global: { fetch: observed, headers: { Authorization: `Bearer ${token}` } } }) };
}

export async function probeF4TypedRpcs(clients: { service: SupabaseClient; anon: SupabaseClient; authenticated: SupabaseClient }, fixture: Fixture) {
  const participant = { p_owner_id: fixture.owner, p_experiment_id: null, p_identity_mode: "anonymous",
    p_pseudonymous_reference: null, p_independence_key: null, p_consent_mode: null, p_consent_purpose: null, p_consent_captured_at: null };
  const link = { p_owner_id: fixture.owner, p_subject_id: fixture.subject, p_source_type: "scan",
    p_source_row_id: fixture.upstream, p_source_version: null, p_link_role: "supporting_context", p_context_snapshot: {} };
  const fingerprint = `f4-market-${fixture.number}`;
  const row = { observation_fingerprint: fingerprint, problem_title: "Synthetic market report", normalized_problem_title: "synthetic market report",
    problem_summary: null, source_table: "scan", source_row_id: fixture.upstream, source_url: null, source_type: "scan",
    source_evidence: "Synthetic ordinary market evidence", source_author_id: null, source_metrics: {}, affected_niches: [],
    problem_cluster: null, pain_score: null, revenue_score: null, urgency_score: null, trend_score: null, buying_signal_score: null,
    frequency_score: null, source_quality_score: null, opportunity_score: null, confidence_score: null, evidence_quality: null,
    observed_at: "2026-01-01T00:00:00.000Z", metadata: {} };
  const operations = [
    ["validation_create_participant", participant], ["validation_add_subject_link", link],
    ["knowledge_insert_problem_observations", { p_rows: [row] }],
  ] as const;
  for (const client of [clients.anon, clients.authenticated]) {
    for (const [name, args] of operations) {
      check(classifyPostgrestDenial(await client.rpc(name, args)) === "expected_denial", "browser_rpc_denial");
    }
  }
  for (const client of Object.values(clients)) {
    check(classifyPostgrestDenial(await client.rpc("validation_b43_read_current_evidence", { p_canonical_problem_id: fixture.canonical })) === "expected_denial", "reader_denial");
  }
  const created = await clients.service.rpc("validation_create_participant", participant);
  check(!created.error && created.status >= 200 && created.status < 300 && created.data && typeof created.data === "object", "participant_decoding");
  check(Object.keys(created.data).sort().join(",") === ["id", "experiment_id", "identity_mode", "pseudonymous_reference", "status", "consent_mode", "consent_purpose", "consent_captured_at", "created_at"].sort().join(",")
    && created.data.status === "active", "participant_projection");
  const linked = await clients.service.rpc("validation_add_subject_link", link);
  check(!linked.error && linked.data && Object.keys(linked.data).sort().join(",") === ["id", "subject_id", "source_type", "source_row_id", "source_version", "link_role", "context_snapshot", "created_at"].sort().join(","), "link_decoding");
  const duplicate = await clients.service.rpc("validation_add_subject_link", link);
  check(duplicate.error === null && duplicate.data === null, "link_duplicate_contract");
  const wrongOwner = "10000000-0000-0000-0000-999999999999";
  for (const [name, args] of [["validation_add_subject_link", { ...link, p_owner_id: wrongOwner }],
    ["validation_create_participant", { ...participant, p_owner_id: wrongOwner, p_experiment_id: fixture.experiment }]] as const) {
    const denied = await clients.service.rpc(name, args);
    check(denied.data === null && denied.error?.code === "P0002" && denied.status === 404, "definer_owner_boundary");
  }
  const inserted = await clients.service.rpc("knowledge_insert_problem_observations", { p_rows: [row] });
  check(!inserted.error && Array.isArray(inserted.data) && inserted.data.length === 1
    && inserted.data[0].observation_fingerprint === fingerprint && Object.keys(inserted.data[0]).length === 1, "market_composite_decoding");
  const replay = await clients.service.rpc("knowledge_insert_problem_observations", { p_rows: [row] });
  check(!replay.error && Array.isArray(replay.data) && replay.data.length === 0, "market_duplicate_contract");
  const badBatch = await clients.service.rpc("knowledge_insert_problem_observations", {
    p_rows: [{ ...row, observation_fingerprint: `f4-rollback-${fixture.number}` }, { ...row, problem_title: null, observation_fingerprint: `f4-invalid-${fixture.number}` }],
  });
  check(badBatch.data === null && badBatch.error?.code === "23502", "market_atomic_batch_failure");
  const ai = await clients.service.rpc("validation_insert_classification", { p_owner_id: fixture.owner, p_observation_id: fixture.observation,
    p_polarity: "supporting", p_classification_source: "ai_model_suggested", p_authority_status: "authoritative", p_rationale: null, p_supersedes_classification_id: null });
  check(ai.data === null && ai.error?.code === "23514", "ai_cannot_qualify");
  return { typed_rpc_decoding: true, owner_boundaries: true, browser_denials: true, reader_denials: true, expected_batch_failure: "23502" };
}

export async function probeF4RlsReads(owner: SupabaseClient, foreign: SupabaseClient, anonymous: SupabaseClient, subject: string) {
  const own = await owner.from("validation_subjects").select("id").eq("id", subject);
  check(!own.error && Array.isArray(own.data) && own.data.length === 1 && own.data[0].id === subject
    && Object.keys(own.data[0]).length === 1, "rls_owner_read");
  const other = await foreign.from("validation_subjects").select("id").eq("id", subject);
  check(!other.error && Array.isArray(other.data) && other.data.length === 0, "rls_foreign_read");
  check(classifyPostgrestDenial(await anonymous.from("validation_subjects").select("id").eq("id", subject)) === "expected_denial", "rls_anon_read");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const protocol: string[] = [];
  try {
    check(process.env.F4_AUTHORIZED === "true" && process.env.F4_RUN_RPC_PROBES === "true"
      && /^[a-f0-9]{40}$/.test(process.env.F4_EXPECTED_SHA ?? "")
      && process.env.F4_EXPECTED_SHA === process.env.F3_SOURCE_SHA, "rpc_authorization");
    execFileSync("python", ["scripts/validation-b43-f3-authorize.py"], { stdio: "pipe", timeout: 30_000 });
    execFileSync("node", ["scripts/validation-b43-db.ts", "--preflight-only"], { stdio: "pipe", timeout: 60_000 });
    const raw = readFileSync(0, "utf8");
    check(Buffer.byteLength(raw) <= 32_768, "rpc_input_bound");
    const input = JSON.parse(raw) as { status: Record<string, string>; fixture: Fixture };
    const clients = verifiedF4Clients(input.status, input.fixture.owner, fetch, value => protocol.push(value));
    const result = await probeF4TypedRpcs(clients, input.fixture);
    const foreign = verifiedF4Clients(input.status, "10000000-0000-0000-0000-999999999999", fetch, value => protocol.push(value));
    await probeF4RlsReads(clients.authenticated, foreign.authenticated, clients.anon, input.fixture.subject);
    process.stdout.write(JSON.stringify({ ...result, rls_owner_reads: true, protocol }));
  } catch {
    process.stdout.write(JSON.stringify({ success: false, protocol }));
    process.stderr.write("F4 typed RPC validation failed\n");
    process.exitCode = 1;
  }
}
