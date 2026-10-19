# B4.2-B2.11 — Disabled durable synthetic owner credential registry

**Offline proof of concept. Production owner withdrawal remains disabled and NO-GO.**
This extends the security knowledge from the [independent authorization/key lifecycle POCs](README.md), [intent codec](../../../security/owner-authorization/README.md), [WebAuthn proof adapter](../../../security/owner-authorization/WEBAUTHN_PROOF.md), and [production isolation architecture](../../../docs/V8_B42_B2_8_PRODUCTION_AUTHORIZATION_ISOLATION_ARCHITECTURE.md). It protects future Validation evidence provenance and the Data Moat without changing application behavior or architectural layers.

Verified base: `1ed1c7bd06e4279498d5558c23b916576bcd3f11`, GitHub main including merged PR #227. Git transport was unavailable; GitHub integration verified the base and the eight additions since the supplied checkout. Those files were mirrored and their Git blob hashes matched before validation. They are baseline files, not changes in this PR.

## Scope and explicit trust inputs

`durable-registry.mjs` is a test-only opt-in factory, disabled unless `enabled: true`. Each disposable SQLite file pins **one exact lowercase owner UUID and independent synthetic subject** plus two distinct Ed25519 public authority keys. Opening with different bindings or roots fails; transition requests cannot choose another owner. Explicit `create: true` initializes a fresh schema and fails on existing tables; ordinary open never bootstraps missing/incomplete state into an active registry. No environment switch or production caller exists.

All factory arguments, time, file path, decision signers and credential generators belong to the privileged harness. They must never be relay/application inputs. Authority signatures model explicitly supplied independent evidence; they do not establish the real identity/consent process behind its issuance. The two pinned signing keys model distinct custodians, not actual organizational separation. A service_role, internal_test/internal_tester, application administrator, approval boolean or Auth session supplies no evidence. Possession of the simulated authority private keys is itself the privileged trust assumption.

The synthetic credential profile deliberately reuses B2.5's Ed25519 key validation. This is **not a WebAuthn credential registry or registration parser**. It stores canonical SPKI public PEM, canonical base64url credential ID and stable user handle; private keys exist only in test memory. No automatic conversion to B2.10 trusted context, intent verification/consumption, withdrawal authorization, database executor, application route or live integration exists.

## Transition contract

`registryTransitionBytes()` produces domain `SaaSScout:synthetic-durable-registry:v1\n` followed by compact JSON with exact ordered data fields: `version`, `action`, `ownerId`, `ownerSubject`, `expectedEpoch`, `requestId`, `issuedAt`, `expiresAt`, `credential`. Version is 1. Request IDs are 1–128 ASCII alphanumeric/underscore/hyphen characters; times are integer seconds, maximum validity 300 seconds, expiration exclusive. Epochs are safe nonnegative integers. UUID/subject/credential encodings and unknown/missing fields fail closed; noncanonical signed bytes deny. This domain never crosses into the production intent codec or the earlier withdrawal POC.

Evidence has exactly `{ request, approvals, ownerProof, possession }`. Signatures are canonical base64url Ed25519, verified with Node/OpenSSL. Two approvals appear in pinned-authority order for independent decisions; all unused proofs are explicit null/empty arrays. A replacement signs `possession\n` plus the entire canonical transition, so possession cannot be reused for another owner, key, epoch, action, time or request.

| Transition       | Preconditions and evidence                                                            | Result                                                          |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| enroll           | Empty registry; both independent signatures and new-key possession                    | Active at epoch 1                                               |
| rotate           | Active current key signs exact replacement; replacement possession                    | Old credential permanently rotated; new active; epoch +1        |
| revoke           | Active current key signs revocation                                                   | Current credential revoked; lookup denied; epoch +1             |
| begin-recovery   | Active or revoked; both independent signatures                                        | Pending recovery; lookup and rotation denied; epoch +1          |
| approve-recovery | Pending recovery; new decision signed by both authorities plus replacement possession | Lost predecessor revoked; distinct replacement active; epoch +1 |

