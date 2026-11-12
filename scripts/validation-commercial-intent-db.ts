import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
// The opt-in and fixed loopback endpoint match the existing disposable acceptance contract.
if (process.env.VALIDATION_COMMERCIAL_INTENT_DB_DISPOSABLE !== "1")
  throw new Error("Explicit disposable database opt-in required");
const container = process.env.VALIDATION_COMMERCIAL_INTENT_TEST_CONTAINER;
if (
  container &&
  !/^saasscout-commercial-intent-test-[a-z0-9-]+$/.test(container)
)
  throw new Error(
    "Only a task-created commercial-intent test container is allowed",
  );
function connection() {
  return spawn(
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
}
function sql(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = connection();
    let out = "",
      error = "";
    child.stdout.on("data", (v) => (out += v));
    child.stderr.on("data", (v) => (error += v));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(error)),
    );
    child.stdin.end(
      `set statement_timeout='30s';set lock_timeout='20s';\n${input}`,
    );
  });
}
const identity = await sql(
  "select current_user='postgres' and session_user=current_user and rolbypassrls from pg_roles where rolname=current_user",
);
if (identity !== "t")
  throw new Error("Trusted disposable migration principal required");
const suite = readFileSync(
  new URL("../tests/sql/validation-commercial-intent.sql", import.meta.url),
  "utf8",
);
console.log(
  (await sql(`begin;${suite}\nrollback;`))
    .split("\n")
    .filter((x) => x.startsWith("PASS"))
    .join("\n"),
);
// Commit only synthetic lineage for independent-connection concurrency checks.
const fixture = suite.split(
  "create function pg_temp.commercial_intent_assert",
)[0];
await sql(fixture);
const owner = "41000000-0000-0000-0000-000000000001";
const version = await sql(
  `select id from public.validation_experiment_versions where owner_id='${owner}'`,
);
const content = suite.match(/c jsonb:='([^']+)';/)?.[1];
const feedback = suite.match(/feedback jsonb:='([^']+)';/)?.[1];
if (!content || !feedback) throw new Error("Synthetic content missing");
await sql(
  `set role service_role;select public.validation_commercial_intent_owner('${owner}','${version}','save','${content}',0);select public.validation_transition_experiment_version('${owner}','${version}','draft','ready');select public.validation_transition_experiment_version('${owner}','${version}','ready','running');select public.validation_commercial_intent_owner('${owner}','${version}','publish',null,1,repeat('f',64));`,
);
await Promise.all(
  [1, 2].map(() =>
    sql(
      `set role service_role;select public.validation_commercial_intent_public(repeat('f',64),'submit','42000000-0000-4000-8000-000000000003','${feedback}',true,repeat('b',64));`,
    ),
  ),
);
if (
  (await sql(
    `select count(*) from public.validation_commercial_intent_submissions where owner_id='${owner}'`,
  )) !== "1"
)
  throw new Error("Concurrent retry counted twice");
console.log("PASS concurrent identical feedback persists one response");
async function waitForLock(granted: boolean) {
  for (let i = 0; i < 40; i++) {
    if (
      (await sql(
        `select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='commercial_intent-race' and l.granted=${granted} and l.pid<>pg_backend_pid()${granted ? " and l.mode='RowShareLock'" : ""});`,
      )) === "t"
    )
      return;
  }
  throw new Error("Expected independent connection lock not observed");
}
for (const close of ["unpublish", "pause"]) {
  if (close === "pause")
    await sql(
      `set role service_role;select public.validation_commercial_intent_owner('${owner}','${version}','publish',null,1,repeat('e',64));`,
    );
  const token = close === "unpublish" ? "f" : "e";
  // Keep the transaction open through stdin until the competing lock is observed.
  // This avoids timing races from fixed sleeps on loaded CI runners.
  const child = connection();
  let heldOutput = "";
  let heldError = "";
  const finished = new Promise<void>((resolve, reject) => {
    child.stderr.on("data", (v) => (heldError += v));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(heldError)),
    );
  });
  const admitted = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (value) => {
      heldOutput += value;
      if (heldOutput.includes("ADMITTED")) resolve();
    });
    child.on("error", reject);
    child.on("close", () => {
      if (!heldOutput.includes("ADMITTED"))
        reject(new Error("Admission holder exited early"));
    });
  });
  child.stdin.write(
    `set statement_timeout='30s';begin;set role service_role;select public.validation_commercial_intent_public(repeat('${token}',64),'resolve',null,null,false,repeat('b',64));select 'ADMITTED';\n`,
  );
  await admitted;
  const closer = sql(
    `set application_name='commercial_intent-race';set role service_role;${close === "pause" ? `select public.validation_transition_experiment_version('${owner}','${version}','running','paused');` : `select public.validation_commercial_intent_owner('${owner}','${version}','unpublish',null,1);`}`,
  );
  await waitForLock(false);
  child.stdin.end("commit;\n");
  await Promise.all([finished, closer]);
  await sql(
    `do $$ begin begin perform public.validation_commercial_intent_public(repeat('${token}',64),'resolve',null,null,false,repeat('b',64));exception when no_data_found then return;end;raise exception 'closed link admitted';end $$;`,
  );
  console.log(
    `PASS observed public admission serializes with ${close}; later access denied`,
  );
}
const edits = await Promise.allSettled(
  [1, 2].map(() =>
    sql(
      `set role service_role;select public.validation_commercial_intent_owner('${owner}','${version}','save','${content}',1);`,
    ),
  ),
);
if (edits.filter((x) => x.status === "fulfilled").length !== 1)
  throw new Error("Concurrent edits require exactly one winner");
console.log("PASS concurrent stale revision rejected");
