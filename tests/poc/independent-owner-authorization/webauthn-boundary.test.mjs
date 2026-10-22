import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  openSyntheticRegistry,
  registryTransitionBytes,
  enrollmentConfirmationBytes,
} from "./durable-registry.mjs";
import { createSyntheticWebAuthnBoundary } from "./webauthn-boundary.mjs";
import { digest, registrationChallenge } from "./webauthn-registration.mjs";
import { encodeIntent } from "../../../security/owner-authorization/intent-codec.ts";
import { deriveWebAuthnChallenge } from "../../../security/owner-authorization/webauthn-proof.ts";
const pem = (k) => k.publicKey.export({ type: "spki", format: "pem" });
const b64 = (b) => Buffer.from(b).toString("base64url");
const ed = () => generateKeyPairSync("ed25519");
const ec = () => generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const config = {
  origin: "https://owner.example.test",
  rpId: "owner.example.test",
};
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "synthetic-webauthn-"));
  const roots = [ed(), ed()],
    key = ec(),
    next = ec();
  const ownerId = "11111111-1111-4111-8111-111111111111",
    ownerSubject = "independent:synthetic:owner";
  const options = {
    path: join(dir, "registry.sqlite"),
    ownerId,
    ownerSubject,
    independentKeys: roots.map(pem),
    enabled: true,
    webauthn: config,
  };
  const registry = openSyntheticRegistry({
    ...options,
    create: true,
    now: () => 1050,
  });
  t.after(() => {
    registry.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const boundary = createSyntheticWebAuthnBoundary({
    registry,
    webauthn: config,
    now: () => 1050,
    enabled: true,
  });
  const credential = (k = key, id = "credential") => ({
    id: b64(id),
    publicKey: pem(k),
    userHandle: b64("synthetic-owner"),
  });
  function assertion(k, id, challenge, overrides = {}) {
    const cd = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge,
        origin: config.origin,
        crossOrigin: false,
        ...overrides.client,
      }),
    );
    const ad = Buffer.concat([
      digest(overrides.rpId || config.rpId),
      Buffer.from([overrides.flags ?? 5]),
      Buffer.alloc(4),
    ]);
    return {
      type: "public-key",
      credentialId: Buffer.from(id, "base64url"),
      response: {
        clientDataJSON: cd,
        authenticatorData: ad,
        signature: sign(
          "sha256",
          Buffer.concat([ad, digest(cd)]),
          k.privateKey,
        ),
        userHandle: Buffer.from("synthetic-owner"),
      },
    };
  }
  function registration(request, k, c, overrides = {}) {
    const jwk = k.publicKey.export({ format: "jwk" });
    const length = Buffer.alloc(2);
    length.writeUInt16BE(Buffer.from(c.id, "base64url").length);
    const auth = Buffer.concat([
      digest(overrides.rpId || config.rpId),
      Buffer.from([overrides.flags ?? 0x45]),
      Buffer.alloc(4 + 16),
      length,
      Buffer.from(c.id, "base64url"),
      Buffer.from("a5010203262001215820", "hex"),
      Buffer.from(jwk.x, "base64url"),
      Buffer.from("225820", "hex"),
      Buffer.from(jwk.y, "base64url"),
    ]);
    const size = Buffer.alloc(2);
    size.writeUInt16BE(auth.length);
    const a = assertion(
      k,
      c.id,
      registrationChallenge(request, "get"),
      overrides.possession,
    );
    return {
      type: "public-key",
      credentialId: c.id,
      clientDataJSON: b64(
        JSON.stringify({
          type: "webauthn.create",
          challenge: registrationChallenge(request, "create"),
          origin: config.origin,
          crossOrigin: false,
          ...overrides.client,
        }),
      ),
      attestationObject: b64(
        Buffer.concat([
          Buffer.from(
            "a363666d74646e6f6e656761747453746d74a068617574684461746159",
            "hex",
          ),
          size,
          auth,
        ]),
      ),
      possession: {
        credentialId: c.id,
        ...Object.fromEntries(
          Object.entries(a.response).map(([n, v]) => [n, b64(v)]),
        ),
      },
    };
  }
  function evidence(
    action = "enroll",
    epoch = 0,
    k = key,
    id = "credential",
    overrides = {},
  ) {
    const c = ["enroll", "rotate", "approve-recovery"].includes(action)
      ? credential(k, id)
      : null;
    const request = registryTransitionBytes({
      version: 1,
      action,
      ownerId,
      ownerSubject,
      expectedEpoch: epoch,
      requestId: `${action}-${epoch}`,
      issuedAt: 1000,
      expiresAt: 1300,
      credential: c,
      ...overrides.request,
    });
    return {
      request,
      approvals: ["enroll", "begin-recovery", "approve-recovery"].includes(
        action,
      )
        ? roots.map((k) => b64(sign(null, Buffer.from(request), k.privateKey)))
        : [],
      ownerProof: ["rotate", "revoke"].includes(action)
        ? b64(sign("sha256", Buffer.from(request), key.privateKey))
        : null,
      possession: c
        ? registration(request, k, c, overrides.registration)
        : null,
    };
  }
  function attempt(patch = {}, k = key, overrides = {}) {
    const intent = {
      version: 1,
      audience: "saasscout:synthetic-possession:v1",
      owner_subject: ownerSubject,
      owner_id: ownerId,
      evidence_promotion_id: "22222222-2222-4222-8222-222222222222",
      operation: "withdraw",
      revision: 0,
      registry_epoch: 1,
      credential_id: b64("credential"),
      request_id: "33333333-3333-4333-8333-333333333333",
      server_challenge: b64(Buffer.alloc(32, 7)),
      issued_at: 1000,
      expires_at: 1300,
      context_digest: "a".repeat(64),
      ...patch,
    };
    const bytes = Buffer.from(encodeIntent(intent, 1050));
    return {
      intent,
      bytes,
      assertion: assertion(
        k,
        intent.credential_id,
        deriveWebAuthnChallenge(bytes, 1050).toString("base64url"),
        overrides,
      ),
    };
  }
  const prove = (a) => boundary.prove(a.bytes, a.assertion, a.intent);
  return {
    dir,
    roots,
    key,
    next,
    options,
    registry,
    boundary,
    credential,
    evidence,
    attempt,
    prove,
    registration,
  };
}
test("disabled by default; independently approved registration binds key/owner; real ES256 possession consumed once", (t) => {
  const f = fixture(t);
  assert.throws(() =>
    createSyntheticWebAuthnBoundary({
      registry: f.registry,
      webauthn: config,
      now: () => 1050,
    }),
  );
  const e = f.evidence();
  f.boundary.register(e);
  assert.equal(
    f.registry.lookup({
      ownerId: f.options.ownerId,
      ownerSubject: f.options.ownerSubject,
      credentialId: b64("credential"),
      epoch: 1,
    }).credential.publicKey,
    pem(f.key),
  );
  assert.deepEqual(f.prove(f.attempt()), {
    kind: "synthetic-possession-only",
    productionAuthorization: "disabled",
  });
  assert.throws(() => f.prove(f.attempt()));
  const reopened = openSyntheticRegistry({ ...f.options, now: () => 1050 });
  try {
    const b = createSyntheticWebAuthnBoundary({
      registry: reopened,
      webauthn: config,
      now: () => 1050,
      enabled: true,
    });
    const a = f.attempt();
    assert.throws(() => b.prove(a.bytes, a.assertion, a.intent));
  } finally {
    reopened.close();
  }
  assert.throws(() => f.boundary.register(e));
});
for (const label of [
  "service_role",
  "internal_tester",
  "arbitrary-owner",
  "foreign-keys",
  "one-approval",
])
  test(`enrollment authority rejects ${label}`, (t) => {
    const f = fixture(t);
    let e = f.evidence();
    if (label === "arbitrary-owner")
      e = f.evidence("enroll", 0, f.key, "credential", {
        request: { ownerId: "44444444-4444-4444-8444-444444444444" },
      });
    else if (label === "foreign-keys")
      e.approvals = [ed(), ed()].map((k) =>
        b64(sign(null, Buffer.from(e.request), k.privateKey)),
      );
    else if (label === "one-approval") e.approvals.pop();
    else e.approvals = [label, label];
    assert.throws(() => f.boundary.register(e));
    assert.equal(f.registry.audit().epoch, 0);
  });
