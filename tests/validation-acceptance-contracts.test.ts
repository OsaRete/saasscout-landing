import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  acceptanceSupabaseCli,
  applicationRolePrivilegeProbe,
  assertPostgrestPermissionDenied,
  assertSqlStateFailure,
} from "../scripts/validation-acceptance-contracts.ts";

const failure = { status: 3, stdout: "", stderr: "ERROR:  P0001\n" };
test("psql SQLSTATE-only P0001 is recognized without error prose", () => {
  for (const stderr of [
    "ERROR: P0001",
    "ERROR:  P0001\n",
    "ERROR: P0001\r\n",
  ]) {
    assert.doesNotThrow(() =>
      assertSqlStateFailure({ ...failure, stderr }, "P0001"),
    );
  }
});
for (const [index, change] of [
  { status: 0 },
  { status: null },
  { status: -1 },
  { status: 3.5 },
  { status: 256 },
  { stderr: "" },
  { stderr: "ERROR:" },
  { stderr: "ERROR: 42501" },
  { stderr: "ERROR: P0001 private-sentinel" },
  { stderr: "ERROR: P0001\nERROR: 42501" },
  { stderr: "FATAL: P0001" },
  { stderr: "NOTICE: 00000\nERROR: P0001" },
  { stdout: "unexpected row" },
  { error: new Error("private-sentinel") },
  { signal: "SIGTERM" },
  { stderr: undefined },
  { stdout: undefined },
].entries()) {
  test(`SQL denial fails closed for malformed/unexpected process result ${index}`, () => {
    assert.throws(
      () =>
        assertSqlStateFailure(
          { ...failure, ...change } as typeof failure,
          "P0001",
        ),
      { message: "B43 SQLSTATE assertion failed" },
    );
  });
}
for (const role of ["anon", "authenticated", "service_role", "authenticator"]) {
  for (const operation of [
    "trigger_tamper",
    "truncate_authority",
    "truncate_restrictions",
  ] as const) {
    test(`identity precedes denied ${operation} for effective ${role}`, () => {
      const probe = applicationRolePrivilegeProbe(role, operation);
      assert.match(probe.sql, /^begin;/);
      assert.match(probe.sql, new RegExp(`set local role ${role};`));
      assert.ok(
        probe.sql.indexOf("select session_user") <
          probe.sql.indexOf(
            operation === "trigger_tamper" ? "alter table" : "truncate public",
          ),
      );
      assert.match(probe.sql, /pg_has_role\(current_user,'postgres','SET'\)/);
      assert.match(probe.sql, /has_table_privilege\(current_user/);
      assert.match(probe.sql, /has_function_privilege\(current_user/);
      assert.match(probe.sql, /rollback;$/);
      assert.doesNotMatch(
        probe.sql,
        /set role postgres|set session authorization|grant /i,
      );
      const result = {
        status: 3,
        stdout: probe.evidence + "\n",
        stderr: "ERROR: 42501\n",
      };
      assert.doesNotThrow(() =>
        assertSqlStateFailure(result, "42501", probe.evidence),
      );
      for (const stdout of [
        "",
        probe.evidence.replace(role, "postgres"),
        probe.evidence.replace(/^postgres\|/, "authenticator|"),
        ...[2, 3, 4].map((index) =>
          probe.evidence
            .split("|")
            .map((value, field) => (field === index ? "true" : value))
            .join("|"),
        ),
        probe.evidence + "\nextra-row",
      ]) {
        assert.throws(() =>
          assertSqlStateFailure({ ...result, stdout }, "42501", probe.evidence),
        );
      }
      // SET LOCAL ROLE failing first is not a passing DDL-permission test.
      assert.throws(() =>
        assertSqlStateFailure(
          { ...result, stdout: "" },
          "42501",
          probe.evidence,
        ),
      );
      assert.throws(() =>
        assertSqlStateFailure(
          { ...result, status: 0, stderr: "" },
          "42501",
          probe.evidence,
        ),
      );
    });
  }
}
test("probe role and operation cannot inject SQL", () => {
  assert.throws(() =>
    applicationRolePrivilegeProbe("anon; grant postgres to anon"),
  );
  assert.throws(() => applicationRolePrivilegeProbe("postgres"));
  assert.throws(() =>
    applicationRolePrivilegeProbe("anon", "unknown" as "trigger_tamper"),
  );
});
test("PostgREST denial requires null data, exact permission SQLSTATE and expected HTTP status", () => {
  for (const status of [401, 403])
    assert.doesNotThrow(() =>
      assertPostgrestPermissionDenied({
        data: null,
        error: { code: "42501" },
        status,
      }),
    );
  for (const response of [
    { data: null, error: null, status: 200 },
    { data: [], error: { code: "42501" }, status: 403 },
    { data: null, error: { code: "PGRST301" }, status: 401 },
    { data: null, error: { code: "P0001" }, status: 403 },
    { data: null, error: { code: "22P02" }, status: 400 },
    { data: null, error: { code: "42501" }, status: 500 },
  ])
    assert.throws(() => assertPostgrestPermissionDenied(response));
});
function inspection(version = "2.118.0\n") {
  const calls: string[] = [];
  return {
    calls,
    io: {
      realpath(path: string) {
        calls.push("resolve:" + path);
        return "/verified/supabase";
      },
      executable(path: string) {
        calls.push("executable:" + path);
      },
      version(path: string) {
        calls.push("version:" + path);
        return { status: 0, stdout: version, stderr: "" };
      },
    },
  };
}
test("CLI is an explicit resolved executable with exact standalone version, never PATH fallback", () => {
  const mock = inspection();
  assert.equal(
    acceptanceSupabaseCli("/selected/supabase", mock.io),
    "/verified/supabase",
  );
  assert.deepEqual(mock.calls, [
    "resolve:/selected/supabase",
    "executable:/verified/supabase",
    "version:/verified/supabase",
  ]);
  for (const value of [
    undefined,
    null,
    "",
    "supabase",
    "./node_modules/.bin/supabase",
    "/bin/supabase\nENV=bad",
    "/bin/supabase\0",
  ]) {
    const mock = inspection();
    assert.throws(() => acceptanceSupabaseCli(value, mock.io));
    assert.equal(mock.calls.length, 0);
  }
});
for (const version of [
  "2.109.1",
  "2.118.1",
  "",
  "supabase version 2.118.0",
  "2.118.0\nextra output",
]) {
  test(`CLI wrong/malformed version is rejected (${version.length} bytes)`, () => {
    assert.throws(
      () =>
        acceptanceSupabaseCli(
          "/repo/node_modules/.bin/supabase",
          inspection(version).io,
        ),
      {
        message:
          "Acceptance requires an explicit executable Supabase CLI 2.118.0",
      },
    );
  });
}
test("CLI resolution, executable and process failures are sanitized and cannot fall back", () => {
  for (const change of [
    {
      realpath() {
        throw new Error("private path");
      },
    },
    {
      realpath() {
        return "relative";
      },
    },
    {
      executable() {
        throw new Error("private permissions");
      },
    },
    {
      version() {
        return { status: 1, stdout: "2.118.0", stderr: "private stderr" };
      },
    },
    {
      version() {
        return {
          status: null,
          stdout: "2.118.0",
          stderr: "",
          signal: "SIGTERM",
        };
      },
    },
    {
      version() {
        return {
          status: 0,
          stdout: "2.118.0",
          stderr: "",
          error: new Error("private error"),
        };
      },
    },
  ])
    assert.throws(
      () =>
        acceptanceSupabaseCli("/selected/supabase", {
          ...inspection().io,
          ...change,
        }),
      {
        message:
          "Acceptance requires an explicit executable Supabase CLI 2.118.0",
      },
    );
});
test("runners and workflow select the same CLI and preserve meaningful role/error tests", () => {
  const b42 = readFileSync("scripts/validation-b42-db.ts", "utf8");
  const b43 = readFileSync("scripts/validation-b43-db.ts", "utf8");
  for (const source of [b42, b43]) {
    assert.match(
      source,
      /acceptanceSupabaseCli\(process\.env\.VALIDATION_SUPABASE_CLI\)/,
    );
    assert.doesNotMatch(source, /spawnSync\("supabase"|command\("supabase"/);
  }
  assert.match(b43, /assertSqlStateFailure\(result, "P0001"\)/);
  assert.doesNotMatch(
    b43,
    /set role \$\{role\}; set role postgres|current evidence unavailable/,
  );
  assert.match(
    b43,
    /assertSqlStateFailure\(result, "42501", probe\.evidence\)/,
  );
  const workflow = readFileSync(
    ".github/workflows/validation-b31-database.yml",
    "utf8",
  );
  assert.equal(
    (workflow.match(/name: Select and verify the exact acceptance CLI/g) ?? [])
      .length,
    2,
  );
  assert.match(workflow, /GITHUB_ENV/);
  assert.doesNotMatch(workflow, /run: supabase |^\s+supabase --/m);
  assert.ok(workflow.includes("tests/validation-acceptance-contracts.test.ts"));
});
