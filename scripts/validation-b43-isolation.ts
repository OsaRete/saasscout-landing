import { isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const B43_PROJECT_PREFIX = "saasscout-b43-disposable-";
export const ORDINARY_PROJECT_ID = "saasscout-landing";
export const B43_API_URL = "http://127.0.0.1:55431";
export const B43_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55432/postgres";
export const B43_API_PORT = 55431;
export const B43_DATABASE_PORT = 55432;
export const B43_SHADOW_PORT = 55430;
export const B43_MANIFEST_NAME = ".b43-disposable-identity.json";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function isExpectedLocalRpcCredential(apiUrl: string, token: unknown, secret: unknown, role: string): boolean {
  if (apiUrl !== B43_API_URL || typeof token !== "string" || typeof secret !== "string" || !secret ||
      !["anon", "authenticated", "service_role"].includes(role)) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false;
    const header: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const signature = Buffer.from(parts[2], "base64url");
    const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
    return record(header) && header.alg === "HS256" && record(claims) && claims.role === role &&
      signature.length === expected.length && timingSafeEqual(signature, expected);
  } catch { return false; }
}

// Return protocol metadata only; never return upstream messages, details, hints,
// credentials, evidence, response bodies or exception text in diagnostics.
export function sqlStateDiagnostic(stderr: unknown): string {
  if (typeof stderr !== "string") return "unclassified_sql_error";
  const states = [...stderr.matchAll(/(?:^|\n)(?:psql:[^\n]*?:\s*)?ERROR:\s+([A-Z0-9]{5})(?=\s|$)/g)];
  return states.length === 1 ? `sqlstate:${states[0][1]}` : "unclassified_sql_error";
}

export function classifyPostgrestDenial(response: unknown): string {
  if (!record(response) || !Number.isInteger(response.status) || typeof response.status !== "number" ||
      response.status < 0 || response.status > 599 || !("data" in response) || !("error" in response)) {
    return "malformed_response";
  }
  if (response.error === null) return response.status >= 200 && response.status < 300
    ? "unexpected_success" : "malformed_response";
  if (!record(response.error) || typeof response.error.code !== "string" ||
      typeof response.error.message !== "string" || response.data !== null) return "malformed_response";
  if (response.status === 0) return "transport_error";
  if (response.error.code === "42501") return [401, 403].includes(response.status)
    ? "expected_denial" : `unexpected_http_status:${response.status}`;
  if (/^[A-Z0-9]{5}$/.test(response.error.code)) return `unexpected_sqlstate:${response.error.code}`;
  if (/^PGRST[0-9]{3}$/.test(response.error.code)) return `unexpected_postgrest_error:${response.error.code}`;
  return `unexpected_http_status:${response.status}`;
}

export function classifyTrustedCurrentRead(result: unknown, expectation: "empty" | "unavailable"): string {
  if (!record(result)) return "malformed_response";
  if (result.error != null || result.status === null) return "transport_error";
  if (typeof result.status !== "number" || !Number.isInteger(result.status) || result.status < 0 ||
      typeof result.stdout !== "string" || typeof result.stderr !== "string") return "malformed_response";
  const rows = result.stdout.split(/\r?\n/).filter((line) => line !== "");
  if (rows[0] !== "postgres|postgres") return "wrong_identity";
  if (result.status !== 0) {
    const diagnostic = sqlStateDiagnostic(result.stderr);
    const stateOnly = /^(?:psql:[^\n]*?:\s*)?ERROR:\s+P0001\s*$/.test(result.stderr.trim());
    return expectation === "unavailable" && rows.length === 1 && diagnostic === "sqlstate:P0001" && stateOnly
      ? "expected_denial" : diagnostic;
  }
  if (expectation === "unavailable") return "unexpected_success";
  if (rows.length !== 2 || result.stderr.trim() !== "") return "malformed_response";
  try {
    const data: unknown = JSON.parse(rows[1]);
    return record(data) && data.complete === true && Array.isArray(data.observations) &&
      data.observations.length === 0 && Object.keys(data).sort().join(",") === "complete,observations"
      ? "expected_success" : "malformed_response";
  } catch { return "malformed_response"; }
}

export function isTrustedMigrationPrincipalResult(result: unknown): boolean {
  // The preflight explicitly casts both booleans to text, not psql's t/f
  // boolean output. Exact matching also rejects extra fields or result rows.
  return result === "postgres|postgres|true|false";
}

