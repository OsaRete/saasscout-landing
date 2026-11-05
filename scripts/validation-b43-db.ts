import { createHash, createHmac } from "node:crypto";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promoteCustomerInterviewEvidence } from "../lib/validation/promotion/promotion-service.ts";
import { readTrustedQualifiedValidationEvidence } from "../lib/validation/promotion/trusted-qualified-evidence-reader.ts";
import {
  assertClusterIdentity,
  assertContainerIdentity,
  assertDedicatedNetworkIdentity,
  assertDisposableConfig,
  assertIsolatedPath,
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
  expectedB43NetworkName,
  hasEffectiveRoleIdentity,
  isExpectedLocalRpcCredential,
  isTrustedMigrationPrincipalResult,
  sqlStateDiagnostic,
  type ContainerIdentity,
  type DockerNetworkIdentity,
  type DisposableManifest,
} from "./validation-b43-isolation.ts";

import { buildB43Fixture, diagnosticFetch, requirePromotionResult, singleMutation, waitForMarker, waitForExit, sourceInvariantDiagnostic } from "./validation-b43-harness.ts";

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
const postgresIdentityQuery = "select current_database()||'|'||inet_server_port()||'|'||(select system_identifier::text from pg_control_system())";
let phase = "disposable project identity";
let failure = "unexpected_exception";
let operation = "startup";
let protocolFailure = "no_protocol_failure_observed";

async function step<T>(label: string, action: () => Promise<T>): Promise<T> {
  operation = label;
  protocolFailure = "no_protocol_failure_observed";
  failure = `${label}: unexpected_exception`;
  try { const result = await action(); operation = "harness"; return result; }
  catch (error) {
    const category = error instanceof Error && error.message === "promotion_result_malformed"
      ? "promotion_result_malformed" : protocolFailure;
    failure = `${label}: ${category}`; throw new Error("harness_step_failed"); }
}

const observedFetch = diagnosticFetch((category) => { protocolFailure = category; });

function check(value: unknown, label: string): asserts value {
  if (!value) {
    failure = label;
    throw new Error(label);
  }
}

async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  return step(name, async () => {
    const result = await client.rpc(name, args);
    check(!result.error && result.data !== null, `${name}: rpc_result_failed`);
    return result;
  });
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
  // This read-only probe identifies the login/effective principal on the
  // generated project's verified DB_URL before the explicitly local reset.
  const principal = sql(`select session_user||'|'||current_user||'|'||
    (select rolbypassrls::text from pg_roles where rolname=current_user)||'|'||
    (pg_has_role('anon',current_user,'SET') or pg_has_role('authenticated',current_user,'SET') or
     pg_has_role('service_role',current_user,'SET') or pg_has_role('authenticator',current_user,'SET') or
     exists(select 1 from pg_auth_members m where m.roleid='postgres'::regrole and m.admin_option
       and (pg_has_role('anon',m.member,'SET') or pg_has_role('authenticated',m.member,'SET') or
         pg_has_role('service_role',m.member,'SET') or pg_has_role('authenticator',m.member,'SET'))))::text`,
    "migration principal privilege preflight failed");
  const [sessionUser, currentUser] = principal.split("|");
  check(sessionUser === "postgres" && currentUser === "postgres",
    "database login and effective migration principal must be Supabase postgres");
  check(isTrustedMigrationPrincipalResult(principal),
    "postgres BYPASSRLS assumption or application role boundary is invalid");
  return { projectId, dbContainerId: containers.database.id, clusterId, status };
}

function sqlRaw(statement: string, label = phase, timeoutMs = 25000) {
  operation = label;
  const result = spawnSync("psql", [B43_DATABASE_URL, "-X", "-A", "-t", "-q", "-w", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"], {
    input: `set statement_timeout='20s';\n${statement}`,
    encoding: "utf8", timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, env: sanitizedProcessEnv(),
  });
  check(!result.error && result.status !== null, `${label}: sql_transport_error`);
  return result;
}

function sql(statement: string, label = phase): string {
  const result = sqlRaw(statement, label);
  check(result.status === 0, `${label}: ${sourceInvariantDiagnostic(sqlStateDiagnostic(result.stderr))}`);
  return result.stdout.split(/\r?\n/).filter((line) => line && !line.startsWith("SET")).join("\n");
}

