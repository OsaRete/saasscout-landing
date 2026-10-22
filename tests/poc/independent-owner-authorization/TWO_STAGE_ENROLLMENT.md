# B4.2-B2.14 — Two-stage synthetic enrollment

**Production owner withdrawal remains DISABLED and NO-GO.** No production
caller, route, UI, migration, Supabase operation or authorization behavior is added.
This isolated test POC improves evidence-provenance security knowledge protecting
the Data Moat. Independent custodian approval remains **simulated**, not real
identity verification, organizational independence or production-grade consent.

Base: `a5b9813fa486fd86c36dca17c1084ab86b0759dd`, GitHub main including merged
PR #229. Draft PR #230 was inspected read-only and remains unmerged and unchanged.

## Transcript and trusted boundary

Both factories still require explicit `enabled: true`. Owner UUID/subject,
origin/RP, two distinct Ed25519 custodian roots, clock and database path remain
privileged harness configuration. A supplied owner ID, administrator role or
service-role key cannot authorize enrollment. Tests use only synthetic keys and
identities; actual administrative credentials/IAM are not exercised.

Stage A has two local operations before any browser credential is needed:

1. `prepareEnrollment({requestId, userHandle, expiresAt})` constructs a canonical
   credential-free request with pinned owner/subject, purpose `enroll`, current
   registry epoch, exact HTTPS origin/RP, stable user handle, current issuance time,
   expiry (at most 300 seconds) and `randomBytes(32)` nonce. Preparation grants no
   authority. Its domain is `SaaSScout:synthetic-enrollment-initiation:v1` plus LF.
2. Two pinned **simulated independent custodians** sign those exact bytes.
   `initiateEnrollment({request, approvals})` verifies both signatures and exact
   configuration, time and empty registry state under `BEGIN IMMEDIATE`, then
   durably appends the authorized session. Session ID and nonce are unique.
   Retry/replay denies. The privileged signer must use the prepared random nonce;
   cryptography cannot prove entropy supplied by a trusted signer.

Create uses `registrationChallenge(authorizedRequest, "create")`. Thus the unique
pre-creation challenge binds all approved context without a credential ID or key.
After creation the harness builds the canonical existing `registryTransitionBytes`
enroll request, using the session's identity, epoch, ID and times plus the newly
generated `{id, publicKey, userHandle}`. Get uses
`registrationChallenge(finalRegistryRequest, "get")`. This second challenge binds
that generated credential to the approved owner; no pre-generation key is needed.
The final request can be assembled from the returned canonical session and the
new credential with the existing codec; it is not independently authorized by a
client-supplied identity.

Before confirmation, the same two pinned simulated custodians approve the exact
`enrollmentConfirmationBytes(authorizedRequest, finalRegistryRequest)`: the
`SaaSScout:synthetic-enrollment-confirmation:v1` domain plus LF and canonical
JSON array of both transcripts. This preserves approval of the exact generated
key/ID. An exposed initiation transcript and attacker-controlled create/get cannot
substitute for this final approval. It adds no browser challenge dependency.

Stage B: `confirmEnrollment({sessionId, credential, proof, approvals})` loads the persisted
approval and builds that final request with pinned identity. No owner field is
accepted. The existing transition transaction rechecks signatures, persisted
session equality, initiation time, expiry, epoch and state, verifies the two final
custodian approvals over both transcripts, then verifies the
unmodified restricted create/get properties. Only the create challenge input now
selects the approved pre-creation transcript. Get still verifies a fresh ES256
signature with the generated key and matching mandatory user handle. Exact
challenge, origin, RP hash, credential ID, canonical P-256 COSE/SPKI equality,
UP/UV, flags, restricted CBOR, zero AAGUID and all prior checks remain required.
No parser compatibility relaxation is included.

The existing event `request_id UNIQUE` consumes the session ID in the same
`BEGIN IMMEDIATE` transaction that appends the registration event and updates
epoch/hash. There is no separately committed consumed flag: a session is consumed
when its matching event commits. Storage failures roll back both effects; identical
or conflicting concurrent confirmations have one winner. Duplicate credential/key,
conflicting handle, nonempty/stale/revoked/pending-recovery state deny. This new
path supports **initial enrollment only**; rotation/recovery retain existing
contracts and are not bypassed by initiation.

