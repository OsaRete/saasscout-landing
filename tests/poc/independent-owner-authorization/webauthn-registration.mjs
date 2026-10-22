// OFFLINE synthetic restricted WebAuthn profile. No identity attestation claim.
import { createHash, createPublicKey, verify } from "node:crypto";
// Chromium 149 GREASE member. WebAuthn permits extra client-data members but
// does not standardize this name/value. This restricted POC pins exactly one.
const MARKER = "other_keys_can_be_added_here";
const MARKER_VALUE =
  "do not compare clientDataJSON against a template. See https://goo.gl/yabPex";
const fail = (stage) => {
  const error = new Error("Invalid synthetic registration");
  // Fixed labels only; this isolated POC never includes evidence in diagnostics.
  error.code = `synthetic-registration:${stage}`;
  throw error;
};
export const digest = (bytes) => createHash("sha256").update(bytes).digest();
export function registrationChallenge(request, purpose) {
  if (!["create", "get"].includes(purpose)) fail("challenge-purpose");
  return digest(
    `SaaSScout:synthetic-registration:${purpose}:v1\n${request}`,
  ).toString("base64url");
}
export function dataRecord(value, fields, stage = "record") {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    fail(`${stage}-object`);
  const props = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  // Report only fixed check labels, never unexpected property names or values.
  const extra = keys.filter((key) => !fields.includes(key));
  if (extra.length) {
    if (stage === "create-client" || stage === "get-client") {
      // Identify the prohibited top-origin name without revealing its value.
      if (extra.length === 1 && extra[0] === "topOrigin")
        fail(`${stage}-unexpected-top-origin`);
    }
    fail(`${stage}-unexpected-field`);
  }
  if (keys.length !== fields.length) fail(`${stage}-missing-field`);
  if (!fields.every((f) => props[f]?.enumerable && "value" in props[f]))
    fail(`${stage}-field-descriptor`);
  return Object.fromEntries(fields.map((f) => [f, props[f].value]));
}
export function bytes(value, min, max, stage = "bytes") {
  if (typeof value !== "string") fail(`${stage}-type`);
  if (value.length > Math.ceil((max * 4) / 3)) fail(`${stage}-encoded-size`);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail(`${stage}-base64url-alphabet`);
  const b = Buffer.from(value, "base64url");
  if (b.length < min || b.length > max) fail(`${stage}-decoded-size`);
  if (b.toString("base64url") !== value) fail(`${stage}-base64url-canonical`);
  return b;
}
export function originConfig(value) {
  const c = dataRecord(value, ["origin", "rpId"], "configuration");
  if (
    typeof c.origin !== "string" ||
    typeof c.rpId !== "string" ||
    !/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(c.rpId)
  )
    fail("configuration-types-or-rp-syntax");
  const u = new URL(c.origin);
  if (
    u.protocol !== "https:" ||
    u.origin !== c.origin ||
    !(u.hostname === c.rpId || u.hostname.endsWith("." + c.rpId))
  )
    fail("configuration-origin-or-rp-binding");
  return c;
}
function client(value, request, purpose, origin) {
  const stage = `${purpose}-client`;
  const raw = bytes(value, 1, 4096, stage);
  let text, parsed;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    fail(`${stage}-utf8`);
  }
  try {
    parsed = JSON.parse(text);
  } catch {
    // Native JSON errors can quote input. Keep diagnostic payloads fixed.
    fail(`${stage}-json`);
  }
  const fields = ["type", "challenge", "origin", "crossOrigin"];
  const hasMarker =
    parsed !== null &&
    typeof parsed === "object" &&
    Object.hasOwn(parsed, MARKER);
  if (hasMarker) fields.push(MARKER);
  const c = dataRecord(parsed, fields, stage);
  if (hasMarker && c[MARKER] !== MARKER_VALUE)
    fail(`${stage}-extension-marker-value`);
  if (
    c.type !== `webauthn.${purpose}` ||
    c.challenge !== registrationChallenge(request, purpose) ||
    c.origin !== origin ||
    c.crossOrigin !== false
  )
    fail(`client-${purpose}`);
  // Keep the exact bytes, INCLUDING the optional marker, in the signature hash.
  return raw;
}
// Fixed CBOR map: {fmt:"none",attStmt:{},authData: bstr8 or bstr16}.
// bstr8 is Chromium's shortest encoding for <256 bytes; retain legacy fixtures.
// Reject all other formats, encodings, extensions, algorithms and backup flags.
const PREFIX = Buffer.from(
  "a363666d74646e6f6e656761747453746d74a0686175746844617461",
  "hex",
);
export function verifySyntheticRegistration(
  request,
  proof,
  credential,
  configuration,
  creationRequest = request,
) {
  const cfg = originConfig(configuration);
  const p = dataRecord(
    proof,
    [
      "type",
      "credentialId",
      "clientDataJSON",
      "attestationObject",
      "possession",
    ],
    "proof",
  );
  if (p.type !== "public-key") fail("credential-type");
  if (p.credentialId !== credential.id) fail("credential-id-mismatch");
  client(p.clientDataJSON, creationRequest, "create", cfg.origin);
  const att = bytes(
    p.attestationObject,
    PREFIX.length + 2 + 132,
    2048,
    "attestation",
  );
  const width =
    att[PREFIX.length] === 0x58 ? 1 : att[PREFIX.length] === 0x59 ? 2 : 0;
  const offset = PREFIX.length + 1 + width;
  if (
    !att.subarray(0, PREFIX.length).equals(PREFIX) ||
    width === 0 ||
    (width === 1 ? att[offset - 1] : att.readUInt16BE(offset - 2)) !==
      att.length - offset
  )
    fail("attestation-envelope");
  const auth = att.subarray(offset);
  const id = bytes(credential.id, 1, 1024, "credential-id");
  // Same predicates and short-circuit order; fixed labels reveal no evidence.
  if (!auth.subarray(0, 32).equals(digest(cfg.rpId)))
    fail("attested-credential-rp-id-hash");
  if (auth[32] !== 0x45) fail("attested-credential-flags");
  if (!auth.subarray(37, 53).equals(Buffer.alloc(16)))
    fail("attested-credential-aaguid");
  if (auth.readUInt16BE(53) !== id.length)
    fail("attested-credential-id-length");
  if (!auth.subarray(55, 55 + id.length).equals(id))
    fail("attested-credential-id-equality");
  const key = createPublicKey(credential.publicKey);
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  )
    fail("public-key");
  const jwk = key.export({ format: "jwk" });
  const cose = Buffer.concat([
    Buffer.from("a5010203262001215820", "hex"),
    bytes(jwk.x, 32, 32, "public-key-x"),
    Buffer.from("225820", "hex"),
    bytes(jwk.y, 32, 32, "public-key-y"),
  ]);
  if (!auth.subarray(55 + id.length).equals(cose)) fail("cose-key");
  // fmt:none is NOT identity/device attestation. Require a fresh signed get too.
  const a = dataRecord(
    p.possession,
    [
      "credentialId",
      "clientDataJSON",
      "authenticatorData",
      "signature",
      "userHandle",
    ],
    "possession",
  );
  if (
    a.credentialId !== credential.id ||
    a.userHandle !== credential.userHandle
  )
    fail("possession-identity");
  const cd = client(a.clientDataJSON, request, "get", cfg.origin);
  const ad = bytes(
    a.authenticatorData,
    37,
    37,
    "possession-authenticator-data",
  );
  if (
    !ad.subarray(0, 32).equals(digest(cfg.rpId)) ||
    ad[32] !== 5 ||
    !verify(
      "sha256",
      Buffer.concat([ad, digest(cd)]),
      key,
      bytes(a.signature, 8, 72, "possession-signature"),
    )
  )
    fail("possession-signature-or-flags");
}
