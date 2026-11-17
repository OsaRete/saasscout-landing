import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { validationTestModule } from "../tests/support/validation-module.ts";
// No URLs or remote DBs accepted. This runner can only address a task-created disposable container.
if (process.env.VALIDATION_PUBLIC_COLLECTION_DISPOSABLE !== "1")
  throw new Error("Disposable opt-in required");
const container = process.env.VALIDATION_PUBLIC_COLLECTION_CONTAINER;
if (
  !container ||
  !/^saasscout-public-integrity-test(?:-[a-z0-9-]+)?$/.test(container)
)
  throw new Error("Task-created disposable container required");
async function sql(statement: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "--host=unix:///var/run/docker.sock",
        "exec",
        "-i",
        container!,
        "psql",
        "-U",
        "postgres",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (v) => (out += v));
    child.stderr.on("data", (v) => (err += v));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err)),
    );
    child.stdin.end(
      `set statement_timeout='15s';set lock_timeout='10s';${statement}`,
    );
  });
}
assert.equal(
  await sql(
    "select current_user='postgres' and session_user=current_user and rolbypassrls from pg_roles where rolname=current_user",
  ),
  "t",
);
if (process.argv.includes("--prepare")) {
  await sql(
    readFileSync(
      new URL("../tests/sql/validation-schema-bootstrap.sql", import.meta.url),
      "utf8",
    ) +
      `
 create role authenticator nologin;
 alter table auth.users add column email text, add column email_confirmed_at timestamptz,
 add column is_anonymous boolean default false, add column deleted_at timestamptz, add column banned_until timestamptz;
 grant usage on schema public,auth to anon,authenticated,service_role;
 grant select on auth.users to service_role;
 create schema extensions;create extension pgcrypto with schema extensions;`,
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      !process.argv.includes("--fresh") &&
      file === "20261120000000_validation_public_collection_bounds.sql"
    )
      continue;
    // Match membership psql / CLI execution: the migration must own any required transaction.
    await sql(readFileSync(new URL(file, directory), "utf8"));
  }
  console.log(
    "PASS complete application migration chain on disposable PostgreSQL (synthetic Auth schema)",
  );
}
const migrationApplied =
  (await sql(
    "select to_regclass('public.validation_collection_usage') is not null",
  )) === "t";
assert.equal(
  await sql(
    "select count(*) from auth.users where id='81000000-0000-0000-0000-000000000001'",
  ),
  "0",
);
const lit = (x: unknown) =>
  `'${(typeof x === "string" ? x : JSON.stringify(x)).replaceAll("'", "''")}'`;
const owner = "81000000-0000-0000-0000-000000000001";
await sql(`insert into auth.users(id) values('${owner}')`);
const subject = JSON.parse(
  await sql(
    `select public.validation_create_subject('${owner}','user_entered','Collection fixture','{}')`,
  ),
).id;
const hypothesis = JSON.parse(
  await sql(
    `select public.validation_create_hypothesis('${owner}','${subject}','operators','Task is slow','Try task',null,'["complete"]','["blocked"]','["unknown"]','[]','[]')`,
  ),
).version.id;
const prototype = validationTestModule("lib/validation/prototypes.ts");
const pc = (prototype.prototypeTemplate as () => Record<string, unknown>)();
const lc = {
  template: "spotlight",
  headline: "Fixture",
  description: "Synthetic collection",
  benefits: [],
  cta: "Join",
  visual: "",
  minimumVisitors: 100,
  targetRate: 10,
  consent:
    "I agree to share my email with the page creator for updates about this idea. I can request removal at any time.",
};
const versions: Record<string, string> = {},
  tokens = {
    survey: "a".repeat(64),
    landing: "b".repeat(64),
    prototype: "c".repeat(64),
  };
