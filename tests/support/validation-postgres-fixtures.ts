import { spawn } from "node:child_process";
import type { SupabaseAdminClient } from "../../lib/supabase/server-admin.ts";

/** Administrator-only positive fixture transport, called AFTER the existing
 * disposable identity/freshness preflight. Runtime denial probes keep their real
 * PostgREST clients. This grants nothing to any application role. */
export function postgresFixtureClient(profile: "B42" | "B43", runtime: SupabaseAdminClient): SupabaseAdminClient {
  if ((profile !== "B42" && profile !== "B43") ||
    (runtime as unknown as { supabaseUrl?: unknown }).supabaseUrl !== (profile === "B42" ? "http://127.0.0.1:54321" : "http://127.0.0.1:55431"))
    throw new Error("invalid_fixture_endpoint");
  const port = profile === "B42" ? 54322 : 55432;
  function query(statement: string): Promise<{ data: unknown; error: { code: string } | null }> {
    return new Promise((resolve, reject) => {
      const child = spawn("psql", [`postgresql://postgres:postgres@127.0.0.1:${port}/postgres`, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate"], {
        stdio: ["pipe", "pipe", "pipe"], timeout: 15000,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) return resolve({ data: null, error: { code: stderr.match(/ERROR:\s+([A-Z0-9]{5})/)?.[1] ?? "fixture_sql_failed" } });
        try {
          const output = stdout.split(/\r?\n/).filter((line) => line && line !== "SET").join("\n");
          resolve({ data: output ? JSON.parse(output) : null, error: null });
        } catch { reject(new Error("invalid_fixture_sql_response")); }
      });
      child.stdin.end(`set statement_timeout='10s';\n${statement}`);
    });
  }
  const literal = (value: unknown): string => value === null ? "null" : typeof value === "object"
    ? `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb` : `'${String(value).replaceAll("'", "''")}'`;
  return new Proxy(runtime, {
    get(target, property) {
      if (property === "rpc") return (name: string, parameters: Record<string, unknown>) => {
        if (!["validation_promote_customer_interview_evidence", "validation_b31_authority_snapshot", "validation_b31_representative_state"].includes(name))
          return target.rpc(name, parameters);
        const args = Object.entries(parameters).map(([key, value]) => {
          if (!/^p_[a-z_]+$/.test(key)) throw new Error("invalid_fixture_argument");
          return `${key}=>${literal(value)}`;
        }).join(",");
        return query(`select to_jsonb(public.${name}(${args}));`);
      };
      if (property === "from") return (table: string) => {
        if (table !== "validation_evidence_promotions") return target.from(table);
        const filters = new Map<string, unknown>();
        const expected = new Map<string, unknown>([
          ["eligible", true], ["representative_selected", true], ["resolution_status", "resolved"],
          ["policy_version", "v8-b1.2"], ["resolver_version", "v8-b3.0.2-exact.1"], ["projection_version", "v8-b3.1-projection.1"],
        ]);
        const builder = {
          select(_projection: string, options: { count: string }) {
            if (options.count !== "exact") throw new Error("invalid_fixture_count");
            return builder;
          },
          eq(column: string, value: unknown) { filters.set(column, value); return builder; },
          not(column: string, operator: string, value: unknown) {
            if (column !== "problem_observation_id" || operator !== "is" || value !== null) throw new Error("invalid_fixture_filter");
            return builder;
          },
          order(column: string, options: { ascending: boolean }) {
            if (column !== "problem_observation_id" || options.ascending !== true) throw new Error("invalid_fixture_order");
            return builder;
          },
          limit(cap: number) {
            if (cap !== 100) throw new Error("invalid_fixture_cap");
            return builder;
          },
          then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
            const canonical = filters.get("canonical_problem_id");
            if (typeof canonical !== "string" || !/^[a-f0-9-]{36}$/.test(canonical) || filters.size !== 7 ||
              [...expected].some(([key, value]) => filters.get(key) !== value)) throw new Error("invalid_fixture_scope");
            // Same left composite joins, computed proof and bounded exact count as
            // the PostgREST reader; qualification still runs in the pinned source.
            return query(`with candidates as (
 select p.* from public.validation_evidence_promotions p where canonical_problem_id=${literal(canonical)}::uuid
 and eligible=true and representative_selected=true and resolution_status='resolved'
 and policy_version='v8-b1.2' and resolver_version='v8-b3.0.2-exact.1' and projection_version='v8-b3.1-projection.1'
 and problem_observation_id is not null), rows as (
 select to_jsonb(p)||jsonb_build_object('integrity_verified',public.validation_b42_snapshot_verified(p),
 'shared',to_jsonb(s),'snapshot',to_jsonb(a)) as row
 from public.validation_evidence_promotions p
 left join public.problem_observations s on (s.id,s.canonical_problem_id)=(p.problem_observation_id,p.canonical_problem_id)
 left join public.validation_qualified_evidence_snapshots a on a.promotion_id=p.id
 where p.id in (select id from candidates) order by p.problem_observation_id limit 100)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(row) from rows),'[]'::jsonb),'count',(select count(*) from candidates));`).then((result) => {
            const payload = result.data as { rows: unknown[]; count: number } | null;
            return { data: payload?.rows ?? null, count: payload?.count ?? null, error: result.error };
            }).then(resolve, reject);
          },
        };
        return builder;
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
