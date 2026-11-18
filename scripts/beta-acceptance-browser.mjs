/** Run the real-Auth browser tests against the owned fresh membership fixture. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

assert.equal(process.env.BETA_MEMBERSHIP_DISPOSABLE, "1", "Disposable opt-in required");
const workdir = process.env.BETA_MEMBERSHIP_LOCAL_WORKDIR;
assert.ok(workdir && resolve(workdir) !== process.cwd(), "Separate fixture directory required");
for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  assert.ok(!existsSync(file), "Use a clean checkout without Next.js environment files");
}
const connection = JSON.parse(readFileSync(resolve(workdir, "connection.json"), "utf8"));
assert.equal(connection.phase, "fresh");
assert.equal(connection.prepared, "true");
assert.equal(connection.API_URL, "http://127.0.0.1:56321");
assert.match(connection.fixture_id, /^[a-f0-9]{32}$/);

const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  CI: process.env.CI,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: connection.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: connection.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: connection.SERVICE_ROLE_KEY,
  OPENROUTER_API_KEY: "disposable-transport-trap",
  SERPAPI_API_KEY: "disposable-transport-trap",
  SCAN_SERVER_WORKFLOW_ENABLED: "true",
  KNOWLEDGE_EVOLUTION_DUAL_WRITE: "0",
  KNOWLEDGE_EVOLUTION_DIAGNOSTICS: "0",
  BETA_ACCEPTANCE_EGRESS_LOG: resolve(workdir, "browser-egress.log"),
  BETA_ACCEPTANCE_BROWSER: "1",
  BETA_ACCEPTANCE_CHROMIUM: process.env.BETA_ACCEPTANCE_CHROMIUM,
};
function docker(args, input) {
  const result = spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env, input, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, "Local fixture Docker command failed");
  return result.stdout;
}
const db = "supabase_db_beta-membership-disposable";
for (const name of [db, "beta-membership-disposable-auth", "beta-membership-disposable-rest", "beta-membership-disposable-gateway"]) {
  const [container] = JSON.parse(docker(["inspect", name]));
  assert.equal(container.Config.Labels["saasscout.beta-membership-disposable"], connection.fixture_id);
  assert.equal(container.State.Running, true);
}
const [gateway] = JSON.parse(docker(["inspect", "beta-membership-disposable-gateway"]));
assert.deepEqual(gateway.NetworkSettings.Ports["8000/tcp"], [{ HostIp: "127.0.0.1", HostPort: "56321" }]);
const sql = (statement) => docker(["exec", "-i", db, "psql", "-U", "postgres", "-X", "-v", "ON_ERROR_STOP=1"], statement);
function run(args) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit", timeout: 300_000 });
  assert.equal(result.status, 0, `Acceptance command failed: ${args[0]}`);
}

const appUrl = "http://127.0.0.1:3100";
const occupied = await fetch(appUrl, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
assert.equal(occupied, false, "Acceptance app port is already in use");
writeFileSync(env.BETA_ACCEPTANCE_EGRESS_LOG, "", { mode: 0o600 });
run(["--import", "./tests/support/beta-acceptance-egress.mjs", "node_modules/next/dist/bin/next", "build"]);
sql("UPDATE public.application_beta_release SET open_free_beta = true;");
const app = spawn(process.execPath, [
  "--import", "./tests/support/beta-acceptance-egress.mjs", "node_modules/next/dist/bin/next",
  "start", "--hostname", "127.0.0.1", "--port", "3100",
], { env, stdio: "inherit" });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && app.exitCode === null; attempt += 1) {
    ready = await fetch(appUrl, { signal: AbortSignal.timeout(1000) }).then((response) => response.ok, () => false);
    if (ready) break;
    await delay(500);
  }
  assert.ok(ready, "Disposable acceptance server failed to start");
  run(["node_modules/@playwright/test/cli.js", "test", "e2e/beta-disposable-account.spec.ts",
    "--project=chromium", "--workers=1", "--retries=0", "--reporter=line"]);
} finally {
  app.kill();
  sql("UPDATE public.application_beta_release SET open_free_beta = false;");
  assert.equal(readFileSync(env.BETA_ACCEPTANCE_EGRESS_LOG, "utf8"), "", "External server fetch attempted");
}
