import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseAdminClient } from "../lib/supabase/server-admin.ts";
import { ValidationServerError } from "../lib/validation/server/contracts.ts";
import { validationTestModule } from "./support/validation-module.ts";

type Row = Record<string, unknown>;
function mockDb(tables: Record<string, Row[]> = {}) {
  const calls: Array<{
    kind: string;
    table: string;
    owner?: unknown;
    filters: Array<[string, unknown]>;
  }> = [];
  const writes: Array<{ name: string; args: Row }> = [];
  const db = {
    from(table: string) {
      if (table.includes("promotions") || table.includes("qualified"))
        throw new Error("Shared table accessed");
      const call = {
        kind: "read",
        table,
        owner: undefined as unknown,
        filters: [] as Array<[string, unknown]>,
      };
      calls.push(call);
      let rows = [...(tables[table] ?? [])],
        single = false,
        count = false;
      const result = () => ({
        data: single ? (rows[0] ?? null) : rows,
        error: null,
        count: count ? rows.length : undefined,
      });
      const q = {
        select(_columns: string, options?: { count?: string }) {
          count = options?.count === "exact";
          return q;
        },
        eq(key: string, value: unknown) {
          call.filters.push([key, value]);
          if (key === "owner_id") call.owner = value;
          rows = rows.filter((r) => r[key] === value);
          return q;
        },
        in(key: string, values: unknown[]) {
          call.filters.push([key, values]);
          rows = rows.filter((r) => values.includes(r[key]));
          return q;
        },
        or(expression: string) {
          const ids =
            expression
              .match(/experiment_id\.in\.\(([^)]*)\)/)?.[1]
              .split(",") ?? [];
          rows = rows.filter(
            (row) =>
              row.experiment_id == null ||
              ids.includes(String(row.experiment_id)),
          );
          return q;
        },
        order(key: string, options: { ascending: boolean }) {
          rows.sort((a, b) => Number(a[key]) - Number(b[key]));
          if (!options.ascending) rows.reverse();
          return q;
        },
        limit(n: number) {
          rows = rows.slice(0, n);
          return q;
        },
        single() {
          single = true;
          return Promise.resolve(result());
        },
        maybeSingle() {
          single = true;
          return Promise.resolve(result());
        },
        insert(value: unknown) {
          call.kind = "insert";
          rows = Array.isArray(value) ? (value as Row[]) : [value as Row];
          return q;
        },
        upsert(value: unknown) {
          return q.insert(value);
        },
        then(resolve: (value: ReturnType<typeof result>) => unknown) {
          return Promise.resolve(result()).then(resolve);
        },
      };
      return q;
    },
    async rpc(name: string, args: Row) {
      writes.push({ name, args });
      return {
        data: { id: "new-record", subject_id: args.p_subject_id },
        error: null,
      };
    },
  };
  return { db: db as unknown as SupabaseAdminClient, calls, writes };
}
const previous = [
  process.env.VALIDATION_PRIVATE_MODE,
  process.env.VALIDATION_PUBLIC_SURVEYS,
];
function mode(
  privateMode = "INTERVIEWS_AND_SURVEYS",
  publicSurveys = "DISABLED",
) {
  process.env.VALIDATION_PRIVATE_MODE = privateMode;
  process.env.VALIDATION_PUBLIC_SURVEYS = publicSurveys;
}
test.after(() => {
  for (const [i, key] of [
    "VALIDATION_PRIVATE_MODE",
    "VALIDATION_PUBLIC_SURVEYS",
  ].entries()) {
    if (previous[i] === undefined) delete process.env[key];
    else process.env[key] = previous[i];
  }
});

