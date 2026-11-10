import assert from "node:assert/strict";
import test from "node:test";
import { validationTestModule } from "./support/validation-module.ts";

const contracts = validationTestModule("lib/validation/server/contracts.ts");
const { body } = validationTestModule(
  "lib/validation/server/http.ts",
  (specifier) => (specifier === "./contracts" ? contracts : {}),
) as { body(request: Request): Promise<unknown> };
const payload = (bytes: number) => JSON.stringify({ x: "a".repeat(bytes - 8) });
const error = (status: number, message: string) => ({
  status,
  code: "invalid_request",
  message,
});
const oversized = error(413, "Request body is too large.");
const invalid = error(400, "Request body must be valid JSON.");

for (const size of [63_999, 64_000, 64_001]) {
  for (const header of [undefined, "1", String(size)]) {
    test(`actual bytes=${size}, Content-Length=${String(header)}`, async () => {
      const raw = payload(size);
      assert.equal(Buffer.byteLength(raw), size);
      const request = new Request("http://offline.invalid", {
        method: "POST",
        body: raw,
        headers: header === undefined ? {} : { "content-length": header },
      });
      if (size > 64_000) await assert.rejects(body(request), oversized);
      else assert.deepEqual(await body(request), JSON.parse(raw));
    });
  }
}
test("counts UTF-8 bytes, including a multibyte character split across chunks", async () => {
  const raw = JSON.stringify({ text: "é😀" });
  const bytes = new TextEncoder().encode(raw);
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === bytes.length) controller.close();
      else controller.enqueue(bytes.slice(index, ++index));
    },
  });
  assert.deepEqual(
    await body(
      new Request("http://offline.invalid", {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit),
    ),
    { text: "é😀" },
  );
  const tooManyBytes = JSON.stringify({ x: "😀".repeat(16_000) });
  assert.ok(tooManyBytes.length < 64_000);
  await assert.rejects(
    body(
      new Request("http://offline.invalid", {
        method: "POST",
        body: tooManyBytes,
        headers: { "content-length": "1" },
      }),
    ),
    oversized,
  );
});
test("stops and cancels at the first chunk beyond budget without parsing JSON", async () => {
  let reads = 0,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        reads++;
        controller.enqueue(new Uint8Array(reads === 1 ? 64_000 : 1));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("http://offline.invalid", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(body(request), oversized);
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
  assert.equal(request.body!.locked, false);
});
test("oversized declared length cancels before reading", async () => {
  let reads = 0,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        reads++;
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  await assert.rejects(
    body(
      new Request("http://offline.invalid", {
        method: "POST",
        body: stream,
        duplex: "half",
        headers: { "content-length": "64001" },
      } as RequestInit),
    ),
    oversized,
  );
  assert.equal(reads, 0);
  assert.equal(cancelled, true);
});
for (const raw of ["", "{private-evidence-sentinel", "null trailing"]) {
  test(`malformed input stays a safe 400 (${raw.length} bytes)`, async () => {
    await assert.rejects(
      body(
        new Request("http://offline.invalid", { method: "POST", body: raw }),
      ),
      invalid,
    );
  });
}
test("read failure is sanitized and releases the stream", async () => {
  const request = new Request("http://offline.invalid", {
    method: "POST",
    duplex: "half",
    body: new ReadableStream({
      pull(controller) {
        controller.error(new Error("private-stream-sentinel"));
      },
    }),
  } as RequestInit);
  await assert.rejects(body(request), invalid);
  assert.equal(request.body!.locked, false);
});
test("invalid length cannot disable byte enforcement; JSON scalars remain valid", async () => {
  await assert.rejects(
    body(
      new Request("http://offline.invalid", {
        method: "POST",
        body: payload(64_001),
        headers: { "content-length": "unknown" },
      }),
    ),
    oversized,
  );
  for (const value of [null, true, 42, "text", [1, 2]]) {
    assert.deepEqual(
      await body(
        new Request("http://offline.invalid", {
          method: "POST",
          body: JSON.stringify(value),
        }),
      ),
      value,
    );
  }
});
