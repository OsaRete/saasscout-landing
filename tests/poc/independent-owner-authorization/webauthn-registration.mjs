// OFFLINE synthetic restricted WebAuthn profile. No identity attestation claim.
import { createHash, createPublicKey, verify } from "node:crypto";
const fail = () => {
  throw new Error("Invalid synthetic registration");
};
export const digest = (bytes) => createHash("sha256").update(bytes).digest();
export function registrationChallenge(request, purpose) {
  if (!["create", "get"].includes(purpose)) fail();
  return digest(
    `SaaSScout:synthetic-registration:${purpose}:v1\n${request}`,
  ).toString("base64url");
}
export function dataRecord(value, fields) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail();
  const props = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== fields.length ||
    !fields.every((f) => props[f]?.enumerable && "value" in props[f])
  )
    fail();
  return Object.fromEntries(fields.map((f) => [f, props[f].value]));
}
export function bytes(value, min, max) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil((max * 4) / 3) ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    fail();
  const b = Buffer.from(value, "base64url");
  if (b.length < min || b.length > max || b.toString("base64url") !== value)
    fail();
  return b;
}
export function originConfig(value) {
  const c = dataRecord(value, ["origin", "rpId"]);
  if (
    typeof c.origin !== "string" ||
    typeof c.rpId !== "string" ||
    !/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(c.rpId)
  )
    fail();
  const u = new URL(c.origin);
  if (
    u.protocol !== "https:" ||
    u.origin !== c.origin ||
    !(u.hostname === c.rpId || u.hostname.endsWith("." + c.rpId))
  )
    fail();
  return c;
}
function client(value, request, purpose, origin) {
  const raw = bytes(value, 1, 4096);
  const c = dataRecord(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
    ["type", "challenge", "origin", "crossOrigin"],
  );
  if (
    c.type !== `webauthn.${purpose}` ||
    c.challenge !== registrationChallenge(request, purpose) ||
    c.origin !== origin ||
    c.crossOrigin !== false
  )
    fail();
  return raw;
}
// A single canonical CBOR encoding: {fmt:"none",attStmt:{},authData: bstr16}.
// Reject all other formats, encodings, extensions, algorithms and backup flags.
const PREFIX = Buffer.from(
  "a363666d74646e6f6e656761747453746d74a068617574684461746159",
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
  const p = dataRecord(proof, [
    "type",
    "credentialId",
    "clientDataJSON",
    "attestationObject",
    "possession",
  ]);
  if (p.type !== "public-key" || p.credentialId !== credential.id) fail();
  client(p.clientDataJSON, creationRequest, "create", cfg.origin);
  const att = bytes(p.attestationObject, PREFIX.length + 2 + 132, 2048);
  if (
    !att.subarray(0, PREFIX.length).equals(PREFIX) ||
    att.readUInt16BE(PREFIX.length) !== att.length - PREFIX.length - 2
  )
    fail();
  const auth = att.subarray(PREFIX.length + 2);
  const id = bytes(credential.id, 1, 1024);
  if (
    !auth.subarray(0, 32).equals(digest(cfg.rpId)) ||
    auth[32] !== 0x45 ||
    !auth.subarray(37, 53).equals(Buffer.alloc(16)) ||
    auth.readUInt16BE(53) !== id.length ||
    !auth.subarray(55, 55 + id.length).equals(id)
  )
    fail();
  const key = createPublicKey(credential.publicKey);
  if (
    key.asymmetricKeyType !== "ec" ||
    key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  )
    fail();
  const jwk = key.export({ format: "jwk" });
  const cose = Buffer.concat([
    Buffer.from("a5010203262001215820", "hex"),
    bytes(jwk.x, 32, 32),
    Buffer.from("225820", "hex"),
    bytes(jwk.y, 32, 32),
  ]);
  if (!auth.subarray(55 + id.length).equals(cose)) fail();
  // fmt:none is NOT identity/device attestation. Require a fresh signed get too.
  const a = dataRecord(p.possession, [
    "credentialId",
    "clientDataJSON",
    "authenticatorData",
    "signature",
    "userHandle",
  ]);
  if (
    a.credentialId !== credential.id ||
    a.userHandle !== credential.userHandle
  )
    fail();
  const cd = client(a.clientDataJSON, request, "get", cfg.origin);
  const ad = bytes(a.authenticatorData, 37, 37);
  if (
    !ad.subarray(0, 32).equals(digest(cfg.rpId)) ||
    ad[32] !== 5 ||
    !verify(
      "sha256",
      Buffer.concat([ad, digest(cd)]),
      key,
      bytes(a.signature, 8, 72),
    )
  )
    fail();
}
