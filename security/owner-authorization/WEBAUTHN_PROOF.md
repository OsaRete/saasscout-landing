# Disabled independent owner WebAuthn proof adapter

B4.2-B2.10 is an isolated server-only offline foundation for [B2.8](../../docs/V8_B42_B2_8_PRODUCTION_AUTHORIZATION_ISOLATION_ARCHITECTURE.md). **Production owner withdrawal remains disabled and NO-GO.** No application consumer, endpoint, network lookup, registry mutation, lifecycle operation, database grant or deployment is added. This improves evidence-provenance security knowledge and protects the Data Moat without changing current application behavior.

`verifyWebAuthnProof(intentBytes, assertion, trustedContext)` accepts exact B2.9 canonical UTF-8 bytes as a Uint8Array (including Buffer). It reuses `decodeBoundIntent`, comparing every field to the independently supplied expected intent and enforcing explicit trusted Unix time. Invalid input/context throws only `Invalid WebAuthn proof`. Success returns a frozen `{ kind: "webauthn-proof-only", productionAuthorization: "disabled" }`, never a receipt or executable authorization.

## Privileged context, never relay configuration

The caller must be a future independently protected service. `trustedContext` is an exact data record with `expectedIntent`, `now`, `origin`, `rpId`, `registry`. These arguments are privileged synthetic harness inputs here; this function cannot authenticate their source. Copying request values into them defeats the boundary. No application owner identity, Supabase service_role, internal_tester, approval boolean or ordinary Auth session supplies independent authority. Labels alone neither prove nor disprove identity; the protected mapping and pinned key are required.

`registry` contains `ownerSubject`, `ownerId`, `epoch`, `status`, `credential`. Both mapping values and epoch must equal the bound intent. Registry status must be `active`; pending recovery and unknown states deny. The enrolled credential has `id` (binary), `type` (`public-key`), `algorithm` (`-7`), `publicKey` (Node public KeyObject, EC prime256v1 only), `userHandle` (1–64 bytes), `status` (`active`), and `epoch` (equal to registry epoch). Credential ID must match both intent and assertion. Public key and algorithm never come from the assertion. Only a current independently authenticated registry read can make these inputs meaningful; a supplied snapshot is not proof of freshness or coordination with revocation.

## Deterministic challenge and standard WebAuthn signature

Challenge bytes are exactly:

```text
SHA-256(ASCII("SaaSScout:owner-webauthn-challenge:v1\n") || canonicalIntentBytes)
```

The concatenation includes the entire codec domain and canonical JSON, without reserialization, truncation or an added separator. The fixed domain ends in one LF byte. `deriveWebAuthnChallenge(bytes, now)` validates the codec/time and returns those 32 bytes. Send their canonical unpadded base64url representation as the WebAuthn challenge. The intent already includes the protected service's 32-byte nonce, audience, credential, subject/owner, target, operation, revision, epoch, request, time and displayed-context digest. Determinism provides binding, not nonce issuance, freshness storage, honest display or single use.

The signature verifies the standard WebAuthn message `authenticatorData || SHA-256(clientDataJSON)` using ES256 (ECDSA P-256 with SHA-256, strict ASN.1 DER r/s). Node/OpenSSL performs signature verification; this is not a custom signature protocol. No suitable WebAuthn library is already installed, so no new dependency or general COSE/enrollment parser is introduced. The independently enrolled key must already have been validated by a future registration boundary. Out-of-range, negative, zero, nonminimal and trailing DER encodings deny; both valid high-S and low-S signatures are supported.

## Intentionally restricted assertion profile

The exact assertion record is `{ type, credentialId, response }`; `response` is `{ clientDataJSON, authenticatorData, signature, userHandle }`. All binary fields are Uint8Array/Buffer, not permissively decoded strings. Credential ID is 1–1024 bytes; client data is 1–4096 bytes; signature is 8–72 bytes. User handle must match enrollment when present; explicit null supports non-discoverable credentials pinned by their ID/key. Missing handle is rejected.

Client JSON must be valid UTF-8 and contain exactly `type`, `challenge`, `origin`, `crossOrigin`. Require `webauthn.get`, exact configured HTTPS origin, exact derived base64url challenge and `crossOrigin: false`. No topOrigin, tokenBinding, extra fields or cross-origin ceremony is supported. JSON member ordering/spacing need not be canonical: the signature hashes the exact original bytes. The trusted origin must itself be an exact URL origin with no credentials/path/query, and its hostname must equal or be beneath the independently configured lowercase RP ID. RP configuration is privileged, not inferred from the request; public-suffix/ownership validation remains a deployment responsibility.

Authenticator data must be exactly 37 bytes: SHA-256 of the configured RP ID, flags, and four-byte unsigned signature counter. Require UP and UV; reject every other flag, including attested data, extensions, reserved bits and BE/BS. This excludes synced passkeys in the initial profile but **does not prove hardware custody or attestation**. Signature counters are signed but are not compared or stored; no clone detection is claimed. Real browser/authenticator compatibility, broader algorithms/extensions and registration belong to separately reviewed work.

## Offline validation and limits

```sh
node --test --test-isolation=none --loader ./tests/support/server-only-loader.mjs tests/owner-authorization-webauthn-proof.test.ts tests/owner-authorization-intent-codec.test.ts tests/poc/independent-owner-authorization/*.test.mjs
```

The fixed JSON fixtures contain only synthetic intent, public keys and precomputed standard ES256 signatures. Tests require no private keys, random generation, real credentials, live authenticator, Supabase or external service. Signed negative fixtures change challenge/origin/type/RP/flags; other tests cover signature/key substitution, mappings, registry states, expiry, malformed encodings, missing context and service/test claims. These prove local cryptographic checks under injected trust, **not real production identity isolation**.

A valid WebAuthn signature does not establish independent enrollment, recovery security, durable replay prevention, current lifecycle eligibility or database authorization. No durable registry, monotonic epoch source, revocation serialization, replay store, atomic transaction, current reads, protected confirmation UI, monitored time/TLS/audit, actual IAM/credential isolation or crash/restore behavior is implemented. A compromised context supplier/verifier can replace keys or skip checks. No synthetic test clears B2.8 enablement gates.

Smallest next implementation PR: disabled durable synthetic owner registry lifecycle with independently injected decisions, versioned mapping/credential status, immutable audit and offline/disposable-store concurrency/restart tests. Keep enrollment policy, real infrastructure, executor, migrations and production consumers separately gated. Production remains NO-GO until all boundaries are independently implemented, tested and approved.