for (const [method, family] of [
  ["survey", "survey"],
  ["landing", "landing_waitlist"],
  ["prototype", "interactive_prototype"],
]) {
  const version = JSON.parse(
    await sql(
      `select public.validation_create_experiment('${owner}','${subject}','${hypothesis}','${family}','["operators"]','Research','{}','[]','anonymous_notes')`,
    ),
  ).version.id;
  versions[method] = version;
  await sql(
    `set role service_role;select public.validation_transition_experiment_version('${owner}','${version}','draft','ready');select public.validation_transition_experiment_version('${owner}','${version}','ready','running')`,
  );
  if (method === "survey") {
    const plan = JSON.parse(
      await sql(
        `set role service_role;select public.validation_create_survey_plan('${owner}','${version}','Fixture','Research','[{"questionRef":"question_1","prompt":"What happened?","type":"short_text","required":true}]',null)`,
      ),
    ).id;
    await sql(
      `set role service_role;select public.validation_publish_survey('${owner}','${plan}','${tokens.survey}')`,
    );
  } else
    await sql(
      `set role service_role;select public.validation_${method}_owner('${owner}','${version}','save',${lit(method === "landing" ? lc : pc)},0);select public.validation_${method}_owner('${owner}','${version}','publish',null,1,'${tokens[method as "landing" | "prototype"]}')`,
    );
}
const screen = (pc.screens as { id: string }[])[0].id;
const feedback = { outcome: "no", comment: "Blocked", consent: pc.consent };
function call(
  method: string,
  category: string,
  id: string = crypto.randomUUID(),
  network = "d".repeat(64),
  visitor = "e".repeat(64),
  token = tokens[method as keyof typeof tokens],
) {
  if (method === "survey")
    return `select public.validation_submit_public_survey('${token}','${id}','${"f".repeat(64)}','[{"questionRef":"question_1","value":"Original"}]','${network}')`;
  if (method === "landing")
    return `select public.validation_landing_public('${token}','${category === "events" ? "view" : "submit"}','${visitor}','${id}',${category === "events" ? "null" : lit(id + "@example.com")},${category !== "events"},'${network}')`;
  return `select public.validation_prototype_public('${token}','${category === "events" ? "event" : "submit"}','${visitor}','${id}',${lit(category === "events" ? { screen, target: null } : feedback)},true,'${network}')`;
}
// Seed real historical observations BEFORE the upgrade. Preserve their complete serialized rows.
for (const method of ["landing", "prototype"])
  await sql(
    `set role service_role;${call(method, "events")};${call(method, "submissions")}`,
  );
const survey4 = `select public.validation_submit_public_survey('${tokens.survey}','historical-request-key','${"f".repeat(64)}','[{"questionRef":"question_1","value":"Original"}]')`;
await sql(
  `set role service_role;${migrationApplied ? call("survey", "submissions") : survey4}`,
);
const history = async () =>
  sql(
    `select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from (select 'survey' as kind,to_jsonb(s) as row from validation_survey_submissions s union all select 'answers',to_jsonb(s) from validation_survey_answers s union all select 'landing',to_jsonb(s) from validation_landing_submissions s union all select 'landing_views',to_jsonb(s) from validation_landing_views s union all select 'prototype',to_jsonb(s) from validation_prototype_submissions s union all select 'prototype_views',to_jsonb(s) from validation_prototype_views s) x`,
  );
