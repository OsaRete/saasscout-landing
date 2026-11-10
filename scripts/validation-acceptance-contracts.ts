import { spawnSync } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

type ProcessResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: unknown;
  signal?: unknown;
};

/** psql stdin + ON_ERROR_STOP + VERBOSITY=sqlstate: one ERROR code, no prose. */
export function assertSqlStateFailure(
  result: ProcessResult,
  expectedState: string,
  expectedStdout = "",
): void {
  if (
    !result ||
    typeof result.stderr !== "string" ||
    typeof result.stdout !== "string"
  ) {
    throw new Error("B43 SQLSTATE assertion failed");
  }
  const match = /^ERROR:\s+([0-9A-Z]{5})\s*$/.exec(result.stderr.trim());
  if (
    result.error ||
    result.signal ||
    !Number.isInteger(result.status) ||
    result.status! <= 0 ||
    result.status! > 255 ||
    expectedState === "00000" ||
    !/^[0-9A-Z]{5}$/.test(expectedState) ||
    !match ||
    match[1] !== expectedState ||
    result.stdout.trim() !== expectedStdout
  ) {
    throw new Error("B43 SQLSTATE assertion failed");
  }
}

const applicationRoles = new Set([
  "anon",
  "authenticated",
  "service_role",
  "authenticator",
]);
/** This is an effective-role probe under a trusted login, NOT an application login.
 * SET ROLE authorization is assessed by explicit role-graph evidence, not by
 * attempting to return to the trusted session user's own role.
 */
export function applicationRolePrivilegeProbe(
  role: string,
  operation:
    | "trigger_tamper"
    | "truncate_authority"
    | "truncate_restrictions" = "trigger_tamper",
) {
  if (!applicationRoles.has(role))
    throw new Error("B43 unsupported probe role");
  const actions = {
    trigger_tamper: {
      table: "validation_evidence_source_restrictions",
      privilege: "UPDATE",
      statement:
        "alter table public.validation_evidence_source_restrictions disable trigger all",
    },
    truncate_authority: {
      table: "validation_evidence_consumption_authority",
      privilege: "TRUNCATE",
      statement: "truncate public.validation_evidence_consumption_authority",
    },
    truncate_restrictions: {
      table: "validation_evidence_source_restrictions",
      privilege: "TRUNCATE",
      statement: "truncate public.validation_evidence_source_restrictions",
    },
  };
  if (!Object.hasOwn(actions, operation))
    throw new Error("B43 unsupported probe operation");
  const action = actions[operation];
  const evidence = `postgres|${role}|false|false|false`;
  return {
    evidence,
    sql: `begin;
set local role ${role};
select session_user||'|'||current_user||'|'||
  pg_has_role(current_user,'postgres','SET')::text||'|'||
  has_table_privilege(current_user,'public.${action.table}','${action.privilege}')::text||'|'||
  has_function_privilege(current_user,'public.validation_b43_read_current_evidence(uuid)','EXECUTE')::text;
${action.statement};
rollback;`,
  };
}

export function assertPostgrestPermissionDenied(result: {
  data: unknown;
  error: { code?: string } | null;
  status: number;
}): void {
  if (
    result.data !== null ||
    result.error?.code !== "42501" ||
    ![401, 403].includes(result.status)
  ) {
    throw new Error("B43 PostgREST permission assertion failed");
  }
}

type CliInspection = {
  realpath(path: string): string;
  executable(path: string): void;
  version(path: string): ProcessResult;
};
const cliInspection: CliInspection = {
  realpath: realpathSync,
  executable(path) {
    if (!statSync(path).isFile()) throw new Error("not a file");
    accessSync(path, constants.X_OK);
  },
  version(path) {
    return spawnSync(path, ["--version"], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 64 * 1024,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    });
  },
};

/** Explicit trusted executable only. Never search PATH or silently use npm's CLI.
 * The optional inspection dependency is for offline tests; runners use defaults.
 */
export function acceptanceSupabaseCli(
  configured: unknown,
  inspection: CliInspection = cliInspection,
): string {
  try {
    if (
      typeof configured !== "string" ||
      !isAbsolute(configured) ||
      /[\r\n\0]/.test(configured)
    )
      throw new Error();
    const path = inspection.realpath(configured);
    if (!isAbsolute(path) || /[\r\n\0]/.test(path)) throw new Error();
    inspection.executable(path);
    const result = inspection.version(path);
    if (
      result.error ||
      result.signal ||
      result.status !== 0 ||
      result.stdout.trim() !== "2.118.0"
    )
      throw new Error();
    return path;
  } catch {
    // Never expose command errors, stderr, paths supplied by an unverified caller or credentials.
    throw new Error(
      "Acceptance requires an explicit executable Supabase CLI 2.118.0",
    );
  }
}