export function hasEffectiveRoleIdentity(output: string, role: string): boolean {
  const rows = output.split(/\r?\n/).filter((line) => line !== "");
  return rows.length === 1 && rows[0] === `postgres|${role}`;
}

// Explicit source-role arguments are essential: SET ROLE does not change the
// authenticated session_user or its right to restore its original role.
export function buildRoleBoundaryQuery(sources: readonly string[], targets: readonly string[]): string {
  const literals = (names: readonly string[]) => {
    if (names.length === 0 || new Set(names).size !== names.length ||
        names.some((name) => !/^[a-z_][a-z0-9_]*$/.test(name))) {
      throw new Error("invalid role boundary identifiers");
    }
    return names.map((name) => `'${name}'`).join(",");
  };
  const sourceNames = literals(sources);
  const targetNames = literals(targets);
  return `with sources as (select * from pg_catalog.pg_roles where rolname in (${sourceNames})),
    targets as (select oid from pg_catalog.pg_roles where rolname in (${targetNames}))
    select (select count(*) from sources)=${sources.length}
      and (select count(*) from targets)=${targets.length}
      and not exists(select 1 from sources where rolsuper or rolcreaterole
        or (rolbypassrls and rolname<>'service_role'))
      and not exists(select 1 from sources s cross join targets t
        where pg_catalog.pg_has_role(s.oid,t.oid,'SET')
          or pg_catalog.pg_has_role(s.oid,t.oid,'USAGE')
          or pg_catalog.pg_has_role(s.oid,t.oid,'MEMBER'))
      and not exists(select 1 from sources s cross join targets t
        cross join pg_catalog.pg_auth_members m
        where m.admin_option and pg_catalog.pg_has_role(s.oid,m.member,'MEMBER')
          and pg_catalog.pg_has_role(m.roleid,t.oid,'MEMBER'))`;
}

// Only the already-verified disposable runner executes this transaction.
// Real catalog memberships exercise the same detector, without granting any
// application role membership in postgres or an actual privileged owner.
export function buildRoleBoundaryNegativeControls(): string {
  const app = "b43_boundary_probe_app";
  const bridge = "b43_boundary_probe_bridge";
  const owner = "b43_boundary_probe_owner";
  const query = buildRoleBoundaryQuery([app], [owner]);
  const expect = (safe: boolean) => `do $$ begin
    if (${query}) is distinct from ${safe ? "true" : "false"} then
      raise exception 'B43 role boundary control failed';
    end if;
  end $$;`;
  const membership = (role: string, member: string, set: boolean, inherit: boolean, admin: boolean) =>
    `grant ${role} to ${member} with set ${set};
     grant ${role} to ${member} with inherit ${inherit};
     grant ${role} to ${member} with admin ${admin};`;
  const cases = [
    membership(owner, app, true, false, false),
    membership(bridge, app, true, false, false) + membership(owner, bridge, true, false, false),
    membership(owner, app, false, true, false),
    membership(bridge, app, false, true, false) + membership(owner, bridge, false, true, false),
    membership(owner, app, false, false, false),
    membership(owner, app, false, false, true),
    membership(bridge, app, true, false, false) + membership(owner, bridge, false, false, true),
    membership(bridge, app, false, false, true) + membership(owner, bridge, true, false, false),
  ];
  return `begin;
    create role ${app} nologin nosuperuser nocreaterole nobypassrls;
    create role ${bridge} nologin nosuperuser nocreaterole nobypassrls;
    create role ${owner} nologin nosuperuser nocreaterole nobypassrls;
    ${expect(true)}
    ${cases.map((grant) => `savepoint boundary_case;
      ${grant}\n${expect(false)}
      rollback to savepoint boundary_case;
      release savepoint boundary_case;
      ${expect(true)}`).join("\n")}
    rollback;`;
}

export type DisposableManifest = Readonly<{
  schemaVersion: 2;
  projectId: string;
  apiUrl: string;
  databaseUrl: string;
  projectDir: string;
  configSha256: string;
  migrationHashes: Readonly<Record<string, string>>;
}>;

export function assertProjectId(projectId: unknown, expectedProjectId: string): asserts projectId is string {
  if (typeof projectId !== "string" || projectId === ORDINARY_PROJECT_ID ||
      !/^saasscout-b43-disposable-[a-f0-9]{12}$/.test(projectId) || projectId !== expectedProjectId) {
    throw new Error("B43 disposable project identity mismatch");
  }
}

