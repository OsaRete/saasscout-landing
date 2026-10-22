import "server-only";
import { createHash, KeyObject, timingSafeEqual, verify } from "node:crypto";
import { decodeBoundIntent, decodeIntent } from "./intent-codec.ts";

const DOMAIN = Buffer.from("SaaSScout:owner-webauthn-challenge:v1\n", "ascii");
const invalid = () => new Error("Invalid WebAuthn proof");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest();
const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && timingSafeEqual(a, b);

// Restricted transport: exact plain data records, no accessors or extra authority.
function record(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    throw invalid();
  const props = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== fields.length ||
    !fields.every((f) => props[f]?.enumerable && "value" in props[f])
  )
    throw invalid();
  return Object.fromEntries(fields.map((f) => [f, props[f].value]));
}
function binary(value: unknown, min: number, max: number): Buffer {
  if (
    !(value instanceof Uint8Array) ||
    value.length < min ||
    value.length > max
  )
    throw invalid();
  return Buffer.from(value);
}
function canonicalBytes(value: unknown, now: number): Buffer {
  const bytes = binary(value, 1, 4096);
  const wire = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  decodeIntent(wire, now);
  if (!equal(bytes, Buffer.from(wire, "utf8"))) throw invalid();
  return bytes;
}

/** SHA-256(domain || complete exact B2.9 UTF-8 bytes), not the raw nonce. */
export function deriveWebAuthnChallenge(
  intentBytes: unknown,
  now: number,
): Buffer {
  return hash(Buffer.concat([DOMAIN, canonicalBytes(intentBytes, now)]));
}

// ES256 requires ASN.1 DER ECDSA-Sig-Value, not IEEE-P1363. Reject trailing,
// negative, zero, nonminimal or out-of-range r/s before asking OpenSSL to verify.
function es256Signature(value: unknown): Buffer {
  const sig = binary(value, 8, 72);
  const order = BigInt(
    "0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551",
  );
  if (sig[0] !== 0x30 || sig[1] !== sig.length - 2) throw invalid();
  let offset = 2;
  for (let i = 0; i < 2; i++) {
    if (sig[offset++] !== 2) throw invalid();
    const length = sig[offset++];
    const n = sig.subarray(offset, offset + length);
    if (
      length < 1 ||
      length > 33 ||
      n.length !== length ||
      n[0] & 0x80 ||
      (length > 1 && n[0] === 0 && !(n[1] & 0x80))
    )
      throw invalid();
    const number = BigInt("0x" + n.toString("hex"));
    if (number === BigInt(0) || number >= order) throw invalid();
    offset += length;
  }
  if (offset !== sig.length) throw invalid();
  return sig;
}

/**
 * DISABLED / offline foundation. context is privileged independent-service input,
 * NEVER relay data. No lookup, replay consumption, receipt or lifecycle decision.
 */
