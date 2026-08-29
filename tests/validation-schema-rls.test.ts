import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const path = "supabase/migrations/20260828000000_create_validation_domain.sql";
const migration = readFileSync(path, "utf8");
const tables = [
  "validation_subjects",
  "validation_subject_links",
  "validation_hypotheses",
  "validation_hypothesis_versions",
  "validation_experiments",
  "validation_experiment_versions",
  "validation_participants",
  "validation_evidence_observations",
  "validation_evidence_classifications",
] as const;

test("V2 creates only the minimum private Validation table set", () => {
  for (const table of tables) assert.match(migration, new RegExp(`create table public\\.${table} \\(`, "i"));
  for (const deferred of ["validation_interpretations", "validation_public_tokens", "validation_contacts", "validation_promotions", "validation_experiment_runs"]) {
    assert.doesNotMatch(migration, new RegExp(`create table public\\.${deferred}`, "i"));
  }
  assert.doesNotMatch(migration, /(?:insert|update|delete)\s+(?:into|from)?\s*public\.(?:canonical_problems|problem_observations|problem_intelligence)/i);
});

test("owner-aware foreign keys protect every Validation lineage edge", () => {
  for (const constraint of [
    "validation_subject_links_subject_fk",
    "validation_hypotheses_subject_fk",
    "validation_hypothesis_versions_hypothesis_fk",
    "validation_experiment_versions_experiment_fk",
    "validation_experiment_versions_hypothesis_version_fk",
    "validation_evidence_experiment_version_fk",
    "validation_evidence_participant_fk",
    "validation_classifications_observation_fk",
  ]) assert.match(migration, new RegExp(`constraint ${constraint} foreign key \\([^)]*owner_id`, "i"));
  assert.doesNotMatch(migration, /on delete cascade/i);
});

test("typed provenance supports zero or many links without live upstream foreign keys", () => {
  assert.match(migration, /creation_origin in \('discover','scan','weekly','saved_idea','opportunity','user_entered'\)/i);
  assert.match(migration, /source_type in \('discover','scan','weekly','saved_idea','opportunity'\)/i);
  assert.match(migration, /unique \(owner_id, subject_id, source_type, source_row_id, link_role\)/i);
  assert.doesNotMatch(migration, /foreign key \([^)]*source_row_id/i);
});

test("version and lifecycle constraints preserve exact history", () => {
  assert.match(migration, /unique \(hypothesis_id, version_number\)/i);
  assert.match(migration, /unique \(experiment_id, version_number\)/i);
  assert.match(migration, /lifecycle in \('draft','ready','running','paused','completed','cancelled'\)/i);
  assert.match(migration, /old\.lifecycle in \('completed','cancelled'\)/i);
  assert.match(migration, /validation_hypothesis_versions_append_only/i);
  assert.match(migration, /validation_experiment_versions_no_delete/i);
  assert.match(migration, /unique \(id, experiment_id, subject_id, owner_id\)/i);
  assert.match(migration, /foreign key \(supersedes_version_id, experiment_id, subject_id, owner_id\)\s+references public\.validation_experiment_versions\(id, experiment_id, subject_id, owner_id\)/i);
  assert.match(migration, /validation_experiment_versions_started_time_check/i);
  assert.match(migration, /old\.started_at is not null and new\.started_at is distinct from old\.started_at/i);
});

test("immutable hypothesis versions derive supersession and do not carry stale lifecycle status", () => {
  const versionTable = migration.slice(migration.indexOf("create table public.validation_hypothesis_versions"), migration.indexOf("alter table public.validation_hypothesis_versions"));
  assert.doesNotMatch(versionTable, /\bstatus\s+text\b/i);
  assert.match(versionTable, /supersedes_version_id uuid/i);
  assert.match(migration, /validation_hypothesis_versions_append_only/i);
});

test("raw evidence, classifications, and AI authority are structurally separated", () => {
  const observation = migration.slice(migration.indexOf("create table public.validation_evidence_observations"), migration.indexOf("create table public.validation_evidence_classifications"));
  assert.doesNotMatch(observation, /\bpolarity\b|ai_summary|validation_result|score/i);
  assert.match(migration, /polarity in \('supporting','contradicting','mixed','neutral','inconclusive'\)/i);
  assert.match(migration, /classification_source <> 'ai_model_suggested' or authority_status = 'suggested'/i);
  assert.match(migration, /validation_evidence_observations_append_only/i);
  assert.match(migration, /validation_evidence_classifications_append_only/i);
  assert.match(migration, /supersedes_classification_id is null or supersedes_classification_id <> id/i);
  const classifications = migration.slice(migration.indexOf("create table public.validation_evidence_classifications"), migration.indexOf("create unique index validation_classifications_one_successor_uidx"));
  assert.doesNotMatch(classifications, /superseded_at|supersession_recorded_at/i);
  assert.match(classifications, /classified_at timestamptz not null default now\(\)/i);
});

test("participant identity is optional, owner-local, and contains no raw contact fields", () => {
  assert.match(migration, /identity_mode in \('anonymous','experiment_pseudonymous','owner_pseudonymous','identified_interview','manual_imported'\)/i);
  const participant = migration.slice(migration.indexOf("create table public.validation_participants"), migration.indexOf("create table public.validation_evidence_observations"));
  assert.doesNotMatch(participant, /\b(email|phone|name|address|social_handle)\b/i);
  assert.match(migration, /validation_participants\(owner_id, independence_key\) where independence_key is not null/i);
  assert.match(migration, /identity_mode <> 'experiment_pseudonymous' or experiment_id is not null/i);
  assert.doesNotMatch(migration, /\(identity_mode = 'experiment_pseudonymous'\) = \(experiment_id is not null\)/i);
  assert.match(migration, /participant_experiment_id is not null and participant_experiment_id <> new\.experiment_id/i);
});

test("RLS exposes owner-only reads and no browser or anonymous mutations", () => {
  assert.match(migration, /alter table public\.%I enable row level security/i);
  assert.match(migration, /revoke all on table public\.%I from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.%I to authenticated/i);
  assert.match(migration, /using \(owner_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /grant all on table public\.%I to service_role/i);
  assert.doesNotMatch(migration, /for (insert|update|delete) to authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).* to (?:anon|authenticated)/i);
});

test("idempotency is owner-scoped and fingerprints remain non-unique observations", () => {
  assert.match(migration, /validation_evidence_observations\(owner_id, ingestion_key\) where ingestion_key is not null/i);
  assert.match(migration, /validation_evidence_observations\(owner_id, content_fingerprint\) where content_fingerprint is not null/i);
  assert.doesNotMatch(migration, /unique index validation_evidence_fingerprint_idx/i);
});
