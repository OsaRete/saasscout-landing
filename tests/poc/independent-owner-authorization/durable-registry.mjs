// SYNTHETIC / OFFLINE ONLY. No application imports or production authorization.
import { DatabaseSync } from "node:sqlite";
import { createHash, createPublicKey, verify } from "node:crypto";
import { keyFingerprint } from "./key-lifecycle.mjs";

const DOMAIN = "SaaSScout:synthetic-durable-registry:v1\n";
const fail = () => {
  throw new Error("Invalid synthetic registry");
};
const hash = (s) => createHash("sha256").update(s).digest("hex");
const integer = (n) => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);
function record(value, fields) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const d = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== fields.length ||
    !fields.every((f) => d[f]?.enumerable && "value" in d[f])
  )
    fail();
  return Object.fromEntries(fields.map((f) => [f, d[f].value]));
}
function binary(s, min, max) {
  if (
    typeof s !== "string" ||
    s.length > Math.ceil((max * 4) / 3) ||
    !/^[A-Za-z0-9_-]+$/.test(s)
  )
    fail();
  const b = Buffer.from(s, "base64url");
  if (b.length < min || b.length > max || b.toString("base64url") !== s) fail();
  return b;
}
function publicKey(pem) {
  if (typeof pem !== "string" || pem.length > 1024) fail();
  const k = createPublicKey(pem);
  keyFingerprint(k); // Same Ed25519-only synthetic profile as B2.5, NOT WebAuthn.
  if (k.export({ type: "spki", format: "pem" }) !== pem) fail();
  return k;
}
function credential(value) {
  const c = record(value, ["id", "publicKey", "userHandle"]);
  binary(c.id, 1, 1024);
  binary(c.userHandle, 1, 64);
  publicKey(c.publicKey);
  return c;
}
/** Synthetic transition bytes only; never a production/withdrawal intent. */
export function registryTransitionBytes(value) {
  const r = record(value, [
    "version",
    "action",
    "ownerId",
    "ownerSubject",
    "expectedEpoch",
    "requestId",
    "issuedAt",
    "expiresAt",
    "credential",
  ]);
  if (
    r.version !== 1 ||
    ![
      "enroll",
      "rotate",
      "revoke",
      "begin-recovery",
      "approve-recovery",
    ].includes(r.action) ||
    typeof r.ownerId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      r.ownerId,
    ) ||
    typeof r.ownerSubject !== "string" ||
    !/^independent:synthetic:[A-Za-z0-9_-]{1,64}$/.test(r.ownerSubject) ||
    typeof r.requestId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(r.requestId) ||
    !integer(r.expectedEpoch) ||
    !integer(r.issuedAt) ||
    !integer(r.expiresAt) ||
    r.expiresAt <= r.issuedAt ||
    r.expiresAt - r.issuedAt > 300
  )
    fail();
  r.credential = r.credential === null ? null : credential(r.credential);
  if (
    ["enroll", "rotate", "approve-recovery"].includes(r.action) !==
    (r.credential !== null)
  )
    fail();
  return DOMAIN + JSON.stringify(r);
}
function signed(key, bytes, signature) {
  return verify(null, Buffer.from(bytes), key, binary(signature, 64, 64));
}
const frozen = (v) => {
  if (v && typeof v === "object") {
    Object.values(v).forEach(frozen);
    Object.freeze(v);
  }
  return v;
};

/** All factory arguments are privileged harness configuration. Defaults to disabled.
 * create=true is ONLY for a fresh disposable path; open never initializes missing state.
 */
