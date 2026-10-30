import { createHash, createHmac } from "node:crypto";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promoteCustomerInterviewEvidence } from "../lib/validation/promotion/promotion-service.ts";
import { readCurrentQualifiedValidationEvidence } from "../lib/validation/promotion/current-qualified-evidence-reader.ts";
import { readTrustedQualifiedValidationEvidence } from "../lib/validation/promotion/trusted-qualified-evidence-reader.ts";
import {
  assertClusterIdentity,
  assertContainerIdentity,
  assertDedicatedNetworkIdentity,
  assertDisposableConfig,
  assertIsolatedPath,
  assertPublishedContainerIsExpected,
  B43_API_PORT,
  B43_API_URL,
  B43_DATABASE_PORT,
  B43_DATABASE_URL,
  B43_MANIFEST_NAME,
  expectedB43NetworkName,
  type ContainerIdentity,
  type DockerNetworkIdentity,
  type DisposableManifest,
} from "./validation-b43-isolation.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceMigrationsDir = join(repositoryRoot, "supabase", "migrations");
const owner = "10000000-0000-0000-0000-000000000001";
const canonical = "20000000-0000-0000-0000-000000000001";
const targetCanonical = "20000000-0000-0000-0000-000000000002";
const conflictCanonical = "20000000-0000-0000-0000-000000000003";
const participant = (n: number) => `90000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const observation = (n: number) => `b0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const classification = (n: number) => `c0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const uuid = (prefix: string, n: number) => `${prefix}0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const sharedId = (n: number) => uuid("d", n);
const postgresIdentityQuery = "select current_database()||'|'||inet_server_port()||'|'||(select system_identifier::text from pg_control_system())";
let phase = "disposable project identity";
let failure = "test assertion failed";

function check(value: unknown, label: string): asserts value {
  if (!value) {
    failure = label;
    throw new Error(label);
  }
}

function sanitizedProcessEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  env.SUPABASE_TELEMETRY_DISABLED = "1";
  for (const key of Object.keys(env)) {
    if (/^(?:PG[A-Z0-9_]*|DATABASE_URL|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN)$/.test(key)) delete env[key];
  }
  return env;
}

function command(commandName: string, args: readonly string[], label: string, maxBuffer = 2 * 1024 * 1024): string {
  const result = spawnSync(commandName, [...args], {
    encoding: "utf8", timeout: 20000, maxBuffer, env: sanitizedProcessEnv(),
  });
  check(!result.error && result.status === 0, label);
  return result.stdout.trim();
}

