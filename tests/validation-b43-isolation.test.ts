import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertClusterIdentity,
  assertContainerIdentity,
  assertDedicatedNetworkIdentity,
  assertDisposableConfig,
  assertIsolatedPath,
  assertProjectId,
  assertPublishedContainerIsExpected,
  buildRoleBoundaryNegativeControls,
  buildRoleBoundaryQuery,
  classifyPostgrestDenial,
  classifyTrustedCurrentRead,
  B43_API_PORT,
  B43_API_URL,
  B43_DATABASE_PORT,
  B43_DATABASE_URL,
  B43_MANIFEST_NAME,
  B43_PROJECT_PREFIX,
  B43_SHADOW_PORT,
  expectedB43NetworkName,
  hasEffectiveRoleIdentity,
  isExpectedLocalRpcCredential,
  isTrustedMigrationPrincipalResult,
  sqlStateDiagnostic,
  type ContainerIdentity,
  type DockerNetworkIdentity,
  type DisposableManifest,
} from "../scripts/validation-b43-isolation.ts";

const projectId = `${B43_PROJECT_PREFIX}a1b2c3d4e5f6`;
const projectDir = join(tmpdir(), projectId);

test("RPC denial requires structured 42501, null data and HTTP permission status", () => {
  const denied = { status: 403, data: null, error: { code: "42501", message: "PRIVATE_MESSAGE", details: "PRIVATE_DETAILS" } };
  assert.equal(classifyPostgrestDenial(denied), "expected_denial");
  assert.equal(classifyPostgrestDenial({ ...denied, status: 401 }), "expected_denial");
  assert.equal(classifyPostgrestDenial({ status: 200, data: {}, error: null }), "unexpected_success");
  assert.equal(classifyPostgrestDenial({ ...denied, status: 500 }), "unexpected_http_status:500");
  assert.equal(classifyPostgrestDenial({ ...denied, status: 0 }), "transport_error");
  assert.equal(classifyPostgrestDenial({ ...denied, error: { code: "42P01", message: "PRIVATE" } }), "unexpected_sqlstate:42P01");
  assert.equal(classifyPostgrestDenial({ ...denied, error: { code: "PGRST202", message: "PRIVATE" } }), "unexpected_postgrest_error:PGRST202");
  for (const response of [null, [], {}, { ...denied, status: "403" }, { ...denied, data: [] },
    { ...denied, error: "42501" }, { ...denied, error: { code: "42501" } }]) {
    assert.equal(classifyPostgrestDenial(response), "malformed_response");
  }
});

test("trusted SQL unavailable control requires postgres identity and exactly P0001", () => {
  const denied = { status: 1, stdout: "postgres|postgres\n", stderr: "ERROR:  P0001\n" };
  assert.equal(classifyTrustedCurrentRead(denied, "unavailable"), "expected_denial");
  assert.equal(classifyTrustedCurrentRead({ ...denied, status: 0, stderr: "" }, "unavailable"), "unexpected_success");
  assert.equal(classifyTrustedCurrentRead({ ...denied, stdout: "postgres|anon\n" }, "unavailable"), "wrong_identity");
  assert.equal(classifyTrustedCurrentRead({ ...denied, stdout: "authenticator|anon\n" }, "unavailable"), "wrong_identity");
  assert.equal(classifyTrustedCurrentRead({ ...denied, stderr: "ERROR:  42501\n" }, "unavailable"), "sqlstate:42501");
  assert.equal(classifyTrustedCurrentRead({ ...denied, stderr: "PRIVATE_ERROR" }, "unavailable"), "unclassified_sql_error");
  assert.notEqual(classifyTrustedCurrentRead({ ...denied, stderr: "ERROR: P0001\nMALFORMED_EXTRA_OUTPUT" }, "unavailable"), "expected_denial");
  assert.notEqual(classifyTrustedCurrentRead({ ...denied, stdout: "postgres|postgres\nEXTRA_ROW\n" }, "unavailable"), "expected_denial");
  assert.equal(classifyTrustedCurrentRead({ ...denied, status: null }, "unavailable"), "transport_error");
});