function expectSqlState(statement: string, expectedState: string, label: string, effectiveRole?: string): void {
  const result = sqlRaw(statement, label);
  check(result.status !== 0, `${label}: expected SQLSTATE ${expectedState}, statement succeeded`);
  const actual = /ERROR:\s+([0-9A-Z]{5})/.exec(result.stderr)?.[1];
  check(actual === expectedState, `${label}: expected SQLSTATE ${expectedState}, got ${actual ?? "unclassified SQL error"}`);
  if (effectiveRole !== undefined) {
    check(hasEffectiveRoleIdentity(result.stdout, effectiveRole), `${label}: effective-role identity was not established`);
  }
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
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: observedFetch } };
  const tokenInput = `${encodeBase64Url({ alg: "HS256", typ: "JWT" })}.${encodeBase64Url({
    role: "authenticated", sub: owner, aud: "authenticated", iss: "supabase",
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600,
  })}`;
  const token = `${tokenInput}.${createHmac("sha256", status.JWT_SECRET).update(tokenInput).digest("base64url")}`;
  for (const [role, credential] of [["service_role", status.SERVICE_ROLE_KEY], ["anon", status.ANON_KEY], ["authenticated", token]]) {
    check(isExpectedLocalRpcCredential(B43_API_URL, credential, status.JWT_SECRET, role), `local ${role} RPC credential identity invalid`);
  }
  const admin = createClient(B43_API_URL, status.SERVICE_ROLE_KEY, options);
  const anonymous = createClient(B43_API_URL, status.ANON_KEY, options);
  const authenticated = createClient(B43_API_URL, status.ANON_KEY, {
    ...options, global: { fetch: observedFetch, headers: { Authorization: `Bearer ${token}` } },
  });
  return { admin, anonymous, authenticated };
}

function expectPostgrestPermissionDenied(response: unknown, label: string): void {
  const diagnostic = classifyPostgrestDenial(response);
  check(diagnostic === "expected_denial", `${label}: ${diagnostic}`);
}

function expectCurrentReadUnavailable(label: string, canonicalId = canonical): void {
  const result = sqlRaw(`select session_user||'|'||current_user;
    select public.validation_b43_read_current_evidence('${canonicalId}'::uuid)`);
  const diagnostic = classifyTrustedCurrentRead(result, "unavailable");
  check(diagnostic === "expected_denial", `${label}: ${diagnostic}`);
}

function readCurrentEvidence(canonicalId = canonical): { observations: unknown[]; complete: boolean } {
  const result = sqlRaw(`select session_user||'|'||current_user;
    select public.validation_b43_read_current_evidence('${canonicalId}'::uuid)`);
  const diagnostic = classifyTrustedCurrentRead(result, "empty");
  check(diagnostic === "expected_success", `trusted current SQL read: ${diagnostic}`);
  return JSON.parse(result.stdout.split(/\r?\n/).filter((line) => line !== "")[1]) as { observations: unknown[]; complete: boolean };
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
  check(sql(`select rolbypassrls and not rolsuper from pg_roles where rolname='postgres'`) === "t",
    "disposable postgres is not the confirmed non-superuser BYPASSRLS principal");
  check(sql(`select bool_and(c.relrowsecurity and c.relforcerowsecurity and c.relowner='postgres'::regrole)
    from pg_class c where c.oid in ('public.validation_evidence_consumption_authority'::regclass,
      'public.validation_evidence_source_restrictions'::regclass)`) === "t", "B43 fact table defense-in-depth RLS/ownership invariant failed");
  check(sql(`select not exists(select 1 from pg_roles where rolname like 'saasscout_b43_%')`) === "t",
    "B43 unexpectedly provisioned an internal role");

  const privateTables = ["validation_evidence_consumption_authority", "validation_evidence_source_restrictions"];
  for (const table of privateTables) {
    const q = `public.${table}`;
    for (const role of ["anon", "authenticated", "service_role", "authenticator"]) {
      const denied = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"].every((privilege) =>
        sql(`select not has_table_privilege('${role}','${q}','${privilege}')`) === "t");
      check(denied, `${role} has direct privileges on ${table}`);
    }
    check(sql(`select not exists(select 1 from lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
      where acl.grantee=0 and acl.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE'))
      from pg_class c where c.oid='${q}'::regclass`) === "t", `PUBLIC has direct privileges on ${table}`);
  }

  check(sql(`select count(*)=11 and bool_and(p.proowner='postgres'::regrole)
      and bool_and(exists(select 1 from unnest(p.proconfig) x where x='search_path=pg_catalog, pg_temp'))
      and bool_and(not has_function_privilege('anon',p.oid,'EXECUTE')
        and not has_function_privilege('authenticated',p.oid,'EXECUTE')
        and not has_function_privilege('service_role',p.oid,'EXECUTE')
        and not has_function_privilege('authenticator',p.oid,'EXECUTE'))
      and bool_and(not exists(select 1 from lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        where acl.grantee=0 and acl.privilege_type='EXECUTE'))
      and bool_and(p.prosecdef) filter(where p.proname<>'validation_b43_reject_fact_change')
      and bool_and(not p.prosecdef) filter(where p.proname='validation_b43_reject_fact_change')
    from pg_proc p where p.oid in (
      'public.validation_b43_reject_fact_change()'::regprocedure,
      'public.validation_b43_capture_new_promotion_authority()'::regprocedure,
      'public.validation_b43_insert_restriction(text,text,uuid,uuid,uuid)'::regprocedure,
      'public.validation_b43_lock_source_change()'::regprocedure,
      'public.validation_b43_capture_participant_restrictions()'::regprocedure,
      'public.validation_b43_restrict_observation_during_nonactive_participant()'::regprocedure,
      'public.validation_b43_capture_session_restrictions()'::regprocedure,
      'public.validation_b43_capture_experiment_restriction()'::regprocedure,
      'public.validation_b43_capture_classification_restriction()'::regprocedure,
      'public.validation_b43_capture_canonical_restriction()'::regprocedure,
      'public.validation_b43_read_current_evidence(uuid)'::regprocedure
    )`) === "t", "B43 ownership, grants, SECURITY DEFINER or search_path invariant failed");
}

