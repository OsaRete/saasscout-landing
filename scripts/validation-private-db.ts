import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Only an explicitly authorized disposable database at the existing test endpoint.
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (process.env.VALIDATION_PRIVATE_DB_DISPOSABLE !== "1")
  throw new Error("Explicit disposable database opt-in required; no skip");
const upgrade = process.argv.includes("--upgrade");
const repair = readFileSync(new URL("../supabase/migrations/20261111000000_private_validation_database_repair.sql", import.meta.url), "utf8");
function sql(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let diagnostic = "";
    child.stdout.on("data", (value) => { output += value; });
    child.stderr.on("data", (value) => { diagnostic += value; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`Disposable SQL failed: ${diagnostic}`)));
    child.stdin.end(`set statement_timeout='10s'; set lock_timeout='5s';\n${input}`);
  });
}
const identity = await sql("select session_user=current_user and current_user='postgres' and rolbypassrls from pg_roles where rolname=current_user;");
if (!identity.endsWith("t")) throw new Error("Trusted disposable migration principal required");
if (!(await sql("select count(*)=0 from public.validation_subjects;")).endsWith("t"))
  throw new Error("Fresh disposable fixture database required");
const fixture = readFileSync(new URL("../tests/sql/validation-b31.sql", import.meta.url), "utf8")
  .split("-- B31_FIXTURE_SETUP_END (machine-readable boundary consumed by the DB concurrency runner)")[0];
await sql(`begin; ${fixture}
revoke all on function public.b31_test_promote(integer,text,text) from public,anon,authenticated,service_role,authenticator;
commit;`);
// Positive proof fixtures use postgres SQL ONLY; no runtime grants are restored.
for (const [i, polarity] of [[1, "supporting"], [2, "contradicting"], [3, "mixed"]] as const) {
  const fingerprint = createHash("sha256").update(JSON.stringify({
    canonicalProblemId: "20000000-0000-0000-0000-000000000001",
    classificationId: `c0000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    observationId: `b0000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    polarity, policyVersion: "v8-b1.2", projectionVersion: "v8-b3.1-projection.1", resolverVersion: "v8-b3.0.2-exact.1",
  })).digest("hex");
  await sql(`select public.b31_test_promote(${i},'${polarity}','${fingerprint}');`);
}
if (upgrade) {
  // Whole persisted rows, including private proofs, must survive the upgrade.
  await sql(`begin;
create temp table pr2_before as select tableoid::regclass::text as tab, to_jsonb(p) as row from public.validation_evidence_promotions p
union all select tableoid::regclass::text,to_jsonb(p) from public.validation_qualified_evidence_snapshots p
union all select tableoid::regclass::text,to_jsonb(p) from public.validation_evidence_consumption_authority p
union all select tableoid::regclass::text,to_jsonb(p) from public.validation_customer_interview_shareable_evidence p
union all select tableoid::regclass::text,to_jsonb(p) from public.problem_observations p;
${repair}
do $$ begin if exists (
 (select * from pr2_before except select * from (
 select tableoid::regclass::text,to_jsonb(p) from public.validation_evidence_promotions p
 union all select tableoid::regclass::text,to_jsonb(p) from public.validation_qualified_evidence_snapshots p
 union all select tableoid::regclass::text,to_jsonb(p) from public.validation_evidence_consumption_authority p
 union all select tableoid::regclass::text,to_jsonb(p) from public.validation_customer_interview_shareable_evidence p
 union all select tableoid::regclass::text,to_jsonb(p) from public.problem_observations p) after_rows)
) then raise exception 'upgrade changed historical rows'; end if; end $$;
commit;`);
}
const tests = readFileSync(new URL("../tests/sql/private-validation-repair.sql", import.meta.url), "utf8");
await sql(`begin; ${tests}\nrollback;`);
console.log(`PASS private Validation ${upgrade ? "populated upgrade" : "fresh installation"}: role denials, source persistence, private retry, ownership, proof and restriction atomicity`);

// Independent connections: a runtime source RPC must wait on the original B3.1
// domain lock, then persist state and its restriction in the same commit.
const holder = sql(`begin; select public.validation_b31_lock('participant','90000000-0000-0000-0000-000000000007'); select pg_sleep(2); commit;`);
// Observe the holder's advisory lock before issuing the contending command.
for (let attempt = 0; ; attempt++) {
  if ((await sql("select exists(select 1 from pg_locks where locktype='advisory' and granted and pid<>pg_backend_pid());")).endsWith("t")) break;
  if (attempt >= 30) throw new Error("Source coordination lock was not observed");
}
const writer = sql(`set role service_role;
select public.validation_update_participant_status('10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000007','active','withdrawn');`);
let observedWaiter = false;
for (let attempt = 0; attempt < 30; attempt++) {
  if ((await sql("select exists(select 1 from pg_locks where locktype='advisory' and not granted);")).endsWith("t")) {
    observedWaiter = true;
    break;
  }
}
await Promise.all([holder, writer]);
if (!observedWaiter) throw new Error("Contending runtime source transaction was not observed waiting");
if (!(await sql(`select p.status='withdrawn' and exists(select 1 from public.validation_evidence_source_restrictions r
where r.scope_id=p.id and r.contribution_observation_id='b0000000-0000-0000-0000-000000000007' and r.reason_code='participant_withdrawn')
from public.validation_participants p where p.id='90000000-0000-0000-0000-000000000007';`)).endsWith("t")) throw new Error("Concurrent source transaction did not persist atomically");
console.log("PASS independent-connection source coordination and committed restriction");
