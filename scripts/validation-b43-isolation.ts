import { isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

export const B43_PROJECT_PREFIX = "saasscout-b43-disposable-";
export const ORDINARY_PROJECT_ID = "saasscout-landing";
export const B43_API_URL = "http://127.0.0.1:55431";
export const B43_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55432/postgres";
export const B43_API_PORT = 55431;
export const B43_DATABASE_PORT = 55432;
export const B43_SHADOW_PORT = 55430;
export const B43_MANIFEST_NAME = ".b43-disposable-identity.json";

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