const historicalSurveyKey = await sql(
  `select idempotency_key from validation_survey_submissions where owner_id='${owner}' limit 1`,
);
const before = await history();
if (!migrationApplied)
  await sql(
    readFileSync(
      new URL(
        "../supabase/migrations/20261120000000_validation_public_collection_bounds.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
assert.equal(await history(), before);
console.log(
  migrationApplied
    ? "PASS fresh schema preserves complete historical evidence/attribution"
    : "PASS populated upgrade preserves complete historical evidence/attribution",
);
assert.equal(
  await sql(
    `select count(*) from validation_collection_usage where experiment_version_id in (${Object.values(versions).map(lit).join(",")}) and submissions=1`,
  ),
  "3",
);
for (const method of ["landing", "prototype"])
  assert.equal(
    await sql(
      `select events from validation_collection_usage where method='${method}' and experiment_version_id='${versions[method]}'`,
    ),
    "1",
  );
for (const method of ["survey", "landing", "prototype"]) {
  const version = versions[method];
  const prototypeIds = [crypto.randomUUID(), crypto.randomUUID()];
  const visitorFor = (id: string) =>
    method === "prototype"
      ? createHash("sha256").update(id).digest("hex")
      : "e".repeat(64);
  if (method === "prototype")
    for (const id of prototypeIds)
      await sql(
        `set role service_role;${call(method, "events", crypto.randomUUID(), "d".repeat(64), visitorFor(id))}`,
      );
  const reset = () => sql(`delete from validation_${method}_rate_buckets`);
  await reset();
  // Simulate separate instances: each invocation is an independent PostgreSQL connection.
  for (const category of method === "survey"
    ? ["submissions"]
    : ["events", "submissions"]) {
    const column = category,
      ceiling = category === "events" ? 10000 : 1000;
    await sql(
      `update validation_collection_usage set ${column}=${ceiling - 1} where method='${method}' and experiment_version_id='${version}'`,
    );
    const ids =
      method === "prototype" && category === "submissions"
        ? prototypeIds
        : [crypto.randomUUID(), crypto.randomUUID()];
    const recordTable =
      method === "survey"
        ? "validation_survey_submissions"
        : `validation_${method}_${category === "events" ? "views" : "submissions"}`;
    const countRecords = () =>
      sql(`select count(*) from ${recordTable} where owner_id='${owner}'`);
    const countBefore = Number(await countRecords());
    const result = await Promise.all(
      ids.map((id) =>
        sql(
          `set role service_role;${call(method, category, id, "d".repeat(64), category === "submissions" ? visitorFor(id) : "e".repeat(64))}`,
        ).then(JSON.parse),
      ),
    );
    assert.equal(result.filter((x) => x.accepted || x.submissionId).length, 1);
    assert.equal(result.filter((x) => x.capacity).length, 1);
    assert.equal(
      await sql(
        `select ${column} from validation_collection_usage where method='${method}' and experiment_version_id='${version}'`,
      ),
      String(ceiling),
    );
    assert.equal(Number(await countRecords()), countBefore + 1);
    const winner = ids[result.findIndex((x) => x.accepted || x.submissionId)];
    assert.ok(
      !JSON.parse(
        await sql(
          `set role service_role;${call(method, category, winner, "d".repeat(64), category === "submissions" ? visitorFor(winner) : "e".repeat(64))}`,
        ),
      ).capacity,
    );
    assert.equal(Number(await countRecords()), countBefore + 1);
    console.log(
      `PASS ${method} ${category}: concurrent final unit, identical retry at capacity`,
    );
  }
  await reset();
  // Two instances race at the last aggregate unit while retrying persisted records.
  const duplicateId =
    method === "survey"
      ? historicalSurveyKey
      : method === "landing"
        ? await sql(
            `select split_part(email,'@',1) from validation_landing_submissions where owner_id='${owner}' limit 1`,
          )
        : crypto.randomUUID();
  await sql(
    `insert into validation_${method}_rate_buckets values((select id from validation_${method}_publications where token_hash='${tokens[method as keyof typeof tokens]}'),'global',date_trunc('minute',clock_timestamp()),599)`,
  );
  const lastRate = await Promise.all(
    ["6", "7"].map((network) =>
      sql(
        `set role service_role;${call(method, "submissions", duplicateId, network.repeat(64))}`,
      ).then(JSON.parse),
    ),
  );
  assert.equal(lastRate.filter((x) => x.accepted || x.submissionId).length, 1);
  assert.equal(lastRate.filter((x) => x.limited).length, 1);
  console.log(
    `PASS ${method}: concurrent last aggregate rate unit admits one request`,
  );
  await reset();
  // Aggregate exhaustion under rotating network identities must not allocate the rejected bucket.
  await sql(
    `insert into validation_${method}_rate_buckets values((select id from validation_${method}_publications where token_hash='${tokens[method as keyof typeof tokens]}'),'global',date_trunc('minute',clock_timestamp()),600)`,
  );
  const limited = JSON.parse(
    await sql(
      `set role service_role;${call(method, "submissions", crypto.randomUUID(), "9".repeat(64))}`,
    ),
  );
  assert.equal(limited.limited, true);
  assert.equal(
    await sql(
      `select count(*) from validation_${method}_rate_buckets where network_hash='${"9".repeat(64)}'`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select attempts from validation_${method}_rate_buckets where network_hash='global'`,
    ),
    "601",
  );
  console.log(
    `PASS ${method}: committed aggregate limit prevents rotating-network bucket allocation`,
  );
  await reset();
  // Existing per-network limits remain exact and are committed even when capped.
  const limit = method === "survey" ? 10 : method === "landing" ? 20 : 60;
  await sql(
    `insert into validation_${method}_rate_buckets values((select id from validation_${method}_publications where token_hash='${tokens[method as keyof typeof tokens]}'),'${"8".repeat(64)}',date_trunc('minute',clock_timestamp()),${limit})`,
  );
  assert.equal(
    JSON.parse(
      await sql(
        `set role service_role;${call(method, "submissions", crypto.randomUUID(), "8".repeat(64))}`,
      ),
    ).limited,
    true,
  );
  await reset();
  // Expired buckets are pruned before any limited outcome.
  await sql(
    `insert into validation_${method}_rate_buckets values((select id from validation_${method}_publications where token_hash='${tokens[method as keyof typeof tokens]}'),'${"7".repeat(64)}',now()-interval '2 days',1)`,
  );
  await sql(`set role service_role;${call(method, "submissions")}`);
  assert.equal(
    await sql(
      `select count(*) from validation_${method}_rate_buckets where minute<now()-interval '1 day'`,
    ),
    "0",
  );
}
// Erasure is intentionally not a refund, and replacement does not create a new experiment budget.
const landingContact = await sql(
  `select id from validation_landing_submissions where owner_id='${owner}' limit 1`,
);
await sql(
  `set role service_role;select validation_landing_owner('${owner}','${versions.landing}','remove',${lit({ submissionId: landingContact })},1);select validation_landing_owner('${owner}','${versions.landing}','publish',null,1,'${"6".repeat(64)}')`,
);
assert.equal(
  await sql(
    `select submissions from validation_collection_usage where method='landing' and experiment_version_id='${versions.landing}'`,
  ),
  "1000",
);
assert.equal(
  JSON.parse(
    await sql(
      `set role service_role;${call("landing", "events", crypto.randomUUID(), "1".repeat(64), "e".repeat(64), "6".repeat(64))}`,
    ),
  ).capacity,
  true,
);
tokens.landing = "6".repeat(64);
assert.equal(
  JSON.parse(
    await sql(`set role service_role;${call("landing", "submissions")}`),
  ).capacity,
  true,
);
// Survey rejection and conflicts return normally so aggregate/network accounting commits.
await sql("delete from validation_survey_rate_buckets");
const bad = JSON.parse(
  await sql(
    `set role service_role;select validation_submit_public_survey('${tokens.survey}','bad-payload','${"f".repeat(64)}','[]','${"4".repeat(64)}')`,
  ),
);
assert.equal(bad.rejected, true);
assert.equal(
  await sql(
    "select attempts from validation_survey_rate_buckets where network_hash='global'",
  ),
  "1",
);
const conflict = JSON.parse(
  await sql(
    `set role service_role;select validation_submit_public_survey('${tokens.survey}','${historicalSurveyKey}','${"1".repeat(64)}','[{"questionRef":"question_1","value":"Changed"}]','${"4".repeat(64)}')`,
  ),
);
assert.equal(conflict.conflict, true);
assert.equal(
  await sql(
    "select attempts from validation_survey_rate_buckets where network_hash='global'",
  ),
  "2",
);
console.log(
  "PASS erasure/replacement preserve consumption; Survey rejections/conflicts commit rate charges",
);
// Replacement of Survey and Prototype publications retains the exact version budget.
for (const method of ["survey", "prototype"] as const) {
  const prior = tokens[method];
  const replacement = method === "survey" ? "2".repeat(64) : "3".repeat(64);
  if (method === "survey") {
    const plan = await sql(
      `select survey_plan_version_id from validation_survey_publications where token_hash='${prior}'`,
    );
    await sql(
      `set role service_role;select validation_publish_survey('${owner}','${plan}','${replacement}')`,
    );
  } else
    await sql(
      `set role service_role;select validation_prototype_owner('${owner}','${versions.prototype}','publish',null,1,'${replacement}')`,
    );
  await assert.rejects(
    sql(`set role service_role;${call(method, "submissions")}`),
    /unavailable|no_data_found/,
  );
  tokens[method] = replacement;
  if (method === "prototype") {
    // New-publication navigation is still mandatory, even at capacity.
    const event = await sql(`set role service_role;${call(method, "events")}`);
    assert.equal(JSON.parse(event).capacity, true);
  } else
    assert.equal(
      JSON.parse(
        await sql(`set role service_role;${call(method, "submissions")}`),
      ).capacity,
      true,
    );
  assert.equal(
    await sql(
      `select submissions from validation_collection_usage where method='${method}' and experiment_version_id='${versions[method]}'`,
    ),
    "1000",
  );
}
console.log("PASS all three method budgets survive publication replacement");
// Resolve and submit share the same durable per-network budget, as before.
await sql("delete from validation_survey_rate_buckets");
for (let i = 0; i < 10; i++)
  assert.equal(
    JSON.parse(
      await sql(
        `set role service_role;select validation_admit_public_survey_resolution('${tokens.survey}','${"5".repeat(64)}')`,
      ),
    ).admitted,
    true,
  );
assert.equal(
  JSON.parse(
    await sql(
      `set role service_role;${call("survey", "submissions", crypto.randomUUID(), "5".repeat(64))}`,
    ),
  ).limited,
  true,
);
assert.equal(
  await sql(
    "select attempts from validation_survey_rate_buckets where network_hash='global'",
  ),
  "11",
);
console.log(
  "PASS Survey resolve and submit share durable admission; last per-network unit is exact",
);
// Grants, RLS, public RPCs and table isolation. Exercise actual roles as well as catalog assertions.
for (const role of ["anon", "authenticated"]) {
  assert.equal(
    await sql(
      `select has_function_privilege('${role}','validation_admit_public_survey_resolution(text,text)','EXECUTE')`,
    ),
    "f",
  );
  for (const table of [
    "validation_collection_usage",
    "validation_survey_rate_buckets",
  ]) {
    assert.equal(
      await sql(
        `select has_table_privilege('${role}','${table}','SELECT') or has_table_privilege('${role}','${table}','INSERT') or has_table_privilege('${role}','${table}','UPDATE') or has_table_privilege('${role}','${table}','DELETE')`,
      ),
      "f",
    );
    await assert.rejects(
      sql(`set role ${role};select * from ${table}`),
      /permission denied/,
    );
  }
  assert.equal(
    await sql(
      `select has_function_privilege('${role}','validation_submit_public_survey(text,text,text,jsonb,text)','EXECUTE')`,
    ),
    "f",
  );
  await assert.rejects(
    sql(`set role ${role};${call("survey", "submissions")}`),
    /permission denied/,
  );
}
assert.equal(
  await sql(
    "select bool_and(relrowsecurity) from pg_class where relname in ('validation_collection_usage','validation_survey_rate_buckets')",
  ),
  "t",
);
assert.equal(
  await sql(
    "select has_table_privilege('service_role','validation_collection_usage','DELETE')",
  ),
  "f",
);
for (const method of ["survey", "landing", "prototype"]) {
  const version = versions[method];
  await sql(
    `set role service_role;select validation_transition_experiment_version('${owner}','${version}','running','paused')`,
  );
  await assert.rejects(
    sql(`set role service_role;${call(method, "submissions")}`),
    /unavailable|no_data_found/,
  );
  await sql(
    `set role service_role;select validation_transition_experiment_version('${owner}','${version}','paused','running')`,
  );
  if (method === "survey") {
    const publication = await sql(
      `select id from validation_survey_publications where token_hash='${tokens.survey}'`,
    );
    await sql(
      `set role service_role;select validation_revoke_survey('${owner}','${publication}')`,
    );
  } else
    await sql(
      `set role service_role;select validation_${method}_owner('${owner}','${version}','unpublish',null,1)`,
    );
  await assert.rejects(
    sql(`set role service_role;${call(method, "submissions")}`),
    /unavailable|no_data_found/,
  );
}
console.log(
  "PASS real browser-role table/RPC denials, RLS, no consumption deletion, and publication lifecycle closure",
);

assert.equal(
  await sql(
    "select has_function_privilege('service_role','validation_submit_public_survey(text,text,text,jsonb)','EXECUTE')",
  ),
  "f",
);
console.log(
  "PASS retired legacy Survey entry fails closed for old application artifacts",
);
// Run the existing method SQL contracts in rolled-back transactions on this same catalog.
for (const suite of [
  "validation-landing-pages.sql",
  "validation-prototypes.sql",
  "validation-external-mvp.sql",
  "validation-commercial-intent.sql",
]) {
  const output = await sql(
    `begin;${readFileSync(new URL("../tests/sql/" + suite, import.meta.url), "utf8")}rollback;`,
  );
  console.log(
    output
      .split("\n")
      .filter((line) => line.startsWith("PASS"))
      .join("\n"),
  );
}
