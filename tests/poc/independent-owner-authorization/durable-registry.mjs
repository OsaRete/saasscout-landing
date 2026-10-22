// SYNTHETIC / OFFLINE ONLY. No application imports or production authorization.
import { DatabaseSync } from "node:sqlite";
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import {
  verifySyntheticRegistration,
  originConfig,
} from "./webauthn-registration.mjs";
import { keyFingerprint } from "./key-lifecycle.mjs";

const ENROLLMENT = "SaaSScout:synthetic-enrollment-initiation:v1\n";
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
function publicKey(pem, ec = false) {
  if (typeof pem !== "string" || pem.length > 1024) fail();
  const k = createPublicKey(pem);
  if (ec) {
    if (
      k.asymmetricKeyType !== "ec" ||
      k.asymmetricKeyDetails?.namedCurve !== "prime256v1"
    )
      fail();
  } else keyFingerprint(k);
  if (k.export({ type: "spki", format: "pem" }) !== pem) fail();
  return k;
}
function credential(value) {
  const c = record(value, ["id", "publicKey", "userHandle"]);
  binary(c.id, 1, 1024);
  binary(c.userHandle, 1, 64);
  const k = createPublicKey(c.publicKey);
  publicKey(c.publicKey, k.asymmetricKeyType === "ec");
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
// Final custodian approval binds BOTH the pre-creation session and generated key.
export function enrollmentConfirmationBytes(initiation, finalRequest) {
  if (
    typeof initiation !== "string" ||
    initiation.length > 4096 ||
    typeof finalRequest !== "string" ||
    finalRequest.length > 8192
  )
    fail();
  return (
    "SaaSScout:synthetic-enrollment-confirmation:v1\n" +
    JSON.stringify([initiation, finalRequest])
  );
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
  webauthn = null,
  registrationProfile = "zero-aaguid",
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
  const profile = webauthn === null ? null : originConfig(webauthn);
  // Privileged, store-pinned test policy. Never selected by enrollment evidence.
  if (
    !["zero-aaguid", "cdp-platform-none-v1"].includes(registrationProfile) ||
    (registrationProfile !== "zero-aaguid" && !profile)
  )
    fail();
  const config = JSON.stringify({
    version: 1,
    ownerId,
    ownerSubject,
    roots: roots.map(keyFingerprint),
    ...(profile ? { webauthn: profile } : {}),
    // Preserve existing default store configuration bytes; no migration.
    ...(registrationProfile !== "zero-aaguid" ? { registrationProfile } : {}),
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
        if (profile)
          db.exec(`CREATE TABLE enrollment_sessions (request_id TEXT PRIMARY KEY, nonce TEXT NOT NULL UNIQUE, evidence TEXT NOT NULL, at INTEGER NOT NULL) STRICT;
          CREATE TRIGGER session_no_update BEFORE UPDATE ON enrollment_sessions BEGIN SELECT RAISE(ABORT, 'append only'); END;
          CREATE TRIGGER session_no_delete BEFORE DELETE ON enrollment_sessions BEGIN SELECT RAISE(ABORT, 'append only'); END;
          CREATE TABLE possession_uses (request_id TEXT PRIMARY KEY, challenge TEXT NOT NULL UNIQUE, epoch INTEGER NOT NULL) STRICT;
          CREATE TRIGGER proof_no_update BEFORE UPDATE ON possession_uses BEGIN SELECT RAISE(ABORT, 'append only'); END;
          CREATE TRIGGER proof_no_delete BEFORE DELETE ON possession_uses BEGIN SELECT RAISE(ABORT, 'append only'); END;`);
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
    // Credential-free authorization, domain-separated from every lifecycle request.
    function sessionBytes(value) {
      const s = record(value, [
        "version",
        "purpose",
        "ownerId",
        "ownerSubject",
        "expectedEpoch",
        "requestId",
        "issuedAt",
        "expiresAt",
        "nonce",
        "userHandle",
        "origin",
        "rpId",
      ]);
      if (
        !profile ||
        s.version !== 1 ||
        s.purpose !== "enroll" ||
        s.ownerId !== ownerId ||
        s.ownerSubject !== ownerSubject ||
        s.origin !== profile.origin ||
        s.rpId !== profile.rpId
      )
        fail();
      registryTransitionBytes({
        version: 1,
        action: "begin-recovery",
        ownerId: s.ownerId,
        ownerSubject: s.ownerSubject,
        expectedEpoch: s.expectedEpoch,
        requestId: s.requestId,
        issuedAt: s.issuedAt,
        expiresAt: s.expiresAt,
        credential: null,
      });
      binary(s.nonce, 32, 32);
      binary(s.userHandle, 1, 64);
      return ENROLLMENT + JSON.stringify(s);
    }
    function authorizedSession(input, at) {
      const e = record(input, ["request", "approvals"]);
      if (
        typeof e.request !== "string" ||
        e.request.length > 4096 ||
        !e.request.startsWith(ENROLLMENT)
      )
        fail();
      const s = JSON.parse(e.request.slice(ENROLLMENT.length));
      if (
        sessionBytes(s) !== e.request ||
        !integer(at) ||
        s.issuedAt > at ||
        at >= s.expiresAt ||
        !Array.isArray(e.approvals) ||
        e.approvals.length !== 2 ||
        !roots.every((key, i) => signed(key, e.request, e.approvals[i]))
      )
        fail();
      return s;
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
      const staged = r.action === "enroll" && e.ownerProof !== null;
      let initiation = null;
      if (staged) {
        const s = authorizedSession(e.ownerProof, at);
        const row = db
          .prepare("SELECT * FROM enrollment_sessions WHERE request_id=?")
          .get(s.requestId);
        if (
          !row ||
          row.evidence !== JSON.stringify(e.ownerProof) ||
          row.nonce !== s.nonce ||
          row.at > at ||
          JSON.stringify(authorizedSession(e.ownerProof, row.at)) !==
            JSON.stringify(s) ||
          r.requestId !== s.requestId ||
          r.expectedEpoch !== s.expectedEpoch ||
          r.issuedAt !== s.issuedAt ||
          r.expiresAt !== s.expiresAt ||
          r.credential?.userHandle !== s.userHandle
        )
          fail();
        initiation = e.ownerProof.request;
      }
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
        !roots.every((key, i) =>
          signed(
            key,
            staged
              ? enrollmentConfirmationBytes(initiation, e.request)
              : e.request,
            e.approvals[i],
          ),
        )
      )
        fail();
      const old = state.credentials.at(-1);
      if (
        external
          ? !staged && e.ownerProof !== null
          : !old ||
            !(profile
              ? verify(
                  "sha256",
                  Buffer.from(e.request),
                  publicKey(old.publicKey, true),
                  binary(e.ownerProof, 8, 72),
                )
              : signed(publicKey(old.publicKey), e.request, e.ownerProof))
      )
        fail();
      if (r.credential) {
        if (
          !(profile
            ? (verifySyntheticRegistration(
                e.request,
                e.possession,
                r.credential,
                profile,
                initiation ?? e.request,
                registrationProfile,
              ),
              true)
            : signed(
                publicKey(r.credential.publicKey),
                "possession\n" + e.request,
                e.possession,
              )) ||
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
    function transition(evidence) {
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
        db.prepare("UPDATE config SET epoch=?, digest=? WHERE singleton=1").run(
          state.epoch,
          hash(previous + "\n" + body),
        );
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
    }
    read(); // Fail closed on open, not just at the next write.
    return Object.freeze({
      // Privileged harness prepares nonce; this is NOT owner authorization.
      prepareEnrollment(input) {
        const { requestId, userHandle, expiresAt } = record(input, [
          "requestId",
          "userHandle",
          "expiresAt",
        ]);
        const { state } = read();
        if (!profile || state.status !== "empty") fail();
        const s = {
          version: 1,
          purpose: "enroll",
          ownerId,
          ownerSubject,
          expectedEpoch: state.epoch,
          requestId,
          issuedAt: now(),
          expiresAt,
          nonce: randomBytes(32).toString("base64url"),
          userHandle,
          ...profile,
        };
        return sessionBytes(s);
      },
      initiateEnrollment(evidence) {
        db.exec("BEGIN IMMEDIATE");
        try {
          const { state } = read();
          const at = now();
          const s = authorizedSession(evidence, at);
          if (state.status !== "empty" || state.epoch !== s.expectedEpoch)
            fail();
          db.prepare("INSERT INTO enrollment_sessions VALUES (?, ?, ?, ?)").run(
            s.requestId,
            s.nonce,
            JSON.stringify(evidence),
            at,
          );
          db.exec("COMMIT");
          return frozen({
            request: evidence.request,
            productionAuthorization: "disabled",
          });
        } catch {
          db.exec("ROLLBACK");
          fail();
        }
      },
      confirmEnrollment(input) {
        const {
          sessionId,
          credential: proposed,
          proof,
          approvals,
        } = record(input, ["sessionId", "credential", "proof", "approvals"]);
        if (
          typeof sessionId !== "string" ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)
        )
          fail();
        // transition rechecks the session and consumes its ID in the events UNIQUE
        // constraint under the SAME write lock as registry validation and append.
        const row = db
          .prepare("SELECT * FROM enrollment_sessions WHERE request_id=?")
          .get(sessionId);
        if (!row) fail();
        const authorization = JSON.parse(row.evidence);
        const s = authorizedSession(authorization, now());
        return transition({
          request: registryTransitionBytes({
            version: 1,
            action: "enroll",
            ownerId,
            ownerSubject,
            expectedEpoch: s.expectedEpoch,
            requestId: s.requestId,
            issuedAt: s.issuedAt,
            expiresAt: s.expiresAt,
            credential: proposed,
          }),
          approvals,
          ownerProof: authorization,
          possession: proof,
        });
      },
      transition,
      // Privileged synchronous verifier hook; no execution or transferable authority.
      consumePossession(binding, requestId, challenge, check) {
        if (
          !profile ||
          typeof check !== "function" ||
          typeof requestId !== "string" ||
          !/^[0-9a-f-]{36}$/.test(requestId) ||
          typeof challenge !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(challenge)
        )
          fail();
        let stage = "read-integrity";
        db.exec("BEGIN IMMEDIATE");
        try {
          const { state } = read();
          const c = state.credentials.at(-1);
          stage = "binding-shape";
          const b = record(binding, [
            "ownerId",
            "ownerSubject",
            "credentialId",
            "epoch",
          ]);
          stage = "current-binding";
          if (
            b.ownerId !== ownerId ||
            b.ownerSubject !== ownerSubject ||
            b.epoch !== state.epoch ||
            state.status !== "active" ||
            !c ||
            c.status !== "active" ||
            c.id !== b.credentialId
          )
            fail();
          const snapshot = frozen({
            ownerId,
            ownerSubject,
            epoch: state.epoch,
            credential: { ...c },
            webauthn: { ...profile },
            registrationProfile,
            productionAuthorization: "disabled",
          });
          stage = "assertion-verifier";
          const result = check(snapshot);
          stage = "verifier-result";
          if (
            !result ||
            result.kind !== "webauthn-proof-only" ||
            result.productionAuthorization !== "disabled" ||
            result.then
          )
            fail();
          // Same write lock covers current mapping, verification and replay insertion.
          stage = "replay-insertion";
          db.prepare("INSERT INTO possession_uses VALUES (?, ?, ?)").run(
            requestId,
            challenge,
            snapshot.epoch,
          );
          stage = "commit";
          db.exec("COMMIT");
          return frozen({
            kind: "synthetic-possession-only",
            productionAuthorization: "disabled",
          });
        } catch (error) {
          db.exec("ROLLBACK");
          // Only fixed shared-verifier codes may survive this test-only boundary.
          // Never attach a callback/native error, message, stack or evidence.
          const proofStages = [
            "compatibility-profile",
            "client-data-extension-marker-value",
            "trusted-context-shape",
            "intent",
            "origin-configuration",
            "registry-shape",
            "credential-shape",
            "registry-binding",
            "credential-identity-key",
            "assertion-shape",
            "assertion-credential-identity",
            "user-handle",
            "client-data-encoding",
            "client-data-shape",
            "client-data-shape-extension-marker",
            "client-data-context",
            "authenticator-data-length",
            "authenticator-rp-id-hash",
            "authenticator-flags",
            "signature-encoding",
            "signature-verification",
          ];
          const proofCode =
            stage === "assertion-verifier" &&
            proofStages
              .map((value) => `webauthn-proof:${value}`)
              .find((value) => value === error?.cause);
          throw new Error("Invalid synthetic registry", {
            cause: `synthetic-possession:${stage}${proofCode ? `:${proofCode}` : ""}`,
          });
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
