# B4.2-B2.12 — Disabled synthetic registration and possession boundary

**Production owner withdrawal remains DISABLED and NO-GO.** Offline synthetic
identities/keys only. No routes, UI, Supabase changes, production migrations,
Validation promotion changes, Knowledge Evolution integration, merge or deployment.
This adds evidence-provenance security knowledge to protect the Data Moat; it
changes only the existing security test POC layer.

Base: GitHub main `1930517734b2634840446dae13f0328bc6d34a3c`, including merged
[PR #228](https://github.com/OsaRete/saasscout-landing/pull/228). Git transport was
unavailable; the GitHub integration supplied the eleven missing baseline files.
Their Git blob hashes were checked before publishing. They are not PR additions.

## Scope and trust

Builds on [durable registry](DURABLE_REGISTRY.md), [intent codec](../../../security/owner-authorization/README.md)
and [WebAuthn adapter](../../../security/owner-authorization/WEBAUTHN_PROOF.md).
`openSyntheticRegistry` remains disabled unless `enabled: true`; the existing
Ed25519 default profile/config bytes remain compatible. A separate disposable
store must explicitly pin `webauthn: { origin, rpId }` to select ES256 credentials.
Opening it with a different identity, origin, RP or custodian roots denies.
Two **Ed25519 simulated independent custodians** sign the exact canonical registry
transition, including pinned owner UUID/subject, proposed credential ID/public key,
stable handle, epoch, unique operation ID and expiration. No owner ID, role label,
service_role or internal tester claim substitutes for these signatures.

Custodian private keys, factory configuration, clock, storage, expected intent
and the synchronous registry verification hook are privileged harness inputs.
The harness can generate decisions because it controls those keys: this is
**simulated trusted enrollment authorization, not genuine independent identity
verification, production enrollment or informed owner consent**. Two generated
keys do not establish organizational separation. Actual administrative credentials
and IAM were not exercised. An administrator controlling the verifier/host/store
can replace enforcement. There is no production caller.

## Registration profile

`webauthn-registration.mjs` accepts JSON-safe base64url data with exact fields:
`{type, credentialId, clientDataJSON, attestationObject, possession}`. The first
four represent a restricted WebAuthn create response. `possession` contains a
fresh get response with credential ID, client JSON, authenticator data, signature
and mandatory matching user handle. Only canonical unpadded base64url is accepted.

This is deliberately **not a general CBOR/COSE or browser enrollment library**.
It accepts exactly one CBOR representation of `{fmt:"none", attStmt:{},
authData:bytes}`: the literal map prefix in source followed by a two-byte byte
string length and exact authenticator data. Only zero AAGUID, flags UP+UV+AT
(`0x45`), exact credential ID and canonical EC2/ES256/P-256 COSE map are supported.
The COSE coordinates must equal the independently approved canonical SPKI key.
Other formats/encodings/algorithms/extensions, reserved/backup flags and trailing
data deny. This narrow synthetic encoding can reject otherwise valid authenticators.
`fmt:none` provides **no device identity, hardware custody or identity attestation**.

Create and registration-possession challenges are separate SHA-256 hashes of:

```text
SaaSScout:synthetic-registration:create:v1\n + complete canonical registry request
SaaSScout:synthetic-registration:get:v1\n + complete canonical registry request
```

Here `\n` denotes one LF byte. Exact HTTPS origin, RP hash, ceremony type,
challenge, crossOrigin=false, UP/UV and credential identity are required. A create
response alone cannot activate a key: a real Node/OpenSSL ES256 verification of
`authenticatorData || SHA256(clientDataJSON)` proves possession of that key in a
fresh get ceremony. Registration signatures, complete proof and two approvals
remain in the immutable lifecycle event. Reopening/read revalidates them. Expired
historical proof remains historical; it never becomes a new authorization.
Rotation/recovery replacement also requires this registration/possession proof;
current-key lifecycle signatures use ES256 in the new profile. Custodians remain
Ed25519. No supported API resurrects a retired/revoked key or remaps its owner.

## Possession and coordination

`createSyntheticWebAuthnBoundary` also defaults disabled. `prove(bytes, assertion,
expectedIntent)` reuses the unchanged B2.9 codec and B2.10 ES256 verifier. Expected
intent is trusted verifier context, never copied from relay input in a real design.
The existing codec's `withdraw` operation is only a **synthetic proof input** here;
no command or withdrawal occurs. Registration uses its own domain, not that codec.

The registry's privileged `consumePossession` hook obtains `BEGIN IMMEDIATE`,
replays/validates current durable history, checks exact owner/subject/epoch/current
active credential, then runs the synchronous cryptographic adapter with the
persisted origin/RP and key. Verification and replay insertion finish before the
same transaction commits. Async callbacks are unsupported. The hook is a trusted
composition seam, not an authenticated public API; replacing its callback defeats
verification. Success returns only frozen `synthetic-possession-only` with
`productionAuthorization: disabled`, never transferable authorization.

Unique request IDs and derived challenges persist in a local append-only SQLite
table. Invalid proofs/storage errors roll back without consuming a valid attempt.
Duplicate proofs across processes have one winner, including after reopening.
Enrollment CAS and lifecycle updates use the same SQLite write lock. A revocation
committed before proof verification denies it; proof verification committed first
may succeed before revocation. After the transition commits, stale epoch/key proof
cannot succeed. There is no promise of retroactively cancelling prior proof results.
This proves a **local SQLite linearization boundary**, not a distributed executor
protocol or atomic coupling to Validation/Supabase.

## Validation

Node 24+, existing dependencies only:

```sh
node --test --test-isolation=none --loader ./tests/support/server-only-loader.mjs tests/poc/independent-owner-authorization/webauthn-boundary.test.mjs
node --test --test-isolation=none --loader ./tests/support/server-only-loader.mjs tests/owner-authorization-*.test.ts tests/poc/independent-owner-authorization/*.test.mjs
npx eslint tests/poc/independent-owner-authorization/{durable-registry,webauthn-registration,webauthn-boundary,webauthn-boundary.test}.mjs
npx prettier --check tests/poc/independent-owner-authorization/{durable-registry,webauthn-registration,webauthn-boundary,webauthn-boundary.test}.mjs tests/poc/independent-owner-authorization/WEBAUTHN_REGISTRATION.md
```

Tests generate synthetic keys in memory and use disposable real SQLite files,
Node/OpenSSL signatures and independent child processes/connections at a file
barrier. No persistence, signature or concurrency boundary is mocked. Tests cover
successful binding/possession, forged/missing approvals, owner/key substitution,
challenge/origin/RP/type/UP/UV failures, registration/proof replay, stale epochs,
unknown/retired/revoked/pending-recovery credentials, historical proof preservation,
concurrent enrollments, duplicate proofs and proof-versus-revocation serialization.

## NOT VERIFIED and smallest next PR

Real independent identity verification, protected-origin consent/display, browser
or hardware authenticator compatibility, device attestation/custody, counter/clone
detection, general CBOR/COSE, production IAM and real administrative credential
denial, monitored TLS/time, rate limits, multi-host coordination, crash/power-loss,
coherent database rollback/backup restore, independently retained audit checkpoints,
SQL execution/privileges and atomic Validation effects are **NOT VERIFIED**.
Host/database administrators can alter replay tables or restore old databases;
local triggers/hashes are not external rollback protection. Existing B2.8 gates
remain unsatisfied. Evidence polarity and historical production proof are untouched.

Smallest next PR: keep everything disabled and test this restricted profile against
a real browser virtual authenticator on a disposable protected HTTPS origin,
including create/get interoperability and signed negative cases. Use a reviewed
WebAuthn library before expanding the accepted registration profile. Real identity,
IAM isolation and executor coordination require separate work and review.
