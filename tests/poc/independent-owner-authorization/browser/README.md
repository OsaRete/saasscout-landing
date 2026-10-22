# B4.2-B2.15 — disabled two-stage browser interoperability

**Production owner withdrawal remains DISABLED and NO-GO.**
Synthetic custodian approval is not real independent identity verification.
Only isolated test POC infrastructure and documentation change. No production
behavior, dependencies, Supabase, Validation workflows or Knowledge Evolution changes.
This improves evidence-provenance security knowledge protecting the Data Moat.

Verified main: `e4d187230e8736e6ffa2a444434093c10b49181f`, including merged
PR #231. Read [the merged protocol](../TWO_STAGE_ENROLLMENT.md).
PR #230 was inspected read-only at `8e83d761bab2f4868ce85208ca2d99869421e67d`;
it remains open, draft, unmerged and unchanged. This separate branch ports only
its two browser files. Git transport cannot connect to the runtime proxy;
the GitHub integration supplies hash-verified merged files and publishes directly
parenting verified main.

## Protocol and coverage

Prepare a credential-free session, obtain two pinned synthetic custodian signatures
and persist initiation before `navigator.credentials.create()`. Create uses the
approved session challenge. The raw generated ID and SPKI key form the final
canonical binding; `navigator.credentials.get()` signs its possession challenge.
Both custodians approve `enrollmentConfirmationBytes(initiation, finalRequest)`.
Confirm through the existing two-stage registry contract without modifying it.
The restricted test-only attestation decoder additionally accepts Chromium's
short-form byte-string length; legacy synthetic fixtures remain readable.

The positive requires raw browser enrollment, exact registered credential, epoch
and immutable authorization history. Negatives cover missing final approvals,
a second browser key with matching create/get but the first key's approvals,
credential/handle/owner substitution, tampered create challenge, invalid possession
signature and expiry. A competing authorized session has its own browser create/get
and final approvals; after the winner enrolls, it must reject stale epoch/nonempty
state. Initial enrollment cannot isolate these two state conditions. Duplicate
confirmation and initiation replay reject after reopen with unchanged history.

Authentication covers valid signature, wrong origin/RP, owner, credential
identity/status, stale epoch, browser-signed wrong challenge, signature/data tampering,
missing UP and an actual missing-UV get. The durable boundary must accept the enrolled
credential once, then reject replay immediately and after SQLite reopen.
Adapter context negatives supplement the durable checks; they are privileged test
inputs, not production IAM tests. A failed enrollment positive fails the suite and
stops durable checks. No conditional replay skip or known-failure exemption remains.

Existing strict origin, RP, challenge, signature, UP/UV, COSE/SPKI identity, owner,
expiry, epoch and replay verification remains unchanged. Raw browser responses are
never rewritten for acceptance; deliberate mutations occur only in negative cases.
The restricted map, COSE, required client JSON bindings, flags and zero-AAGUID
profile remain enforced. Registration client JSON additionally permits only the
exact Chromium marker described below; other extra fields remain prohibited. The only added encoding is a definite `bstr8` length alongside existing
`bstr16`, with exact payload length and no trailing bytes. No general CBOR parser.

Uses existing Playwright, Chromium CDP CTAP2/internal, resident credentials, UV and
automatic presence on disposable loopback HTTPS. Gets pin the intended credential
ID to avoid selection ambiguity with multiple resident keys. Only the disposable
browser context ignores its certificate trust error. No application-facing API.
Default gate skips before reading TLS files or binding listeners. Explicit setup
errors fail; there is no mocked fallback.

## Diagnosis of the first local run

User-reported Windows PowerShell 7.6.7 / Node 24.11.1 / Playwright 1.61.1 /
Chromium 149.0.7827.55 actually ran create/get. Four negative subtests passed;
positive confirmation failed at `durable-registry.mjs:466`, epoch stayed zero,
and the process was interrupted after approximately 33 minutes. Passing negatives
against an incompatible positive do not establish interoperability.

