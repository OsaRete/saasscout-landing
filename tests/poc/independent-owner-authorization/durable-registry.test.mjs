import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  openSyntheticRegistry,
  registryTransitionBytes,
} from "./durable-registry.mjs";
const ownerId = "11111111-1111-4111-8111-111111111111";
const ownerSubject = "independent:synthetic:owner";
const key = () => generateKeyPairSync("ed25519");
const pem = (k) => k.publicKey.export({ type: "spki", format: "pem" });
const signature = (k, bytes) =>
  sign(null, Buffer.from(bytes), k.privateKey).toString("base64url");
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "synthetic-registry-"));
  const roots = [key(), key()],
    first = key(),
    next = key();
  const config = {
    path: join(dir, "registry.sqlite"),
    ownerId,
    ownerSubject,
    independentKeys: roots.map(pem),
    enabled: true,
  };
  const open = (create = false) =>
    openSyntheticRegistry({ ...config, create, now: () => 1050 });
  const registry = open(true);
  const handles = [registry];
  t.after(() => {
    for (const h of handles) {
      try {
        h.close();
      } catch {}
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const credential = (k, id) => ({
    id: Buffer.from(id).toString("base64url"),
    publicKey: pem(k),
    userHandle: Buffer.from("stable-owner-handle").toString("base64url"),
  });
  function evidence(
    action,
    epoch,
    k = next,
    id = "next",
    requestId = `${action}-${epoch}`,
  ) {
    const request = registryTransitionBytes({
      version: 1,
      action,
      ownerId,
      ownerSubject,
      expectedEpoch: epoch,
      requestId,
      issuedAt: 1000,
      expiresAt: 1300,
      credential: ["enroll", "rotate", "approve-recovery"].includes(action)
        ? credential(k, id)
        : null,
    });
    return {
      request,
      approvals: ["enroll", "begin-recovery", "approve-recovery"].includes(
        action,
      )
        ? roots.map((k) => signature(k, request))
        : [],
      ownerProof: ["rotate", "revoke"].includes(action)
        ? signature(first, request)
        : null,
      possession: ["enroll", "rotate", "approve-recovery"].includes(action)
        ? signature(k, "possession\n" + request)
        : null,
    };
  }
  const enroll = () =>
    registry.transition(evidence("enroll", 0, first, "first"));
  const lookup = (epoch = 1, id = "first") =>
    registry.lookup({
      ownerId,
      ownerSubject,
      epoch,
      credentialId: Buffer.from(id).toString("base64url"),
    });
  return {
    dir,
    config,
    registry,
    open: () => {
      const h = open();
      handles.push(h);
      return h;
    },
    first,
    next,
    roots,
    evidence,
    enroll,
    lookup,
  };
}
const rejects = (f) => assert.throws(f, /Invalid synthetic registry/);
test("disabled by default, explicit fresh initialization, enrollment and strict lookup", (t) => {
  const f = fixture(t);
  rejects(() =>
    openSyntheticRegistry({ ...f.config, enabled: undefined, now: () => 1050 }),
  );
  rejects(() =>
    f
      .open()
      .lookup({ ownerId, ownerSubject, epoch: 0, credentialId: "Zmlyc3Q" }),
  );
  assert.equal(f.enroll().productionAuthorization, "disabled");
  assert.equal(f.lookup().credential.status, "active");
  for (const patch of [
    { ownerId: "22222222-2222-4222-8222-222222222222" },
    { ownerSubject: "service_role" },
    { epoch: 0 },
    { credentialId: "bad" },
  ])
    rejects(() =>
      f.registry.lookup({
        ownerId,
        ownerSubject,
        epoch: 1,
        credentialId: "Zmlyc3Q",
        ...patch,
      }),
    );
  assert.equal(f.registry.audit().history.length, 1);
});
test("authorized rotation retires predecessor and rejects stale key/epoch/resurrection", (t) => {
  const f = fixture(t);
  f.enroll();
  f.registry.transition(f.evidence("rotate", 1));
  rejects(() => f.lookup());
  assert.equal(f.lookup(2, "next").credential.status, "active");
  assert.equal(f.registry.audit().credentials[0].status, "rotated");
  rejects(() => f.registry.transition(f.evidence("revoke", 2))); // old key signs
  const e = f.evidence("rotate", 2, f.first, "first");
  e.ownerProof = signature(f.next, e.request);
  rejects(() => f.registry.transition(e));
});
test("revocation denies current and stale credentials permanently", (t) => {
  const f = fixture(t);
  f.enroll();
  f.registry.transition(f.evidence("revoke", 1));
  rejects(() => f.lookup(2));
  rejects(() => f.registry.transition(f.evidence("rotate", 2)));
  assert.equal(f.registry.audit().credentials[0].status, "revoked");
});
test("pending recovery blocks lookup/rotation; two independent approvals and possession activate distinct key", (t) => {
  const f = fixture(t);
  f.enroll();
  f.registry.transition(f.evidence("begin-recovery", 1));
  rejects(() => f.lookup(2));
  rejects(() => f.registry.transition(f.evidence("rotate", 2)));
  assert.equal(f.registry.audit().status, "pending recovery");
  const e = f.evidence("approve-recovery", 2);
  for (const patch of [
    { approvals: [] },
    { approvals: [e.approvals[0], e.approvals[0]] },
    { possession: null },
  ])
    rejects(() => f.registry.transition({ ...e, ...patch }));
  assert.equal(f.registry.audit().epoch, 2);
  f.registry.transition(e);
  assert.equal(f.lookup(3, "next").epoch, 3);
  assert.equal(f.registry.audit().credentials[0].status, "revoked");
});
test("revoked owner may only recover through pending state, never direct activation", (t) => {
  const f = fixture(t);
  f.enroll();
  f.registry.transition(f.evidence("revoke", 1));
  rejects(() => f.registry.transition(f.evidence("approve-recovery", 2)));
  f.registry.transition(f.evidence("begin-recovery", 2));
  rejects(() =>
    f.registry.transition(f.evidence("approve-recovery", 3, f.first, "first")),
  );
  f.registry.transition(f.evidence("approve-recovery", 3));
  assert.equal(f.lookup(4, "next").epoch, 4);
});
test("administrative substitutions, foreign issuers, owner remapping and malformed evidence deny", (t) => {
  const f = fixture(t),
    good = f.evidence("enroll", 0, f.first, "first");
  for (const role of [
    "service_role",
    "internal_test",
    "internal_tester",
    "application_admin",
  ]) {
    rejects(() => f.registry.transition(role));
    rejects(() => f.registry.transition({ ...good, approvals: [role, role] }));
    rejects(() => f.registry.transition({ ...good, role }));
  }
  rejects(() =>
    f.registry.transition({
      ...good,
      approvals: [
        signature(key(), good.request),
        signature(key(), good.request),
      ],
    }),
  );
  const r = JSON.parse(good.request.split("\n")[1]);
  r.ownerId = "22222222-2222-4222-8222-222222222222";
  const request = registryTransitionBytes(r);
  rejects(() =>
    f.registry.transition({
      request,
      approvals: f.roots.map((k) => signature(k, request)),
      ownerProof: null,
      possession: signature(f.first, "possession\n" + request),
    }),
  );
  for (const request of [
    good.request + "\n",
    good.request.replace('"expectedEpoch":0', '"expectedEpoch":1'),
    good.request.replace('"issuedAt":1000', '"issuedAt":1100'),
  ])
    rejects(() => f.registry.transition({ ...good, request }));
  const expired = { ...r, ownerId, issuedAt: 700, expiresAt: 1000 };
  const stale = registryTransitionBytes(expired);
  rejects(() =>
    f.registry.transition({
      request: stale,
      approvals: f.roots.map((k) => signature(k, stale)),
      ownerProof: null,
      possession: signature(f.first, "possession\n" + stale),
    }),
  );
  assert.equal(f.registry.audit().epoch, 0);
  f.registry.transition(good);
  rejects(() =>
    openSyntheticRegistry({
      ...f.config,
      ownerSubject: "independent:synthetic:other",
      now: () => 1050,
    }),
  );
});
test("replay and duplicate operation IDs rejected atomically without audit changes", (t) => {
  const f = fixture(t),
    e = f.evidence("enroll", 0, f.first, "first");
  f.registry.transition(e);
  rejects(() => f.registry.transition(e));
  rejects(() =>
    f.registry.transition(f.evidence("rotate", 1, f.next, "next", "enroll-0")),
  );
  assert.equal(f.registry.audit().epoch, 1);
  assert.equal(f.registry.audit().history.length, 1);
});
test("audit snapshots immutable and SQL history update/delete rejected", (t) => {
  const f = fixture(t);
  f.enroll();
  const a = f.registry.audit();
  assert.throws(() => {
    a.credentials[0].status = "active-again";
  }, TypeError);
  f.registry.transition(f.evidence("rotate", 1));
  assert.equal(a.history.length, 1);
  const b = f.registry.audit();
  assert.deepEqual(
    b.history.map((h) => [h.previousEpoch, h.epoch]),
    [
      [0, 1],
      [1, 2],
    ],
  );
  const db = new DatabaseSync(f.config.path);
  assert.throws(() => db.exec("DELETE FROM events"), /append only/);
  assert.throws(() => db.exec("UPDATE events SET digest='bad'"), /append only/);
  db.close();
});
// Real independent processes and SQLite connections; no mocked persistence/store.
function child(config, code) {
  const source = `import {openSyntheticRegistry} from ${JSON.stringify(new URL("./durable-registry.mjs", import.meta.url).href)}; const config=${JSON.stringify(config)}; const r=openSyntheticRegistry({...config,now:()=>1050}); ${code}`;
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["--input-type=module", "-e", source], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timeout = setTimeout(() => p.kill("SIGKILL"), 10000);
    p.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    p.on("close", (exit) => {
      clearTimeout(timeout);
      resolve({ exit, out, err });
    });
  });
}
test("persistence after writer process exits, fresh reader sees key/history and denies replay", async (t) => {
  const f = fixture(t),
    e = f.evidence("enroll", 0, f.first, "first");
  f.registry.close();
  const writer = await child(
    f.config,
    `r.transition(${JSON.stringify(e)});r.close();`,
  );
  assert.equal(writer.exit, 0, writer.err);
  const reader = await child(
    f.config,
    `const s=r.audit();if(s.epoch!==1||s.history.length!==1)process.exit(2);r.lookup({ownerId:config.ownerId,ownerSubject:config.ownerSubject,epoch:1,credentialId:"Zmlyc3Q"});try{r.transition(${JSON.stringify(e)});process.exit(3)}catch{}r.close();`,
  );
  assert.equal(reader.exit, 0, reader.err);
  assert.equal(f.open().audit().epoch, 1);
});
test("concurrent processes with different updates at same epoch have exactly one winner", async (t) => {
  const f = fixture(t);
  f.enroll();
  const a = f.evidence("rotate", 1),
    b = f.evidence("revoke", 1);
  const go = join(f.dir, "go"),
    ready = [join(f.dir, "ready-0"), join(f.dir, "ready-1")];
  const jobs = [a, b].map((e, i) =>
    child(
      f.config,
      `import {existsSync,writeFileSync} from "node:fs";
     writeFileSync(${JSON.stringify(ready[i])}, "ready");
     while(!existsSync(${JSON.stringify(go)})) await new Promise(resolve=>setTimeout(resolve,5));
     try{r.transition(${JSON.stringify(e)});process.exitCode=10}catch{process.exitCode=11}finally{r.close()}`,
    ),
  );
  const deadline = Date.now() + 5000;
  while (!ready.every(existsSync) && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 5));
  const bothReady = ready.every(existsSync);
  writeFileSync(go, "go");
  const results = await Promise.all(jobs);
  assert.ok(bothReady, "both independent connections must open before racing");
  assert.deepEqual(results.map((r) => r.exit).sort(), [10, 11]);
  assert.equal(f.registry.audit().epoch, 2);
  assert.equal(f.registry.audit().history.length, 2);
});
test("corrupted, truncated, incomplete, mismatched and missing state fail closed", (t) => {
  const f = fixture(t);
  f.enroll();
  f.registry.close();
  const original = readFileSync(f.config.path);
  writeFileSync(f.config.path, original.subarray(0, 100));
  rejects(() => f.open());
  writeFileSync(f.config.path, original);
  const db = new DatabaseSync(f.config.path);
  db.exec("DROP TRIGGER no_update; UPDATE events SET digest='corrupted'");
  db.close();
  rejects(() => f.open());
  writeFileSync(f.config.path, original);
  const incomplete = new DatabaseSync(f.config.path);
  incomplete.exec("DROP TABLE events");
  incomplete.close();
  rejects(() => f.open());
  rejects(() =>
    openSyntheticRegistry({
      ...f.config,
      path: join(f.dir, "missing.sqlite"),
      now: () => 1050,
    }),
  );
});