export function assertIsolatedPath(projectDir: string, manifestPath: string): void {
  const root = resolve(projectDir);
  const manifest = resolve(manifestPath);
  const rel = relative(root, manifest);
  const tempRelative = relative(resolve(tmpdir()), root);
  if (!isAbsolute(root) || rel !== B43_MANIFEST_NAME || rel.startsWith(`..${sep}`) ||
      tempRelative === "" || tempRelative === ".." || tempRelative.startsWith(`..${sep}`) || isAbsolute(tempRelative)) {
    throw new Error("B43 disposable manifest path mismatch");
  }
}

type ConfigSection = Map<string, string>;
type PortSetting = Readonly<{ section: string; key: string; port: number; enabled: boolean }>;

function parseConfigSections(config: string): Map<string, ConfigSection> {
  const sections = new Map<string, ConfigSection>();
  let sectionName = "";
  for (const sourceLine of config.split(/\r?\n/)) {
    const line = sourceLine.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const header = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
    if (header) {
      sectionName = header[1];
      if (sections.has(sectionName)) throw new Error("duplicate Supabase config section");
      sections.set(sectionName, new Map());
      continue;
    }
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!assignment) continue;
    if (!sections.has(sectionName)) sections.set(sectionName, new Map());
    const values = sections.get(sectionName)!;
    if (values.has(assignment[1])) throw new Error("duplicate Supabase config setting");
    values.set(assignment[1], assignment[2].replace(/^"(.*)"$/, "$1"));
  }
  return sections;
}

function setting(sections: Map<string, ConfigSection>, section: string, key: string): string | undefined {
  return sections.get(section)?.get(key);
}

function configuredPortSettings(sections: Map<string, ConfigSection>): PortSetting[] {
  const settings: PortSetting[] = [];
  for (const [section, values] of sections) {
    const serviceRoot = section.split(".")[0];
    const enabledRaw = values.get("enabled") ?? sections.get(serviceRoot)?.get("enabled");
    const enabled = enabledRaw === undefined || enabledRaw === "true";
    for (const [key, raw] of values) {
      if (key !== "port" && key !== "shadow_port" && !key.endsWith("_port")) continue;
      if (!/^\d+$/.test(raw)) throw new Error("unsupported Supabase port setting");
      settings.push({ section, key, port: Number(raw), enabled });
    }
  }
  return settings;
}

export function assertDisposableConfig(config: string, manifest: DisposableManifest): void {
  assertProjectId(manifest.projectId, manifest.projectId);
  const sections = parseConfigSections(config);
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  const actualConfigHash = createHash("sha256").update(config).digest("hex");
  if (manifest.schemaVersion !== 2 || manifest.configSha256 !== actualConfigHash ||
      projectId !== manifest.projectId || manifest.apiUrl !== B43_API_URL ||
      manifest.databaseUrl !== B43_DATABASE_URL ||
      setting(sections, "api", "port") !== String(B43_API_PORT) ||
      setting(sections, "db", "port") !== String(B43_DATABASE_PORT) ||
      setting(sections, "db", "shadow_port") !== String(B43_SHADOW_PORT) ||
      setting(sections, "api", "enabled") !== "true" ||
      setting(sections, "local_smtp", "enabled") !== "false" ||
      setting(sections, "edge_runtime", "enabled") !== "false") {
    throw new Error("B43 disposable Supabase configuration mismatch");
  }

  const allowedEnabledPorts = new Map([
    ["api.port", B43_API_PORT],
    ["db.port", B43_DATABASE_PORT],
    ["db.shadow_port", B43_SHADOW_PORT],
  ]);
  for (const item of configuredPortSettings(sections)) {
    if (!item.enabled) continue;
    const key = `${item.section}.${item.key}`;
    if (allowedEnabledPorts.get(key) !== item.port) {
      throw new Error(`B43 disposable config has an enabled, unisolated port setting: ${key}`);
    }
  }
}

export type PublishedPort = Readonly<{
  hostIp: string;
  hostPort: number;
  containerPort: number;
}>;

export type ContainerIdentity = Readonly<{
  id: string;
  name: string;
  project: string;
  composeProject: string;
  image: string;
  state: string;
  publishedPorts: readonly PublishedPort[];
  networkIds: readonly string[];
}>;

export type DockerNetworkIdentity = Readonly<{
  id: string;
  name: string;
  driver: string;
  options: Readonly<Record<string, string>>;
  attachedContainerIds: readonly string[];
}>;

export function expectedB43NetworkName(projectId: string): string {
  assertProjectId(projectId, projectId);
  return `saasscout-b43-loopback-${projectId.slice(B43_PROJECT_PREFIX.length)}`;
}