const { ValidationRepository } = validationTestModule(
  "lib/validation/server/repository.ts",
) as typeof import("../lib/validation/server/repository.ts");
const { ValidationService } = validationTestModule(
  "lib/validation/server/service.ts",
) as typeof import("../lib/validation/server/service.ts");
const { SurveyService } = validationTestModule(
  "lib/validation/server/surveys.ts",
) as typeof import("../lib/validation/server/surveys.ts");
const ev = (family = "customer_interview", owner = "owner"): Row => ({
  id: "version",
  owner_id: owner,
  experiment_id: "experiment",
  subject_id: "subject",
  hypothesis_id: "hypothesis",
  hypothesis_version_id: "hypothesis-version",
  family,
  lifecycle: "running",
  version_number: 1,
});
const session: Row = {
  ...ev(),
  id: "session",
  experiment_version_id: "version",
  participant_id: "participant",
  interview_plan_version_id: "plan",
};
for (const family of [
  "customer_interview",
  "survey",
  "landing_waitlist",
  "social_validation_post",
  "prototype",
]) {
  for (const current of ["INTERVIEWS", "SURVEYS", "INTERVIEWS_AND_SURVEYS"]) {
    test(`persisted version ${family} under ${current} controls mutation`, async () => {
      mode(current);
      const mock = mockDb({ validation_experiment_versions: [ev(family)] });
      const allowed =
        (family === "customer_interview" && current.includes("INTERVIEWS")) ||
        (family === "survey" && current.includes("SURVEYS"));
      const run = () =>
        new ValidationRepository(mock.db).transition(
          "owner",
          "version",
          "ready",
          "running",
        );
      if (allowed) {
        await run();
        assert.equal(mock.writes.length, 1);
      } else {
        await assert.rejects(run, /validation_disabled/);
        assert.equal(mock.writes.length, 0);
      }
      assert.equal(mock.calls[0].owner, "owner");
    });
  }
}
test("cross-owner and missing resources have indistinguishable safe failures and no writes", async () => {
  mode();
  const mock = mockDb({
    validation_experiment_versions: [ev("customer_interview", "other-owner")],
  });
  for (const id of ["version", "missing"]) {
    await assert.rejects(
      () =>
        new ValidationRepository(mock.db).transition(
          "owner",
          id,
          "ready",
          "running",
        ),
      (e: unknown) => (e as { status: number }).status === 404,
    );
  }
  assert.equal(mock.writes.length, 0);
});
test("owned session rejects mismatched persisted lineage", async () => {
  mode("INTERVIEWS");
  const mock = mockDb({
    validation_interview_sessions: [
      { ...session, subject_id: "other-subject" },
    ],
    validation_experiment_versions: [ev()],
  });
  await assert.rejects(
    () =>
      new ValidationRepository(mock.db).recordInterviewObservation("owner", {
        p_interview_session_id: "session",
      }),
    (e: unknown) => (e as { status: number }).status === 404,
  );
  assert.equal(mock.writes.length, 0);
});
test("interview plan cannot target an owned survey version", async () => {
  mode();
  const mock = mockDb({ validation_experiment_versions: [ev("survey")] });
  await assert.rejects(
    () =>
      new ValidationRepository(mock.db).createInterviewPlan("owner", {
        p_experiment_version_id: "version",
      }),
    /validation_disabled/,
  );
  assert.equal(mock.writes.length, 0);
});
test("survey plan cannot target an owned interview version", async () => {
  mode();
  const mock = mockDb({ validation_experiment_versions: [ev()] });
  await assert.rejects(
    () =>
      new SurveyService(mock.db).createPlan("owner", {
        experimentVersionId: "version",
        title: "Title",
        purpose: "Research",
        questions: [
          {
            questionRef: "question_1",
            prompt: "What happened?",
            type: "short_text",
          },
        ],
      }),
    /validation_disabled/,
  );
  assert.equal(mock.writes.length, 0);
});
test("owner survey revocation works while public participation is disabled", async () => {
  mode("SURVEYS", "DISABLED");
  const mock = mockDb({
    validation_survey_publications: [
      { ...ev("survey"), id: "publication", experiment_version_id: "version" },
    ],
    validation_experiment_versions: [ev("survey")],
  });
  await new SurveyService(mock.db).revoke("owner", "publication");
  assert.equal(mock.writes[0].name, "validation_revoke_survey");
});
test("survey publish rejects before token/client/database work when public capability is off", async () => {
  mode("SURVEYS", "DISABLED");
  const mock = mockDb();
  await assert.rejects(
    () =>
      new SurveyService(mock.db).publish("owner", {
        surveyPlanVersionId: "plan",
      }),
    /validation_disabled/,
  );
  assert.equal(mock.calls.length, 0);
  assert.equal(mock.writes.length, 0);
});
test("generic ingestion and shareable preparation cannot be smuggled through private capability", () => {
  mode();
  const mock = mockDb();
  const service = new ValidationService(new ValidationRepository(mock.db));
  assert.throws(
    () =>
      service.recordObservation("owner", {
        family: "customer_interview",
        capability: "allowed",
        collectedBy: "server_observed",
      }),
    /validation_disabled/,
  );
  assert.throws(
    () =>
      service.recordInterviewObservation("owner", {
        category: "other",
        statementKind: "summary",
        shareableEvidence: {
          statement: "Share me",
          reviewedForSharedEvidenceUse: true,
        },
      }),
    /validation_disabled/,
  );
  assert.equal(mock.calls.length, 0);
  assert.equal(mock.writes.length, 0);
});
test("user-entered subject creates without upstream reads; experiment checks owned hypothesis", async () => {
  mode("SURVEYS");
  const mock = mockDb({
    validation_subjects: [{ id: "subject", owner_id: "owner" }],
    validation_hypothesis_versions: [
      { id: "hv", subject_id: "subject", owner_id: "owner" },
    ],
  });
  const repo = new ValidationRepository(mock.db);
  const service = new ValidationService(repo);
  await service.createSubject("owner", {
    creationOrigin: "user_entered",
    label: "My own idea",
    contextSnapshot: { description: "A customer problem" },
  });
  assert.equal(mock.calls.length, 0);
  assert.equal(mock.writes[0].name, "validation_create_subject");
  assert.equal(mock.writes[0].args.p_source_type, null);
  await repo.createExperiment("owner", "subject", {
    p_family: "survey",
    p_hypothesis_version_id: "hv",
  });
  assert.equal(mock.writes[1].name, "validation_create_experiment");
  assert.ok(
    mock.calls.every((c) =>
      ["validation_subjects", "validation_hypothesis_versions"].includes(
        c.table,
      ),
    ),
  );
});
test("new experiment family is denied and foreign hypothesis cannot supply lineage", async () => {
  mode();
  const mock = mockDb({
    validation_subjects: [{ id: "subject", owner_id: "owner" }],
    validation_hypothesis_versions: [
      { id: "hv", subject_id: "other", owner_id: "owner" },
    ],
  });
  const repo = new ValidationRepository(mock.db);
  await assert.rejects(
    () => repo.createExperiment("owner", "subject", { p_family: "prototype" }),
    /validation_disabled/,
  );
  assert.equal(mock.calls.length, 0);
  await assert.rejects(
    () =>
      repo.createExperiment("owner", "subject", {
        p_family: "survey",
        p_hypothesis_version_id: "hv",
      }),
    (e: unknown) => (e as { status: number }).status === 404,
  );
  assert.equal(mock.writes.length, 0);
});
for (const current of ["INTERVIEWS", "SURVEYS", "INTERVIEWS_AND_SURVEYS"])
  test(`workspace ${current} reads only admitted owned study children, never promotion history`, async () => {
    mode(current);
    const interviewVersion = ev(),
      surveyVersion = {
        ...ev("survey"),
        id: "survey-version",
        experiment_id: "survey-experiment",
      };
    const tables: Record<string, Row[]> = {
      validation_subjects: [{ id: "subject", owner_id: "owner" }],
      validation_experiment_versions: [
        interviewVersion,
        surveyVersion,
        { ...ev(), id: "foreign-version", subject_id: "different-study" },
      ],
      validation_experiments: [
        { id: "experiment", owner_id: "owner", subject_id: "subject" },
        { id: "survey-experiment", owner_id: "owner", subject_id: "subject" },
      ],
      validation_evidence_observations: [
        {
          id: "observation",
          owner_id: "owner",
          subject_id: "subject",
          experiment_version_id: "version",
        },
      ],
      validation_survey_submissions: [
        {
          id: "submission",
          owner_id: "owner",
          subject_id: "subject",
          experiment_version_id: "survey-version",
        },
      ],
      validation_survey_answers: [
        { id: "answer", owner_id: "owner", submission_id: "submission" },
        {
          id: "private-other-study-answer",
          owner_id: "owner",
          submission_id: "different-study-submission",
        },
      ],
    };
    const mock = mockDb(tables);
    const result = (await new ValidationRepository(mock.db).getSubject(
      "owner",
      "subject",
    )) as Record<string, unknown>;
    assert.equal("promotions" in result, false);
    assert.equal(
      JSON.stringify(result).includes("private-other-study-answer"),
      false,
    );
    for (const call of mock.calls)
      assert.equal(call.owner, "owner", call.table);
    if (current === "INTERVIEWS")
      assert.equal(
        mock.calls.some((c) => c.table.startsWith("validation_survey")),
        false,
      );
    if (current === "SURVEYS")
      assert.equal(
        mock.calls.some(
          (c) =>
            c.table.startsWith("validation_interview") ||
            c.table === "validation_evidence_observations",
        ),
        false,
      );
  });
