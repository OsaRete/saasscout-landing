/** Run the real-Auth browser tests against the owned fresh membership fixture. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createClient } from "@supabase/supabase-js";
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
  VALIDATION_PRIVATE_MODE: "INTERVIEWS_AND_SURVEYS",
  VALIDATION_PUBLIC_SURVEYS: "ENABLED",
  VALIDATION_PRIVATE_LANDING_PAGES: "ENABLED",
  VALIDATION_PUBLIC_LANDING_PAGES: "ENABLED",
  VALIDATION_LANDING_COOKIE_SECRET: randomBytes(32).toString("hex"),
  VALIDATION_PRIVATE_PROTOTYPES: "ENABLED",
  VALIDATION_PUBLIC_PROTOTYPES: "ENABLED",
  VALIDATION_PROTOTYPE_COOKIE_SECRET: randomBytes(32).toString("hex"),
  VALIDATION_PRIVATE_EXTERNAL_MVP: "ENABLED",
  VALIDATION_PUBLIC_EXTERNAL_MVP: "ENABLED",
  VALIDATION_PRIVATE_COMMERCIAL_INTENT: "ENABLED",
  VALIDATION_PUBLIC_COMMERCIAL_INTENT: "ENABLED",
  SCAN_SERVER_WORKFLOW_ENABLED: "true",
  KNOWLEDGE_EVOLUTION_DUAL_WRITE: "0",
  KNOWLEDGE_EVOLUTION_DIAGNOSTICS: "0",
  BETA_ACCEPTANCE_EGRESS_LOG: resolve(workdir, "browser-egress.log"),
  BETA_ACCEPTANCE_PROVIDER_LOG: resolve(workdir, "browser-provider.log"),
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
const sql = (statement) => docker(["exec", "-i", db, "psql", "-U", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"], statement);
function run(args, commandEnv = env) {
  const result = spawnSync(process.execPath, args, { env: commandEnv, stdio: "inherit", timeout: 300_000 });
  assert.equal(result.status, 0, `Acceptance command failed: ${args[0]}`);
}

assert.equal(sql("SELECT count(*) FROM public.application_provider_reservations;").trim(),
  "0", "Prepare a fresh browser fixture after the database boundary suite");
const appUrl = "http://127.0.0.1:3100";
const occupied = await fetch(appUrl, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
assert.equal(occupied, false, "Acceptance app port is already in use");
writeFileSync(env.BETA_ACCEPTANCE_EGRESS_LOG, "", { mode: 0o600 });
writeFileSync(env.BETA_ACCEPTANCE_PROVIDER_LOG, "", { mode: 0o600 });
run(["--import", "./tests/support/beta-acceptance-egress.mjs", "node_modules/next/dist/bin/next", "build"]);
sql(`UPDATE public.application_beta_release SET open_free_beta = true;
UPDATE public.application_spending_policy SET enabled=true,total_requests=5000,
  openrouter_requests=1000,serpapi_requests=4000,x_requests=0,search_requests=4000,
  user_ai_requests=6,user_search_requests=160,max_concurrent=32,weekly_max_executions=2;
CREATE FUNCTION public.beta_fixture_reject_discovery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.summary = 'Disposable Discovery write rejection' THEN
    RAISE EXCEPTION 'disposable Discovery persistence failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER beta_fixture_reject_discovery BEFORE INSERT ON public.opportunity_discoveries
FOR EACH ROW EXECUTE FUNCTION public.beta_fixture_reject_discovery();`);
async function runBrowser(specs, overrides = {}, filters = []) {
  const scenarioEnv = { ...env, ...overrides };
  const app = spawn(process.execPath, [
    "--import", "./tests/support/beta-acceptance-egress.mjs", "node_modules/next/dist/bin/next",
    "start", "--hostname", "127.0.0.1", "--port", "3100",
  ], { env: scenarioEnv, stdio: "inherit" });
  const exited = once(app, "exit");
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60 && app.exitCode === null; attempt += 1) {
      ready = await fetch(appUrl, { signal: AbortSignal.timeout(1000) }).then((response) => response.ok, () => false);
      if (ready) break;
      await delay(500);
    }
    assert.ok(ready, "Disposable acceptance server failed to start");
    run(["node_modules/@playwright/test/cli.js", "test", ...specs, ...filters,
      "--project=chromium", "--workers=1", "--retries=0", "--reporter=line"], scenarioEnv);
  } finally {
    app.kill();
    await exited;
  }
}
const qualifiedEvidenceCounts = () => sql(`SELECT
  (SELECT count(*) FROM public.validation_customer_interview_shareable_evidence),
  (SELECT count(*) FROM public.validation_evidence_promotions),
  (SELECT count(*) FROM public.validation_qualified_evidence_snapshots);`);
const qualifiedBefore = qualifiedEvidenceCounts();
try {
  if (process.argv.includes("--interview")) {
    await runBrowser(["e2e/beta-disposable-validation.spec.ts"], {}, ["--grep", "interview plan"]);
    const migration = readFileSync("supabase/migrations/20261122000000_validation_interview_question_attribution.sql", "utf8");
    sql(`BEGIN;
CREATE TEMP TABLE attribution_before AS SELECT * FROM public.validation_evidence_observations
  WHERE NOT (observation_content ? 'questionAttribution');
DROP TRIGGER validation_check_interview_question_attribution ON public.validation_evidence_observations;
DROP FUNCTION public.validation_check_interview_question_attribution();
${migration}
DO $$ BEGIN
  IF (SELECT count(*) FROM attribution_before) < 2 OR EXISTS (
    SELECT to_jsonb(old_row) FROM attribution_before old_row
    EXCEPT SELECT to_jsonb(new_row) FROM public.validation_evidence_observations new_row
  ) THEN RAISE EXCEPTION 'Attribution upgrade changed historical observations'; END IF;
END $$;
ROLLBACK;`);
    console.log("Interview attribution upgrade preserved existing unattributed observations.");
  } else {
    await runBrowser(["e2e/beta-disposable-account.spec.ts", "e2e/beta-disposable-scan.spec.ts",
      "e2e/beta-disposable-survey.spec.ts", "e2e/beta-disposable-discovery.spec.ts",
      "e2e/beta-disposable-validation.spec.ts"]);

    const weeklyEmail = `weekly-${connection.fixture_id}-${randomBytes(4).toString("hex")}@example.test`;
    const weeklyPassword = randomBytes(24).toString("base64url");
    const admin = createClient(connection.API_URL, connection.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.admin.createUser({
      email: weeklyEmail, password: weeklyPassword, email_confirm: true,
    });
    assert.equal(error, null, "Disposable Weekly founder setup failed");
    const weeklyUserId = data.user?.id;
    assert.match(weeklyUserId, /^[0-9a-f-]{36}$/);
    sql(`INSERT INTO public.application_user_access
      (user_id,access_role,is_active,unlimited_scans,owner_administrator)
      VALUES ('${weeklyUserId}','beta_member',false,false,true);
      UPDATE public.user_profiles SET weekly_intelligence_enabled=(user_id='${weeklyUserId}');`);
    await runBrowser(["e2e/beta-disposable-weekly.spec.ts"], {
      CRON_SECRET: randomBytes(32).toString("hex"),
      BETA_ACCEPTANCE_WEEKLY_USER_ID: weeklyUserId,
      BETA_ACCEPTANCE_WEEKLY_EMAIL: weeklyEmail,
      BETA_ACCEPTANCE_WEEKLY_PASSWORD: weeklyPassword,
    });
  }
} finally {
  sql(`UPDATE public.application_beta_release SET open_free_beta = false;
UPDATE public.application_spending_policy SET enabled=false;
DROP TRIGGER beta_fixture_reject_discovery ON public.opportunity_discoveries;
DROP FUNCTION public.beta_fixture_reject_discovery();`);
  assert.equal(qualifiedEvidenceCounts(), qualifiedBefore, "Shared Validation evidence changed");
  assert.equal(readFileSync(env.BETA_ACCEPTANCE_EGRESS_LOG, "utf8"), "", "External server fetch attempted");
}
