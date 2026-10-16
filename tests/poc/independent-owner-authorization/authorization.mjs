// OFFLINE SECURITY EXPERIMENT ONLY. Never import into application code.
import { KeyObject, sign, verify } from "node:crypto";

const FIELDS = [
  "version",
  "owner_id",
  "evidence_promotion_id",
  "operation",
  "revision",
  "request_id",
  "audience",
  "issued_at",
  "expires_at",
];
const DOMAIN = "SaaSScout:owner-authorization:v1\n";
const MAX_LIFETIME_SECONDS = 300;
const invalid = () => new Error("Invalid owner authorization");
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

// Restricted v1 codec: exact fields, ASCII identifiers, integer seconds, fixed order.
// No general JSON canonicalization or Unicode normalization is implied.
export function canonicalPayload(payload) {
  if (
    !payload ||
    Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== FIELDS.length ||
    !FIELDS.every((field) => Object.hasOwn(payload, field))
  )
    throw invalid();
  if (
    payload.version !== 1 ||
    !integer(payload.revision) ||
    !integer(payload.issued_at) ||
    !integer(payload.expires_at) ||
    payload.expires_at <= payload.issued_at ||
    payload.expires_at - payload.issued_at > MAX_LIFETIME_SECONDS
  )
    throw invalid();
  for (const field of [
    "owner_id",
    "evidence_promotion_id",
    "operation",
    "request_id",
    "audience",
  ]) {
    if (
      typeof payload[field] !== "string" ||
      !/^[A-Za-z0-9:._/-]{1,128}$/.test(payload[field])
    )
      throw invalid();
  }
  return JSON.stringify(
    Object.fromEntries(FIELDS.map((field) => [field, payload[field]])),
  );
}

export function createSignedAuthorization(payload, privateKey) {
  if (
    !(privateKey instanceof KeyObject) ||
    privateKey.type !== "private" ||
    privateKey.asymmetricKeyType !== "ed25519"
  )
    throw invalid();
  const canonical = canonicalPayload(payload);
  return Object.freeze({
    payload: canonical,
    signature: sign(
      null,
      Buffer.from(DOMAIN + canonical, "utf8"),
      privateKey,
    ).toString("base64url"),
  });
}

// Atomic only within one JS isolate: no yield between has() and add().
// Never evicts, never persists, and cannot coordinate processes or restarts.
export function createTestOnlyAtomicReplayStore() {
  const used = new Set();
  return Object.freeze({
    consume(requestId) {
      if (used.has(requestId)) return false;
      used.add(requestId);
      return true;
    },
  });
}

// All arguments here are TRUSTED test-harness configuration, never request data.
// Copy the enrollment map so later mutations of the fixture cannot replace keys.
export function createVerifier({ enrolledKeys, expected, replayStore, now }) {
  const keys = new Map(enrolledKeys);
  const binding = Object.freeze({ ...expected });
  for (const key of keys.values()) {
    if (
      !(key instanceof KeyObject) ||
      key.type !== "public" ||
      key.asymmetricKeyType !== "ed25519"
    )
      throw invalid();
  }
  if (
    !keys.has(binding.owner_id) ||
    !integer(binding.revision) ||
    typeof binding.evidence_promotion_id !== "string" ||
    typeof binding.audience !== "string" ||
    typeof now !== "function" ||
    typeof replayStore?.consume !== "function"
  )
    throw invalid();

  // The request envelope has no public-key, algorithm, or authority override.
  return async function verifyAndConsume(authorization) {
    try {
      if (
        !authorization ||
        Object.getPrototypeOf(authorization) !== Object.prototype ||
        Object.keys(authorization).length !== 2 ||
        !Object.hasOwn(authorization, "payload") ||
        !Object.hasOwn(authorization, "signature") ||
        typeof authorization.payload !== "string" ||
        authorization.payload.length > 4096 ||
        typeof authorization.signature !== "string" ||
        !/^[A-Za-z0-9_-]{86}$/.test(authorization.signature)
      )
        throw invalid();
      const payload = JSON.parse(authorization.payload);
      const canonical = canonicalPayload(payload);
      // Also rejects whitespace, duplicate keys, alternate number forms and field order.
      if (canonical !== authorization.payload) throw invalid();
      const signature = Buffer.from(authorization.signature, "base64url");
      if (
        signature.length !== 64 ||
        signature.toString("base64url") !== authorization.signature
      )
        throw invalid();
      const publicKey = keys.get(payload.owner_id);
      if (
        !publicKey ||
        !verify(
          null,
          Buffer.from(DOMAIN + canonical, "utf8"),
          publicKey,
          signature,
        )
      )
        throw invalid();
      const current = now();
      if (
        !integer(current) ||
        payload.owner_id !== binding.owner_id ||
        payload.evidence_promotion_id !== binding.evidence_promotion_id ||
        payload.operation !== "withdraw" ||
        payload.revision !== binding.revision ||
        payload.audience !== binding.audience ||
        payload.issued_at > current ||
        payload.expires_at <= current
      )
        throw invalid();
      // Consume only after every check. Success authorizes nothing outside this POC.
      if ((await replayStore.consume(payload.request_id)) !== true)
        throw invalid();
      return Object.freeze(payload);
    } catch {
      throw invalid();
    }
  };
}
