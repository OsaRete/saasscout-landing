import assert from "node:assert/strict";
import { generateKeyPairSync, createHmac, sign } from "node:crypto";
import test from "node:test";
import {
  canonicalPayload,
  createSignedAuthorization,
  createTestOnlyAtomicReplayStore,
  createVerifier,
} from "./authorization.mjs";

// Synthetic identities only; keys exist solely in memory and are never exported.
function fixture() {
  const owner = generateKeyPairSync("ed25519");
  const other = generateKeyPairSync("ed25519");
  const payload = {
    version: 1,
    owner_id: "synthetic-owner-a",
    evidence_promotion_id: "synthetic-evidence-a",
    operation: "withdraw",
    revision: 7,
    request_id: "synthetic-request-a",
    audience: "saasscout:offline-owner-poc",
    issued_at: 1000,
    expires_at: 1100,
  };
  const enrolledKeys = new Map([
    [payload.owner_id, owner.publicKey],
    ["synthetic-owner-b", other.publicKey],
  ]);
  const expected = { ...payload };
  const replayStore = createTestOnlyAtomicReplayStore();
  const verify = createVerifier({
    enrolledKeys,
    expected,
    replayStore,
    now: () => 1050,
  });
  return {
    owner,
    other,
    payload,
    enrolledKeys,
    expected,
    replayStore,
    verify,
    signed: (changes = {}, key = owner.privateKey) =>
      createSignedAuthorization({ ...payload, ...changes }, key),
  };
}
const rejected = (verify, auth) =>
  assert.rejects(verify(auth), /^Error: Invalid owner authorization$/);

test("valid owner authorization succeeds and returns bound intent", async () => {
  const f = fixture();
  assert.deepEqual(await f.verify(f.signed()), f.payload);
});

test("canonical v1 bytes are deterministic and explicit", () => {
  const f = fixture();
  const reversed = Object.fromEntries(Object.entries(f.payload).reverse());
  assert.equal(
    canonicalPayload(reversed),
    '{"version":1,"owner_id":"synthetic-owner-a","evidence_promotion_id":"synthetic-evidence-a","operation":"withdraw","revision":7,"request_id":"synthetic-request-a","audience":"saasscout:offline-owner-poc","issued_at":1000,"expires_at":1100}',
  );
  assert.deepEqual(
    f.signed(),
    createSignedAuthorization(reversed, f.owner.privateKey),
  );
});

test("another owner's key cannot sign for the enrolled owner", async () => {
  const f = fixture();
  await rejected(f.verify, f.signed({}, f.other.privateKey));
});

for (const [field, value] of Object.entries({
  owner_id: "synthetic-owner-b",
  evidence_promotion_id: "synthetic-evidence-b",
  operation: "revoke",
  revision: 8,
  request_id: "synthetic-request-b",
  audience: "other-audience",
  issued_at: 1001,
  expires_at: 1099,
})) {
  test(`tampered ${field} fails signature verification`, async () => {
    const f = fixture();
    const auth = f.signed();
    await rejected(f.verify, {
      ...auth,
      payload: canonicalPayload({ ...f.payload, [field]: value }),
    });
  });
}

for (const [label, changes, useOtherKey] of [
  [
    "another enrolled owner targeting this evidence",
    { owner_id: "synthetic-owner-b" },
    true,
  ],
  ["wrong evidence binding", { evidence_promotion_id: "synthetic-evidence-b" }],
  ["wrong operation", { operation: "revoke" }],
  ["wrong revision", { revision: 6 }],
  ["wrong audience", { audience: "other-audience" }],
  ["expired at boundary", { issued_at: 950, expires_at: 1050 }],
  ["already expired", { issued_at: 900, expires_at: 1000 }],
  ["future issuance", { issued_at: 1060, expires_at: 1100 }],
]) {
  test(`correct signature still rejects ${label}`, async () => {
    const f = fixture();
    await rejected(
      f.verify,
      f.signed(changes, useOtherKey ? f.other.privateKey : f.owner.privateKey),
    );
  });
}

test("replay fails, including newly signed payload reusing a consumed request ID", async () => {
  const f = fixture();
  await f.verify(f.signed());
  await rejected(f.verify, f.signed());
  await rejected(f.verify, f.signed({ expires_at: 1101 }));
  await f.verify(f.signed({ request_id: "synthetic-request-new" }));
});

