import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260722040000_add_internal_tester_scan_entitlement.sql";
const migration = readFileSync(migrationPath, "utf8");
const page = readFileSync("app/scan/page.tsx", "utf8");
const helper = readFileSync("lib/auth/user-capabilities.ts", "utf8");
const route = readFileSync("app/api/user/capabilities/route.ts", "utf8");
const orchestration = readFileSync("lib/scan/server-orchestration.ts", "utf8");

test("application_user_access is constrained and service-role managed only", () => {
  assert.match(migration, /user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
  assert.match(migration, /CHECK \(access_role IN \('internal_tester'\)\)/i);
  assert.match(migration, /ALTER TABLE public\.application_user_access ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.application_user_access FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT ALL ON TABLE public\.application_user_access TO service_role/i);
  assert.doesNotMatch(migration, /CREATE POLICY[\s\S]*application_user_access/i);
  assert.doesNotMatch(migration, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*application_user_access[^;]*TO\s+(?:PUBLIC|anon|authenticated)/i);
});

test("Scan acceptance grants only an active, unexpired explicit unlimited assignment", () => {
  assert.match(migration, /aua\.access_role = 'internal_tester'/i);
  assert.match(migration, /aua\.is_active = true/i);
  assert.match(migration, /aua\.unlimited_scans = true/i);
  assert.match(migration, /aua\.expires_at IS NULL OR aua\.expires_at > now\(\)/i);
  assert.match(migration, /IF NOT v_unlimited_scans AND v_profile\.scans_used >= v_profile\.scan_limit/i);
  assert.match(migration, /IF NOT v_unlimited_scans THEN\s+UPDATE public\.user_profiles\s+SET scans_used = scans_used \+ 1/is);
  assert.match(migration, /unlimited_entitlement_used boolean/i);
});

test("normal quota locking and service-role-only RPC execution remain intact", () => {
  assert.match(migration, /FROM public\.user_profiles up[\s\S]*FOR UPDATE/i);
  assert.match(migration, /SECURITY INVOKER/i);
  assert.match(migration, /SET search_path = public, pg_temp/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.accept_scan_request\(uuid, text, text, text, text\) FROM PUBLIC/i);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.accept_scan_request\(uuid, text, text, text, text\) FROM anon/i);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.accept_scan_request\(uuid, text, text, text, text\) FROM authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.accept_scan_request\(uuid, text, text, text, text\) TO service_role/i);
});

test("capability resolution is server-only, minimal, active, unexpired, and fail closed", () => {
  assert.match(helper, /import "server-only"/);
  assert.match(helper, /createSupabaseAdminClient/);
  assert.match(helper, /\.eq\("is_active", true\)/);
  assert.match(helper, /expires_at\.is\.null,expires_at\.gt\./);
  assert.match(helper, /catch \{\s+return NO_USER_CAPABILITIES/);
  assert.doesNotMatch(helper, /raw_user_meta_data|email/i);
});

test("Scan UI uses the authenticated capability response and has no email authority", () => {
  assert.match(route, /const user = await requireUser\(request\)/);
  assert.match(route, /resolveUserCapabilities\(user\.id\)/);
  assert.match(page, /fetch\("\/api\/user\/capabilities"/);
  assert.match(page, /capabilities\?\.isInternalTester && capabilities\.unlimitedScans/);
  assert.match(page, /Internal tester · Unlimited scans/);
  assert.doesNotMatch(page, /ADMIN_EMAIL|cedeomartineze@gmail\.com|Admin · Unlimited scans/);
});

test("rollout allowlist is explicitly not an entitlement source", () => {
  assert.match(orchestration, /allowlist is a rollout\/access gate only/i);
  assert.match(orchestration, /does not grant quota or exceptional entitlements/i);
  assert.doesNotMatch(orchestration, /unlimited_scans|unlimitedScans/);
});

test("browser-supplied capability controls remain outside accepted Scan input", () => {
  const acceptance = readFileSync("lib/scan/acceptance.ts", "utf8");
  assert.doesNotMatch(acceptance, /ALLOWED_ACCEPTANCE_FIELDS[^\n]*(?:role|unlimited|capabilit)/i);
  assert.doesNotMatch(migration, /email|raw_user_meta_data/i);
});
