import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createSignedAuthorization } from "./authorization.mjs";
import {
  createSimulatedExternalAuthority,
  createProtectedKeyAuthority,
  keyFingerprint,
  LIFECYCLE_AUDIENCE,
} from "./key-lifecycle.mjs";
function fixture(enroll = true) {
  const owner = generateKeyPairSync("ed25519");
  const next = generateKeyPairSync("ed25519");
  const attacker = generateKeyPairSync("ed25519");
  const external = createSimulatedExternalAuthority();
  const authority = createProtectedKeyAuthority({
    readExternalDecision: external.read,
    now: () => 1050,
  });
  const decision = (
    action,
    expected_version,
    key = null,
    owner_id = "synthetic-owner",
    decision_id = `${action}-${expected_version}`,
  ) => external.issue({ action, expected_version, key, owner_id, decision_id });
  const payload = {
    version: 1,
    owner_id: "synthetic-owner",
    evidence_promotion_id: "synthetic-evidence",
    operation: "withdraw",
    revision: 7,
    request_id: "synthetic-withdraw",
    audience: "synthetic-withdrawal",
    issued_at: 1000,
    expires_at: 1100,
  };
  const withdrawal = (key = owner.privateKey, changes = {}) =>
    createSignedAuthorization({ ...payload, ...changes }, key);
  const rotation = (
    key = owner.privateKey,
    changes = {},
    nextKey = next.publicKey,
  ) => ({
    nextKey,
    authorization: createSignedAuthorization(
      {
        ...payload,
        operation: "rotate-key",
        revision: 1,
        audience: LIFECYCLE_AUDIENCE,
        request_id: "synthetic-rotate",
        evidence_promotion_id: keyFingerprint(nextKey),
        ...changes,
      },
      key,
    ),
  });
  if (enroll) authority.enroll(decision("enroll", 0, owner.publicKey));
  return {
    authority,
    decision,
    owner,
    next,
    attacker,
    withdrawal,
    rotation,
    verify: authority.verifier(payload),
  };
}
test("authorized external enrollment activates the exact owner and key", async () => {
  const f = fixture();
  await f.verify(f.withdrawal());
  assert.equal(f.authority.audit()[0].key_state, "active");
  assert.equal(f.authority.audit()[0].version, 1);
});
for (const impostor of [
  {},
  { approved: true, owner_id: "synthetic-owner" },
  { service_role: "SYNTHETIC-ONLY" },
  { auth_admin: true },
  { email_recovered: true },
]) {
  test(`caller claims cannot enroll or authorize recovery: ${JSON.stringify(impostor)}`, () => {
    const f = fixture(false);
    assert.throws(() => f.authority.enroll(impostor));
    assert.throws(() => f.authority.recover(impostor));
    assert.deepEqual(f.authority.audit(), []);
  });
}
test("service-role key substitution and forged owner IDs fail", async () => {
  const f = fixture();
  await assert.rejects(
    f.verify({
      ...f.withdrawal(f.attacker.privateKey),
      public_key: f.attacker.publicKey,
      service_role: "SYNTHETIC",
    }),
  );
  await assert.rejects(f.verify(f.withdrawal(f.attacker.privateKey)));
  await assert.rejects(
    f.verify(
      f.withdrawal(f.owner.privateKey, { owner_id: "synthetic-victim" }),
    ),
  );
  assert.throws(() =>
    f.authority.rotate(
      f.rotation(f.owner.privateKey, { owner_id: "synthetic-victim" }),
    ),
  );
  // A genuine decision for a different owner cannot enroll the victim.
  f.authority.enroll(
    f.decision(
      "enroll",
      0,
      f.attacker.publicKey,
      "synthetic-other",
      "other-enrollment",
    ),
  );
  await assert.rejects(f.verify(f.withdrawal(f.attacker.privateKey)));
  await f.verify(f.withdrawal());
});
test("active owner rotation succeeds; old key fails and new key verifies through existing verifier", async () => {
  const f = fixture();
  f.authority.rotate(f.rotation());
  await assert.rejects(f.verify(f.withdrawal()));
  await f.verify(f.withdrawal(f.next.privateKey));
  assert.deepEqual(
    f.authority.audit().map((e) => [e.version, e.key_state]),
    [
      [1, "active"],
      [2, "revoked"],
      [2, "active"],
    ],
  );
  assert.throws(() =>
    f.authority.rotate(
      f.rotation(
        f.owner.privateKey,
        { revision: 2, request_id: "old-key" },
        f.attacker.publicKey,
      ),
    ),
  );
});
test("unrelated signature, altered replacement and stale version cannot rotate", () => {
  const f = fixture();
  assert.throws(() => f.authority.rotate(f.rotation(f.attacker.privateKey)));
  assert.throws(() =>
    f.authority.rotate({ ...f.rotation(), nextKey: f.attacker.publicKey }),
  );
  assert.throws(() =>
    f.authority.rotate(f.rotation(f.owner.privateKey, { revision: 0 })),
  );
  assert.equal(f.authority.audit().length, 1);
});
test("pending recovery disables withdrawal and rotation; independent recovery records history", async () => {
  const f = fixture();
  const signedBefore = f.withdrawal();
  f.authority.beginRecovery(f.decision("begin-recovery", 1));
  await assert.rejects(f.verify(signedBefore));
  assert.throws(() => f.authority.rotate(f.rotation()));
  for (const fake of [
    undefined,
    {},
    { approved: true },
    { service_role: "SYNTHETIC" },
    { auth_admin: true },
    { email_recovered: true },
  ])
    assert.throws(() => f.authority.recover(fake));
  assert.throws(() =>
    f.authority.recover(f.decision("recover", 1, f.next.publicKey)),
  );
  const recovery = f.decision("recover", 2, f.next.publicKey);
  f.authority.recover(recovery);
  assert.throws(() => f.authority.recover(recovery));
  await assert.rejects(f.verify(signedBefore));
  await f.verify(f.withdrawal(f.next.privateKey));
  const audit = f.authority.audit();
  assert.deepEqual(
    audit.map((e) => [e.version, e.previous_version, e.key_state]),
    [
      [1, 0, "active"],
      [2, 1, "pending recovery"],
      [3, 2, "revoked"],
      [3, 2, "active"],
    ],
  );
  assert.equal(audit.at(-1).decision_id, "recover-2");
  assert.throws(() => {
    audit.at(-1).key_state = "active-for-attacker";
  });
  assert.throws(() =>
    f.authority.rotate(
      f.rotation(
        f.next.privateKey,
        { revision: 3, request_id: "resurrect" },
        f.owner.publicKey,
      ),
    ),
  );
});
test("silent recovery replacement and duplicate enrollment fail", () => {
  const f = fixture();
  assert.throws(() =>
    f.authority.recover(f.decision("recover", 1, f.next.publicKey)),
  );
  assert.throws(() =>
    f.authority.enroll(f.decision("enroll", 1, f.attacker.publicKey)),
  );
});
test("replayed and concurrent conflicting transitions have exactly one winner", async () => {
  const f = fixture();
  const first = f.rotation();
  const second = f.rotation(
    f.owner.privateKey,
    { request_id: "conflict" },
    f.attacker.publicKey,
  );
  const results = await Promise.allSettled(
    Array.from({ length: 32 }, (_, i) =>
      Promise.resolve().then(() => f.authority.rotate(i % 2 ? first : second)),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.authority.audit().length, 3);
  assert.throws(() => f.authority.rotate(first));
  assert.throws(() => f.authority.rotate(second));
});
test("external decisions are issuer-specific, exact-version and single-use", () => {
  const f = fixture(false);
  const token = f.decision("enroll", 0, f.owner.publicKey);
  assert.throws(() => f.authority.enroll({ ...token }));
  const otherIssuer = createSimulatedExternalAuthority();
  assert.throws(() =>
    f.authority.enroll(
      otherIssuer.issue({
        action: "enroll",
        owner_id: "synthetic-owner",
        key: f.attacker.publicKey,
        expected_version: 0,
        decision_id: "fake",
      }),
    ),
  );
  f.authority.enroll(token);
  assert.throws(() => f.authority.enroll(token));
});
test("withdrawal replay remains shared across verifier instances after rotation", async () => {
  const f = fixture();
  await f.verify(f.withdrawal());
  f.authority.rotate(f.rotation());
  await assert.rejects(f.verify(f.withdrawal(f.next.privateKey)));
});
test("untrusted callers cannot suspend keys; recovery cannot reuse the lost key", () => {
  const f = fixture();
  assert.throws(() =>
    f.authority.beginRecovery({ owner_id: "synthetic-owner", lost: true }),
  );
  f.authority.beginRecovery(f.decision("begin-recovery", 1));
  assert.throws(() =>
    f.authority.recover(f.decision("recover", 2, f.owner.publicKey)),
  );
  assert.equal(f.authority.audit().at(-1).key_state, "pending recovery");
});
test("conflicting independent recovery decisions permit one replacement only", async () => {
  const f = fixture();
  f.authority.beginRecovery(f.decision("begin-recovery", 1));
  const decisions = [
    f.decision("recover", 2, f.next.publicKey, "synthetic-owner", "recovery-a"),
    f.decision(
      "recover",
      2,
      f.attacker.publicKey,
      "synthetic-owner",
      "recovery-b",
    ),
  ];
  const results = await Promise.allSettled(
    decisions.map((d) => Promise.resolve().then(() => f.authority.recover(d))),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.authority.audit().length, 4);
});
test("rotation rejects expired, future, wrong-audience and wrong-operation proof", () => {
  const f = fixture();
  for (const changes of [
    { issued_at: 950, expires_at: 1050 },
    { issued_at: 1060 },
    { audience: "synthetic-withdrawal" },
    { operation: "withdraw" },
  ])
    assert.throws(() =>
      f.authority.rotate(f.rotation(f.owner.privateKey, changes)),
    );
  assert.equal(f.authority.audit().length, 1);
});
