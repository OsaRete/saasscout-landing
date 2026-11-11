import "server-only";
import type { SupabaseAdminClient } from "../../supabase/server-admin.ts";
import { ValidationServerError } from "./contracts";
import { classifyOwnedLookup } from "./owned-lookup";
import {
  assertValidationFamily,
  assertValidationOperation,
  ValidationReleaseDeniedError,
} from "./release-policy";

type Row = Record<string, unknown>;
const ownedResourceTables = new Set([
  "validation_experiment_versions",
  "validation_experiments",
  "validation_interview_sessions",
  "validation_survey_plan_versions",
  "validation_survey_publications",
]);
async function ownedValidationResource(
  db: SupabaseAdminClient,
  table: string,
  ownerId: string,
  id: string,
  columns: string,
): Promise<Row> {
  assertValidationOperation("subject.read", "GET");
  if (!ownedResourceTables.has(table)) throw new ValidationReleaseDeniedError();
  const result = classifyOwnedLookup(
    await db
      .from(table)
      .select(columns)
      .eq("id", id)
      .eq("owner_id", ownerId)
      .maybeSingle(),
  );
  if (!result.ok)
    throw new ValidationServerError(
      result.failure === "lookup_failed" ? 503 : 404,
      result.failure === "lookup_failed"
        ? "validation_owned_lookup_failed"
        : "not_found",
      "Validation resource is unavailable.",
    );
  return result.data as unknown as Row;
}
const versionColumns =
  "id,experiment_id,subject_id,hypothesis_id,hypothesis_version_id,family,lifecycle";
export async function ownedValidationVersion(
  db: SupabaseAdminClient,
  ownerId: string,
  id: string,
  family?: "customer_interview" | "survey" | "landing_waitlist",
): Promise<Row> {
  const row = await ownedValidationResource(
    db,
    "validation_experiment_versions",
    ownerId,
    id,
    versionColumns,
  );
  assertValidationFamily(row.family, family);
  return row;
}
export function assertValidationLineage(resource: Row, version: Row): void {
  for (const key of [
    "experiment_id",
    "subject_id",
    "hypothesis_id",
    "hypothesis_version_id",
  ]) {
    if (resource[key] !== version[key])
      throw new ValidationServerError(
        404,
        "not_found",
        "Validation resource is unavailable.",
      );
  }
}
export async function ownedValidationExperiment(
  db: SupabaseAdminClient,
  ownerId: string,
  id: string,
  family?: "customer_interview" | "survey" | "landing_waitlist",
): Promise<void> {
  await ownedValidationResource(
    db,
    "validation_experiments",
    ownerId,
    id,
    "id",
  );
  const result = classifyOwnedLookup(
    await db
      .from("validation_experiment_versions")
      .select(versionColumns)
      .eq("experiment_id", id)
      .eq("owner_id", ownerId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!result.ok)
    throw new ValidationServerError(
      result.failure === "lookup_failed" ? 503 : 404,
      "not_found",
      "Validation resource is unavailable.",
    );
  assertValidationFamily((result.data as unknown as Row).family, family);
}
export async function ownedValidationSession(
  db: SupabaseAdminClient,
  ownerId: string,
  id: string,
): Promise<Row> {
  const row = await ownedValidationResource(
    db,
    "validation_interview_sessions",
    ownerId,
    id,
    "id,experiment_id,experiment_version_id,subject_id,hypothesis_id,hypothesis_version_id,participant_id,interview_plan_version_id",
  );
  const version = await ownedValidationVersion(
    db,
    ownerId,
    String(row.experiment_version_id),
    "customer_interview",
  );
  assertValidationLineage(row, version);
  return row;
}
export async function ownedSurveyResource(
  db: SupabaseAdminClient,
  ownerId: string,
  id: string,
  table: "validation_survey_plan_versions" | "validation_survey_publications",
): Promise<Row> {
  const row = await ownedValidationResource(
    db,
    table,
    ownerId,
    id,
    "id,experiment_id,experiment_version_id,subject_id,hypothesis_id,hypothesis_version_id",
  );
  const version = await ownedValidationVersion(
    db,
    ownerId,
    String(row.experiment_version_id),
    "survey",
  );
  assertValidationLineage(row, version);
  return row;
}