for (const scenario of ["success", "unauthenticated", "unexpected", "resource"])
  test(`HTTP ${scenario} is private/no-store and sanitizes errors`, async () => {
    mode("INTERVIEWS");
    const events: string[] = [];
    class AuthError extends Error {}
    const exports = validationTestModule(
      "lib/validation/server/http.ts",
      (specifier) => {
        if (specifier.includes("_utils/auth"))
          return {
            AuthError,
            async requireUser() {
              events.push("auth");
              if (scenario === "unauthenticated") throw new AuthError();
              return { id: "verified-owner" };
            },
          };
        if (specifier.includes("server-admin"))
          return {
            createSupabaseAdminClient() {
              events.push("admin");
              return {};
            },
          };
        if (specifier === "./service") return { ValidationService: class {} };
        if (specifier === "./repository")
          return { ValidationRepository: class {} };
        if (specifier === "./contracts") return { ValidationServerError };
        return undefined;
      },
    );
    const handler = exports.validationHandler as (
      req: Request,
      op: string,
      callback: (s: unknown, owner: string) => Promise<unknown>,
    ) => Promise<Response>;
    const res = await handler(
      new Request("http://localhost", { method: "GET" }),
      "subject.list",
      async (_s, owner) => {
        assert.equal(owner, "verified-owner");
        if (scenario === "unexpected")
          throw new Error("PRIVATE_EVIDENCE_SENTINEL");
        if (scenario === "resource")
          throw new ValidationServerError(
            404,
            "not_found",
            "Validation resource not found.",
          );
        return { safe: true };
      },
    );
    assert.equal(
      res.status,
      scenario === "success"
        ? 200
        : scenario === "unauthenticated"
          ? 401
          : scenario === "resource"
            ? 404
            : 500,
    );
    assert.match(res.headers.get("cache-control")!, /private.*no-store/);
    assert.doesNotMatch(await res.text(), /PRIVATE_EVIDENCE_SENTINEL/);
    assert.deepEqual(
      events,
      scenario === "unauthenticated" ? ["auth"] : ["auth", "admin"],
    );
  });