function verifyApplicationRoleEscalationDenied(): void {
  const roles = ["anon", "authenticated", "service_role", "authenticator"];
  const owners = JSON.parse(sql(`select jsonb_agg(rolname order by rolname) from pg_roles
    where rolname='postgres' or rolsuper or rolcreaterole
      or (rolbypassrls and rolname not in ('anon','authenticated','service_role','authenticator'))
      or oid in (
      select relowner from pg_class where oid in (
        'public.validation_evidence_consumption_authority'::regclass,
        'public.validation_evidence_source_restrictions'::regclass,
        'public.validation_evidence_promotions'::regclass,
        'public.validation_qualified_evidence_snapshots'::regclass,
        'public.problem_observations'::regclass,
        'public.validation_participants'::regclass,
        'public.validation_interview_sessions'::regclass,
        'public.validation_experiment_versions'::regclass,
        'public.validation_evidence_observations'::regclass,
        'public.validation_evidence_classifications'::regclass,
        'public.validation_customer_interview_shareable_evidence'::regclass,
        'public.canonical_problems'::regclass,
        'public.problem_aliases'::regclass,
        'auth.users'::regclass)
      union select p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'validation_%'
      union select nspowner from pg_namespace where nspname in ('public','auth')
    )`)) as unknown;
  check(Array.isArray(owners) && owners.length > 0 && owners.every((owner) => typeof owner === "string"),
    "privileged owner catalog is malformed");
  check(sql(buildRoleBoundaryQuery(roles, owners)) === "t",
    "application role has an unsafe membership, inherited, SET or administration path to a privileged owner");
  // anon/authenticated/service_role are normally NOLOGIN; this non-superuser
  // postgres connection cannot impersonate their authenticated session_user.
  // These positive controls demonstrate why the former escalation test was invalid.
  check(sql("set role anon; select session_user||'|'||current_user") === "postgres|anon",
    "SET ROLE unexpectedly changed the authenticated principal");
  check(sql("set role anon; set role postgres; select session_user||'|'||current_user") === "postgres|postgres",
    "trusted session could not restore its original principal");
  sql(buildRoleBoundaryNegativeControls(), "transactional role boundary negative controls");
  check(sql(`select not exists(select 1 from pg_roles where rolname in (
    'b43_boundary_probe_app','b43_boundary_probe_bridge','b43_boundary_probe_owner'))`) === "t",
  "role boundary negative controls did not roll back");
  for (const role of roles) {
    // DDL/DML permissions use current_user; these are valid effective-role
    // checks, unlike SET ROLE authorization, which uses session_user.
    expectSqlState(`set role ${role}; select session_user||'|'||current_user;
      alter table public.validation_evidence_source_restrictions disable trigger all;`,
    "42501", `${role} trigger tampering`, role);
  }
  expectSqlState(`insert into public.validation_evidence_consumption_authority(
      purpose_id,promotion_id,owner_id,problem_observation_id,canonical_problem_id,promotion_fingerprint,projection_version,authority_state)
    values('qualified_validation_shared_evidence','00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000004',repeat('0',64),'v8-b3.1-projection.1','active')`,
    "23514", "positive authority forgery");
}

// Distinct, fully reviewed fixture participants: SQL supplies freshness only;
// this bulk boundary control does not replace interactive TypeScript selection.
function fixturePromotion(i: number): string {
  return `do $$ begin perform public.validation_promote_customer_interview_evidence(
    '${owner}','${observation(i)}','${classification(i)}','${canonical}','supporting',
    'participant:${participant(i)}|${canonical}|supporting','${fingerprint(i)}',
    public.validation_b31_representative_state('${owner}','${participant(i)}'),
    public.validation_b31_authority_snapshot('${uuid("3",1)}','${uuid("5",1)}'),
    'Slow reports','slow reports','v8-b1.2','v8-b3.0.2-exact.1','v8-b3.1-projection.1'); end $$;`;
}