for (const [name, registration] of Object.entries({
  origin: { client: { origin: "https://attacker.example.test" } },
  challenge: { client: { challenge: b64(Buffer.alloc(32)) } },
  type: { client: { type: "webauthn.get" } },
  crossOrigin: { client: { crossOrigin: true } },
  rp: { rpId: "other.example.test" },
  up: { flags: 0x44 },
  uv: { flags: 0x41 },
  backup: { flags: 0x4d },
  possessionOrigin: {
    possession: { client: { origin: "https://attacker.example.test" } },
  },
  possessionChallenge: {
    possession: { client: { challenge: b64(Buffer.alloc(32)) } },
  },
  possessionRP: { possession: { rpId: "other.example.test" } },
  possessionUP: { possession: { flags: 4 } },
  possessionUV: { possession: { flags: 1 } },
}))
  test(`signed registration rejects ${name}`, (t) => {
    const f = fixture(t);
    assert.throws(() =>
      f.boundary.register(
        f.evidence("enroll", 0, f.key, "credential", { registration }),
      ),
    );
    assert.equal(f.registry.audit().epoch, 0);
  });
test("registration rejects substituted COSE key, ID, signature and reused proof for another challenge", (t) => {
  const f = fixture(t),
    e = f.evidence();
  for (const change of [
    (p) => (p.credentialId = b64("unknown")),
    (p) => {
      const b = Buffer.from(p.attestationObject, "base64url");
      b[b.length - 1] ^= 1;
      p.attestationObject = b64(b);
    },
    (p) => (p.possession.signature = b64(Buffer.alloc(70))),
    (p) =>
      (p.possession = f.registration(
        e.request,
        f.next,
        f.credential(),
      ).possession),
  ]) {
    const bad = structuredClone(e);
    change(bad.possession);
    assert.throws(() => f.boundary.register(bad));
  }
  const other = f.evidence("enroll", 0, f.key, "credential", {
    request: { requestId: "different" },
  });
  other.possession = e.possession;
  assert.throws(() => f.boundary.register(other));
  f.boundary.register(e);
});
for (const [name, patch, k, overrides] of [
  ["owner", { owner_id: "44444444-4444-4444-8444-444444444444" }],
  ["subject", { owner_subject: "service_role" }],
  ["epoch", { registry_epoch: 0 }],
  ["unknown credential", { credential_id: b64("unknown") }],
  ["invalid signature", {}, true],
  ["origin", {}, false, { client: { origin: "https://other.example.test" } }],
  ["RP", {}, false, { rpId: "other.example.test" }],
  ["UP", {}, false, { flags: 4 }],
  ["UV", {}, false, { flags: 1 }],
  ["challenge", {}, false, { client: { challenge: b64(Buffer.alloc(32)) } }],
])
  test(`possession rejects ${name} without consuming legitimate challenge`, (t) => {
    const f = fixture(t);
    f.boundary.register(f.evidence());
    assert.throws(() =>
      f.prove(f.attempt(patch, k ? f.next : f.key, overrides)),
    );
    assert.equal(f.prove(f.attempt()).productionAuthorization, "disabled");
  });
