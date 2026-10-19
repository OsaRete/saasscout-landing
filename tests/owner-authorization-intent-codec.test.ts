import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeIntent,
  decodeIntent,
  decodeBoundIntent,
} from "../security/owner-authorization/intent-codec.ts";

const intent = {
  version: 1,
  audience: "saasscout:synthetic-project:deployment-1",
  owner_subject: "independent:synthetic-owner",
  owner_id: "11111111-1111-4111-8111-111111111111",
  evidence_promotion_id: "22222222-2222-4222-8222-222222222222",
  operation: "withdraw",
  revision: 7,
  registry_epoch: 2,
  credential_id: Buffer.from("synthetic-credential").toString("base64url"),
  request_id: "33333333-3333-4333-8333-333333333333",
  server_challenge: Buffer.alloc(32, 1).toString("base64url"),
  issued_at: 1000,
  expires_at: 1300,
  context_digest: "a".repeat(64),
};
const now = 1050;
const wire = () => encodeIntent(intent, now);
const rejects = (fn: () => unknown) =>
  assert.throws(fn, /^Error: Invalid authorization intent$/);

test("valid intent round trips, is frozen and deterministically ordered", () => {
  const reverse = Object.fromEntries(Object.entries(intent).reverse());
  assert.equal(encodeIntent(reverse, now), wire());
  assert.equal(
    wire(),
    "SaaSScout:production-owner-authorization:v1\n" + JSON.stringify(intent),
  );
  assert.deepEqual(decodeIntent(wire(), now), intent);
  assert.ok(Object.isFrozen(decodeBoundIntent(wire(), intent, now)));
});

for (const [field, replacement] of Object.entries({
  owner_subject: "independent:other-owner",
  owner_id: "44444444-4444-4444-8444-444444444444",
  evidence_promotion_id: "44444444-4444-4444-8444-444444444444",
  revision: 8,
  registry_epoch: 3,
  credential_id: "YWJj",
  request_id: "44444444-4444-4444-8444-444444444444",
  server_challenge: Buffer.alloc(32, 2).toString("base64url"),
  audience: "other:deployment",
  issued_at: 1001,
  expires_at: 1299,
  context_digest: "b".repeat(64),
}))
  test(`substitution/tampering of ${field} fails exact binding`, () => {
    const changed = { ...intent, [field]: replacement };
    rejects(() => decodeBoundIntent(encodeIntent(changed, now), intent, now));
    rejects(() => decodeBoundIntent(wire(), changed, now));
  });

for (const field of Object.keys(intent))
  test(`missing ${field} fails`, () => {
    const p: Record<string, unknown> = { ...intent };
    delete p[field];
    rejects(() => encodeIntent(p, now));
  });

for (const patch of [
  { version: 2 },
  { version: "1" },
  { operation: "revoke" },
  { operation: "rotate-key" },
  { operation: "Withdraw" },
  { owner_id: "service_role" },
  { owner_id: "internal_tester" },
  { owner_id: intent.owner_id.toUpperCase().replace("1111", "ABCD") },
  { owner_subject: "owner\nother" },
  { audience: "" },
  { revision: -1 },
  { revision: "7" },
  { registry_epoch: Number.MAX_SAFE_INTEGER + 1 },
  { issued_at: NaN },
  { issued_at: Infinity },
  { issued_at: 1000.5 },
  { issued_at: -1 },
  { issued_at: "1000" },
  { expires_at: 1000 },
  { expires_at: 1301 },
  { server_challenge: "x" },
  { server_challenge: intent.server_challenge + "=" },
  { server_challenge: Buffer.alloc(31).toString("base64url") },
  { credential_id: "a" },
  { credential_id: "" },
  { context_digest: "A".repeat(64) },
  { role: "service_role" },
  { internal_tester: true },
  { authorized: true },
  { signature: "synthetic" },
  { public_key: "synthetic" },
])
  test(`malformed/unsupported fields fail: ${JSON.stringify(patch)}`, () => {
    rejects(() => encodeIntent({ ...intent, ...patch }, now));
    const raw =
      "SaaSScout:production-owner-authorization:v1\n" +
      JSON.stringify({ ...intent, ...patch });
    rejects(() => decodeIntent(raw, now));
  });

test("negative zero is rejected before JSON normalization", () => {
  rejects(() => encodeIntent({ ...intent, revision: -0 }, now));
  rejects(() =>
    decodeIntent(wire().replace('"revision":7', '"revision":-0'), now),
  );
});

test("strict wire rejects duplicates, alternate numbers, whitespace, ordering and domain", () => {
  for (const raw of [
    wire().replace('"version":1', '"version":1,"version":1'),
    wire().replace('"revision":7', '"revision":7.0'),
    wire().replace('"revision":7', '"revision":7e0'),
    wire() + "\n",
    " " + wire(),
    wire().replace("production-owner", "owner"),
    wire().replace(
      JSON.stringify(intent),
      JSON.stringify(Object.fromEntries(Object.entries(intent).reverse())),
    ),
    "{",
    "x".repeat(4097),
    null,
    {},
  ])
    rejects(() => decodeIntent(raw, now));
});

test("explicit clock: issuance inclusive, expiry exclusive, no skew allowance", () => {
  assert.deepEqual(decodeIntent(wire(), 1000), intent);
  assert.deepEqual(decodeIntent(wire(), 1299), intent);
  for (const clock of [999, 1300, 1301, NaN, Infinity, -1, 1000.5]) {
    rejects(() => decodeIntent(wire(), clock));
    rejects(() => encodeIntent(intent, clock));
  }
});

test("non-data objects, accessors and hidden or symbol fields fail closed", () => {
  for (const p of [
    null,
    [],
    Object.create(intent),
    Object.defineProperty({ ...intent }, "hidden", { value: true }),
    { ...intent, [Symbol("authority")]: true },
    Object.defineProperty({ ...intent }, "owner_id", {
      get() {
        throw new Error("must not invoke");
      },
    }),
  ])
    rejects(() => encodeIntent(p, now));
});

test("service/internal identities confer no authority; syntactically valid impostors remain unauthenticated", () => {
  for (const role of ["service_role", "internal_tester"]) {
    rejects(() =>
      decodeBoundIntent(
        encodeIntent({ ...intent, owner_subject: role }, now),
        intent,
        now,
      ),
    );
    rejects(() => encodeIntent({ ...intent, role }, now));
  }
  // Anybody can encode a claim, even with copied exact fields. There is NO proof
  // verification or authorization result in this codec, nor any replay claim.
  assert.deepEqual(decodeBoundIntent(wire(), intent, now), intent);
  assert.deepEqual(decodeBoundIntent(wire(), intent, now), intent);
});
