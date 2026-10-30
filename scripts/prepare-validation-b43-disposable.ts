import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  B43_API_URL,
  B43_DATABASE_URL,
  B43_MANIFEST_NAME,
  B43_PROJECT_PREFIX,
  ORDINARY_PROJECT_ID,
  assertDisposableConfig,
  type DisposableManifest,
} from "./validation-b43-isolation.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceSupabase = join(repositoryRoot, "supabase");
const originalConfigPath = join(sourceSupabase, "config.toml");
const originalConfig = readFileSync(originalConfigPath, "utf8");
const configuredProjectId = /^project_id\s*=\s*"([^"]+)"/m.exec(originalConfig)?.[1];
if (configuredProjectId !== ORDINARY_PROJECT_ID) {
  throw new Error("ordinary Supabase project configuration changed; refusing disposable copy");
}

const projectId = `${B43_PROJECT_PREFIX}${randomBytes(6).toString("hex")}`;
const projectDir = mkdtempSync(join(tmpdir(), projectId));
const supabaseDir = join(projectDir, "supabase");
cpSync(join(sourceSupabase, "migrations"), join(supabaseDir, "migrations"), { recursive: true, errorOnExist: true });
if (existsSync(join(sourceSupabase, "seed.sql"))) {
  cpSync(join(sourceSupabase, "seed.sql"), join(supabaseDir, "seed.sql"), { errorOnExist: true });
}

function setSectionValue(configText: string, section: string, key: string, value: string): string {
  const lines = configText.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${section}]`);
  if (start < 0) throw new Error(`required Supabase config section missing: ${section}`);
  const nextSection = lines.findIndex((line, index) => index > start && /^\s*\[/.test(line));
  const end = nextSection < 0 ? lines.length : nextSection;
  const matching = [];
  for (let index = start + 1; index < end; index++) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[index])) matching.push(index);
  }
  if (matching.length !== 1) throw new Error(`required Supabase config setting is ambiguous: ${section}.${key}`);
  lines[matching[0]] = lines[matching[0]].replace(new RegExp(`^(\\s*${key}\\s*=\\s*).*$`), `$1${value}`);
  return lines.join("\n");
}

let config = originalConfig
  .replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${projectId}"`)
  .replace(/(^\[api\][\s\S]*?^port\s*=\s*)\d+/m, (_match, prefix: string) => `${prefix}55431`)
  .replace(/(^\[db\][\s\S]*?^port\s*=\s*)\d+/m, (_match, prefix: string) => `${prefix}55432`)
  .replace(/(^\[db\][\s\S]*?^shadow_port\s*=\s*)\d+/m, (_match, prefix: string) => `${prefix}55430`);
config = setSectionValue(config, "local_smtp", "enabled", "false");
config = setSectionValue(config, "edge_runtime", "enabled", "false");
if (config === originalConfig || !config.includes(`project_id = "${projectId}"`)) {
  throw new Error("failed to produce isolated Supabase config");
}
writeFileSync(join(supabaseDir, "config.toml"), config, { flag: "wx" });

const migrationsDir = join(supabaseDir, "migrations");
const migrationHashes = Object.fromEntries(
  // The sorted names are embedded in the manifest so the runner can verify that
  // the isolated project contains the exact checked-out migration chain.
  readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => [name, createHash("sha256").update(readFileSync(join(migrationsDir, name))).digest("hex")]),
);
const manifest: DisposableManifest = {
  schemaVersion: 2,
  projectId,
  apiUrl: B43_API_URL,
  databaseUrl: B43_DATABASE_URL,
  projectDir,
  configSha256: createHash("sha256").update(config).digest("hex"),
  migrationHashes,
};
assertDisposableConfig(config, manifest);
writeFileSync(join(projectDir, B43_MANIFEST_NAME), JSON.stringify(manifest, null, 2), { flag: "wx" });

const output = { projectDir, projectId, apiUrl: B43_API_URL, databaseUrl: B43_DATABASE_URL };
const outputPath = process.argv[2];
if (outputPath === "--github-output") {
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!githubOutput) throw new Error("GitHub output file unavailable");
  const value = (outputValue: string) => outputValue.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  appendFileSync(githubOutput, Object.entries(output).map(([key, valueText]) => `${key}=${value(valueText)}`).join("\n") + "\n");
} else {
  process.stdout.write(JSON.stringify(output));
}
