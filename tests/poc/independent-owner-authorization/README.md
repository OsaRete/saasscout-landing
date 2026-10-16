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

## B4.2-B2.5 — Protected key lifecycle extension

Read against verified main `6abb508640c608bbcad346481c02d488157a5909`
(merged PR #221), together with B2.1–B2.3 linked above. B2.4's enrollment
limitations above describe the original fixed-map experiment. This extension
models lifecycle policy only; the real-world blockers remain **NOT VERIFIED**.
It improves security knowledge for Validation evidence provenance and the Data
Moat without changing any production architectural layer.

```sh
node --test --test-isolation=none tests/poc/independent-owner-authorization/*.test.mjs
```

`key-lifecycle.mjs` simulates an independent authority with a private registry,
version compare-and-set transitions and immutable audit snapshots. Enrollment
requires an opaque, single-use external decision binding action, independently
established owner, exact Ed25519 key, expected version and decision reference.
The decision issuer's `issue()` capability is **privileged test-harness input**:
calling it explicitly assumes independent authentication has already happened.
It never examines Supabase Auth or automatically equates an Auth subject with
independent owner control. A copied token, approval boolean, email-recovery
claim, service_role string or caller owner ID is not a decision. These tests do
not exercise actual Supabase privileges.

Owner rotation uses the existing B2.4 canonical signing helper and domain with
operation `rotate-key`, audience `saasscout:offline-key-lifecycle:v1`, registry
version in `revision`, and SHA-256 SPKI replacement fingerprint in the
`evidence_promotion_id` slot. Other fields retain their codec/time semantics.
This reuse is a restricted offline contract, not a production protocol.
Only the active key may sign a rotation; the new key is accepted only when its
fingerprint is covered by that signature. Old keys become explicitly revoked
in history and cannot be reactivated. There is no general key setter.

Loss handling requires an independent decision even to begin recovery (avoids
unauthenticated suspension). It enters `pending recovery`; all owner withdrawal
and rotation verification then fails. A separate independent recovery decision
at the pending version is necessary to activate a distinct replacement and
record revocation of the old key. No silent replacement, email-only recovery,
Auth-admin approval or service-role approval is supported. Conflicting/replayed
transitions fail. The audit records owner, version/predecessor, key state and
fingerprint, transition kind, decision/request reference and synthetic time.
Only synthetic identities and in-memory generated keys are used.

The new verifier captures trusted evidence/owner/revision/audience bindings and
reads current registry state on each request. The application supplies only the
original B2.4 envelope, never registry state or keys. It reuses B2.4 verification
and a shared replay store, checking the registry version again at synchronous
consumption. Verification linearizes at consumption; later transitions do not
retroactively cancel an earlier decision. No withdrawal is executed.

**PASS — isolated tests:** explicitly authorized enrollment; unauthorized and
foreign-issuer enrollment rejection; service-key substitution and forged-owner
rejection; active-key rotation; unrelated/stale/revoked-key rejection; pending
recovery denial; independent-only recovery with version history; replay and
conflicting transition rejection; trusted-registry-only withdrawal verification.
Audit and registry mutation, key resurrection, and cross-operation proof reuse
are denied by the modeled interfaces. Factory inputs remain trusted.

**External assumptions and required separation:** a real authority must
independently establish the actor's right to control the persisted workspace
owner, informed enrollment/recovery consent, exact key binding and possession,
freshness, decision scope, expiry/revocation and accountable recovery review.
This simulation does not choose a production identity-verification process or
implement new-key proof of possession. Recovery must remain unavailable until
that policy is reviewed. Same-project Auth identity or email access alone is
insufficient.

At minimum, registry writes, decision issuance and verifier deployment/config,
trusted time, replay storage and audit retention need separately controlled
credentials, IAM, CI/CD and infrastructure administration. SaaSScout application
administrators, Supabase service_role/Auth admins and application-database
administrators must have no ability to issue decisions, replace keys/trust roots,
change verifier code/policy, impersonate its workload identity or rewrite its
state/audit. A second same-project service key or process under the same
administrator does not establish this separation. The application gets only a
verification client; the verifier gets registry read access, not decision-issuer
credentials. Protect the eventual enforcing executor and its authenticated
channel too: an application-supplied `verified: true` is never authority.

**NOT VERIFIED:** real independent enrollment/recovery; credential and
infrastructure isolation; verifier compromise resistance; operational security;
production database enforcement. All capabilities here share one JS process.
The privileged harness can replace everything. History, versions and replay
are in memory, atomic only in one isolate, not durable across restarts/workers;
there is no persistent transaction, denial audit, rate limiting, receipt signing
or database coupling. An administrator controlling enforcement can bypass it;
an external authoritative event/consumption boundary is needed if database
administrators are adversaries. Offline passes do not establish production-ready
authorization and do not clear B2.3's NO-GO.

**Smallest disposable integration test:** separately authorize two isolated
workloads with independent admin/IAM and synthetic accounts only: a minimal
registry/verifier and an adversarial application client. Prove the app's actual
credentials cannot enroll, overwrite, recover, redeploy or impersonate the
verifier; test rotation/loss/recovery and stale requests over an authenticated
channel with durable atomic version/replay history and restart/race tests.
Record the independently reviewed enrollment/recovery decision source instead
of assuming it. Keep the outcome a verification receipt; no Validation withdrawal
execution. Database lifecycle enforcement and B2.2's full disposable
PostgreSQL/PostgREST matrix remain separate later gates. No production/staging,
real provisioning/enrollment, endpoints, migrations, backfill, Knowledge
Evolution integration, merge or deployment is included here.
