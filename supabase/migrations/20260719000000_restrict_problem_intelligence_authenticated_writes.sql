-- Restrict shared Data Moat memory writes to trusted server/service-role workflows.
-- Authenticated clients retain the existing shared SELECT policy, but can no longer
-- insert, update, or delete rows in public.problem_intelligence directly.

DROP POLICY IF EXISTS "Users can insert problem intelligence" ON "public"."problem_intelligence";
DROP POLICY IF EXISTS "Users can update problem intelligence" ON "public"."problem_intelligence";
DROP POLICY IF EXISTS "Users can delete problem intelligence" ON "public"."problem_intelligence";
DROP POLICY IF EXISTS "Authenticated users can insert problem intelligence" ON "public"."problem_intelligence";
DROP POLICY IF EXISTS "Authenticated users can update problem intelligence" ON "public"."problem_intelligence";
DROP POLICY IF EXISTS "Authenticated users can delete problem intelligence" ON "public"."problem_intelligence";

REVOKE INSERT, UPDATE, DELETE ON TABLE "public"."problem_intelligence" FROM "anon";
REVOKE INSERT, UPDATE, DELETE ON TABLE "public"."problem_intelligence" FROM "authenticated";
REVOKE SELECT ON TABLE "public"."problem_intelligence" FROM "anon";

GRANT SELECT ON TABLE "public"."problem_intelligence" TO "authenticated";
GRANT ALL ON TABLE "public"."problem_intelligence" TO "service_role";

COMMENT ON TABLE "public"."problem_intelligence" IS
  'Shared Data Moat problem memory. Browser/authenticated clients are read-only; writes are reserved for trusted server/service-role workflows.';
