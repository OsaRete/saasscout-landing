import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  B43_API_PORT,
  B43_API_URL,
  B43_DATABASE_PORT,
  B43_DATABASE_URL,
  B43_MANIFEST_NAME,
  B43_PROJECT_PREFIX,
  B43_SHADOW_PORT,
  expectedB43NetworkName,
  type ContainerIdentity,
  type DockerNetworkIdentity,
  type DisposableManifest,
} from "../scripts/validation-b43-isolation.ts";

const projectId = `${B43_PROJECT_PREFIX}a1b2c3d4e5f6`;
const projectDir = join(tmpdir(), projectId);
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
  const testRun = job.indexOf("npm run test:validation-b43-db");
  assert.ok(networkCreate >= 0 && networkCreate < start && start < preflight && preflight < reset && reset < testRun);
  assert.equal((job.match(/VALIDATION_B43_DOCKER_NETWORK_ID: \$\{\{ steps\.network\.outputs\.networkId \}\}/g) ?? []).length, 2);
  assert.doesNotMatch(job, /supabase link|--linked|https:\/\/[^\s]+\.supabase\.co/i);
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