export function verifyWebAuthnProof(
  intentBytes: unknown,
  assertion: unknown,
  trustedContext: unknown,
): Readonly<{
  kind: "webauthn-proof-only";
  productionAuthorization: "disabled";
}> {
  // Fixed failure stages only: never attach input, native errors or evidence.
  // The disabled browser POC may inspect cause; public message stays generic.
  let stage = "trusted-context-shape";
  try {
    const c = record(trustedContext, [
      "expectedIntent",
      "now",
      "origin",
      "rpId",
      "registry",
    ]);
    stage = "intent";
    const bytes = canonicalBytes(intentBytes, c.now as number);
    const intent = decodeBoundIntent(
      bytes.toString("utf8"),
      c.expectedIntent,
      c.now as number,
    );
    stage = "origin-configuration";
    // No URL coercion, suffix matching, request-derived RP, localhost or HTTP.
    if (
      typeof c.origin !== "string" ||
      typeof c.rpId !== "string" ||
      !/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(c.rpId)
    )
      throw invalid();
    const origin = new URL(c.origin);
    if (
      origin.protocol !== "https:" ||
      origin.origin !== c.origin ||
      !(origin.hostname === c.rpId || origin.hostname.endsWith("." + c.rpId))
    )
      throw invalid();
    stage = "registry-shape";
    const registry = record(c.registry, [
      "ownerSubject",
      "ownerId",
      "epoch",
      "status",
      "credential",
    ]);
    stage = "credential-shape";
    const credential = record(registry.credential, [
      "id",
      "type",
      "algorithm",
      "publicKey",
      "userHandle",
      "status",
      "epoch",
    ]);
    stage = "registry-binding";
    if (
      registry.status !== "active" ||
      credential.status !== "active" ||
      registry.epoch !== intent.registry_epoch ||
      credential.epoch !== registry.epoch ||
      registry.ownerSubject !== intent.owner_subject ||
      registry.ownerId !== intent.owner_id ||
      credential.type !== "public-key" ||
      credential.algorithm !== -7
    )
      throw invalid();
    stage = "credential-identity-key";
    const enrolledId = binary(credential.id, 1, 1024);
    const userHandle = binary(credential.userHandle, 1, 64);
    const key = credential.publicKey;
    if (
      !(key instanceof KeyObject) ||
      key.type !== "public" ||
      key.asymmetricKeyType !== "ec" ||
      key.asymmetricKeyDetails?.namedCurve !== "prime256v1" ||
      !equal(enrolledId, Buffer.from(intent.credential_id, "base64url"))
    )
      throw invalid();
    stage = "assertion-shape";
    const a = record(assertion, ["type", "credentialId", "response"]);
    const response = record(a.response, [
      "clientDataJSON",
      "authenticatorData",
      "signature",
      "userHandle",
    ]);
    stage = "assertion-credential-identity";
    if (
      a.type !== "public-key" ||
      !equal(binary(a.credentialId, 1, 1024), enrolledId)
    )
      throw invalid();
    stage = "user-handle";
    // This profile permits null for non-discoverable credentials; present handles
    // must match protected enrollment. The credential ID/key still pins identity.
    if (
      response.userHandle !== null &&
      !equal(binary(response.userHandle, 1, 64), userHandle)
    )
      throw invalid();
    stage = "client-data-encoding";
    const clientBytes = binary(response.clientDataJSON, 1, 4096);
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(clientBytes),
    );
    stage = "client-data-shape";
    // Diagnose this known browser extension without accepting or logging it.
    if (
      parsed &&
      Object.getPrototypeOf(parsed) === Object.prototype &&
      Object.keys(parsed).length === 5 &&
      [
        "type",
        "challenge",
        "origin",
        "crossOrigin",
        "other_keys_can_be_added_here",
      ].every((field) => Object.hasOwn(parsed, field))
    )
      stage = "client-data-shape-extension-marker";
    const client = record(parsed, [
      "type",
      "challenge",
      "origin",
      "crossOrigin",
    ]);
    stage = "client-data-context";
    if (
      client.type !== "webauthn.get" ||
      client.origin !== c.origin ||
      client.crossOrigin !== false ||
      client.challenge !==
        deriveWebAuthnChallenge(bytes, c.now as number).toString("base64url")
    )
      throw invalid();
    // Exactly base assertion data: no attested data, extensions or reserved flags.
    // BE/BS are rejected too: this initial profile does not accept synced keys.
    stage = "authenticator-data-length";
    const auth = binary(response.authenticatorData, 37, 37);
    stage = "authenticator-rp-id-hash";
    if (!equal(auth.subarray(0, 32), hash(Buffer.from(c.rpId, "utf8"))))
      throw invalid();
    stage = "authenticator-flags";
    if (auth[32] !== 0x05) throw invalid();
    stage = "signature-encoding";
    const signature = es256Signature(response.signature);
    stage = "signature-verification";
    if (
      !verify(
        "sha256",
        Buffer.concat([auth, hash(clientBytes)]),
        { key, dsaEncoding: "der" },
        signature,
      )
    )
      throw invalid();
    return Object.freeze({
      kind: "webauthn-proof-only",
      productionAuthorization: "disabled",
    });
  } catch {
    throw new Error("Invalid WebAuthn proof", {
      cause: `webauthn-proof:${stage}`,
    });
  }
}