test("64 concurrent attempts sharing one atomic store permit exactly one success", async () => {
  const f = fixture();
  const secondVerifier = createVerifier({
    enrolledKeys: f.enrolledKeys,
    expected: f.expected,
    replayStore: f.replayStore,
    now: () => 1050,
  });
  const auth = f.signed();
  const results = await Promise.allSettled(
    Array.from({ length: 64 }, (_, i) =>
      Promise.resolve().then(() => (i % 2 ? f.verify : secondVerifier)(auth)),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 63);
});

test("synthetic service-role credential alone cannot produce an accepted owner signature", async () => {
  const f = fixture();
  const serviceRole = "SYNTHETIC-ONLY-service_role-NOT-A-REAL-CREDENTIAL";
  assert.throws(() => createSignedAuthorization(f.payload, serviceRole));
  const auth = f.signed();
  await rejected(f.verify, {
    ...auth,
    signature: createHmac("sha512", serviceRole)
      .update(auth.payload)
      .digest("base64url"),
  });
  await rejected(f.verify, f.signed({}, f.other.privateKey));
  // Failed forgeries must not burn the legitimate request ID.
  await f.verify(auth);
});

test("caller cannot substitute a public key or mutate the copied enrollment registry", async () => {
  const f = fixture();
  const forged = f.signed({}, f.other.privateKey);
  await rejected(f.verify, { ...forged, public_key: f.other.publicKey });
  f.enrolledKeys.set(f.payload.owner_id, f.other.publicKey);
  f.expected.owner_id = "synthetic-owner-b";
  await rejected(f.verify, forged);
  await f.verify(f.signed());
});

test("unknown owner fails even with a genuine signature", async () => {
  const f = fixture();
  await rejected(f.verify, f.signed({ owner_id: "synthetic-unknown" }));
});

test("malformed envelopes and signatures fail without consuming request ID", async () => {
  const f = fixture();
  const auth = f.signed();
  for (const bad of [
    null,
    {},
    { payload: auth.payload },
    { ...auth, extra: true },
    { ...auth, payload: "{" },
    { ...auth, payload: "x".repeat(4097) },
    { ...auth, signature: "" },
    { ...auth, signature: "a".repeat(86) },
    { ...auth, signature: auth.signature + "=" },
  ])
    await rejected(f.verify, bad);
  await f.verify(auth);
});

test("malformed payloads fail even when raw bytes are genuinely owner-signed", async () => {
  const f = fixture();
  const bodies = [
    { ...f.payload, version: 2 },
    { ...f.payload, revision: -1 },
    { ...f.payload, revision: "7" },
    { ...f.payload, issued_at: 1000.5 },
    { ...f.payload, expires_at: 999 },
    { ...f.payload, expires_at: 1400 },
    { ...f.payload, owner_id: "" },
    { ...f.payload, audience: null },
    { ...f.payload, owner_id: "owner-\u00e9" },
    { ...f.payload, revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...f.payload, extra: true },
    Object.fromEntries(
      Object.entries(f.payload).filter(([k]) => k !== "request_id"),
    ),
    [],
    null,
  ].map((p) => JSON.stringify(p));
  bodies.push(" " + canonicalPayload(f.payload));
  bodies.push(
    canonicalPayload(f.payload).replace(
      '"version":1',
      '"version":1,"version":1',
    ),
  );
  bodies.push(
    canonicalPayload(f.payload).replace('"revision":7', '"revision":7.0'),
  );
  for (const payload of bodies) {
    const signature = sign(
      null,
      Buffer.from("SaaSScout:owner-authorization:v1\n" + payload),
      f.owner.privateKey,
    ).toString("base64url");
    await rejected(f.verify, { payload, signature });
  }
  await f.verify(f.signed());
});

test("restarting or separating the in-memory store loses replay knowledge (documented limit)", async () => {
  const f = fixture();
  const auth = f.signed();
  await f.verify(auth);
  const restarted = createVerifier({
    enrolledKeys: f.enrolledKeys,
    expected: f.expected,
    replayStore: createTestOnlyAtomicReplayStore(),
    now: () => 1050,
  });
  await restarted(auth);
});
