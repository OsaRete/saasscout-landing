import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const required = process.env.VALIDATION_B31_DB_REQUIRED === "1";
const url = process.env.VALIDATION_B31_DATABASE_URL;
if (!url) {
  if (required)
    throw new Error(
      "VALIDATION_B31_DATABASE_URL is required; dedicated DB verification must not skip",
    );
  console.log("SKIP validation-b31-db: disposable database URL is unavailable");
  process.exit(0);
}
const databaseUrl = url;
const marker =
  "-- B31_FIXTURE_SETUP_END (machine-readable boundary consumed by the DB concurrency runner)";
const fixture = await readFile(
  new URL("../tests/sql/validation-b31.sql", import.meta.url),
  "utf8",
);
const occurrences = fixture.split(marker).length - 1;
if (occurrences !== 1)
  throw new Error(
    `B3.1 fixture must contain exactly one marker; found ${occurrences}`,
  );
const [setup, assertions] = fixture.split(marker);

function psql(sql: string, label: string, allowFailure = false) {
  return new Promise<{ code: number; output: string }>((resolve, reject) => {
    const child = spawn(
      "psql",
      [
        databaseUrl,
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `set statement_timeout='8s';set deadlock_timeout='100ms';${sql}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (v) => (output += v));
    child.stderr.on("data", (v) => (output += v));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${label}: child-process timeout`));
    }, 12_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = { code: code ?? -1, output };
      if (!allowFailure && result.code !== 0)
        reject(new Error(`${label}: psql failed (${result.code})\n${output}`));
      else resolve(result);
    });
  });
}
async function race(label: string, mutation: string, promotion: string) {
  const mutator = psql(
    `begin;${mutation};select pg_sleep(.35);rollback;`,
    `${label}:mutation`,
  );
  await new Promise((resolve) => setTimeout(resolve, 60));
  const promote = psql(promotion, `${label}:promotion`);
  await Promise.all([mutator, promote]);
  console.log(`PASS concurrency ${label}`);
}
const promote = (i: number, polarity = "supporting", digit = String(i % 10)) =>
  `select public.b31_test_promote(${i},'${polarity}',repeat('${digit}',64));`;

await psql(`begin;${setup}${marker};commit;`, "fixture setup");
await psql(
  `do $$begin if not exists(select 1 from public.validation_evidence_observations where id='b0000000-0000-0000-0000-000000000007') then raise exception 'fixture observation missing';end if;if not exists(select 1 from public.validation_participants where id='90000000-0000-0000-0000-000000000007') then raise exception 'fixture participant missing';end if;if not exists(select 1 from public.validation_interview_sessions where id='a0000000-0000-0000-0000-000000000007') then raise exception 'fixture session missing';end if;end$$;`,
  "fixture prerequisites",
);
await psql(assertions, "static database assertions");
await race(
  "session-status",
  `select public.validation_b31_lock('experiment','70000000-0000-0000-0000-000000000001');select public.validation_b31_lock('participant','90000000-0000-0000-0000-000000000007');update public.validation_interview_sessions set status='cancelled',started_at=null,cancelled_at=now() where id='a0000000-0000-0000-0000-000000000007'`,
  promote(7),
);
await race(
  "session-relevance",
  `select public.validation_b31_lock('experiment','70000000-0000-0000-0000-000000000001');select public.validation_b31_lock('participant','90000000-0000-0000-0000-000000000008');update public.validation_interview_sessions set participant_relevance='adjacent_segment' where id='a0000000-0000-0000-0000-000000000008'`,
  promote(8),
);
await race(
  "participant-status",
  `select public.validation_b31_lock('participant','90000000-0000-0000-0000-000000000009');update public.validation_participants set status='withdrawn' where id='90000000-0000-0000-0000-000000000009'`,
  promote(9),
);
await race(
  "experiment-lifecycle",
  `select public.validation_b31_lock('experiment','70000000-0000-0000-0000-000000000001');update public.validation_experiment_versions set lifecycle='paused' where id='70000000-0000-0000-0000-000000000001'`,
  promote(10),
);
await race(
  "classification-supersession",
  `select public.validation_insert_classification('10000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000011','supporting','user_supplied','authoritative',null,'c0000000-0000-0000-0000-000000000011')`,
  promote(11),
);
const retries = await Promise.all([
  psql(promote(12), "exact-retry-a"),
  psql(promote(12), "exact-retry-b"),
]);
if (retries.some((result) => result.code !== 0))
  throw new Error("exact retries did not serialize");
await psql(
  `do $$begin if (select count(*) from public.validation_evidence_promotions where observation_id='b0000000-0000-0000-0000-000000000012' and problem_observation_id is not null)<>1 then raise exception 'exact retry duplicated ledger';end if;end$$;`,
  "exact retry assertion",
);
const peer = await Promise.all([
  psql(promote(14), "same-group-peer-a", true),
  psql(promote(15), "same-group-peer-b", true),
]);
if (peer.filter((result) => result.code === 0).length !== 1)
  throw new Error(
    `different-peer race expected one winner; results ${peer.map((r) => r.code)}`,
  );
if (
  peer.some((result) =>
    /deadlock detected|statement timeout/i.test(result.output),
  )
)
  throw new Error("different-peer race deadlocked or timed out");
await psql(
  `do $$begin if (select count(*) from public.validation_evidence_promotions where participant_id='90000000-0000-0000-0000-000000000014' and canonical_problem_id='20000000-0000-0000-0000-000000000001' and polarity='supporting' and policy_version='v8-b1.2' and problem_observation_id is not null)<>1 then raise exception 'same-group finality failed';end if;if (select count(*) from public.problem_observations po join public.validation_evidence_promotions p on p.problem_observation_id=po.id where p.participant_id='90000000-0000-0000-0000-000000000014' and p.policy_version='v8-b1.2')<>1 then raise exception 'same-group shared count failed';end if;end$$;`,
  "different-peer same-group assertion",
);
console.log(
  "PASS validation-b31-db: 7 independent-connection concurrency scenarios and static assertions",
);
