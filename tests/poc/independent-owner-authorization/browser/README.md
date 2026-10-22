# B4.2-B2.13 — disabled browser interoperability probe

**Production owner withdrawal remains DISABLED / NO-GO. Do not merge or deploy.**
Only synthetic identities, disposable keys, a temporary SQLite store and a loopback
HTTPS origin are used. No application API, UI, migrations, Supabase, Validation
promotion or Knowledge Evolution changes. This test infrastructure improves
knowledge of evidence-provenance security and protects the Data Moat by making
an existing interoperability limitation reviewable.

Base: GitHub main `a5b9813fa486fd86c36dca17c1084ab86b0759dd`, merged PR #229.
Uses the existing installed `@playwright/test` (1.61.1), Chromium revision 1228
(Chromium 149.0.7827.55 expected by the manifest), and CDP WebAuthn CTAP2/internal with resident credentials,
UP simulation and UV. Actual Chromium version is printed only when launched;
CDP's virtual authenticator has no independently versioned package. No browser or
virtual authenticator ran in Codex Cloud. No browser compatibility claim is made.

## Known blocker — positive enrollment is intentionally red

B2.12 derives its create challenge from a canonical transition that already
contains the new credential ID and SPKI public key. Standard `create()` generates
those values _after_ the challenge has been supplied. A native browser ceremony
cannot generally satisfy that circular contract. This probe creates a credential
with a fresh disposable challenge, obtains its public key, builds the exact
simulated-custodian-approved transition, then sends the unchanged response to the
existing boundary. The positive test fails explicitly at the challenge equality;
a separate test calls `register` and requires rejection and unchanged history.
It never rewrites client JSON, CBOR, COSE, authenticator data or signatures to
manufacture acceptance. Other restrictions (exact CBOR encoding, client JSON
fields and AAGUID) can independently reject browser output and remain unchanged.

Two disposable Ed25519 custodian signatures are **simulated enrollment approval**,
not independent identity verification or organizational separation. Browser
control never grants independent owner authorization. No administrative credential
is used as owner possession. Test clocks, keys and verifier context are privileged
fixtures. Authentication adapter tests use an explicitly simulated mapping derived
from the browser public key, not a successfully enrolled durable credential.
Success can return only `productionAuthorization: disabled`.

Cases cover browser get signatures, challenge, exact origin, RP hash, owner,
unknown/revoked credential and epoch; signature tampering and an actual get with
UV disabled must reject. Each mapping negative also checks the untouched assertion
against the original context. These are adapter-only checks. The durable positive
and replay case is explicitly skipped until enrollment works. Browser end-to-end
revocation, immutable enrolled history, stale-epoch transitions and replay across
restart remain unverified; existing offline regressions do not substitute for them.
A failure of the adapter positive case also blocks any claim that its negative
cases establish interoperability.

## Exact Windows PowerShell execution

Use PowerShell 7 with .NET 8+ and Node.js 24. Run from the repository root. These
commands create an untrusted one-day localhost certificate outside the repository;
only the disposable Playwright context ignores its TLS trust error. No machine
trust store, application environment or production setting is changed.

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npx playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Chromium install failed' }
npx playwright --version
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
if ($testExit -ne 0) { throw "Interop probe failed (exit $testExit); inspect TAP; expected registration blocker is NOT a PASS" }
```

The harness is skipped by default, before it reads certificate files or binds a
listener. Explicit execution failures are errors, never automatic fallback to
mocked responses. TLS certificate paths above must contain disposable material.
The page serves static HTML only; ceremonies run through Playwright evaluation
and verification happens in Node. There is no browser-facing verification API.

## Execution evidence

Codex Cloud preflight: Node 24.19.0; loopback HTTPS listen denied `EPERM`;
Playwright 1.61.1 installed; Chromium headless-shell revision 1228 absent.
The opt-in harness actually attempted TLS setup and failed with `listen EPERM`;
all browser ceremonies/cases **NOT EXECUTED**. Default-gate skip is not interoperability PASS.
No browser download attempted after the listener restriction was established.

Validation actually executed: existing focused security tests **204/204 PASS**;
relevant promotion/integrity/reader regressions **105/105 PASS**. Targeted ESLint,
Node syntax, Prettier and strict TypeScript (ESNext/bundler for existing codec,
adapter and their tests) passed. Repository lint: zero errors, four warnings in
unchanged app files. Full-project TypeScript: **175 pre-existing diagnostics**,
byte-for-byte identical to a separate verified-main archive with the same generated
Next types. New sources are test-only MJS; no production TypeScript changed.
Build failed in Turbopack CSS processing when binding a port (`EPERM`); no successful
build claimed. Default gate: one skipped test, zero executed browser tests. No
actual browser security property was verified. Existing offline regression passes
verify their synthetic boundaries only. Windows commands remain NOT EXECUTED here.

Smallest next PR: specify and review a two-stage enrollment transcript that binds
an independently issued pre-creation nonce to the generated key/ID and subsequent
possession approval. Keep verification fail-closed; do not loosen this parser in
this PR. Then implement that test-only protocol with focused regression tests,
before rerunning this browser matrix. Production authorization remains NO-GO.