The final request, session identity/times/epoch and final synthetic approvals
match the two-stage contract. `transition()` deliberately hides the underlying
error after rollback. A deterministic **test-only parser defect** can reproduce this
failure: the old fixed prefix requires `authData`'s `59` two-byte CBOR length.
Chromium's 32-byte credential ID plus 55-byte header and 77-byte ES256 COSE key
produces 164 bytes, serialized as `58 a4`, not legacy fixture `59 00 a4`.
See Chromium 149's [key handle construction](https://github.com/chromium/chromium/blob/149.0.7827.55/device/fido/virtual_ctap2_device.cc)
and [CBOR writer](https://github.com/chromium/chromium/blob/149.0.7827.55/components/cbor/writer.cc).
No raw evidence from that Windows run was supplied, so this proves a compatibility
blocker consistent with the stack, not that it was the only local failure.

An offline synthetic fixture with `58 a4` reproduces the same line-466 failure
against the old verifier and passes after the bounded length-decoding fix. The
new tests also reject malformed/truncated/trailing/indefinite/32-bit envelopes,
wrong challenge/origin/RP/UP/UV/possession and verify restart/replay. These are
**offline regression results, not browser execution**. No browser evidence is
rewritten, and no signatures, challenges, identity/owner bindings, epochs, time
or SQLite checks are bypassed.

The browser positive now invokes the same strict verifier before confirmation
and emits only a fixed stage label on rejection. The registry's masked errors
and transaction behavior remain unchanged; diagnostics print no credential ID,
key, nonce, signature or full response.

The hang is consistent with FIFO `after` hooks waiting for `server.close()` while
Chromium still owns HTTPS connections; its later close hook cannot run yet.
Teardown now destroys tracked TCP connections (including unfinished TLS handshakes)
when closing the server, so it cannot wait for the later browser hook. Browser
closure also closes its pages, contexts and virtual authenticators. Registry
closure now precedes temporary-directory removal, important on Windows.
The second user-reported local run below exited normally, supporting this cleanup fix.

Chromium also replaces a resident key when another is created for the same RP
and user handle. Competing-key ceremonies now use a separate page-scoped virtual
authenticator so later authentication can still use the winning key. This changes
only the test topology, not evidence or owner identity.

## Second local run and diagnostic-only follow-up

At `4a2edeb`, the user again actually ran Chromium 149.0.7827.55 on Windows
(PowerShell 7.6.7, Node 24.11.1, Playwright 1.61.1). Four negative subtests passed,
positive enrollment failed with `synthetic-registration:encoding`, epoch stayed
zero, and the process **exited automatically**, code 1, in approximately 6.3 seconds.
The earlier shutdown hang appears resolved. The browser positive and durable
replay checks remain unverified; the negative passes alone establish no compatibility.

The remaining `encoding` label is shared by record/schema checks, canonical
base64url and size checks, configuration, and credential type/identity checks.
It does **not** uniquely identify a CBOR encoding problem. The existing `bstr8`
fix retains its bounded map and exact length/COSE verification, but this result
does not establish whether the failing run reached that decoder. Without a
specific structural failure, another acceptance change would be guesswork.

At `edcab2c`, that follow-up changed **diagnostics only** (historical behavior;
the current exact marker rule is described below). Every former generic path has a
fixed check label scoped to its input. UTF-8 and JSON decoding errors are also
sanitized so native errors cannot quote input. Example labels (all prefixed
`synthetic-registration:`):

| Label or suffix                                                  | Failed structural check                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `create-client-unexpected-field` / `get-client-unexpected-field` | Exact client JSON schema has an extra property; its name/value is not logged                       |
| `create-client-unexpected-top-origin`                            | Sole extra property is the fixed known name `topOrigin`; value is not logged                       |
| `create-client-unexpected-extension-marker`                      | Sole extra property is the fixed known name `other_keys_can_be_added_here`; value is not logged    |
| `*-object`, `*-missing-field`, `*-field-descriptor`              | Plain-object, required-field or enumerable data-property constraint                                |
| `*-base64url-alphabet`, `*-base64url-canonical`                  | URL-safe alphabet or canonical encoding constraint                                                 |
| `*-encoded-size`, `*-decoded-size`                               | Existing size bounds; context identifies client JSON, attestation, authenticator data or signature |
| `create-client-utf8`, `create-client-json`                       | Fatal UTF-8 decoding or JSON syntax                                                                |

The corresponding get-client labels use the same checks. The known optional
property names above are diagnostic categories, **not observed browser evidence**.
At that commit they remained rejected. No schema fields, size limits or encoding
forms were newly accepted by that diagnostic-only update. The restricted decoder, crypto, owner/time/epoch/replay/SQLite checks,
and now-working browser/HTTPS teardown are unchanged in this follow-up.

Two deterministic offline tests cover the formerly ambiguous failure categories,
confirm that arbitrary field names/values and malformed JSON payloads are absent
from error output, reject all bad evidence without consuming authorization, and
then accept untouched valid signed evidence. These synthetic examples reproduce
the diagnostic ambiguity, **not the unknown Chromium incompatibility**. A regression
for the actual incompatibility must follow its identification and precede any
acceptance change.

Run the exact PowerShell block below again. Report only the fixed
`Raw browser evidence rejected: synthetic-registration:...` line, pass/fail summary,
exit code, duration, and whether exit was automatic. Do not dump response JSON,
keys, credential IDs, signatures, challenges, nonces or attestation objects.
A further local run is required; PR remains Draft / NO-GO.

## Third local run: exact Chromium marker compatibility

The third actual user-reported run at `edcab2c` identified
`synthetic-registration:create-client-unexpected-extension-marker`.
Windows PowerShell 7.6.7 / Node 24.11.1 / Playwright 1.61.1 / Chromium
149.0.7827.55: four negative subtests passed, positive enrollment failed,
exit code 1, normal automatic exit in approximately 2.8 seconds.
This identifies the rejected member name, not its value; the profile now validates
the value explicitly rather than assuming that browser evidence is trustworthy.

[WebAuthn Level 3 §5.8.1](https://www.w3.org/TR/2026/REC-webauthn-3-20260825/#dictdef-collectedclientdata)
describes an extensible JSON key/value mapping and tolerance for unknown keys.
[Its serialization algorithm](https://www.w3.org/TR/2026/REC-webauthn-3-20260825/#clientdatajson-serialization)
includes remaining members after the core bindings. The name
`other_keys_can_be_added_here` and its value are **not standardized WebAuthn fields**.
[Chromium 149's serializer](https://github.com/chromium/chromium/blob/149.0.7827.55/components/webauthn/core/browser/client_data_json.cc)
adds this GREASE-style member with 20% probability, as an optional top-level
JSON string property with exactly this public implementation constant:

```json
"other_keys_can_be_added_here": "do not compare clientDataJSON against a template. See https://goo.gl/yabPex"
```

The observed failure is an overly restrictive synthetic client-data schema. The
small correction permits absence or this **one exact name/string pair** in both
registration create and possession get client data. Other values (including other
strings, whitespace changes, null, booleans, numbers, arrays and objects) reject.
All four core fields remain mandatory; unexpected keys and `topOrigin` still reject.
This is deliberately narrower than general WebAuthn extensibility, not a claim
of complete browser/specification support. Generic data records remain exact.

Validation returns the original UTF-8 bytes. The marker is neither removed nor
normalized before the possession signature hash; insertion/removal/whitespace
changes without re-signing reject. No change to challenge/origin/RP/COSE-SPKI,
UP/UV, owner, expiry, epoch/replay, SQLite integrity, CBOR or browser teardown.
No raw client data or other evidence is logged.

The new offline regressions first failed against `edcab2c`, then passed after
this rule. They cover all create/get presence combinations with bstr8/bstr16,
malformed values and JSON, extra keys/types, topOrigin, wrong bindings/flags,
raw-signature tampering, credential/owner substitution, expiry, stale sessions,
retained evidence/reopen/replay. They are **synthetic offline verification**, not
execution of Chromium after this fix.

Remaining compatibility boundary: the shared authentication adapter
`security/owner-authorization/webauthn-proof.ts` still enforces its original
four-field client JSON schema. A marker in a later authentication assertion may
therefore reject even after enrollment succeeds. That adapter is unchanged here;
no signed JSON is stripped or re-signed to bypass it. Record any later failure
separately. The real Chromium enrollment and durable replay matrix must all pass
before reconsidering Draft / NO-GO, with automatic process exit still required.

## Exact Windows PowerShell execution

Use PowerShell 7 / .NET 8+ and Node.js 24, starting in your local repository.
For the existing checkout and installed Chromium, run this rerun block in the
VS Code terminal at the repository root. Dependencies are unchanged. The one-day
certificate stays outside the repo;
no machine trust store changes.

```powershell
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
git switch codex/b42-b215-two-stage-browser-interop
if ($LASTEXITCODE -ne 0) { throw 'Branch switch failed' }
git pull --ff-only origin codex/b42-b215-two-stage-browser-interop
if ($LASTEXITCODE -ne 0) { throw 'Branch update failed' }
$fixtureDir = Join-Path ([IO.Path]::GetTempPath()) ('browser-webauthn-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $fixtureDir | Out-Null
$rsa = [Security.Cryptography.RSA]::Create(2048)
$req = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost', $rsa, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
$san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddDnsName('localhost')
$req.CertificateExtensions.Add($san.Build())
$cert = $req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1), [DateTimeOffset]::UtcNow.AddDays(1))
$certPath = Join-Path $fixtureDir 'localhost.pem'
$keyPath = Join-Path $fixtureDir 'localhost-key.pem'
[IO.File]::WriteAllText($certPath, $cert.ExportCertificatePem())
[IO.File]::WriteAllText($keyPath, $rsa.ExportPkcs8PrivateKeyPem())
try {
  $env:BROWSER_WEBAUTHN_POC = '1'
  $env:BROWSER_POC_CERT = $certPath
  $env:BROWSER_POC_KEY = $keyPath
  node --loader ./tests/support/server-only-loader.mjs --test --test-isolation=none tests/poc/independent-owner-authorization/browser/interop.test.mjs
  $testExit = $LASTEXITCODE
} finally {
  Remove-Item Env:BROWSER_WEBAUTHN_POC, Env:BROWSER_POC_CERT, Env:BROWSER_POC_KEY -ErrorAction SilentlyContinue
  $cert.Dispose()
  $rsa.Dispose()
  Remove-Item -Recurse -Force $fixtureDir
}
if ($testExit -ne 0) { throw "Interop probe failed (exit $testExit); inspect TAP; keep draft and inspect the failing strict check" }
```

Run regressions from the same VS Code terminal:

```powershell
node --test --test-isolation=none --loader ./tests/support/server-only-loader.mjs "tests/owner-authorization-*.test.ts" "tests/poc/independent-owner-authorization/*.test.mjs" tests/validation-promotion-foundation.test.ts tests/validation-promotion-dry-run.test.ts tests/validation-customer-interview-shareable-evidence.test.ts tests/trusted-qualified-evidence-reader.test.ts tests/qualified-evidence-integrity.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Focused regressions failed' }
npx eslint tests/poc/independent-owner-authorization/browser/interop.test.mjs
npx prettier --check tests/poc/independent-owner-authorization/browser/interop.test.mjs tests/poc/independent-owner-authorization/browser/README.md
npm run lint
npm run build
```

## Execution evidence and merge gate

Exact-marker follow-up executed in Cloud on Node 24.19.0:

- Focused security plus relevant Validation/integrity/reader regressions:
  **362/362 PASS** (including three new marker tests, the eight short-form cases and two diagnostic tests), zero failures/skips.
- Default gate: **one SKIP**, zero browser tests executed.
- Explicit opt-in: **FAILED during HTTPS setup**:
  `Error: listen EPERM: operation not permitted 127.0.0.1`, syscall `listen`,
  errno `-1`. All browser ceremonies/cases **NOT EXECUTED**.
- Playwright 1.61.1 installed; expected Chromium 149.0.7827.55/revision 1228.
  `/home/agent/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome` absent.
  No download attempted after the listener restriction was established.
  Actual Chromium and virtual-authenticator execution did **not** occur in Cloud.
  All three user-reported Windows runs did execute Chromium and failed enrollment;
  the second and third exited normally. The exact-marker fix has not yet run in Chromium.
- Targeted ESLint, Node syntax and Prettier: PASS.
- Repository lint: zero errors, four warnings in unchanged app files.
- Build FAILED in Turbopack CSS processing: creating new process / binding to
  a port / `Operation not permitted (os error 1)`. Successful build NOT VERIFIED.

The fixed harness exited promptly on Cloud HTTPS setup failure (about 0.33 seconds);
this does not exercise live browser connection cleanup. The marker regressions intentionally fail with the `edcab2c` verifier because it
rejects the known member; all final offline regressions passed.

Windows commands were NOT EXECUTED here. No offline pass or default skip establishes
browser interoperability. Hardware/other browsers, genuine independent identity,
production IAM and protected origin display remain unverified.

**Merge recommendation: NO-GO pending actual local Chromium execution and review.**
Leave draft; run the commands above and record Chromium version and full TAP output
before reconsidering merge of this test-only PR. Production owner withdrawal
remains DISABLED / NO-GO regardless of browser results. No merge, deployment,
production database operation or authorization activation is performed.
