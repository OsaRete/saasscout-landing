-- Scan Intelligence Artifact Persistence Shadow additive schema.
create extension if not exists pgcrypto;

create table public.scan_intelligence_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  artifact_id text not null check (btrim(artifact_id) <> '' and length(artifact_id) <= 80 and artifact_id ~ '^scan-artifact-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  execution_id text not null check (btrim(execution_id) <> '' and length(execution_id) <= 90 and execution_id ~ '^scan-workflow-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  artifact_version text not null check (artifact_version = 'scan-intelligence-artifact@1'),
  workflow_version text not null check (workflow_version = 'scan-workflow@1'),
  canonicalization_version text not null check (canonicalization_version = 'scan-artifact-canonical-json@1'),
  artifact_hash text not null check (artifact_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (idempotency_key ~ '^scan-artifact-shadow:v1:[0-9a-f]{64}$'),
  artifact_payload jsonb not null check (jsonb_typeof(artifact_payload) = 'object'),
  reliability_classification text not null check (btrim(reliability_classification) <> ''),
  validation_readiness text not null check (btrim(validation_readiness) <> ''),
  recommended_category text not null check (btrim(recommended_category) <> ''),
  source_count integer not null check (source_count >= 0),
  independent_source_count integer not null check (independent_source_count >= 0 and independent_source_count <= source_count),
  score10 numeric not null check (score10 >= 0 and score10 <= 10),
  score100 numeric not null check (score100 >= 0 and score100 <= 100),
  created_at timestamptz not null default now(),
  constraint scan_artifacts_execution_matches_artifact check (artifact_id = replace(execution_id, 'scan-workflow-', 'scan-artifact-')),
  constraint scan_artifacts_owner_artifact_unique unique(owner_id, artifact_id),
  constraint scan_artifacts_owner_execution_unique unique(owner_id, execution_id),
  constraint scan_artifacts_owner_idempotency_unique unique(owner_id, idempotency_key)
);
create index scan_artifacts_owner_created_idx on public.scan_intelligence_artifacts(owner_id, created_at desc);
create index scan_artifacts_version_idx on public.scan_intelligence_artifacts(artifact_version);

create or replace function public.prevent_scan_artifact_mutation() returns trigger language plpgsql as $$ begin raise exception 'Scan Artifact persistence rows are append-only' using errcode='55000'; end; $$;
create trigger scan_artifacts_append_only before update or delete on public.scan_intelligence_artifacts for each row execute function public.prevent_scan_artifact_mutation();

create or replace function public.scan_artifact_rpc_valid(p_owner_id uuid, p_artifact_id text, p_execution_id text, p_artifact_version text, p_workflow_version text, p_canonicalization_version text, p_artifact_hash text, p_idempotency_key text, p_artifact_payload jsonb, p_reliability_classification text, p_validation_readiness text, p_recommended_category text, p_source_count integer, p_independent_source_count integer, p_score10 numeric, p_score100 numeric) returns boolean language plpgsql stable as $$
begin
  return p_owner_id is not null
    and exists (select 1 from auth.users where id = p_owner_id)
    and p_artifact_id ~ '^scan-artifact-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and p_execution_id ~ '^scan-workflow-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and p_artifact_id = replace(p_execution_id, 'scan-workflow-', 'scan-artifact-')
    and p_idempotency_key ~ '^scan-artifact-shadow:v1:[0-9a-f]{64}$'
    and p_artifact_hash ~ '^[0-9a-f]{64}$'
    and p_artifact_version = 'scan-intelligence-artifact@1'
    and p_workflow_version = 'scan-workflow@1'
    and p_canonicalization_version = 'scan-artifact-canonical-json@1'
    and p_source_count >= 0 and p_independent_source_count >= 0 and p_independent_source_count <= p_source_count
    and p_score10 >= 0 and p_score10 <= 10 and p_score100 >= 0 and p_score100 <= 100
    and jsonb_typeof(p_artifact_payload) = 'object'
    and p_artifact_payload->>'version' = p_artifact_version
    and p_artifact_payload->>'artifactId' = p_artifact_id
    and p_artifact_payload#>>'{execution,executionId}' = p_execution_id
    and p_artifact_payload#>>'{execution,workflowVersion}' = p_workflow_version
    and p_artifact_payload#>>'{integrity,canonicalizationVersion}' = p_canonicalization_version
    and p_artifact_payload#>>'{integrity,artifactHash}' = p_artifact_hash
    and (p_artifact_payload#>>'{evidence,summary,sourceCount}')::integer = p_source_count
    and (p_artifact_payload#>>'{evidence,summary,independentSourceCount}')::integer = p_independent_source_count
    and (p_artifact_payload#>>'{quality,score10}')::numeric = p_score10
    and (p_artifact_payload#>>'{quality,score100}')::numeric = p_score100
    and p_artifact_payload#>>'{quality,reliabilityClassification}' = p_reliability_classification
    and p_artifact_payload#>>'{validation,readiness}' = p_validation_readiness
    and p_artifact_payload#>>'{solutionIntelligence,recommendedCategory}' = p_recommended_category;
exception when others then return false;
end; $$;

create or replace function public.scan_artifact_row_matches(existing public.scan_intelligence_artifacts, p_artifact_id text, p_execution_id text, p_artifact_version text, p_workflow_version text, p_canonicalization_version text, p_artifact_hash text, p_artifact_payload jsonb, p_reliability_classification text, p_validation_readiness text, p_recommended_category text, p_source_count integer, p_independent_source_count integer, p_score10 numeric, p_score100 numeric) returns boolean language sql stable as $$
  select existing.artifact_id = p_artifact_id and existing.execution_id = p_execution_id and existing.artifact_version = p_artifact_version and existing.workflow_version = p_workflow_version and existing.canonicalization_version = p_canonicalization_version and existing.artifact_hash = p_artifact_hash and existing.artifact_payload = p_artifact_payload and existing.reliability_classification = p_reliability_classification and existing.validation_readiness = p_validation_readiness and existing.recommended_category = p_recommended_category and existing.source_count = p_source_count and existing.independent_source_count = p_independent_source_count and existing.score10 = p_score10 and existing.score100 = p_score100;
$$;

create or replace function public.persist_scan_intelligence_artifact_shadow(p_owner_id uuid, p_artifact_id text, p_execution_id text, p_artifact_version text, p_workflow_version text, p_canonicalization_version text, p_artifact_hash text, p_idempotency_key text, p_artifact_payload jsonb, p_reliability_classification text, p_validation_readiness text, p_recommended_category text, p_source_count integer, p_independent_source_count integer, p_score10 numeric, p_score100 numeric) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.scan_intelligence_artifacts%rowtype; inserted public.scan_intelligence_artifacts%rowtype;
begin
  if not public.scan_artifact_rpc_valid(p_owner_id,p_artifact_id,p_execution_id,p_artifact_version,p_workflow_version,p_canonicalization_version,p_artifact_hash,p_idempotency_key,p_artifact_payload,p_reliability_classification,p_validation_readiness,p_recommended_category,p_source_count,p_independent_source_count,p_score10,p_score100) then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text || ':' || p_idempotency_key, 0));
  select * into existing from public.scan_intelligence_artifacts where owner_id=p_owner_id and (idempotency_key=p_idempotency_key or artifact_id=p_artifact_id or execution_id=p_execution_id) limit 1;
  if found then
    if public.scan_artifact_row_matches(existing,p_artifact_id,p_execution_id,p_artifact_version,p_workflow_version,p_canonicalization_version,p_artifact_hash,p_artifact_payload,p_reliability_classification,p_validation_readiness,p_recommended_category,p_source_count,p_independent_source_count,p_score10,p_score100) then
      return jsonb_build_object('status','replayed','record_id',existing.id,'artifact_id',existing.artifact_id,'artifact_hash',existing.artifact_hash,'persisted_at',existing.created_at);
    end if;
    return jsonb_build_object('status','conflict','record_id',existing.id);
  end if;
  begin
    insert into public.scan_intelligence_artifacts(owner_id, artifact_id, execution_id, artifact_version, workflow_version, canonicalization_version, artifact_hash, idempotency_key, artifact_payload, reliability_classification, validation_readiness, recommended_category, source_count, independent_source_count, score10, score100)
    values (p_owner_id, p_artifact_id, p_execution_id, p_artifact_version, p_workflow_version, p_canonicalization_version, p_artifact_hash, p_idempotency_key, p_artifact_payload, p_reliability_classification, p_validation_readiness, p_recommended_category, p_source_count, p_independent_source_count, p_score10, p_score100) returning * into inserted;
    return jsonb_build_object('status','inserted','record_id',inserted.id,'artifact_id',inserted.artifact_id,'artifact_hash',inserted.artifact_hash,'persisted_at',inserted.created_at);
  exception when unique_violation then
    select * into existing from public.scan_intelligence_artifacts where owner_id=p_owner_id and (idempotency_key=p_idempotency_key or artifact_id=p_artifact_id or execution_id=p_execution_id) limit 1;
    if found and public.scan_artifact_row_matches(existing,p_artifact_id,p_execution_id,p_artifact_version,p_workflow_version,p_canonicalization_version,p_artifact_hash,p_artifact_payload,p_reliability_classification,p_validation_readiness,p_recommended_category,p_source_count,p_independent_source_count,p_score10,p_score100) then
      return jsonb_build_object('status','replayed','record_id',existing.id,'artifact_id',existing.artifact_id,'artifact_hash',existing.artifact_hash,'persisted_at',existing.created_at);
    end if;
    return jsonb_build_object('status','conflict');
  end;
end; $$;

alter table public.scan_intelligence_artifacts enable row level security;
revoke all on table public.scan_intelligence_artifacts from anon, authenticated;
revoke all on function public.persist_scan_intelligence_artifact_shadow(uuid,text,text,text,text,text,text,text,jsonb,text,text,text,integer,integer,numeric,numeric) from public, anon, authenticated;
grant execute on function public.persist_scan_intelligence_artifact_shadow(uuid,text,text,text,text,text,text,text,jsonb,text,text,text,integer,integer,numeric,numeric) to service_role;
