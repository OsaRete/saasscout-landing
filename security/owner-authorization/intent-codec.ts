import "server-only";

// Disabled foundation: this module validates bytes and bindings, NEVER consent.
// No signing, proof verification, registry lookup, replay consumption or execution.
const DOMAIN = "SaaSScout:production-owner-authorization:v1\n";
const FIELDS = [
  "version",
  "audience",
  "owner_subject",
  "owner_id",
  "evidence_promotion_id",
  "operation",
  "revision",
  "registry_epoch",
  "credential_id",
  "request_id",
  "server_challenge",
  "issued_at",
  "expires_at",
  "context_digest",
] as const;

export type AuthorizationIntent = Readonly<{
  version: 1;
  audience: string;
  owner_subject: string;
  owner_id: string;
  evidence_promotion_id: string;
  operation: "withdraw";
  revision: number;
  registry_epoch: number;
  credential_id: string;
  request_id: string;
  server_challenge: string;
  issued_at: number;
  expires_at: number;
  context_digest: string;
}>;

const invalid = () => new Error("Invalid authorization intent");
const integer = (v: unknown): v is number =>
  typeof v === "number" &&
  Number.isSafeInteger(v) &&
  v >= 0 &&
  !Object.is(v, -0);
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const identifier = (v: unknown) =>
  typeof v === "string" && /^[A-Za-z0-9:._/-]{1,128}$/.test(v);
const base64url = (v: unknown, min: number, max: number) => {
  if (
    typeof v !== "string" ||
    v.length > Math.ceil((max * 4) / 3) ||
    !/^[A-Za-z0-9_-]+$/.test(v)
  )
    return false;
  const bytes = Buffer.from(v, "base64url");
  return (
    bytes.length >= min &&
    bytes.length <= max &&
    bytes.toString("base64url") === v
  );
};

function schema(value: unknown): AuthorizationIntent {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).length !== FIELDS.length ||
    !FIELDS.every(
      (f) => descriptors[f]?.enumerable && "value" in descriptors[f],
    )
  )
    throw invalid();
  // Copy only data properties; never invoke request accessors.
  const p = Object.fromEntries(FIELDS.map((f) => [f, descriptors[f].value]));
  if (
    p.version !== 1 ||
    p.operation !== "withdraw" ||
    !identifier(p.audience) ||
    !identifier(p.owner_subject) ||
    !uuid(p.owner_id) ||
    !uuid(p.evidence_promotion_id) ||
    !uuid(p.request_id) ||
    !integer(p.revision) ||
    !integer(p.registry_epoch) ||
    !base64url(p.credential_id, 1, 1024) ||
    !base64url(p.server_challenge, 32, 32) ||
    !integer(p.issued_at) ||
    !integer(p.expires_at) ||
    p.expires_at <= p.issued_at ||
    p.expires_at - p.issued_at > 300 ||
    typeof p.context_digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(p.context_digest)
  )
    throw invalid();
  return Object.freeze(p) as AuthorizationIntent;
}

function timed(value: unknown, now: number): AuthorizationIntent {
  const p = schema(value);
  if (!integer(now) || p.issued_at > now || now >= p.expires_at)
    throw invalid();
  return p;
}

/** Canonical UTF-8 text, including domain; not an authenticated request. */
export function encodeIntent(value: unknown, now: number): string {
  return DOMAIN + JSON.stringify(timed(value, now));
}

/** Strict wire decoding rejects duplicate keys and alternate JSON representations. */
export function decodeIntent(wire: unknown, now: number): AuthorizationIntent {
  try {
    if (
      typeof wire !== "string" ||
      wire.length > 4096 ||
      !wire.startsWith(DOMAIN)
    )
      throw invalid();
    const p = timed(JSON.parse(wire.slice(DOMAIN.length)), now);
    if (encodeIntent(p, now) !== wire) throw invalid();
    return p;
  } catch {
    throw invalid();
  }
}

/**
 * Compare ALL fields to independently supplied expected context (never relay data).
 * Equality establishes only binding, not identity, key possession or authorization.
 */
export function decodeBoundIntent(
  wire: unknown,
  expected: unknown,
  now: number,
): AuthorizationIntent {
  const p = decodeIntent(wire, now);
  if (encodeIntent(expected, now) !== encodeIntent(p, now)) throw invalid();
  return p;
}
