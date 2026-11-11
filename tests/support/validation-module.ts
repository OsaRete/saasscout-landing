import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
export function validationTestModule(
  file: string,
  mock?: (specifier: string, importer: string) => unknown,
  verifySource?: (path: string, source: string) => void,
): Record<string, unknown> {
  const cache = new Map<string, Record<string, unknown>>();
  function load(path: string): Record<string, unknown> {
    path = resolve(path);
    if (cache.has(path)) return cache.get(path)!;
    const exports: Record<string, unknown> = {};
    cache.set(path, exports);
    const source = readFileSync(path, "utf8");
    verifySource?.(path, source);
    const compiled = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    new Function("require", "exports", compiled)((specifier: string) => {
      const replacement = mock?.(specifier, path);
      if (replacement !== undefined) return replacement;
      if (specifier === "server-only") return {};
      if (specifier.startsWith(".") || specifier.startsWith("@/")) {
        const base = specifier.startsWith("@/")
          ? resolve(specifier.slice(2))
          : resolve(dirname(path), specifier);
        const found = [
          base,
          base + ".ts",
          base + ".tsx",
          base + ".js",
          base + "/index.ts",
        ].find((p) => existsSync(p));
        if (!found) throw new Error(`Unresolved test module: ${specifier}`);
        return load(found);
      }
      return nativeRequire(specifier);
    }, exports);
    return exports;
  }
  return load(file);
}

/** Historical algorithms only: mock admission in an isolated module, never production policy.
 * This preserves pre-Beta integrity/provider regressions while real entry denial is tested separately.
 * No real transport/admin client may be created in these tests.
 */
export function deferredAlgorithmModule(file: string): Record<string, unknown> {
  return validationTestModule(file, (specifier) => {
    if (/release-policy(?:\.ts)?$/.test(specifier))
      return { assertValidationOperation() {} };
    if (/server-admin(?:\.ts)?$/.test(specifier))
      return {
        createSupabaseAdminClient() {
          throw new Error("Real clients forbidden in deferred algorithm tests");
        },
      };
    return undefined;
  });
}
