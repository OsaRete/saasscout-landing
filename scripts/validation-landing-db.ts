import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
// The opt-in and fixed loopback endpoint match the existing disposable acceptance contract.
if (process.env.VALIDATION_LANDING_DB_DISPOSABLE !== "1")
  throw new Error("Explicit disposable database opt-in required");
const container = process.env.VALIDATION_LANDING_TEST_CONTAINER;
if (container && !/^saasscout-landing-pr3-[a-z0-9-]+$/.test(container))
  throw new Error("Only a task-created landing test container is allowed");
function sql(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      container ? "docker" : "psql",
      container
        ? [
            "exec",
            "-i",
            container,
            "psql",
            "-U",
            "postgres",
            "-q",
            "-X",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
          ]
        : [
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
            "-q",
            "-X",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
          ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "",
      error = "";
    child.stdout.on("data", (v) => (out += v));
    child.stderr.on("data", (v) => (error += v));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(error)),
    );
    child.stdin.end(
      `set statement_timeout='10s';set lock_timeout='5s';\n${input}`,
    );
  });
}
const identity = await sql(
  "select current_user='postgres' and session_user=current_user and rolbypassrls from pg_roles where rolname=current_user",
);
if (identity !== "t")
  throw new Error("Trusted disposable migration principal required");
const suite = readFileSync(
  new URL("../tests/sql/validation-landing-pages.sql", import.meta.url),
  "utf8",
);
console.log(
  (await sql(`begin;${suite}\nrollback;`))
    .split("\n")
    .filter((x) => x.startsWith("PASS"))
    .join("\n"),
);
// Commit only the isolated synthetic setup for observed independent-connection races.
const fixture = suite.split("create function pg_temp.landing_assert")[0];
await sql(fixture);
const owner = "11000000-0000-0000-0000-000000000001";
const version = await sql(
  `select id from public.validation_experiment_versions where owner_id='${owner}'`,
);
const content = JSON.stringify({
  template: "spotlight",
  headline: "Concurrent offer",
  description: "Synthetic acceptance",
  benefits: [],
  cta: "Join",
  visual: "",
  minimumVisitors: 100,
  targetRate: 10,
  consent:
    "I agree to share my email with the page creator for updates about this idea. I can request removal at any time.",
});
await sql(
  `set role service_role;select public.validation_landing_owner('${owner}','${version}','save','${content}',0);select public.validation_transition_experiment_version('${owner}','${version}','draft','ready');select public.validation_transition_experiment_version('${owner}','${version}','ready','running');select public.validation_landing_owner('${owner}','${version}','publish',null,1,repeat('f',64));`,
);
// Concurrent email retries are arbitrated by the page-scoped database uniqueness boundary.
await sql(
  `set role service_role;select public.validation_landing_public(repeat('f',64),'view',repeat('a',64),gen_random_uuid(),null,false,repeat('b',64));`,
);
await Promise.all(
  [1, 2].map(() =>
    sql(
      `set role service_role;select public.validation_landing_public(repeat('f',64),'submit',repeat('a',64),null,'duplicate@example.com',true,repeat('b',64));`,
    ),
  ),
);
if (
  (await sql(
    `select count(*) from public.validation_landing_submissions where owner_id='${owner}' and email='duplicate@example.com'`,
  )) !== "1"
)
  throw new Error("Concurrent duplicate signup was counted twice");
console.log("PASS concurrent duplicate signups persist one contact");
async function waitForLock(granted: boolean) {
  for (let i = 0; i < 40; i++) {
    if (
      (await sql(
        `select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='landing-race' and l.granted=${granted} and l.pid<>pg_backend_pid()${granted ? " and l.mode='RowShareLock'" : ""});`,
      )) === "t"
    )
      return;
  }
  throw new Error("Expected independent-connection lock was not observed");
}
// A public admission holds the version/page/publication share locks until commit.
const holder = sql(
  `set application_name='landing-race';begin;set role service_role;select public.validation_landing_public(repeat('f',64),'submit',repeat('a',64),null,'admitted@example.com',true,repeat('b',64));select pg_sleep(2);commit;`,
);
await waitForLock(true);
const revoker = sql(
  `set application_name='landing-race';set role service_role;select public.validation_landing_owner('${owner}','${version}','unpublish',null,1);`,
);
await waitForLock(false);
await Promise.all([holder, revoker]);
await sql(
  `do $$ begin begin perform public.validation_landing_public(repeat('f',64),'resolve');exception when no_data_found then return;end;raise exception 'revoked link admitted';end $$;`,
);
console.log(
  "PASS independent-connection public admission finishes before waiting unpublish; post-revocation ingress denied",
);
await sql(
  `set role service_role;select public.validation_landing_owner('${owner}','${version}','publish',null,1,repeat('e',64));`,
);
await sql(
  `set role service_role;select public.validation_landing_public(repeat('e',64),'view',repeat('a',64),gen_random_uuid(),null,false,repeat('b',64));`,
);
const admitted = sql(
  `set application_name='landing-race';begin;set role service_role;select public.validation_landing_public(repeat('e',64),'submit',repeat('a',64),null,'pause-admitted@example.com',true,repeat('b',64));select pg_sleep(2);commit;`,
);
await waitForLock(true);
const pauser = sql(
  `set application_name='landing-race';set role service_role;select public.validation_transition_experiment_version('${owner}','${version}','running','paused');`,
);
await waitForLock(false);
await Promise.all([admitted, pauser]);
await sql(
  `do $$ begin begin perform public.validation_landing_public(repeat('e',64),'resolve');exception when no_data_found then return;end;raise exception 'paused link admitted';end $$;`,
);
console.log(
  "PASS independent-connection public admission finishes before waiting pause; post-pause ingress denied",
);
// This fixture remains only in the explicitly disposable DB. Never run against Preview/Production.

const edits = await Promise.allSettled(
  [1, 2].map(() =>
    sql(
      `set role service_role;select public.validation_landing_owner('${owner}','${version}','save','${content}',1);`,
    ),
  ),
);
if (edits.filter((x) => x.status === "fulfilled").length !== 1)
  throw new Error("Concurrent stale edits did not produce exactly one winner");
console.log("PASS concurrent edits reject the stale revision");
