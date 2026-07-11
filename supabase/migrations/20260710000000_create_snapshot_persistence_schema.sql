-- Snapshot Persistence additive schema migration.
--
-- Local migration only. Creates immutable, append-only Snapshot persistence tables
-- and an atomic RPC boundary for complete mapped Snapshot writes.

create extension if not exists pgcrypto;

create or replace function public.snapshot_require_non_empty(value text, field_name text)
returns text
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    raise exception '% is required', field_name using errcode = '22023';
  end if;
  return value;
end;
$$;

create table public.snapshot_identities (
  id uuid primary key default gen_random_uuid(),
  storage_key text not null unique check (btrim(storage_key) <> ''),
  snapshot_id text not null check (btrim(snapshot_id) <> ''),
  discovery_id text not null check (btrim(discovery_id) <> ''),
  contract_version text not null check (btrim(contract_version) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  snapshot_version text not null check (btrim(snapshot_version) <> ''),
  lifecycle_state text not null check (lifecycle_state in ('created', 'validated', 'persisted', 'rejected')),
  engine_version text not null check (btrim(engine_version) <> ''),
  intelligence_version text not null check (btrim(intelligence_version) <> ''),
  normalization_version text check (normalization_version is null or btrim(normalization_version) <> ''),
  confidence_version text check (confidence_version is null or btrim(confidence_version) <> ''),
  validator_version text not null check (btrim(validator_version) <> ''),
  versions jsonb not null check (jsonb_typeof(versions) = 'object'),
  created_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  mapping_hash text not null check (btrim(mapping_hash) <> ''),
  constraint snapshot_identities_repository_identity_key unique (discovery_id, snapshot_id, contract_version, idempotency_key)
);

create table public.snapshot_sections (
  id uuid primary key default gen_random_uuid(),
  snapshot_identity_id uuid not null references public.snapshot_identities(id) on delete restrict,
  storage_key text not null unique check (btrim(storage_key) <> ''),
  snapshot_id text not null check (btrim(snapshot_id) <> ''),
  discovery_id text not null check (btrim(discovery_id) <> ''),
  contract_version text not null check (btrim(contract_version) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  mapping_hash text not null check (btrim(mapping_hash) <> ''),
  section_type text not null check (section_type in ('discovery_context','problem_intelligence','opportunity_intelligence','founder_intelligence','confidence','diagnostics')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  constraint snapshot_sections_snapshot_section_key unique (snapshot_identity_id, section_type),
  constraint snapshot_sections_repository_section_key unique (discovery_id, snapshot_id, contract_version, idempotency_key, section_type)
);

create table public.snapshot_evidence (
  id uuid primary key default gen_random_uuid(),
  snapshot_identity_id uuid not null references public.snapshot_identities(id) on delete restrict,
  storage_key text not null unique check (btrim(storage_key) <> ''),
  snapshot_id text not null check (btrim(snapshot_id) <> ''),
  discovery_id text not null check (btrim(discovery_id) <> ''),
  contract_version text not null check (btrim(contract_version) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  mapping_hash text not null check (btrim(mapping_hash) <> ''),
  evidence_id text not null check (btrim(evidence_id) <> ''),
  evidence_kind text not null check (evidence_kind in ('external_source','extracted_signal','supporting_observation','market_indicator','confidence_rationale')),
  relationship text not null check (relationship in ('supports_problem','supports_opportunity','supports_founder_intelligence','supports_confidence','supports_diagnostic')),
  claim text not null check (btrim(claim) <> ''),
  provenance_ids text[] not null default '{}',
  source_reference jsonb not null default '{}'::jsonb check (jsonb_typeof(source_reference) = 'object'),
  confidence jsonb not null default '{}'::jsonb check (jsonb_typeof(confidence) = 'object'),
  constraint snapshot_evidence_snapshot_evidence_key unique (snapshot_identity_id, evidence_id),
  constraint snapshot_evidence_identity_evidence_row_key unique (id, snapshot_identity_id, evidence_id),
  constraint snapshot_evidence_repository_evidence_key unique (discovery_id, snapshot_id, contract_version, idempotency_key, evidence_id)
);

create table public.snapshot_evidence_supports (
  id uuid primary key default gen_random_uuid(),
  snapshot_identity_id uuid not null references public.snapshot_identities(id) on delete restrict,
  snapshot_evidence_id uuid not null references public.snapshot_evidence(id) on delete restrict,
  storage_key text not null unique check (btrim(storage_key) <> ''),
  snapshot_id text not null check (btrim(snapshot_id) <> ''),
  discovery_id text not null check (btrim(discovery_id) <> ''),
  contract_version text not null check (btrim(contract_version) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  mapping_hash text not null check (btrim(mapping_hash) <> ''),
  evidence_id text not null check (btrim(evidence_id) <> ''),
  support_key text not null check (btrim(support_key) <> ''),
  target_section text not null check (target_section in ('metadata','discovery_context','problem_intelligence','opportunity_intelligence','founder_intelligence','evidence','confidence','diagnostics','versions','provenance')),
  target_field text check (target_field is null or target_field in ('title','summary','pain_description','affected_market','affected_audience','pain_severity','frequency','urgency','existing_workarounds','related_niches','opportunity_score','market_size_signals','competitive_signals','build_simplicity','willingness_to_pay','revenue_potential','risk_indicators','validation_indicators','founder_score','founder_fit','technical_complexity','domain_match','distribution_match','execution_difficulty','founder_advantages','founder_risks','overall','evidence','opportunity','founder','market','diagnostic_item','processing_step','metric')),
  target_id text check (target_id is null or btrim(target_id) <> ''),
  rationale text check (rationale is null or btrim(rationale) <> ''),
  support jsonb not null check (jsonb_typeof(support) = 'object'),
  constraint snapshot_evidence_supports_snapshot_support_key unique (snapshot_identity_id, evidence_id, support_key),
  constraint snapshot_evidence_supports_repository_support_key unique (discovery_id, snapshot_id, contract_version, idempotency_key, evidence_id, support_key),
  constraint snapshot_evidence_supports_owned_evidence_fk foreign key (snapshot_evidence_id, snapshot_identity_id, evidence_id) references public.snapshot_evidence(id, snapshot_identity_id, evidence_id) on delete restrict
);

create table public.snapshot_provenance_sources (
  id uuid primary key default gen_random_uuid(),
  snapshot_identity_id uuid not null references public.snapshot_identities(id) on delete restrict,
  storage_key text not null unique check (btrim(storage_key) <> ''),
  snapshot_id text not null check (btrim(snapshot_id) <> ''),
  discovery_id text not null check (btrim(discovery_id) <> ''),
  contract_version text not null check (btrim(contract_version) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  mapping_hash text not null check (btrim(mapping_hash) <> ''),
  source_id text not null check (btrim(source_id) <> ''),
  source_type text check (source_type is null or btrim(source_type) <> ''),
  source_name text check (source_name is null or btrim(source_name) <> ''),
  source_url text check (source_url is null or btrim(source_url) <> ''),
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  constraint snapshot_provenance_sources_snapshot_source_key unique (snapshot_identity_id, source_id),
  constraint snapshot_provenance_sources_repository_source_key unique (discovery_id, snapshot_id, contract_version, idempotency_key, source_id)
);

create table public.snapshot_evidence_lineage (
  id uuid primary key default gen_random_uuid(),
  snapshot_identity_id uuid not null references public.snapshot_identities(id) on delete restrict,
  snapshot_evidence_id uuid not null references public.snapshot_evidence(id) on delete restrict,
  storage_key text not null unique check (btrim(storage_key) <> ''),
  snapshot_id text not null check (btrim(snapshot_id) <> ''),
  discovery_id text not null check (btrim(discovery_id) <> ''),
  contract_version text not null check (btrim(contract_version) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  mapping_hash text not null check (btrim(mapping_hash) <> ''),
  evidence_id text not null check (btrim(evidence_id) <> ''),
  derived_from text[] not null default '{}',
  lineage jsonb not null check (jsonb_typeof(lineage) = 'object'),
  constraint snapshot_evidence_lineage_snapshot_lineage_key unique (snapshot_identity_id, evidence_id),
  constraint snapshot_evidence_lineage_repository_lineage_key unique (discovery_id, snapshot_id, contract_version, idempotency_key, evidence_id),
  constraint snapshot_evidence_lineage_owned_evidence_fk foreign key (snapshot_evidence_id, snapshot_identity_id, evidence_id) references public.snapshot_evidence(id, snapshot_identity_id, evidence_id) on delete restrict
);

create table public.snapshot_engine_attribution (
  id uuid primary key default gen_random_uuid(),
  snapshot_identity_id uuid not null references public.snapshot_identities(id) on delete restrict,
  storage_key text not null unique check (btrim(storage_key) <> ''),
  snapshot_id text not null check (btrim(snapshot_id) <> ''),
  discovery_id text not null check (btrim(discovery_id) <> ''),
  contract_version text not null check (btrim(contract_version) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  mapping_hash text not null check (btrim(mapping_hash) <> ''),
  engine_name text not null check (btrim(engine_name) <> ''),
  engine_version text not null check (btrim(engine_version) <> ''),
  section text not null check (section in ('problemIntelligence','opportunityIntelligence','founderIntelligence','confidence','diagnostics')),
  attribution jsonb not null check (jsonb_typeof(attribution) = 'object'),
  constraint snapshot_engine_attribution_snapshot_engine_key unique (snapshot_identity_id, engine_name, engine_version, section),
  constraint snapshot_engine_attribution_repository_engine_key unique (discovery_id, snapshot_id, contract_version, idempotency_key, engine_name, engine_version, section)
);

create table public.snapshot_processing_history (
  id uuid primary key default gen_random_uuid(),
  snapshot_identity_id uuid not null references public.snapshot_identities(id) on delete restrict,
  storage_key text not null unique check (btrim(storage_key) <> ''),
  snapshot_id text not null check (btrim(snapshot_id) <> ''),
  discovery_id text not null check (btrim(discovery_id) <> ''),
  contract_version text not null check (btrim(contract_version) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  mapping_hash text not null check (btrim(mapping_hash) <> ''),
  history_key text not null check (btrim(history_key) <> ''),
  step text not null check (btrim(step) <> ''),
  completed_at timestamptz,
  version text check (version is null or btrim(version) <> ''),
  history jsonb not null check (jsonb_typeof(history) = 'object'),
  constraint snapshot_processing_history_snapshot_history_key unique (snapshot_identity_id, history_key),
  constraint snapshot_processing_history_repository_history_key unique (discovery_id, snapshot_id, contract_version, idempotency_key, history_key)
);

create table public.snapshot_validations (
  id uuid primary key default gen_random_uuid(),
  snapshot_identity_id uuid not null references public.snapshot_identities(id) on delete restrict,
  storage_key text not null unique check (btrim(storage_key) <> ''),
  snapshot_id text not null check (btrim(snapshot_id) <> ''),
  discovery_id text not null check (btrim(discovery_id) <> ''),
  contract_version text not null check (btrim(contract_version) <> ''),
  idempotency_key text not null check (btrim(idempotency_key) <> ''),
  created_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  content_hash text not null check (btrim(content_hash) <> ''),
  mapping_hash text not null check (btrim(mapping_hash) <> ''),
  valid boolean not null check (valid is true),
  validator_version text not null check (btrim(validator_version) <> ''),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  errors jsonb not null check (jsonb_typeof(errors) = 'array'),
  warnings jsonb not null check (jsonb_typeof(warnings) = 'array'),
  validation jsonb not null check (jsonb_typeof(validation) = 'object'),
  constraint snapshot_validations_snapshot_singleton_key unique (snapshot_identity_id),
  constraint snapshot_validations_repository_singleton_key unique (discovery_id, snapshot_id, contract_version, idempotency_key)
);

create index snapshot_identities_snapshot_lookup_idx on public.snapshot_identities(snapshot_id, contract_version);
create index snapshot_identities_discovery_lookup_idx on public.snapshot_identities(discovery_id, created_at desc);
create index snapshot_sections_reconstruct_idx on public.snapshot_sections(snapshot_identity_id, section_type);
create index snapshot_evidence_reconstruct_idx on public.snapshot_evidence(snapshot_identity_id, evidence_id);
create index snapshot_evidence_supports_reconstruct_idx on public.snapshot_evidence_supports(snapshot_identity_id, evidence_id, support_key);
create index snapshot_provenance_sources_reconstruct_idx on public.snapshot_provenance_sources(snapshot_identity_id, source_id);
create index snapshot_evidence_lineage_reconstruct_idx on public.snapshot_evidence_lineage(snapshot_identity_id, evidence_id);
create index snapshot_engine_attribution_reconstruct_idx on public.snapshot_engine_attribution(snapshot_identity_id, section, engine_name);
create index snapshot_processing_history_reconstruct_idx on public.snapshot_processing_history(snapshot_identity_id, history_key);

create or replace function public.prevent_snapshot_table_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Snapshot persistence tables are append-only; % is forbidden on %.%', tg_op, tg_table_schema, tg_table_name using errcode = '55000';
end;
$$;

create trigger snapshot_identities_append_only before update or delete on public.snapshot_identities for each row execute function public.prevent_snapshot_table_mutation();
create trigger snapshot_sections_append_only before update or delete on public.snapshot_sections for each row execute function public.prevent_snapshot_table_mutation();
create trigger snapshot_evidence_append_only before update or delete on public.snapshot_evidence for each row execute function public.prevent_snapshot_table_mutation();
create trigger snapshot_evidence_supports_append_only before update or delete on public.snapshot_evidence_supports for each row execute function public.prevent_snapshot_table_mutation();
create trigger snapshot_provenance_sources_append_only before update or delete on public.snapshot_provenance_sources for each row execute function public.prevent_snapshot_table_mutation();
create trigger snapshot_evidence_lineage_append_only before update or delete on public.snapshot_evidence_lineage for each row execute function public.prevent_snapshot_table_mutation();
create trigger snapshot_engine_attribution_append_only before update or delete on public.snapshot_engine_attribution for each row execute function public.prevent_snapshot_table_mutation();
create trigger snapshot_processing_history_append_only before update or delete on public.snapshot_processing_history for each row execute function public.prevent_snapshot_table_mutation();
create trigger snapshot_validations_append_only before update or delete on public.snapshot_validations for each row execute function public.prevent_snapshot_table_mutation();

create or replace function public.write_snapshot_mapping(mapped_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  root_snapshot_id text := public.snapshot_require_non_empty(mapped_snapshot ->> 'snapshotId', 'snapshotId');
  root_discovery_id text := public.snapshot_require_non_empty(mapped_snapshot ->> 'discoveryId', 'discoveryId');
  root_contract_version text := public.snapshot_require_non_empty(mapped_snapshot ->> 'contractVersion', 'contractVersion');
  root_idempotency_key text := public.snapshot_require_non_empty(mapped_snapshot ->> 'idempotencyKey', 'idempotencyKey');
  root_mapping_hash text := public.snapshot_require_non_empty(mapped_snapshot ->> 'mappingHash', 'mappingHash');
  records jsonb := mapped_snapshot -> 'records';
  identity_record jsonb;
  validation_record jsonb;
  existing_identity public.snapshot_identities%rowtype;
  inserted_identity_id uuid;
  mapped_record jsonb;
  section_counts jsonb;
  unexpected_kind text;
  evidence_row_id uuid;
  duplicate_storage_key text;
begin
  if jsonb_typeof(mapped_snapshot) <> 'object' then
    raise exception 'mapped_snapshot must be a JSON object' using errcode = '22023';
  end if;
  if jsonb_typeof(records) <> 'array' then
    raise exception 'records must be a JSON array' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(root_discovery_id || ':' || root_snapshot_id || ':' || root_contract_version || ':' || root_idempotency_key, 0));

  select r.record_json ->> 'kind' into unexpected_kind
  from jsonb_array_elements(records) as r(record_json)
  where r.record_json ->> 'kind' not in ('snapshot_identity','snapshot_section','snapshot_evidence','snapshot_evidence_support','snapshot_provenance_source','snapshot_evidence_lineage','snapshot_engine_attribution','snapshot_processing_history','snapshot_validation')
  limit 1;
  if unexpected_kind is not null then
    raise exception 'Snapshot mapping contains unknown record kind: %', unexpected_kind using errcode = '22023';
  end if;

  perform 1 from jsonb_array_elements(records) as r(record_json)
  where public.snapshot_require_non_empty(r.record_json ->> 'contentHash', 'records[].contentHash') is null;

  select key into duplicate_storage_key
  from (
    select r.record_json ->> 'storageKey' as key, count(*) as count
    from jsonb_array_elements(records) as r(record_json)
    group by r.record_json ->> 'storageKey'
    having count(*) > 1
  ) duplicates
  limit 1;
  if duplicate_storage_key is not null then
    raise exception 'Duplicate storage_key in mapped Snapshot payload: %', duplicate_storage_key using errcode = '23505';
  end if;

  select r.record_json into identity_record from jsonb_array_elements(records) as r(record_json) where r.record_json ->> 'kind' = 'snapshot_identity';
  if (select count(*) from jsonb_array_elements(records) as r(record_json) where r.record_json ->> 'kind' = 'snapshot_identity') <> 1 then
    raise exception 'Snapshot mapping requires exactly one identity record' using errcode = '22023';
  end if;
  if identity_record ->> 'snapshotId' <> root_snapshot_id or identity_record ->> 'discoveryId' <> root_discovery_id or identity_record ->> 'contractVersion' <> root_contract_version or identity_record ->> 'idempotencyKey' <> root_idempotency_key then
    raise exception 'Snapshot identity record does not match root mapping identity' using errcode = '22023';
  end if;

  perform 1 from jsonb_array_elements(records) as r(record_json)
  where r.record_json ->> 'snapshotId' is distinct from root_snapshot_id
     or r.record_json ->> 'discoveryId' is distinct from root_discovery_id
     or r.record_json ->> 'contractVersion' is distinct from root_contract_version;
  if found then
    raise exception 'Child record identity fields must match root mapping identity' using errcode = '22023';
  end if;

  select jsonb_object_agg(section_type, section_count) into section_counts
  from (
    select r.record_json ->> 'section' as section_type, count(*) as section_count
    from jsonb_array_elements(records) as r(record_json)
    where r.record_json ->> 'kind' = 'snapshot_section'
    group by r.record_json ->> 'section'
  ) counted;

  if coalesce((section_counts ->> 'discovery_context')::int, 0) <> 1
    or coalesce((section_counts ->> 'problem_intelligence')::int, 0) <> 1
    or coalesce((section_counts ->> 'opportunity_intelligence')::int, 0) <> 1
    or coalesce((section_counts ->> 'confidence')::int, 0) <> 1
    or coalesce((section_counts ->> 'diagnostics')::int, 0) <> 1
    or coalesce((section_counts ->> 'founder_intelligence')::int, 0) > 1 then
    raise exception 'Snapshot mapping has invalid required/optional section cardinality' using errcode = '22023';
  end if;

  perform 1 from jsonb_array_elements(records) as r(record_json)
  where r.record_json ->> 'kind' = 'snapshot_section'
    and r.record_json ->> 'section' not in ('discovery_context','problem_intelligence','opportunity_intelligence','founder_intelligence','confidence','diagnostics');
  if found then
    raise exception 'Snapshot mapping contains unknown section type' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_array_elements(records) as r(record_json) where r.record_json ->> 'kind' = 'snapshot_validation') <> 1 then
    raise exception 'Snapshot mapping requires exactly one validation record' using errcode = '22023';
  end if;
  select r.record_json into validation_record from jsonb_array_elements(records) as r(record_json) where r.record_json ->> 'kind' = 'snapshot_validation';
  if coalesce((validation_record #>> '{validation,valid}')::boolean, false) is not true then
    raise exception 'Snapshot validation record must be valid=true' using errcode = '22023';
  end if;

  select * into existing_identity
  from public.snapshot_identities
  where discovery_id = root_discovery_id
    and snapshot_id = root_snapshot_id
    and contract_version = root_contract_version
    and idempotency_key = root_idempotency_key;

  if found then
    if existing_identity.mapping_hash = root_mapping_hash then
      return jsonb_build_object('status','replayed_identical','written',false,'snapshot_id',root_snapshot_id,'discovery_id',root_discovery_id,'idempotency_key',root_idempotency_key,'message','Snapshot mapping replay matched existing immutable content.');
    end if;
    return jsonb_build_object('status','rejected_conflict','written',false,'snapshot_id',root_snapshot_id,'discovery_id',root_discovery_id,'idempotency_key',root_idempotency_key,'message','Snapshot repository identity already exists with a different mapping_hash.');
  end if;

  insert into public.snapshot_identities(storage_key, snapshot_id, discovery_id, contract_version, idempotency_key, snapshot_version, lifecycle_state, engine_version, intelligence_version, normalization_version, confidence_version, validator_version, versions, created_at, content_hash, mapping_hash)
  values (identity_record ->> 'storageKey', root_snapshot_id, root_discovery_id, root_contract_version, root_idempotency_key, identity_record ->> 'snapshotVersion', identity_record ->> 'lifecycleState', identity_record #>> '{versions,engine}', identity_record #>> '{versions,intelligence}', identity_record #>> '{versions,normalization}', identity_record #>> '{versions,confidence}', validation_record #>> '{validation,validatorVersion}', identity_record -> 'versions', (identity_record ->> 'createdAt')::timestamptz, identity_record ->> 'contentHash', root_mapping_hash)
  returning id into inserted_identity_id;

  for mapped_record in select value from jsonb_array_elements(records) where value ->> 'kind' = 'snapshot_section' loop
    insert into public.snapshot_sections(snapshot_identity_id, storage_key, snapshot_id, discovery_id, contract_version, idempotency_key, created_at, content_hash, mapping_hash, section_type, payload)
    values (inserted_identity_id, mapped_record ->> 'storageKey', root_snapshot_id, root_discovery_id, root_contract_version, root_idempotency_key, (mapped_record ->> 'createdAt')::timestamptz, mapped_record ->> 'contentHash', root_mapping_hash, mapped_record ->> 'section', mapped_record -> 'payload');
  end loop;

  for mapped_record in select value from jsonb_array_elements(records) where value ->> 'kind' = 'snapshot_evidence' loop
    insert into public.snapshot_evidence(snapshot_identity_id, storage_key, snapshot_id, discovery_id, contract_version, idempotency_key, created_at, content_hash, mapping_hash, evidence_id, evidence_kind, relationship, claim, provenance_ids, source_reference, confidence)
    values (inserted_identity_id, mapped_record ->> 'storageKey', root_snapshot_id, root_discovery_id, root_contract_version, root_idempotency_key, (mapped_record ->> 'createdAt')::timestamptz, mapped_record ->> 'contentHash', root_mapping_hash, mapped_record ->> 'evidenceId', mapped_record ->> 'evidenceKind', mapped_record ->> 'relationship', mapped_record ->> 'claim', coalesce(array(select jsonb_array_elements_text(mapped_record -> 'provenanceIds')), '{}'), coalesce(mapped_record -> 'sourceReference', '{}'::jsonb), coalesce(mapped_record -> 'confidence', '{}'::jsonb));
  end loop;

  for mapped_record in select value from jsonb_array_elements(records) where value ->> 'kind' = 'snapshot_evidence_support' loop
    select id into evidence_row_id from public.snapshot_evidence where snapshot_identity_id = inserted_identity_id and evidence_id = mapped_record ->> 'evidenceId';
    if evidence_row_id is null then raise exception 'Evidence support references missing evidence_id %', mapped_record ->> 'evidenceId' using errcode = '23503'; end if;
    insert into public.snapshot_evidence_supports(snapshot_identity_id, snapshot_evidence_id, storage_key, snapshot_id, discovery_id, contract_version, idempotency_key, created_at, content_hash, mapping_hash, evidence_id, support_key, target_section, target_field, target_id, rationale, support)
    values (inserted_identity_id, evidence_row_id, mapped_record ->> 'storageKey', root_snapshot_id, root_discovery_id, root_contract_version, root_idempotency_key, (mapped_record ->> 'createdAt')::timestamptz, mapped_record ->> 'contentHash', root_mapping_hash, mapped_record ->> 'evidenceId', mapped_record ->> 'supportKey', mapped_record #>> '{support,section}', mapped_record #>> '{support,field}', mapped_record #>> '{support,targetId}', mapped_record #>> '{support,rationale}', mapped_record -> 'support');
  end loop;

  for mapped_record in select value from jsonb_array_elements(records) where value ->> 'kind' = 'snapshot_provenance_source' loop
    insert into public.snapshot_provenance_sources(snapshot_identity_id, storage_key, snapshot_id, discovery_id, contract_version, idempotency_key, created_at, content_hash, mapping_hash, source_id, source_type, source_name, source_url, source)
    values (inserted_identity_id, mapped_record ->> 'storageKey', root_snapshot_id, root_discovery_id, root_contract_version, root_idempotency_key, (mapped_record ->> 'createdAt')::timestamptz, mapped_record ->> 'contentHash', root_mapping_hash, mapped_record #>> '{source,sourceId}', mapped_record #>> '{source,sourceType}', mapped_record #>> '{source,sourceName}', mapped_record #>> '{source,sourceUrl}', mapped_record -> 'source');
  end loop;

  for mapped_record in select value from jsonb_array_elements(records) where value ->> 'kind' = 'snapshot_evidence_lineage' loop
    select id into evidence_row_id from public.snapshot_evidence where snapshot_identity_id = inserted_identity_id and evidence_id = mapped_record #>> '{lineage,evidenceId}';
    if evidence_row_id is null then raise exception 'Evidence lineage references missing evidence_id %', mapped_record #>> '{lineage,evidenceId}' using errcode = '23503'; end if;
    insert into public.snapshot_evidence_lineage(snapshot_identity_id, snapshot_evidence_id, storage_key, snapshot_id, discovery_id, contract_version, idempotency_key, created_at, content_hash, mapping_hash, evidence_id, derived_from, lineage)
    values (inserted_identity_id, evidence_row_id, mapped_record ->> 'storageKey', root_snapshot_id, root_discovery_id, root_contract_version, root_idempotency_key, (mapped_record ->> 'createdAt')::timestamptz, mapped_record ->> 'contentHash', root_mapping_hash, mapped_record #>> '{lineage,evidenceId}', coalesce(array(select jsonb_array_elements_text(mapped_record #> '{lineage,derivedFrom}')), '{}'), mapped_record -> 'lineage');
  end loop;

  for mapped_record in select value from jsonb_array_elements(records) where value ->> 'kind' = 'snapshot_engine_attribution' loop
    insert into public.snapshot_engine_attribution(snapshot_identity_id, storage_key, snapshot_id, discovery_id, contract_version, idempotency_key, created_at, content_hash, mapping_hash, engine_name, engine_version, section, attribution)
    values (inserted_identity_id, mapped_record ->> 'storageKey', root_snapshot_id, root_discovery_id, root_contract_version, root_idempotency_key, (mapped_record ->> 'createdAt')::timestamptz, mapped_record ->> 'contentHash', root_mapping_hash, mapped_record #>> '{attribution,engineName}', mapped_record #>> '{attribution,engineVersion}', mapped_record #>> '{attribution,section}', mapped_record -> 'attribution');
  end loop;

  for mapped_record in select value from jsonb_array_elements(records) where value ->> 'kind' = 'snapshot_processing_history' loop
    insert into public.snapshot_processing_history(snapshot_identity_id, storage_key, snapshot_id, discovery_id, contract_version, idempotency_key, created_at, content_hash, mapping_hash, history_key, step, completed_at, version, history)
    values (inserted_identity_id, mapped_record ->> 'storageKey', root_snapshot_id, root_discovery_id, root_contract_version, root_idempotency_key, (mapped_record ->> 'createdAt')::timestamptz, mapped_record ->> 'contentHash', root_mapping_hash, public.snapshot_require_non_empty(mapped_record ->> 'historyKey', 'historyKey'), mapped_record #>> '{history,step}', nullif(mapped_record #>> '{history,completedAt}', '')::timestamptz, mapped_record #>> '{history,version}', mapped_record -> 'history');
  end loop;

  insert into public.snapshot_validations(snapshot_identity_id, storage_key, snapshot_id, discovery_id, contract_version, idempotency_key, created_at, content_hash, mapping_hash, valid, validator_version, summary, errors, warnings, validation)
  values (inserted_identity_id, validation_record ->> 'storageKey', root_snapshot_id, root_discovery_id, root_contract_version, root_idempotency_key, (validation_record ->> 'createdAt')::timestamptz, validation_record ->> 'contentHash', root_mapping_hash, (validation_record #>> '{validation,valid}')::boolean, validation_record #>> '{validation,validatorVersion}', validation_record #> '{validation,summary}', validation_record #> '{validation,errors}', validation_record #> '{validation,warnings}', validation_record -> 'validation');

  return jsonb_build_object('status','inserted','written',true,'snapshot_id',root_snapshot_id,'discovery_id',root_discovery_id,'idempotency_key',root_idempotency_key,'message','Snapshot mapping inserted atomically.');
exception when others then
  if sqlstate in ('22023','23503','23505','23514') then
    raise;
  end if;
  return jsonb_build_object('status','failed','written',false,'snapshot_id',root_snapshot_id,'discovery_id',root_discovery_id,'idempotency_key',root_idempotency_key,'message',sqlerrm);
end;
$$;

alter table public.snapshot_identities enable row level security;
alter table public.snapshot_sections enable row level security;
alter table public.snapshot_evidence enable row level security;
alter table public.snapshot_evidence_supports enable row level security;
alter table public.snapshot_provenance_sources enable row level security;
alter table public.snapshot_evidence_lineage enable row level security;
alter table public.snapshot_engine_attribution enable row level security;
alter table public.snapshot_processing_history enable row level security;
alter table public.snapshot_validations enable row level security;

revoke all on table public.snapshot_identities from anon, authenticated;
revoke all on table public.snapshot_sections from anon, authenticated;
revoke all on table public.snapshot_evidence from anon, authenticated;
revoke all on table public.snapshot_evidence_supports from anon, authenticated;
revoke all on table public.snapshot_provenance_sources from anon, authenticated;
revoke all on table public.snapshot_evidence_lineage from anon, authenticated;
revoke all on table public.snapshot_engine_attribution from anon, authenticated;
revoke all on table public.snapshot_processing_history from anon, authenticated;
revoke all on table public.snapshot_validations from anon, authenticated;
revoke all on function public.snapshot_require_non_empty(text, text) from public, anon, authenticated;
revoke all on function public.write_snapshot_mapping(jsonb) from public, anon, authenticated;
grant execute on function public.write_snapshot_mapping(jsonb) to service_role;