test("trusted SQL success requires an actual complete empty result, never malformed or private data", () => {
  const result = { status: 0, stdout: 'postgres|postgres\n{"complete":true,"observations":[]}\n', stderr: "" };
  assert.equal(classifyTrustedCurrentRead(result, "empty"), "expected_success");
  for (const data of [null, {}, { complete: false, observations: [] }, { complete: true, observations: [{}] },
    { complete: true, observations: [], privateEvidence: "PRIVATE" }]) {
    assert.equal(classifyTrustedCurrentRead({ ...result, stdout: `postgres|postgres\n${JSON.stringify(data)}\n` }, "empty"), "malformed_response");
  }
  assert.equal(classifyTrustedCurrentRead({ ...result, stdout: "postgres|postgres\nnot-json\n" }, "empty"), "malformed_response");
  assert.equal(classifyTrustedCurrentRead({ ...result, stderr: "ERROR: PRIVATE_UNCLASSIFIED_ERROR" }, "empty"), "malformed_response");
  assert.equal(classifyTrustedCurrentRead({ ...result, stdout: result.stdout.replace("postgres|postgres", "postgres|anon") }, "empty"), "wrong_identity");
  assert.equal(classifyTrustedCurrentRead({ status: 1, stdout: "postgres|postgres\n", stderr: "ERROR: P0001\n" }, "empty"), "sqlstate:P0001");
  assert.equal(classifyTrustedCurrentRead(undefined, "empty"), "malformed_response");
});

test("diagnostics contain protocol metadata, never raw private errors", () => {
  assert.equal(sqlStateDiagnostic("ERROR:  XX000 PRIVATE_TOKEN_AND_EVIDENCE\n"), "sqlstate:XX000");
  assert.equal(sqlStateDiagnostic("PRIVATE_TOKEN_AND_EVIDENCE"), "unclassified_sql_error");
  assert.equal(sqlStateDiagnostic("ERROR: P0001\nERROR: XX000\n"), "unclassified_sql_error");
  const diagnostic = classifyPostgrestDenial({ status: 502, data: null,
    error: { code: "PRIVATE_TOKEN_AND_EVIDENCE", message: "PRIVATE_TOKEN_AND_EVIDENCE" } });
  assert.equal(diagnostic, "unexpected_http_status:502");
});

test("local RPC credential proof rejects wrong role, signature, algorithm and destination", () => {
  const secret = "synthetic-test-secret";
  const token = (role: string, alg = "HS256") => {
    const input = `${Buffer.from(JSON.stringify({ alg })).toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}`;
    return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
  };
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(isExpectedLocalRpcCredential(B43_API_URL, token(role), secret, role), true);
  }
  assert.equal(isExpectedLocalRpcCredential(B43_API_URL, token("service_role"), secret, "anon"), false);
  assert.equal(isExpectedLocalRpcCredential(B43_API_URL, token("postgres"), secret, "postgres"), false);
  assert.equal(isExpectedLocalRpcCredential(B43_API_URL, token("anon"), "wrong-secret", "anon"), false);
  assert.equal(isExpectedLocalRpcCredential(B43_API_URL, token("anon", "none"), secret, "anon"), false);
  assert.equal(isExpectedLocalRpcCredential("https://unexpected.invalid", token("anon"), secret, "anon"), false);
  for (const credential of [null, "", "bad.jwt", "!.!.!", "e30.e30.invalid"]) {
    assert.equal(isExpectedLocalRpcCredential(B43_API_URL, credential, secret, "anon"), false);
  }
});