test("shared HTTP wrapper denies unsupported operation before authentication/client/callback", async () => {
  mode();
  let calls = 0;
  const trap = new Proxy(
    {},
    {
      get() {
        calls++;
        throw new Error("dependency touched");
      },
    },
  );
  const exports = validationTestModule("lib/validation/server/http.ts", (s) =>
    s.includes("release-policy") ? undefined : s === "server-only" ? {} : trap,
  );
  const fn = exports.validationHandler as (
    ...args: unknown[]
  ) => Promise<Response>;
  const response = await fn(
    new Request("http://localhost", { method: "POST" }),
    "unknown",
    () => {
      calls++;
    },
  );
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});
test("public survey success exposes only participant-safe fields and derives submission lineage", async () => {
  mode("SURVEYS", "ENABLED");
  const { createHash } = await import("node:crypto");
  const token = "a".repeat(43),
    tokenHash = createHash("sha256").update(token).digest("hex");
  const mock = mockDb({
    validation_experiment_versions: [ev("survey")],
    validation_survey_publications: [
      {
        ...ev("survey"),
        id: "publication",
        experiment_version_id: "version",
        survey_plan_version_id: "plan",
        state: "published",
        token_hash: tokenHash,
      },
    ],
    validation_survey_plan_versions: [
      {
        ...ev("survey"),
        id: "plan",
        experiment_version_id: "version",
        title: "Research",
        purpose: "Past behavior",
        questions: [
          {
            questionRef: "question_1",
            type: "short_text",
            prompt: "What happened?",
            required: true,
          },
        ],
        private_notes: "PRIVATE_SENTINEL",
      },
    ],
  });
  const service = new SurveyService(mock.db);
  const resolved = await service.resolve(token);
  assert.deepEqual(Object.keys(resolved).sort(), [
    "notice",
    "purpose",
    "questions",
    "title",
  ]);
  assert.doesNotMatch(
    JSON.stringify(resolved),
    /PRIVATE_SENTINEL|owner_id|hypothesis_id|token_hash/,
  );
  const accepted = await service.submit(token, {
    idempotencyKey: "command-key-123456",
    answers: [{ questionRef: "question_1", value: "A real response" }],
  });
  assert.deepEqual(accepted, { accepted: true, duplicate: false });
  assert.equal(mock.writes[0].name, "validation_submit_public_survey");
  assert.equal(mock.writes[0].args.p_token_hash, tokenHash);
  assert.equal("p_owner_id" in mock.writes[0].args, false);
  await assert.rejects(
    () => service.submit(token, { owner_id: "forged", answers: [] }),
    /server-owned/,
  );
  assert.equal(mock.writes.length, 1);
});
test("public token cannot resolve a different-owner or non-survey experiment", async () => {
  mode("SURVEYS", "ENABLED");
  const { createHash } = await import("node:crypto");
  const token = "b".repeat(43);
  for (const version of [
    ev("customer_interview"),
    ev("survey", "other-owner"),
  ]) {
    const mock = mockDb({
      validation_experiment_versions: [version],
      validation_survey_publications: [
        {
          ...ev("survey"),
          id: "pub",
          experiment_version_id: "version",
          state: "published",
          token_hash: createHash("sha256").update(token).digest("hex"),
        },
      ],
    });
    await assert.rejects(
      () => new SurveyService(mock.db).resolve(token),
      (e: unknown) => (e as { status: number }).status === 404,
    );
    assert.equal(mock.writes.length, 0);
  }
});
test("internal resource helpers deny before reads when private mode is disabled", async () => {
  mode("DISABLED");
  const mock = mockDb();
  const helpers = validationTestModule(
    "lib/validation/server/resource-policy.ts",
  ) as typeof import("../lib/validation/server/resource-policy.ts");
  await assert.rejects(
    () => helpers.ownedValidationVersion(mock.db, "owner", "version"),
    /validation_disabled/,
  );
  assert.equal(mock.calls.length, 0);
});
test("owner-local interview participants remain reusable without exposing another study's participants", async () => {
  mode("INTERVIEWS");
  const mock = mockDb({
    validation_subjects: [{ id: "subject", owner_id: "owner" }],
    validation_experiment_versions: [ev()],
    validation_participants: [
      { id: "local", owner_id: "owner", experiment_id: null },
      { id: "scoped", owner_id: "owner", experiment_id: "experiment" },
      { id: "other-study", owner_id: "owner", experiment_id: "other" },
    ],
  });
  const result = (await new ValidationRepository(mock.db).getSubject(
    "owner",
    "subject",
  )) as { participants: Array<{ id: string }> };
  assert.deepEqual(
    result.participants.map((p) => p.id),
    ["local", "scoped"],
  );
});
for (const family of ["customer_interview", "survey"])
  test(`participant creation requires the persisted interview family (${family})`, async () => {
    mode();
    const mock = mockDb({
      validation_experiments: [{ id: "experiment", owner_id: "owner" }],
      validation_experiment_versions: [ev(family)],
    });
    const run = () =>
      new ValidationRepository(mock.db).createParticipant("owner", {
        experiment_id: "experiment",
        identity_mode: "anonymous",
      });
    if (family === "customer_interview") {
      await run();
      assert.equal(mock.calls.filter((c) => c.kind === "insert").length, 1);
    } else {
      await assert.rejects(run, /validation_disabled/);
      assert.equal(mock.calls.filter((c) => c.kind === "insert").length, 0);
    }
  });
test("resource admission cannot be used to read shared proof or arbitrary tables", async () => {
  mode();
  const mock = mockDb();
  const helpers = validationTestModule(
    "lib/validation/server/resource-policy.ts",
  ) as typeof import("../lib/validation/server/resource-policy.ts");
  assert.equal("ownedValidationResource" in helpers, false);
  for (const table of [
    "validation_evidence_promotions",
    "validation_qualified_evidence_snapshots",
    "unknown",
    "canonical_problems",
  ]) {
    await assert.rejects(
      () =>
        helpers.ownedSurveyResource(
          mock.db,
          "owner",
          "id",
          table as "validation_survey_publications",
        ),
      /validation_disabled/,
    );
  }
  assert.equal(mock.calls.length, 0);
});
