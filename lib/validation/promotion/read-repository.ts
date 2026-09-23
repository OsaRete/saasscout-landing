import "server-only";

import { createSupabaseAdminClient, type SupabaseAdminClient } from "../../supabase/server-admin.ts";

export type PersistedPromotionRows = {
  observations: Record<string, unknown>[];
  classifications: Record<string, unknown>[];
  subjects: Record<string, unknown>[];
  hypotheses: Record<string, unknown>[];
  experiments: Record<string, unknown>[];
  participants: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  canonicalProblems: Record<string, unknown>[];
  aliases: Record<string, unknown>[];
};

const PAGE_SIZE = 1000;
const projections = {
  observations: ["validation_evidence_observations", "id,owner_id,subject_id,hypothesis_id,hypothesis_version_id,experiment_id,experiment_version_id,participant_id,interview_session_id,origin,modality,source_type,observed_at,observation_content,participant_independence_key"],
  classifications: ["validation_evidence_classifications", "id,owner_id,observation_id,polarity,classification_source,authority_status,supersedes_classification_id"],
  subjects: ["validation_subjects", "id,owner_id,label"],
  hypotheses: ["validation_hypothesis_versions", "id,owner_id,subject_id,hypothesis_id,problem_claim"],
  experiments: ["validation_experiment_versions", "id,owner_id,subject_id,experiment_id,hypothesis_id,hypothesis_version_id,family,lifecycle"],
  participants: ["validation_participants", "id,owner_id,status"],
  sessions: ["validation_interview_sessions", "id,owner_id,subject_id,experiment_id,experiment_version_id,hypothesis_id,hypothesis_version_id,participant_id,status,participant_relevance"],
  canonicalProblems: ["canonical_problems", "id,canonical_title,normalized_title,status"],
  aliases: ["problem_aliases", "canonical_problem_id,normalized_alias"],
} as const;

async function readAll(db: SupabaseAdminClient, table: string, columns: string) {
  const output: Record<string, unknown>[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const result = await db.from(table).select(columns).order("id", { ascending: true }).range(start, start + PAGE_SIZE - 1);
    if (result.error) throw new Error(`validation_promotion_read_failed:${table}`);
    const page = (result.data ?? []) as unknown as Record<string, unknown>[];
    output.push(...page);
    if (page.length < PAGE_SIZE) return output;
  }
}

/** Service-role, SELECT-only boundary. It intentionally exposes no mutation method. */
export async function readValidationPromotionRows(db: SupabaseAdminClient = createSupabaseAdminClient()): Promise<PersistedPromotionRows> {
  const entries = await Promise.all(Object.entries(projections).map(async ([key, [table, columns]]) => [key, await readAll(db, table, columns)] as const));
  return Object.fromEntries(entries) as PersistedPromotionRows;
}

export const VALIDATION_PROMOTION_READ_PROJECTIONS = projections;
