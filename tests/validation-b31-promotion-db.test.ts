import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import test from "node:test";

const databaseUrl = process.env.B31_PROMOTION_TEST_DATABASE_URL;
const disposableConfirmation = process.env.B31_PROMOTION_TEST_DISPOSABLE === "I_UNDERSTAND_THIS_DATABASE_IS_DISPOSABLE";
const runIfDb = databaseUrl ? test : test.skip;
const execFileAsync = promisify(execFile);

function assertDisposableDatabase() {
  assert.ok(disposableConfirmation, "B31_PROMOTION_TEST_DISPOSABLE must explicitly confirm a disposable database.");
  const parsed = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(parsed.hostname), "B3.1 tests accept local disposable databases only.");
  assert.doesNotMatch(databaseUrl!, /supabase\.co|pooler\.supabase/i, "Hosted Supabase endpoints are forbidden.");
}

runIfDb("B3.1 migration and promotion contract execute in a disposable PostgreSQL database", () => {
  assertDisposableDatabase();
  execFileSync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1", "-f", "tests/sql/validation-b31-promotion-integration.sql"], { stdio: "pipe" });
});

runIfDb("membership-changing classification waits for the participant promotion lock", async () => {
  assertDisposableDatabase();
  const fixture = `${readFileSync("tests/sql/validation-b31-promotion-integration.sql", "utf8").split("-- A changed terminal classification is explicitly final")[0]}commit;\n`;
  execFileSync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1"], { input: fixture, stdio: ["pipe", "pipe", "pipe"] });
  execFileSync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1", "-c", `
    insert into public.validation_evidence_observations(id,owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,interview_session_id,origin,modality,observed_at,source_type,collected_by,observation_content)
    select 'a0000000-0000-4000-8000-00000000b313',owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,interview_session_id,origin,modality,observed_at + interval '1 hour',source_type,collected_by,observation_content
    from public.validation_evidence_observations where id='a0000000-0000-4000-8000-00000000b311';
  `], { stdio: "pipe" });
  const holder = execFileAsync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1", "-c", `begin; select public.validation_lock_participant_membership_v1('00000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b311'); select pg_sleep(1.5); commit;`]);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const started = Date.now();
  await execFileAsync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1", "-c", `insert into public.validation_evidence_classifications(owner_id,observation_id,polarity,classification_source,authority_status) values ('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b313','supporting','user_supplied','authoritative');`]);
  await holder;
  assert.ok(Date.now() - started >= 900, "classification did not wait for the participant membership lock");

  async function assertMutationWaits(sql: string, label: string) {
    const lockHolder = execFileAsync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1", "-c", `begin; select public.validation_lock_participant_membership_v1('00000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b311'); select pg_sleep(1.5); commit;`]);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const mutationStarted = Date.now();
    await execFileAsync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1", "-c", sql]);
    await lockHolder;
    assert.ok(Date.now() - mutationStarted >= 900, `${label} did not wait for the participant membership lock`);
  }
  await assertMutationWaits("update public.validation_experiment_versions set lifecycle='paused' where id='60000000-0000-4000-8000-00000000b311';", "experiment lifecycle mutation");
  await assertMutationWaits("update public.validation_interview_sessions set status='completed',completed_at=now() where id='90000000-0000-4000-8000-00000000b311';", "session lifecycle mutation");

  const retrySql = `select public.validation_promote_customer_interview_v1('00000000-0000-4000-8000-00000000b311','a0000000-0000-4000-8000-00000000b311','b0000000-0000-4000-8000-00000000b311','10000000-0000-4000-8000-00000000b311','Invoice bottleneck','Invoice Approval Bottleneck','supporting',public.validation_promotion_authority_rows_v1('00000000-0000-4000-8000-00000000b311','70000000-0000-4000-8000-00000000b311'));`;
  const [retryA,retryB]=await Promise.all([
    execFileAsync("psql",[databaseUrl!,"-X","-q","-At","-v","ON_ERROR_STOP=1","-c",retrySql]),
    execFileAsync("psql",[databaseUrl!,"-X","-q","-At","-v","ON_ERROR_STOP=1","-c",retrySql]),
  ]);
  assert.equal(retryA.stdout.trim(),retryB.stdout.trim(),"same-observation retries returned different promotions");
  const counts=execFileSync("psql",[databaseUrl!,"-X","-q","-At","-v","ON_ERROR_STOP=1","-c","select count(*)||':'||(select count(*) from public.validation_evidence_promotions where observation_id='a0000000-0000-4000-8000-00000000b311') from public.problem_observations where source_type='validation_customer_interview_promotion_v1';"],{encoding:"utf8"}).trim();
  assert.equal(counts,"1:1");
});
