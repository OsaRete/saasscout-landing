// Local-only acceptance infrastructure, never a deployment tool.
// Requires an explicit disposable opt-in. Owns only the fixed labeled containers.
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

assert.equal(process.env.BETA_MEMBERSHIP_DISPOSABLE, "1", "Explicit disposable opt-in required");
const action = process.argv[2];
assert.ok(["upgrade", "fresh", "stop"].includes(action), "Use upgrade, fresh or stop");
const root = process.env.BETA_MEMBERSHIP_LOCAL_WORKDIR;
assert.ok(root && resolve(root) !== process.cwd(), "Separate local workdir required");
mkdirSync(root, { recursive: true });
const project = "beta-membership-disposable";
const names = { db: `supabase_db_${project}`, auth: `${project}-auth`, rest: `${project}-rest`, gateway: `${project}-gateway` };
const label = "saasscout.beta-membership-disposable";
const statusFile = resolve(root, "connection.json");
function docker(args, input) {
  const result = spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    input, encoding: "utf8", timeout: 120_000, maxBuffer: 8_000_000,
    env: { ...process.env, DOCKER_CONTEXT: "", DOCKER_HOST: "unix:///var/run/docker.sock" },
  });
  if (result.status !== 0) {
    writeFileSync(resolve(root, "command-failure.log"), result.stderr || "Command failed", { mode: 0o600 });
    throw new Error("Local Docker command failed; inspect private command-failure.log");
  }
  return result.stdout.trim();
}
function removeOwned() {
  for (const name of Object.values(names)) {
    const inspect = spawnSync("docker", ["--host=unix:///var/run/docker.sock", "inspect", name], { encoding: "utf8" });
    if (inspect.status !== 0) continue;
    assert.ok(existsSync(statusFile), "No ownership manifest: refusing to replace existing containers");
    const manifest = JSON.parse(readFileSync(statusFile, "utf8"));
    const info = JSON.parse(inspect.stdout)[0];
    assert.equal(info.Config.Labels?.[label], manifest.fixture_id, "Container ownership mismatch");
    docker(["rm", "-f", "-v", name]);
  }
}
if (action === "stop" || action === "fresh") removeOwned();
if (action === "stop") { console.log("Stopped only the labeled local membership fixture containers."); process.exit(0); }
for (const name of Object.values(names)) {
  const found = docker(["container", "ls", "-a", "--filter", `name=^/${name}$`, "--format", "{{.Names}}"]);
  assert.equal(found, "", "Existing fixture: use explicit fresh after reviewing local ownership");
}
const fixture = randomBytes(16).toString("hex");
const secret = randomBytes(32).toString("hex");
const password = randomBytes(20).toString("hex");
const jwt = (role) => {
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role, iss: "supabase", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+86400 })}`;
  return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
};
const connection = { API_URL: "http://127.0.0.1:56321", ANON_KEY: jwt("anon"), SERVICE_ROLE_KEY: jwt("service_role"), fixture_id: fixture, phase: action };
writeFileSync(statusFile, JSON.stringify(connection), { mode: 0o600 });
const network = docker(["network", "ls", "--filter", `name=^${project}$`, "--format", "{{.Name}}"]);
if (!network) docker(["network", "create", project]);
const common = ["--network", project, "--label", `${label}=${fixture}`];
docker(["run", "-d", "--name", names.db, ...common, "--tmpfs", "/var/lib/postgresql/data:rw,size=512m", "-e", `POSTGRES_PASSWORD=${password}`, "postgres:17-alpine"]);
async function ready(probe) {
  for (let i = 0; i < 120; i += 1) {
    if (await probe()) return;
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("Local fixture readiness failed");
}
await ready(() => spawnSync("docker", ["--host=unix:///var/run/docker.sock", "exec", names.db, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { stdio: "ignore" }).status === 0);
const sql = (text) => docker(["exec", "-i", names.db, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X"], text);
sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${password}'; GRANT anon,authenticated,service_role TO authenticator;
CREATE ROLE supabase_auth_admin LOGIN CREATEROLE PASSWORD '${password}';
ALTER ROLE supabase_auth_admin SET search_path = auth;
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA public,extensions TO anon,authenticated,service_role;`);
const authEnv = {
  GOTRUE_API_HOST: "0.0.0.0", GOTRUE_API_PORT: "9999", API_EXTERNAL_URL: connection.API_URL,
  GOTRUE_SITE_URL: "http://127.0.0.1:3100", GOTRUE_DB_DRIVER: "postgres",
  GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${password}@${names.db}:5432/postgres`,
  GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_EXP: "3600", GOTRUE_JWT_AUD: "authenticated",
  GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated", GOTRUE_JWT_ADMIN_ROLES: "service_role",
  GOTRUE_DISABLE_SIGNUP: "false", GOTRUE_MAILER_AUTOCONFIRM: "true", GOTRUE_RATE_LIMIT_EMAIL_SENT: "100",
};
docker(["run", "-d", "--name", names.auth, ...common, ...Object.entries(authEnv).flatMap(([k,v])=>["-e",`${k}=${v}`]), "supabase/gotrue:v2.192.0"]);
const restEnv = { PGRST_DB_URI: `postgres://authenticator:${password}@${names.db}:5432/postgres`, PGRST_DB_SCHEMAS: "public", PGRST_DB_ANON_ROLE: "anon", PGRST_JWT_SECRET: secret };
docker(["run", "-d", "--name", names.rest, ...common, ...Object.entries(restEnv).flatMap(([k,v])=>["-e",`${k}=${v}`]), "postgrest/postgrest:v14.14"]);
const config = `_format_version: '2.1'\nservices:\n- name: auth\n  url: http://${names.auth}:9999/\n  routes:\n  - name: auth\n    strip_path: true\n    paths: [/auth/v1/]\n- name: rest\n  url: http://${names.rest}:3000/\n  routes:\n  - name: rest\n    strip_path: true\n    paths: [/rest/v1/]\n`;
writeFileSync(resolve(root,"kong.yml"),config);
chmodSync(resolve(root,"kong.yml"), 0o644);
docker(["create", "--name", names.gateway, ...common, "-p", "127.0.0.1:56321:8000", "-e", "KONG_DATABASE=off", "-e", "KONG_DECLARATIVE_CONFIG=/tmp/kong.yml", "-e", "KONG_PROXY_LISTEN=0.0.0.0:8000", "-e", "KONG_ADMIN_LISTEN=off", "kong:2.8.1"]);
docker(["cp", resolve(root,"kong.yml"), `${names.gateway}:/tmp/kong.yml`]);
docker(["start", names.gateway]);
await ready(async () => { try { return (await fetch(`${connection.API_URL}/auth/v1/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } });
// GoTrue bootstraps its historical helpers first. Match modern Supabase's
// request.jwt.claims fallback after those real Auth migrations have completed.
sql("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;");
const files = readdirSync("supabase/migrations").filter((name)=>name.endsWith(".sql")).sort();
for (const file of files) {
  if (action === "upgrade" && file === "20261116000000_beta_membership_access.sql") continue;
  sql(readFileSync(resolve("supabase/migrations",file),"utf8"));
}
sql("NOTIFY pgrst, 'reload schema';");
console.log(`Prepared ${action} fixture with real PostgreSQL 17, GoTrue and PostgREST on fixed loopback port. No remote database used.`);