function projectIdentityInputs(): Readonly<{ projectDir: string; projectId: string; manifest: DisposableManifest }> {
  check(process.env.VALIDATION_B43_DISPOSABLE === "1", "explicit disposable test opt-in required");
  const projectDirValue = process.env.VALIDATION_B43_PROJECT_DIR;
  const projectId = process.env.VALIDATION_B43_PROJECT_ID;
  check(projectDirValue && projectId, "disposable project path and identifier are required");
  const projectDir = realpathSync(projectDirValue);
  const manifestPath = join(projectDir, B43_MANIFEST_NAME);
  assertIsolatedPath(projectDir, manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DisposableManifest;
  check(manifest.schemaVersion === 2 && manifest.projectDir === projectDir, "disposable identity manifest mismatch");
  check(process.env.VALIDATION_B43_API_URL === B43_API_URL &&
    process.env.VALIDATION_B43_DATABASE_URL === B43_DATABASE_URL, "explicit disposable endpoints mismatch");
  assertDisposableConfig(readFileSync(join(projectDir, "supabase", "config.toml"), "utf8"), manifest);
  check(projectId === manifest.projectId, "requested disposable project differs from its manifest");
  const sourceNames = readdirSync(sourceMigrationsDir).filter((name) => name.endsWith(".sql")).sort();
  const isolatedNames = readdirSync(join(projectDir, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
  check(JSON.stringify(sourceNames) === JSON.stringify(isolatedNames), "isolated migration chain is incomplete");
  for (const name of sourceNames) {
    const sourceHash = createHash("sha256").update(readFileSync(join(sourceMigrationsDir, name))).digest("hex");
    const isolatedHash = createHash("sha256").update(readFileSync(join(projectDir, "supabase", "migrations", name))).digest("hex");
    check(manifest.migrationHashes[name] === sourceHash && isolatedHash === sourceHash, "isolated migration chain differs from checkout");
  }
  return { projectDir, projectId, manifest };
}

function portMappings(raw: string): ContainerIdentity["publishedPorts"] {
  const ports = JSON.parse(raw) as Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  return Object.entries(ports).flatMap(([containerBinding, mappings]) => {
    const containerPort = Number(/^(\d+)\//.exec(containerBinding)?.[1]);
    return (mappings ?? []).map((mapping) => ({
      hostIp: mapping.HostIp ?? "",
      hostPort: Number(mapping.HostPort),
      containerPort,
    }));
  });
}

function dockerIdentity(projectId: string, expectedNetworkId: string): Readonly<{ database: ContainerIdentity; api: ContainerIdentity }> {
  const ids = command("docker", ["ps", "-a", "--no-trunc", "--format", "{{.ID}}"],
    "Docker container inventory query failed").split(/\r?\n/).filter(Boolean);
  check(ids.length > 0, "Docker container inventory is empty or unavailable");
  const containers: ContainerIdentity[] = ids.map((id) => {
    const raw = command("docker", ["inspect", "--format",
      "{{.Id}}|{{.Name}}|{{index .Config.Labels \"com.supabase.cli.project\"}}|{{index .Config.Labels \"com.docker.compose.project\"}}|{{.Config.Image}}|{{.State.Status}}|{{json .NetworkSettings.Ports}}|{{json .NetworkSettings.Networks}}", id],
    "Docker container inspection failed");
    const [containerId, rawName, project, composeProject, image, state, ports, networksRaw] = raw.split("|");
    check(containerId && rawName && project && composeProject && image && state && ports && networksRaw,
      "Docker project labels, exact name, state, image, port, or network metadata is incomplete");
    const networks = JSON.parse(networksRaw) as Record<string, { NetworkID?: string }>;
    return { id: containerId, name: rawName.replace(/^\//, ""), project, composeProject, image, state,
      publishedPorts: portMappings(ports), networkIds: Object.values(networks).map((network) => network.NetworkID ?? "") };
  });
  const found = assertContainerIdentity(containers, projectId);
  const networkRaw = command("docker", ["network", "inspect", "--format",
    "{{.Id}}|{{.Name}}|{{.Driver}}|{{json .Options}}|{{json .Containers}}", expectedNetworkId],
  "B43 dedicated Docker network inspection failed");
  const [networkId, networkName, driver, optionsRaw, attachedRaw] = networkRaw.split("|");
  check(networkId && networkName && driver && optionsRaw && attachedRaw,
    "B43 dedicated Docker network metadata is incomplete");
  const attached = JSON.parse(attachedRaw) as Record<string, unknown> | null;
  const network: DockerNetworkIdentity = {
    id: networkId,
    name: networkName,
    driver,
    options: JSON.parse(optionsRaw) as Record<string, string>,
    attachedContainerIds: Object.keys(attached ?? {}),
  };
  check(networkName === expectedB43NetworkName(projectId), "B43 dedicated Docker network name mismatch");
  assertDedicatedNetworkIdentity(network, projectId, expectedNetworkId, containers);
  for (const [port, id] of [[B43_DATABASE_PORT, found.database.id], [B43_API_PORT, found.api.id]] as const) {
    const published = command("docker", ["ps", "-a", "--no-trunc", "--filter", `publish=${port}`, "--format", "{{.ID}}"],
      "Docker published-port identity query failed").split(/\r?\n/).filter(Boolean);
    assertPublishedContainerIsExpected(published, id);
    const mapping = containers.find((container) => container.id === id)?.publishedPorts
      .find((entry) => entry.hostPort === port);
    check(mapping?.hostIp === "127.0.0.1", "published port is not bound exclusively to IPv4 loopback");
  }
  return found;
}

function databaseClusterIdentity(databaseContainerId: string): string {
  const fromContainer = command("docker", ["exec", databaseContainerId, "psql", "-U", "postgres", "-d", "postgres",
    "-X", "-A", "-t", "-q", "-w", "-c", "select system_identifier::text from pg_control_system()"],
  "PostgreSQL container identity query failed");
  const fromHost = command("psql", [B43_DATABASE_URL, "-X", "-A", "-t", "-q", "-w", "-v", "ON_ERROR_STOP=1", "-c", postgresIdentityQuery],
    "host PostgreSQL identity query failed");
  assertClusterIdentity(fromHost, fromContainer);
  return fromContainer;
}

function verifyLocalStatus(projectDir: string): Record<string, string> {
  const raw = command("supabase", ["--workdir", projectDir, "status", "-o", "json"], "local Supabase status unavailable");
  const status = JSON.parse(raw) as Record<string, string>;
  check(status.API_URL === B43_API_URL && status.DB_URL === B43_DATABASE_URL,
    "Supabase CLI status does not match disposable endpoints");
  check(status.SERVICE_ROLE_KEY && status.ANON_KEY && status.JWT_SECRET, "local role credentials unavailable");
  return status;
}

function verifyDisposableIdentity(): Readonly<{ projectId: string; dbContainerId: string; clusterId: string; status: Record<string, string> }> {
  const { projectDir, projectId } = projectIdentityInputs();
  check(projectId !== "saasscout-landing", "ordinary SaaSScout Supabase project is forbidden");
  const networkId = process.env.VALIDATION_B43_DOCKER_NETWORK_ID;
  check(networkId && /^[a-f0-9]{64}$/.test(networkId), "verified dedicated Docker network ID is required");
  const status = verifyLocalStatus(projectDir);
  const containers = dockerIdentity(projectId, networkId);
  const clusterId = databaseClusterIdentity(containers.database.id);
  return { projectId, dbContainerId: containers.database.id, clusterId, status };
}

function sqlRaw(statement: string, label = phase) {
  const result = spawnSync("psql", [B43_DATABASE_URL, "-X", "-A", "-t", "-q", "-w", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"], {
    input: `set statement_timeout='20s';\n${statement}`,
    encoding: "utf8", timeout: 25000, maxBuffer: 2 * 1024 * 1024, env: sanitizedProcessEnv(),
  });
  check(!result.error && result.status !== null, `${label}: psql unavailable`);
  return result;
}

function sql(statement: string, label = phase): string {
  const result = sqlRaw(statement, label);
  check(result.status === 0, `${label}: SQL failed`);
  return result.stdout.split(/\r?\n/).filter((line) => line && !line.startsWith("SET")).join("\n");
}

function expectSqlState(statement: string, expectedState: string, label: string): void {
  const result = sqlRaw(statement, label);
  check(result.status !== 0, `${label}: expected SQLSTATE ${expectedState}, statement succeeded`);
  const actual = /ERROR:\s+([0-9A-Z]{5})/.exec(result.stderr)?.[1];
  check(actual === expectedState, `${label}: expected SQLSTATE ${expectedState}, got ${actual ?? "unclassified SQL error"}`);
}

function fingerprint(i: number, polarity = "supporting") {
  return createHash("sha256").update(JSON.stringify({
    canonicalProblemId: canonical,
    classificationId: classification(i),
    observationId: observation(i),
    polarity,
    policyVersion: "v8-b1.2",
    projectionVersion: "v8-b3.1-projection.1",
    resolverVersion: "v8-b3.0.2-exact.1",
  })).digest("hex");
}

function encodeBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function clients(status: Record<string, string>): Readonly<{ admin: SupabaseClient; anonymous: SupabaseClient; authenticated: SupabaseClient }> {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(B43_API_URL, status.SERVICE_ROLE_KEY, options);
  const anonymous = createClient(B43_API_URL, status.ANON_KEY, options);
  const tokenInput = `${encodeBase64Url({ alg: "HS256", typ: "JWT" })}.${encodeBase64Url({
    role: "authenticated", sub: owner, aud: "authenticated", iss: "supabase",
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
  })}`;
  const token = `${tokenInput}.${createHmac("sha256", status.JWT_SECRET).update(tokenInput).digest("base64url")}`;
  const authenticated = createClient(B43_API_URL, status.ANON_KEY, {
    ...options, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { admin, anonymous, authenticated };
}

function expectPostgrestPermissionDenied(error: { code?: string; message?: string } | null, label: string): void {
  check(error?.code === "42501", `${label}: expected PostgreSQL permission denial 42501`);
}

async function expectCurrentReadUnavailable(admin: SupabaseClient, label: string): Promise<void> {
  const { error } = await admin.rpc("validation_b43_read_current_evidence", { p_canonical_problem_id: canonical });
  check(error?.code === "P0001" && error.message === "current evidence unavailable", `${label}: expected the sanitized unavailable result`);
}

function assertCompleteMigrationChain(): void {
  const versions = readdirSync(sourceMigrationsDir).filter((name) => name.endsWith(".sql")).map((name) => name.slice(0, 14)).sort();
  const actual = sql("select string_agg(version::text, ',' order by version) from supabase_migrations.schema_migrations");
  check(actual === versions.join(","), "database migration history does not match the complete checked-out chain");
}

function assertFreshApplicationDatabase(): void {
  const tables = [
    "auth.users", "public.canonical_problems", "public.problem_observations",
    "public.validation_subjects", "public.validation_hypotheses", "public.validation_hypothesis_versions",
    "public.validation_experiments", "public.validation_experiment_versions", "public.validation_interview_plan_versions",
    "public.validation_participants", "public.validation_interview_sessions", "public.validation_evidence_observations",
    "public.validation_evidence_classifications", "public.validation_customer_interview_shareable_evidence",
    "public.validation_evidence_promotions", "public.validation_qualified_evidence_snapshots",
    "public.validation_evidence_consumption_authority", "public.validation_evidence_source_restrictions",
  ];
  const counts = tables.map((table) => `select '${table}' as table_name, count(*)::bigint as n from ${table}`).join(" union all ");
  const nonempty = sql(`select string_agg(table_name||'='||n, ',' order by table_name) from (${counts}) current_counts where n<>0`);
  check(nonempty === "", "application tables are not empty after the disposable migration reset");
}

function assertDatabaseSecurityCatalog(): void {
  check(sql(`select bool_and(c.relrowsecurity and c.relforcerowsecurity and c.relowner='postgres'::regrole)
    from pg_class c where c.oid in ('public.validation_evidence_consumption_authority'::regclass,
      'public.validation_evidence_source_restrictions'::regclass)`) === "t", "B43 fact table RLS/ownership invariant failed");
  check(sql(`select bool_and(r.rolcanlogin is false and r.rolinherit is false and r.rolbypassrls is false)
    from pg_roles r where r.rolname in ('saasscout_b43_fact_writer','saasscout_b43_current_reader')`) === "t", "B43 internal role attributes are unsafe");
  check(sql(`select not pg_has_role('service_role','saasscout_b43_fact_writer','MEMBER')
    and not pg_has_role('service_role','saasscout_b43_current_reader','MEMBER')
    and not pg_has_role('saasscout_b43_fact_writer','service_role','MEMBER')
    and not pg_has_role('saasscout_b43_current_reader','service_role','MEMBER')
    and not exists(select 1 from pg_auth_members m where m.roleid in
      ('saasscout_b43_fact_writer'::regrole,'saasscout_b43_current_reader'::regrole)
      or m.member in ('saasscout_b43_fact_writer'::regrole,'saasscout_b43_current_reader'::regrole))`) === "t", "B43 role membership/inheritance boundary failed");

  const privateTables = ["validation_evidence_consumption_authority", "validation_evidence_source_restrictions"];
  for (const table of privateTables) {
    const q = `public.${table}`;
    const serviceDenied = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"].every((privilege) =>
      sql(`select not has_table_privilege('service_role','${q}','${privilege}')`) === "t");
    check(serviceDenied, `service_role has direct privileges on ${table}`);
    for (const role of ["anon", "authenticated"]) {
      const denied = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"].every((privilege) =>
        sql(`select not has_table_privilege('${role}','${q}','${privilege}')`) === "t");
      check(denied, `${role} has direct privileges on ${table}`);
    }
    check(sql(`select has_table_privilege('saasscout_b43_fact_writer','${q}','INSERT')
      and not has_table_privilege('saasscout_b43_fact_writer','${q}','UPDATE')
      and not has_table_privilege('saasscout_b43_fact_writer','${q}','DELETE')
      and not has_table_privilege('saasscout_b43_fact_writer','${q}','TRUNCATE')`) === "t", `fact-writer privileges are too broad on ${table}`);
    check(sql(`select has_table_privilege('saasscout_b43_current_reader','${q}','SELECT')
      and not has_table_privilege('saasscout_b43_current_reader','${q}','INSERT')
      and not has_table_privilege('saasscout_b43_current_reader','${q}','UPDATE')
      and not has_table_privilege('saasscout_b43_current_reader','${q}','DELETE')
      and not has_table_privilege('saasscout_b43_current_reader','${q}','TRUNCATE')`) === "t", `current-reader privileges are too broad on ${table}`);
  }
  check(sql(`select count(*)=2 and bool_and(p.polcmd='a') from pg_policy p
    where p.polrelid in ('public.validation_evidence_consumption_authority'::regclass,
      'public.validation_evidence_source_restrictions'::regclass)
      and p.polname in ('validation_b43_authority_writer_insert','validation_b43_restrictions_writer_insert')`) === "t", "fact writer RLS insert policies are incomplete");
  check(sql(`select has_function_privilege('service_role','public.validation_b43_read_current_evidence(uuid)','EXECUTE')
    and not has_function_privilege('anon','public.validation_b43_read_current_evidence(uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.validation_b43_read_current_evidence(uuid)','EXECUTE')
    and not exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where p.oid='public.validation_b43_read_current_evidence(uuid)'::regprocedure and acl.grantee=0 and acl.privilege_type='EXECUTE')`) === "t", "current RPC execute grants are not service-role-only");
  check(sql(`select p.prosecdef and p.proowner='saasscout_b43_current_reader'::regrole
    and exists(select 1 from unnest(p.proconfig) x where x like 'search_path=pg_catalog%')
    and has_function_privilege('service_role',p.oid,'EXECUTE')
    and not has_function_privilege('anon',p.oid,'EXECUTE')
    and not has_function_privilege('authenticated',p.oid,'EXECUTE')
    and not exists(select 1 from lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where acl.grantee=0 and acl.privilege_type='EXECUTE')
    from pg_proc p where p.oid='public.validation_b43_read_current_evidence(uuid)'::regprocedure`) === "t", "current RPC owner/SECURITY DEFINER/search_path invariant failed");
  check(sql(`select p.prosecdef and p.proowner='saasscout_b43_fact_writer'::regrole
    and not has_function_privilege('service_role',p.oid,'EXECUTE')
    and not has_function_privilege('anon',p.oid,'EXECUTE')
    and not has_function_privilege('authenticated',p.oid,'EXECUTE')
    from pg_proc p where p.oid='public.validation_b43_capture_new_promotion_authority()'::regprocedure`) === "t", "promotion trigger function owner/grants are unsafe");
}

function insertStatement(table: string, row: Record<string, unknown>): string {
  check(["problem_observations", "validation_evidence_promotions"].includes(table), "unapproved synthetic table");
  const columns = Object.keys(row);
  check(columns.every((column) => /^[a-z_]+$/.test(column)), "unsafe synthetic fixture column");
  const recordType = `public.${table}`;
  const serialized = JSON.stringify(row).replaceAll("'", "''");
  return `insert into ${recordType} (${columns.join(",")}) select ${columns.join(",")}
    from jsonb_populate_record(null::${recordType},'${serialized}'::jsonb);`;
}

function candidateLedger(i: number): Record<string, unknown> {
  const fp = fingerprint(i);
  return {
    owner_id: owner, observation_id: observation(i), classification_id: classification(i),
    subject_id: uuid("3", 1), hypothesis_id: uuid("4", 1), hypothesis_version_id: uuid("5", 1),
    experiment_id: uuid("6", 1), experiment_version_id: uuid("7", 1),
    participant_id: participant(i), interview_session_id: uuid("a", i),
    policy_version: "v8-b1.2", resolver_version: "v8-b3.0.2-exact.1", projection_version: "v8-b3.1-projection.1",
    eligible: true, eligibility_reasons: ["eligible"], representative_selected: true,
    independence_kind: "participant", independence_private_id: participant(i), polarity: "supporting",
    representative_group_key: `participant:${participant(i)}|${canonical}|supporting`,
    canonical_problem_id: canonical, resolution_status: "resolved", resolution_reason: "server_exact_authority_snapshot",
    problem_observation_id: sharedId(i), promotion_fingerprint: fp,
  };
}

function candidateShared(i: number): Record<string, unknown> {
  const fp = fingerprint(i);
  return {
    id: sharedId(i), canonical_problem_id: canonical,
    problem_title: "Slow reports", normalized_problem_title: "slow reports",
    source_type: "customer_interview_human_reviewed", source_evidence: `Disposable candidate ${i}`,
    evidence_polarity: "supporting", observed_at: "2026-09-26T00:00:00+00:00",
    observation_fingerprint: `validation-promotion:${fp}`,
    metadata: { projectionVersion: "v8-b3.1-projection.1" },
  };
}

async function expectNoRuntimeFactAccess(admin: SupabaseClient, anonymous: SupabaseClient, authenticated: SupabaseClient, authorityId: string): Promise<void> {
  const cases: Array<readonly [string, () => Promise<{ error: { code?: string; message?: string } | null }>]> = [
    ["service authority select", async () => admin.from("validation_evidence_consumption_authority").select("id")],
    ["service restriction select", async () => admin.from("validation_evidence_source_restrictions").select("id")],
    ["service authority insert", async () => admin.from("validation_evidence_consumption_authority").insert({
      purpose_id: "qualified_validation_shared_evidence", promotion_id: authorityId, authority_state: "withheld",
    })],
    ["service restriction insert", async () => admin.from("validation_evidence_source_restrictions").insert({
      purpose_id: "qualified_validation_shared_evidence", reason_code: "canonical_merged", scope_kind: "canonical_problem", scope_id: canonical,
    })],
    ["service authority update", async () => admin.from("validation_evidence_consumption_authority").update({ authority_state: "withheld" }).eq("id", authorityId)],
    ["service authority delete", async () => admin.from("validation_evidence_consumption_authority").delete().eq("id", authorityId)],
    ["service restriction update", async () => admin.from("validation_evidence_source_restrictions").update({ reason_code: "canonical_merged" }).neq("id", "")],
    ["service restriction delete", async () => admin.from("validation_evidence_source_restrictions").delete().neq("id", "")],
  ];
  for (const roleClient of [anonymous, authenticated]) {
    for (const table of ["validation_evidence_consumption_authority", "validation_evidence_source_restrictions"]) {
      cases.push([`browser ${table} select`, async () => roleClient.from(table).select("id")]);
      cases.push([`browser ${table} insert`, async () => roleClient.from(table).insert({})]);
      cases.push([`browser ${table} update`, async () => roleClient.from(table).update({}).neq("id", "")]);
      cases.push([`browser ${table} delete`, async () => roleClient.from(table).delete().neq("id", "")]);
    }
  }
  for (const [label, request] of cases) {
    const { error } = await request();
    expectPostgrestPermissionDenied(error, label);
  }
  for (const role of ["service_role", "anon", "authenticated", "saasscout_b43_fact_writer", "saasscout_b43_current_reader"]) {
    for (const table of ["validation_evidence_consumption_authority", "validation_evidence_source_restrictions"]) {
      expectSqlState(`set role ${role}; truncate public.${table};`, "42501", `${role} truncate ${table}`);
    }
  }
}

function assertImmutableFacts(authorityId: string, restrictionId: string): void {
  for (const operation of [
    `update public.validation_evidence_consumption_authority set authority_state='withheld' where id='${authorityId}'`,
    `delete from public.validation_evidence_consumption_authority where id='${authorityId}'`,
    `update public.validation_evidence_source_restrictions set reason_code='canonical_merged' where id='${restrictionId}'`,
    `delete from public.validation_evidence_source_restrictions where id='${restrictionId}'`,
  ]) expectSqlState(operation, "55000", "B43 append-only trigger");
}

function restoreSnapshot(observationId: string): void {
  sql(`alter table public.validation_qualified_evidence_snapshots disable trigger all;
    update public.validation_qualified_evidence_snapshots s set
      attestation_version='v8-b4.2-b1-full-row.2',
      protected_record=public.validation_b42_row_record(po),
      protected_schema=public.validation_b42_protected_schema()
    from public.problem_observations po where s.problem_observation_id='${observationId}' and po.id=s.problem_observation_id;
    alter table public.validation_qualified_evidence_snapshots enable trigger all;`, phase);
}

async function verifyPostgrestExecutionBoundary(admin: SupabaseClient, anonymous: SupabaseClient, authenticated: SupabaseClient): Promise<void> {
  for (const client of [anonymous, authenticated]) {
    const { error } = await client.rpc("validation_b43_read_current_evidence", { p_canonical_problem_id: canonical });
    expectPostgrestPermissionDenied(error, "browser current RPC execution");
  }
  const { data, error } = await admin.rpc("validation_b43_read_current_evidence", { p_canonical_problem_id: canonical });
  check(!error && data?.complete === true && Array.isArray(data.observations), "service-role PostgREST RPC did not execute the current boundary");
}

function makePsqlProcess(): ReturnType<typeof spawn> {
  return spawn("psql", [B43_DATABASE_URL, "-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"], {
    env: sanitizedProcessEnv(), stdio: ["pipe", "pipe", "pipe"],
  });
}

function waitForMarker(child: ReturnType<typeof spawn>, marker: string, onText: (text: string) => void): Promise<string> {
  return new Promise((resolveMarker, reject) => {
    let accumulated = "";
    const timeout = setTimeout(() => reject(new Error("controlled concurrency marker timeout")), 10000);
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      accumulated += text;
      onText(text);
      const line = accumulated.split(/\r?\n/).find((entry) => entry.startsWith(marker));
      if (line) { clearTimeout(timeout); resolveMarker(line.slice(marker.length)); }
    });
    child.on("error", () => { clearTimeout(timeout); reject(new Error("controlled concurrency process failed")); });
    child.on("exit", (code) => { if (code !== 0) { clearTimeout(timeout); reject(new Error("controlled concurrency process exited early")); } });
  });
}

async function controlledParticipantConcurrency(admin: SupabaseClient): Promise<void> {
  phase = "independent backend participant lock and post-commit exclusion";
  const participantId = participant(3);
  const blocker = makePsqlProcess();
  let blockerOutput = "";
  const blockerMarker = waitForMarker(blocker, "B43_BLOCKER:", (text) => { blockerOutput += text; });
  blocker.stdin?.write(`begin;\nselect public.validation_b31_lock('participant','${participantId}');\nselect 'B43_BLOCKER:'||pg_backend_pid();\n`);
  let blockerPid: number;
  try {
    blockerPid = Number(await blockerMarker);
    check(Number.isInteger(blockerPid) && blockerPid > 0, "participant lock backend identity invalid");
    const competitor = makePsqlProcess();
    let competitorOutput = "";
    const competitorMarker = waitForMarker(competitor, "B43_COMPETITOR:", (text) => { competitorOutput += text; });
    competitor.stdin?.write(`select 'B43_COMPETITOR:'||pg_backend_pid();\nselect public.validation_update_participant_status(
      '${owner}','${participantId}','active','withdrawn');\n\\q\n`);
    const competitorPid = Number(await competitorMarker);
    check(Number.isInteger(competitorPid) && competitorPid > 0 && competitorPid !== blockerPid,
      "participant race did not use distinct PostgreSQL backends");
    let observedLockWait = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const wait = sql(`select coalesce(wait_event_type,'')||'|'||coalesce(state,'') from pg_stat_activity where pid=${competitorPid}`);
      if (wait === "Lock|active") { observedLockWait = true; break; }
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    check(observedLockWait, "independent participant writer was not observed waiting on the held advisory lock");
    blocker.stdin?.write("commit;\n\\q\n");
    const competitorExit = await new Promise<number | null>((resolveExit) => competitor.on("exit", (code) => resolveExit(code)));
    check(competitorExit === 0 && competitorOutput.includes('"status": "withdrawn"'), "serialized participant mutation did not commit after lock release");
    const state = sql(`select p.status||'|'||(select count(*) from public.validation_evidence_source_restrictions r
      where r.reason_code='participant_withdrawn' and r.scope_kind='participant'
        and r.scope_id=p.id and r.owner_id=p.owner_id and r.contribution_observation_id='${observation(3)}')
      from public.validation_participants p where p.id='${participantId}' and p.owner_id='${owner}'`);
    check(state === "withdrawn|1", "post-commit participant restriction is absent or inconsistent");
    const current = await readCurrentQualifiedValidationEvidence(canonical, admin);
    check(current.complete && current.observations.length === 0, "post-commit current read was not complete and excluded");
    const restored = await admin.rpc("validation_update_participant_status", {
      p_owner_id: owner, p_participant_id: participantId, p_expected_status: "withdrawn", p_target_status: "active",
    });
    check(!restored.error && sql(`select count(*) from public.validation_evidence_source_restrictions
      where reason_code='participant_withdrawn' and scope_id='${participantId}' and contribution_observation_id='${observation(3)}'`) === "1",
    "participant operational restoration bypassed the permanent restriction");
  } catch {
    blocker.stdin?.write("rollback;\n\\q\n");
    blocker.kill();
    throw new Error("controlled independent-backend concurrency assertion failed");
  }
  check(blockerOutput.includes(`B43_BLOCKER:${blockerPid}`), "controlled concurrency backend evidence was not captured");
}

async function run(): Promise<void> {
  const identity = verifyDisposableIdentity();
  if (process.argv.includes("--preflight-only")) {
    console.log("PASS B4.3 disposable identity verified before reset");
    return;
  }
  const status = identity.status;
  phase = "complete migration chain and clean fixture database";
  assertCompleteMigrationChain();
  assertFreshApplicationDatabase();
  assertDatabaseSecurityCatalog();

  const { admin, anonymous, authenticated } = clients(status);
  phase = "browser PostgREST execution denial";
  await verifyPostgrestExecutionBoundary(admin, anonymous, authenticated);

  phase = "fixture setup";
  const fixture = readFileSync(new URL("../tests/sql/validation-b31.sql", import.meta.url), "utf8");
  check(fixture.split("create function public.b31_test_promote(").length === 2, "B3.1 fixture boundary changed");
  const setup = fixture.split("create function public.b31_test_promote(")[0]
    .replaceAll("generate_series(1,14)", "generate_series(1,120)")
    .replaceAll("generate_series(1,15)", "generate_series(1,120)")
    .replaceAll("least(i,14)", "i");
  check(setup.length > 1000, "B3.1 fixture setup is incomplete");
  sql(`begin;${setup}\ncommit;`);

  phase = "new promotion WITHHELD authority and historical proof preservation";
  for (const i of [1, 2, 3, 4]) await promoteCustomerInterviewEvidence(owner, observation(i), admin);
  check(sql("select count(*) from public.validation_evidence_consumption_authority where authority_state='withheld'") === "4", "new promotions did not receive exactly one WITHHELD fact each");
  check(sql("select count(*) from public.validation_qualified_evidence_snapshots where attestation_version='v8-b4.2-b1-full-row.2'") === "4", "new promotions did not preserve B4.2 v2 proofs");
  const current = await readCurrentQualifiedValidationEvidence(canonical, admin);
  check(current.complete && current.observations.length === 0, "WITHHELD evidence was not excluded from a complete current read");
  const history = await readTrustedQualifiedValidationEvidence(canonical, admin);
  check(history.complete && history.observations.length === 4 &&
    ["supporting", "contradicting", "mixed"].every((polarity) => history.observations.some((row) => row.evidence_polarity === polarity)),
  "B3.1/B4.2 historical reader or original polarity behavior changed");
  check((await promoteCustomerInterviewEvidence(owner, observation(1), admin)).duplicate === true &&
    sql("select count(*) from public.validation_evidence_consumption_authority") === "4", "exact retry created duplicate authority");

  phase = "PostgREST cannot access private facts or write authority";
  const authorityId = sql(`select id from public.validation_evidence_consumption_authority a
    join public.validation_evidence_promotions p on p.id=a.promotion_id where p.observation_id='${observation(1)}'`);
  await expectNoRuntimeFactAccess(admin, anonymous, authenticated, authorityId);

  phase = "withheld authority insertion failure rolls back promotion transaction";
  const sharedBefore = sql("select count(*) from public.problem_observations where source_type='customer_interview_human_reviewed'");
  sql(`create sequence public.b43_authority_rejection_hits;
    create function public.b43_reject_authority_insert() returns trigger language plpgsql as $$
    begin perform nextval('public.b43_authority_rejection_hits');
      raise exception 'synthetic B43 authority rejection' using errcode='23514'; end $$;
    create trigger b43_test_authority_rejection before insert on public.validation_evidence_consumption_authority
      for each row execute function public.b43_reject_authority_insert();`);
  let authorityRejected = false;
  try { await promoteCustomerInterviewEvidence(owner, observation(17), admin); }
  catch (error) { authorityRejected = error instanceof Error && "code" in error && (error as { code?: string }).code === "constraint_conflict"; }
  sql("drop trigger b43_test_authority_rejection on public.validation_evidence_consumption_authority; drop function public.b43_reject_authority_insert();");
  check(authorityRejected && sql("select last_value||'|'||is_called from public.b43_authority_rejection_hits") === "1|t",
    "promotion did not reach the injected authority-write failure");
  check(sql(`select not exists(select 1 from public.validation_evidence_promotions where observation_id='${observation(17)}')
    and not exists(select 1 from public.validation_qualified_evidence_snapshots s join public.validation_evidence_promotions p on p.id=s.promotion_id where p.observation_id='${observation(17)}')
    and (select count(*) from public.problem_observations where source_type='customer_interview_human_reviewed')=${sharedBefore}`) === "t",
  "authority-write failure left shared, ledger, or snapshot state committed");
  sql("drop sequence public.b43_authority_rejection_hits");

  phase = "missing authority and corrupted/unsupported B4.2 proofs fail closed";
  sql(`alter table public.validation_evidence_consumption_authority disable trigger all;
    delete from public.validation_evidence_consumption_authority a using public.validation_evidence_promotions p
      where a.promotion_id=p.id and p.observation_id='${observation(4)}';
    alter table public.validation_evidence_consumption_authority enable trigger all;`);
  await expectCurrentReadUnavailable(admin, "missing authority candidate");
  sql(`insert into public.validation_evidence_consumption_authority(
      purpose_id,promotion_id,owner_id,problem_observation_id,canonical_problem_id,promotion_fingerprint,projection_version,authority_state)
    select 'qualified_validation_shared_evidence',p.id,p.owner_id,p.problem_observation_id,p.canonical_problem_id,
      p.promotion_fingerprint,p.projection_version,'withheld'
    from public.validation_evidence_promotions p where p.observation_id='${observation(4)}';`);
  const proofCases = [
    ["protected_record malformed", `update public.validation_qualified_evidence_snapshots set protected_record='bad-codec' where problem_observation_id='${sharedId(2)}'`],
    ["unsupported proof version", `update public.validation_qualified_evidence_snapshots set attestation_version='v8-b4.2-b1-snapshot.1' where problem_observation_id='${sharedId(2)}'`],
    ["unsupported schema version", `update public.validation_qualified_evidence_snapshots set protected_schema=array['unsupported']::text[] where problem_observation_id='${sharedId(2)}'`],
  ] as const;
  for (const [label, mutation] of proofCases) {
    sql(`alter table public.validation_qualified_evidence_snapshots disable trigger all; ${mutation}; alter table public.validation_qualified_evidence_snapshots enable trigger all;`);
    await expectCurrentReadUnavailable(admin, label);
    restoreSnapshot(sharedId(2));
    check(sql(`select public.validation_b42_snapshot_verified(p) from public.validation_evidence_promotions p where p.observation_id='${observation(2)}'`) === "t",
      `${label}: B4.2 proof was not restored after fault injection`);
  }

  phase = "authority/restriction immutability and participant restoration";
  const withdraw = await admin.rpc("validation_update_participant_status", {
    p_owner_id: owner, p_participant_id: participant(1), p_expected_status: "active", p_target_status: "withdrawn",
  });
  check(!withdraw.error, "authorized participant withdrawal RPC failed");
  const restrictionId = sql(`select id from public.validation_evidence_source_restrictions
    where reason_code='participant_withdrawn' and scope_id='${participant(1)}' and contribution_observation_id='${observation(1)}'`);
  check(Boolean(restrictionId), "participant withdrawal restriction missing");
  assertImmutableFacts(authorityId, restrictionId);
  const restore = await admin.rpc("validation_update_participant_status", {
    p_owner_id: owner, p_participant_id: participant(1), p_expected_status: "withdrawn", p_target_status: "active",
  });
  check(!restore.error && sql(`select count(*) from public.validation_evidence_source_restrictions
    where id='${restrictionId}' and reason_code='participant_withdrawn' and contribution_observation_id='${observation(1)}'`) === "1",
  "participant restoration cleared an immutable restriction");
  sql(`insert into public.validation_evidence_observations(
      owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,
      participant_id,interview_session_id,origin,modality,observed_at,source_type,collected_by,
      observation_content,ingestion_key,independence_relationship)
    values('${owner}','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001','${participant(1)}','a0000000-0000-0000-0000-000000000001',
      'human_interview','interview_observation',now(),'customer_interview','manual','{"content":"post restoration"}',
      'b43-post-restoration-observation','independent')`);
  check(sql(`select count(*) from public.validation_evidence_source_restrictions r
    join public.validation_evidence_observations o on o.id=r.contribution_observation_id
    where o.ingestion_key='b43-post-restoration-observation'`) === "0", "later observation inherited a prior restriction");
  sql(`update public.validation_participants set consent_mode='explicit',consent_purpose='changed',consent_captured_at=now()
    where id='${participant(1)}' and owner_id='${owner}'`);
  check(sql(`select count(*) from public.validation_evidence_source_restrictions
    where reason_code='consent_metadata_changed' and scope_id='${participant(1)}'`) === "2", "consent metadata transition missed existing contributions");

  phase = "session cancellation and relevance loss restrictions";
  const relevance = await admin.rpc("validation_update_interview_relevance", {
    p_owner_id: owner, p_session_id: "a0000000-0000-0000-0000-000000000001",
    p_expected_relevance: "target_segment_match", p_target_relevance: "adjacent_segment",
  });
  check(!relevance.error, "session relevance mutation failed");
  const relevanceRestore = await admin.rpc("validation_update_interview_relevance", {
    p_owner_id: owner, p_session_id: "a0000000-0000-0000-0000-000000000001",
    p_expected_relevance: "adjacent_segment", p_target_relevance: "target_segment_match",
  });
  check(!relevanceRestore.error && sql("select count(*) from public.validation_evidence_source_restrictions where reason_code='session_relevance_lost'") === "1",
    "relevance restoration cleared permanent restriction");
  const cancellation = await admin.rpc("validation_update_interview_session", {
    p_owner_id: owner, p_session_id: "a0000000-0000-0000-0000-000000000002",
    p_expected_status: "in_progress", p_target_status: "cancelled", p_notes: null,
  });
  check(!cancellation.error && sql(`select count(*) from public.validation_evidence_source_restrictions
    where reason_code='session_cancelled' and scope_id='a0000000-0000-0000-0000-000000000002'`) === "1",
  "session cancellation did not append its permanent restriction");

  phase = "experiment completion and cancellation semantics";
  const completion = await admin.rpc("validation_transition_experiment_version", {
    p_owner_id: owner, p_version_id: "70000000-0000-0000-0000-000000000001",
    p_expected_lifecycle: "running", p_target_lifecycle: "completed",
  });
  check(!completion.error && sql("select count(*) from public.validation_evidence_source_restrictions where reason_code='experiment_cancelled'") === "0",
    "experiment completion incorrectly restricted evidence");
  sql(`insert into public.validation_experiments(id,owner_id,subject_id) values
      ('61000000-0000-0000-0000-000000000001','${owner}','30000000-0000-0000-0000-000000000001');
    insert into public.validation_experiment_versions(owner_id,subject_id,experiment_id,hypothesis_id,hypothesis_version_id,
      version_number,family,target_audience,collection_method,design_snapshot,consent_privacy_mode,lifecycle,started_at)
    values('${owner}','30000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,'customer_interview',
      '["operators"]','interview','{}','pseudonymous_notes','running',now())`);
  const experimentCancel = await admin.rpc("validation_transition_experiment_version", {
    p_owner_id: owner, p_version_id: "71000000-0000-0000-0000-000000000001",
    p_expected_lifecycle: "running", p_target_lifecycle: "cancelled",
  });
  check(!experimentCancel.error && sql("select count(*) from public.validation_evidence_source_restrictions where reason_code='experiment_cancelled'") === "1",
    "experiment cancellation restriction missing");

  await controlledParticipantConcurrency(admin);

  phase = "classification ambiguity and supersession restrictions";
  const ambiguousClassification = await admin.rpc("validation_insert_classification", {
    p_owner_id: owner, p_observation_id: observation(2), p_polarity: "contradicting",
    p_classification_source: "user_supplied", p_authority_status: "authoritative",
    p_rationale: null, p_supersedes_classification_id: null,
  });
  check(!ambiguousClassification.error, "ambiguous authoritative classification fixture could not be created");
  await expectCurrentReadUnavailable(admin, "multiple current authoritative classification terminals");
  const superseded = await admin.rpc("validation_insert_classification", {
    p_owner_id: owner, p_observation_id: observation(1), p_polarity: "inconclusive",
    p_classification_source: "ai_model_suggested", p_authority_status: "suggested",
    p_rationale: null, p_supersedes_classification_id: classification(1),
  });
  check(!superseded.error && sql("select count(*) from public.validation_evidence_source_restrictions where reason_code='classification_superseded'") === "1",
    "AI-suggested classification successor did not restrict its predecessor");

  phase = "canonical merge, deactivation, and conflicting merge state";
  sql(`insert into public.canonical_problems(id,canonical_key,canonical_title,normalized_title,status)
      values('${targetCanonical}','b43-merge-target','B43 merge target','b43 merge target','active'),
        ('${conflictCanonical}','b43-merge-conflict','B43 conflict','b43 conflict','active');
    update public.canonical_problems set status='merged',merged_into_problem_id='${targetCanonical}' where id='${canonical}';`);
  check(sql(`select count(*) from public.validation_evidence_source_restrictions
    where reason_code='canonical_merged' and scope_id='${canonical}'`) === "1", "canonical merge restriction missing");
  const mergeUnavailable = await admin.rpc("validation_b43_read_current_evidence", { p_canonical_problem_id: canonical });
  check(mergeUnavailable.error?.code === "P0001" && mergeUnavailable.error.message === "current evidence unavailable",
    "merged canonical was not failed closed");
  sql(`update public.canonical_problems set merged_into_problem_id='${targetCanonical}' where id='${conflictCanonical}';
    update public.canonical_problems set status='deprecated' where id='${targetCanonical}';`);
  const conflictUnavailable = await admin.rpc("validation_b43_read_current_evidence", { p_canonical_problem_id: conflictCanonical });
  check(conflictUnavailable.error?.code === "P0001" && conflictUnavailable.error.message === "current evidence unavailable",
    "active canonical with merge target was not failed closed");
  check(sql(`select count(*) from public.validation_evidence_source_restrictions where reason_code='canonical_deactivated' and scope_id='${targetCanonical}'`) === "1",
    "canonical deactivation restriction missing");

  phase = "candidate population overflow";
  for (let i = 20; i < 117; i++) {
    sql(`${insertStatement("problem_observations", candidateShared(i))}\n${insertStatement("validation_evidence_promotions", candidateLedger(i))}`);
  }
  check(sql(`select count(*) from public.validation_evidence_promotions
    where canonical_problem_id='${canonical}' and problem_observation_id is not null`) === "101", "overflow fixture did not exceed the 100 candidate bound");
  const overflow = await admin.rpc("validation_b43_read_current_evidence", { p_canonical_problem_id: canonical });
  check(overflow.error?.code === "P0001" && overflow.error.message === "current evidence unavailable",
    "candidate population overflow was treated as complete or empty");

  console.log("PASS B4.3 disposable identity, privilege, authority, proof, source restriction, concurrency, completeness and compatibility checks");
}

try {
  await run();
} catch {
  console.error(`FAIL B4.3: ${phase}; ${failure}; database, private rows and credentials suppressed`);
  process.exitCode = 1;
}
