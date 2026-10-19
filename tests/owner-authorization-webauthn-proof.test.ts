import assert from "node:assert/strict";
import { createPublicKey, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { encodeIntent } from "../security/owner-authorization/intent-codec.ts";
import {
  deriveWebAuthnChallenge,
  verifyWebAuthnProof,
} from "../security/owner-authorization/webauthn-proof.ts";

// Fixed public keys and precomputed standard ES256 signatures: no randomness,
// private keys, authenticators, clock, credentials or network needed at test time.
const data = JSON.parse(
  readFileSync(
    new URL("./support/owner-webauthn-fixtures.json", import.meta.url),
    "utf8",
  ),
);
function fixture(name = "valid") {
  const intent = { ...data.intent };
  const bytes = Buffer.from(encodeIntent(intent, 1050));
  const raw = data.fixtures[name];
  const assertion = {
    type: "public-key",
    credentialId: Buffer.from(intent.credential_id, "base64url"),
    response: {
      clientDataJSON: Buffer.from(raw.clientDataJSON, "base64url"),
      authenticatorData: Buffer.from(raw.authenticatorData, "base64url"),
      signature: Buffer.from(raw.signature, "base64url"),
      userHandle: Buffer.from("synthetic-user") as Buffer | null,
    },
  };
  const context = {
    expectedIntent: intent,
    now: 1050,
    origin: "https://owner.example.test",
    rpId: "owner.example.test",
    registry: {
      ownerSubject: intent.owner_subject,
      ownerId: intent.owner_id,
      epoch: 2,
      status: "active",
      credential: {
        id: Buffer.from(intent.credential_id, "base64url"),
        type: "public-key",
        algorithm: -7,
        publicKey: createPublicKey(data.publicKey),
        userHandle: Buffer.from("synthetic-user"),
        status: "active",
        epoch: 2,
      },
    },
  };
  return { bytes, assertion, context };
}
type Fixture = ReturnType<typeof fixture>;
const check = (f: Fixture) =>
  verifyWebAuthnProof(f.bytes, f.assertion, f.context);
const rejects = (fn: () => unknown) =>
  assert.throws(fn, /^Error: Invalid WebAuthn proof$/);
test("fixed standard WebAuthn assertion returns only frozen disabled proof result; replay remains possible", () => {
  const f = fixture();
  const result = check(f);
  assert.deepEqual(result, {
    kind: "webauthn-proof-only",
    productionAuthorization: "disabled",
  });
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(check(f), result);
  f.assertion.response.userHandle = null;
  assert.deepEqual(check(f), result);
});
test("challenge known answer binds domain and complete canonical bytes", () => {
  const f = fixture();
  assert.equal(
    deriveWebAuthnChallenge(f.bytes, 1050).toString("base64url"),
    data.challenge,
  );
  assert.equal(
    data.challenge,
    createHash("sha256")
      .update(
        Buffer.concat([
          Buffer.from("SaaSScout:owner-webauthn-challenge:v1\n"),
          f.bytes,
        ]),
      )
      .digest("base64url"),
  );
  for (const [field, value] of Object.entries({
    audience: "other:deployment",
    owner_subject: "independent:other",
    owner_id: "44444444-4444-4444-8444-444444444444",
    evidence_promotion_id: "44444444-4444-4444-8444-444444444444",
    revision: 8,
    registry_epoch: 3,
    credential_id: "YWJj",
    request_id: "44444444-4444-4444-8444-444444444444",
    server_challenge: Buffer.alloc(32, 2).toString("base64url"),
    issued_at: 1001,
    expires_at: 1299,
    context_digest: "b".repeat(64),
  })) {
    const bytes = Buffer.from(
      encodeIntent({ ...data.intent, [field]: value }, 1050),
    );
    assert.notEqual(
      deriveWebAuthnChallenge(bytes, 1050).toString("base64url"),
      data.challenge,
    );
    rejects(() => verifyWebAuthnProof(bytes, f.assertion, f.context));
  }
});
for (const name of [
  "wrong challenge",
  "wrong origin",
  "wrong type",
  "cross origin",
  "missing UP",
  "missing UV",
  "wrong RP hash",
  "reserved flags",
  "backup flags",
  "attacker",
])
  test(`genuinely signed negative fixture: ${name}`, () =>
    rejects(() => check(fixture(name))));
const cases: [string, (f: Fixture) => void][] = [
  [
    "invalid signature",
    (f) => {
      f.assertion.response.signature[10] ^= 1;
    },
  ],
  [
    "tampered intent with updated expected context still fails challenge",
    (f) => {
      f.context.expectedIntent.context_digest = "b".repeat(64);
      f.bytes = Buffer.from(encodeIntent(f.context.expectedIntent, 1050));
    },
  ],
  [
    "wrong configured origin",
    (f) => {
      f.context.origin = "https://other.owner.example.test";
    },
  ],
  [
    "wrong configured RP",
    (f) => {
      f.context.rpId = "example.test";
    },
  ],
  [
    "inconsistent origin/RP",
    (f) => {
      f.context.rpId = "evil.test";
    },
  ],
  [
    "HTTP origin",
    (f) => {
      f.context.origin = "http://owner.example.test";
    },
  ],
  [
    "wrong credential ID",
    (f) => {
      f.assertion.credentialId = Buffer.from("other");
    },
  ],
  [
    "wrong user handle",
    (f) => {
      f.assertion.response.userHandle = Buffer.from("other");
    },
  ],
  [
    "unsupported algorithm",
    (f) => {
      f.context.registry.credential.algorithm = -257;
    },
  ],
  [
    "wrong key algorithm",
    (f) => {
      f.context.registry.credential.publicKey = createPublicKey({
        format: "jwk",
        key: {
          kty: "OKP",
          crv: "Ed25519",
          x: Buffer.alloc(32, 1).toString("base64url"),
        },
      });
    },
  ],
  [
    "unexpected credential type",
    (f) => {
      f.assertion.type = "password";
    },
  ],
  [
    "unexpected enrolled type",
    (f) => {
      f.context.registry.credential.type = "password";
    },
  ],
  [
    "short auth data",
    (f) => {
      f.assertion.response.authenticatorData = Buffer.alloc(36);
    },
  ],
  [
    "trailing auth data",
    (f) => {
      f.assertion.response.authenticatorData = Buffer.concat([
        f.assertion.response.authenticatorData,
        Buffer.from([0]),
      ]);
    },
  ],
  [
    "expired",
    (f) => {
      f.context.now = 1300;
    },
  ],
  [
    "future intent",
    (f) => {
      f.context.now = 999;
    },
  ],
  [
    "wrong owner mapping",
    (f) => {
      f.context.registry.ownerId = "44444444-4444-4444-8444-444444444444";
    },
  ],
  [
    "wrong subject mapping",
    (f) => {
      f.context.registry.ownerSubject = "independent:other";
    },
  ],
  [
    "wrong registry epoch",
    (f) => {
      f.context.registry.epoch = 3;
    },
  ],
  [
    "wrong credential epoch",
    (f) => {
      f.context.registry.credential.epoch = 3;
    },
  ],
  [
    "revoked credential",
    (f) => {
      f.context.registry.credential.status = "revoked";
    },
  ],
  [
    "inactive credential",
    (f) => {
      f.context.registry.credential.status = "inactive";
    },
  ],
  [
    "pending recovery",
    (f) => {
      f.context.registry.status = "pending recovery";
    },
  ],
  [
    "substituted enrolled credential ID",
    (f) => {
      f.context.registry.credential.id = Buffer.from("other");
    },
  ],
  [
    "substituted enrolled key",
    (f) => {
      f.context.registry.credential.publicKey = createPublicKey(
        data.attackerPublicKey,
      );
    },
  ],
  [
    "noncanonical intent",
    (f) => {
      f.bytes = Buffer.concat([f.bytes, Buffer.from("\n")]);
    },
  ],
  [
    "invalid UTF8",
    (f) => {
      f.assertion.response.clientDataJSON = Buffer.from([0xff]);
    },
  ],
];
for (const [name, mutate] of cases)
  test(name, () => {
    const f = fixture();
    mutate(f);
    rejects(() => check(f));
  });
test("malformed DER signatures reject", () => {
  for (const signature of [
    Buffer.alloc(0),
    Buffer.alloc(64),
    Buffer.from("3006020100020101", "hex"),
    Buffer.from("300702020001020101", "hex"),
    Buffer.from("3006020180020101", "hex"),
    Buffer.from("300602010102010100", "hex"),
  ]) {
    const f = fixture();
    f.assertion.response.signature = signature;
    rejects(() => check(f));
  }
});
test("all required fields fail closed when absent", () => {
  const paths = [[], ["response"]];
  for (const path of paths) {
    const source = path.length
      ? fixture().assertion.response
      : fixture().assertion;
    for (const key of Object.keys(source)) {
      const f = fixture();
      const target = path.length ? f.assertion.response : f.assertion;
      Reflect.deleteProperty(target, key);
      rejects(() => check(f));
    }
  }
  for (const part of ["context", "registry", "credential"] as const) {
    const f = fixture();
    const source =
      part === "context"
        ? f.context
        : part === "registry"
          ? f.context.registry
          : f.context.registry.credential;
    for (const key of Object.keys(source)) {
      const g = fixture();
      const target =
        part === "context"
          ? g.context
          : part === "registry"
            ? g.context.registry
            : g.context.registry.credential;
      Reflect.deleteProperty(target, key);
      rejects(() => check(g));
    }
  }
  rejects(() =>
    verifyWebAuthnProof(fixture().bytes, fixture().assertion, undefined),
  );
});
test("service-role/internal-test claims and caller trust overrides cannot supply proof", () => {
  for (const identity of ["service_role", "internal_tester"]) {
    const f = fixture();
    rejects(() => verifyWebAuthnProof(f.bytes, identity, f.context));
    rejects(() =>
      verifyWebAuthnProof(
        f.bytes,
        { ...f.assertion, role: identity, verified: true },
        f.context,
      ),
    );
    rejects(() =>
      verifyWebAuthnProof(
        Buffer.from(
          encodeIntent({ ...data.intent, owner_subject: identity }, 1050),
        ),
        f.assertion,
        f.context,
      ),
    );
    rejects(() =>
      verifyWebAuthnProof(
        f.bytes,
        { ...f.assertion, credential: f.context.registry.credential },
        f.context,
      ),
    );
  }
});
test("wrong binary types, accessors and untrusted extra fields reject", () => {
  const f = fixture();
  for (const value of [null, {}, "binary", new ArrayBuffer(37)])
    rejects(() => verifyWebAuthnProof(value, f.assertion, f.context));
  rejects(() =>
    verifyWebAuthnProof(
      f.bytes,
      Object.defineProperty({ ...f.assertion }, "type", {
        get() {
          throw new Error("must not invoke");
        },
      }),
      f.context,
    ),
  );
  rejects(() =>
    verifyWebAuthnProof(
      f.bytes,
      { ...f.assertion, publicKey: data.attackerPublicKey },
      f.context,
    ),
  );
  for (const field of [
    "signature",
    "authenticatorData",
    "clientDataJSON",
    "userHandle",
  ])
    rejects(() =>
      verifyWebAuthnProof(
        f.bytes,
        {
          ...f.assertion,
          response: { ...f.assertion.response, [field]: "not bytes" },
        },
        f.context,
      ),
    );
});