for (const action of ["revoke", "rotate", "begin-recovery"])
  test(`${action} rejects stale/current-epoch predecessor and preserves historical registration`, (t) => {
    const f = fixture(t);
    f.boundary.register(f.evidence());
    const old = f.registry.audit();
    const a = f.attempt();
    f.registry.transition(f.evidence(action, 1, f.next, "next"));
    assert.throws(() => f.prove(a));
    assert.throws(() => f.prove(f.attempt({ registry_epoch: 2 })));
    assert.equal(old.history.length, 1);
    assert.equal(
      f.registry.audit().history[0].evidence.request,
      old.history[0].evidence.request,
    );
  });
test("independent process revocation between challenge creation and proof use fails closed", (t) => {
  const f = fixture(t);
  f.boundary.register(f.evidence());
  const a = f.attempt();
  const source = `import {openSyntheticRegistry} from ${JSON.stringify(new URL("./durable-registry.mjs", import.meta.url).href)}; const r=openSyntheticRegistry({...${JSON.stringify(f.options)},now:()=>1050}); r.transition(${JSON.stringify(f.evidence("revoke", 1))});r.close();`;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", source],
    { encoding: "utf8", timeout: 10000 },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.throws(() => f.prove(a));
});

// Real child processes/connections start at a file barrier, then contend on SQLite.
async function race(f, sources) {
  const { spawn } = await import("node:child_process");
  const { existsSync, writeFileSync } = await import("node:fs");
  const go = join(f.dir, "go");
  const ready = sources.map((_, i) => join(f.dir, `ready-${i}`));
  const jobs = sources.map(
    (source, i) =>
      new Promise((resolve, reject) => {
        const prelude = `import {openSyntheticRegistry} from ${JSON.stringify(new URL("./durable-registry.mjs", import.meta.url).href)}; import {createSyntheticWebAuthnBoundary} from ${JSON.stringify(new URL("./webauthn-boundary.mjs", import.meta.url).href)}; import {existsSync,writeFileSync} from 'node:fs'; const r=openSyntheticRegistry({...${JSON.stringify(f.options)},now:()=>1050});const b=createSyntheticWebAuthnBoundary({registry:r,webauthn:${JSON.stringify(config)},now:()=>1050,enabled:true});writeFileSync(${JSON.stringify(ready[i])},'ready');while(!existsSync(${JSON.stringify(go)})) await new Promise(r=>setTimeout(r,5));try{${source};process.exitCode=10}catch{process.exitCode=11}finally{r.close()}`;
        const p = spawn(
          process.execPath,
          [
            "--loader",
            new URL("../../support/server-only-loader.mjs", import.meta.url)
              .pathname,
            "--input-type=module",
            "-e",
            prelude,
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        let err = "";
        p.stderr.on("data", (v) => (err += v));
        const timeout = setTimeout(() => p.kill("SIGKILL"), 10000);
        p.on("error", reject);
        p.on("close", (exit) => {
          clearTimeout(timeout);
          resolve({ exit, err });
        });
      }),
  );
  const deadline = Date.now() + 5000;
  while (!ready.every(existsSync) && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 5));
  const allReady = ready.every(existsSync);
  writeFileSync(go, "go");
  const results = await Promise.all(jobs);
  assert.ok(allReady, JSON.stringify(results));
  return results;
}
function proofSource(a) {
  const wire = {
    ...a.assertion,
    credentialId: b64(a.assertion.credentialId),
    response: Object.fromEntries(
      Object.entries(a.assertion.response).map(([k, v]) => [k, b64(v)]),
    ),
  };
  return `const a=${JSON.stringify(wire)};a.credentialId=Buffer.from(a.credentialId,'base64url');for(const k of Object.keys(a.response))a.response[k]=Buffer.from(a.response[k],'base64url');b.prove(Buffer.from(${JSON.stringify(b64(a.bytes))},'base64url'),a,${JSON.stringify(a.intent)})`;
}
test("two independent processes submit identical proof: one durable winner", async (t) => {
  const f = fixture(t);
  f.boundary.register(f.evidence());
  const source = proofSource(f.attempt());
  const results = await race(f, [source, source]);
  assert.deepEqual(results.map((r) => r.exit).sort(), [10, 11]);
  assert.throws(() => f.prove(f.attempt()));
});
test("proof/revocation race serializes; after revocation no stale mapping is accepted", async (t) => {
  const f = fixture(t);
  f.boundary.register(f.evidence());
  const proof = proofSource(f.attempt());
  const revoke = `r.transition(${JSON.stringify(f.evidence("revoke", 1))})`;
  const results = await race(f, [proof, proof, revoke]);
  assert.equal(results[2].exit, 10, results[2].err);
  assert.ok(results.slice(0, 2).filter((r) => r.exit === 10).length <= 1);
  assert.ok(
    results.every((r) => [10, 11].includes(r.exit)),
    JSON.stringify(results),
  );
  assert.equal(f.registry.audit().epoch, 2);
  assert.throws(() => f.prove(f.attempt()));
});
test("two independently approved registrations at epoch zero have one winner", async (t) => {
  const f = fixture(t);
  const a = f.evidence(),
    b = f.evidence("enroll", 0, f.next, "next", {
      request: { requestId: "second-enrollment" },
    });
  const results = await race(f, [
    `b.register(${JSON.stringify(a)})`,
    `b.register(${JSON.stringify(b)})`,
  ]);
  assert.deepEqual(results.map((r) => r.exit).sort(), [10, 11]);
  assert.equal(f.registry.audit().epoch, 1);
  assert.equal(f.registry.audit().history.length, 1);
});
test("registry-pinned origin cannot be replaced by boundary configuration", (t) => {
  const f = fixture(t);
  f.boundary.register(f.evidence());
  const a = f.attempt();
  const b = createSyntheticWebAuthnBoundary({
    registry: f.registry,
    webauthn: { ...config, origin: "https://other.owner.example.test" },
    now: () => 1050,
    enabled: true,
  });
  assert.throws(() => b.prove(a.bytes, a.assertion, a.intent));
  assert.equal(f.prove(a).productionAuthorization, "disabled");
});

test("proof persistence failure rolls back consumption; changed payload cannot reuse request ID", async (t) => {
  const { DatabaseSync } = await import("node:sqlite");
  const f = fixture(t);
  f.boundary.register(f.evidence());
  const db = new DatabaseSync(f.options.path);
  try {
    db.exec(
      "CREATE TRIGGER proof_unavailable BEFORE INSERT ON possession_uses BEGIN SELECT RAISE(ABORT, 'unavailable'); END",
    );
    assert.throws(() => f.prove(f.attempt()));
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM possession_uses").get().n,
      0,
    );
    db.exec("DROP TRIGGER proof_unavailable");
    f.prove(f.attempt());
    assert.throws(() => f.prove(f.attempt({ context_digest: "b".repeat(64) })));
    assert.throws(() => db.exec("DELETE FROM possession_uses"), /append only/);
    assert.throws(
      () => db.exec("UPDATE possession_uses SET epoch=2"),
      /append only/,
    );
  } finally {
    db.close();
  }
});
test("registration rejects malformed/trailing CBOR, handle substitution and profile downgrade", (t) => {
  const f = fixture(t),
    e = f.evidence();
  for (const change of [
    (p) =>
      (p.attestationObject = b64(
        Buffer.concat([
          Buffer.from(p.attestationObject, "base64url"),
          Buffer.from([0]),
        ]),
      )),
    (p) => {
      const a = Buffer.from(p.attestationObject, "base64url");
      a[0] = 0xa4;
      p.attestationObject = b64(a);
    },
    (p) => (p.possession.userHandle = b64("foreign-owner")),
    (p) => (p.possession.credentialId = b64("unknown")),
  ]) {
    const bad = structuredClone(e);
    change(bad.possession);
    assert.throws(() => f.boundary.register(bad));
  }
  assert.throws(() =>
    openSyntheticRegistry({ ...f.options, webauthn: null, now: () => 1050 }),
  );
  assert.throws(() =>
    openSyntheticRegistry({
      ...f.options,
      webauthn: { ...config, rpId: "example.test" },
      now: () => 1050,
    }),
  );
  f.boundary.register(e);
});