Every credential ID and public key is permanently non-reusable, including after rotation/revocation; replacement handles must preserve the original owner handle. Recovery never activates a key merely on entering pending state. The approval explicitly binds the replacement, pending epoch and operation; missing independent proof or possession leaves it pending. No recovery cancellation, general key setter, root update, owner remapping or administrator override is exposed.

Lookup requires exact pinned owner/subject, current epoch, current credential ID and active state. It returns a frozen synthetic snapshot marked `productionAuthorization: disabled`. It grants no permission and does not lock future use against a later revocation. A future verifier/executor must coordinate consumption with transitions; snapshot lookup alone does not solve that race.

## Persistence, atomicity and audit

Uses Node built-in `node:sqlite`, WAL, `synchronous=FULL`, busy timeout and `BEGIN IMMEDIATE`. Each successful transition appends one event carrying complete signed evidence, predecessor/resulting epoch and trusted time, and updates the durable head in the **same SQLite transaction**. The event log is the sole source of credential state; there is no independently mutable credential projection. Compare-and-set is checked after obtaining the SQLite write lock. Primary-key epoch and unique operation ID constraints additionally reject conflicts/replays. Invalid attempts do not consume the operation ID. An insert/storage failure rolls back both history/head and all derived state.

Every open/read/write replays and validates the complete canonical audit, pinned identity, signatures, time at original acceptance, transition preconditions, contiguous epochs, request uniqueness and SHA-256 predecessor chain. Original expiry does not erase committed history. A durable head detects a missing event suffix. Current transition time cannot move backward relative to accepted history. Missing tables/config, malformed records, bad signatures, head/chain mismatch and partial/corrupt storage deny rather than rebuild active state.

API audit snapshots are deeply frozen; SQLite triggers prohibit event UPDATE/DELETE. Append-only and immutable describe the supported interface and schema, **not resistance to a database/host administrator**. Hashes are consistency checks, not independently protected checkpoints. An operator able to change schema/files/config can bypass triggers, replace trust roots or restore a coherent older database and head. Whole-store rollback/backup restore detection, power-loss guarantees, independent audit retention and multi-host coordination are unverified. No local persistence claim establishes production IAM isolation.

## Reproducible tests

Node.js 24+ with built-in SQLite; no dependency additions, network, secrets, real users or production services:

```sh
node --test --test-isolation=none tests/poc/independent-owner-authorization/durable-registry.test.mjs
node --test --test-isolation=none --loader ./tests/support/server-only-loader.mjs tests/owner-authorization-*.test.ts tests/poc/independent-owner-authorization/*.test.mjs
npx prettier --check tests/poc/independent-owner-authorization/durable-registry*.mjs tests/poc/independent-owner-authorization/DURABLE_REGISTRY.md
npx eslint tests/poc/independent-owner-authorization/durable-registry*.mjs
```

Tests use freshly generated synthetic keys and `mkdtemp` disposable local files, cleaned after each test. Actual writer/reader child processes exit and reopen the same SQLite file; competing child processes use independent SQLite connections with different operations at the same epoch. Exactly one wins. These are real persistence/concurrency checks, not mocks. The suite also covers enrollment/lookup, rotation, revocation/stale keys, pending/recovery approvals, admin/identity substitution, replay/duplicate IDs, immutable audit consistency, failed audit insert rollback, corruption/incomplete state, recomputed-hash tampering and missing audit suffix. It does not simulate power loss or restored backups.

## Remaining production gates and next step

No real independent identity/bootstrap, informed protected-origin consent, WebAuthn registration/custody, production IAM/CI/DNS isolation, trusted operational time, TLS, audit export, backup/restore policy, rate limits, crash reconciliation, SQL authorization or atomic coupling to Validation is verified. An administrator controlling this process/store can replace enforcement. Full-log replay and single-owner files are intentionally unsuitable as a production service design.

No migrations, Supabase access, routes/UI, historical activation, evidence mutation, polarity/canonical identity change, Knowledge Evolution consumers, deployment or merge. Existing evidence/lifecycle behavior is untouched. B2.8 remains NO-GO.

Smallest next step: a separately reviewed, disabled synthetic WebAuthn credential-registration/possession boundary and explicit adapter contract for registry epoch coordination, without enabling withdrawal. Production isolation needs separately authorized infrastructure and actual credential-denial tests, not another local success claim.