async function expectNoRuntimeFactAccess(admin: SupabaseClient, anonymous: SupabaseClient, authenticated: SupabaseClient, authorityId: string, promotedId: string): Promise<void> {
  const cases: Array<readonly [string, () => Promise<{ error: { code?: string; message?: string } | null }>]> = [
    ["service authority select", async () => admin.from("validation_evidence_consumption_authority").select("id")],
    ["service restriction select", async () => admin.from("validation_evidence_source_restrictions").select("id")],
    ["service authority insert", async () => admin.from("validation_evidence_consumption_authority").insert({
      purpose_id: "qualified_validation_shared_evidence", promotion_id: promotedId, authority_state: "withheld",
    })],
    ["service restriction insert", async () => admin.from("validation_evidence_source_restrictions").insert({
      purpose_id: "qualified_validation_shared_evidence", reason_code: "canonical_merged", scope_kind: "canonical_problem", scope_id: canonical,
    })],
    ["service authority update", async () => admin.from("validation_evidence_consumption_authority").update({ authority_state: "withheld" }).eq("id", authorityId)],
    ["service authority delete", async () => admin.from("validation_evidence_consumption_authority").delete().eq("id", authorityId)],
    ["service restriction update", async () => admin.from("validation_evidence_source_restrictions").update({ reason_code: "canonical_merged" }).eq("id", authorityId)],
    ["service restriction delete", async () => admin.from("validation_evidence_source_restrictions").delete().eq("id", authorityId)],
  ];
  for (const roleClient of [anonymous, authenticated]) {
    for (const table of ["validation_evidence_consumption_authority", "validation_evidence_source_restrictions"]) {
      cases.push([`browser ${table} select`, async () => roleClient.from(table).select("id")]);
      cases.push([`browser ${table} insert`, async () => roleClient.from(table).insert({})]);
      cases.push([`browser ${table} update`, async () => roleClient.from(table).update(table === "validation_evidence_consumption_authority" ? { authority_state: "withheld" } : { reason_code: "canonical_merged" }).eq("id", authorityId)]);
      cases.push([`browser ${table} delete`, async () => roleClient.from(table).delete().eq("id", authorityId)]);
    }
  }
  for (const [label, request] of cases) {
    let response: unknown;
    try { response = await request(); }
    catch { check(false, `${label}: transport_exception`); }
    expectPostgrestPermissionDenied(response, label);
  }
  for (const role of ["service_role", "anon", "authenticated"]) {
    for (const table of ["validation_evidence_consumption_authority", "validation_evidence_source_restrictions"]) {
      expectSqlState(`set role ${role}; select session_user||'|'||current_user; truncate public.${table};`,
        "42501", `${role} truncate ${table}`, role);
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

// Every injected fault is isolated in one backend transaction. ON_ERROR_STOP
// closes that connection after the expected reader error, rolling back the fault.
function probeUnavailable(statement: string, label: string, timeoutMs = 25000): void {
  readCurrentEvidence();
  const before = sql(`select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(po) order by po.id) from public.problem_observations po),
    (select jsonb_agg(to_jsonb(p) order by p.id) from public.validation_evidence_promotions p),
    (select jsonb_agg(to_jsonb(s) order by s.promotion_id) from public.validation_qualified_evidence_snapshots s),
    (select jsonb_agg(to_jsonb(a) order by a.id) from public.validation_evidence_consumption_authority a),
    (select jsonb_agg(to_jsonb(c) order by c.id) from public.validation_evidence_classifications c),
    (select jsonb_agg(to_jsonb(r) order by r.id) from public.validation_evidence_source_restrictions r))::text)`);
  const result = sqlRaw(`begin;
    ${statement}
    select session_user||'|'||current_user;
    select public.validation_b43_read_current_evidence('${canonical}'::uuid); rollback;`, label, timeoutMs);
  check(classifyTrustedCurrentRead(result, "unavailable") === "expected_denial",
    `${label}: ${classifyTrustedCurrentRead(result, "unavailable")};${sqlStateDiagnostic(result.stderr)}`);
  const after = sql(`select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(po) order by po.id) from public.problem_observations po),
    (select jsonb_agg(to_jsonb(p) order by p.id) from public.validation_evidence_promotions p),
    (select jsonb_agg(to_jsonb(s) order by s.promotion_id) from public.validation_qualified_evidence_snapshots s),
    (select jsonb_agg(to_jsonb(a) order by a.id) from public.validation_evidence_consumption_authority a),
    (select jsonb_agg(to_jsonb(c) order by c.id) from public.validation_evidence_classifications c),
    (select jsonb_agg(to_jsonb(r) order by r.id) from public.validation_evidence_source_restrictions r))::text)`);
  check(before === after, `${label}: fault_transaction_not_restored`);
  readCurrentEvidence();
}

async function verifyPostgrestExecutionBoundary(admin: SupabaseClient, anonymous: SupabaseClient, authenticated: SupabaseClient): Promise<void> {
  for (const [role, client] of [["service_role", admin], ["anon", anonymous], ["authenticated", authenticated]] as const) {
    let response: unknown;
    try { response = await client.rpc("validation_b43_read_current_evidence", { p_canonical_problem_id: canonical }); }
    catch { check(false, `${role} current RPC: transport_exception`); }
    expectPostgrestPermissionDenied(response, `${role} current RPC`);
    try { response = await client.rpc("validation_b43_insert_restriction", {
      p_reason: "canonical_merged", p_kind: "canonical_problem", p_scope: canonical, p_owner: null, p_observation: null,
    }); } catch { check(false, `${role} restriction RPC: transport_exception`); }
    expectPostgrestPermissionDenied(response, `${role} restriction RPC`);
  }
  console.log("PASS B4.3 service_role, anon and authenticated RPC execution denials");
  phase = "trusted SQL missing-canonical rejection";
  expectCurrentReadUnavailable("missing canonical must fail closed");
}

function makePsqlProcess(): ReturnType<typeof spawn> {
  return spawn("psql", [B43_DATABASE_URL, "-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"], {
    env: sanitizedProcessEnv(), stdio: ["pipe", "pipe", "pipe"],
  });
}

async function controlledParticipantConcurrency(admin: SupabaseClient): Promise<void> {
  phase = "independent backend participant lock and post-commit exclusion";
  const participantId = participant(3);
  const blocker = makePsqlProcess();
  let competitor: ReturnType<typeof spawn> | undefined;
  const blockerExit = waitForExit(blocker);
  // Observe rejection immediately, including failures before the final await.
  void blockerExit.catch(() => {});
  let blockerOutput = "";
  const blockerMarker = waitForMarker(blocker, "B43_BLOCKER:", (text) => { blockerOutput += text; });
  blocker.stdin?.write(`set statement_timeout='12s';\nset idle_in_transaction_session_timeout='12s';\nbegin;\nselect public.validation_b31_lock('participant','${participantId}');\nselect 'B43_BLOCKER:'||pg_backend_pid();\n`);
  let blockerPid: number;
  try {
    blockerPid = Number(await blockerMarker);
    check(Number.isInteger(blockerPid) && blockerPid > 0, "participant lock backend identity invalid");
    competitor = makePsqlProcess();
    const competitorExitPromise = waitForExit(competitor);
    void competitorExitPromise.catch(() => {});
    let competitorOutput = "";
    const competitorMarker = waitForMarker(competitor, "B43_COMPETITOR:", (text) => { competitorOutput += text; });
    competitor.stdin?.write(`set statement_timeout='12s';\nselect 'B43_COMPETITOR:'||pg_backend_pid();\nselect public.validation_update_participant_status(
      '${owner}','${participantId}','active','withdrawn');\n\\q\n`);
    const competitorPid = Number(await competitorMarker);
    check(Number.isInteger(competitorPid) && competitorPid > 0 && competitorPid !== blockerPid,
      "participant race did not use distinct PostgreSQL backends");
    let observedLockWait = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const wait = sql(`select coalesce(wait_event_type,'')||'|'||coalesce(wait_event,'')||'|'||coalesce(state,'')||'|'||(${blockerPid}=any(pg_blocking_pids(${competitorPid})))::text from pg_stat_activity where pid=${competitorPid}`);
      if (wait === "Lock|advisory|active|true") { observedLockWait = true; break; }
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    check(observedLockWait, "independent participant writer was not observed waiting on the held advisory lock");
    blocker.stdin?.write("commit;\n\\q\n");
    const competitorExit = await competitorExitPromise;
    check(await blockerExit === 0, "blocker_did_not_exit_cleanly");
    check(competitorExit === 0 && competitorOutput.includes('"status": "withdrawn"'), "serialized participant mutation did not commit after lock release");
    const state = sql(`select p.status||'|'||(select count(*) from public.validation_evidence_source_restrictions r
      where r.reason_code='participant_withdrawn' and r.scope_kind='participant'
        and r.scope_id=p.id and r.owner_id=p.owner_id and r.contribution_observation_id='${observation(3)}')
      from public.validation_participants p where p.id='${participantId}' and p.owner_id='${owner}'`);
    check(state === "withdrawn|1", "post-commit participant restriction is absent or inconsistent");
    const current = readCurrentEvidence();
    check(current.complete && current.observations.length === 0, "post-commit current read was not complete and excluded");
    const restored = await rpc(admin, "validation_update_participant_status", {
      p_owner_id: owner, p_participant_id: participantId, p_expected_status: "withdrawn", p_target_status: "active",
    });
    check(!restored.error && sql(`select count(*) from public.validation_evidence_source_restrictions
      where reason_code='participant_withdrawn' and scope_id='${participantId}' and contribution_observation_id='${observation(3)}'`) === "1",
    "participant operational restoration bypassed the permanent restriction");
  } catch {
    blocker.stdin?.write("rollback;\n\\q\n");
    blocker.kill();
    throw new Error("controlled independent-backend concurrency assertion failed");
  } finally {
    competitor?.stdin?.end(); competitor?.kill();
    blocker.stdin?.end(); blocker.kill();
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
  phase = "application role escalation regression";
  verifyApplicationRoleEscalationDenied();

  phase = "local PostgREST credential identity";
  const { admin, anonymous, authenticated } = clients(status);
  phase = "browser PostgREST execution denial";
  await verifyPostgrestExecutionBoundary(admin, anonymous, authenticated);

  phase = "fixture setup";
  const fixture = readFileSync(new URL("../tests/sql/validation-b31.sql", import.meta.url), "utf8");
  const setup = buildB43Fixture(fixture);
  sql(`begin;${setup}\ncommit;`);
  check(sql(`select (select count(*) from public.validation_participants)=120
    and (select count(*) from public.validation_interview_sessions)=120
    and (select count(*) from public.validation_evidence_observations)=120
    and (select count(*) from public.validation_evidence_classifications)=120
    and (select count(*) from public.validation_customer_interview_shareable_evidence)=119
    and exists(select 1 from public.validation_customer_interview_shareable_evidence where source_observation_id='${observation(4)}')
    and not exists(select 1 from public.validation_customer_interview_shareable_evidence where source_observation_id='${observation(18)}')`) === "t",
    "fixture_cardinality_or_review_contract_failed");
  const direct = readCurrentEvidence();
  check(direct.complete && direct.observations.length === 0, "fixture canonical trusted SQL read was not empty");

  phase = "B4.3-C1 source transitions, no-ops and atomic rollback";
  sql(readFileSync(new URL("../tests/sql/validation-b43-source-transitions.sql", import.meta.url), "utf8"));
  check(sql(`select
    not exists(select 1 from public.validation_evidence_source_restrictions)
    and not exists(select 1 from public.validation_evidence_observations where ingestion_key='b43-c1-during-withdrawal')
    and (select status='active' from public.validation_participants where id='${participant(1)}')
    and (select status='in_progress' and participant_relevance='target_segment_match'
      from public.validation_interview_sessions where id='a0000000-0000-0000-0000-000000000001')
    and (select lifecycle='running' from public.validation_experiment_versions
      where id='70000000-0000-0000-0000-000000000001')`) === "t",
  "source transition regression transaction did not roll back cleanly");

  phase = "new promotion WITHHELD authority and historical proof preservation";
  const promoted = new Map<number, ReturnType<typeof requirePromotionResult>>();
  for (const i of [1, 2, 3, 4]) {
    const result = await step(`promotion_${i}`, async () => requirePromotionResult(await promoteCustomerInterviewEvidence(owner, observation(i), admin)));
    check(!result.duplicate, `promotion_${i}: unexpected_duplicate`);
    check(sql(`select exists(select 1 from public.validation_evidence_promotions p
      where p.id='${result.promotionId}' and p.problem_observation_id='${result.problemObservationId}'
        and p.owner_id='${owner}' and p.observation_id='${observation(i)}' and p.canonical_problem_id='${canonical}')`) === "t",
      `promotion_${i}: returned_identity_lineage_mismatch`);
    promoted.set(i, result);
  }
  let missingReviewRejected = false;
  try { await step("missing_review_negative_control", () => promoteCustomerInterviewEvidence(owner, observation(18), admin)); }
  catch { missingReviewRejected = protocolFailure === "http:400;sqlstate:23514"; }
  check(missingReviewRejected && sql(`select count(*) from public.validation_evidence_promotions where observation_id='${observation(18)}'`) === "0",
    "missing_review_negative_control: expected_23514_and_no_promotion");
  check(sql("select count(*) from public.validation_evidence_consumption_authority where authority_state='withheld'") === "4", "new promotions did not receive exactly one WITHHELD fact each");
  check(sql("select count(*) from public.validation_qualified_evidence_snapshots where attestation_version='v8-b4.2-b1-full-row.2'") === "4", "new promotions did not preserve B4.2 v2 proofs");
  const current = readCurrentEvidence();
  check(current.complete && current.observations.length === 0, "WITHHELD evidence was not excluded from a complete current read");
  const history = await step("historical_reader", () => readTrustedQualifiedValidationEvidence(canonical, admin));
  check(history.complete && history.observations.length === 4 &&
    ["supporting", "contradicting", "mixed"].every((polarity) => history.observations.some((row) => row.evidence_polarity === polarity)),
  "B3.1/B4.2 historical reader or original polarity behavior changed");
  check((await step("exact_retry", () => promoteCustomerInterviewEvidence(owner, observation(1), admin))).duplicate === true &&
    sql("select count(*) from public.validation_evidence_consumption_authority") === "4", "exact retry created duplicate authority");

  const historicalDigestQuery = `select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(s) order by s.promotion_id) from public.validation_qualified_evidence_snapshots s),
    (select jsonb_agg(to_jsonb(p) order by p.id) from public.validation_evidence_promotions p),
    (select jsonb_agg(to_jsonb(po) order by po.id) from public.problem_observations po),
    (select jsonb_agg(to_jsonb(a) order by a.id) from public.validation_evidence_consumption_authority a))::text)`;
  const historicalDigest = sql(historicalDigestQuery);

  phase = "candidate population overflow with valid boundary control";
  const atBound = Array.from({ length: 96 }, (_, index) => fixturePromotion(index + 20)).join("\n");
  probeUnavailable(`${atBound}
    do $$ begin
      if (select count(*) from public.validation_evidence_promotions where canonical_problem_id='${canonical}') <> 100
        then raise exception using errcode='ZX002'; end if;
      if public.validation_b43_read_current_evidence('${canonical}') <> '{"complete":true,"observations":[]}'::jsonb
        then raise exception using errcode='ZX002'; end if;
    end $$;
    ${fixturePromotion(116)}
    do $$ begin
      if (select count(*) from public.validation_evidence_promotions where canonical_problem_id='${canonical}') <> 101
        then raise exception using errcode='ZX002'; end if;
    end $$;`, "candidate_population_101_after_valid_100", 120000);

  phase = "PostgREST cannot access private facts or write authority";
  const authorityId = sql(`select a.id from public.validation_evidence_consumption_authority a
    join public.validation_evidence_promotions p on p.id=a.promotion_id where p.observation_id='${observation(1)}'`);
  check(/^[0-9a-f-]{36}$/.test(authorityId), "authority_identity_missing_or_ambiguous");
  await expectNoRuntimeFactAccess(admin, anonymous, authenticated, authorityId, promoted.get(1)!.promotionId);

  phase = "withheld authority insertion failure rolls back promotion transaction";
  const sharedBefore = sql("select count(*) from public.problem_observations where source_type='customer_interview_human_reviewed'");
  sql(`create sequence public.b43_authority_rejection_hits;
    create function public.b43_reject_authority_insert() returns trigger language plpgsql as $$
    begin perform nextval('public.b43_authority_rejection_hits');
      raise exception 'synthetic B43 authority rejection' using errcode='23514'; end $$;
    create trigger b43_test_authority_rejection before insert on public.validation_evidence_consumption_authority
      for each row execute function public.b43_reject_authority_insert();`);
  let authorityRejected = false;
  try { await step("authority_write_failure", () => promoteCustomerInterviewEvidence(owner, observation(17), admin)); }
  catch (error) { void error; authorityRejected = protocolFailure === "http:400;sqlstate:23514"; }
  sql("drop trigger b43_test_authority_rejection on public.validation_evidence_consumption_authority; drop function public.b43_reject_authority_insert();");
  check(authorityRejected && sql("select last_value=1 and is_called from public.b43_authority_rejection_hits") === "t",
    "promotion did not reach the injected authority-write failure");
  check(sql(`select not exists(select 1 from public.validation_evidence_promotions where observation_id='${observation(17)}')
    and not exists(select 1 from public.validation_qualified_evidence_snapshots s join public.validation_evidence_promotions p on p.id=s.promotion_id where p.observation_id='${observation(17)}')
    and (select count(*) from public.problem_observations where source_type='customer_interview_human_reviewed')=${sharedBefore}`) === "t",
  "authority-write failure left shared, ledger, or snapshot state committed");
  sql("drop sequence public.b43_authority_rejection_hits");

  phase = "missing authority and corrupted/unsupported B4.2 proofs fail closed";
  expectSqlState(`begin; ${singleMutation("delete from public.validation_evidence_consumption_authority where false")} rollback;`,
    "ZX002", "fault_guard_rejects_missing_target");
  expectSqlState(`begin; alter table public.validation_evidence_consumption_authority disable trigger USER;
    ${singleMutation("update public.validation_evidence_consumption_authority set authority_state=authority_state")} rollback;`,
    "ZX002", "fault_guard_rejects_multiple_targets");
  probeUnavailable(`alter table public.validation_evidence_consumption_authority disable trigger USER;
    ${singleMutation(`delete from public.validation_evidence_consumption_authority where promotion_id='${promoted.get(4)!.promotionId}'`)}
    alter table public.validation_evidence_consumption_authority enable trigger USER;`, "missing authority candidate");
  const proofCases = [
    ["protected_record malformed", "protected_record='bad-codec'"],
    ["unsupported proof version", "attestation_version='v8-b4.2-b1-snapshot.1'"],
    ["unsupported schema version", "protected_schema=array['unsupported']::text[]"],
  ] as const;
  for (const [label, mutation] of proofCases) {
    probeUnavailable(`alter table public.validation_qualified_evidence_snapshots disable trigger USER;
      ${singleMutation(`update public.validation_qualified_evidence_snapshots set ${mutation} where problem_observation_id='${promoted.get(2)!.problemObservationId}'`)}
      alter table public.validation_qualified_evidence_snapshots enable trigger USER;`, label);
  }

  phase = "authority/restriction immutability and participant restoration";
  const withdraw = await rpc(admin, "validation_update_participant_status", {
    p_owner_id: owner, p_participant_id: participant(1), p_expected_status: "active", p_target_status: "withdrawn",
  });
  check(!withdraw.error, "authorized participant withdrawal RPC failed");
  const restrictionId = sql(`select id from public.validation_evidence_source_restrictions
    where reason_code='participant_withdrawn' and scope_id='${participant(1)}' and contribution_observation_id='${observation(1)}'`);
  check(Boolean(restrictionId), "participant withdrawal restriction missing");
  assertImmutableFacts(authorityId, restrictionId);
  const restore = await rpc(admin, "validation_update_participant_status", {
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
  const relevance = await rpc(admin, "validation_update_interview_relevance", {
    p_owner_id: owner, p_session_id: "a0000000-0000-0000-0000-000000000001",
    p_expected_relevance: "target_segment_match", p_target_relevance: "adjacent_segment",
  });
  check(!relevance.error, "session relevance mutation failed");
  const relevanceRestore = await rpc(admin, "validation_update_interview_relevance", {
    p_owner_id: owner, p_session_id: "a0000000-0000-0000-0000-000000000001",
    p_expected_relevance: "adjacent_segment", p_target_relevance: "target_segment_match",
  });
  check(!relevanceRestore.error && sql("select count(*) from public.validation_evidence_source_restrictions where reason_code='session_relevance_lost'") === "1",
    "relevance restoration cleared permanent restriction");
  const cancellation = await rpc(admin, "validation_update_interview_session", {
    p_owner_id: owner, p_session_id: "a0000000-0000-0000-0000-000000000002",
    p_expected_status: "in_progress", p_target_status: "cancelled", p_notes: null,
  });
  check(!cancellation.error && sql(`select count(*) from public.validation_evidence_source_restrictions
    where reason_code='session_cancelled' and scope_id='a0000000-0000-0000-0000-000000000002'`) === "1",
  "session cancellation did not append its permanent restriction");

  phase = "experiment completion and cancellation semantics";
  const completion = await rpc(admin, "validation_transition_experiment_version", {
    p_owner_id: owner, p_version_id: "70000000-0000-0000-0000-000000000001",
    p_expected_lifecycle: "running", p_target_lifecycle: "completed",
  });
  check(!completion.error && sql("select count(*) from public.validation_evidence_source_restrictions where reason_code='experiment_cancelled'") === "0",
    "experiment completion incorrectly restricted evidence");
  sql(`insert into public.validation_experiments(id,owner_id,subject_id) values
      ('61000000-0000-0000-0000-000000000001','${owner}','30000000-0000-0000-0000-000000000001');
    insert into public.validation_experiment_versions(id,owner_id,subject_id,experiment_id,hypothesis_id,hypothesis_version_id,
      version_number,family,target_audience,collection_method,design_snapshot,consent_privacy_mode,lifecycle,started_at)
    values('71000000-0000-0000-0000-000000000001','${owner}','30000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,'customer_interview',
      '["operators"]','interview','{}','pseudonymous_notes','running',now())`);
  const experimentCancel = await rpc(admin, "validation_transition_experiment_version", {
    p_owner_id: owner, p_version_id: "71000000-0000-0000-0000-000000000001",
    p_expected_lifecycle: "running", p_target_lifecycle: "cancelled",
  });
  check(!experimentCancel.error && sql("select count(*) from public.validation_evidence_source_restrictions where reason_code='experiment_cancelled'") === "1",
    "experiment cancellation restriction missing");

  await controlledParticipantConcurrency(admin);

  phase = "classification ambiguity and supersession restrictions";
  probeUnavailable(singleMutation(`perform public.validation_insert_classification(
    '${owner}','${observation(2)}','contradicting','user_supplied','authoritative',null,null)`),
    "multiple current authoritative classification terminals");
  probeUnavailable(`do $$ begin
    perform public.validation_insert_classification('${owner}','${observation(1)}','inconclusive',
      'ai_model_suggested','suggested',null,'${classification(1)}');
    if (select count(*) from public.validation_evidence_source_restrictions where reason_code='classification_superseded') <> 1
      then raise exception using errcode='ZX002'; end if; end $$;`, "classification supersession");

  phase = "canonical merge, deactivation, and conflicting merge state";
  sql(`insert into public.canonical_problems(id,canonical_key,canonical_title,normalized_title,status)
      values('${targetCanonical}','b43-merge-target','B43 merge target','b43 merge target','active'),
        ('${conflictCanonical}','b43-merge-conflict','B43 conflict','b43 conflict','active');
    update public.canonical_problems set status='merged',merged_into_problem_id='${targetCanonical}' where id='${canonical}';`);
  check(sql(`select count(*) from public.validation_evidence_source_restrictions
    where reason_code='canonical_merged' and scope_id='${canonical}'`) === "1", "canonical merge restriction missing");
  // A consistent merged canonical has a permanent restriction and is excluded;
  // the reader contract reserves P0001 for inconsistent or incomplete proof.
  check(readCurrentEvidence().complete, "consistent_merged_canonical_not_complete");
  sql(`update public.canonical_problems set merged_into_problem_id='${targetCanonical}' where id='${conflictCanonical}';
    update public.canonical_problems set status='deprecated' where id='${targetCanonical}';`);
  expectCurrentReadUnavailable("active canonical with merge target", conflictCanonical);
  check(sql(`select count(*) from public.validation_evidence_source_restrictions where reason_code='canonical_deactivated' and scope_id='${targetCanonical}'`) === "1",
    "canonical deactivation restriction missing");

  check(sql(historicalDigestQuery) === historicalDigest, "historical_proofs_or_authority_changed_after_source_transitions");
  const preservedHistory = await step("historical_reader_after_restrictions", () => readTrustedQualifiedValidationEvidence(canonical, admin));
  check(preservedHistory.complete && preservedHistory.observations.length === 4,
    "historical_reader_after_restrictions_incomplete");
  console.log("PASS B4.3 disposable identity, privilege, authority, proof, source restriction, concurrency, completeness and compatibility checks");
}

try {
  await run();
} catch {
  console.error(`FAIL B4.3: ${phase}; operation:${operation}; ${failure}; database, private rows and credentials suppressed`);
  process.exitCode = 1;
}