// B2.14: two pinned custodians SIMULATE independent authorization. Keys and
// synthetic WebAuthn responses below are harness data, never identity evidence.
function staged(f, requestId = "two-stage") {
  const request = f.boundary.prepareEnrollment({
    requestId,
    userHandle: b64("synthetic-owner"),
    expiresAt: 1300,
  });
  const authorization = {
    request,
    approvals: f.roots.map((k) =>
      b64(sign(null, Buffer.from(request), k.privateKey)),
    ),
  };
  f.boundary.initiateEnrollment(authorization);
  return {
    request,
    authorization,
    confirmation(k = f.key, id = "credential", overrides = {}) {
      const credential = f.credential(k, id);
      const finalRequest = registryTransitionBytes({
        version: 1,
        action: "enroll",
        ownerId: f.options.ownerId,
        ownerSubject: f.options.ownerSubject,
        expectedEpoch: 0,
        requestId,
        issuedAt: 1050,
        expiresAt: 1300,
        credential,
      });
      return {
        sessionId: requestId,
        credential,
        approvals: f.roots.map((k) =>
          b64(
            sign(
              null,
              Buffer.from(enrollmentConfirmationBytes(request, finalRequest)),
              k.privateKey,
            ),
          ),
        ),
        proof: f.registration(finalRequest, k, credential, {
          ...overrides,
          client: {
            challenge: registrationChallenge(request, "create"),
            ...overrides.client,
          },
        }),
      };
    },
  };
}
test("two-stage initiation precedes credential generation; immutable registration survives restart and replay", (t) => {
  const f = fixture(t),
    s = staged(f);
  assert.ok(!s.request.includes("publicKey"));
  assert.ok(!s.request.includes("credential"));
  assert.equal(f.registry.audit().epoch, 0);
  const generatedAfterInitiation = ec();
  const c = s.confirmation(
    generatedAfterInitiation,
    "created-after-initiation",
  );
  assert.equal(
    f.boundary.confirmEnrollment(c).productionAuthorization,
    "disabled",
  );
  assert.throws(() => f.boundary.confirmEnrollment(c));
  assert.throws(() => f.boundary.initiateEnrollment(s.authorization));
  const history = f.registry.audit();
  assert.equal(history.credentials[0].publicKey, pem(generatedAfterInitiation));
  assert.deepEqual(history.history[0].evidence.ownerProof, s.authorization);
  const r = openSyntheticRegistry({ ...f.options, now: () => 1400 });
  try {
    assert.deepEqual(r.audit(), history);
    assert.throws(() => r.confirmEnrollment(c));
  } finally {
    r.close();
  }
});
for (const [name, override] of [
  ["challenge", { client: { challenge: b64(Buffer.alloc(32)) } }],
  ["origin", { client: { origin: "https://foreign.example.test" } }],
  ["RP ID", { rpId: "foreign.example.test" }],
  ["UP", { flags: 0x44 }],
  ["UV", { flags: 0x41 }],
  [
    "possession signature",
    { possession: { client: { challenge: b64(Buffer.alloc(32)) } } },
  ],
])
  test(`two-stage rejects incorrect ${name} without consuming session`, (t) => {
    const f = fixture(t),
      s = staged(f);
    assert.throws(() =>
      f.boundary.confirmEnrollment(
        s.confirmation(f.key, "credential", override),
      ),
    );
    assert.equal(f.registry.audit().epoch, 0);
    f.boundary.confirmEnrollment(s.confirmation());
  });
