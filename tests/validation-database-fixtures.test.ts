import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { SupabaseAdminClient } from "../lib/supabase/server-admin.ts";
import {
  createValidationDatabaseFixtures,
  assertDatabaseFixtureSource,
} from "./support/validation-database-fixtures.ts";
import { validationTestModule } from "./support/validation-module.ts";

const canonical = "20000000-0000-0000-0000-000000000001";
test("fixture source pins cover every current algorithm dependency and both loaders", () => {
  const manifest = JSON.parse(
    readFileSync(
      "tests/support/validation-database-fixtures.manifest.json",
      "utf8",
    ),
  ) as Record<string, string>;
  for (const [file, hash] of Object.entries(manifest)) {
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.doesNotThrow(() =>
      assertDatabaseFixtureSource(resolve(file), readFileSync(file, "utf8")),
    );
    assert.throws(
      () =>
        assertDatabaseFixtureSource(
          resolve(file),
          readFileSync(file, "utf8") + "\n// simulated drift",
        ),
      { message: "database_fixture_source_mismatch" },
    );
  }
  for (const required of [
    "lib/validation/promotion/promotion-service.ts",
    "lib/validation/promotion/preparation.ts",
    "lib/validation/promotion/read-repository.ts",
    "lib/validation/promotion/trusted-qualified-evidence-reader.ts",
    "tests/support/validation-module.ts",
    "tests/support/validation-database-fixtures.ts",
  ])
    assert.ok(Object.hasOwn(manifest, required));
  assert.throws(
    () => assertDatabaseFixtureSource(resolve("unlisted-dependency.ts"), ""),
    /database_fixture_source_mismatch/,
  );
});
test("isolated compiler verifies the exact text it will compile and aborts on mismatch", () => {
  let verified = false;
  const file = resolve("lib/validation/promotion/preparation.ts");
  assert.throws(
    () =>
      validationTestModule(file, undefined, (path, source) => {
        assert.equal(path, file);
        assert.equal(source, readFileSync(path, "utf8"));
        verified = true;
        assertDatabaseFixtureSource(path, source + "\n// simulated drift");
      }),
    /database_fixture_source_mismatch/,
  );
  assert.equal(verified, true);
});
test("acceptance promotion executes real preparation and reaches the unchanged RPC", async () => {
  const lineage = {
    owner_id: "owner",
    subject_id: "subject",
    hypothesis_id: "hypothesis",
    hypothesis_version_id: "hv",
    experiment_id: "experiment",
    experiment_version_id: "ev",
    participant_id: "participant",
  };
  const tables: Record<string, Record<string, unknown>[]> = {
    validation_evidence_observations: [
      {
        ...lineage,
        id: "observation",
        interview_session_id: "session",
        origin: "human_interview",
        modality: "interview_observation",
        source_type: "customer_interview",
        observed_at: "2026-01-02T00:00:00Z",
        observation_content: {
          statement: "Past behavior",
          statement_kind: "direct_quote",
          specificity: "reported_past_behavior",
        },
      },
    ],
    validation_evidence_classifications: [
      {
        id: "classification",
        owner_id: "owner",
        observation_id: "observation",
        polarity: "supporting",
        classification_source: "user_supplied",
        authority_status: "authoritative",
        supersedes_classification_id: null,
      },
    ],
    validation_subjects: [
      { id: "subject", owner_id: "owner", label: "Invoice bottleneck" },
    ],
    validation_hypothesis_versions: [
      {
        id: "hv",
        owner_id: "owner",
        subject_id: "subject",
        hypothesis_id: "hypothesis",
        problem_claim: "Invoice bottleneck",
      },
    ],
    validation_experiment_versions: [
      {
        ...lineage,
        id: "ev",
        family: "customer_interview",
        lifecycle: "completed",
      },
    ],
    validation_participants: [
      { id: "participant", owner_id: "owner", status: "active" },
    ],
    validation_interview_sessions: [
      {
        ...lineage,
        id: "session",
        status: "completed",
        participant_relevance: "target_segment_match",
      },
    ],
    canonical_problems: [
      {
        id: canonical,
        canonical_title: "Invoice Approval Bottlenecks",
        normalized_title: "invoice approval bottlenecks",
        status: "active",
      },
    ],
    problem_aliases: [
      {
        canonical_problem_id: canonical,
        normalized_alias: "invoice bottleneck",
      },
    ],
  };
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = {
    supabaseUrl: "http://127.0.0.1:54321",
    from(table: string) {
      let rows = tables[table] ?? [];
      const q = {
        select() {
          return q;
        },
        order() {
          return q;
        },
        eq(key: string, value: unknown) {
          rows = rows.filter((row) => row[key] === value);
          return q;
        },
        range() {
          return Promise.resolve({ data: rows, error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
      };
      return q;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: { duplicate: false }, error: null };
    },
  } as unknown as SupabaseAdminClient;
  const fixtures = createValidationDatabaseFixtures("B42", [db]);
  assert.deepEqual(
    await fixtures.promoteCustomerInterviewEvidence("owner", "observation", db),
    { duplicate: false },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "validation_promote_customer_interview_evidence");
  assert.equal(calls[0].args.p_owner_id, "owner");
  assert.equal(calls[0].args.p_canonical_problem_id, canonical);
  assert.equal(calls[0].args.p_policy_version, "v8-b1.2");
  assert.ok(calls[0].args.p_authority_snapshot);
  assert.ok(calls[0].args.p_representative_state);
});
function mockClient(url = "http://127.0.0.1:54321", failure = false) {
  let reads = 0;
  const db = {
    supabaseUrl: url,
    from() {
      reads++;
      const result = {
        data: failure ? null : [],
        error: failure
          ? { code: "42501", message: "private-database-sentinel" }
          : null,
        count: 0,
      };
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        not() {
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return Promise.resolve(result);
        },
        maybeSingle() {
          return Promise.resolve({ ...result, data: null });
        },
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseAdminClient, reads: () => reads };
}
for (const profile of ["B42", "B43"] as const) {
  test(`${profile} fixtures execute the retained reader and preserve real permission failures`, async () => {
    const url =
      profile === "B42" ? "http://127.0.0.1:54321" : "http://127.0.0.1:55431";
    const good = mockClient(url),
      denied = mockClient(url, true);
    const fixtures = createValidationDatabaseFixtures(profile, [
      good.db,
      denied.db,
    ]);
    assert.deepEqual(
      await fixtures.readTrustedQualifiedValidationEvidence(canonical, good.db),
      { observations: [], complete: true },
    );
    await assert.rejects(
      fixtures.readTrustedQualifiedValidationEvidence(canonical, denied.db),
      { message: "trusted_qualified_evidence_read_failed" },
    );
    assert.equal(good.reads(), 1);
    assert.equal(denied.reads(), 1); // Reaches the mocked DB; not a policy-denial false positive.
    await assert.rejects(
      fixtures.promoteCustomerInterviewEvidence("owner", "missing", good.db),
      { code: "not_found", status: 404 },
    );
    assert.equal(good.reads(), 2);
  });
}
test("remote, missing, wrong-profile and unregistered clients fail before reads", async () => {
  for (const url of [
    "https://example.invalid",
    "http://localhost:54321",
    "http://127.0.0.1:55431",
    "",
  ]) {
    const client = mockClient(url);
    assert.throws(
      () => createValidationDatabaseFixtures("B42", [client.db]),
      /database_fixture_client_rejected/,
    );
    assert.equal(client.reads(), 0);
  }
  assert.throws(
    () => createValidationDatabaseFixtures("B42", []),
    /database_fixture_client_rejected/,
  );
  const allowed = mockClient(),
    other = mockClient();
  const fixtures = createValidationDatabaseFixtures("B42", [allowed.db]);
  await assert.rejects(
    fixtures.readTrustedQualifiedValidationEvidence(canonical, other.db),
    /database_fixture_client_rejected/,
  );
  await assert.rejects(
    fixtures.promoteCustomerInterviewEvidence(
      "owner",
      "observation",
      undefined as unknown as SupabaseAdminClient,
    ),
    /database_fixture_client_rejected/,
  );
  assert.equal(other.reads(), 0);
  (allowed.db as unknown as { supabaseUrl: string }).supabaseUrl =
    "https://example.invalid";
  await assert.rejects(
    fixtures.readTrustedQualifiedValidationEvidence(canonical, allowed.db),
    /database_fixture_client_rejected/,
  );
  assert.equal(allowed.reads(), 0);
});
test("fixture construction cannot change actual application modules or their denial", async () => {
  const app = validationTestModule(
    "lib/validation/promotion/promotion-service.ts",
  );
  const history = validationTestModule(
    "lib/validation/promotion/trusted-qualified-evidence-reader.ts",
  );
  const current = validationTestModule(
    "lib/validation/promotion/current-qualified-evidence-reader.ts",
  );
  const client = mockClient();
  const promote = app.promoteCustomerInterviewEvidence as (
    owner: string,
    id: string,
    db: SupabaseAdminClient,
  ) => Promise<unknown>;
  const historicalRead = history.readTrustedQualifiedValidationEvidence as (
    id: string,
    db: SupabaseAdminClient,
  ) => Promise<unknown>;
  const currentRead = current.readCurrentQualifiedValidationEvidence as (
    id: string,
    db: SupabaseAdminClient,
  ) => Promise<unknown>;
  for (const fixturesConstructed of [false, true]) {
    if (fixturesConstructed)
      createValidationDatabaseFixtures("B42", [client.db]);
    await assert.rejects(
      promote("owner", "observation", client.db),
      /validation_disabled/,
    );
    await assert.rejects(
      historicalRead(canonical, client.db),
      /validation_disabled/,
    );
    await assert.rejects(
      currentRead(canonical, client.db),
      /validation_disabled/,
    );
    assert.equal(client.reads(), 0);
  }
});
function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(`${root}/${entry.name}`)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [`${root}/${entry.name}`]
        : [],
  );
}
test("production sources cannot reach the acceptance fixture or test module loader", () => {
  for (const file of [
    ...sourceFiles("app"),
    ...sourceFiles("lib"),
    ...sourceFiles("components"),
  ]) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /validation-database-fixtures|validation-module|tests\/support/,
      file,
    );
  }
});
test("runners retain positive SQL/reader assertions and the workflow tests production denial", () => {
  const b42 = readFileSync("scripts/validation-b42-db.ts", "utf8");
  const b43 = readFileSync("scripts/validation-b43-db.ts", "utf8");
  assert.ok(
    b42.indexOf('createValidationDatabaseFixtures("B42"') >
      b42.indexOf("check(status.API_URL === apiUrl"),
  );
  assert.match(b42, /positive\.observations\.length === 3/);
  assert.match(b42, /actual B3\.1 service promotion failed/);
  assert.ok(
    b43.indexOf('createValidationDatabaseFixtures("B43"') >
      b43.indexOf("assertFreshApplicationDatabase();"),
  );
  assert.match(b43, /history\.observations\.length === 4/);
  assert.match(b43, /readCurrentEvidence\(canonical\)/);
  assert.doesNotMatch(b43, /readCurrentQualifiedValidationEvidence/);
  assert.ok(
    b43.indexOf("await verifyPostgrestExecutionBoundary(admin") >
      b43.indexOf("sql(`begin;${setup}"),
  );
  const workflow = readFileSync(
    ".github/workflows/validation-b31-database.yml",
    "utf8",
  );
  for (const name of [
    "validation-database-fixtures.test.ts",
    "validation-release-boundary.test.ts",
    "validation-body-limit.test.ts",
  ])
    assert.ok(workflow.includes(name));
  const manifest = JSON.parse(readFileSync("tests/support/validation-database-fixtures.manifest.json", "utf8")) as Record<string, string>;
  const paths = [...workflow.slice(0, workflow.indexOf("  workflow_dispatch:")).matchAll(/- "([^"]+)"/g)].map(match => match[1]);
  for (const file of [...Object.keys(manifest), "tests/support/validation-database-fixtures.manifest.json"]) {
    assert.ok(paths.some(path => path === file || path.endsWith("/**") && file.startsWith(path.slice(0, -2))), `uncovered fixture dependency: ${file}`);
  }
  assert.match(workflow, /npm run test:validation-b31-db/);
  assert.match(workflow, /npm run test:validation-b42-db/);
});
