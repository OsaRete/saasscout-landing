import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration=readFileSync("supabase/migrations/20260829000000_validation_server_commands.sql","utf8");
const service=readFileSync("lib/validation/server/service.ts","utf8");
const repository=readFileSync("lib/validation/server/repository.ts","utf8");
const http=readFileSync("lib/validation/server/http.ts","utf8");
const v2Migration=readFileSync("supabase/migrations/20260828000000_create_validation_domain.sql","utf8");

test("privileged persistence is server-only and authentication precedes admin construction",()=>{assert.match(repository,/import "server-only"/);assert.match(http,/await requireUser\(request\)[\s\S]+createSupabaseAdminClient\(\)/);assert.doesNotMatch(service,/SUPABASE_SERVICE_ROLE_KEY/)});
test("public validation schemas reject owner and authoritative fields",()=>{assert.match(service,/rejectAuthorityFields\(input\)/);for(const field of ["owner_id","collected_at","version_number","started_at","subject_id","experiment_id"])assert.match(readFileSync("lib/validation/server/contracts.ts","utf8"),new RegExp(field))});
test("version allocation is database serialized for both logical roots",()=>{assert.equal((migration.match(/for update/g)??[]).length>=2,true);assert.match(migration,/validation_append_hypothesis_version/);assert.match(migration,/validation_append_experiment_version/)});
test("lifecycle is optimistic and timestamps are database-owned",()=>{assert.match(migration,/lifecycle=p_expected_lifecycle/);assert.match(migration,/coalesce\(started_at,t\)/);assert.match(migration,/p_target_lifecycle='completed'/);assert.match(migration,/p_target_lifecycle='cancelled'/)});
test("RPC authority is service-role-only without definer or RLS weakening",()=>{assert.match(migration,/revoke all[\s\S]+public,anon,authenticated/);assert.match(migration,/grant execute[\s\S]+service_role/);assert.doesNotMatch(migration,/security definer/i);assert.doesNotMatch(migration,/disable row level security|grant (insert|update|delete|all) on table/i)});
test("evidence lineage is derived and idempotency is owner scoped",()=>{assert.match(migration,/where owner_id=p_owner_id and ingestion_key=p_ingestion_key/);assert.match(migration,/e\.subject_id,e\.hypothesis_id,e\.hypothesis_version_id,e\.experiment_id/);assert.doesNotMatch(service,/input\.subjectId|input\.hypothesisId/)});
test("classification browser command excludes AI authority and updates",()=>{assert.doesNotMatch(service,/"ai_model_suggested"/);assert.doesNotMatch(repository,/validation_evidence_classifications"\)\.update/);assert.match(repository,/supersedes_classification_id/)});
test("subject creation encodes the complete typed root-provenance matrix",()=>{
  assert.match(migration,/p_creation_origin = 'user_entered'[\s\S]+p_source_type is not null or p_source_row_id is not null or p_source_version is not null/);
  assert.match(migration,/p_creation_origin in \('discover','scan','weekly','saved_idea','opportunity'\)/);
  assert.match(migration,/p_source_type is distinct from p_creation_origin/);
  assert.match(migration,/p_source_row_id is null or length\(btrim\(p_source_row_id\)\) = 0/);
  assert.match(migration,/insert into public\.validation_subject_links/);
});
test("observation retries use a concurrency-safe insert-winner then load path",()=>{
  assert.match(migration,/on conflict \(owner_id,ingestion_key\) where ingestion_key is not null do nothing returning \* into o/);
  assert.match(migration,/inserted := found[\s\S]+if inserted then return[\s\S]+select \* into o from public\.validation_evidence_observations where owner_id=p_owner_id and ingestion_key=p_ingestion_key/);
});
test("observation idempotency compares the full semantic command with NULL safety",()=>{
  for(const field of ["experiment_version_id","participant_id","origin","modality","behavioral_event_type","observed_at","source_type","source_reference","collected_by","observation_content","content_fingerprint","participant_independence_key","independence_relationship","anonymous_independence_uncertain"]){
    assert.match(migration,new RegExp(`o\\.${field} is distinct from p_${field}`));
  }
  assert.match(migration,/raise exception 'idempotency conflict'/);
});
test("identical content remains representable for distinct participant operations",()=>{
  assert.match(v2Migration,/unique index validation_evidence_ingestion_uidx[\s\S]+\(owner_id, ingestion_key\)/);
  assert.match(v2Migration,/create index validation_evidence_fingerprint_idx/);
  assert.doesNotMatch(v2Migration,/unique index validation_evidence_fingerprint/);
  assert.doesNotMatch(migration,/on conflict \(owner_id,content_fingerprint\)/);
});