test("two-stage rejects wrong owner, subject, origin, purpose and administrative substitution", (t) => {
  const f = fixture(t);
  const request = f.boundary.prepareEnrollment({
    requestId: "authorization",
    userHandle: b64("synthetic-owner"),
    expiresAt: 1300,
  });
  const [domain, body] = request.split("\n");
  for (const patch of [
    { ownerId: "44444444-4444-4444-8444-444444444444" },
    { ownerSubject: "service_role" },
    { purpose: "withdraw" },
    { origin: "https://foreign.example.test" },
    { rpId: "example.test" },
  ]) {
    const wrong =
      domain + "\n" + JSON.stringify({ ...JSON.parse(body), ...patch });
    assert.throws(() =>
      f.boundary.initiateEnrollment({
        request: wrong,
        approvals: f.roots.map((k) =>
          b64(sign(null, Buffer.from(wrong), k.privateKey)),
        ),
      }),
    );
  }
  const admin = ed();
  for (const approvals of [
    [],
    [
      b64(sign(null, Buffer.from(request), admin.privateKey)),
      b64(sign(null, Buffer.from(request), admin.privateKey)),
    ],
    f.roots.map(() =>
      b64(sign(null, Buffer.from(request), f.roots[0].privateKey)),
    ),
  ])
    assert.throws(() => f.boundary.initiateEnrollment({ request, approvals }));
  const s = staged(f);
  const c = s.confirmation();
  c.credential.userHandle = b64("other-owner");
  assert.throws(() => f.boundary.confirmEnrollment(c));
  assert.throws(() =>
    f.boundary.confirmEnrollment({
      ...s.confirmation(),
      ownerId: f.options.ownerId,
    }),
  );
});
test("two-stage expired initiation and confirmation fail closed", (t) => {
  const f = fixture(t),
    s = staged(f);
  const r = openSyntheticRegistry({ ...f.options, now: () => 1300 });
  try {
    assert.throws(() => r.initiateEnrollment(s.authorization));
    assert.throws(() => r.confirmEnrollment(s.confirmation()));
    assert.equal(r.audit().epoch, 0);
  } finally {
    r.close();
  }
  f.boundary.confirmEnrollment(s.confirmation());
});
for (const action of [null, "revoke", "begin-recovery"])
  test(`two-stage rejects duplicate credential/stale session in ${action ?? "active"} state`, (t) => {
    const f = fixture(t),
      s = staged(f);
    f.boundary.register(f.evidence());
    if (action) f.registry.transition(f.evidence(action, 1));
    const before = f.registry.audit();
    assert.throws(() => f.boundary.confirmEnrollment(s.confirmation()));
    assert.throws(() =>
      f.boundary.prepareEnrollment({
        requestId: "replacement",
        userHandle: b64("synthetic-owner"),
        expiresAt: 1300,
      }),
    );
    assert.deepEqual(f.registry.audit(), before);
  });
