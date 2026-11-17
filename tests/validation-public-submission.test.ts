import assert from "node:assert/strict";
import test from "node:test";
import { PublicSubmission } from "../lib/validation/public-submission.ts";
import { validationTestModule } from "./support/validation-module.ts";
const accepted = () =>
  Response.json({ data: { accepted: true, duplicate: false } });
const error = (status: number, code: string, extra = {}) =>
  Response.json({ error: { code, ...extra } }, { status });
const payload = () => ({
  requestId: crypto.randomUUID(),
  answers: ["original"],
});

test("committed write followed by lost response: identical snapshot and UUID, one persistence, repeated clicks ignored", async () => {
  const request = new PublicSubmission();
  const records = new Map<string, string>();
  const bodies: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = async (_url: unknown, init?: RequestInit) => {
    const body = String(init!.body);
    bodies.push(body);
    const key = JSON.parse(body).requestId;
    assert.ok(!records.has(key) || records.get(key) === body);
    records.set(key, body);
    if (bodies.length === 1) {
      await gate;
      throw new Error("response lost after commit");
    }
    return accepted();
  };
  const original = payload();
  const first = request.send(
    "/submit",
    () => original,
    transport as typeof fetch,
  );
  await request.send(
    "/submit",
    () => {
      throw new Error("click created another identity");
    },
    transport as typeof fetch,
  );
  original.answers[0] = "edited";
  release();
  await first;
  assert.equal(request.done, false);
  await request.send("/submit", payload, transport as typeof fetch);
  assert.equal(request.done, true);
  assert.equal(records.size, 1);
  assert.equal(bodies[0], bodies[1]);
  assert.deepEqual(JSON.parse(bodies[1]).answers, ["original"]);
  await request.send("/submit", payload, transport as typeof fetch);
  assert.equal(bodies.length, 2);
});
for (const result of [
  Response.json({}),
  Response.json({ data: { accepted: false } }),
  Response.json({ data: { accepted: true, limited: true } }),
  new Response("not json"),
  error(400, "invalid_request"),
  error(422, "invalid_request"),
  error(409, "constraint_conflict"),
  error(500, "not_found"),
]) {
  test(`ambiguous response ${result.status} retains the exact held request without success`, async () => {
    const request = new PublicSubmission();
    await request.send("/submit", payload, async () => result);
    const held = request.body;
    assert.ok(held);
    assert.equal(request.done, false);
    assert.equal(request.stopped, false);
    await request.send(
      "/submit",
      () => {
        throw new Error("must retain identity");
      },
      async (_u, i) => {
        assert.equal(i?.body, held);
        return accepted();
      },
    );
    assert.equal(request.done, true);
  });
}
test("only recognized deterministic rejection allows correction and a new UUID", async () => {
  const request = new PublicSubmission();
  let before = "";
  await request.send("/submit", payload, async (_u, i) => {
    before = String(i?.body);
    return error(400, "invalid_request", { submissionRejected: true });
  });
  assert.equal(request.body, null);
  await request.send(
    "/submit",
    () => ({ ...payload(), answers: ["corrected"] }),
    async (_u, i) => {
      const next = JSON.parse(String(i?.body));
      assert.notEqual(next.requestId, JSON.parse(before).requestId);
      assert.deepEqual(next.answers, ["corrected"]);
      return accepted();
    },
  );
  assert.equal(request.done, true);
});
test("rate limit retains identity, enforces wait, and retries after expiry", async () => {
  const request = new PublicSubmission();
  let first = "";
  await request.send("/submit", payload, async (_u, i) => {
    first = String(i?.body);
    return Response.json(
      { error: { code: "invalid_request" } },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  });
  assert.ok(request.retryAt > Date.now());
  await request.send("/submit", payload, async () => {
    throw new Error("must wait");
  });
  assert.equal(request.done, false);
  request.retryAt = Date.now() - 1;
  await request.send("/submit", payload, async (_u, i) => {
    assert.equal(i?.body, first);
    return accepted();
  });
  assert.equal(request.done, true);
});
for (const [status, code] of [
  [404, "not_found"],
  [409, "idempotency_conflict"],
] as const) {
  test(`${code} stops resubmission without discarding uncertain identity`, async () => {
    const request = new PublicSubmission();
    await request.send("/submit", payload, async () => error(status, code));
    assert.equal(request.stopped, true);
    assert.ok(request.body);
    assert.equal(request.done, false);
    await request.send("/submit", payload, async () => {
      throw new Error("terminal");
    });
  });
}
test("server rejection marker excludes body parsing, RPC failures and rate limits", async () => {
  const { ValidationServerError, publicSubmissionValidation } =
    validationTestModule("lib/validation/server/contracts.ts") as {
      ValidationServerError: new (
        status: number,
        code: string,
        message: string,
      ) => Error & { submissionRejected: boolean };
      publicSubmissionValidation: (op: () => never) => never;
    };
  const deterministic = new ValidationServerError(
    400,
    "invalid_request",
    "invalid feedback",
  );
  assert.throws(() =>
    publicSubmissionValidation(() => {
      throw deterministic;
    }),
  );
  assert.equal(deterministic.submissionRejected, true);
  for (const status of [409, 429, 500]) {
    const other = new ValidationServerError(
      status,
      "invalid_request",
      "unknown",
    );
    assert.throws(() =>
      publicSubmissionValidation(() => {
        throw other;
      }),
    );
    assert.equal(other.submissionRejected, false);
  }
  const parsing = new ValidationServerError(
    400,
    "invalid_request",
    "malformed JSON",
  );
  assert.equal(parsing.submissionRejected, false);
});
for (const method of ["external-mvp", "commercial-intent"]) {
  test(`${method} HTTP only marks deterministic validation; RPC transport, closure and conflict stay distinct`, async () => {
    let rpcResult: unknown = { data: { accepted: true }, error: null };
    let calls = 0;
    const exports = validationTestModule(
      `lib/validation/server/${method}-http.ts`,
      (specifier) => {
        if (specifier.endsWith("release-policy"))
          return {
            validationAdmission() {},
            assertValidationOperation() {},
            VALIDATION_PRIVATE_HEADERS: {
              "Cache-Control": "private, no-store",
            },
            ValidationReleaseDeniedError: class extends Error {},
          };
        if (specifier.endsWith("server-admin"))
          return {
            createSupabaseAdminClient: () => ({
              rpc: async () => {
                calls++;
                return rpcResult;
              },
            }),
          };
      },
    );
    const handler = exports[
      method === "external-mvp"
        ? "externalMvpPublicHandler"
        : "commercialIntentPublicHandler"
    ] as (r: Request, t: string, a: string) => Promise<Response>;
    const body = {
      requestId: crypto.randomUUID(),
      outcome: method === "external-mvp" ? "no" : "not_now",
      answers: ["Blocked"],
      consent: true,
      email: "",
      contactConsent: false,
      website: "",
    };
    const send = (value: unknown) =>
      handler(
        new Request("http://localhost/submit", {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: JSON.stringify(value),
        }),
        "a".repeat(43),
        "submit",
      );
    let response = await send({ ...body, consent: false });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.submissionRejected, true);
    assert.equal(calls, 0);
    response = await handler(
      new Request("http://localhost/submit", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: "{",
      }),
      "a".repeat(43),
      "submit",
    );
    assert.equal((await response.json()).error.submissionRejected, undefined);
    assert.equal(calls, 0);
    for (const [code, message, status, expected] of [
      ["P0001", "answer limits", 400, "invalid_request"],
      ["P0001", "unrecognized error", 500, "constraint_conflict"],
      ["08006", "connection lost", 500, "constraint_conflict"],
      ["P0002", "closed", 404, "not_found"],
      ["23505", "feedback conflict", 409, "idempotency_conflict"],
    ] as const) {
      rpcResult = { data: null, error: { code, message } };
      response = await send(body);
      const envelope = await response.json();
      assert.equal(response.status, status);
      assert.equal(envelope.error.code, expected);
      assert.equal(
        envelope.error.submissionRejected,
        status === 400 ? true : undefined,
      );
    }
    rpcResult = { data: { limited: true }, error: null };
    response = await send(body);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
    assert.equal((await response.json()).error.submissionRejected, undefined);
  });
}

test("uncertain retries retain the original publication endpoint too", async () => {
  const request = new PublicSubmission();
  await request.send("/original-publication", payload, async () => {
    throw new Error("lost");
  });
  await request.send("/replacement-publication", payload, async (url) => {
    assert.equal(url, "/original-publication");
    return accepted();
  });
  assert.equal(request.done, true);
});
test("Survey resolution admission denies before constructing any network bucket", async () => {
  let calls = 0;
  const surveyModule = validationTestModule(
    "lib/validation/server/surveys.ts",
    (specifier) =>
      specifier.endsWith("release-policy")
        ? {
            assertValidationOperation() {
              throw new Error("validation_disabled");
            },
          }
        : undefined,
  );
  const Service = surveyModule.SurveyService as new (db: unknown) => {
    resolve: (token: string, network: string) => Promise<unknown>;
  };
  await assert.rejects(
    new Service({
      rpc: async () => {
        calls++;
        throw new Error("privileged call");
      },
    }).resolve("a".repeat(43), "synthetic-network"),
    /validation_disabled/,
  );
  assert.equal(calls, 0);
});