function assertLoopbackBinding(container: ContainerIdentity, expectedPort: number): void {
  const bindings = container.publishedPorts.filter((port) => port.hostPort === expectedPort);
  if (bindings.length !== 1 || bindings[0].hostIp !== "127.0.0.1") {
    throw new Error("B43 disposable published port is wildcard, ambiguous, or not loopback-only");
  }
}

export function assertContainerIdentity(
  containers: readonly ContainerIdentity[],
  projectId: string,
  databasePort = B43_DATABASE_PORT,
  apiPort = B43_API_PORT,
): Readonly<{ database: ContainerIdentity; api: ContainerIdentity }> {
  assertProjectId(projectId, projectId);
  const databaseName = `supabase_db_${projectId}`;
  const apiName = `supabase_kong_${projectId}`;
  const projectContainers = containers.filter((container) =>
    container.project === projectId || container.composeProject === projectId ||
    container.name === databaseName || container.name === apiName);
  if (projectContainers.length === 0 || projectContainers.some((container) =>
    container.project !== projectId || container.composeProject !== projectId || container.state !== "running")) {
    throw new Error("B43 disposable Docker project labels or states are missing, mismatched, or ambiguous");
  }

  const databaseMatches = projectContainers.filter((container) =>
    container.name === databaseName && /(?:^|\/)supabase\/postgres(?::|@|$)/i.test(container.image));
  const apiMatches = projectContainers.filter((container) =>
    container.name === apiName && /(?:^|\/)kong(?::|@|$)/i.test(container.image));
  if (databaseMatches.length !== 1 || apiMatches.length !== 1 || databaseMatches[0].id === apiMatches[0].id) {
    throw new Error("B43 disposable database or API container identity is absent or ambiguous");
  }
  const database = databaseMatches[0];
  const api = apiMatches[0];
  const expectedNetworkId = database.networkIds[0];
  if (!expectedNetworkId || database.networkIds.length !== 1 || api.networkIds.length !== 1 ||
      api.networkIds[0] !== expectedNetworkId || projectContainers.some((container) =>
        container.networkIds.length !== 1 || container.networkIds[0] !== expectedNetworkId)) {
    throw new Error("B43 disposable containers are not attached exclusively to one verified network");
  }
  for (const container of projectContainers) {
    if (container.publishedPorts.some((port) => port.hostIp !== "127.0.0.1" ||
        ![B43_API_PORT, B43_DATABASE_PORT].includes(port.hostPort))) {
      throw new Error("B43 disposable container has a wildcard, IPv6, or unexpected published port");
    }
  }
  assertLoopbackBinding(database, databasePort);
  assertLoopbackBinding(api, apiPort);
  return { database, api };
}

export function assertDedicatedNetworkIdentity(
  network: DockerNetworkIdentity,
  projectId: string,
  expectedNetworkId: string,
  containers: readonly ContainerIdentity[],
): void {
  const expectedName = expectedB43NetworkName(projectId);
  const projectContainerIds = containers.filter((container) =>
    container.project === projectId || container.composeProject === projectId ||
    container.name === `supabase_db_${projectId}` || container.name === `supabase_kong_${projectId}`)
    .map((container) => container.id).sort();
  const attachedIds = [...network.attachedContainerIds].sort();
  if (network.id !== expectedNetworkId || network.name !== expectedName || network.driver !== "bridge" ||
      network.options["com.docker.network.bridge.host_binding_ipv4"] !== "127.0.0.1" ||
      attachedIds.length === 0 || new Set(attachedIds).size !== attachedIds.length ||
      JSON.stringify(attachedIds) !== JSON.stringify(projectContainerIds) ||
      containers.filter((container) => projectContainerIds.includes(container.id)).some((container) =>
        container.networkIds.length !== 1 || container.networkIds[0] !== expectedNetworkId)) {
    throw new Error("B43 dedicated Docker network identity, loopback option, or attachment set mismatch");
  }
}

export function assertPublishedContainerIsExpected(actualIds: readonly string[], expectedId: string): void {
  if (actualIds.length !== 1 || actualIds[0] !== expectedId) {
    throw new Error("B43 disposable published port belongs to another container");
  }
}

export function assertClusterIdentity(hostIdentity: string, containerIdentity: string): void {
  if (!/^postgres\|5432\|\d+$/.test(hostIdentity) || !/^\d+$/.test(containerIdentity) ||
      hostIdentity.split("|")[2] !== containerIdentity) {
    throw new Error("B43 PostgreSQL instance does not match the verified disposable container");
  }
}