test("two-stage concurrent confirmations on independent SQLite processes have exactly one winner", async (t) => {
  const f = fixture(t),
    s = staged(f),
    c = s.confirmation();
  const results = await race(
    f,
    [0, 1].map(() => `b.confirmEnrollment(${JSON.stringify(c)})`),
  );
  assert.deepEqual(results.map((r) => r.exit).sort(), [10, 11]);
  assert.equal(f.registry.audit().epoch, 1);
  assert.equal(f.registry.audit().history.length, 1);
  assert.throws(() => f.boundary.confirmEnrollment(c));
});
test("two-stage atomic persistence rollback and append-only initiation history", async (t) => {
  const { DatabaseSync } = await import("node:sqlite");
  const f = fixture(t),
    s = staged(f),
    c = s.confirmation();
  const db = new DatabaseSync(f.options.path);
  try {
    db.exec(
      "CREATE TRIGGER enrollment_unavailable BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'unavailable'); END",
    );
    assert.throws(() => f.boundary.confirmEnrollment(c));
    assert.equal(f.registry.audit().epoch, 0);
    db.exec("DROP TRIGGER enrollment_unavailable");
    f.boundary.confirmEnrollment(c);
    assert.throws(
      () => db.exec("DELETE FROM enrollment_sessions"),
      /append only/,
    );
    assert.throws(
      () => db.exec("UPDATE enrollment_sessions SET at=0"),
      /append only/,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM enrollment_sessions").get().n,
      1,
    );
  } finally {
    db.close();
  }
});
test("two-stage pending session survives reopen; competing generated credentials cannot share approval", async (t) => {
  const f = fixture(t),
    s = staged(f);
  const reopened = openSyntheticRegistry({ ...f.options, now: () => 1050 });
  try {
    assert.equal(reopened.audit().epoch, 0);
  } finally {
    reopened.close();
  }
  const a = s.confirmation(),
    b = s.confirmation(f.next, "competing-key");
  const results = await race(
    f,
    [a, b].map((c) => `b.confirmEnrollment(${JSON.stringify(c)})`),
  );
  assert.deepEqual(results.map((r) => r.exit).sort(), [10, 11]);
  assert.equal(f.registry.audit().history.length, 1);
});
test("two-stage session ID and nonce uniqueness; confirmation requires persisted authorization", (t) => {
  const f = fixture(t),
    s = staged(f);
  assert.throws(() => f.boundary.initiateEnrollment(s.authorization));
  const prefix = s.request.slice(0, s.request.indexOf("\n") + 1);
  const value = JSON.parse(s.request.slice(prefix.length));
  for (const patch of [
    { requestId: "nonce-reuse" },
    { nonce: b64(Buffer.alloc(32, 7)) },
  ]) {
    const request = prefix + JSON.stringify({ ...value, ...patch });
    assert.throws(() =>
      f.boundary.initiateEnrollment({
        request,
        approvals: f.roots.map((k) =>
          b64(sign(null, Buffer.from(request), k.privateKey)),
        ),
      }),
    );
  }
  assert.throws(() =>
    f.boundary.confirmEnrollment({ ...s.confirmation(), sessionId: "unknown" }),
  );
  const c = s.confirmation();
  const request = registryTransitionBytes({
    version: 1,
    action: "enroll",
    ownerId: f.options.ownerId,
    ownerSubject: f.options.ownerSubject,
    expectedEpoch: 0,
    requestId: "never-initiated",
    issuedAt: 1050,
    expiresAt: 1300,
    credential: c.credential,
  });
  assert.throws(() =>
    f.boundary.register({
      request,
      approvals: [],
      ownerProof: s.authorization,
      possession: c.proof,
    }),
  );
  f.boundary.confirmEnrollment(c);
});

test("two-stage public initiation and credential possession cannot substitute for final owner-binding approval", (t) => {
  const f = fixture(t),
    s = staged(f),
    c = s.confirmation();
  const other = s.confirmation(f.next, "substituted-key");
  // Attacker has the public session and a valid create/get from their OWN key.
  other.approvals = c.approvals;
  assert.throws(() => f.boundary.confirmEnrollment(other));
  for (const approvals of [
    [],
    f.roots.map(() =>
      b64(sign(null, Buffer.from("service_role"), ed().privateKey)),
    ),
  ])
    assert.throws(() => f.boundary.confirmEnrollment({ ...c, approvals }));
  assert.equal(f.registry.audit().epoch, 0);
  f.boundary.confirmEnrollment(c);
});
