import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath = "supabase/migrations/20260719001000_restrict_problem_intelligence_authenticated_writes.sql";
const migration = readFileSync(migrationPath, "utf8");
const historicalMigration = readFileSync(
  "supabase/migrations/20260628000000_create_historical_application_schema.sql",
  "utf8"
);
const scanPage = readFileSync("app/scan/page.tsx", "utf8");
const conversionRoute = readFileSync("app/api/problem-intelligence/conversion/route.ts", "utf8");
const problemStore = readFileSync("lib/knowledge/problem-intelligence-store.ts", "utf8");
const browserSources = [
  ["app/scan/page.tsx", scanPage],
  ["app/discover/page.tsx", readFileSync("app/discover/page.tsx", "utf8")],
] as const;

test("historical policy audit captures prior authenticated problem_intelligence access", () => {
  assert.match(
    historicalMigration,
    /CREATE POLICY "Users can read problem intelligence" ON "public"\."problem_intelligence" FOR SELECT TO "authenticated" USING \(true\);/
  );
  assert.match(
    historicalMigration,
    /CREATE POLICY "Users can insert problem intelligence" ON "public"\."problem_intelligence" FOR INSERT TO "authenticated" WITH CHECK \(true\);/
  );
  assert.match(
    historicalMigration,
    /CREATE POLICY "Users can update problem intelligence" ON "public"\."problem_intelligence" FOR UPDATE TO "authenticated" USING \(true\) WITH CHECK \(true\);/
  );
  assert.doesNotMatch(
    historicalMigration,
    /CREATE POLICY .*problem intelligence.* FOR DELETE TO "authenticated"/i
  );
});

test("new migration removes authenticated problem_intelligence writes while preserving intended reads", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "Users can insert problem intelligence"/);
  assert.match(migration, /DROP POLICY IF EXISTS "Users can update problem intelligence"/);
  assert.match(migration, /DROP POLICY IF EXISTS "Users can delete problem intelligence"/);
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE "public"\."problem_intelligence" FROM "authenticated";/
  );
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON TABLE "public"\."problem_intelligence" FROM "anon";/
  );
  assert.match(migration, /GRANT SELECT ON TABLE "public"\."problem_intelligence" TO "authenticated";/);
  assert.match(migration, /GRANT ALL ON TABLE "public"\."problem_intelligence" TO "service_role";/);
  assert.doesNotMatch(migration, /FOR (INSERT|UPDATE|DELETE) TO "authenticated"/i);
  assert.doesNotMatch(migration, /WITH CHECK \(true\)/i);
  assert.doesNotMatch(migration, /USING \(true\).*FOR (INSERT|UPDATE|DELETE)/i);
});

test("browser code does not write problem_intelligence or import service-role helpers", () => {
  for (const [file, source] of browserSources) {
    assert.doesNotMatch(source, /from\("problem_intelligence"\)[\s\S]{0,200}\.(insert|update|delete)\(/, file);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|server-admin|createSupabaseAdminClient/, file);
  }
  assert.match(scanPage, /fetch\("\/api\/problem-intelligence\/conversion"/);
});

test("trusted server write paths use the server admin client boundary", () => {
  assert.match(conversionRoute, /import \{ createSupabaseAdminClient \} from .*[";]$/m);
  assert.match(conversionRoute, /await requireUser\(req\)/);
  assert.match(conversionRoute, /\.from\("problem_intelligence"\)[\s\S]*\.update\(/);
  assert.match(problemStore, /createSupabaseAdminClient\(\)/);
  assert.doesNotMatch(problemStore, /SUPABASE_SERVICE_ROLE_KEY/);
});
