import "server-only";

import type { UnresolvedProblemObservation } from "./types.ts";

const COLUMNS = "id,canonical_problem_id,observation_fingerprint,problem_title,normalized_problem_title,problem_summary,source_table,source_row_id,affected_niches,problem_cluster,observed_at";
const PAGE_SIZE = 1000;

export type ReadOnlyObservationPage = (rangeStart: number, rangeEnd: number) => Promise<readonly UnresolvedProblemObservation[]>;

/** Reads every unresolved observation through a SELECT-only adapter. */
export async function readUnresolvedProblemObservations(readPage: ReadOnlyObservationPage) {
  const rows: UnresolvedProblemObservation[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const page = await readPage(start, start + PAGE_SIZE - 1);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Creates a GET-only Supabase REST reader; no mutation method exists on this boundary. */
export function createSupabaseObservationReader(env: NodeJS.ProcessEnv = process.env): ReadOnlyObservationPage {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  return async (rangeStart, rangeEnd) => {
    const endpoint = new URL("/rest/v1/problem_observations", url);
    endpoint.searchParams.set("select", COLUMNS);
    endpoint.searchParams.set("canonical_problem_id", "is.null");
    endpoint.searchParams.set("order", "id.asc");
    const response = await fetch(endpoint, { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${rangeStart}-${rangeEnd}`, "Range-Unit": "items" } });
    if (!response.ok) throw new Error(`Problem observation read failed with HTTP ${response.status}.`);
    return await response.json() as UnresolvedProblemObservation[];
  };
}
