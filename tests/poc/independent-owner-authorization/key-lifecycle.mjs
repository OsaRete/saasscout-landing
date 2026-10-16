// OFFLINE ONLY. Factory configuration and external decision issuer are privileged.
import { KeyObject, createHash, verify } from "node:crypto";
import {
  canonicalPayload,
  createVerifier,
  createTestOnlyAtomicReplayStore,
} from "./authorization.mjs";
const fail = () => {
  throw new Error("Invalid key authority");
};
export const LIFECYCLE_AUDIENCE = "saasscout:offline-key-lifecycle:v1";
export function keyFingerprint(key) {
  if (
    !(key instanceof KeyObject) ||
    key.type !== "public" ||
    key.asymmetricKeyType !== "ed25519"
  )
    fail();
  return createHash("sha256")
    .update(key.export({ type: "spki", format: "der" }))
    .digest("hex");
}
// EXTERNAL TRUST ASSUMPTION: only an independently authenticated authority gets
// issue(). No Auth session, service credential, email or caller ID grants access.
// Opaque capabilities model decisions, not a production identity process.
export function createSimulatedExternalAuthority() {
  const decisions = new WeakMap();
  return Object.freeze({
    issue({ action, owner_id, key = null, expected_version, decision_id }) {
      if (
        !["enroll", "begin-recovery", "recover"].includes(action) ||
        !/^[A-Za-z0-9:-]{1,128}$/.test(owner_id) ||
        !Number.isSafeInteger(expected_version) ||
        expected_version < 0 ||
        typeof decision_id !== "string" ||
        !decision_id.length
      )
        fail();
      const token = Object.freeze({});
      decisions.set(
        token,
        Object.freeze({
          action,
          owner_id,
          key,
          fingerprint: key === null ? null : keyFingerprint(key),
          expected_version,
          decision_id,
        }),
      );
      return token;
    },
    // Pass only this reader to the registry, never issue() to the application.
    read(token) {
      return decisions.get(token);
    },
  });
}
export function createProtectedKeyAuthority({ readExternalDecision, now }) {
  const registry = new Map();
  const history = [];
  const consumed = new Set();
  const withdrawalReplay = createTestOnlyAtomicReplayStore();
  function commit(owner, previous, state, key, request, kind) {
    const fingerprint = keyFingerprint(key);
    // A revoked key must never become active again, including through recovery.
    if (
      state === "active" &&
      history.some(
        (e) =>
          e.owner_id === owner &&
          e.key_state === "revoked" &&
          e.fingerprint === fingerprint,
      )
    )
      fail();
    if (
      state === "active" &&
      previous &&
      keyFingerprint(previous.key) === fingerprint
    )
      fail();
    const version = (previous?.version ?? 0) + 1;
    if (consumed.has(request)) fail();
    const at = now();
    if (!Number.isSafeInteger(at) || at < 0) fail();
    const events = [];
    if (previous && state === "active")
      events.push(
        Object.freeze({
          owner_id: owner,
          version,
          previous_version: previous.version,
          key_state: "revoked",
          fingerprint: keyFingerprint(previous.key),
          kind,
          decision_id: request,
          at,
        }),
      );
    events.push(
      Object.freeze({
        owner_id: owner,
        version,
        previous_version: previous?.version ?? 0,
        key_state: state,
        fingerprint,
        kind,
        decision_id: request,
        at,
      }),
    );
    // No await: version check, append and projection update share one isolate.
    consumed.add(request);
    history.push(...events);
    registry.set(owner, Object.freeze({ version, state, key }));
  }
  function external(token, action) {
    const d = readExternalDecision(token);
    if (!d || d.action !== action || consumed.has(d.decision_id)) fail();
    const old = registry.get(d.owner_id);
    if ((old?.version ?? 0) !== d.expected_version) fail();
    if (action === "enroll" && (old || !d.key)) fail();
    if (action === "begin-recovery" && old?.state !== "active") fail();
    if (action === "recover" && (old?.state !== "pending recovery" || !d.key))
      fail();
    commit(
      d.owner_id,
      old,
      action === "begin-recovery" ? "pending recovery" : "active",
      action === "begin-recovery" ? old.key : d.key,
      d.decision_id,
      action,
    );
  }
  return Object.freeze({
    enroll: (token) => external(token, "enroll"),
    beginRecovery: (token) => external(token, "begin-recovery"),
    recover: (token) => external(token, "recover"),
    rotate({ authorization, nextKey }) {
      // Reuse B2.4 restricted codec/domain. Fingerprint binds the new key in the
      // evidence slot; separate audience/operation prohibit withdrawal crossover.
      const p = JSON.parse(authorization.payload);
      const old = registry.get(p.owner_id);
      if (
        !old ||
        old.state !== "active" ||
        old.version !== p.revision ||
        canonicalPayload(p) !== authorization.payload ||
        p.operation !== "rotate-key" ||
        p.audience !== LIFECYCLE_AUDIENCE ||
        p.evidence_promotion_id !== keyFingerprint(nextKey) ||
        p.issued_at > now() ||
        p.expires_at <= now() ||
        Object.keys(authorization).sort().join(",") !== "payload,signature" ||
        typeof authorization.signature !== "string" ||
        !/^[A-Za-z0-9_-]{86}$/.test(authorization.signature)
      )
        fail();
      const sig = Buffer.from(authorization.signature, "base64url");
      if (
        sig.toString("base64url") !== authorization.signature ||
        !verify(
          null,
          Buffer.from(
            "SaaSScout:owner-authorization:v1\n" + authorization.payload,
          ),
          old.key,
          sig,
        ) ||
        keyFingerprint(old.key) === keyFingerprint(nextKey)
      )
        fail();
      commit(p.owner_id, old, "active", nextKey, p.request_id, "rotate");
    },
    // Constructed by independent verifier infrastructure, never by the app.
    verifier(expected) {
      const binding = Object.freeze({ ...expected });
      return async (authorization) => {
        const old = registry.get(binding.owner_id);
        if (!old || old.state !== "active") fail();
        return createVerifier({
          enrolledKeys: new Map([[binding.owner_id, old.key]]),
          expected: binding,
          now,
          replayStore: {
            consume(id) {
              // Recheck at consumption: deny a transition racing verification.
              if (
                registry.get(binding.owner_id) !== old ||
                old.state !== "active"
              )
                return false;
              return withdrawalReplay.consume(id);
            },
          },
        })(authorization);
      };
    },
    audit() {
      return Object.freeze([...history]);
    },
  });
}
