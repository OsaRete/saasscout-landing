import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { SCAN_ARTIFACT_ROLE_MARKER, assertScanArtifactTestRole, stripScanArtifactRoleMarker, type ScanArtifactTestRole } from "./support/scan-artifact-psql-role-output.ts";
import { buildScanArtifactPersistenceFixture, buildValidScanArtifactFixture, scanArtifactAuthA, scanArtifactOwnerA, scanArtifactOwnerB } from "./scan-artifact-fixture.ts";
import { canonicalSerializeScanIntelligenceArtifact } from "../lib/scan/intelligence-artifact.ts";
import { ScanArtifactPersistenceError, validateStoredScanArtifactRow } from "../lib/scan/artifact-persistence.ts";

const DEFAULT_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DB_URL = process.env.SCAN_ARTIFACT_TEST_DATABASE_URL ?? DEFAULT_URL;
const DB_CONTAINER = process.env.SCAN_ARTIFACT_TEST_DB_CONTAINER ?? "supabase_db_saasscout-landing";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
const EXPECTED_MIGRATION = "20260716000000";

type PersistFixture = ReturnType<typeof buildScanArtifactPersistenceFixture>;

function safeUrl() {
  const parsed = new URL(DB_URL);
  if (!LOCAL_HOSTS.has(parsed.hostname)) throw new Error("Refusing to run Scan Artifact DB tests against a non-local database host.");
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw new Error("Scan Artifact DB tests require a PostgreSQL URL.");
  if (parsed.username !== "postgres") throw new Error("Scan Artifact DB tests require the disposable local postgres user.");
  if ((parsed.port || "54322") !== (process.env.SCAN_ARTIFACT_TEST_DATABASE_PORT ?? "54322")) throw new Error("Scan Artifact DB tests require the expected local Supabase PostgreSQL port unless SCAN_ARTIFACT_TEST_DATABASE_PORT is explicitly set.");
  if (!new Set(["postgres", "test", "local_test"]).has(parsed.pathname.slice(1))) throw new Error("Scan Artifact DB tests require a disposable local database name.");
  if (parsed.searchParams.size > 0) throw new Error("Scan Artifact DB tests reject URL query parameters such as SSL settings.");
  return parsed;
}
function wrapRole(sql: string, role?: ScanArtifactTestRole) {
  if (!role) return sql;
  assertScanArtifactTestRole(role);
  return `set role ${role};
select ${q(SCAN_ARTIFACT_ROLE_MARKER)} || current_user;
${sql}
reset role;`;
}
function psql(sql: string, role?: ScanArtifactTestRole) {
  const res = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t"], { input: wrapRole(sql, role), encoding: "utf8", maxBuffer: 10_000_000 });
  if (res.status !== 0) throw new Error(`local_postgres_sql_failed:${String(res.stderr || res.stdout || res.error?.message || "docker_or_psql_unavailable").split("\n")[0]}`);
  return stripScanArtifactRoleMarker(res.stdout, role);
}
async function psqlAsync(sql: string, role?: ScanArtifactTestRole) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", DB_CONTAINER, "psql", "-q", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    let settled = false;
    const finish = (err?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value ?? "");
    };
    child.on("error", err => finish(new Error(`local_postgres_sql_failed:${err.message.split("\n")[0]}`)));
    child.on("close", code => {
      if (code !== 0) finish(new Error(`local_postgres_sql_failed:${String(stderr || stdout || "docker_or_psql_unavailable").split("\n")[0]}`));
      else {
        try {
          finish(undefined, stripScanArtifactRoleMarker(stdout, role));
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
    child.stdin.end(wrapRole(sql, role));
  });
}
function json(sql: string, role?: ScanArtifactTestRole) { const out = psql(sql, role); return out ? JSON.parse(out.split("\n").at(-1) ?? "null") : null; }
async function jsonAsync(sql: string, role?: ScanArtifactTestRole) { const out = await psqlAsync(sql, role); return out ? JSON.parse(out.split("\n").at(-1) ?? "null") : null; }
function q(s: unknown) { return `'${String(s).replaceAll("'", "''")}'`; }
function rpcSql(f: PersistFixture) { const p = f.projection; return `select public.persist_scan_intelligence_artifact_shadow(${q(f.ownerId)}::uuid,${q(f.artifact.artifactId)},${q(f.artifact.execution.executionId)},${q(f.artifact.version)},${q(f.artifact.execution.workflowVersion)},${q(f.artifact.integrity.canonicalizationVersion)},${q(f.artifact.integrity.artifactHash)},${q(f.idempotencyKey)},${q(JSON.stringify(f.payload))}::jsonb,${q(p.reliabilityClassification)},${q(p.validationReadiness)},${q(p.recommendedCategory)},${p.sourceCount},${p.independentSourceCount},${p.score10},${p.score100});`; }
function rpcAsServiceRole(f: PersistFixture) { return json(rpcSql(f), "service_role"); }
function rpcAsServiceRoleAsync(f: PersistFixture) { return jsonAsync(rpcSql(f), "service_role"); }
function upsertUsers() { psql(`insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values (${q(scanArtifactOwnerA)}::uuid,'authenticated','authenticated','scan-artifact-a@example.test','',now(),now(),now()),(${q(scanArtifactOwnerB)}::uuid,'authenticated','authenticated','scan-artifact-b@example.test','',now(),now(),now()) on conflict(id) do nothing;`); }
function truncateLocalOnly() { psql("truncate table public.scan_intelligence_artifacts restart identity;"); }
function countRows(where = "") { return psql(`select count(*) from public.scan_intelligence_artifacts${where};`); }
function inspectStoredRow(where = "") { return json(`select to_jsonb(t) from public.scan_intelligence_artifacts t${where};`); }
function inspectStoredAppendOnlyState(where = "") { return json(`select jsonb_build_object('artifact_payload', artifact_payload, 'created_at', created_at) from public.scan_intelligence_artifacts${where};`); }
function assertAppendOnlyError(error: unknown) { assert.match(error instanceof Error ? error.message : String(error), /Scan Artifact persistence rows are append-only/); }
async function fixture(uuidTail = "000000000000", owner = scanArtifactAuthA) { return buildScanArtifactPersistenceFixture({ artifact: await buildValidScanArtifactFixture(`scan-workflow-00000000-0000-4000-8000-${uuidTail}`), authorization: owner }); }

test.before(() => { const u = safeUrl(); console.log(`[scan-artifact-db] disposable local PostgreSQL only: ${u.hostname}:${u.port || "54322"}`); json(`select jsonb_build_object('reachable', true, 'migration', exists(select 1 from supabase_migrations.schema_migrations where version=${q(EXPECTED_MIGRATION)}), 'table', to_regclass('public.scan_intelligence_artifacts') is not null, 'rpc', to_regprocedure('public.persist_scan_intelligence_artifact_shadow(uuid,text,text,text,text,text,text,text,jsonb,text,text,text,integer,integer,numeric,numeric)') is not null);`); const ready = json(`select jsonb_build_object('migration', exists(select 1 from supabase_migrations.schema_migrations where version=${q(EXPECTED_MIGRATION)}), 'table', to_regclass('public.scan_intelligence_artifacts') is not null, 'rpc', to_regprocedure('public.persist_scan_intelligence_artifact_shadow(uuid,text,text,text,text,text,text,text,jsonb,text,text,text,integer,integer,numeric,numeric)') is not null);`); if (!ready.migration || !ready.table || !ready.rpc) throw new Error("Supabase Local is not ready. Run: npx supabase start; npx supabase db reset; npm run test:scan-artifact-db"); upsertUsers(); truncateLocalOnly(); });
test.after(() => truncateLocalOnly());

test("real migration objects, grants, indexes, trigger and RLS are installed", () => { const r = json(`select jsonb_build_object('table', to_regclass('public.scan_intelligence_artifacts')::text, 'rpc', to_regprocedure('public.persist_scan_intelligence_artifact_shadow(uuid,text,text,text,text,text,text,text,jsonb,text,text,text,integer,integer,numeric,numeric)') is not null, 'prevent', to_regprocedure('public.prevent_scan_artifact_mutation()') is not null, 'trigger', exists(select 1 from pg_trigger where tgname='scan_artifacts_append_only' and not tgisinternal and tgenabled='O'), 'rls', (select relrowsecurity from pg_class where oid='public.scan_intelligence_artifacts'::regclass), 'constraints', (select jsonb_agg(conname order by conname) from pg_constraint where conrelid='public.scan_intelligence_artifacts'::regclass and conname like 'scan_artifacts_owner%unique'), 'indexes', (select jsonb_agg(indexname order by indexname) from pg_indexes where schemaname='public' and tablename='scan_intelligence_artifacts'), 'tablePrivs', (select jsonb_object_agg(role, jsonb_build_object('select', has_table_privilege(role,'public.scan_intelligence_artifacts','select'), 'insert', has_table_privilege(role,'public.scan_intelligence_artifacts','insert'), 'update', has_table_privilege(role,'public.scan_intelligence_artifacts','update'), 'delete', has_table_privilege(role,'public.scan_intelligence_artifacts','delete'))) from (values ('anon'),('authenticated'),('service_role')) v(role)), 'rpcExec', (select jsonb_object_agg(role, has_function_privilege(role,'public.persist_scan_intelligence_artifact_shadow(uuid,text,text,text,text,text,text,text,jsonb,text,text,text,integer,integer,numeric,numeric)','execute')) from (values ('anon'),('authenticated'),('service_role')) v(role)));`); assert.equal(r.table, "scan_intelligence_artifacts"); assert.equal(r.rpc, true); assert.equal(r.prevent, true); assert.equal(r.trigger, true); assert.equal(r.rls, true); assert.deepEqual(r.constraints, ["scan_artifacts_owner_artifact_unique", "scan_artifacts_owner_execution_unique", "scan_artifacts_owner_idempotency_unique"]); assert.ok(r.indexes.includes("scan_artifacts_owner_created_idx")); assert.ok(r.indexes.includes("scan_artifacts_version_idx")); assert.equal(r.indexes.includes("scan_artifacts_owner_artifact_idx"), false); assert.deepEqual(r.tablePrivs.anon, { select: false, insert: false, update: false, delete: false }); assert.deepEqual(r.tablePrivs.authenticated, { select: false, insert: false, update: false, delete: false }); assert.deepEqual(r.tablePrivs.service_role, { select: false, insert: false, update: false, delete: false }); assert.equal(r.rpcExec.anon, false); assert.equal(r.rpcExec.authenticated, false); assert.equal(r.rpcExec.service_role, true); });

test("application roles have only intended table/RPC privileges while postgres inspects locally", async () => { truncateLocalOnly(); for (const role of ["anon", "authenticated", "service_role"] as const) { const p = json(`select jsonb_build_object('sel', has_table_privilege(current_user,'public.scan_intelligence_artifacts','select'), 'ins', has_table_privilege(current_user,'public.scan_intelligence_artifacts','insert'), 'upd', has_table_privilege(current_user,'public.scan_intelligence_artifacts','update'), 'del', has_table_privilege(current_user,'public.scan_intelligence_artifacts','delete'), 'rpc', has_function_privilege(current_user,'public.persist_scan_intelligence_artifact_shadow(uuid,text,text,text,text,text,text,text,jsonb,text,text,text,integer,integer,numeric,numeric)','execute'));`, role); assert.deepEqual(p, { sel: false, ins: false, upd: false, del: false, rpc: role === "service_role" }); } const postgres = json(`select jsonb_build_object('sel', has_table_privilege(current_user,'public.scan_intelligence_artifacts','select'), 'ins', has_table_privilege(current_user,'public.scan_intelligence_artifacts','insert'), 'upd', has_table_privilege(current_user,'public.scan_intelligence_artifacts','update'), 'del', has_table_privilege(current_user,'public.scan_intelligence_artifacts','delete'));`); assert.deepEqual(postgres, { sel: true, ins: true, upd: true, del: true }); const f = await fixture("000000000101"); const res = rpcAsServiceRole(f); assert.equal(res.status, "inserted"); const row = inspectStoredRow(` where owner_id=${q(f.ownerId)}::uuid and artifact_id=${q(f.artifact.artifactId)}`); assert.equal(row.artifact_id, f.artifact.artifactId); const directSelectProbe = "select count(*) from public.scan_intelligence_artifacts;"; assert.throws(() => psql(directSelectProbe, "service_role"), /permission denied for table scan_intelligence_artifacts/); assert.equal(countRows(` where owner_id=${q(f.ownerId)}::uuid and artifact_id=${q(f.artifact.artifactId)}`), "1"); });

test("insert and exact replay preserve one immutable canonical row", async () => { truncateLocalOnly(); const f = await fixture("000000000201"); const first = rpcAsServiceRole(f); const row1 = inspectStoredRow(` where artifact_id=${q(f.artifact.artifactId)}`); const replay = rpcAsServiceRole(f); const row2 = inspectStoredRow(` where artifact_id=${q(f.artifact.artifactId)}`); assert.equal(first.status, "inserted"); assert.equal(replay.status, "replayed"); assert.equal(replay.record_id, first.record_id); assert.equal(replay.persisted_at, first.persisted_at); assert.equal(row1.artifact_hash, f.artifact.integrity.artifactHash); assert.deepEqual(row1.artifact_payload, f.payload); assert.deepEqual(row2, row1); assert.equal(countRows(), "1"); });

test("same idempotency identity with contradictory valid metadata returns conflict without update", async () => { truncateLocalOnly(); const f1 = await fixture("000000000301"); const f2 = await fixture("000000000302"); const first = rpcAsServiceRole(f1); const conflict = rpcAsServiceRole({ ...f2, ownerId: f1.ownerId, idempotencyKey: f1.idempotencyKey }); const row = inspectStoredRow(); assert.equal(first.status, "inserted"); assert.equal(conflict.status, "conflict"); assert.equal(countRows(), "1"); assert.equal(row.artifact_id, f1.artifact.artifactId); });

test("payload/scalar inconsistencies are rejected without creating rows", async () => { truncateLocalOnly(); const base = await fixture("000000000401"); const cases: Array<[string, (f: PersistFixture) => PersistFixture]> = [ ["payload artifact ID", f => ({ ...f, payload: { ...f.payload, artifactId: "scan-artifact-00000000-0000-4000-8000-999999999999" } })], ["execution ID", f => ({ ...f, payload: { ...f.payload, execution: { ...f.payload.execution, executionId: "scan-workflow-00000000-0000-4000-8000-999999999999" } } })], ["artifact version", f => ({ ...f, payload: { ...f.payload, version: "x" } })], ["workflow version", f => ({ ...f, payload: { ...f.payload, execution: { ...f.payload.execution, workflowVersion: "x" } } })], ["canonicalization", f => ({ ...f, payload: { ...f.payload, integrity: { ...f.payload.integrity, canonicalizationVersion: "x" } } })], ["hash", f => ({ ...f, payload: { ...f.payload, integrity: { ...f.payload.integrity, artifactHash: "1".repeat(64) } } })], ["source count", f => ({ ...f, projection: { ...f.projection, sourceCount: f.projection.sourceCount + 1 } })], ["independent count", f => ({ ...f, projection: { ...f.projection, independentSourceCount: f.projection.independentSourceCount + 1 } })], ["score10", f => ({ ...f, projection: { ...f.projection, score10: f.projection.score10 + 1 } })], ["score100", f => ({ ...f, projection: { ...f.projection, score100: f.projection.score100 + 1 } })], ["reliability", f => ({ ...f, projection: { ...f.projection, reliabilityClassification: "different" } }) as unknown as PersistFixture], ["readiness", f => ({ ...f, projection: { ...f.projection, validationReadiness: "different" } }) as unknown as PersistFixture], ["category", f => ({ ...f, projection: { ...f.projection, recommendedCategory: "different" } }) as unknown as PersistFixture] ]; for (const [name, mutate] of cases) { const r = rpcAsServiceRole(mutate(base)); assert.equal(r.status, "invalid", name); assert.equal(countRows(), "0", name); } });

test("append-only trigger blocks direct update and delete", async () => { truncateLocalOnly(); const f = await fixture("000000000501"); rpcAsServiceRole(f); const before = inspectStoredAppendOnlyState(); assert.deepEqual(before.artifact_payload, f.payload); assert.throws(() => psql("update public.scan_intelligence_artifacts set score10=0;"), assertAppendOnlyError); assert.throws(() => psql("delete from public.scan_intelligence_artifacts;"), assertAppendOnlyError); const after = inspectStoredAppendOnlyState(); assert.equal(countRows(), "1"); assert.deepEqual(after.artifact_payload, before.artifact_payload); assert.equal(after.created_at, before.created_at); });

test("read and corruption probes classify owner scope and stored-row inconsistencies", async () => { truncateLocalOnly(); const f = await fixture("000000000601"); rpcAsServiceRole(f); assert.equal(countRows(` where owner_id=${q(scanArtifactOwnerB)}::uuid and artifact_id=${q(f.artifact.artifactId)}`), "0"); const valid = inspectStoredRow(` where owner_id=${q(f.ownerId)}::uuid and artifact_id=${q(f.artifact.artifactId)}`); assert.equal(canonicalSerializeScanIntelligenceArtifact(valid.artifact_payload), canonicalSerializeScanIntelligenceArtifact(f.artifact)); const corruptions = [
    ["malformed payload", "artifact_payload='{}'::jsonb"],
    ["Artifact ID mismatch", `artifact_payload=jsonb_set(artifact_payload,'{artifactId}',${q(JSON.stringify("scan-artifact-00000000-0000-4000-8000-999999999999"))}::jsonb)`],
    ["execution mismatch", "execution_id='scan-workflow-00000000-0000-4000-8000-999999999999'"],
    ["hash mismatch", `artifact_hash=${q("1".repeat(64))}`],
    ["projection mismatch", "score10=0"]
  ] as const;
  for (const [name, set] of corruptions) { psql("alter table public.scan_intelligence_artifacts disable trigger scan_artifacts_append_only;"); try { psql(`update public.scan_intelligence_artifacts set ${set};`); const row = inspectStoredRow(); assert.throws(() => validateStoredScanArtifactRow(row), (e) => e instanceof ScanArtifactPersistenceError && e.code === "scan_artifact_persistence_corrupt", name); } finally { psql("alter table public.scan_intelligence_artifacts enable trigger scan_artifacts_append_only; truncate table public.scan_intelligence_artifacts restart identity;"); rpcAsServiceRole(f); } } });

async function settledJsonPair<T>(promises: [Promise<T>, Promise<T>]) {
  const settled = await Promise.allSettled(promises);
  const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
  return settled.map(result => (result as PromiseFulfilledResult<T>).value);
}

test("real PostgreSQL concurrent equal and conflicting RPC calls serialize deterministically", async () => { truncateLocalOnly(); const equal = await fixture("000000000701"); const call = () => rpcAsServiceRoleAsync(equal); const equalResults = await settledJsonPair([call(), call()]); assert.deepEqual(equalResults.map(r => r.status).sort(), ["inserted", "replayed"]); assert.equal(countRows(), "1"); assert.equal(inspectStoredRow().artifact_hash, equal.artifact.integrity.artifactHash); truncateLocalOnly(); const a = await fixture("000000000702"); const b = await fixture("000000000703"); const conflictResults = await settledJsonPair([rpcAsServiceRoleAsync(a), rpcAsServiceRoleAsync({ ...b, ownerId: a.ownerId, idempotencyKey: a.idempotencyKey })]); assert.deepEqual(conflictResults.map(r => r.status).sort(), ["conflict", "inserted"]); assert.equal(countRows(), "1"); assert.equal(inspectStoredRow().artifact_id, a.artifact.artifactId); });
