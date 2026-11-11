import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { relative, sep } from "node:path";
import type { SupabaseAdminClient } from "../../lib/supabase/server-admin.ts";
import { validationTestModule } from "./validation-module.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceHashes = JSON.parse(
  readFileSync(
    new URL("./validation-database-fixtures.manifest.json", import.meta.url),
    "utf8",
  ),
) as Readonly<Record<string, string>>;

/** Pin the actual source compiled by the isolated loader, not a copied algorithm.
 * An algorithm/dependency/loader change requires explicit manifest review in CI.
 */
export function assertDatabaseFixtureSource(
  path: string,
  source: string,
): void {
  const key = relative(repositoryRoot, path).split(sep).join("/");
  if (
    !Object.hasOwn(sourceHashes, key) ||
    createHash("sha256").update(source).digest("hex") !== sourceHashes[key]
  ) {
    throw new Error("database_fixture_source_mismatch");
  }
}

/**
 * Disposable acceptance ONLY. These are private module instances, not a switch
 * in the production policy or a replacement of the process's module cache.
 * Call only after the runner's existing identity/freshness preflight. Explicit
 * clients retain their real SQL/PostgREST permissions, including browser denials.
 */
export function createValidationDatabaseFixtures(
  profile: "B42" | "B43",
  clients: readonly SupabaseAdminClient[],
) {
  const endpoint =
    profile === "B42"
      ? "http://127.0.0.1:54321"
      : profile === "B43"
        ? "http://127.0.0.1:55431"
        : null;
  const registered = new Set(clients);
  function checkClient(db: SupabaseAdminClient) {
    if (
      !endpoint ||
      !registered.has(db) ||
      (db as unknown as { supabaseUrl?: unknown }).supabaseUrl !== endpoint
    )
      throw new Error("database_fixture_client_rejected");
  }
  if (clients.length === 0) throw new Error("database_fixture_client_rejected");
  clients.forEach(checkClient);
  for (const url of [
    import.meta.url,
    new URL("./validation-module.ts", import.meta.url),
  ]) {
    const path = fileURLToPath(url);
    assertDatabaseFixtureSource(path, readFileSync(path, "utf8"));
  }
  const root = fileURLToPath(
    new URL("../../lib/validation/promotion/", import.meta.url),
  );
  const guarded = new Map([
    [root + "promotion-service.ts", ["shared.promote", "POST"]],
    [root + "read-repository.ts", ["shared.prepare", "POST"]],
    [root + "trusted-qualified-evidence-reader.ts", ["shared.consume", "GET"]],
  ]);
  function load(
    file: "promotion-service.ts" | "trusted-qualified-evidence-reader.ts",
  ) {
    return validationTestModule(
      root + file,
      (specifier, importer) => {
        if (/release-policy(?:\.ts)?$/.test(specifier)) {
          if (!guarded.has(importer))
            throw new Error("database_fixture_import_rejected");
          const expected = guarded.get(importer)!;
          return {
            assertValidationOperation(operation: unknown, method = "POST") {
              if (operation !== expected[0] || method !== expected[1])
                throw new Error("database_fixture_operation_rejected");
            },
          };
        }
        if (/server-admin(?:\.ts)?$/.test(specifier))
          return {
            createSupabaseAdminClient() {
              throw new Error("database_fixture_requires_explicit_client");
            },
          };
        return undefined;
      },
      assertDatabaseFixtureSource,
    );
  }
  const promotion = load(
    "promotion-service.ts",
  ) as typeof import("../../lib/validation/promotion/promotion-service.ts");
  const historical = load(
    "trusted-qualified-evidence-reader.ts",
  ) as typeof import("../../lib/validation/promotion/trusted-qualified-evidence-reader.ts");
  return Object.freeze({
    async promoteCustomerInterviewEvidence(
      ownerId: string,
      observationId: string,
      db: SupabaseAdminClient,
    ) {
      checkClient(db);
      return promotion.promoteCustomerInterviewEvidence(
        ownerId,
        observationId,
        db,
      );
    },
    async readTrustedQualifiedValidationEvidence(
      canonicalId: string,
      db: SupabaseAdminClient,
    ) {
      checkClient(db);
      return historical.readTrustedQualifiedValidationEvidence(canonicalId, db);
    },
  });
}
