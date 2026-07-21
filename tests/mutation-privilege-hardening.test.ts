import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260721010000_harden_user_owned_mutations_privileges.sql";
const migration = readFileSync(migrationPath, "utf8");

test("closed-Beta migration revokes broad business-table privileges and preserves display reads", () => {
  for (const table of ["saved_ideas", "opportunities", "discovery_actions", "weekly_intelligence_runs", "problem_intelligence"]) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }
  assert.match(migration, /grant select on table public\.saved_ideas to authenticated/i);
  assert.match(migration, /grant select on table public\.opportunities to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete).*public\.(saved_ideas|opportunities)\s+to authenticated/i);
});

test("closed-Beta migration leaves anon without business-table grants", () => {
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all).*public\.(saved_ideas|opportunities|scan|weekly_intelligence_runs|problem_intelligence)\s+to anon/i);
  assert.match(migration, /grant insert on table public\."beta-signups" to anon/i);
});

test("Weekly claim RPC execute is restricted to service_role with fixed search_path", () => {
  const signature = "public.claim_weekly_intelligence_run(uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone)";
  assert.match(migration, new RegExp(`alter function ${signature.replace(/[()]/g, "\\$&")} set search_path = public`, "i"));
  assert.match(migration, new RegExp(`revoke all on function ${signature.replace(/[()]/g, "\\$&")} from public`, "i"));
  assert.match(migration, new RegExp(`revoke execute on function ${signature.replace(/[()]/g, "\\$&")} from anon`, "i"));
  assert.match(migration, new RegExp(`revoke execute on function ${signature.replace(/[()]/g, "\\$&")} from authenticated`, "i"));
  assert.match(migration, new RegExp(`grant execute on function ${signature.replace(/[()]/g, "\\$&")} to service_role`, "i"));
});

test("active browser code does not directly delete saved ideas or opportunities", () => {
  for (const file of ["app/saved/page.tsx", "app/opportunity/[id]/page.tsx", "app/results/page.tsx"]) {
    const content = readFileSync(file, "utf8");
    assert.doesNotMatch(content, /from\(["']saved_ideas["']\)\s*\.delete\(/);
    assert.doesNotMatch(content, /from\(["']opportunities["']\)\s*\.delete\(/);
  }
});
