import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = "supabase/migrations";
const migrationFilename = "20260722030000_protect_user_profile_entitlements.sql";
const migration = readFileSync(`${migrationsDirectory}/${migrationFilename}`, "utf8");

const authoritativeColumns = [
  "plan",
  "scan_limit",
  "scans_used",
  "external_sources_limit",
  "weekly_intelligence_enabled",
  "pdf_export_enabled",
] as const;

test("browser roles have no direct user_profiles mutation privileges", () => {
  assert.match(migration, /REVOKE ALL ON TABLE public\.user_profiles FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.user_profiles FROM PUBLIC, anon, authenticated/i);
  assert.doesNotMatch(migration, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)[^;]*public\.user_profiles[^;]*TO\s+(?:PUBLIC|anon|authenticated)/i);
});

test("authenticated keeps owner-scoped profile SELECT and anon receives no profile access", () => {
  const baseline = readFileSync(`${migrationsDirectory}/20260628000000_create_historical_application_schema.sql`, "utf8");
  assert.match(migration, /GRANT SELECT ON TABLE public\.user_profiles TO authenticated/i);
  assert.match(baseline, /CREATE POLICY "Users can read their own profile" ON "public"\."user_profiles" FOR SELECT TO "authenticated" USING \(\("auth"\."uid"\(\) = "user_id"\)\)/i);
  assert.doesNotMatch(migration, /GRANT\s+SELECT[^;]*public\.user_profiles[^;]*TO\s+(?:PUBLIC|anon)/i);
});

test("misleading browser mutation policies are removed", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "Users can insert their own profile" ON public\.user_profiles/i);
  assert.match(migration, /DROP POLICY IF EXISTS "Users can update their own profile" ON public\.user_profiles/i);
  assert.doesNotMatch(migration, /CREATE POLICY[^;]+user_profiles[^;]+FOR (?:INSERT|UPDATE|DELETE)/i);
});

test("service_role remains the sole application role with profile mutation capability", () => {
  assert.match(migration, /GRANT ALL ON TABLE public\.user_profiles TO service_role/i);
  for (const column of authoritativeColumns) {
    assert.match(readFileSync(`${migrationsDirectory}/20260628000000_create_historical_application_schema.sql`, "utf8"), new RegExp(`"${column}"`, "i"));
  }
});

test("trusted signup trigger retains fixed defaults without browser INSERT", () => {
  const baseline = readFileSync(`${migrationsDirectory}/20260628000000_create_historical_application_schema.sql`, "utf8");
  assert.match(baseline, /CREATE OR REPLACE FUNCTION "public"\."handle_new_user_profile"\(\)[\s\S]*SECURITY DEFINER/i);
  assert.match(baseline, /ALTER FUNCTION "public"\."handle_new_user_profile"\(\) OWNER TO "postgres"/i);
  assert.match(baseline, /on conflict \(user_id\) do nothing/i);
  assert.match(baseline, /CREATE TRIGGER "on_auth_user_created"\s+AFTER INSERT ON "auth"\."users"\s+FOR EACH ROW\s+EXECUTE FUNCTION "public"\."handle_new_user_profile"\(\)/i);
  assert.match(migration, /ALTER FUNCTION public\.handle_new_user_profile\(\) SET search_path = public, pg_temp/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.handle_new_user_profile\(\) FROM PUBLIC/i);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.handle_new_user_profile\(\) FROM anon, authenticated/i);
});

test("no later migration restores browser user_profiles writes", () => {
  const laterMigrations = readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith(".sql") && filename > migrationFilename)
    .map((filename) => readFileSync(`${migrationsDirectory}/${filename}`, "utf8"))
    .join("\n");

  assert.doesNotMatch(laterMigrations, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)[^;]*public\.user_profiles[^;]*TO\s+(?:PUBLIC|anon|authenticated)/i);
});

test("active browser code never mutates user_profiles", () => {
  for (const directory of ["app", "components"]) {
    for (const file of walk(directory)) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /\.from\(["']user_profiles["']\)[\s\S]{0,160}?\.(?:insert|update|upsert|delete)\(/, file);
    }
  }
});

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return walk(path);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  });
}