To reuse the existing strict event envelope, staged enroll events put the exact
`{request, approvals}` authorization in `ownerProof` and retain final confirmation signatures in top-level approvals.
Here `ownerProof` is an explicitly discriminated **custodian transcript**, not
an owner signature. Only `enroll` accepts this form; other lifecycle authorization
is unchanged. History retains the full session approval, final credential binding
and create/get evidence. Replay/open validates historical evidence at recorded
times, including its matching immutable session row. Expired historical enrollment
remains history, never new authorization.

The added SQLite table/triggers initialize only fresh disposable WebAuthn stores.
No existing store is migrated: old POC databases retain their prior behavior;
calling new session methods without the new table fails closed. Recreate a fresh
disposable store to exercise this protocol. Configuration bytes, registry epoch
semantics and the default Ed25519 profile are unchanged.

## Validation and limits

Run (Node 24+, existing dependencies):

```sh
node --test --test-isolation=none --loader ./tests/support/server-only-loader.mjs tests/owner-authorization-*.test.ts tests/poc/independent-owner-authorization/*.test.mjs tests/validation-promotion-foundation.test.ts tests/validation-promotion-dry-run.test.ts tests/validation-customer-interview-shareable-evidence.test.ts tests/trusted-qualified-evidence-reader.test.ts tests/qualified-evidence-integrity.test.ts
npx eslint tests/poc/independent-owner-authorization/{durable-registry,webauthn-registration,webauthn-boundary,webauthn-boundary.test}.mjs
npx prettier --check tests/poc/independent-owner-authorization/{durable-registry,webauthn-registration,webauthn-boundary,webauthn-boundary.test}.mjs tests/poc/independent-owner-authorization/TWO_STAGE_ENROLLMENT.md
```

Tests use actual Node/OpenSSL signatures, disposable SQLite files, independent
child processes/connections released at a file barrier, transaction failure
injection and reopen. They cover successful enrollment with a key generated after
initiation; wrong owner/subject/handle/purpose; challenge/origin/RP/UP/UV failures;
expired/replayed/missing sessions; duplicate credential and stale/nonempty state;
forged administrative approvals; revoked/pending-recovery state; immutable session
history; restart and competing confirmations with both identical and different
credentials. Administrative denial is only the **simulated pinned-key boundary**.

Execution evidence: baseline focused security **204/204 PASS**. Final combined
security and relevant Validation regressions **349/349 PASS**, zero skipped,
including seventeen new two-stage tests. Targeted strict TypeScript for unchanged
codec/adapter/tests, ESLint, Node syntax and Prettier: PASS. Repository lint: zero
errors, four warnings in unchanged application files. Full-project TypeScript:
175 existing diagnostics, identical to separately archived verified main after
normalizing its path prefix; no introduced diagnostics. Build attempted and failed:
Turbopack CSS processing cannot bind a port (`EPERM`), so successful build is
**NOT VERIFIED**. No browser ceremonies were executed in this task.

NOT VERIFIED: browser or hardware interoperability, general CBOR/COSE, genuine
independent identity/consent, production IAM, protected-origin display, device
attestation/custody/clone detection, monitored time/TLS, rate limits, distributed
execution, crash/power-loss or coherent backup rollback, external audit retention,
or atomic coupling to Validation/Supabase. Host/store administrators can replace
enforcement or roll back the entire store. Local tests do not clear production
gates. The restrictive existing parser may still reject browser encodings.

After this PR is reviewed and merged, PR #230's harness can be updated to initiate
before create, derive create from the session and get from the generated-credential
request, then confirm and run its durable authentication/replay matrix. That is
the smallest next step. Do not rewrite raw browser evidence or weaken checks to
force acceptance. Browser compatibility remains NOT VERIFIED until actually run
on a disposable protected HTTPS origin. Neither PR is merged or deployed here.