test("failed audit insert rolls back epoch, credential and replay consumption", (t) => {
  const f = fixture(t);
  f.enroll();
  const db = new DatabaseSync(f.config.path);
  db.exec(
    "CREATE TRIGGER unavailable_audit BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'unavailable'); END",
  );
  const e = f.evidence("rotate", 1);
  rejects(() => f.registry.transition(e));
  assert.equal(f.registry.audit().epoch, 1);
  assert.equal(f.lookup().credential.status, "active");
  db.exec("DROP TRIGGER unavailable_audit");
  db.close();
  f.registry.transition(e);
  assert.equal(f.lookup(2, "next").epoch, 2);
});
test("recomputed hash cannot authorize tampered persisted signed evidence", (t) => {
  const f = fixture(t);
  f.enroll();
  const db = new DatabaseSync(f.config.path);
  const row = db.prepare("SELECT * FROM events").get();
  const event = JSON.parse(row.body);
  event.evidence.request = event.evidence.request.replace(
    "synthetic:owner",
    "synthetic:attacker",
  );
  const body = JSON.stringify(event);
  const digest = createHash("sha256")
    .update(row.previous_hash + "\n" + body)
    .digest("hex");
  db.exec("DROP TRIGGER no_update");
  db.prepare("UPDATE events SET body=?, digest=?").run(body, digest);
  db.close();
  rejects(() => f.open());
  rejects(() => f.lookup());
});

test("missing audit suffix is rejected against atomic durable head", (t) => {
  const f = fixture(t);
  f.enroll();
  f.registry.transition(f.evidence("rotate", 1));
  const db = new DatabaseSync(f.config.path);
  db.exec("DROP TRIGGER no_delete; DELETE FROM events WHERE epoch=2");
  db.close();
  rejects(() => f.open());
  rejects(() => f.lookup(2, "next"));
});