test("runner separates RPC denials, pre-fixture rejection and post-fixture SQL success", () => {
  const runner = readFileSync("scripts/validation-b43-db.ts", "utf8");
  const boundary = runner.slice(runner.indexOf("async function verifyPostgrestExecutionBoundary"), runner.indexOf("function makePsqlProcess"));
  assert.match(boundary, /expectCurrentReadUnavailable\("missing canonical must fail closed"\)/);
  assert.doesNotMatch(boundary, /readCurrentEvidence\(/);
  const run = runner.slice(runner.indexOf("async function run()"));
  const commit = run.indexOf("commit;");
  const success = run.indexOf("const direct = readCurrentEvidence()");
  assert.ok(commit >= 0 && success > commit);
  assert.doesNotMatch(runner, /readCurrentQualifiedValidationEvidence/);
  assert.match(runner, /isExpectedLocalRpcCredential\(B43_API_URL, credential, status.JWT_SECRET, role\)/);
  assert.match(runner, /classifyPostgrestDenial\(response\)/);
  assert.match(runner, /classifyTrustedCurrentRead\(result, "unavailable"\)/);
  assert.match(runner, /transport_exception/);
});

test("effective-role denials require a marker after SET ROLE, not a failed SET ROLE", () => {
  assert.equal(hasEffectiveRoleIdentity("postgres|anon\n", "anon"), true);
  assert.equal(hasEffectiveRoleIdentity("postgres|service_role\r\n", "service_role"), true);
  for (const output of ["", "postgres|postgres\n", "anon|anon\n", "postgres|service_role\n",
    "postgres|anon|extra\n", "postgres|anon\npostgres|anon\n"]) {
    assert.equal(hasEffectiveRoleIdentity(output, "anon"), false);
  }
});

test("role boundary checks named catalog roles rather than the postgres session", () => {
  const query = buildRoleBoundaryQuery(["anon", "authenticated", "service_role", "authenticator"], ["postgres"]);
  assert.match(query, /rolname in \('anon','authenticated','service_role','authenticator'\)/);
  assert.match(query, /rolname in \('postgres'\)/);
  assert.match(query, /count\(\*\) from sources\)=4/);
  assert.match(query, /count\(\*\) from targets\)=1/);
  for (const privilege of ["SET", "USAGE", "MEMBER"]) {
    assert.ok(query.includes(`pg_catalog.pg_has_role(s.oid,t.oid,'${privilege}')`));
  }
  assert.match(query, /where rolsuper or rolcreaterole/);
  assert.match(query, /rolbypassrls and rolname<>'service_role'/);
  assert.match(query, /m.admin_option/);
  assert.match(query, /pg_catalog.pg_has_role\(s.oid,m.member,'MEMBER'\)/);
  assert.match(query, /pg_catalog.pg_has_role\(m.roleid,t.oid,'MEMBER'\)/);
  assert.doesNotMatch(query, /session_user|current_user|set role/i);
});

test("role boundary refuses empty, duplicate or unsafe role identifiers", () => {
  for (const names of [[], ["anon", "anon"], [""], ["missing role"], ["anon'; reset role; --"]]) {
    assert.throws(() => buildRoleBoundaryQuery(names, ["postgres"]));
    assert.throws(() => buildRoleBoundaryQuery(["anon"], names));
  }
});

test("negative controls use real transactional memberships only between unprivileged stand-ins", () => {
  const controls = buildRoleBoundaryNegativeControls();
  assert.ok(controls.startsWith("begin;"));
  assert.ok(controls.endsWith("rollback;"));
  assert.equal((controls.match(/create role .* nologin nosuperuser nocreaterole nobypassrls;/g) ?? []).length, 3);
  assert.equal((controls.match(/^\s*savepoint boundary_case;/gm) ?? []).length, 8);
  assert.equal((controls.match(/rollback to savepoint boundary_case;/g) ?? []).length, 8);
  assert.equal((controls.match(/is distinct from false/g) ?? []).length, 8);
  assert.equal((controls.match(/is distinct from true/g) ?? []).length, 9);
  for (const option of ["set true", "set false", "inherit true", "inherit false", "admin true", "admin false"]) {
    assert.ok(controls.includes(`with ${option};`));
  }
  const grants = controls.split("\n").filter((line) => /^\s*grant /i.test(line));
  assert.ok(grants.length > 0);
  for (const grant of grants) {
    assert.match(grant, /^\s*grant b43_boundary_probe_(?:owner|bridge) to b43_boundary_probe_(?:app|bridge) with (?:set|inherit|admin) (?:true|false);/);
  }
  assert.doesNotMatch(controls, /alter role|drop role|grant .* on /);
});

