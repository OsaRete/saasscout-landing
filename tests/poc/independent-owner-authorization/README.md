# B4.2-B2.4 — Independent owner authorization POC

**Offline security experiment. NO-GO for production withdrawal.** No application imports, endpoints, SQL, enrollment, withdrawal execution or deployment are included. Uses only Node.js built-ins; synthetic identities and Ed25519 key pairs are generated in test memory, never persisted. No Supabase client, environment credentials, network or real secrets are used by the proof/tests.

Run from the repository root (Node.js 20+):

```sh
node --test tests/poc/independent-owner-authorization/authorization.test.mjs
```

## Context and purpose

Read against GitHub main `82f7d590c767e3d370b471745ce60cd4a75a89cd`, including merged PR #220:

- [B2.1 lifecycle contract](../../../docs/V8_B42_B2_1_VALIDATION_LIFECYCLE_CONTRACT.md)
- [B2.2 owner identity and historical eligibility](../../../docs/V8_B42_B2_2_OWNER_IDENTITY_HISTORICAL_ELIGIBILITY.md)
- [B2.3 owner trust-boundary audit](../../../docs/V8_B42_B2_3_OWNER_TRUST_BOUNDARY_AUDIT.md)

The experiment tests a narrow independent owner-held signing factor, assuming an already trusted enrollment. A service-role credential is not an Ed25519 owner private key. Supplying a synthetic service credential as a signing key, using it as an HMAC secret, or signing with an attacker's key cannot produce an accepted owner authorization under the pinned public key. This illustrates cryptographic separation; it does **not** test actual Supabase credential powers or prevent an administrator from replacing enrollment or bypassing verification.

This improves understanding of how future Validation evidence provenance could be protected, strengthening the Data Moat security design. It changes no architectural layer or current evidence behavior; the proof remains disconnected from production and Knowledge Evolution.

## Versioned contract and trust boundary

The signed bytes are UTF-8 `SaaSScout:owner-authorization:v1\n` followed by compact JSON in this exact order:

`version`, `owner_id`, `evidence_promotion_id`, `operation`, `revision`, `request_id`, `audience`, `issued_at`, `expires_at`.

Version is integer `1`; revision is a nonnegative safe integer representing the expected lifecycle revision. Timestamps are nonnegative integer Unix seconds. Identifiers, operation and audience are 1–128 ASCII characters from `[A-Za-z0-9:._/-]`. The maximum lifetime is 300 seconds; no future issuance or clock-skew allowance is accepted. Expiration is exclusive. This is a deliberately restricted codec, not general JSON canonicalization: alternate ordering/whitespace, duplicate keys, unknown/missing fields, alternate numeric forms and unsupported versions are rejected.

The envelope contains only the canonical payload string and a canonical unpadded base64url Ed25519 signature. The signing helper enforces the codec; the verifier additionally requires operation `withdraw` and exact trusted owner/evidence/revision/audience bindings. Keys and algorithm cannot be supplied by the request. A verifier captures a copy of the pre-enrolled public-key map and expected binding at construction. **Its factory arguments, clock and replay store are privileged harness inputs.** Exposing factory configuration to a caller would invalidate this proof. Expected ownership and revision are synthetic fixtures here, not database facts.

After all validation succeeds, the verifier atomically consumes the globally single-use request ID in a shared test store and returns the frozen intent. It performs no withdrawal. Invalid attempts do not consume IDs. A successful retry is rejected in this experiment; a future B2.2 database command may acknowledge an exact previously committed operation, without executing it twice.

## PASS — isolated properties covered by tests

- Valid owner intent succeeds; deterministic encoding includes every required field and version/domain separation.
- Another owner's key, unknown owner, tampering with every intent field, and genuinely signed wrong owner/evidence/operation/revision/audience fail.
- Expired/future-dated, malformed, unsupported or noncanonical payloads/signatures fail, including malformed payloads signed by the real fixture key.
- Caller key substitution and mutation of the original enrollment map cannot replace the verifier's enrolled key.
- Replay fails; 64 concurrent calls through two verifiers sharing one store yield exactly one success.
- Synthetic service-role forgery attempts fail without consuming the legitimate authorization.

These are offline cryptographic and isolated harness properties only. A passing test is never proof of production-ready independent owner authorization.

## NOT VERIFIED — remaining security blockers

**Enrollment, rotation, revocation and protected recovery are NOT solved.** Real enrollment must independently authenticate owner consent and protect the owner-to-key mapping from application/service credentials and the adversaries in scope. Recovery or rotation that an Auth administrator can perform alone would recreate the impersonation problem even though signature verification works. No real user enrollment or key custody design is selected here.

**Durable atomic replay prevention is NOT solved.** The Set performs check-and-insert without yielding in one JavaScript isolate. All verifiers must share it; processes, workers and restarts do not share knowledge. A test deliberately demonstrates acceptance after a fresh store. The store has no persistence, expiry cleanup, capacity control or rollback. Production needs a durable uniqueness constraint/atomic consume coordinated with the authorized lifecycle transaction and exact-retry semantics; otherwise failures, races or restarts can lose intent or execute twice. Consuming a request before an unrelated database write is insufficient.

**Production credential isolation, real database authorization and operational security are NOT VERIFIED.** This experiment does not exercise Auth-admin session/link issuance, password reset, MFA recovery, grants/RLS, effective roles, wrappers, lifecycle authority, persisted lineage, revision races, current-read exclusion, historical compatibility or database concurrency. No production/staging access was used. Existing promotion semantic-trust limitations remain unchanged. No historical activation/backfill, polarity change or Knowledge Evolution integration is authorized.

**Database-administrator and compromised-verifier resistance are NOT established.** An operator controlling the verifier can skip checks, replace the registry/clock/store or falsely report success. A database administrator can alter guards or mutate lifecycle state directly. Keeping an owner private key separate does not itself protect the enforcement infrastructure. Defending against these actors requires an independently protected authorization/consumption boundary and potentially an external authoritative event record, with a reviewed threat model.

## Before any production integration

1. Review the adversary model and independently protected enrollment, owner binding, custody, key rotation/revocation and recovery design. Demonstrate that the application service credential and relevant Auth administrators cannot obtain accepted owner proof or replace the mapping.
2. Specify a protected verifier/executor, deployment and audit controls, trusted time, bounded requests and durable atomic replay/transaction semantics. Confirm actual credential separation in a separately authorized disposable environment using synthetic accounts.
3. Implement and test least-privilege database authorization, persisted owner/evidence/revision checks and atomic lifecycle changes. Pass B2.2's disposable PostgreSQL/PostgREST matrix, integrity/current-reader consistency and conservative historical compatibility gates before considering endpoint enablement.

**Smallest next step:** a documentation-only enrollment/recovery and verifier trust-boundary design naming which administrators are in scope, who can change mappings, and the acceptance tests for compromise/recovery. Keep withdrawal disabled; this proof does not clear B2.3's NO-GO.