export function openSyntheticRegistry({
  path,
  ownerId,
  ownerSubject,
  independentKeys,
  now,
  enabled = false,
  create = false,
}) {
  if (
    enabled !== true ||
    typeof now !== "function" ||
    !Array.isArray(independentKeys) ||
    independentKeys.length !== 2
  )
    fail();
  const roots = independentKeys.map((k) => publicKey(k));
  if (keyFingerprint(roots[0]) === keyFingerprint(roots[1])) fail();
  // Validate pinned identity even before enrollment; caller requests cannot choose it.
  registryTransitionBytes({
    version: 1,
    action: "begin-recovery",
    ownerId,
    ownerSubject,
    expectedEpoch: 0,
    requestId: "config",
    issuedAt: 0,
    expiresAt: 1,
    credential: null,
  });
  const config = JSON.stringify({
    version: 1,
    ownerId,
    ownerSubject,
    roots: roots.map(keyFingerprint),
  });
  const db = new DatabaseSync(path, { open: true });
  try {
    db.exec(
      "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    if (create) {
      db.exec("BEGIN IMMEDIATE");
      try {
        // No IF NOT EXISTS: existing or partially initialized stores never bootstrap.
        db.exec(`CREATE TABLE config (singleton INTEGER PRIMARY KEY CHECK(singleton=1), value TEXT NOT NULL, epoch INTEGER NOT NULL, digest TEXT NOT NULL) STRICT;
          CREATE TABLE events (epoch INTEGER PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL, previous_hash TEXT NOT NULL, digest TEXT NOT NULL) STRICT;
          CREATE TRIGGER no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'append only'); END;
          CREATE TRIGGER no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'append only'); END;`);
        db.prepare("INSERT INTO config VALUES(1, ?, 0, ?)").run(
          config,
          hash(config),
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    function read() {
      const cfg = db.prepare("SELECT * FROM config").all();
      if (cfg.length !== 1 || cfg[0].singleton !== 1 || cfg[0].value !== config)
        fail();
      const state = { epoch: 0, status: "empty", credentials: [], history: [] };
      let previous = hash(config);
      for (const row of db
        .prepare("SELECT * FROM events ORDER BY epoch")
        .all()) {
        const event = record(JSON.parse(row.body), ["evidence", "at"]);
        if (
          JSON.stringify(event) !== row.body ||
          row.epoch !== state.epoch + 1 ||
          row.previous_hash !== previous ||
          row.digest !== hash(previous + "\n" + row.body)
        )
          fail();
        apply(state, event.evidence, event.at);
        if (row.request_id !== state.history.at(-1).requestId) fail();
        previous = row.digest;
      }
      if (cfg[0].epoch !== state.epoch || cfg[0].digest !== previous) fail();
      return { state, previous };
    }
    function apply(state, input, at) {
      const e = record(input, [
        "request",
        "approvals",
        "ownerProof",
        "possession",
      ]);
      if (
        typeof e.request !== "string" ||
        e.request.length > 8192 ||
        !e.request.startsWith(DOMAIN)
      )
        fail();
      const r = JSON.parse(e.request.slice(DOMAIN.length));
      if (
        registryTransitionBytes(r) !== e.request ||
        r.ownerId !== ownerId ||
        r.ownerSubject !== ownerSubject ||
        !integer(at) ||
        (state.history.length > 0 && at < state.history.at(-1).at) ||
        r.issuedAt > at ||
        at >= r.expiresAt ||
        r.expectedEpoch !== state.epoch ||
        state.history.some((h) => h.requestId === r.requestId) ||
        state.epoch >= Number.MAX_SAFE_INTEGER
      )
        fail();
      const external = [
        "enroll",
        "begin-recovery",
        "approve-recovery",
      ].includes(r.action);
      if (
        !Array.isArray(e.approvals) ||
        e.approvals.length !== (external ? 2 : 0)
      )
        fail();
      // Two distinct pinned simulated custodians, never service/application roles.
      if (
        external &&
        !roots.every((key, i) => signed(key, e.request, e.approvals[i]))
      )
        fail();
      const old = state.credentials.at(-1);
      if (
        external
          ? e.ownerProof !== null
          : !old || !signed(publicKey(old.publicKey), e.request, e.ownerProof)
      )
        fail();
      if (r.credential) {
        if (
          !signed(
            publicKey(r.credential.publicKey),
            "possession\n" + e.request,
            e.possession,
          ) ||
          state.credentials.some(
            (c) =>
              c.id === r.credential.id ||
              c.publicKey === r.credential.publicKey ||
              c.userHandle !== r.credential.userHandle,
          )
        )
          fail();
      } else if (e.possession !== null) fail();
      if (
        r.action === "enroll"
          ? state.status !== "empty"
          : r.action === "approve-recovery"
            ? state.status !== "pending recovery"
            : r.action === "begin-recovery"
              ? !["active", "revoked"].includes(state.status)
              : state.status !== "active"
      )
        fail();
      state.epoch++;
      if (r.action === "begin-recovery") {
        state.status = "pending recovery";
        if (old.status === "active") old.status = "pending recovery";
      } else if (r.action === "revoke") {
        state.status = "revoked";
        old.status = "revoked";
      } else {
        if (old) old.status = r.action === "rotate" ? "rotated" : "revoked";
        state.credentials.push({
          ...r.credential,
          status: "active",
          epoch: state.epoch,
        });
        state.status = "active";
      }
      state.history.push({
        epoch: state.epoch,
        previousEpoch: r.expectedEpoch,
        action: r.action,
        requestId: r.requestId,
        at,
        evidence: e,
      });
    }
    read(); // Fail closed on open, not just at the next write.
    return Object.freeze({
      transition(evidence) {
        db.exec("BEGIN IMMEDIATE");
        try {
          const { state, previous } = read();
          // Serialize/copy only after strict evidence checks inside apply.
          const at = now();
          apply(state, evidence, at);
          const body = JSON.stringify({
            evidence: state.history.at(-1).evidence,
            at,
          });
          db.prepare("INSERT INTO events VALUES (?, ?, ?, ?, ?)").run(
            state.epoch,
            state.history.at(-1).requestId,
            body,
            previous,
            hash(previous + "\n" + body),
          );
          db.prepare(
            "UPDATE config SET epoch=?, digest=? WHERE singleton=1",
          ).run(state.epoch, hash(previous + "\n" + body));
          db.exec("COMMIT");
          return frozen({
            kind: "synthetic-registry-transition",
            epoch: state.epoch,
            productionAuthorization: "disabled",
          });
        } catch {
          db.exec("ROLLBACK");
          fail();
        }
      },
      lookup({ ownerId: id, ownerSubject: subject, credentialId, epoch }) {
        const { state } = read();
        const c = state.credentials.at(-1);
        if (
          id !== ownerId ||
          subject !== ownerSubject ||
          epoch !== state.epoch ||
          state.status !== "active" ||
          !c ||
          c.status !== "active" ||
          c.id !== credentialId
        )
          fail();
        return frozen({
          ownerId,
          ownerSubject,
          epoch: state.epoch,
          credential: { ...c },
          productionAuthorization: "disabled",
        });
      },
      audit() {
        return frozen(read().state);
      },
      close() {
        db.close();
      },
    });
  } catch {
    db.close();
    fail();
  }
}