test("runner replaces the invalid escalation assertion without losing DML or catalog checks", () => {
  const runner = readFileSync("scripts/validation-b43-db.ts", "utf8");
  assert.match(runner, /sql\(buildRoleBoundaryQuery\(roles, owners\)\) === "t"/);
  assert.match(runner, /sql\(buildRoleBoundaryNegativeControls\(\)/);
  assert.match(runner, /role boundary negative controls did not roll back/);
  assert.match(runner, /set role anon; set role postgres; select session_user/);
  assert.doesNotMatch(runner, /expectSqlState\(`set role \$\{role\}; set role postgres;/);
  assert.match(runner, /alter table public.validation_evidence_source_restrictions disable trigger all/);
  assert.match(runner, /hasEffectiveRoleIdentity\(result.stdout, effectiveRole\)/);
  assert.match(runner, /select session_user\|\|'\|'\|\|current_user; truncate public/);
  assert.match(runner, /union select p.proowner/);
  assert.match(runner, /union select nspowner/);
});

test("migration principal accepts the secure PostgreSQL text-cast result", () => {
  assert.equal(isTrustedMigrationPrincipalResult("postgres|postgres|true|false"), true);
});

test("migration principal rejects insecure identities and privilege combinations", () => {
  for (const result of [
    "service_role|postgres|true|false",
    "postgres|service_role|true|false",
    "postgres|postgres|false|false",
    "postgres|postgres|true|true",
    "postgres|postgres|false|true",
  ]) assert.equal(isTrustedMigrationPrincipalResult(result), false);
});

test("migration principal rejects missing, malformed and additional result data", () => {
  for (const result of [
    undefined, null, false, 0, {}, [],
    "", "postgres|postgres", "postgres|postgres|true",
    "postgres|postgres||false", "postgres|postgres|true|",
    "postgres|postgres|true|false|unexpected",
    "postgres|postgres|true|false\npostgres|postgres|true|false",
    "postgres|postgres|true|false\npostgres|postgres|true|true",
  ]) assert.equal(isTrustedMigrationPrincipalResult(result), false);
});

test("migration principal rejects unexpected boolean encodings and whitespace", () => {
  for (const result of [
    "postgres|postgres|true|f", "postgres|postgres|t|f",
    "postgres|postgres|TRUE|FALSE", "postgres|postgres|1|0",
    "postgres|postgres|true|NULL", "postgres|postgres|true|unknown",
    " postgres|postgres|true|false", "postgres|postgres|true|false ",
    "postgres|postgres|true|false\n",
  ]) assert.equal(isTrustedMigrationPrincipalResult(result), false);
});

const config = `project_id = "${projectId}"
[api]
enabled = true
port = ${B43_API_PORT}
[db]
port = ${B43_DATABASE_PORT}
shadow_port = ${B43_SHADOW_PORT}
[db.pooler]
enabled = false
port = 54329
[studio]
enabled = false
port = 54323
[local_smtp]
enabled = false
port = 54324
[edge_runtime]
enabled = false
inspector_port = 8083
[analytics]
enabled = false
port = 54327
`;
const db: ContainerIdentity = {
  id: "db-container-id", name: `supabase_db_${projectId}`, project: projectId, composeProject: projectId,
  image: "public.ecr.aws/supabase/postgres:17.6.1.143", state: "running",
  publishedPorts: [{ hostIp: "127.0.0.1", hostPort: B43_DATABASE_PORT, containerPort: 5432 }],
  networkIds: ["network-id"],
};
const api: ContainerIdentity = {
  id: "api-container-id", name: `supabase_kong_${projectId}`, project: projectId, composeProject: projectId,
  image: "public.ecr.aws/supabase/kong:2.8.1", state: "running",
  publishedPorts: [{ hostIp: "127.0.0.1", hostPort: B43_API_PORT, containerPort: 8000 }],
  networkIds: ["network-id"],
};
function manifestFor(configText: string): DisposableManifest {
  return {
    schemaVersion: 2,
    projectId,
    apiUrl: B43_API_URL,
    databaseUrl: B43_DATABASE_URL,
    projectDir,
    configSha256: createHash("sha256").update(configText).digest("hex"),
    migrationHashes: {},
  };
}

test("disposable identity rejects the ordinary project and mismatched project IDs", () => {
  assertProjectId(projectId, projectId);
  assert.throws(() => assertProjectId("saasscout-landing", "saasscout-landing"));
  assert.throws(() => assertProjectId(projectId, `${B43_PROJECT_PREFIX}000000000000`));
  assert.throws(() => assertProjectId("saasscout-b43-disposable-invalid", "saasscout-b43-disposable-invalid"));
});

test("isolated config and temporary manifest must bind the expected project and endpoints", () => {
  assertIsolatedPath(projectDir, join(projectDir, B43_MANIFEST_NAME));
  assert.throws(() => assertIsolatedPath(projectDir, join(projectDir, "nested", B43_MANIFEST_NAME)));
  assertDisposableConfig(config, manifestFor(config));
  const wrongDatabasePort = config.replace(String(B43_DATABASE_PORT), "54322");
  assert.throws(() => assertDisposableConfig(wrongDatabasePort, manifestFor(wrongDatabasePort)));
  const ordinaryProject = config.replace(projectId, "saasscout-landing");
  assert.throws(() => assertDisposableConfig(ordinaryProject, manifestFor(ordinaryProject)));
  const enabledSmtp = config.replace("enabled = false\nport = 54324", "enabled = true\nport = 54324");
  assert.throws(() => assertDisposableConfig(enabledSmtp, manifestFor(enabledSmtp)));
  const enabledEdgeRuntime = config.replace("enabled = false\ninspector_port = 8083", "enabled = true\ninspector_port = 8083");
  assert.throws(() => assertDisposableConfig(enabledEdgeRuntime, manifestFor(enabledEdgeRuntime)));
  const additionalEnabledPort = config.replace("enabled = false\nport = 54329", "enabled = true\nport = 55429");
  assert.throws(() => assertDisposableConfig(additionalEnabledPort, manifestFor(additionalEnabledPort)));
});

test("project labels, exact names, images, and ports bind to one disposable DB and API container", () => {
  const verified = assertContainerIdentity([db, api], projectId);
  assert.equal(verified.database.id, db.id);
  assert.equal(verified.api.id, api.id);
  assert.throws(() => assertContainerIdentity([db, api, { ...db, id: "duplicate-db" }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, project: "saasscout-landing" }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, composeProject: "other-project" }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, project: "", composeProject: "" }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, name: `supabase_rest_${projectId}` }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, image: "nginx:latest" }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, state: "exited" }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, publishedPorts: [{ hostIp: "", hostPort: B43_API_PORT, containerPort: 8000 }] }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, publishedPorts: [{ hostIp: "0.0.0.0", hostPort: B43_API_PORT, containerPort: 8000 }] }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, publishedPorts: [{ hostIp: "::", hostPort: B43_API_PORT, containerPort: 8000 }] }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, publishedPorts: [{ hostIp: "::1", hostPort: B43_API_PORT, containerPort: 8000 }] }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, publishedPorts: [
    { hostIp: "127.0.0.1", hostPort: B43_API_PORT, containerPort: 8000 },
    { hostIp: "0.0.0.0", hostPort: B43_API_PORT, containerPort: 8000 },
  ] }], projectId));
  assertPublishedContainerIsExpected([db.id], db.id);
  assert.throws(() => assertPublishedContainerIsExpected(["other-container", db.id], db.id));
});

test("dedicated Docker network identity, loopback option, and exclusive attachments are verified", () => {
  const network: DockerNetworkIdentity = {
    id: "network-id",
    name: expectedB43NetworkName(projectId),
    driver: "bridge",
    options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
    attachedContainerIds: [db.id, api.id],
  };
  assert.doesNotThrow(() => assertDedicatedNetworkIdentity(network, projectId, "network-id", [db, api]));
  assert.throws(() => assertDedicatedNetworkIdentity({ ...network, id: "other-network" }, projectId, "network-id", [db, api]));
  assert.throws(() => assertDedicatedNetworkIdentity({ ...network, name: "bridge" }, projectId, "network-id", [db, api]));
  assert.throws(() => assertDedicatedNetworkIdentity({ ...network, driver: "host" }, projectId, "network-id", [db, api]));
  assert.throws(() => assertDedicatedNetworkIdentity({ ...network, options: {} }, projectId, "network-id", [db, api]));
  assert.throws(() => assertDedicatedNetworkIdentity({ ...network, attachedContainerIds: [db.id, api.id, "unrelated"] }, projectId, "network-id", [db, api]));
  assert.throws(() => assertDedicatedNetworkIdentity({ ...network, attachedContainerIds: [db.id] }, projectId, "network-id", [db, api]));
  assert.throws(() => assertDedicatedNetworkIdentity(network, projectId, "other-network", [db, api]));
  assert.throws(() => assertContainerIdentity([db, { ...api, networkIds: ["another-network"] }], projectId));
  assert.throws(() => assertContainerIdentity([db, { ...api, publishedPorts: [
    { hostIp: "127.0.0.1", hostPort: B43_API_PORT, containerPort: 8000 },
    { hostIp: "::1", hostPort: 8083, containerPort: 8083 },
  ] }], projectId));
});

test("host PostgreSQL cluster must match the separately inspected database container", () => {
  assertClusterIdentity("postgres|5432|711223344", "711223344");
  assert.throws(() => assertClusterIdentity("postgres|5432|711223344", "99887766"));
  assert.throws(() => assertClusterIdentity("postgres|5433|711223344", "711223344"));
});

test("the database runner verifies identity but cannot start or reset Supabase", () => {
  const runner = readFileSync("scripts/validation-b43-db.ts", "utf8");
  const preparer = readFileSync("scripts/prepare-validation-b43-disposable.ts", "utf8");
  assert.match(runner, /dockerIdentity\(projectId, networkId\)/);
  assert.match(runner, /assertDedicatedNetworkIdentity/);
  assert.match(runner, /databaseClusterIdentity\(containers\.database\.id\)/);
  assert.match(runner, /VALIDATION_B43_PROJECT_ID/);
  assert.match(runner, /VALIDATION_B43_DOCKER_NETWORK_ID/);
  assert.match(runner, /bound exclusively to IPv4 loopback/);
  const identity = readFileSync("scripts/validation-b43-isolation.ts", "utf8");
  assert.match(identity, /supabase_kong_\$\{projectId\}/);
  assert.match(runner, /com\.docker\.compose\.project/);
  assert.match(runner, /--format", "\{\{\.ID\}\}"/);
  assert.match(runner, /assertCompleteMigrationChain\(\)/);
  assert.match(runner, /assertFreshApplicationDatabase\(\)/);
  assert.doesNotMatch(runner, /\["start"\]|\["db",\s*"reset"/);
  assert.match(preparer, /mkdtempSync/);
  assert.match(preparer, /project_id = "\$\{projectId\}"/);
  assert.match(preparer, /setSectionValue\(config, "local_smtp", "enabled", "false"\)/);
  assert.match(preparer, /setSectionValue\(config, "edge_runtime", "enabled", "false"\)/);
  assert.doesNotMatch(preparer, /\.env\.local|\.env(?:['"/\\]|$)/);
});

test("workflow gates B4.3 reset behind manual authorization and network plus identity preflights", () => {
  const workflow = readFileSync(".github/workflows/validation-b31-database.yml", "utf8");
  const job = workflow.slice(workflow.indexOf("  b43-disposable-database:"));
  assert.match(job, /if: github\.event_name == 'workflow_dispatch' && inputs\.authorize_disposable_reset == true/);
  assert.match(job, /environment: b43-disposable-database-validation/);
  const networkCreate = job.indexOf("docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1");
  const start = job.indexOf('start --network-id "$NETWORK_ID"');
  const preflight = job.indexOf("node scripts/validation-b43-db.ts --preflight-only");
  const reset = job.indexOf("db reset --local --no-seed");
  const testRun = job.indexOf("run: node scripts/validation-b43-db.ts\n");
  assert.ok(networkCreate >= 0 && networkCreate < start && start < preflight && preflight < reset && reset < testRun);
  assert.equal((job.match(/VALIDATION_B43_DOCKER_NETWORK_ID: \$\{\{ steps\.network\.outputs\.networkId \}\}/g) ?? []).length, 2);
  assert.doesNotMatch(job, /supabase link|--linked|https:\/\/[^\s]+\.supabase\.co/i);
});

test("reset recreates PostgreSQL on the same verified network used by startup", () => {
  const workflow = readFileSync(".github/workflows/validation-b31-database.yml", "utf8");
  const job = workflow.slice(workflow.indexOf("  b43-disposable-database:"));
  const start = job.slice(job.indexOf("      - name: Start only"), job.indexOf("      - name: Verify container"));
  const reset = job.slice(job.indexOf("      - name: Reset only"), job.indexOf("      - name: Execute B4.3-B"));
  for (const step of [start, reset]) {
    assert.match(step, /PROJECT_DIR: \$\{\{ steps\.disposable\.outputs\.projectDir \}\}/);
    assert.match(step, /NETWORK_ID: \$\{\{ steps\.network\.outputs\.networkId \}\}/);
    assert.match(step, /--network-id "\$NETWORK_ID"/);
    assert.match(step, /--workdir "\$PROJECT_DIR"/);
  }
  assert.match(reset, /run: supabase --workdir "\$PROJECT_DIR" --network-id "\$NETWORK_ID" db reset --local --no-seed/);
});

test("isolated suite preserves setup-cli PATH instead of selecting npm's different CLI", () => {
  const workflow = readFileSync(".github/workflows/validation-b31-database.yml", "utf8");
  const job = workflow.slice(workflow.indexOf("  b43-disposable-database:"));
  assert.match(job, /version: 2\.118\.0/);
  assert.match(job, /run: node scripts\/validation-b43-db\.ts\n/);
  assert.doesNotMatch(job, /run: npm run test:validation-b43-db/);
});

test("a recreated database on the fallback network fails the existing identity boundary", () => {
  const recreatedDb = { ...db, id: "recreated-db", networkIds: ["fallback-network"] };
  assert.throws(() => assertContainerIdentity([recreatedDb, api], projectId));
});

test("database suite contains real privilege, lifecycle, proof, completeness, rollback, and concurrency assertions", () => {
  const runner = readFileSync("scripts/validation-b43-db.ts", "utf8");
  for (const assertion of [
    "has_table_privilege", "has_function_privilege", "pg_has_role", "relforcerowsecurity",
    "expectPostgrestPermissionDenied", "session_cancelled", "canonical_merged",
    "unsupported schema version", "candidate population overflow", "b43_authority_rejection_hits",
    "pg_stat_activity", "readTrustedQualifiedValidationEvidence",
  ]) assert.ok(runner.includes(assertion), `missing integration assertion: ${assertion}`);
});
